"""Blender structural checks and one 64px Cycles compositing regression.

blender -b -t 1 --python test_liquid_aov_composite.py
The tiny emission fixture verifies occluded white scenery and transparent
background recovery without baking or rendering the production coffee scene.
"""
import json
import math
from pathlib import Path
import sys
import tempfile
import unittest

import bpy

sys.path.insert(0, str(Path(__file__).parent))
from coffee_liquid_aov_composite import configure_liquid_aov_composite, PREFIX, LIQUID_COLLECTION


def emission_material(name, color, *, volume=False):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = (*color, 1.)
    links.new(emission.outputs[0], output.inputs["Surface"])
    if volume:
        absorption = nodes.new("ShaderNodeVolumeAbsorption")
        absorption.inputs["Density"].default_value = 42.
        links.new(absorption.outputs[0], output.inputs["Volume"])
    return material


def cube(name, location, scale, material):
    bpy.ops.mesh.primitive_cube_add(size=2, location=location)
    obj = bpy.context.object
    obj.name, obj.scale = name, scale
    obj.data.materials.append(material)
    return obj


class AOVCompositeTests(unittest.TestCase):
    def setUp(self):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        self.scene = bpy.context.scene
        self.scene.render.engine = "CYCLES"
        self.scene.cycles.device = "CPU"
        self.scene.cycles.samples = 2
        self.scene.cycles.use_denoising = False
        self.scene.render.resolution_x = self.scene.render.resolution_y = 64
        self.scene.render.resolution_percentage = 100
        self.scene.render.film_transparent = True
        self.scene.render.threads_mode = "FIXED"
        self.scene.render.threads = 1
        self.scene.view_settings.view_transform = "Standard"
        self.coffee = emission_material("CoffeeMaterial", (.08, .018, .004), volume=True)
        white = emission_material("CeramicReference", (1., 1., 1.))
        self.plate = cube("WhiteScenery", (-.015, .01, .006), (.015, .001, .02), white)
        self.liquid = cube("CoffeeMesh", (0, -.01, .006), (.02, .001, .005), self.coffee)
        bpy.ops.object.camera_add(location=(0, -.2, .006))
        camera = bpy.context.object
        camera.rotation_euler = (math.pi / 2, 0, 0)
        camera.data.type, camera.data.ortho_scale = "ORTHO", .08
        self.scene.camera = camera
        self.scene.frame_set(1)

    def configure(self):
        return configure_liquid_aov_composite(self.scene, self.coffee,
                                             fade_start=.02, fade_end=.03, dry_samples=8)

    def test_idempotent_material_geometry_and_dry_exclusion(self):
        output = next(n for n in self.coffee.node_tree.nodes if n.type == "OUTPUT_MATERIAL")
        original = [output.inputs[k].links[0].from_socket.as_pointer() for k in ("Surface", "Volume")]
        matrix = self.liquid.matrix_world.copy()
        vertices = [tuple(v.co) for v in self.liquid.data.vertices]
        report = self.configure()
        counts = (len(self.coffee.node_tree.nodes), len(self.scene.node_tree.nodes), len(self.scene.view_layers))
        self.configure()
        self.assertEqual(counts, (len(self.coffee.node_tree.nodes), len(self.scene.node_tree.nodes), len(self.scene.view_layers)))
        self.assertEqual(original, [output.inputs[k].links[0].from_socket.as_pointer() for k in ("Surface", "Volume")])
        density = next(n.inputs["Density"] for n in self.coffee.node_tree.nodes if n.type == "VOLUME_ABSORPTION")
        self.assertFalse(density.is_linked)
        self.assertEqual(density.default_value, 42.)
        self.assertEqual(self.liquid.matrix_world, matrix)
        self.assertEqual(vertices, [tuple(v.co) for v in self.liquid.data.vertices])
        dry = self.scene.view_layers[report["dryLayer"]]
        self.assertEqual(dry.samples, 8)
        self.assertTrue(dry.layer_collection.children[LIQUID_COLLECTION].exclude)
        self.assertNotIn(self.plate.name, bpy.data.collections[LIQUID_COLLECTION].objects)
        self.assertFalse(report["physicalAbsorptionModel"])
        # Old generated heterogeneous material must not silently survive.
        bad = self.coffee.node_tree.nodes.new("ShaderNodeMath")
        bad.name = "CoffeeFloorComposite_Density_example"
        with self.assertRaisesRegex(RuntimeError, "heterogeneous"):
            self.configure()

    def test_64px_restores_occluded_white_and_rgba_transparency(self):
        self.configure()
        tree = self.scene.node_tree
        folder = Path(tempfile.mkdtemp(prefix="cofein-aov64-probe-"))
        files = tree.nodes.new("CompositorNodeOutputFile")
        files.base_path = str(folder)
        files.format.file_format = "OPEN_EXR"
        files.format.color_mode, files.format.color_depth = "RGBA", "32"
        files.file_slots.clear()
        sources = {"Beauty": tree.nodes[PREFIX + "Beauty"].outputs["Image"],
                   "Dry": tree.nodes[PREFIX + "DryScenery"].outputs["Image"],
                   "Final": tree.nodes[PREFIX + "PremultipliedRGBA"].outputs["Image"]}
        for name, socket in sources.items():
            files.file_slots.new(name)
            tree.links.new(socket, files.inputs[name])
        bpy.ops.render.render()
        pixels = {}
        for name in sources:
            image = bpy.data.images.load(str(folder / (name + "0001.exr")), check_existing=False)
            pixels[name] = list(image.pixels)
        def pixel(name, x, y):
            start = 4 * (64 * y + x)
            return pixels[name][start:start + 4]
        observed = {}
        for label, x in (("whiteCeramicBehindCoffee", 24), ("transparentBehindCoffee", 40)):
            final, dry, beauty = pixel("Final", x, 32), pixel("Dry", x, 32), pixel("Beauty", x, 32)
            observed[label] = dict(final=final, dry=dry, beauty=beauty)
            self.assertLess(max(abs(a-b) for a, b in zip(final, dry)), 2e-5)
            self.assertGreater(max(abs(a-b) for a, b in zip(beauty, dry)), .5)
        self.assertGreater(observed["whiteCeramicBehindCoffee"]["final"][3], .999)
        self.assertLess(observed["transparentBehindCoffee"]["final"][3], 1e-5)
        # Across the white covered interior there must be no alpha holes.
        self.assertGreater(min(pixel("Final", x, y)[3] for x in range(20, 28) for y in range(29, 35)), .999)
        report = {"resolution": [64, 64], "beautySamples": 2, "drySamples": 8,
                  "productionSceneRendered": False, "fixtureDirectory": str(folder),
                  "observedPixels": observed,
                  "occludedWhiteRestored": True, "premultipliedRGBAndAlphaRestored": True}
        Path(__file__).with_name("aov-composite-64px-probe.json").write_text(json.dumps(report, indent=2) + "\n")
        print("COFFEE_AOV_64PX_PROBE", json.dumps(report), flush=True)


if __name__ == "__main__":
    unittest.main(argv=[__file__])
