"""Fast algorithm fixtures only; these are NOT physical simulation results.

Run inside background Blender. Creates no production scene or website assets.
"""
import json
from pathlib import Path
import sys
import tempfile

import bpy
import bmesh
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).parent))
from coffee_liquid_impacts import export_impacts, mesh_components
from coffee_cup_frame import CupFrameMotion


def fixture(locations, in_cup=False):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    if "cofein_cup_frame" in scene:
        del scene["cofein_cup_frame"]
    scene.render.fps = 24
    scene.frame_start, scene.frame_end = 20, 24
    scene["cofein_liquid_setup"] = json.dumps({"cell_size_m": .002})
    bpy.ops.mesh.primitive_cube_add(size=.001, location=(0 if in_cup else 1, 0, 0))
    cup = bpy.context.object
    cup.name = "CupBody"
    cup["liquid_interior_profile"] = json.dumps([[.02, .005], [.04, .08]])
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=.004)
    domain = bpy.context.object
    domain.name = "CoffeeDomain"
    for frame, z in locations:
        domain.location = (.01, 0, z)
        domain.keyframe_insert(data_path="location", frame=frame)
    bpy.ops.object.camera_add(location=(.05, -.25, .15))
    camera = bpy.context.object
    camera.name = "TestCamera"
    camera.rotation_euler = (Vector((0, 0, 0)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera
    return scene, domain, cup


with tempfile.TemporaryDirectory(prefix="cofein-impact-fixture-") as temp:
    scene, domain, cup = fixture([(20, .04), (21, .03), (22, .016), (23, .004), (24, .003)])
    scene.frame_set(20)
    components, _ = mesh_components(domain, cup, [[.02, .005], [.04, .08]], .002, 0)
    assert len(components) == 1
    assert not components[0]["inCup"] and not components[0]["touchingFloor"]
    assert 2.2e-7 < components[0]["volume"] < 2.8e-7, components[0]["volume"]
    report = export_impacts(Path(temp) / "fall.json", first=21, last=24)
    assert len(report["impacts"]) == 1, report["impacts"]
    impact = report["impacts"][0]
    assert impact["frame"] == 23 and abs(impact["at"] - 2 / 3) < 1e-9
    assert abs(impact["world"][0] - .01) < .003 and impact["world"][2] == 0
    assert 0 < impact["imageX"] < 1 and 0 < impact["imageY"] < 1
    assert impact["observedAirborneFrames"] >= 2
    fixture([(20, .04), (24, .04)])
    report = export_impacts(Path(temp) / "hover.json", first=21, last=24)
    assert report["impacts"] == []
    fixture([(20, .003), (24, .003)])
    report = export_impacts(Path(temp) / "resting.json", first=21, last=24)
    assert report["impacts"] == []
    fixture([(20, .04), (24, .04)], in_cup=True)
    report = export_impacts(Path(temp) / "in-cup.json", first=21, last=24)
    assert report["observedTracks"] == 0 and report["impacts"] == []
    scene, domain, cup = fixture([(20, .04), (21, .03), (22, .016), (23, .004), (24, .003)])
    bm = bmesh.new()
    bm.from_mesh(domain.data)
    bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
    bm.to_mesh(domain.data)
    bm.free()
    scene.frame_set(20)
    components, _ = mesh_components(domain, cup, [[.02, .005], [.04, .08]], .002, 0)
    assert components[0]['isCavity'] and components[0]['signedVolume'] < 0
    report = export_impacts(Path(temp) / 'air-cavity.json', first=21, last=24)
    assert report['observedTracks'] == 0 and report['impacts'] == []
    assert report['quality']['frames'][0]['cavityVolumeM3'] > 0
    scene, domain, cup = fixture([(20, .04), (24, .04)], in_cup=True)
    scene.frame_set(20)
    profile = [[.02, .005], [.04, .08]]
    original, _ = mesh_components(domain, cup, profile, .002, 0)
    rigid = Matrix.Translation((.023, -.017, .061)) @ Matrix.Rotation(.71, 4, 'Y')
    moved, _ = mesh_components(domain, cup, profile, .002, 0, rigid)
    assert moved[0]['inCup'] == original[0]['inCup'] == True
    assert abs(moved[0]['signedVolume'] / original[0]['signedVolume'] - 1) < 1e-4
    assert (moved[0]['center'] - rigid @ original[0]['center']).length < 1e-7
    assert (moved[0]['simLow'] - original[0]['low']).length < 1e-7
    assert (moved[0]['simHigh'] - original[0]['high']).length < 1e-7
    assert (moved[0]['low'] - moved[0]['simLow']).length > .01
    lowered, floor_points = mesh_components(domain, cup, profile, .002, 0, Matrix.Translation((0, 0, -.037)))
    assert lowered[0]['touchingFloor'] and floor_points and not original[0]['touchingFloor']
    assert lowered[0]['inCup'], 'Both cup and actual liquid must receive the same rigid map'
    scene, domain, cup = fixture([(20, .04), (21, .03), (22, .016), (23, .004), (24, .003)])
    poses = [{'frame': 19.75 + i * .25,
              'position': [(19.75 + i * .25 - 20) * .003, 0, 0],
              'quaternion': [1, 0, 0, 0]} for i in range(19)]
    motion = CupFrameMotion(poses, fps=24, frame_start=20, frame_end=24)
    scene['cofein_cup_frame'] = json.dumps(motion.to_dict())
    scene['cofein_liquid_setup'] = json.dumps({'cell_size_m': .002,
        'domain_min': [-.1, -.1, -.1], 'domain_max': [.1, .1, .1]})
    report = export_impacts(Path(temp) / 'world-remapped-fall.json', first=21, last=24)
    assert report['cupFrameRemap']['applied'] and not report['cupFrameRemap']['physicalEquivalence']
    assert len(report['impacts']) == 1 and report['impacts'][0]['frame'] == 23
    assert abs(report['impacts'][0]['world'][0] - .019) < .003
    final_frame = report['quality']['frames'][-1]
    assert abs(final_frame['meshMin'][0] - final_frame['simulationMeshMin'][0] - .012) < 1e-7
    clearance = report['quality']['boundaryClearanceM']
    assert abs(clearance['high'][0] - (.1 - report['quality']['allFrameSimulationMeshMax'][0])) < 1e-7
    scene, domain, cup = fixture([(20, .04), (21, .03), (22, .016), (23, .004), (24, .003)])
    def drain_at_end(changed_scene, _depsgraph=None):
        if changed_scene.frame_current == 24:
            domain.data.clear_geometry()
    bpy.app.handlers.frame_change_pre.append(drain_at_end)
    try:
        report = export_impacts(Path(temp) / 'drained.json', first=21, last=24)
    finally:
        bpy.app.handlers.frame_change_pre.remove(drain_at_end)
    assert len(report['impacts']) == 1
    assert report['quality']['frames'][-1]['meshMin'] is None and report['quality']['frames'][-1]['lowestMeshZ'] is None
    assert report['quality']['finalMeshVolumeM3'] == 0 and report['quality']['allFrameMeshMin'] is not None
    try:
        export_impacts(Path(temp) / 'all-empty.json', first=21, last=24)
        raise AssertionError('All-empty cache must report that no fluid exists')
    except RuntimeError as error:
        assert 'No liquid mesh in any frame' in str(error)
print("COFFEE_IMPACT_FIXTURES_PASS 31 assertions; synthetic algorithm fixtures, not a fluid bake", flush=True)
