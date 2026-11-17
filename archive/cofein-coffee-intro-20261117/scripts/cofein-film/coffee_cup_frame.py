"""Approximate liquid solve in the cup's stationary reference coordinate frame.

This module does not bake, render, save a .blend, or invent liquid/contacts.
Plan before configure_liquid so collider thickness and source inset use the
final grid cell size. The cup is fixed at its reference WORLD pose, not moved
to the origin. All native liquid mesh/particle positions are simulation-world
coordinates. Apply sim_to_world_matrix exactly once before rendering/tracking.

Gravity includes translational acceleration: F.rotation @ (g - c_ddot).
Coriolis, Euler and centrifugal forces are deliberately OMITTED. This is a
quasi-static approximation, not an equivalent rotating-frame Navier-Stokes
solve. World remapping is geometrically exact at sampled poses; between
quarter-frame samples positions interpolate linearly and rotations slerp.
Native Mantaflow particle.velocity units are not converted by this module.
"""

from bisect import bisect_left
from contextlib import contextmanager
import json
import math

from mathutils import Matrix, Quaternion, Vector


METADATA_KEY = 'cofein_cup_frame'
VERSION = 1


def _set_frame(scene, frame):
    whole = math.floor(frame)
    scene.frame_set(whole, subframe=frame - whole)


@contextmanager
def _without_fluid_evaluation(scene):
    """Sampling transforms must never accidentally run a replay simulation."""
    saved = [(m, m.show_viewport) for o in scene.objects for m in o.modifiers
             if m.type == 'FLUID']
    try:
        for modifier, _ in saved:
            modifier.show_viewport = False
        yield
    finally:
        for modifier, enabled in saved:
            modifier.show_viewport = enabled


def _rigid_parts(matrix):
    location, rotation, scale = matrix.decompose()
    if max(abs(v - 1) for v in scale) > 1e-5 or matrix.to_3x3().determinant() < 0:
        raise ValueError('Cup-frame transforms must be rigid, with applied unit scale')
    return location, rotation.normalized()


def _rotation_vector(quaternion):
    q = quaternion.normalized()
    if q.w < 0:
        q.negate()
    vector = Vector((q.x, q.y, q.z))
    length = vector.length
    return vector * (2 * math.atan2(length, q.w) / length) if length > 1e-14 else vector * 2


