"""Inspect cached Mantaflow meshes and export observed droplet landing events.

This does not simulate, invent or distribute droplets. Connected components
come from the baked surface mesh. A landing requires an airborne detached
component followed by mesh contact with the floor (within grid tolerance), or
its merger into liquid already on that floor. Positions use actual low mesh
vertices, projected through the selected delivery camera. Fewer than the
requested maximum is a valid result: coarse bakes may contain no detached drops.

  blender -b coffee-fluid64.blend --threads 4 --python coffee_liquid_impacts.py -- \
    --output impacts64.json --first 21 --last 120 --max-impacts 12

No rendering and no fluid baking is performed. Frame range is read sequentially
to preserve track identity; only compact numerical results are written.
"""

import argparse
import json
import math
from pathlib import Path
import sys
import time

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector


def _distance_xy(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _radius_at(profile, z):
    if z <= profile[0][1]:
        return profile[0][0]
    for (r0, z0), (r1, z1) in zip(profile, profile[1:]):
        if z0 <= z <= z1 and z1 > z0:
            return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    return profile[-1][0]


def mesh_components(domain, cup, profile, cell, floor_z, world_transform=None):
    """Return actual components in world coordinates, optionally remapped.

    A cup-frame cache uses simulation-world vertex positions. Apply its one
    rigid sim-to-world map to both the liquid and cup for physical contact and
    interior classification. Preserve simulation bounds for domain clearance.
    """
    evaluated = domain.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    count = len(mesh.vertices)
    if count == 0:
        evaluated.to_mesh_clear()
        return [], []
    if count == 8 and len(mesh.polygons) == 6:
        evaluated.to_mesh_clear()
        raise RuntimeError(f"Frame {bpy.context.scene.frame_current} has no cached liquid mesh ({count} vertices)")
    parents = list(range(count))
    sizes = [1] * count

    def find(i):
        while parents[i] != i:
            parents[i] = parents[parents[i]]
            i = parents[i]
        return i

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra == rb:
            return
        if sizes[ra] < sizes[rb]:
            ra, rb = rb, ra
        parents[rb] = ra
        sizes[ra] += sizes[rb]

    for polygon in mesh.polygons:
        first = polygon.vertices[0]
        for index in polygon.vertices[1:]:
            union(first, index)
    sim_points = [evaluated.matrix_world @ vertex.co for vertex in mesh.vertices]
    points = [world_transform @ point for point in sim_points] if world_transform is not None else sim_points
    cup_world = world_transform @ cup.matrix_world if world_transform is not None else cup.matrix_world
    inverse_cup = cup_world.inverted()
    components = {}
    floor_points = []
    for index, point in enumerate(points):
        root = find(index)
        c = components.setdefault(root, {
            "vertexCount": 0, "sum": Vector(), "low": Vector((math.inf,) * 3),
            "high": Vector((-math.inf,) * 3), "signedVolume": 0.0,
            "simLow": Vector((math.inf,) * 3), "simHigh": Vector((-math.inf,) * 3),
            "inCupVertices": 0, "lowPoints": [], "belowFloorVertices": 0,
        })
        c["vertexCount"] += 1
        c["sum"] += point
        for axis in range(3):
            c["low"][axis] = min(c["low"][axis], point[axis])
            c["high"][axis] = max(c["high"][axis], point[axis])
            c["simLow"][axis] = min(c["simLow"][axis], sim_points[index][axis])
            c["simHigh"][axis] = max(c["simHigh"][axis], sim_points[index][axis])
        local = inverse_cup @ point
        if profile[0][1] - cell * .5 <= local.z <= profile[-1][1] + cell * .25:
            if math.hypot(local.x, local.y) <= _radius_at(profile, local.z) + cell * .3:
                c["inCupVertices"] += 1
        if point.z <= floor_z + cell * .65:
            c["lowPoints"].append(point)
            floor_points.append(point)
        if point.z < floor_z - cell:
            c["belowFloorVertices"] += 1
    mesh.calc_loop_triangles()
    for triangle in mesh.loop_triangles:
        ia, ib, ic = triangle.vertices
        # Signed tetrahedron volume. Translation terms cancel for closed fluid
        # components; volumes therefore stay comparable while the cup moves.
        components[find(ia)]["signedVolume"] += points[ia].dot(points[ib].cross(points[ic])) / 6
    results = []
    for c in components.values():
        c["center"] = c.pop("sum") / c["vertexCount"]
        # Closed inward-facing components bound air cavities, not detached
        # liquid drops. Keep the sign for net-volume/meshing quality reports.
        c["isCavity"] = c["signedVolume"] < 0
        c["volume"] = abs(c["signedVolume"])
        c["inCup"] = c["inCupVertices"] >= max(4, c["vertexCount"] * .035)
        c["touchingFloor"] = bool(c["lowPoints"])
        results.append(c)
    evaluated.to_mesh_clear()
    return results, floor_points


def _world_landing(points, prediction=None):
    """Use actual near-floor vertices, localized around a tracked drop."""
    if prediction is not None:
        points = sorted(points, key=lambda p: _distance_xy(p, prediction))[:12]
    else:
        min_z = min(p.z for p in points)
        points = [p for p in points if p.z <= min_z + .0015]
    return sum(points, Vector()) / len(points)


def export_impacts(output, first=21, last=None, max_impacts=12,
                   camera_name=None, floor_z=0.0, include_primary_contact=False,
                   camera_blend=None):
    scene = bpy.context.scene
    last = last or scene.frame_end
    if first < 2 or last <= first:
        raise ValueError("Need an analysis range after settling with at least two frames")
    if max_impacts < 1:
        raise ValueError("max_impacts must be positive")
    domain = bpy.data.objects.get("CoffeeDomain")
    cup = bpy.data.objects.get("CupBody")
    if camera_blend:
        with bpy.data.libraries.load(str(Path(camera_blend).resolve()), link=False) as (source, target):
            name = camera_name or "ProductCamera"
            if name not in source.objects:
                raise RuntimeError(f"Camera {name} is absent from {camera_blend}")
            target.objects = [name]
        camera = target.objects[0]
        scene.collection.objects.link(camera)
    else:
        camera = bpy.data.objects.get(camera_name) if camera_name else scene.camera
    if not domain or not cup or not camera or camera.type != "CAMERA":
        raise RuntimeError("Expected CoffeeDomain, CupBody and a delivery camera")
    setup = json.loads(scene["cofein_liquid_setup"])
    cup_frame_motion = None
    if scene.get("cofein_cup_frame"):
        # Importing this helper does not import manta or alter the native cache.
        sys.path.insert(0, str(Path(__file__).parent))
        from coffee_cup_frame import CupFrameMotion
        cup_frame_motion = CupFrameMotion.from_scene(scene)
    cell = float(setup["cell_size_m"])
    raw_profile = cup["liquid_interior_profile"]
    profile = json.loads(raw_profile) if isinstance(raw_profile, str) else list(raw_profile)
    profile = [(float(r), float(z)) for r, z in profile]
    fps = scene.render.fps / scene.render.fps_base
    min_volume = cell ** 3 * .25
    tracks = []
    events = []
    summaries = []
    next_id = 1
    primary_recorded = False
    started = time.monotonic()

    def record(track, frame, point, volume, method):
        point = Vector((point.x, point.y, floor_z))
        projected = world_to_camera_view(scene, camera, point)
        event = {
            "id": f"physical-drop-{track['id']}",
            "frame": frame, "at": (frame - first) / (last - first),
            "world": list(point),
            "imageX": float(projected.x), "imageY": float(1 - projected.y),
            "cameraDepth": float(projected.z),
            "volumeM3": volume,
            "diameterEquivalentM": (6 * volume / math.pi) ** (1 / 3),
            "observedAirborneFrames": track["airborneFrames"],
            "method": method,
            "uncertainty": {"worldM": cell, "frames": 1},
        }
        track["landed"] = True
        if frame >= first:
            events.append(event)

    # Read one predecessor frame to distinguish already-wet ground from a new
    # impact. No event before `first` is exported.
    for frame in range(first - 1, last + 1):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        world_transform = cup_frame_motion.sim_to_world_matrix(frame) if cup_frame_motion else None
        components, floor_points = mesh_components(domain, cup, profile, cell, floor_z, world_transform)
        total_volume = sum(c["signedVolume"] for c in components)
        if frame >= first:
            mesh_low = [min(c['low'][a] for c in components) for a in range(3)] if components else None
            mesh_high = [max(c['high'][a] for c in components) for a in range(3)] if components else None
            image_bounds = None
            if components:
                projected_corners = [world_to_camera_view(scene, camera, Vector((x, y, z)))
                                     for x in [mesh_low[0], mesh_high[0]]
                                     for y in [mesh_low[1], mesh_high[1]]
                                     for z in [mesh_low[2], mesh_high[2]]]
                image_bounds = {
                    'left': min(p.x for p in projected_corners),
                    'right': max(p.x for p in projected_corners),
                    'top': min(1 - p.y for p in projected_corners),
                    'bottom': max(1 - p.y for p in projected_corners),
                }
            summaries.append({
                "frame": frame,
                "componentCount": len(components),
                "cavityComponentCount": sum(c['isCavity'] for c in components),
                "cavityVolumeM3": sum(c['volume'] for c in components if c['isCavity']),
                "significantComponentCount": sum(c["volume"] >= min_volume for c in components),
                "detachedAirborneCount": sum(not c["isCavity"] and not c["inCup"] and not c["touchingFloor"] and c["volume"] >= min_volume for c in components),
                "liquidVolumeM3": total_volume,
                "inCupVolumeM3": sum(c["signedVolume"] for c in components if c["inCup"]),
                "meshMin": mesh_low,
                "meshMax": mesh_high,
                "simulationMeshMin": [min(c['simLow'][a] for c in components) for a in range(3)] if components else None,
                "simulationMeshMax": [max(c['simHigh'][a] for c in components) for a in range(3)] if components else None,
                "imageBoundsFromWorldAABB": image_bounds,
                "lowestMeshZ": min(c["low"].z for c in components) if components else None,
                "belowFloorVertexCount": sum(c["belowFloorVertices"] for c in components),
            })
        # Match only genuinely detached components. A cup-connected sheet is
        # not counted as a ballistic droplet merely because it has a long tip.
        candidates = [c for c in components if not c["isCavity"] and not c["inCup"] and c["volume"] >= min_volume]
        eligible = [t for t in tracks if not t["landed"] and frame - t["frame"] <= 2]
        matches = []
        for ti, track in enumerate(eligible):
            dt = (frame - track["frame"]) / fps
            prediction = track["center"] + track["velocity"] * dt + Vector((0, 0, -4.905 * dt * dt))
            for ci, candidate in enumerate(candidates):
                ratio = candidate["volume"] / max(track["volume"], 1e-12)
                distance = (candidate["center"] - prediction).length
                if .15 <= ratio <= 6 and distance < max(cell * 4, .035):
                    matches.append((distance + abs(math.log(ratio)) * cell, ti, ci))
        used_tracks, used_candidates = set(), set()
        for _, ti, ci in sorted(matches):
            if ti in used_tracks or ci in used_candidates:
                continue
            used_tracks.add(ti)
            used_candidates.add(ci)
            track, candidate = eligible[ti], candidates[ci]
            dt = (frame - track["frame"]) / fps
            velocity = (candidate["center"] - track["center"]) / dt
            if candidate["touchingFloor"] and track["airborneFrames"] >= 1:
                point = _world_landing(candidate["lowPoints"], track["center"])
                record(track, frame, point, min(track["volume"], candidate["volume"]), "detached-component-contact")
            elif not candidate["touchingFloor"]:
                track["airborneFrames"] += 1
            track.update(frame=frame, center=candidate["center"], velocity=velocity,
                         lowZ=candidate["low"].z, volume=candidate["volume"])

        # A drop can merge with a much larger puddle between two cached
        # frames. Require a plausible downward flight and actual nearby new
        # frame floor mesh; do not extrapolate into an empty plane.
        for ti, track in enumerate(eligible):
            if ti in used_tracks or track["landed"] or track["airborneFrames"] < 1 or not floor_points:
                continue
            dt = (frame - track["frame"]) / fps
            predicted = track["center"] + track["velocity"] * dt + Vector((0, 0, -4.905 * dt * dt))
            predicted_low = track["lowZ"] + track["velocity"].z * dt - 4.905 * dt * dt
            radius = max(cell, (3 * track["volume"] / (4 * math.pi)) ** (1 / 3))
            nearby = [p for p in floor_points if _distance_xy(p, predicted) <= radius + cell * 1.5]
            if track["velocity"].z < 0 and predicted_low <= floor_z + cell and nearby:
                record(track, frame, _world_landing(nearby, predicted), track["volume"], "detached-component-merged-with-floor-liquid")

        for ci, candidate in enumerate(candidates):
            if ci in used_candidates or candidate["touchingFloor"]:
                continue
            tracks.append({"id": next_id, "frame": frame,
                           "center": candidate["center"], "velocity": Vector(),
                           "lowZ": candidate["low"].z, "volume": candidate["volume"],
                           "airborneFrames": 1, "landed": False})
            next_id += 1
        if include_primary_contact and not primary_recorded:
            touching_primary = [c for c in components if not c['isCavity'] and c["inCup"] and c["touchingFloor"]]
            if touching_primary:
                c = max(touching_primary, key=lambda c: c["volume"])
                track = {"id": "primary", "airborneFrames": 0, "landed": False}
                record(track, frame, _world_landing(c["lowPoints"]), c["volume"], "primary-liquid-floor-contact")
                primary_recorded = True

    # Remove repeated observations of the same landing footprint. Retain
    # distinct physical sites; never fabricate enough events to reach a quota.
    selected = []
    discarded = []
    for event in sorted(events, key=lambda e: e["frame"]):
        if not (event["cameraDepth"] > 0 and 0 <= event["imageX"] <= 1 and 0 <= event["imageY"] <= 1):
            discarded.append({"id": event["id"], "reason": "outside-delivery-camera"})
            continue
        duplicate = next((old for old in selected if _distance_xy(event["world"], old["world"]) < cell * 2 and abs(event["frame"] - old["frame"]) <= 8), None)
        if duplicate:
            discarded.append({"id": event["id"], "reason": "same-observed-landing-footprint"})
            continue
        selected.append(event)
    if len(selected) > max_impacts:
        # Preserve first contact and the largest remaining real events. Order
        # the chosen events chronologically for deterministic scroll playback.
        selected = sorted([selected[0], *sorted(selected[1:], key=lambda e: e["volumeM3"], reverse=True)[:max_impacts - 1]], key=lambda e: e["frame"])
    nonempty_summaries = [s for s in summaries if s['meshMin'] is not None]
    if not nonempty_summaries:
        raise RuntimeError(f'No liquid mesh in any frame {first}..{last}; cannot export physical impacts')
    reference_volume = nonempty_summaries[0]["liquidVolumeM3"]
    union_min = [min(s["meshMin"][axis] for s in nonempty_summaries) for axis in range(3)]
    union_max = [max(s["meshMax"][axis] for s in nonempty_summaries) for axis in range(3)]
    simulation_union_min = [min(s["simulationMeshMin"][axis] for s in nonempty_summaries) for axis in range(3)]
    simulation_union_max = [max(s["simulationMeshMax"][axis] for s in nonempty_summaries) for axis in range(3)]
    domain_min, domain_max = setup.get("domain_min"), setup.get("domain_max")
    boundary_clearance = None
    if domain_min and domain_max:
        boundary_clearance = {
            "low": [simulation_union_min[a] - domain_min[a] for a in range(3)],
            "high": [domain_max[a] - simulation_union_max[a] for a in range(3)],
            "coordinates": "simulation-world (before optional cup-frame remap)",
            "note": "An open-side clearance below two cells can indicate already clipped liquid. Do not tighten that side based on this bake.",
        }
    report = {
        "blender": bpy.app.version_string,
        "blend": bpy.data.filepath,
        "camera": camera.name,
        "cameraBlend": str(Path(camera_blend).resolve()) if camera_blend else bpy.data.filepath,
        "frameRange": {"first": first, "last": last, "fps": fps, "settlingExcluded": first - 1},
        "coordinateConvention": "imageX/imageY normalized, origin at top left; world in metres, Z up; at=(frame-first)/(last-first)",
        "cupFrameRemap": {"applied": bool(cup_frame_motion),
                          "physicalEquivalence": False if cup_frame_motion else None,
                          "note": "Exact rigid geometric remap of native cached positions; rotating-frame simulation omits Coriolis, Euler and centrifugal forces." if cup_frame_motion else "Native world-space cache; no coordinate remap."},
        "floorZ": floor_z,
        "cellSizeM": cell,
        "minimumTrackedVolumeM3": min_volume,
        "minimumTrackedDiameterM": (6 * min_volume / math.pi) ** (1 / 3),
        "observedTracks": next_id - 1,
        "observedLandings": len(events),
        "impacts": selected,
        "discarded": discarded,
        "quality": {
            "frames": summaries,
            "initialMeshVolumeM3": reference_volume,
            "finalMeshVolumeM3": summaries[-1]["liquidVolumeM3"],
            "finalVolumeFraction": summaries[-1]["liquidVolumeM3"] / max(reference_volume, 1e-12),
            "peakDetachedAirborneComponents": max(s["detachedAirborneCount"] for s in summaries),
            "allFrameMeshMin": union_min,
            "allFrameMeshMax": union_max,
            "allFrameSimulationMeshMin": simulation_union_min,
            "allFrameSimulationMeshMax": simulation_union_max,
            "boundaryClearanceM": boundary_clearance,
            "inCupVolumeDefinition": "Volume of complete connected components touching the cup interior. A still-connected pouring stream is included; this is not exact spatial integration inside the bowl.",
            "imageBoundsDefinition": "Conservative normalized image bounds from all eight world-axis-aligned mesh bounding-box corners; top-left origin. Can overestimate silhouette extent.",
            "interpretation": "Volume can leave the open domain. Surface reconstruction and voxel size limit contact accuracy. Zero impacts means this bake did not resolve suitable detached drops; increase resolution or revise real cup motion rather than adding synthetic impacts.",
        },
        "elapsedSeconds": time.monotonic() - started,
    }
    Path(output).parent.mkdir(parents=True, exist_ok=True)
    Path(output).write_text(json.dumps(report, indent=2))
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True)
    parser.add_argument("--first", type=int, default=21)
    parser.add_argument("--last", type=int)
    parser.add_argument("--max-impacts", type=int, default=12)
    parser.add_argument("--camera")
    parser.add_argument("--camera-blend")
    parser.add_argument("--floor-z", type=float, default=0.0)
    parser.add_argument("--include-primary-contact", action="store_true")
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    options = parser.parse_args(args)
    report = export_impacts(options.output, options.first, options.last,
                            options.max_impacts, options.camera, options.floor_z,
                            options.include_primary_contact, options.camera_blend)
    print("COFFEE_IMPACTS " + json.dumps({
        "path": options.output, "count": len(report["impacts"]),
        "tracks": report["observedTracks"],
        "elapsedSeconds": report["elapsedSeconds"],
    }), flush=True)


if __name__ == "__main__":
    main()
