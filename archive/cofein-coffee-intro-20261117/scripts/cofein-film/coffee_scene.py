"""Offline Cycles product scene; run inside Blender 4.5, never in the website.

The first still is a material/geometry reference. Moving liquid is deliberately
left to coffee_liquid_bake.py (Mantaflow), rather than animating a rigid disk.
All geometry uses metres; the original restaurant logo is an RGBA decal.
"""
import argparse
import json
import math
import os
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

INTERIOR = [[.0165, .011], [.026, .0175], [.0345, .035],
            [.040, .050], [.045, .0675], [.047, .074]]
FILL_Z = .0685


def args_from_cli():
    parser = argparse.ArgumentParser()
    base = Path(__file__).resolve().parent.parent
    parser.add_argument('--output-dir', default=str(base / 'render'))
    parser.add_argument('--logo', default=str(base / 'logo-decal.png'))
    parser.add_argument('--width', type=int, default=1024)
    parser.add_argument('--height', type=int, default=768)
    parser.add_argument('--samples', type=int, default=64)
    parser.add_argument('--frames', default='1')
    parser.add_argument('--no-render', action='store_true')
    parser.add_argument('--transparent', action='store_true')
    parser.add_argument('--motion-framing', action='store_true',
                        help='One fixed 52mm camera containing the complete pour trajectory')
    parser.add_argument('--light-scale', type=float, default=1.0)
    parser.add_argument('--save-blend', default='')
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    return parser.parse_args(argv)


def set_socket(node, name, value):
    if name in node.inputs:
        node.inputs[name].default_value = value


def principled(name, color, roughness):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    node = material.node_tree.nodes.get('Principled BSDF')
    set_socket(node, 'Base Color', (*color, 1))
    set_socket(node, 'Roughness', roughness)
    return material, node


def mesh_object(name, vertices, faces, material=None, uv=None):
    mesh = bpy.data.meshes.new(name + 'Mesh')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    if uv:
        layer = mesh.uv_layers.new(name='UVMap')
        for polygon in mesh.polygons:
            for loop_index in polygon.loop_indices:
                layer.data[loop_index].uv = uv[mesh.loops[loop_index].vertex_index]
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if material:
        mesh.materials.append(material)
    return obj


def lathe(name, profile, material, segments=192):
    vertices, rings, faces = [], [], []
    for radius, z in profile:
        if radius < 1e-9:
            rings.append([len(vertices)])
            vertices.append((0, 0, z))
        else:
            ring = []
            for index in range(segments):
                angle = index * math.tau / segments
                ring.append(len(vertices))
                vertices.append((radius * math.cos(angle), radius * math.sin(angle), z))
            rings.append(ring)
    for previous, following in zip(rings, rings[1:]):
        for index in range(segments):
            next_index = (index + 1) % segments
            if len(previous) == 1:
                faces.append((previous[0], following[index], following[next_index]))
            elif len(following) == 1:
                faces.append((previous[index], following[0], previous[next_index]))
            else:
                faces.append((previous[index], following[index], following[next_index], previous[next_index]))
    return mesh_object(name, vertices, faces, material)


def catmull(points, steps=12):
    result = []
    for index in range(len(points) - 1):
        p0 = points[max(0, index - 1)]
        p1 = points[index]
        p2 = points[index + 1]
        p3 = points[min(len(points) - 1, index + 2)]
        for step in range(steps):
            t = step / steps
            result.append(tuple(.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t
                + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t
                + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t * t * t)
                for k in range(2)))
    return result + [tuple(points[-1])]


def radius_at(profile, z):
    for a, b in zip(profile, profile[1:]):
        if a[1] <= z <= b[1]:
            t = (z - a[1]) / max(1e-12, b[1] - a[1])
            return a[0] + (b[0] - a[0]) * t
    return profile[-1][0]


