"""Export actual cached coffee to world NPZ frames; load as ordinary meshes.

No simulation or render is started. Export reads evaluated Mantaflow meshes and
native SPRAY points, applies the recorded cup-frame rigid map exactly once and
stores each integer frame without interpolation or fabricated trajectories.
The loader never parents or transforms a live fluid domain. Each NPZ is hashed;
the manifest records actual solver provenance and the rotating-frame model's
limitations. SPRAY sphere diameters are visual approximations, not measured mass.

Renderer API:
    sequence = load_world_sequence(scene, directory)
    configure_liquid_aov_composite()  # sees every preallocated coffee object
    scene.frame_set(frame)
    sequence["set_frame"](frame)
    bpy.ops.render.render(write_still=True)
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import numpy as np


VERSION = 1
OWNER = "cofein_actual_world_fluid_v1"
MESH_NAME = "CoffeeWorldFluid"
SPRAY_PREFIX = "CoffeeWorldSpray_"
MANIFEST_NAME = "manifest.json"
ARRAY_NAMES = ("vertices", "triangles", "spray_positions", "spray_visual_diameters",
               "spray_native_sizes", "spray_cache_indices", "spray_system_indices",
               "sim_to_world", "mesh_local_to_sim_world", "frame")


def _sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def transform_points(points, matrix):
    """Apply one affine map; native SPRAY must not receive domain.matrix_world."""
    points = np.asarray(points, dtype=np.float64).reshape((-1, 3))
    matrix = np.asarray(matrix, dtype=np.float64)
    if matrix.shape != (4, 4) or not np.all(np.isfinite(matrix)) or not np.allclose(matrix[3], (0, 0, 0, 1)):
        raise ValueError("Expected a finite affine 4x4 matrix")
    return np.asarray(points @ matrix[:3, :3].T + matrix[:3, 3], dtype=np.float32)


def _validate_arrays(arrays, frame):
    if set(arrays) != set(ARRAY_NAMES):
        raise ValueError("World frame has unexpected or missing fields")
    if arrays["frame"].shape != () or int(arrays["frame"]) != frame:
        raise ValueError("World frame number mismatch")
    for name in ("vertices", "spray_positions"):
        if arrays[name].ndim != 2 or arrays[name].shape[1] != 3:
            raise ValueError("Expected N×3 positions: " + name)
    if arrays["triangles"].ndim != 2 or arrays["triangles"].shape[1] != 3 or arrays["triangles"].dtype.kind not in "iu":
        raise ValueError("Expected integer N×3 triangles")
    vertex_count, spray_count = len(arrays["vertices"]), len(arrays["spray_positions"])
    tri = arrays["triangles"]
    if tri.size and (tri.min() < 0 or tri.max() >= vertex_count):
        raise ValueError("Triangle references a missing vertex")
    for name in ("spray_visual_diameters", "spray_native_sizes", "spray_cache_indices", "spray_system_indices"):
        if arrays[name].shape != (spray_count,):
            raise ValueError("SPRAY field count mismatch: " + name)
    for name, values in arrays.items():
        if values.dtype.kind not in "fiu" or not np.all(np.isfinite(values)):
            raise ValueError("World frame contains non-finite or non-numeric data: " + name)
    for name in ("sim_to_world", "mesh_local_to_sim_world"):
        if arrays[name].shape != (4, 4) or not np.allclose(arrays[name][3], (0, 0, 0, 1)):
            raise ValueError("Invalid recorded transform: " + name)
    if spray_count and (np.any(arrays["spray_native_sizes"] <= 0) or
                        np.any(arrays["spray_visual_diameters"] < .0009999) or
                        np.any(arrays["spray_visual_diameters"] > .0030001)):
        raise ValueError("Invalid native SPRAY size or visual diameter outside 1–3 mm")


def write_world_frame(directory, frame, arrays):
    """Write one validated frame, returning its hash/count/array-schema entry."""
    _validate_arrays(arrays, frame)
    directory = Path(directory)
    target = directory / f"fluid-{frame:04d}.npz"
    if target.exists():
        raise RuntimeError("Refusing to overwrite an existing world frame: " + str(target))
    temporary = target.with_suffix(".npz.partial")
    with temporary.open("wb") as stream:
        np.savez_compressed(stream, **arrays)
    temporary.replace(target)
    return {"frame": frame, "file": target.name, "sha256": _sha256(target),
            "bytes": target.stat().st_size, "vertices": len(arrays["vertices"]),
            "triangles": len(arrays["triangles"]), "sprayCount": len(arrays["spray_positions"]),
            "arrays": {name: {"shape": list(array.shape), "dtype": str(array.dtype)}
                       for name, array in arrays.items()}}


def capture_evaluated_frame(scene, domain, frame, motion, max_spray_particles=1500):
    """Read this actual integer frame. Never invoke bake or invent trajectories."""
    import bpy
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    evaluated = domain.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mapping = np.asarray(motion.sim_to_world_matrix(frame), dtype=np.float64)
    local_to_sim = np.asarray(evaluated.matrix_world, dtype=np.float64)
    mesh = evaluated.to_mesh()
    try:
        local = np.empty((len(mesh.vertices), 3), dtype=np.float32)
        mesh.vertices.foreach_get("co", local.ravel())
        mesh.calc_loop_triangles()
        triangles = np.empty((len(mesh.loop_triangles), 3), dtype=np.int32)
        mesh.loop_triangles.foreach_get("vertices", triangles.ravel())
        vertices = transform_points(local, mapping @ local_to_sim)
    finally:
        evaluated.to_mesh_clear()
    positions, sizes, indices, system_indices, system_names = [], [], [], [], []
    for system in evaluated.particle_systems:
        if system.settings.type != "SPRAY":
            continue
        system_index = len(system_names)
        system_names.append(system.name)
        for index, particle in enumerate(system.particles):
            if particle.alive_state != "ALIVE":
                continue
            positions.append(tuple(particle.location))  # Already simulation-world.
            sizes.append(float(particle.size))
            indices.append(index)
            system_indices.append(system_index)
    if len(positions) > max_spray_particles:
        raise RuntimeError(f"Frame {frame}: {len(positions)} actual SPRAY points exceeds {max_spray_particles}; none were discarded")
    native_sizes = np.asarray(sizes, dtype=np.float32)
    arrays = {
        "vertices": vertices, "triangles": triangles,
        "spray_positions": transform_points(positions, mapping),
        # Use native Blender size only, bounded for the render. No custom RNG,
        # index-based variation or unobserved points are introduced.
        "spray_visual_diameters": np.clip(native_sizes, .001, .003),
        "spray_native_sizes": native_sizes,
        "spray_cache_indices": np.asarray(indices, dtype=np.int32),
        "spray_system_indices": np.asarray(system_indices, dtype=np.int32),
        "sim_to_world": mapping, "mesh_local_to_sim_world": local_to_sim,
        "frame": np.asarray(frame, dtype=np.int32),
    }
    _validate_arrays(arrays, frame)
    return arrays, system_names


def export_world_sequence(scene, directory, *, frame_start=None, frame_end=None,
                          domain=None, max_spray_particles=1500):
    import bpy
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from coffee_cup_frame import CupFrameMotion
    domain = domain or scene.objects.get("CoffeeDomain")
    if domain is None:
        raise RuntimeError("Expected the cached CoffeeDomain")
    settings = next((m.domain_settings for m in domain.modifiers
                     if m.type == "FLUID" and m.fluid_type == "DOMAIN"), None)
    if settings is None or settings.domain_type != "LIQUID" or settings.cache_type != "MODULAR":
        raise RuntimeError("Only an existing modular Mantaflow liquid cache may be exported")
    if not settings.has_cache_baked_data or not settings.has_cache_baked_mesh:
        raise RuntimeError("Native liquid data and mesh must be baked before export")
    if any(s.settings.type == "SPRAY" for s in domain.particle_systems) and not settings.has_cache_baked_particles:
        raise RuntimeError("The existing native SPRAY system requires its baked particle cache")
    motion = CupFrameMotion.from_scene(scene)
    first = settings.cache_frame_start if frame_start is None else int(frame_start)
    last = settings.cache_frame_end if frame_end is None else int(frame_end)
    if first > last or first < settings.cache_frame_start or last > settings.cache_frame_end:
        raise ValueError("Requested range is outside the baked cache")
    directory = Path(directory).resolve()
    if directory.exists() and any(directory.iterdir()):
        raise RuntimeError("Export requires a new empty directory; do not mix simulation runs")
    directory.mkdir(parents=True, exist_ok=True)
    cache = Path(bpy.path.abspath(settings.cache_directory)).resolve()
    for frame in range(first, last + 1):
        if not any((cache / "mesh").glob(f"fluid_mesh_{frame:04d}.*")):
            raise RuntimeError(f"Missing native mesh cache for frame {frame}")
    cache_index = [{"file": str(p.relative_to(cache)), "bytes": p.stat().st_size,
                    "mtimeNs": p.stat().st_mtime_ns} for p in sorted(cache.rglob("*")) if p.is_file()]
    source_blend = Path(bpy.data.filepath)
    provenance = {"kind": "actual-cached-Mantaflow-evaluated-mesh-and-native-SPRAY",
                  "blenderVersion": bpy.app.version_string,
                  "sourceBlend": str(source_blend),
                  "sourceBlendSha256": _sha256(source_blend) if source_blend.is_file() else None,
                  "nativeCacheDirectory": str(cache), "nativeCacheFileCount": len(cache_index),
                  "nativeCacheIndexSha256": hashlib.sha256(json.dumps(cache_index, sort_keys=True).encode()).hexdigest(),
                  "cacheIndexDigestBasis": "relative path, size and mtime; not a hash of all original cache contents",
                  "resolution": settings.resolution_max, "domain": domain.name,
                  "cupFrame": motion.to_dict(), "interpolatedFrames": False,
                  "inventedParticlesOrTrajectories": False,
                  "nativeParticleVelocityUsed": False}
    manifest = {"version": VERSION, "status": "exporting", "coordinateSpace": "original world metres",
                "frameStart": first, "frameEnd": last,
                "fps": scene.render.fps / scene.render.fps_base,
                "material": "CoffeeMaterial", "provenance": provenance,
                "spraySize": {"method": "clip actual Blender particle.size to 1–3 mm, no custom variation",
                              "physicalDiameterMeasured": False, "physicalMassMeasured": False,
                              "cacheIndicesAreStableIds": False},
                "frames": [], "maxSprayParticles": 0}
    manifest_path = directory / MANIFEST_NAME
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    saved_frame = scene.frame_current
    try:
        for frame in range(first, last + 1):
            arrays, systems = capture_evaluated_frame(scene, domain, frame, motion, max_spray_particles)
            entry = write_world_frame(directory, frame, arrays)
            entry["spraySystems"] = systems
            manifest["frames"].append(entry)
            manifest["maxSprayParticles"] = max(manifest["maxSprayParticles"], entry["sprayCount"])
            print("COFFEE_WORLD_FRAME", frame, entry["vertices"], entry["sprayCount"], flush=True)
    finally:
        scene.frame_set(saved_frame)
    manifest["status"] = "complete"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def validate_world_sequence(directory):
    """Validate the complete range and every file hash before creating objects."""
    directory = Path(directory).resolve()
    path = directory / MANIFEST_NAME
    manifest = json.loads(path.read_text())
    if manifest.get("version") != VERSION or manifest.get("status") != "complete":
        raise ValueError("World sequence manifest is unsupported or incomplete")
    first, last = manifest["frameStart"], manifest["frameEnd"]
    entries = manifest["frames"]
    if not isinstance(first, int) or not isinstance(last, int) or first > last:
        raise ValueError("Invalid world frame range")
    if [row["frame"] for row in entries] != list(range(first, last + 1)):
        raise ValueError("Manifest must contain every frame exactly once in order")
    for row in entries:
        file = (directory / row["file"]).resolve()
        if file.parent != directory or file.suffix != ".npz" or not file.is_file():
            raise ValueError("Missing or unsafe world frame path")
        if file.stat().st_size != row["bytes"] or _sha256(file) != row["sha256"]:
            raise ValueError("World frame hash mismatch; do not mix simulation runs: " + file.name)
    if manifest["maxSprayParticles"] != max((r["sprayCount"] for r in entries), default=0):
        raise ValueError("Manifest SPRAY allocation count mismatch")
    return manifest


def read_world_frame(directory, entry):
    target = Path(directory) / entry["file"]
    if _sha256(target) != entry["sha256"]:
        raise ValueError("World frame changed after validation: " + target.name)
    with np.load(target, allow_pickle=False) as archive:
        arrays = {name: archive[name] for name in archive.files}
    _validate_arrays(arrays, entry["frame"])
    if (len(arrays["vertices"]) != entry["vertices"] or
        len(arrays["triangles"]) != entry["triangles"] or
        len(arrays["spray_positions"]) != entry["sprayCount"]):
        raise ValueError("World frame geometry counts differ from its manifest")
    for name, values in arrays.items():
        if entry["arrays"].get(name) != {"shape": list(values.shape), "dtype": str(values.dtype)}:
            raise ValueError("World frame schema differs from its manifest: " + name)
    return arrays


def load_world_sequence(scene, directory):
    """Return {'set_frame': callable, 'metadata': manifest}; never run a solver."""
    import bpy
    import bmesh
    from mathutils import Matrix
    directory = Path(directory).resolve()
    metadata = validate_world_sequence(directory)
    material = bpy.data.materials.get("CoffeeMaterial")
    if material is None:
        raise RuntimeError("Load the original world scene with CoffeeMaterial first")
    if scene.get("cofein_cup_frame"):
        raise RuntimeError("Renderer must load the original WORLD scene, not the transformed simulation scene")
    if scene.get("cofein_world_sequence"):
        raise RuntimeError("A world sequence is already attached to this render scene")
    names = [MESH_NAME] + [SPRAY_PREFIX + f"{i:04d}" for i in range(metadata["maxSprayParticles"])]
    if any(bpy.data.objects.get(name) for name in names):
        raise RuntimeError("Refusing to replace pre-existing world fluid objects")
    mesh = bpy.data.meshes.new(MESH_NAME + "Mesh")
    mesh.materials.append(material)
    fluid = bpy.data.objects.new(MESH_NAME, mesh)
    scene.collection.objects.link(fluid)
    fluid.matrix_world = Matrix.Identity(4)
    fluid["cofein_world_fluid_owner"] = OWNER
    spray = []
    if metadata["maxSprayParticles"]:
        sphere = bpy.data.meshes.new("CoffeeWorldSpraySharedMesh")
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=.5)
        bm.to_mesh(sphere)
        bm.free()
        sphere.materials.append(material)
        for face in sphere.polygons:
            face.use_smooth = True
        for name in names[1:]:
            obj = bpy.data.objects.new(name, sphere)
            scene.collection.objects.link(obj)
            obj["cofein_world_fluid_owner"] = OWNER
            obj["source"] = "Observed native SPRAY point; sphere diameter is visual approximation"
            obj.hide_render = True
            spray.append(obj)
    # Hide only known unsimulated previews; original world ceramics and motions
    # remain untouched. Any live domain is hidden, never parented/transformed.
    for name in ("CoffeeSource", "CoffeeSourceUnsimulatedReference", "StaticCremaReference", "CoffeeDomain", "CoffeeSprayDroplet"):
        obj = scene.objects.get(name)
        if obj:
            obj.hide_render = True
    entries = {row["frame"]: row for row in metadata["frames"]}
    def set_frame(frame):
        if isinstance(frame, bool) or int(frame) != frame or int(frame) not in entries:
            raise ValueError("Requested integer frame is outside this world sequence")
        frame = int(frame)
        if scene.frame_current != frame or scene.frame_subframe:
            raise ValueError("Call scene.frame_set(frame) before world sequence set_frame")
        if fluid.parent is not None or fluid.modifiers or fluid.matrix_world != Matrix.Identity(4):
            raise RuntimeError("World fluid must remain unparented, modifier-free and identity-transformed")
        arrays = read_world_frame(directory, entries[frame])
        vertices, triangles = arrays["vertices"], arrays["triangles"]
        mesh.clear_geometry()
        mesh.vertices.add(len(vertices))
        mesh.vertices.foreach_set("co", vertices.ravel())
        mesh.loops.add(3 * len(triangles))
        mesh.loops.foreach_set("vertex_index", triangles.ravel())
        mesh.polygons.add(len(triangles))
        mesh.polygons.foreach_set("loop_start", np.arange(len(triangles), dtype=np.int32) * 3)
        mesh.polygons.foreach_set("loop_total", np.full(len(triangles), 3, dtype=np.int32))
        mesh.polygons.foreach_set("use_smooth", np.ones(len(triangles), dtype=bool))
        mesh.update()
        for index, obj in enumerate(spray):
            active = index < len(arrays["spray_positions"])
            obj.hide_render = not active
            if active:
                obj.location = arrays["spray_positions"][index]
                diameter = float(arrays["spray_visual_diameters"][index])
                obj.scale = (diameter,) * 3
        fluid["actual_solver_frame"] = frame
        bpy.context.view_layer.update()
        return {"frame": frame, "vertices": len(vertices), "triangles": len(triangles),
                "nativeSprayCount": len(arrays["spray_positions"])}
    scene["cofein_world_sequence"] = json.dumps({"directory": str(directory),
        "manifestSha256": _sha256(directory / MANIFEST_NAME), "frameStart": metadata["frameStart"],
        "frameEnd": metadata["frameEnd"], "provenance": metadata["provenance"]})
    return {"set_frame": set_frame, "metadata": metadata}


def main():
    import bpy
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-directory", required=True)
    parser.add_argument("--start", type=int)
    parser.add_argument("--end", type=int)
    parser.add_argument("--max-spray-particles", type=int, default=1500)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    bpy.ops.wm.open_mainfile(filepath=str(Path(args.input).resolve()))
    report = export_world_sequence(bpy.context.scene, args.output_directory,
                                  frame_start=args.start, frame_end=args.end,
                                  max_spray_particles=args.max_spray_particles)
    print("COFFEE_WORLD_SEQUENCE_READY", args.output_directory, report["frameStart"], report["frameEnd"], flush=True)


if __name__ == "__main__":
    main()