class CupFrameMotion:
    def __init__(self, poses, fps, gravity=(0, 0, -9.81), frame_start=1,
                 frame_end=120, sample_step=.25, source=None):
        self.poses = poses
        self.frames = [float(p['frame']) for p in poses]
        self.fps = float(fps)
        self.gravity = Vector(gravity)
        self.frame_start, self.frame_end = float(frame_start), float(frame_end)
        self.sample_step = float(sample_step)
        self.source = source
        if self.fps <= 0 or not 0 < self.sample_step <= .25:
            raise ValueError('Positive fps and sampling at least every quarter frame are required')
        if len(poses) < 3 or any(b <= a for a, b in zip(self.frames, self.frames[1:])):
            raise ValueError('Pose samples must be strictly increasing')
        if self.frames[0] > self.frame_start-self.sample_step or self.frames[-1] < self.frame_end+self.sample_step:
            raise ValueError('Include one sample before and after the solve range for derivatives')
        self.reference = self.matrix(self.frame_start)
        self.reference_inverse = self.reference.inverted()

    def _parts(self, frame):
        frame = float(frame)
        if frame < self.frames[0]-1e-8 or frame > self.frames[-1]+1e-8:
            raise ValueError(f'Frame {frame} outside recorded cup motion')
        index = bisect_left(self.frames, frame)
        if index == len(self.frames):
            index -= 1
        if index == 0 or abs(self.frames[index]-frame) < 1e-8:
            row = self.poses[index]
            return Vector(row['position']), Quaternion(row['quaternion'])
        a, b = self.poses[index-1], self.poses[index]
        t = (frame-a['frame'])/(b['frame']-a['frame'])
        return (Vector(a['position']).lerp(Vector(b['position']), t),
                Quaternion(a['quaternion']).slerp(Quaternion(b['quaternion']), t))

    def matrix(self, frame):
        position, rotation = self._parts(frame)
        return Matrix.LocRotScale(position, rotation, Vector((1, 1, 1)))

    def world_to_sim_matrix(self, frame):
        return self.reference @ self.matrix(frame).inverted()

    def sim_to_world_matrix(self, frame):
        return self.matrix(frame) @ self.reference_inverse

    def point_to_world(self, frame, point):
        return self.sim_to_world_matrix(frame) @ Vector(point)

    def point_to_sim(self, frame, point):
        return self.world_to_sim_matrix(frame) @ Vector(point)

    def mesh_to_world_matrix(self, frame, simulation_object_world_matrix):
        """Mesh vertices are object-local; particles are already sim-world."""
        return self.sim_to_world_matrix(frame) @ simulation_object_world_matrix

    def kinematics(self, frame):
        h = self.sample_step
        dt = h/self.fps
        before, q_before = self._parts(frame-h)
        position, _ = self._parts(frame)
        after, q_after = self._parts(frame+h)
        return {
            'position': position,
            'velocity': (after-before)/(2*dt),
            'acceleration': (after-2*position+before)/(dt*dt),
            'omega': _rotation_vector(q_after @ q_before.conjugated())/(2*dt),
        }

    def gravity_at(self, frame):
        return self.world_to_sim_matrix(frame).to_quaternion() @ (
            self.gravity-self.kinematics(frame)['acceleration'])

    def velocity_to_world(self, frame, point, velocity):
        """Accept ONLY a known SI sim-world velocity, never native Manta data.

        Contact/spray export should normally difference already remapped world
        positions, preserving the exporter's established cache-time units.
        """
        state = self.kinematics(frame)
        rotation = self.sim_to_world_matrix(frame).to_quaternion()
        arm = self.point_to_world(frame, point)-state['position']
        return rotation @ Vector(velocity)+state['velocity']+state['omega'].cross(arm)

    def sample_frames(self):
        return [f for f in self.frames if self.frame_start <= f <= self.frame_end]

    def simulation_bounds(self, world_min, world_max, padding=.008):
        """Sweep a FINITE world ROI; never use an infinite/oversized floor."""
        low, high = Vector(world_min), Vector(world_max)
        if padding < 0 or any(high[i] <= low[i] for i in range(3)):
            raise ValueError('Finite increasing ROI bounds and nonnegative padding required')
        corners = [Vector((x, y, z)) for x in (low.x, high.x)
                   for y in (low.y, high.y) for z in (low.z, high.z)]
        minimum, maximum = Vector((math.inf,)*3), Vector((-math.inf,)*3)
        for frame in self.sample_frames():
            transform = self.world_to_sim_matrix(frame)
            for corner in corners:
                point = transform @ corner
                for i in range(3):
                    minimum[i] = min(minimum[i], point[i]-padding)
                    maximum[i] = max(maximum[i], point[i]+padding)
        return tuple(minimum), tuple(maximum)

    def to_dict(self):
        return {'version': VERSION, 'fps': self.fps, 'gravity': list(self.gravity),
                'frame_start': self.frame_start, 'frame_end': self.frame_end,
                'sample_step': self.sample_step, 'source': self.source, 'poses': self.poses,
                'coordinate_space': 'simulation-world, cup fixed at reference world pose',
                'world_remap': 'CupRig_world(frame) @ inverse(CupRig_world(reference))',
                'gravity_model': 'rotation(world_to_sim) @ (world_gravity - cup_origin_acceleration)',
                'omitted_forces': ['Coriolis', 'Euler', 'centrifugal'],
                'physical_equivalence': False,
                'interpolation': 'linear position, quaternion slerp between recorded poses',
                'native_particle_velocity_units': 'not assumed or converted'}

    @classmethod
    def from_dict(cls, data):
        if data.get('version') != VERSION:
            raise ValueError('Unsupported cup-frame metadata version')
        return cls(**{key: data[key] for key in ('poses', 'fps', 'gravity', 'frame_start',
                                                 'frame_end', 'sample_step', 'source')})

    @classmethod
    def from_scene(cls, scene):
        raw = scene.get(METADATA_KEY)
        if not raw:
            raise ValueError('Scene has no explicit cup-frame provenance')
        return cls.from_dict(json.loads(raw) if isinstance(raw, str) else dict(raw))