def build_materials():
    ceramic, porcelain = principled('Glazed warm porcelain', (.66, .565, .405), .14)
    set_socket(porcelain, 'IOR', 1.48)
    set_socket(porcelain, 'Coat Weight', .50)
    set_socket(porcelain, 'Coat Roughness', .075)
    set_socket(porcelain, 'Subsurface Weight', .012)
    set_socket(porcelain, 'Subsurface Scale', .001)
    set_socket(porcelain, 'Subsurface Radius', (1, .6, .3))
    nodes, links = ceramic.node_tree.nodes, ceramic.node_tree.links
    texture = nodes.new('ShaderNodeTexNoise')
    texture.inputs['Scale'].default_value = 2200
    texture.inputs['Detail'].default_value = 2
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = .08
    bump.inputs['Distance'].default_value = .000002
    links.new(texture.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], porcelain.inputs['Normal'])

    coffee, liquid = principled('CoffeeMaterial', (.15, .045, .011), .075)
    set_socket(liquid, 'IOR', 1.333)
    set_socket(liquid, 'Transmission Weight', .93)
    set_socket(liquid, 'Coat Weight', 0)
    # Tiny capillary variation only: the large moving surface comes from the
    # Mantaflow mesh. World-position coordinates keep this in real millimetres
    # when the same material is transferred from the cup to the fluid domain.
    liquid_nodes, liquid_links = coffee.node_tree.nodes, coffee.node_tree.links
    position = liquid_nodes.new('ShaderNodeNewGeometry')
    ripple = liquid_nodes.new('ShaderNodeTexNoise')
    ripple.noise_dimensions = '4D'
    ripple.inputs['Scale'].default_value = 180
    ripple.inputs['Detail'].default_value = 2
    ripple.inputs['Roughness'].default_value = .40
    ripple.inputs['W'].default_value = 0
    ripple.inputs['W'].keyframe_insert('default_value', frame=1)
    ripple.inputs['W'].default_value = 1.7
    ripple.inputs['W'].keyframe_insert('default_value', frame=120)
    capillary = liquid_nodes.new('ShaderNodeBump')
    capillary.inputs['Strength'].default_value = .25
    capillary.inputs['Distance'].default_value = .00006
    liquid_links.new(position.outputs['Position'], ripple.inputs['Vector'])
    liquid_links.new(ripple.outputs['Fac'], capillary.inputs['Height'])
    liquid_links.new(capillary.outputs['Normal'], liquid.inputs['Normal'])
    absorption = coffee.node_tree.nodes.new('ShaderNodeVolumeAbsorption')
    absorption.inputs['Color'].default_value = (.46, .15, .035, 1)
    absorption.inputs['Density'].default_value = 42
    coffee.node_tree.links.new(absorption.outputs['Volume'],
        coffee.node_tree.nodes.get('Material Output').inputs['Volume'])

    crema, foam = principled('Coffee crema', (.26, .085, .016), .27)
    set_socket(foam, 'IOR', 1.35)
    set_socket(foam, 'Coat Weight', .05)
    nodes, links = crema.node_tree.nodes, crema.node_tree.links
    voronoi = nodes.new('ShaderNodeTexVoronoi')
    # Generated coordinates span this nine-centimetre ring: 90 cells gives
    # submillimetre pores, rather than noise too small to survive photography.
    voronoi.inputs['Scale'].default_value = 90
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = .10
    ramp.color_ramp.elements[0].color = (.025, .006, .001, 1)
    ramp.color_ramp.elements[1].position = .36
    ramp.color_ramp.elements[1].color = (.24, .082, .014, 1)
    links.new(voronoi.outputs['Distance'], ramp.inputs['Fac'])
    links.new(ramp.outputs['Color'], foam.inputs['Base Color'])
    patches = nodes.new('ShaderNodeTexNoise')
    patches.inputs['Scale'].default_value = 11
    patches.inputs['Detail'].default_value = 3
    patch_ramp = nodes.new('ShaderNodeValToRGB')
    patch_ramp.color_ramp.elements[0].position = .34
    patch_ramp.color_ramp.elements[1].position = .58
    links.new(patches.outputs['Fac'], patch_ramp.inputs['Fac'])
    transparent = nodes.new('ShaderNodeBsdfTransparent')
    mix = nodes.new('ShaderNodeMixShader')
    links.new(patch_ramp.outputs['Color'], mix.inputs[0])
    links.new(transparent.outputs[0], mix.inputs[1])
    links.new(foam.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], nodes.get('Material Output').inputs['Surface'])
    return ceramic, coffee, crema


def make_empty(name):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    return obj


