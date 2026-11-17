"""Light Blender tests: synthetic geometry/transforms only, no bake/render/save.

blender --background --factory-startup --threads 1 --python test_coffee_cup_frame.py
"""
import json
import math
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy
from mathutils import Matrix, Quaternion, Vector
from coffee_cup_frame import (CupFrameMotion, METADATA_KEY, configure_cup_frame,
                              plan_cup_frame)


def synthetic_motion():
    poses = []
    for i in range(-1, 34):
        f = 1+i*.25
        t = (f-1)/24
        poses.append({'frame': f, 'position': [.1+.2*t+.5*.4*t*t, -.03, .02],
                      'quaternion': list(Quaternion((0, 1, 0), .3+.8*t))})
    return CupFrameMotion(poses, 24, frame_end=9)


class MotionMathTests(unittest.TestCase):
    def setUp(self):
        self.motion = synthetic_motion()

    def assertVector(self, a, b, tolerance=2e-6):
        self.assertLess((Vector(a)-Vector(b)).length, tolerance)

    def test_reference_map_identity_even_with_nonzero_initial_pose(self):
        point = (.03, .04, .06)
        self.assertVector(self.motion.point_to_world(1, point), point)

    def test_points_roundtrip_and_cup_point_stays_fixed(self):
        for f in (1, 2.25, 5, 9):
            original = Vector((.03, .04, .06))
            self.assertVector(self.motion.point_to_sim(f, self.motion.point_to_world(f, original)), original)
            local = Vector((.02, 0, .04))
            moving_world = self.motion.matrix(f) @ local
            self.assertVector(self.motion.point_to_sim(f, moving_world), self.motion.reference @ local)

    def test_acceleration_and_rotating_gravity_include_translation(self):
        state = self.motion.kinematics(4)
        self.assertVector(state['acceleration'], (.4, 0, 0), 2e-4)
        self.assertVector(state['omega'], (0, .8, 0), 2e-5)
        expected = self.motion.world_to_sim_matrix(4).to_quaternion() @ Vector((-.4, 0, -9.81))
        self.assertVector(self.motion.gravity_at(4), expected, 2e-4)

    def test_world_velocity_includes_rigid_motion(self):
        f, h = 4., .25
        point = Vector((.14, .02, .06))
        numerical = (self.motion.point_to_world(f+h, point)-self.motion.point_to_world(f-h, point))/(2*h/24)
        self.assertVector(self.motion.velocity_to_world(f, point, (0, 0, 0)), numerical, 2e-5)

    def test_mesh_local_matrix_and_native_world_particle_agree(self):
        transform = Matrix.Translation((.03, -.01, .05))
        vertex = Vector((.04, .02, -.01))
        self.assertVector(self.motion.mesh_to_world_matrix(5, transform) @ vertex,
                          self.motion.point_to_world(5, transform @ vertex))

    def test_bounds_contain_all_transformed_roi_corners(self):
        low, high = (-.1, -.1, -.02), (.2, .1, .15)
        minimum, maximum = self.motion.simulation_bounds(low, high)
        for f in self.motion.sample_frames():
            for x in (low[0], high[0]):
                for y in (low[1], high[1]):
                    for z in (low[2], high[2]):
                        p = self.motion.point_to_sim(f, (x, y, z))
                        for axis in range(3):
                            self.assertGreaterEqual(p[axis], minimum[axis])
                            self.assertLessEqual(p[axis], maximum[axis])

    def test_serialization_preserves_pose_samples_and_provenance(self):
        data = json.loads(json.dumps(self.motion.to_dict()))
        other = CupFrameMotion.from_dict(data)
        self.assertEqual(data['omitted_forces'], ['Coriolis', 'Euler', 'centrifugal'])
        self.assertFalse(data['physical_equivalence'])
        for f in (1, 4, 8):
            self.assertEqual(list(other.matrix(f)), list(self.motion.matrix(f)))
        with self.assertRaises(ValueError):
            other.matrix(20)


