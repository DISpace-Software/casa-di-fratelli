"""Export only observed Mantaflow SPRAY landings; never synthesize trajectories.

Run in the actual baked scene; no separate spray-render setup is required:
  blender -b coffee-spray-render.blend -t 1 --python coffee_spray_impacts.py -- \
    --output spray-impacts.json --first 21 --last 120

Native particle indices are ephemeral. Consecutive world-space observations are
associated spatially using their observed finite-difference velocity. Prediction
is used ONLY for association, never for locating or inventing a landing. A
landing requires an observed segment across the floor, or disappearance directly
above actual cached floor liquid. Ambiguous tracks are discarded. Zero events is
valid, including when there is no native SPRAY cache. This does not bake/render.

The pure SprayTracker and select_impacts functions can be tested without Blender.
"""
import argparse
from collections import defaultdict
import json
import math
from pathlib import Path
import sys
import time


def _dist(a, b):
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def _xy(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def remap_observations(observations, sim_to_world=None):
    """Map native simulation-world observations once, before tracking.

    This is a rigid coordinate conversion of observed points, never a motion
    model. Native particle.location has already received the domain transform.
    """
    if sim_to_world is None:
        return [dict(p, world=tuple(p['world'])) for p in observations]
    matrix = [tuple(float(v) for v in row) for row in sim_to_world]
    if len(matrix) != 4 or any(len(row) != 4 for row in matrix):
        raise ValueError('Expected a 4×4 simulation-to-world matrix')
    if not all(math.isfinite(v) for row in matrix for v in row) or any(
            abs(a-b) > 1e-8 for a, b in zip(matrix[3], (0, 0, 0, 1))):
        raise ValueError('Expected a finite affine simulation-to-world matrix')
    result = []
    for particle in observations:
        point = (*particle['world'], 1.)
        world = tuple(sum(matrix[axis][j] * point[j] for j in range(4)) for axis in range(3))
        result.append(dict(particle, world=world))
    return result


class SprayTracker:
    """Conservative, order-independent, consecutive-frame observation tracker."""

    def __init__(self, fps, cell, floor_z=0., min_airborne_seconds=.08):
        if fps <= 0 or cell <= 0 or min_airborne_seconds <= 0:
            raise ValueError('fps, cell and minimum airborne duration must be positive')
        self.fps, self.cell, self.floor = fps, cell, floor_z
        self.min_airborne_seconds = min_airborne_seconds
        self.band = max(cell * .65, .0005)
        self.initial_gate = max(cell * 6, .060 * 24 / fps)
        self.known_gate = max(cell * 3, .012 * (24 / fps) ** 2)
        self.bucket_size = max(self.initial_gate, self.known_gate)
        self.active, self.events = [], []
        self.next_id, self.last_frame = 1, None
        self.ambiguous_links = self.rejected_ambiguous_events = 0
        self.floor_mesh_checks = 0

    def _airborne_enough(self, track):
        return (track['airborneFrames'] >= 3 and track['firstAirFrame'] is not None
                and (track['lastAirFrame'] - track['firstAirFrame']) / self.fps
                >= self.min_airborne_seconds - 1e-9)

    def _record(self, track, frame, point, method):
        if track['ambiguousLinks']:
            self.rejected_ambiguous_events += 1
            return
        diameter = track.get('diameter')
        # This is visual metadata, explicitly NOT measured mass or a condition
        # for physical contact. Unconfigured SPRAY has no meaningful radius.
        approximated = diameter is None
        diameter = diameter if diameter is not None else .002
        self.events.append({
            'id': f"physical-spray-{track['id']}", 'frame': frame,
            'world': [point[0], point[1], self.floor], 'secondary': True,
            'diameterEquivalentM': diameter,
            'visualVolumeApproxM3': math.pi / 6 * diameter ** 3,
            'sizeMetadata': {
                'basis': 'default 2 mm visual diameter' if approximated else 'render-only diameter from Blender particle.size, clamped to 1–3 mm',
                'physicalDiameterMeasured': False, 'physicalMassMeasured': False,
            },
            'observedAirborneFrames': track['airborneFrames'],
            'observedAirborneSeconds': (track['lastAirFrame'] - track['firstAirFrame']) / self.fps,
            'method': method, 'uncertainty': {'worldM': self.cell, 'frames': 1},
        })

    def step(self, frame, observations, floor_points=None):
        """Observations: [{world:[x,y,z], system:str, render_diameter_m:optional}].

        floor_points may be a lazy callable returning actual near-floor cached
        mesh vertices. It is consulted only for a disappeared low falling track.
        No particle index, native velocity, birth_time, or lifetime is trusted.
        """
        if self.last_frame is not None and frame != self.last_frame + 1:
            raise ValueError('SPRAY observations must be consecutive frames')
        self.last_frame = frame
        observations = sorted(observations, key=lambda p: (p.get('system', ''), *p['world']))
        for p in observations:
            if len(p['world']) != 3 or not all(math.isfinite(v) for v in p['world']):
                raise ValueError('Invalid observed world position')
            d = p.get('render_diameter_m')
            if d is not None and (not math.isfinite(d) or not 0 < d <= .01):
                raise ValueError('Invalid configured visual droplet diameter')
        buckets = defaultdict(list)
        def bucket(point):
            return tuple(math.floor(v / self.bucket_size) for v in point)
        for ci, point in enumerate(observations):
            buckets[(point.get('system', ''), *bucket(point['world']))].append(ci)
        pairs, by_track, by_candidate = [], defaultdict(list), defaultdict(list)
        for ti, track in enumerate(self.active):
            velocity = track['velocity']
            predicted = ([p + v / self.fps for p, v in zip(track['world'], velocity)]
                         if velocity is not None else track['world'])
            gate = self.known_gate if velocity is not None else self.initial_gate
            bx, by, bz = bucket(predicted)
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    for dz in (-1, 0, 1):
                        for ci in buckets.get((track['system'], bx + dx, by + dy, bz + dz), []):
                            distance = _dist(predicted, observations[ci]['world'])
                            if distance <= gate:
                                pairs.append((distance, ti, ci))
                                by_track[ti].append((distance, ci))
                                by_candidate[ci].append((distance, ti))
        used_t, used_c, next_active = set(), set(), []
        ambiguity = min(self.cell * .25, .001)
        for distance, ti, ci in sorted(pairs):
            if ti in used_t or ci in used_c:
                continue
            track, p = self.active[ti], observations[ci]
            used_t.add(ti)
            used_c.add(ci)
            ambiguous = (any(i != ci and d <= distance + ambiguity for d, i in by_track[ti])
                         or any(i != ti and d <= distance + ambiguity for d, i in by_candidate[ci]))
            if ambiguous:
                track['ambiguousLinks'] += 1
                self.ambiguous_links += 1
            point, previous = tuple(p['world']), track['world']
            velocity = tuple((v - old) * self.fps for v, old in zip(point, previous))
            crossed = previous[2] > self.floor >= point[2]
            if (crossed and point[2] >= self.floor - self.cell * 2
                    and track['velocity'] is not None and track['velocity'][2] < 0
                    and self._airborne_enough(track)):
                # Interpolate only between two ACTUALLY OBSERVED points bracketing
                # the plane, not an extrapolated ballistic path.
                alpha = (previous[2] - self.floor) / (previous[2] - point[2])
                contact = tuple(a + (b - a) * alpha for a, b in zip(previous, point))
                self._record(track, frame, contact, 'observed-spray-segment-crossed-floor')
                continue
            track.update(world=point, velocity=velocity, frame=frame,
                         diameter=p.get('render_diameter_m'))
            if point[2] > self.floor + self.band:
                track['nearFloorFrames'] = 0
                track['airborneFrames'] += 1
                if track['firstAirFrame'] is None:
                    track['firstAirFrame'] = frame
                track['lastAirFrame'] = frame
            else:
                track['nearFloorFrames'] += 1
                if track['nearFloorFrames'] >= 3:
                    # A particle that has settled must earn a fresh airborne
                    # history before later floor jitter can count as a fall.
                    track.update(airborneFrames=0, firstAirFrame=None, lastAirFrame=None)
            next_active.append(track)

        # Missing particles are NOT extrapolated toward the floor. The last
        # observation must already be within one voxel of it. A real nearby
        # floor mesh in this next frame must confirm a possible merger.
        disappeared = [t for ti, t in enumerate(self.active) if ti not in used_t
                       and t['velocity'] is not None and t['velocity'][2] < -.005
                       and self._airborne_enough(t)
                       and self.floor - self.cell <= t['world'][2] <= self.floor + self.band]
        if disappeared and floor_points is not None:
            self.floor_mesh_checks += 1
            points = list(floor_points() if callable(floor_points) else floor_points)
            for track in disappeared:
                nearby = [tuple(p) for p in points
                          if self.floor - self.cell <= p[2] <= self.floor + self.band
                          and _xy(p, track['world']) <= self.cell * 1.5]
                if nearby:
                    # Actual nearby vertices determine the patch, never a
                    # synthetic projected landing. Keep localization local.
                    nearby.sort(key=lambda p: _xy(p, track['world']))
                    near = nearby[:3]
                    contact = tuple(sum(p[a] for p in near) / len(near) for a in range(3))
                    self._record(track, frame, contact, 'observed-spray-disappeared-into-cached-floor-liquid')
        for ci, p in enumerate(observations):
            if ci in used_c:
                continue
            point = tuple(p['world'])
            airborne = point[2] > self.floor + self.band
            next_active.append({'id': self.next_id, 'system': p.get('system', ''),
                                'world': point, 'velocity': None, 'frame': frame,
                                'firstAirFrame': frame if airborne else None,
                                'lastAirFrame': frame if airborne else None,
                                'airborneFrames': int(airborne), 'ambiguousLinks': 0,
                                'nearFloorFrames': 0 if airborne else 1,
                                'diameter': p.get('render_diameter_m')})
            self.next_id += 1
        self.active = next_active


def select_impacts(events, first, last, cell, project, max_impacts=12):
    """Project and retain distinct *observed* sites, without filling a quota."""
    if not 1 <= max_impacts <= 12 or last <= first:
        raise ValueError('Need an event cap from 1 to 12 and a nonempty frame interval')
    candidates, discarded = [], []
    for raw in sorted(events, key=lambda e: (e['frame'], e['id'])):
        if not first <= raw['frame'] <= last:
            continue
        event = dict(raw)
        u, v, depth = project(event['world'], event['frame'])
        event.update(imageX=u, imageY=v, cameraDepth=depth,
                     at=(event['frame'] - first) / (last - first))
        if not depth > 0 or not 0 <= u <= 1 or not 0 <= v <= 1:
            discarded.append({'id': event['id'], 'reason': 'outside-delivery-camera'})
        elif any(_xy(event['world'], old['world']) < max(cell * 2, .003) for old in candidates):
            discarded.append({'id': event['id'], 'reason': 'same-observed-landing-footprint'})
        else:
            candidates.append(event)
    # First landing, then spatial coverage among actual distinct sites. Do not
    # prefer a nominal large radius because these radii are only render sizes.
    chosen = candidates[:1]
    pending = candidates[1:]
    while pending and len(chosen) < max_impacts:
        best = max(pending, key=lambda e: min(_xy(e['world'], old['world']) for old in chosen))
        chosen.append(best)
        pending.remove(best)
    discarded.extend({'id': event['id'], 'reason': 'observed-event-cap'} for event in pending)
    return sorted(chosen, key=lambda e: (e['frame'], e['id'])), discarded


def export_spray_impacts(output, first=21, last=None, max_impacts=12,
                         camera_name=None, camera_blend=None, floor_z=0.,
                         min_airborne_seconds=.08, max_particles=1500):
    import bpy
    from bpy_extras.object_utils import world_to_camera_view
    from mathutils import Vector
    # Reuse the primary exporter's actual mesh/floor classification read-only.
    from coffee_liquid_impacts import mesh_components

    def spray_systems(obj):
        # Native SPRAY only; combined FOAM/BUBBLE systems are not airborne drops.
        return [system for system in obj.particle_systems if system.settings.type == 'SPRAY']

    scene, started = bpy.context.scene, time.monotonic()
    last = scene.frame_end if last is None else last
    if first < 2 or last <= first or not 1 <= max_impacts <= 12 or max_particles < 1:
        raise ValueError('Invalid frame interval, event cap or particle guard')
    domain, cup = bpy.data.objects.get('CoffeeDomain'), bpy.data.objects.get('CupBody')
    if domain is None or cup is None:
        raise RuntimeError('CoffeeDomain and CupBody are required')
    if camera_blend:
        with bpy.data.libraries.load(str(Path(camera_blend).resolve()), link=False) as (source, target):
            name = camera_name or 'ProductCamera'
            if name not in source.objects:
                raise RuntimeError(f'Camera {name} is absent from {camera_blend}')
            target.objects = [name]
        camera = target.objects[0]
        scene.collection.objects.link(camera)
    else:
        camera = bpy.data.objects.get(camera_name) if camera_name else scene.camera
    if camera is None or camera.type != 'CAMERA':
        raise RuntimeError('A delivery camera is required')
    setup = json.loads(scene['cofein_liquid_setup'])
    cup_frame_motion = None
    if scene.get('cofein_cup_frame'):
        from coffee_cup_frame import CupFrameMotion
        cup_frame_motion = CupFrameMotion.from_scene(scene)
    cell = float(setup['cell_size_m'])
    profile = cup['liquid_interior_profile']
    profile = json.loads(profile) if isinstance(profile, str) else list(profile)
    fps = scene.render.fps / scene.render.fps_base
    tracker = SprayTracker(fps, cell, floor_z, min_airborne_seconds)
    frames, floor_errors = [], []
    original_frame = scene.frame_current
    native_system_names = [s.name for s in spray_systems(domain)]
    try:
        if native_system_names:
            for frame in range(first - 1, last + 1):
                scene.frame_set(frame)
                bpy.context.view_layer.update()
                world_transform = cup_frame_motion.sim_to_world_matrix(frame) if cup_frame_motion else None
                evaluated = domain.evaluated_get(bpy.context.evaluated_depsgraph_get())
                observed = []
                for system in spray_systems(evaluated):
                    for particle in system.particles:
                        if particle.alive_state == 'ALIVE':
                            # Native fluid particle import already applies the
                            # domain transform. Applying it again is incorrect.
                            native_size = float(particle.size)
                            if not math.isfinite(native_size) or native_size <= 0:
                                raise RuntimeError(f'Frame {frame}: invalid native SPRAY visual size')
                            observed.append({'world': tuple(particle.location), 'system': system.name,
                                             'render_diameter_m': min(.003, max(.001, native_size))})
                observed = remap_observations(observed, world_transform)
                if len(observed) > max_particles:
                    raise RuntimeError(f'Frame {frame}: {len(observed)} live SPRAY points exceed '
                                       f'guard {max_particles}; refusing silently truncated tracking')
                def floor_points():
                    try:
                        return mesh_components(domain, cup, profile, cell, floor_z,
                                               world_transform=world_transform)[1]
                    except RuntimeError as error:
                        floor_errors.append({'frame': frame, 'reason': str(error)})
                        return []  # Missing mesh is never merger evidence.
                tracker.step(frame, observed, floor_points)
                frames.append({'frame': frame, 'liveSprayParticles': len(observed)})
        def project(point, frame):
            # Projection is done at the actual observation frame, including a
            # camera with animation. No viewport clamping or invented padding.
            scene.frame_set(frame)
            bpy.context.view_layer.update()
            uv = world_to_camera_view(scene, camera, Vector(point))
            return float(uv.x), float(1 - uv.y), float(uv.z)
        selected, discarded = select_impacts(tracker.events, first, last, cell, project, max_impacts)
    finally:
        scene.frame_set(original_frame)
        bpy.context.view_layer.update()
    peak = max((f['liveSprayParticles'] for f in frames), default=0)
    report = {
        'blender': bpy.app.version_string, 'blend': bpy.data.filepath,
        'camera': camera.name, 'cameraBlend': str(Path(camera_blend).resolve()) if camera_blend else bpy.data.filepath,
        'frameRange': {'first': first, 'last': last, 'fps': fps, 'settlingExcluded': first - 1},
        'coordinateConvention': 'imageX/imageY normalized, top-left origin; world metres, Z up; at=(frame-first)/(last-first)',
        'cupFrameRemap': {
            'applied': bool(cup_frame_motion),
            'mapping': 'CupRig_world(frame) @ inverse(CupRig_world(reference))' if cup_frame_motion else None,
            'nativeParticleDomainTransformAppliedAgain': False,
            'trackingCoordinateSpace': 'original world after exact rigid remap',
            'physicalEquivalence': False if cup_frame_motion else None,
            'note': 'Actual solver observations remapped before tracking; rotating-frame simulation omits Coriolis, Euler and centrifugal forces.' if cup_frame_motion else 'Native world cache; no remap.',
        },
        'floorZ': floor_z, 'cellSizeM': cell, 'nativeSpraySystems': native_system_names,
        'realSprayCacheObserved': peak > 0,
        'status': 'observed-cache' if peak else 'no-observed-spray-cache',
        'minimumObservedAirborneSeconds': min_airborne_seconds,
        'minimumObservedAirborneSamples': 3, 'observedTracks': tracker.next_id - 1,
        'observedLandings': len(tracker.events), 'impacts': selected, 'discarded': discarded,
        'quality': {'frames': frames, 'peakLiveSprayParticles': peak,
                    'ambiguousAssociationLinks': tracker.ambiguous_links,
                    'rejectedAmbiguousLandings': tracker.rejected_ambiguous_events,
                    'actualFloorMeshChecks': tracker.floor_mesh_checks,
                    'floorMeshUnavailable': floor_errors,
                    'sizeInterpretation': 'Diameter and visualVolumeApproxM3 are render approximations, not solver-measured mass/volume. volumeM3 is deliberately absent.',
                    'trackingInterpretation': 'No particle index identity or ballistic landing extrapolation. Ambiguous or unconfirmed contacts are omitted. Zero events is valid.'},
        'elapsedSeconds': time.monotonic() - started,
    }
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + '\n')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True)
    parser.add_argument('--first', type=int, default=21)
    parser.add_argument('--last', type=int)
    parser.add_argument('--max-impacts', type=int, default=12)
    parser.add_argument('--camera')
    parser.add_argument('--camera-blend')
    parser.add_argument('--floor-z', type=float, default=0.)
    parser.add_argument('--min-airborne-seconds', type=float, default=.08)
    parser.add_argument('--max-particles', type=int, default=1500)
    options = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else None)
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    report = export_spray_impacts(options.output, options.first, options.last, options.max_impacts,
                                 options.camera, options.camera_blend, options.floor_z,
                                 options.min_airborne_seconds, options.max_particles)
    print('COFFEE_SPRAY_IMPACTS', json.dumps({'path': options.output, 'count': len(report['impacts']),
          'status': report['status'], 'elapsedSeconds': report['elapsedSeconds']}), flush=True)


if __name__ == '__main__':
    main()