def animate_rigs(cup, saucer):
    poses = [(1, (0, 0, .005), 0), (20, (0, 0, .005), 0),
             (35, (-.003, 0, .022), -6), (55, (-.010, 0, .042), -25),
             (80, (-.018, 0, .062), -58), (105, (-.022, 0, .078), -78),
             (120, (-.025, 0, .090), -86)]
    for frame, location, angle in poses:
        cup.location = location
        cup.rotation_euler = (0, math.radians(angle), 0)
        cup.keyframe_insert(data_path='location', frame=frame)
        cup.keyframe_insert(data_path='rotation_euler', frame=frame)
    for frame, x, angle in [(1, 0, 0), (20, 0, 0), (35, .004, -.8),
                             (55, .012, 1.4), (75, .012, -1.1),
                             (100, .012, .4), (120, .012, 0)]:
        tilt = math.radians(angle)
        saucer.location = (x, 0, abs(math.sin(tilt)) * .0885)
        saucer.rotation_euler = (0, tilt, 0)
        saucer.keyframe_insert(data_path='location', frame=frame)
        saucer.keyframe_insert(data_path='rotation_euler', frame=frame)
    # Automatic handles stop motion smoothly at the held initial pose.
    for rig in (cup, saucer):
        if rig.animation_data and rig.animation_data.action:
            for fcurve in rig.animation_data.action.fcurves:
                for point in fcurve.keyframe_points:
                    point.interpolation = 'BEZIER'
                    point.handle_left_type = 'AUTO_CLAMPED'
                    point.handle_right_type = 'AUTO_CLAMPED'


def make_logo(cup_rig, outer, path):
    if not Path(path).is_file():
        raise FileNotFoundError('Exact original logo texture missing: ' + path)
    image = bpy.data.images.load(path, check_existing=True)
    image.pack()
    ink, shader = principled('Original Cofein fired ceramic ink', (.0015, .0005, .0002), .26)
    set_socket(shader, 'Specular IOR Level', .15)
    set_socket(shader, 'Coat Weight', .1)
    set_socket(shader, 'Coat Roughness', .20)
    nodes, links = ink.node_tree.nodes, ink.node_tree.links
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = image
    tex.interpolation = 'Linear'
    transparent = nodes.new('ShaderNodeBsdfTransparent')
    mix = nodes.new('ShaderNodeMixShader')
    links.new(tex.outputs['Alpha'], mix.inputs[0])
    links.new(transparent.outputs[0], mix.inputs[1])
    links.new(shader.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], nodes.get('Material Output').inputs['Surface'])
    vertices, uv, faces = [], [], []
    columns, rows = 96, 12
    for row in range(rows + 1):
        z = .030 + row / rows * .0172
        radius = radius_at(outer, z) + .000055
        for column in range(columns + 1):
            angle = .08 + (column / columns - .5) * 1.68
            vertices.append((math.sin(angle) * radius, -math.cos(angle) * radius, z))
            uv.append((column / columns, row / rows))
            if row < rows and column < columns:
                a = row * (columns + 1) + column
                faces.append((a, a + 1, a + columns + 2, a + columns + 1))
    obj = mesh_object('OriginalCofeinLogo', vertices, faces, ink, uv)
    obj.parent = cup_rig
    obj['source'] = str(Path(path).resolve())
    obj['lettering'] = 'Original menu outlines, no generated or substituted type'
    return obj


