"""Local Mantaflow liquid setup and bake for the Cofein product-shot scene.

Run with Blender, never with the website runtime. Geometry is supplied by
coffee_scene.py. CupBody must expose ``liquid_interior_profile`` (JSON [[r,z]])
and ``liquid_fill_z`` in its own local, metre-scale coordinates. The initial
liquid is a finite GEOMETRY flow; it is not continuously replenished.

Example:
  blender -b --threads 6 --python coffee_liquid_bake.py -- \
    --input coffee-scene.blend --output coffee-fluid48.blend \
    --cache cache48 --resolution 48 --frames 120 --bake

Preview resolution is deliberately modest. It validates containment, motion
and timing, not sub-millimetre droplets. The final mesh is genuinely simulated;
no decorative spheres, scripted streams, or manually tilted surface are used.
"""

import argparse
import json
import math
from pathlib import Path
import sys
import time

import bpy
import bmesh
from mathutils import Matrix, Vector


PREFIX = "CoffeePhysics"


def _set(target, name, value, required=False):
    """Set supported RNA fields and report optional version differences."""
    if hasattr(target, name):
        # Some Blender 4.5 fluid particle update callbacks create/remove a
        # particle system on every assignment, even assigning the current
        # boolean value. Skip no-op writes rather than toggling it by accident.
        if getattr(target, name) != value:
            setattr(target, name, value)
        return True
    if required:
        raise RuntimeError(f"Required Blender field is unavailable: {name}")
    print(f"COFFEE_NOTE unsupported optional field {name}", flush=True)
    return False


def _active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def _lathe(name, profile, segments=64):
    """Closed revolution solid; single vertices on the axis avoid degenerate caps."""
    vertices, rings, faces = [], [], []
    for radius, z in profile:
        if abs(radius) < 1e-8:
            rings.append([len(vertices)])
            vertices.append((0, 0, z))
        else:
            ring = []
            for j in range(segments):
                angle = j * math.tau / segments
                ring.append(len(vertices))
                vertices.append((radius * math.cos(angle), radius * math.sin(angle), z))
            rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1 and len(b) == 1:
            continue
        for j in range(segments):
            nj = (j + 1) % segments
            if len(a) == 1:
                faces.append((a[0], b[nj], b[j]))
            elif len(b) == 1:
                faces.append((a[j], a[nj], b[0]))
            else:
                faces.append((a[j], a[nj], b[nj], b[j]))
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def _cube(name, low, high):
    center = (Vector(low) + Vector(high)) / 2
    dimensions = Vector(high) - Vector(low)
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def _effector(obj, surface_distance=0.0, subframes=2):
    modifier = obj.modifiers.new("MantaflowCollision", "FLUID")
    modifier.fluid_type = "EFFECTOR"
    bpy.context.view_layer.update()
    settings = modifier.effector_settings
    settings.effector_type = "COLLISION"
    settings.use_effector = True
    settings.surface_distance = surface_distance
    settings.subframes = subframes
    settings.use_plane_init = False
    obj.hide_render = True
    obj.display_type = "WIRE"
    return settings


def _point_segment_distance(point, start, end):
    dx, dz = end[0] - start[0], end[1] - start[1]
    denominator = dx * dx + dz * dz
    if denominator <= 1e-20:
        return math.hypot(point[0] - start[0], point[1] - start[1])
    t = max(0.0, min(1.0, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dz) / denominator))
    return math.hypot(point[0] - start[0] - t * dx, point[1] - start[1] - t * dz)


def _simplify_profile(profile, tolerance):
    """RDP simplification bounded in the radius/Z cross-section, in metres."""
    if len(profile) <= 2:
        return list(profile)
    distance, index = max((_point_segment_distance(p, profile[0], profile[-1]), i)
                          for i, p in enumerate(profile[1:-1], 1))
    if distance <= tolerance:
        return [profile[0], profile[-1]]
    left = _simplify_profile(profile[:index + 1], tolerance)
    right = _simplify_profile(profile[index:], tolerance)
    return left[:-1] + right


