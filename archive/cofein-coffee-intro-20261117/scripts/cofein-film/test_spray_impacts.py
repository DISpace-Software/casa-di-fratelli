"""Pure observation fixtures, not a claim that a production SPRAY bake exists."""
import math
import unittest
from coffee_spray_impacts import SprayTracker, select_impacts, remap_observations


def particle(x, z, y=0, index=0, diameter=None):
    return {'world': (x, y, z), 'system': 'Spray', 'cache_index_this_frame': index,
            'render_diameter_m': diameter}


class SprayObservationTests(unittest.TestCase):
    def tracker(self):
        return SprayTracker(24, .004)

    def crossing(self, x=0):
        tracker = self.tracker()
        for frame, z in enumerate((.060, .040, .020, -.002), 20):
            tracker.step(frame, [particle(x, z)])
        return tracker

    def test_observed_crossing_uses_segment_intersection(self):
        tracker = self.tracker()
        for i, z in enumerate((.060, .040, .020, -.002)):
            tracker.step(20 + i, [particle(.004 * i, z, diameter=.0018)])
        self.assertEqual(len(tracker.events), 1)
        event = tracker.events[0]
        self.assertAlmostEqual(event['world'][0], .008 + .004 * .020 / .022)
        self.assertEqual(event['world'][2], 0)
        self.assertTrue(event['secondary'])
        self.assertEqual(event['observedAirborneFrames'], 3)
        self.assertAlmostEqual(event['observedAirborneSeconds'], 2 / 24)
        self.assertAlmostEqual(event['visualVolumeApproxM3'], math.pi / 6 * .0018 ** 3)
        self.assertNotIn('volumeM3', event)
        self.assertFalse(event['sizeMetadata']['physicalMassMeasured'])

    def test_permuted_cache_order_and_indices_have_same_tracks(self):
        regular, shuffled = self.tracker(), self.tracker()
        for i, z in enumerate((.060, .040, .020, -.002)):
            a, b = particle(-.08 + .002*i, z, index=i), particle(.08 - .002*i, z, index=90-i)
            regular.step(20 + i, [a, b])
            shuffled.step(20 + i, [b, a] if i % 2 else [a, b])
        self.assertEqual(regular.events, shuffled.events)
        self.assertEqual(len(regular.events), 2)

    def test_disappearance_high_in_air_is_not_projected_to_floor(self):
        tracker = self.tracker()
        for i, z in enumerate((.10, .08, .06)):
            tracker.step(20 + i, [particle(0, z)])
        tracker.step(23, [], [(0, 0, 0)])
        self.assertEqual(tracker.events, [])
        self.assertEqual(tracker.floor_mesh_checks, 0)

    def test_disappearance_near_floor_requires_real_floor_mesh(self):
        for floor in (None, [], [(.1, 0, 0)], [(0, 0, .02)], [(0, 0, -.03)]):
            tracker = self.tracker()
            for i, z in enumerate((.06, .04, .02, .001)):
                tracker.step(20 + i, [particle(0, z)])
            tracker.step(24, [], floor)
            self.assertEqual(tracker.events, [])

    def test_observed_merger_uses_actual_nearby_mesh_vertices(self):
        tracker = self.tracker()
        for i, z in enumerate((.06, .04, .02, .001)):
            tracker.step(20 + i, [particle(0, z)])
        calls = []
        def actual_floor():
            calls.append(True)
            return [(.001, .001, .001), (.002, .001, .001), (.003, .001, .001)]
        tracker.step(24, [], actual_floor)
        self.assertEqual(len(calls), 1)
        self.assertEqual(len(tracker.events), 1)
        self.assertAlmostEqual(tracker.events[0]['world'][0], .002)
        self.assertEqual(tracker.events[0]['world'][1:], [.001, 0])
        self.assertEqual(tracker.events[0]['method'], 'observed-spray-disappeared-into-cached-floor-liquid')

    def test_not_enough_observed_airborne_time_is_rejected(self):
        for sequence in ((.02, -.002), (.004, .003, -.002)):
            tracker = self.tracker()
            for i, z in enumerate(sequence):
                tracker.step(20 + i, [particle(0, z)])
            self.assertEqual(tracker.events, [])

    def test_already_grounded_particles_do_not_create_landings(self):
        tracker = self.tracker()
        for i, z in enumerate((.001, .0012, .0005, -.0001)):
            tracker.step(20 + i, [particle(0, z)])
        self.assertEqual(tracker.events, [])

    def test_settled_particle_must_earn_new_airborne_history(self):
        tracker = self.tracker()
        for i, z in enumerate((.006, .005, .004, .0026, .0025, .0024, -.0001)):
            tracker.step(20 + i, [particle(0, z)])
        self.assertEqual(tracker.events, [])

    def test_ambiguous_crossing_particles_do_not_fabricate_identities(self):
        tracker = self.tracker()
        for i, z in enumerate((.060, .040, .020, -.002)):
            tracker.step(20 + i, [particle(0, z), particle(.0001, z)])
        self.assertEqual(tracker.events, [])
        self.assertGreater(tracker.ambiguous_links, 0)
        self.assertEqual(tracker.rejected_ambiguous_events, 2)

    def test_empty_cache_valid_zero(self):
        tracker = self.tracker()
        for frame in range(20, 121):
            tracker.step(frame, [])
        events, discarded = select_impacts(tracker.events, 21, 120, .004, lambda p, f: (0, 0, 1))
        self.assertEqual((events, discarded), ([], []))
        self.assertEqual(tracker.next_id, 1)

    def test_tracking_after_rigid_remap_observes_world_floor_crossing(self):
        tracker = self.tracker()
        untransformed = self.tracker()
        # Synthetic coordinate fixture: a 90-degree Y rotation maps sim X
        # into world Z. All native Z values stay positive; only world points
        # describe the observed floor crossing. No trajectory is extrapolated.
        matrix = ((0, 0, 1, .01), (0, 1, 0, -.02), (-1, 0, 0, 0), (0, 0, 0, 1))
        for i, world_z in enumerate((.06, .04, .02, -.002)):
            native = [particle(-world_z, .03)]
            observed = remap_observations(native, matrix)
            tracker.step(20+i, observed)
            untransformed.step(20+i, native)
            self.assertEqual(native[0]['world'][2], .03)
        self.assertEqual(len(tracker.events), 1)
        self.assertEqual(untransformed.events, [])
        for observed, expected in zip(tracker.events[0]['world'], (.04, -.02, 0)):
            self.assertAlmostEqual(observed, expected)

    def test_remap_noop_preserves_native_points_and_invalid_map_rejected(self):
        source = [particle(.01, .02, diameter=.0015)]
        self.assertEqual(remap_observations(source), source)
        self.assertIsNot(remap_observations(source)[0], source[0])
        with self.assertRaises(ValueError):
            remap_observations(source, ((1, 0), (0, 1)))
        with self.assertRaises(ValueError):
            remap_observations(source, ((1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (0, 0, 0, 0)))

    def test_frame_gap_invalidates_tracking_input(self):
        tracker = self.tracker()
        tracker.step(20, [particle(0, .05)])
        with self.assertRaises(ValueError):
            tracker.step(22, [particle(0, -.002)])

    def test_event_cap_never_exceeds_twelve(self):
        with self.assertRaises(ValueError):
            select_impacts([], 21, 120, .004, lambda p, frame: (0, 0, 1), 13)

    def test_camera_filter_and_time_normalization_without_clamping(self):
        good, outside = self.crossing().events[0], self.crossing(.3).events[0]
        outside['id'] = 'off-camera'
        selected, discarded = select_impacts([good, outside], 21, 120, .004,
                                             lambda p, frame: (.5 + p[0]*2, .75, 1))
        self.assertEqual(len(selected), 1)
        self.assertAlmostEqual(selected[0]['at'], 2 / 99)
        self.assertEqual(selected[0]['imageY'], .75)
        self.assertEqual(discarded[0]['reason'], 'outside-delivery-camera')

    def test_distinct_footprints_and_real_event_cap(self):
        events = []
        for i in range(20):
            event = self.crossing(i * .02).events[0]
            event.update(id=f'observed-{i}', frame=23+i)
            events.append(event)
        duplicate = dict(events[0], id='repeat', frame=100)
        selected, discarded = select_impacts(events+[duplicate], 21, 120, .004,
                                             lambda p, frame: (.1+p[0]*2, .75, 1), 12)
        self.assertEqual(len(selected), 12)
        self.assertIn('observed-0', [p['id'] for p in selected])
        self.assertIn('observed-19', [p['id'] for p in selected])
        self.assertTrue(all(p['id'].startswith('observed-') for p in selected))
        self.assertTrue(any(p['reason'] == 'same-observed-landing-footprint' for p in discarded))
        self.assertEqual(len(selected) + len(discarded), 21)


if __name__ == '__main__':
    unittest.main()