def build_vessels(ceramic, coffee, crema, logo_path):
    cup_rig = make_empty('CupRig')
    saucer_rig = make_empty('SaucerRig')
    outer = catmull([(.0215, .0025), (.0270, .008), (.0340, .018),
                     (.0390, .034), (.0445, .051), (.0490, .068), (.0505, .074)])
    rim = [(.04875 + .00175 * math.cos(i * math.pi / 24),
             .074 + .00175 * math.sin(i * math.pi / 24)) for i in range(1, 25)]
    cup_profile = [(0, .0018), (.014, .0018), (.0155, .0017), (.016, .0003),
                   (.0175, 0), (.020, 0), (.0205, .001), *outer, *rim,
                   *reversed(INTERIOR[:-1]), (0, .011)]
    cup = lathe('CupBody', cup_profile, ceramic)
    cup.parent = cup_rig
    cup['liquid_interior_profile'] = json.dumps(INTERIOR)
    cup['liquid_fill_z'] = FILL_Z
    cup['units'] = 'metres'

    curve = bpy.data.curves.new('PorcelainHandleCurve', 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 24
    curve.bevel_depth = .0042
    curve.bevel_resolution = 6
    curve.use_fill_caps = True
    spline = curve.splines.new('BEZIER')
    handle_points = [(.0465, 0, .063), (.055, 0, .067), (.069, 0, .068),
                     (.079, 0, .060), (.080, 0, .049), (.074, 0, .037),
                     (.061, 0, .027), (.0345, 0, .022)]
    spline.bezier_points.add(len(handle_points) - 1)
    for point, coordinate in zip(spline.bezier_points, handle_points):
        point.co = coordinate
        point.handle_left_type = 'AUTO'
        point.handle_right_type = 'AUTO'
    # The smaller roots penetrate only the ceramic wall, while the visible
    # handle grows smoothly to its full rounded section outside the bowl.
    spline.bezier_points[0].radius = .55
    spline.bezier_points[-1].radius = .65
    handle = bpy.data.objects.new('CupHandle', curve)
    bpy.context.collection.objects.link(handle)
    handle.parent = cup_rig
    curve.materials.append(ceramic)
    make_logo(cup_rig, outer, logo_path)

    upper_plate = catmull([(.030, .0055), (.045, .0069), (.061, .0095),
                           (.074, .0135), (.081, .016), (.0855, .017)])
    # Six-millimetre rounded edge: unlike a thin disc its top and underside
    # produce different highlights and a real contact shadow.
    plate_rim = [(.0855 + .003 * math.cos(-math.pi / 2 + i * math.pi / 24),
                  .014 + .003 * math.sin(-math.pi / 2 + i * math.pi / 24))
                 for i in range(25)]
    plate_profile = [(0, .0012), (.024, .0012), (.026, 0), (.031, 0),
                     (.0325, .0017), (.050, .0038), (.067, .0072),
                     (.080, .0090), *plate_rim, *list(reversed(upper_plate))[1:],
                     (.028, .0053), (.0265, .00475), (.0245, .005),
                     (.020, .005), (.012, .005), (0, .005)]
    plate = lathe('Saucer', plate_profile, ceramic)
    plate.parent = saucer_rig
    plate['liquid_collision_profile'] = json.dumps(plate_profile)
    plate['well_z'] = .005
    plate['flat_contact_radius'] = .0245

    # Closed, finite liquid volume for the reference still and initial state.
    # Mantaflow replaces this preview source before a moving-liquid render.
    liquid_profile = [(0, .0113)]
    liquid_profile += [(max(.001, radius - .00035), z + .0003)
                       for radius, z in INTERIOR if z < FILL_Z]
    fill_radius = radius_at(INTERIOR, FILL_Z) - .00035
    liquid_profile += [(fill_radius, FILL_Z), (0, FILL_Z)]
    liquid = lathe('CoffeeSource', liquid_profile, coffee)
    # Smooth side-wall normals must never bend the flat liquid surface toward
    # the volume walls. That shading error makes a full cup look empty.
    for polygon in liquid.data.polygons:
        if all(abs(liquid.data.vertices[index].co.z - FILL_Z) < 1e-7
               for index in polygon.vertices):
            polygon.use_smooth = False
    liquid.parent = cup_rig
    liquid['preview_liquid_only'] = True
    liquid['finite_volume_source'] = True

    # A thin, irregular crema perimeter gives the first material reference its
    # espresso scale. It is explicitly hidden by the moving-liquid bake setup.
    vertices, faces = [], []
    count = 256
    for ring in range(2):
        for index in range(count):
            angle = index * math.tau / count
            edge = .00065 * math.sin(angle * 11) + .00030 * math.cos(angle * 19)
            radius = fill_radius - (.00012 if ring else .0016 + edge)
            vertices.append((radius * math.cos(angle), radius * math.sin(angle), FILL_Z + .00008))
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, count + following, count + index))
    foam = mesh_object('StaticCremaReference', vertices, faces, crema)
    foam.parent = cup_rig
    foam['preview_liquid_only'] = True
    animate_rigs(cup_rig, saucer_rig)
    return cup_rig, saucer_rig


