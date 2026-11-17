"""Blender-only synthetic transform/NPZ/render-loader regression; no bake/render."""
import json
from pathlib import Path
import sys
import tempfile
import unittest

import bpy
from mathutils import Matrix, Vector
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from coffee_world_fluid import (capture_evaluated_frame, transform_points, write_world_frame,
    validate_world_sequence, read_world_frame, load_world_sequence, MESH_NAME, SPRAY_PREFIX)
from coffee_liquid_aov_composite import configure_liquid_aov_composite, LIQUID_COLLECTION


class SyntheticMotion:
    def sim_to_world_matrix(self, frame):
        return Matrix.Translation((.2 * frame, -.3, .4)) @ Matrix.Rotation(.7, 4, "Z")


class WorldFluidTests(unittest.TestCase):
    def setUp(self):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        self.scene = bpy.context.scene
        self.directory = Path(tempfile.mkdtemp(prefix="cofein-world-fluid-test-"))
        mesh = bpy.data.meshes.new("FixtureMesh")
        mesh.from_pydata([(0, 0, 0), (.01, 0, 0), (0, .02, .003)], [], [(0, 1, 2)])
        self.object = bpy.data.objects.new("FixtureActualEvaluatedMesh", mesh)
        self.scene.collection.objects.link(self.object)
        self.object.matrix_world = Matrix.Translation((.013, .027, -.011)) @ Matrix.Rotation(.2, 4, "X")
        self.motion = SyntheticMotion()
        self.material = bpy.data.materials.new("CoffeeMaterial")
        self.material.use_nodes = True
        output = next(n for n in self.material.node_tree.nodes if n.type == "OUTPUT_MATERIAL")
        volume = self.material.node_tree.nodes.new("ShaderNodeVolumeAbsorption")
        volume.inputs["Density"].default_value = 42
        self.material.node_tree.links.new(volume.outputs[0], output.inputs["Volume"])

    def make_sequence(self):
        entries = []
        for frame in (1, 2):
            arrays, _ = capture_evaluated_frame(self.scene, self.object, frame, self.motion)
            count = 3 - frame
            simulated_positions = np.asarray([[.012, .01, .03], [.025, -.02, .014]][:count], dtype=np.float32)
            arrays.update(spray_positions=transform_points(simulated_positions, self.motion.sim_to_world_matrix(frame)),
                          spray_visual_diameters=np.asarray([.0012, .0028][:count], dtype=np.float32),
                          spray_native_sizes=np.asarray([.0012, .0028][:count], dtype=np.float32),
                          spray_cache_indices=np.asarray([19, 3][:count], dtype=np.int32),
                          spray_system_indices=np.zeros(count, dtype=np.int32))
            if frame == 2:
                arrays["vertices"] = np.concatenate((arrays["vertices"], arrays["vertices"][:1] + (0, 0, .01))).astype(np.float32)
                arrays["triangles"] = np.asarray([[0, 1, 2], [0, 3, 1]], dtype=np.int32)
            entries.append(write_world_frame(self.directory, frame, arrays))
        manifest = dict(version=1, status="complete", frameStart=1, frameEnd=2, fps=24,
                        maxSprayParticles=2, material="CoffeeMaterial", frames=entries,
                        provenance={"kind": "SYNTHETIC VALIDATION FIXTURE; not physical solver evidence"})
        (self.directory / "manifest.json").write_text(json.dumps(manifest))
        return manifest

    def test_evaluated_local_mesh_maps_once_and_native_points_skip_domain(self):
        arrays, systems = capture_evaluated_frame(self.scene, self.object, 2, self.motion)
        self.assertEqual(systems, [])
        expected = np.asarray([self.motion.sim_to_world_matrix(2) @ self.object.matrix_world @ vertex.co
                               for vertex in self.object.data.vertices])
        np.testing.assert_allclose(arrays["vertices"], expected, rtol=1e-6, atol=1e-7)
        sim_point = self.object.matrix_world @ self.object.data.vertices[1].co
        actual_native_world = transform_points([sim_point], self.motion.sim_to_world_matrix(2))[0]
        np.testing.assert_allclose(actual_native_world, arrays["vertices"][1], atol=1e-7)
        wrong_double_transform = transform_points([sim_point], self.motion.sim_to_world_matrix(2) @ self.object.matrix_world)[0]
        self.assertGreater(float(np.linalg.norm(wrong_double_transform - actual_native_world)), .01)

    def test_roundtrip_changing_topology_world_identity_and_aov_spray_pool(self):
        manifest = self.make_sequence()
        original = self.object.matrix_world.copy()
        sequence = load_world_sequence(self.scene, self.directory)
        self.scene.render.engine = "CYCLES"
        aov = configure_liquid_aov_composite(self.scene, self.material)
        for frame in (1, 2):
            self.scene.frame_set(frame)
            result = sequence["set_frame"](frame)
            arrays = read_world_frame(self.directory, manifest["frames"][frame - 1])
            fluid = bpy.data.objects[MESH_NAME]
            actual = np.empty((len(fluid.data.vertices), 3), dtype=np.float32)
            fluid.data.vertices.foreach_get("co", actual.ravel())
            np.testing.assert_array_equal(actual, arrays["vertices"])
            self.assertEqual(len(fluid.data.polygons), frame)
            self.assertEqual(fluid.matrix_world, Matrix.Identity(4))
            self.assertIsNone(fluid.parent)
            self.assertEqual(len(fluid.modifiers), 0)
            self.assertIs(fluid.data.materials[0], self.material)
            self.assertEqual(result["nativeSprayCount"], 3 - frame)
            for index in range(2):
                obj = bpy.data.objects[SPRAY_PREFIX + f"{index:04d}"]
                self.assertIn(obj.name, bpy.data.collections[LIQUID_COLLECTION].objects)
                self.assertEqual(obj.hide_render, index >= 3 - frame)
                if index < 3 - frame:
                    np.testing.assert_allclose(tuple(obj.location), arrays["spray_positions"][index], atol=1e-7)
        self.assertTrue(self.scene.view_layers[aov["dryLayer"]].layer_collection.children[LIQUID_COLLECTION].exclude)
        self.assertEqual(self.object.matrix_world, original)
        with self.assertRaises(ValueError):
            sequence["set_frame"](3)
        self.scene.frame_set(1)
        with self.assertRaisesRegex(ValueError, "scene.frame_set"):
            sequence["set_frame"](2)

    def test_hash_missing_frame_and_double_attachment_guards(self):
        manifest = self.make_sequence()
        validate_world_sequence(self.directory)
        sequence = load_world_sequence(self.scene, self.directory)
        with self.assertRaisesRegex(RuntimeError, "already attached"):
            load_world_sequence(self.scene, self.directory)
        target = self.directory / manifest["frames"][0]["file"]
        data = bytearray(target.read_bytes())
        data[-1] ^= 1
        target.write_bytes(data)
        with self.assertRaisesRegex(ValueError, "hash mismatch"):
            validate_world_sequence(self.directory)
        self.scene.frame_set(1)
        with self.assertRaisesRegex(ValueError, "changed after validation"):
            sequence["set_frame"](1)
        manifest["frames"].pop()
        (self.directory / "manifest.json").write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, "every frame"):
            validate_world_sequence(self.directory)

    def test_refuses_simulation_scene_and_modified_world_mesh_transform(self):
        self.make_sequence()
        self.scene["cofein_cup_frame"] = "fixture"
        with self.assertRaisesRegex(RuntimeError, "WORLD scene"):
            load_world_sequence(self.scene, self.directory)
        del self.scene["cofein_cup_frame"]
        sequence = load_world_sequence(self.scene, self.directory)
        self.scene.frame_set(1)
        bpy.data.objects[MESH_NAME].location.x = .001
        bpy.context.view_layer.update()
        with self.assertRaisesRegex(RuntimeError, "identity"):
            sequence["set_frame"](1)


if __name__ == "__main__":
    unittest.main(argv=[__file__])