class BlenderSetupTests(unittest.TestCase):
    def test_configure_preserves_cup_and_world_obstacle_correspondence(self):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        scene = bpy.context.scene
        scene.render.fps = 24
        scene.unit_settings.scale_length = 1
        scene.gravity = (0, 0, -9.81)
        rig = bpy.data.objects.new('CupRig', None)
        scene.collection.objects.link(rig)
        for frame, x, angle in ((1, .01, .1), (3, .02, .3), (5, .04, .6)):
            rig.location = (x, 0, .02)
            rig.rotation_euler = (0, angle, 0)
            rig.keyframe_insert('location', frame=frame)
            rig.keyframe_insert('rotation_euler', frame=frame)

        def cube(name, location, scale):
            bpy.ops.mesh.primitive_cube_add(size=1, location=location)
            obj = bpy.context.object
            obj.name = name
            for vertex in obj.data.vertices:
                vertex.co = Vector(tuple(vertex.co[i]*scale[i] for i in range(3)))
            return obj

        cup = cube('CupBody', (0, 0, 0), (.05, .05, .06))
        cup.parent = rig
        floor = cube('CoffeePhysicsFloorCollider', (0, 0, -.01), (.6, .6, .02))
        saucer = cube('CoffeePhysicsSaucerCollider', (0, 0, .005), (.15, .15, .01))
        saucer.location.x = -.02
        saucer.keyframe_insert('location', frame=1)
        saucer.location.x = .01
        saucer.keyframe_insert('location', frame=5)
        for obj in (floor, saucer):
            mod = obj.modifiers.new('Collider', 'FLUID')
            mod.fluid_type = 'EFFECTOR'
        scene.frame_set(1)
        domain = cube('CoffeeDomain', (0, 0, .08), (.4, .4, .4))
        mod = domain.modifiers.new('Fluid', 'FLUID')
        mod.fluid_type = 'DOMAIN'
        bpy.context.view_layer.update()
        settings = mod.domain_settings
        settings.domain_type = 'LIQUID'
        settings.cache_type = 'MODULAR'
        settings.cache_frame_end = 5
        settings.resolution_max = 8
        original_domain = domain.matrix_world.copy()
        world_low, world_high = (-.12, -.1, -.02), (.12, .1, .16)
        motion, planning = plan_cup_frame(scene, world_low, world_high, frame_end=5)
        self.assertGreater(planning['sim_max'][2], planning['sim_min'][2])
        original_saucer = {}
        for frame in (1, 2, 3, 4, 5):
            scene.frame_set(frame)
            original_saucer[frame] = saucer.matrix_world.copy()
        result = configure_cup_frame(scene, domain, motion, (world_low, world_high))
        restored = CupFrameMotion.from_scene(scene)
        self.assertFalse(result['domain_resized'])
        self.assertEqual(list(domain.matrix_world), list(original_domain))
        self.assertFalse(settings.use_collision_border_bottom)
        self.assertEqual(settings.effector_weights.gravity, 1)
        for frame in (1, 2, 3, 4, 5):
            scene.frame_set(frame)
            self.assertLess((rig.matrix_world.translation-motion.reference.translation).length, 1e-7)
            self.assertLess(rig.matrix_world.to_quaternion().rotation_difference(
                motion.reference.to_quaternion()).angle, 1e-5)
            remap = restored.sim_to_world_matrix(frame) @ saucer.matrix_world
            for a, b in zip(remap, original_saucer[frame]):
                self.assertLess((a-b).length, 2e-6)
            self.assertLess((scene.gravity-motion.gravity_at(frame)).length, 1e-5)
        with self.assertRaises(ValueError):
            configure_cup_frame(scene, domain, motion)
        self.assertTrue(scene.get(METADATA_KEY))


suite = unittest.defaultTestLoader.loadTestsFromModule(sys.modules[__name__])
result = unittest.TextTestRunner(verbosity=2).run(suite)
if not result.wasSuccessful():
    raise SystemExit(1)