def aim(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def area(name, location, target, watts, size, color, scale):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = watts * scale
    data.color = color
    data.shape = 'RECTANGLE'
    data.size = size[0]
    data.size_y = size[1]
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    aim(obj, target)
    return obj


def build_stage(scene, args):
    world = bpy.data.worlds.new('Black photographic studio')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.008, .010, .014, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = .035
    scene.world = world
    floor, shader = principled('Near-black studio tabletop', (.0015, .0015, .0017), .58)
    set_socket(shader, 'Specular IOR Level', .10)
    bpy.ops.mesh.primitive_plane_add(size=2, location=(0, 0, 0))
    ground = bpy.context.object
    ground.name = 'StudioFloor'
    ground.data.materials.append(floor)
    ground['floor_world_z'] = 0.0
    if args.transparent:
        ground.is_shadow_catcher = True
    target = (0, 0, .038)
    area('Large soft key', (-.20, -.13, .20), target, 3.6, (.075, .22), (1, .91, .78), args.light_scale)
    area('Warm gentle fill', (.19, -.07, .18), target, .15, (.14, .20), (1, .88, .72), args.light_scale)
    area('Cool edge strip', (-.16, .13, .22), target, .8, (.025, .17), (.58, .72, 1), args.light_scale)
    area('Glaze rear kicker', (.16, .11, .19), target, 1.4, (.035, .17), (1, .92, .81), args.light_scale)
    # Mirror the camera direction in the horizontal coffee plane. The source
    # is broad enough to reflect as a photographic softbox, not a white line.
    reflection = area('Coffee softbox reflection', (-.065, .25, .18), (0, 0, .0735),
         .045, (.055, .055), (1, .91, .78), args.light_scale)
    reflection.data.shape = 'DISK'
    camera_data = bpy.data.cameras.new('ProductCamera')
    camera = bpy.data.objects.new('ProductCamera', camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (.045, -.43, .23)
    aim(camera, (-.010, 0, .075) if args.motion_framing else (0, 0, .035))
    camera_data.lens = 52 if args.motion_framing else 70
    camera_data.sensor_width = 36
    camera_data.clip_start = .005
    camera_data.clip_end = 10
    focus = make_empty('CameraFocus')
    focus.location = (0, -.012, .043)
    camera_data.dof.use_dof = True
    camera_data.dof.focus_object = focus
    camera_data.dof.aperture_fstop = 11
    camera_data.dof.aperture_blades = 9
    scene.camera = camera


def main():
    args = args_from_cli()
    output = Path(args.output_dir).resolve()
    output.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = args.samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = .025
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 12
    scene.cycles.diffuse_bounces = 4
    scene.cycles.glossy_bounces = 6
    scene.cycles.transmission_bounces = 12
    scene.cycles.transparent_max_bounces = 8
    scene.cycles.caustics_reflective = False
    scene.cycles.caustics_refractive = False
    scene.render.resolution_x = args.width
    scene.render.resolution_y = args.height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'
    scene.render.film_transparent = args.transparent
    scene.render.fps = 24
    scene.frame_start, scene.frame_end = 1, 120
    scene.gravity = (0, 0, -9.81)
    scene.view_settings.view_transform = 'AgX'
    try:
        scene.view_settings.look = 'AgX - Medium High Contrast'
    except TypeError:
        pass
    scene.view_settings.exposure = -.35
    materials = build_materials()
    build_vessels(*materials, args.logo)
    build_stage(scene, args)
    scene.frame_set(1)
    scene['coffee_scene_contract'] = json.dumps({
        'units': 'metres', 'fps': 24, 'frames': [1, 120], 'cup_rig': 'CupRig',
        'cup_body': 'CupBody', 'saucer': 'Saucer', 'source': 'CoffeeSource',
        'floor_world_z': 0, 'interior_profile': INTERIOR, 'fill_z': FILL_Z,
        'spill_direction': '-X', 'liquid_material': 'CoffeeMaterial',
        'status': 'Still-reference material; moving liquid requires Mantaflow bake',
    })
    blend_path = Path(args.save_blend).resolve() if args.save_blend else output / 'coffee-scene.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    print('COFEIN_SCENE_READY', str(blend_path), flush=True)
    if not args.no_render:
        for frame in [int(value) for value in args.frames.split(',') if value.strip()]:
            scene.frame_set(frame)
            if frame > 20:
                print('NOTE: moving-liquid preview is not a fluid simulation; bake Mantaflow before delivery.', flush=True)
            scene.render.filepath = str(output / f'coffee-reference-{frame:04d}.png')
            bpy.ops.render.render(write_still=True)
            print('COFEIN_FRAME_READY', scene.render.filepath, flush=True)


if __name__ == '__main__':
    main()
