"""Fast guard and lifetime tests; no Blender or bake required."""
import gc
import types
import unittest
import weakref

from coffee_pressure_wrapper import PressureLevelsetPatch


class LevelsetGrid:
    pass


class PressureBridgeTests(unittest.TestCase):
    def setUp(self):
        self.native_calls = []
        def native(*args, **kwargs):
            self.native_calls.append((args, kwargs))
            return "native-result"
        self.module = types.SimpleNamespace(solvePressure=native, LevelsetGrid=LevelsetGrid)
        self.original = native
        self.patch = PressureLevelsetPatch(self.module, "TestDomain")

    def tearDown(self):
        self.patch.restore()

    def solver(self, *, flags=None, vel=None, phi=None, name="liquid_step_17"):
        namespace = dict(flags_s17=flags or object(), vel_s17=vel or object(),
                         phi_s17=phi or LevelsetGrid(), solvePressure=self.module.solvePressure)
        exec(f"def {name}(**extra):\n    return solvePressure(flags=flags_s17, vel=vel_s17, **extra)", namespace)
        return namespace

    def test_actual_grid_and_native_result(self):
        ns = self.solver()
        self.assertEqual(ns["liquid_step_17"](), "native-result")
        self.assertIs(self.native_calls[0][1]["phi"], ns["phi_s17"])
        self.patch.assert_success()
        self.assertEqual(self.patch.snapshot()["solverIds"], ["17"])

    def test_cross_domain_identity_fails_before_native(self):
        ns = self.solver()
        exec("def liquid_step_17():\n    return solvePressure(flags=object(), vel=vel_s17)", ns)
        with self.assertRaisesRegex(RuntimeError, "cross-solver"):
            ns["liquid_step_17"]()
        self.assertEqual(self.native_calls, [])
        self.assertEqual(self.patch.snapshot()["failures"], 1)
        with self.assertRaises(RuntimeError):
            self.patch.assert_success()

    def test_native_positional_arguments(self):
        ns = self.solver()
        exec("def liquid_step_17():\n    return solvePressure(vel_s17, object(), flags_s17)", ns)
        ns["liquid_step_17"]()
        self.assertIs(self.native_calls[0][1]["phi"], ns["phi_s17"])
        explicit = LevelsetGrid()
        ns["explicit"] = explicit
        exec("def liquid_step_17():\n    return solvePressure(vel_s17, object(), flags_s17, 1e-3, explicit)", ns)
        ns["liquid_step_17"]()
        self.assertNotIn("phi", self.native_calls[1][1])
        self.assertIs(self.native_calls[1][0][4], explicit)

    def test_wrong_levelset_type_fails(self):
        ns = self.solver(phi=object())
        with self.assertRaisesRegex(RuntimeError, "LevelsetGrid"):
            ns["liquid_step_17"]()
        self.assertEqual(self.native_calls, [])

    def test_explicit_phi_and_nonliquid_calls_untouched(self):
        ns = self.solver()
        ns["liquid_step_17"](phi=None)
        other = self.solver(name="smoke_step_17")
        other["smoke_step_17"]()
        self.assertIsNone(self.native_calls[0][1]["phi"])
        self.assertNotIn("phi", self.native_calls[1][1])
        self.assertEqual(self.patch.snapshot()["actualLevelsetInjections"], 0)

    def test_restore_disables_already_imported_namespace(self):
        ns = self.solver()
        self.patch.restore()
        ns["liquid_step_17"]()
        self.assertIs(self.module.solvePressure, self.original)
        self.assertNotIn("phi", self.native_calls[0][1])
        self.assertEqual(self.patch.snapshot()["calls"], 0)

    def test_no_call_is_not_success(self):
        with self.assertRaises(RuntimeError):
            self.patch.assert_success()

    def test_no_retention_of_solver_namespace_or_grid(self):
        ns = self.solver()
        reference = weakref.ref(ns["phi_s17"])
        ns["liquid_step_17"]()
        self.native_calls.clear()
        del ns
        gc.collect()
        self.assertIsNone(reference())

    def test_native_exception_is_counted_not_retained(self):
        self.patch.restore()
        def failed_native(**kwargs):
            raise ValueError("native failure")
        self.module.solvePressure = failed_native
        self.patch = PressureLevelsetPatch(self.module, "TestDomain")
        ns = self.solver()
        reference = weakref.ref(ns["phi_s17"])
        with self.assertRaises(ValueError):
            ns["liquid_step_17"]()
        del ns
        gc.collect()
        self.assertIsNone(reference())
        self.assertEqual(self.patch.snapshot()["failures"], 1)

    def test_repeated_install_refused_and_diagnostics_bounded(self):
        with self.assertRaises(RuntimeError):
            PressureLevelsetPatch(self.module, "SecondDomain")
        ns = self.solver()
        for _ in range(30):
            ns["liquid_step_17"]()
        self.assertEqual(len(self.patch.snapshot()["examples"]), 12)
        self.assertEqual(self.patch.snapshot()["calls"], 30)


if __name__ == "__main__":
    unittest.main()