def sample_cup_motion(scene, frame_start=1, frame_end=120, sample_step=.25):
    import bpy
    if not 0 < sample_step <= .25 or frame_end <= frame_start:
        raise ValueError('Increasing frame range and sample_step in (0,.25] required')
    if abs((frame_end-frame_start)/sample_step-round((frame_end-frame_start)/sample_step)) > 1e-6:
        raise ValueError('Frame range must be divisible by sample_step')
    rig = scene.objects.get('CupRig')
    if rig is None:
        raise ValueError('CupRig is required')
    if abs(scene.unit_settings.scale_length-1) > 1e-6:
        raise ValueError('Cup-frame helper requires metre-scale scene units')
    saved_frame = scene.frame_current+scene.frame_subframe
    poses = []
    previous = None
    with _without_fluid_evaluation(scene):
        try:
            count = round((frame_end-frame_start)/sample_step)
            for index in range(-1, count+2):
                frame = frame_start+index*sample_step
                _set_frame(scene, frame)
                matrix = rig.evaluated_get(bpy.context.evaluated_depsgraph_get()).matrix_world
                position, rotation = _rigid_parts(matrix)
                if previous is not None and previous.dot(rotation) < 0:
                    rotation.negate()
                previous = rotation.copy()
                poses.append({'frame': frame, 'position': list(position), 'quaternion': list(rotation)})
        finally:
            _set_frame(scene, saved_frame)
    return CupFrameMotion(poses, scene.render.fps/scene.render.fps_base,
                          tuple(scene.gravity), frame_start, frame_end, sample_step,
                          bpy.data.filepath)


def plan_cup_frame(scene, world_min, world_max, frame_end=120, sample_step=.25,
                   frame_start=1, padding=.008):
    motion = sample_cup_motion(scene, frame_start, frame_end, sample_step)
    low, high = motion.simulation_bounds(world_min, world_max, padding)
    return motion, {'sim_min': low, 'sim_max': high, 'world_min': tuple(world_min),
                    'world_max': tuple(world_max), 'padding_m': padding,
                    'planning_frames': [frame_start, frame_end], 'sample_step': sample_step}


def _linear_curves(owner, paths):
    animation = owner.animation_data
    if animation and animation.action:
        for curve in animation.action.fcurves:
            if curve.data_path in paths:
                for key in curve.keyframe_points:
                    key.interpolation = 'LINEAR'


def _detach(obj):
    obj.animation_data_clear()
    for constraint in obj.constraints:
        constraint.mute = True
    obj.parent = None
    obj.matrix_parent_inverse = Matrix.Identity(4)


def _key_matrix(obj, matrix, frame, previous=None):
    position, rotation = _rigid_parts(matrix)
    if previous is not None and previous.dot(rotation) < 0:
        rotation.negate()
    obj.location, obj.rotation_mode, obj.rotation_quaternion = position, 'QUATERNION', rotation
    obj.scale = (1, 1, 1)
    obj.keyframe_insert('location', frame=frame)
    obj.keyframe_insert('rotation_quaternion', frame=frame)
    return rotation.copy()


def _bound_floor_to_world_roi(floor, world_bounds, guard=.02):
    """Keep the original closed floor thickness and top, change only its XY."""
    if len(floor.data.vertices) != 8 or floor.parent is not None:
        raise ValueError('Expected the base setup closed eight-vertex floor box')
    points = [floor.matrix_world @ vertex.co for vertex in floor.data.vertices]
    low = [min(p[i] for p in points) for i in range(3)]
    high = [max(p[i] for p in points) for i in range(3)]
    center = (Vector(low)+Vector(high))/2
    new_low = Vector((world_bounds[0][0]-guard, world_bounds[0][1]-guard, low[2]))
    new_high = Vector((world_bounds[1][0]+guard, world_bounds[1][1]+guard, high[2]))
    new_center = (new_low+new_high)/2
    for vertex, point in zip(floor.data.vertices, points):
        vertex.co = Vector(tuple(new_low[i] if point[i] < center[i] else new_high[i]
                                 for i in range(3)))-new_center
    floor.matrix_world = Matrix.Translation(new_center)
    floor.data.update()
    return [list(new_low), list(new_high)]