def _saucer_collision_profile(saucer):
    raw = saucer.get("liquid_collision_profile")
    if raw:
        return [(float(r), float(z)) for r, z in (json.loads(raw) if isinstance(raw, str) else raw)], "scene-property"
    # Compatibility with earlier still-reference .blend files. The scene
    # builder emits ordered rings around local Z; recover those exact rings
    # without replacing the top/well contour with an invented approximation.
    profile = []
    for vertex in saucer.data.vertices:
        point = (math.hypot(vertex.co.x, vertex.co.y), float(vertex.co.z))
        if not profile or math.dist(point, profile[-1]) > 1e-7:
            profile.append(point)
    if len(profile) < 5 or len(profile) > 500 or profile[0][0] > 1e-6 or profile[-1][0] > 1e-6:
        raise RuntimeError("Saucer needs its liquid_collision_profile; mesh is not an ordered closed lathe")
    return profile, "exact-mesh-rings"


def _saucer_proxy(scene, saucer):
    """Closed collision solid with <0.25 mm total geometric approximation.

    At 48 sectors a radius of 88.5 mm has <0.190 mm angular chord error.
    Radius/Z simplification receives the remaining error budget, capped at
    0.050 mm. This is far below the preview/final liquid cells, while avoiding
    voxelising the 14k+ face beauty mesh repeatedly at each obstacle subframe.
    """
    if any(abs(v - 1) > 1e-4 for v in saucer.matrix_world.to_scale()):
        raise RuntimeError("Apply Saucer's scale before constructing its collision proxy")
    profile, source = _saucer_collision_profile(saucer)
    segments = 48
    maximum_radius = max(p[0] for p in profile)
    angular_error = maximum_radius * (1 - math.cos(math.pi / segments))
    profile_tolerance = min(.00005, .00025 - angular_error)
    if profile_tolerance <= 0:
        raise RuntimeError("Saucer is too large to meet 0.25 mm error with 48 sectors")
    simplified = _simplify_profile(profile, profile_tolerance)
    collider = _lathe(PREFIX + "SaucerCollider", simplified, segments)
    collider.parent = saucer
    collider.matrix_parent_inverse = Matrix.Identity(4)
    collider.matrix_basis = Matrix.Identity(4)
    _effector(collider, subframes=1)
    return collider, {
        "source": source,
        "original_profile_points": len(profile),
        "proxy_profile_points": len(simplified),
        "angular_segments": segments,
        "max_angular_error_m": angular_error,
        "max_profile_error_m": profile_tolerance,
        "max_total_error_m": angular_error + profile_tolerance,
        "original_faces": len(saucer.data.polygons),
        "proxy_faces": len(collider.data.polygons),
        "effector_subframes": 1,
    }


