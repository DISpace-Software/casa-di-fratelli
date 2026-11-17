"""Prepare one unapproved optics comparison; no rendering, baking or geometry edits.

Blender 4.5.9 Cycles source, intern/cycles/kernel/svm/closure.h:
  339-340: Principled transmission tint is sqrt(Base Color) per surface crossing.
  1066-1070: Volume Absorption coefficient is (1 - Color) * Density.

The candidate moves color attenuation from the interface into optical depth.
Density 140 is an artistic comparison, not a measured coffee coefficient.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def json_hash(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def value(value):
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    try:
        return list(value)
    except TypeError:
        return repr(value)


def scene_guard(scene):
    """Compare mesh data, bindings, sampled motion, camera, lighting and shaders."""
    objects = {}
    for obj in bpy.data.objects:
        record = {
            'type': obj.type,
            'parent': obj.parent.name if obj.parent else None,
            'materials': [slot.material.name if slot.material else None
                          for slot in obj.material_slots],
            'hide_render': obj.hide_render,
            'modifiers': [(mod.name, mod.type) for mod in obj.modifiers],
        }
        if obj.type == 'MESH':
            record['mesh'] = json_hash({
                'vertices': [list(vertex.co) for vertex in obj.data.vertices],
                'faces': [list(poly.vertices) for poly in obj.data.polygons],
                'smooth': [poly.use_smooth for poly in obj.data.polygons],
                'uv': [[list(item.uv) for item in layer.data]
                       for layer in obj.data.uv_layers],
            })
        if obj.type == 'CAMERA':
            record['camera'] = [obj.data.lens, obj.data.sensor_width,
                                obj.data.dof.use_dof, obj.data.dof.aperture_fstop]
        if obj.type == 'LIGHT':
            record['light'] = [obj.data.type, obj.data.energy, list(obj.data.color)]
        objects[obj.name] = record
    original_frame, original_subframe = scene.frame_current, scene.frame_subframe
    poses = {}
    for frame in (1, 21, 35, 55, 80, 105, 120):
        scene.frame_set(frame)
        poses[frame] = {obj.name: [list(row) for row in obj.matrix_world]
                        for obj in bpy.data.objects}
    scene.frame_set(original_frame, subframe=original_subframe)
    return json_hash({'objects': objects, 'poses': poses})


def shader_state():
    result = {}
    for material in bpy.data.materials:
        if not material.use_nodes:
            continue
        tree = material.node_tree
        result[material.name] = {
            'inputs': {f'{node.name}/{socket.name}': value(socket.default_value)
                       for node in tree.nodes for socket in node.inputs
                       if hasattr(socket, 'default_value')},
            'links': sorted((link.from_node.name, link.from_socket.name,
                             link.to_node.name, link.to_socket.name)
                            for link in tree.links),
        }
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    source, target = Path(args.input).resolve(), Path(args.output).resolve()
    if source == target or target.exists():
        raise ValueError('The comparison must be a new file, distinct from the source')
    original_sha = sha256(source)
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene = bpy.context.scene
    before_geometry = scene_guard(scene)
    before_shaders = shader_state()
    material = bpy.data.materials['CoffeeMaterial']
    principled = [node for node in material.node_tree.nodes
                  if node.bl_idname == 'ShaderNodeBsdfPrincipled']
    absorption = [node for node in material.node_tree.nodes
                  if node.bl_idname == 'ShaderNodeVolumeAbsorption']
    if len(principled) != 1 or len(absorption) != 1:
        raise ValueError('Expected exactly one Principled and one Absorption node')
    surface, volume = principled[0], absorption[0]
    edits = [(surface, 'Base Color', (.98, .98, .98, 1)),
             (surface, 'Transmission Weight', 1.0),
             (surface, 'Roughness', .04), (volume, 'Density', 140.0)]
    for node, socket_name, setting in edits:
        if node.inputs[socket_name].is_linked:
            raise ValueError(f'Cannot safely replace linked {socket_name}')
        node.inputs[socket_name].default_value = setting
    after_geometry = scene_guard(scene)
    if before_geometry != after_geometry:
        raise AssertionError('Geometry, bindings, camera, lights or sampled motion changed')
    after_shaders = shader_state()
    changes = {}
    for node, socket_name, _ in edits:
        key = f'{node.name}/{socket_name}'
        changes[key] = {'before': before_shaders['CoffeeMaterial']['inputs'][key],
                        'after': after_shaders['CoffeeMaterial']['inputs'][key]}
        before_shaders['CoffeeMaterial']['inputs'][key] = changes[key]['after']
    if before_shaders != after_shaders:
        raise AssertionError('Unexpected shader changes beyond the four candidate sockets')
    bpy.ops.wm.save_as_mainfile(filepath=str(target), check_existing=False)
    if sha256(source) != original_sha:
        raise AssertionError('The original blend changed')
    sigma = [(1 - channel) * 140 for channel in volume.inputs['Color'].default_value[:3]]
    report = {
        'status': 'unapproved-optics-comparison-awaiting-render',
        'source': str(source), 'sourceSha256': original_sha,
        'output': str(target), 'outputSha256': sha256(target),
        'helperSha256': sha256(Path(__file__).resolve()),
        'blender': bpy.app.version_string,
        'changedSockets': changes,
        'unchanged': ['geometry', 'sampled motion', 'camera', 'lighting',
                      'material bindings', 'other shader inputs and links',
                      'IOR', 'normal bump', 'absorption color', 'source blend'],
        'geometryMotionGuardSha256': before_geometry,
        'sigmaAbsorptionPerMetre': sigma,
        'volumeOnlyTransmittanceIgnoringInterfaces': {
            f'{thickness}m': [math.exp(-coefficient * thickness) for coefficient in sigma]
            for thickness in (.001, .003, .01, .04)},
        'notes': ['Density is an artistic test, not a measured coffee coefficient.',
                  'No render or bake was performed; no cache was loaded or modified.',
                  'Black backgrounds can still make transmissive drops appear dark.'],
        'sources': [
            'https://docs.blender.org/manual/en/4.5/render/shader_nodes/shader/principled.html',
            'https://docs.blender.org/manual/en/4.5/render/shader_nodes/shader/volume_absorption.html',
            'https://github.com/blender/blender/blob/v4.5.9/intern/cycles/kernel/svm/closure.h#L339-L340',
            'https://github.com/blender/blender/blob/v4.5.9/intern/cycles/kernel/svm/closure.h#L1066-L1070'],
    }
    target.with_suffix('.json').write_text(json.dumps(report, indent=2) + '\n')
    print('COFEIN_OPTICS_COMPARISON_READY', json.dumps(report), flush=True)


if __name__ == '__main__':
    main()