def configure_cup_frame(scene, domain, motion, world_bounds=None, resize_domain=False):
    """Configure an UNBAKED base liquid scene; do not resize its chosen grid.

    Domain bounds MUST already come from planning. Base configure_liquid must
    see those final bounds when selecting its wall thickness and source inset.
    All baked output retains explicit scene provenance for world remapping.
    """
    import bpy
    if resize_domain:
        raise ValueError('Plan simulation_bounds before configure_liquid; resizing now invalidates cell geometry')
    if scene.get(METADATA_KEY):
        raise ValueError('Refusing to apply cup-frame coordinates twice')
    settings = next((m.domain_settings for m in domain.modifiers
                     if m.type == 'FLUID' and m.fluid_type == 'DOMAIN'), None)
    if settings is None or settings.cache_type != 'MODULAR':
        raise ValueError('Expected an unbaked MODULAR liquid domain')
    if settings.has_cache_baked_data or settings.has_cache_baked_mesh:
        raise ValueError('Refusing to change coordinates of an existing fluid cache')
    rig = scene.objects.get('CupRig')
    colliders = [scene.objects.get(name) for name in
                 ('CoffeePhysicsFloorCollider', 'CoffeePhysicsSaucerCollider')]
    if rig is None or any(obj is None for obj in colliders):
        raise ValueError('Base cup/floor/saucer setup is incomplete')
    frames = motion.sample_frames()
    snapshots = {obj.name: [] for obj in colliders}
    with _without_fluid_evaluation(scene):
        _set_frame(scene, motion.frame_start)
        floor_bounds = _bound_floor_to_world_roi(colliders[0], world_bounds) if world_bounds else None
        for frame in frames:
            _set_frame(scene, frame)
            graph = bpy.context.evaluated_depsgraph_get()
            transform = motion.world_to_sim_matrix(frame)
            for obj in colliders:
                snapshots[obj.name].append(transform @ obj.evaluated_get(graph).matrix_world)
        _detach(rig)
        rig.matrix_world = motion.reference
        for obj in colliders:
            _detach(obj)
            previous = None
            for frame, matrix in zip(frames, snapshots[obj.name]):
                previous = _key_matrix(obj, matrix, frame, previous)
            _linear_curves(obj, {'location', 'rotation_quaternion'})
            for modifier in obj.modifiers:
                if modifier.type == 'FLUID' and modifier.fluid_type == 'EFFECTOR':
                    modifier.effector_settings.subframes = max(2, modifier.effector_settings.subframes)
        scene.use_gravity = True
        for frame in frames:
            scene.gravity = motion.gravity_at(frame)
            scene.keyframe_insert('gravity', frame=frame)
        _linear_curves(scene, {'gravity'})
        for side in ('front', 'back', 'left', 'right', 'top', 'bottom'):
            setattr(settings, 'use_collision_border_'+side, False)
        settings.effector_weights.gravity = 1
        metadata = motion.to_dict()
        metadata['world_roi'] = [list(v) for v in world_bounds] if world_bounds else None
        metadata['floor_world_bounds'] = floor_bounds
        scene[METADATA_KEY] = json.dumps(metadata)
        _set_frame(scene, motion.frame_start)
    bpy.context.view_layer.update()
    return {'version': VERSION, 'reference_frame': motion.frame_start,
            'motion_frames': [motion.frame_start, motion.frame_end],
            'samples': len(frames), 'sample_step': motion.sample_step,
            'gravity_updates': 'keyframed each quarter frame; Blender Mantaflow samples once per animation frame',
            'fixed_rig': rig.name, 'transformed_colliders': [o.name for o in colliders],
            'domain_resized': False, 'floor_world_bounds': floor_bounds,
            'omitted_forces': metadata['omitted_forces'], 'physical_equivalence': False,
            'metadata_key': METADATA_KEY}