def _closed_mesh_report(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    result = {
        "vertices": len(bm.verts),
        "faces": len(bm.faces),
        "non_manifold_edges": sum(not e.is_manifold for e in bm.edges),
        "volume_m3": abs(bm.calc_volume(signed=True)),
    }
    bm.free()
    return result


def _swept_bounds(scene, objects, end_frame):
    low = Vector((math.inf,) * 3)
    high = Vector((-math.inf,) * 3)
    # Every frame is cheap here (no fluid modifiers yet) and avoids missing
    # animated extrema at a collision-object pivot.
    for frame in range(1, end_frame + 1):
        scene.frame_set(frame)
        for obj in objects:
            for corner in obj.bound_box:
                point = obj.matrix_world @ Vector(corner)
                for axis in range(3):
                    low[axis] = min(low[axis], point[axis])
                    high[axis] = max(high[axis], point[axis])
    scene.frame_set(1)
    return low, high


def _coffee_material():
    material = bpy.data.materials.get("CoffeeMaterial")
    if material:
        return material
    material = bpy.data.materials.new("CoffeeMaterial")
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (0.035, 0.010, 0.003, 1)
    shader.inputs["Roughness"].default_value = 0.12
    shader.inputs["IOR"].default_value = 1.333
    if "Transmission Weight" in shader.inputs:
        shader.inputs["Transmission Weight"].default_value = 0.72
    absorption = material.node_tree.nodes.new("ShaderNodeVolumeAbsorption")
    absorption.inputs["Color"].default_value = (0.28, 0.075, 0.012, 1)
    absorption.inputs["Density"].default_value = 45
    material.node_tree.links.new(absorption.outputs["Volume"],
                                 material.node_tree.nodes.get("Material Output").inputs["Volume"])
    return material


def configure_liquid(scene, cache_dir, resolution=48, frame_end=120,
                     floor_z=0.0, surface_tension=0.15, mesh_scale=2,
                     timesteps_max=12, spray=False, domain_min=None, domain_max=None,
                     source_inset_cells=1.25, conservative_wall=True,
                     fractional_obstacles=False, delete_in_obstacle=True,
                     mesh_smooth=1, timesteps_min=1, cfl=2.0):
    """Add a finite liquid volume, closed collisions, and a compact liquid domain.

    The domain's longest side has ``resolution`` cells. The hidden cup proxy
    preserves the inner bowl and expands OUTWARD, so low-resolution collision
    thickness cannot shrink the photographed cup's actual interior. The source
    is inset by one cell and rests above the bottom. It stays fixed after frame 1;
    the solver, not parenting, carries the liquid as the ceramic cup tilts.
    """
    if not 1 <= timesteps_min <= timesteps_max:
        raise ValueError("Require 1 <= timesteps_min <= timesteps_max")
    if not 0 < cfl <= 4:
        raise ValueError("CFL must be greater than zero and at most four cells")
    scene.frame_set(1)
    scene.frame_start = 1
    scene.frame_end = frame_end
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.gravity = (0, 0, -9.81)
    cup = bpy.data.objects.get("CupBody")
    saucer = bpy.data.objects.get("Saucer")
    if not cup or not saucer:
        raise RuntimeError("The scene must contain CupBody and Saucer")
    raw_profile = cup.get("liquid_interior_profile")
    if not raw_profile:
        raise RuntimeError("CupBody is missing its local liquid_interior_profile")
    profile = json.loads(raw_profile) if isinstance(raw_profile, str) else list(raw_profile)
    profile = [(float(r), float(z)) for r, z in profile]
    if len(profile) < 3 or any(profile[i + 1][1] < profile[i][1] for i in range(len(profile) - 1)):
        raise RuntimeError("Interior profile must run from the bowl bottom to rim, ordered by z")
    fill_z = float(cup.get("liquid_fill_z", profile[-1][1] - 0.008))
    if not profile[0][1] < fill_z < profile[-1][1]:
        raise RuntimeError("liquid_fill_z must lie between the inner bottom and rim")
    if any(abs(v - 1) > 1e-4 for v in cup.matrix_world.to_scale()):
        raise RuntimeError("Apply CupBody's scale before configuring liquid")

    existing_fluid = [o.name for o in scene.objects if any(m.type == "FLUID" for m in o.modifiers)]
    if existing_fluid:
        raise RuntimeError(f"Refusing to replace an existing fluid setup: {existing_fluid}")
    for obj in scene.objects:
        if obj.get("preview_liquid_only"):
            obj.hide_render = True
            obj.hide_viewport = True
    low, high = _swept_bounds(scene, [cup, saucer], frame_end)
    # Include the immediate impact area without wasting most cells on empty
    # space. At preview resolution this is a containment/first-spill study.
    low.x -= 0.065
    low.y -= 0.04
    low.z = min(floor_z - 0.018, low.z - 0.012)
    high.x += 0.065
    high.y += 0.04
    high.z += 0.025
    if (domain_min is None) != (domain_max is None):
        raise ValueError("Explicit domain_min/domain_max must be supplied together")
    if domain_min is not None:
        low, high = Vector(domain_min), Vector(domain_max)
        if any(high[a] <= low[a] for a in range(3)):
            raise ValueError("Every domain maximum must exceed its minimum")
        if not low.z < floor_z < high.z:
            raise ValueError("Explicit domain must contain the impact floor")
    cell = max(high - low) / resolution
    thickness = max(0.004, cell * 1.7)

    # Exact internal profile, physically thickened outward solely for voxel
    # robustness. Decorative foot/rim/handle are excluded from the collider.
    wall = [(r, z) for r, z in profile if r > 1e-7]
    outer = [(r + thickness, z) for r, z in wall]
    outer[0] = (outer[0][0], profile[0][1] - thickness)
    if conservative_wall:
        # Expanding only radially undershoots the specified normal thickness
        # on the sloping bowl. Expand downward too, preserving every inner
        # point and the rim height; the collision guard stays outside liquid.
        outer = [(r + thickness, z - thickness) for r, z in wall]
        outer.append((wall[-1][0] + thickness, wall[-1][1]))
    bowl_profile = [(0, profile[0][1] - thickness), *outer, *reversed(profile)]
    if profile[0][0] > 1e-7:
        bowl_profile.append((0, profile[0][1]))
    collider = _lathe(PREFIX + "CupCollider", bowl_profile)
    collider.parent = cup
    collider.matrix_parent_inverse = Matrix.Identity(4)
    collider.matrix_basis = Matrix.Identity(4)
    _effector(collider)

    saucer_collider, saucer_proxy_report = _saucer_proxy(scene, saucer)
    floor = _cube(PREFIX + "FloorCollider",
                  (low.x - .02, low.y - .02, floor_z - max(.02, thickness * 2)),
                  (high.x + .02, high.y + .02, floor_z))
    _effector(floor, subframes=0)

    # Geometry flow is emitted only at cache start. Use an inset initial
    # frustum, never parent liquid to the animated cup.
    inset = max(.0008, cell * source_inset_cells)
    bottom = profile[0][1] + inset
    radii_at_z = [(r, z) for r, z in profile if r > 1e-7]

    def radius_at(z):
        for (ra, za), (rb, zb) in zip(radii_at_z, radii_at_z[1:]):
            if za <= z <= zb and zb > za:
                return ra + (rb - ra) * (z - za) / (zb - za)
        return radii_at_z[-1 if z > radii_at_z[-1][1] else 0][0]

    levels = sorted({bottom, fill_z, *(z for _, z in profile if bottom < z < fill_z)})
    source_profile = [(0, bottom), *[(max(.001, radius_at(z) - inset), z) for z in levels], (0, fill_z)]
    previous_source = bpy.data.objects.get("CoffeeSource")
    if previous_source:
        previous_source.hide_render = True
        previous_source.hide_set(True)
        previous_source.name = "CoffeeSourceUnsimulatedReference"
    source = _lathe("CoffeeSource", source_profile)
    source.matrix_world = cup.matrix_world.copy()
    source.hide_render = True
    source.display_type = "WIRE"
    flow_modifier = source.modifiers.new("MantaflowFiniteCoffee", "FLUID")
    flow_modifier.fluid_type = "FLOW"
    bpy.context.view_layer.update()
    flow = flow_modifier.flow_settings
    flow.flow_type = "LIQUID"
    flow.flow_behavior = "GEOMETRY"
    flow.use_plane_init = False
    flow.surface_distance = 0
    flow.use_initial_velocity = False
    _set(flow, "flow_source", "MESH")

    old_domain = bpy.data.objects.get("CoffeeDomain")
    if old_domain:
        bpy.data.objects.remove(old_domain, do_unlink=True)
    domain = _cube("CoffeeDomain", low, high)
    domain.data.materials.clear()
    domain.data.materials.append(_coffee_material())
    for polygon in domain.data.polygons:
        polygon.use_smooth = True
    _active(domain)
    modifier = domain.modifiers.new("MantaflowCoffee", "FLUID")
    modifier.fluid_type = "DOMAIN"
    bpy.context.view_layer.update()
    settings = modifier.domain_settings
    settings.domain_type = "LIQUID"
    settings.resolution_max = resolution
    settings.cache_type = "MODULAR"
    settings.cache_frame_start = 1
    settings.cache_frame_end = frame_end
    settings.cache_directory = str(Path(cache_dir).resolve())
    Path(settings.cache_directory).mkdir(parents=True, exist_ok=True)
    # MODULAR mesh/secondary bakes need the actual interior level-set fields.
    # In Blender 4.5 non-resumable data stores only pp/pVel for liquid, omitting
    # phi/phiTmp/phiParts; rebuilding a mesh from a narrow particle band alone
    # produces a false hollow shell inside the cup.
    _set(settings, "cache_resumable", True)
    _set(settings, "cache_data_format", "UNI")
    _set(settings, "cache_mesh_format", "BOBJECT")
    settings.use_mesh = True
    settings.mesh_scale = mesh_scale
    settings.mesh_generator = "IMPROVED"
    settings.mesh_particle_radius = 1.6
    settings.mesh_smoothen_pos = mesh_smooth
    settings.mesh_smoothen_neg = mesh_smooth
    settings.timesteps_min = timesteps_min
    settings.timesteps_max = timesteps_max
    _set(settings, "use_adaptive_timesteps", True)
    settings.cfl_condition = cfl
    _set(settings, "simulation_method", "FLIP")
    _set(settings, "flip_ratio", 0.88)
    _set(settings, "particle_randomness", 0.06)
    _set(settings, "particle_number", 2)
    _set(settings, "use_fractions", fractional_obstacles)
    _set(settings, "fractions_distance", 0.0)
    _set(settings, "delete_in_obstacle", delete_in_obstacle)
    _set(settings, "use_diffusion", True)
    _set(settings, "surface_tension", surface_tension)
    _set(settings, "viscosity_base", 1.0)
    _set(settings, "viscosity_exponent", 6)
    _set(settings, "use_viscosity", False)
    # Secondary particle systems are intentionally disabled for the first
    # study: detached pieces of the primary liquid mesh must work first.
    for suffix in ["spray", "foam", "bubble", "tracer"]:
        _set(settings, "use_" + suffix + "_particles", False)
    if spray:
        _set(settings, "use_spray_particles", True, required=True)
        _set(settings, "particle_scale", 1)
        _set(settings, "sndparticle_sampling_wavecrest", 24)
        _set(settings, "sndparticle_sampling_trappedair", 4)
        _set(settings, "sndparticle_boundary", "DELETE")
        _set(settings, "cache_particle_format", "UNI")
    actual_secondary = {suffix: bool(getattr(settings, 'use_' + suffix + '_particles'))
                        for suffix in ['spray', 'foam', 'bubble', 'tracer']}
    expected_secondary = {'spray': spray, 'foam': False, 'bubble': False, 'tracer': False}
    if actual_secondary != expected_secondary:
        raise RuntimeError(f'Secondary particle callbacks changed requested flags: {actual_secondary}')
    for side in ["front", "back", "left", "right", "top"]:
        _set(settings, "use_collision_border_" + side, False)
    _set(settings, "use_collision_border_bottom", True)
    scene.frame_set(1)
    bpy.context.view_layer.update()

    report = {
        "blender": bpy.app.version_string,
        "resolution": resolution,
        "frames": frame_end,
        "fps": scene.render.fps / scene.render.fps_base,
        "domain_min": list(low), "domain_max": list(high),
        "cell_size_m": cell,
        "proxy_wall_thickness_m": thickness,
        "fill_z_local_m": fill_z,
        "source_inset_cells": source_inset_cells,
        "conservative_wall": conservative_wall,
        "cache_resumable": bool(settings.cache_resumable),
        "fractional_obstacles": bool(settings.use_fractions),
        "delete_in_obstacle": bool(settings.delete_in_obstacle),
        "mesh_smooth": mesh_smooth,
        "source": _closed_mesh_report(source),
        "cup_collider": _closed_mesh_report(collider),
        "saucer_collider": _closed_mesh_report(saucer_collider),
        "saucer_proxy": saucer_proxy_report,
        "cache_dir": settings.cache_directory,
        "surface_tension_grid_units": surface_tension,
        "timesteps_min": timesteps_min,
        "timesteps_max": timesteps_max,
        "cfl": cfl,
        "spray_enabled": spray,
        "actual_secondary_particles": actual_secondary,
        "domain_bounds_explicit": domain_min is not None,
        "preview_limit": "Grid size limits the smallest resolved droplets; this is not the final beauty mesh.",
    }
    if any(report[key]["non_manifold_edges"] for key in ["cup_collider", "saucer_collider", "source"]):
        raise RuntimeError("Liquid source, cup and saucer colliders must be closed manifold meshes")
    scene["cofein_liquid_setup"] = json.dumps(report)
    return domain, report


def sample_liquid(domain, frames):
    """Report actual cached meshes at selected frames for physical QA."""
    scene = bpy.context.scene
    results = []
    for frame in frames:
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        evaluated = domain.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = evaluated.to_mesh()
        points = [evaluated.matrix_world @ v.co for v in mesh.vertices]
        result = {"frame": frame, "vertices": len(points), "faces": len(mesh.polygons)}
        if points:
            result["min"] = [min(v[a] for v in points) for a in range(3)]
            result["max"] = [max(v[a] for v in points) for a in range(3)]
            bm = bmesh.new()
            bm.from_mesh(mesh)
            result["mesh_volume_m3"] = abs(bm.calc_volume(signed=True))
            bm.free()
        results.append(result)
        evaluated.to_mesh_clear()
    return results


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--cache", required=True)
    parser.add_argument("--resolution", type=int, default=48)
    parser.add_argument("--frames", type=int, default=120)
    parser.add_argument("--floor-z", type=float, default=0.0)
    parser.add_argument("--surface-tension", type=float, default=0.15)
    parser.add_argument("--mesh-scale", type=int, default=2)
    parser.add_argument("--mesh-smooth", type=int, default=1)
    parser.add_argument("--timesteps-max", type=int, default=12)
    parser.add_argument("--timesteps-min", type=int, default=1)
    parser.add_argument("--cfl", type=float, default=2.0)
    parser.add_argument("--source-inset-cells", type=float, default=1.25)
    parser.add_argument("--conservative-wall", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--fractional-obstacles", action=argparse.BooleanOptionalAction, default=False)
    parser.add_argument("--delete-in-obstacle", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--spray", action="store_true", help="Bake solver-generated secondary spray particles; no decorative emitters")
    parser.add_argument("--domain-min", type=lambda s: tuple(float(v) for v in s.split(",")))
    parser.add_argument("--domain-max", type=lambda s: tuple(float(v) for v in s.split(",")))
    parser.add_argument("--bake", action="store_true")
    parser.add_argument("--sample-frames", default="1,12,30,45,60,90,120")
    options = parser.parse_args(args)
    bpy.ops.wm.open_mainfile(filepath=str(Path(options.input).resolve()))
    domain, report = configure_liquid(
        bpy.context.scene, options.cache, options.resolution, options.frames,
        options.floor_z, options.surface_tension, options.mesh_scale,
        options.timesteps_max, options.spray, options.domain_min, options.domain_max,
        options.source_inset_cells, options.conservative_wall,
        options.fractional_obstacles, options.delete_in_obstacle,
        options.mesh_smooth, options.timesteps_min, options.cfl)
    output = Path(options.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    report_path = output.with_suffix(".json")
    bpy.ops.wm.save_as_mainfile(filepath=str(output))
    report_path.write_text(json.dumps(report, indent=2))
    print("COFFEE_SETUP " + json.dumps(report), flush=True)
    if options.bake:
        _active(domain)
        started = time.monotonic()
        print("COFFEE_BAKE_DATA_START", flush=True)
        result = bpy.ops.fluid.bake_data()
        if "FINISHED" not in result:
            raise RuntimeError(f"Mantaflow data bake did not finish: {result}")
        report["data_bake_seconds"] = time.monotonic() - started
        print("COFFEE_BAKE_DATA_END " + str(report["data_bake_seconds"]), flush=True)
        started = time.monotonic()
        result = bpy.ops.fluid.bake_mesh()
        if "FINISHED" not in result:
            raise RuntimeError(f"Mantaflow mesh bake did not finish: {result}")
        report["mesh_bake_seconds"] = time.monotonic() - started
        if options.spray:
            started = time.monotonic()
            print("COFFEE_BAKE_SPRAY_START", flush=True)
            result = bpy.ops.fluid.bake_particles()
            if "FINISHED" not in result:
                raise RuntimeError(f"Mantaflow spray bake did not finish: {result}")
            report["spray_bake_seconds"] = time.monotonic() - started
            report["spray_particle_systems"] = [p.name for p in domain.particle_systems]
        frames = sorted({int(f) for f in options.sample_frames.split(",") if 1 <= int(f) <= options.frames})
        report["mesh_samples"] = sample_liquid(domain, frames)
        report["cache_bytes"] = sum(p.stat().st_size for p in Path(options.cache).rglob("*") if p.is_file())
        bpy.context.scene.frame_set(1)
        bpy.ops.wm.save_as_mainfile(filepath=str(output))
        report_path.write_text(json.dumps(report, indent=2))
        print("COFFEE_BAKE_COMPLETE " + json.dumps(report), flush=True)


if __name__ == "__main__":
    main()
