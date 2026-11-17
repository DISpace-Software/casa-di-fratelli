"""Temporary, process-local Mantaflow liquid pressure level-set bridge.

For an isolated diagnostic with ONE liquid domain, after its ordinary bpy setup:

    patch = install_pressure_levelset_patch(domain)
    try:
        patch.reinitialize_fresh_domain()  # refuses any existing cache files
        bpy.ops.fluid.bake_data()
        patch.assert_exercised()          # FINISHED alone does not prove success
    finally:
        patch.restore()
        report["pressurePatch"] = patch.snapshot()

No binary, solver trajectory, surface-tension value or cache data is patched.
This supplies the actual solver's missing phi argument; it is an experimental
pressure-boundary change, NOT a validated physical-accuracy claim. The generated
solver imports manta.* at initialization, so a fresh initialization is required.
Do not import manta before Blender has initialized its native class registry.
"""

import inspect
from pathlib import Path
import re


_LIQUID_STEP = re.compile(r"liquid_step_(\d+)\Z")
_MARKER = "_cofein_pressure_levelset_bridge"


def _domain_settings(domain):
    modifiers = [m for m in domain.modifiers
                 if m.type == "FLUID" and m.fluid_type == "DOMAIN"]
    if len(modifiers) != 1 or modifiers[0].domain_settings.domain_type != "LIQUID":
        raise RuntimeError("Expected exactly one LIQUID domain modifier")
    return modifiers[0].domain_settings


class PressureLevelsetPatch:
    """Owns no solver grids, Python solver frames, namespaces or exceptions."""

    def __init__(self, manta_module, domain_name, *, example_limit=12):
        original = manta_module.solvePressure
        if getattr(original, _MARKER, False):
            raise RuntimeError("A Cofein pressure bridge is already installed")
        self._manta = manta_module
        self._original = original
        self._domain_name = domain_name
        self._enabled = True
        self._example_limit = example_limit
        self._stats = dict(calls=0, liquidCalls=0, actualLevelsetInjections=0,
                           nativeCallsSucceeded=0, failures=0, passthroughCalls=0,
                           freshDomainReinitialized=False, moduleAttributeRestored=False)
        self._examples = []
        self._solver_ids = set()

        def wrapped_pressure(*args, **kwargs):
            # Old generated namespaces may retain this function after restore.
            # Disabling the handle makes those references harmless pass-throughs.
            if not self._enabled:
                return original(*args, **kwargs)
            caller = inspect.currentframe().f_back
            self._stats["calls"] += 1
            entry = {"caller": caller.f_code.co_name}
            try:
                match = _LIQUID_STEP.fullmatch(caller.f_code.co_name)
                if match:
                    self._stats["liquidCalls"] += 1
                # Native solvePressure phi is positional index four. Preserve
                # every explicit argument, including an explicit phi=None.
                if match and "phi" not in kwargs and len(args) < 5:
                    suffix = match.group(1)
                    namespace = caller.f_globals
                    phi = namespace.get("phi_s" + suffix)
                    # Native order: vel, pressure, flags, cgAccuracy, phi.
                    flags = kwargs.get("flags", args[2] if len(args) > 2 else None)
                    vel = kwargs.get("vel", args[0] if args else None)
                    if not isinstance(phi, self._manta.LevelsetGrid):
                        raise RuntimeError("Missing native liquid LevelsetGrid phi_s" + suffix)
                    if flags is None or vel is None or (
                        namespace.get("flags_s" + suffix) is not flags or
                        namespace.get("vel_s" + suffix) is not vel
                    ):
                        raise RuntimeError("Refusing cross-solver flags/velocity bindings")
                    kwargs["phi"] = phi
                    self._solver_ids.add(suffix)
                    self._stats["actualLevelsetInjections"] += 1
                    entry.update(levelsetKey="phi_s" + suffix,
                                 sameDomainBindings=True,
                                 injectedActualPhi=True)
                else:
                    self._stats["passthroughCalls"] += 1
                result = original(*args, **kwargs)
                self._stats["nativeCallsSucceeded"] += 1
                entry["nativeCallSucceeded"] = True
                return result
            except Exception as error:
                self._stats["failures"] += 1
                entry.update(nativeCallSucceeded=False, error=str(error))
                raise
            finally:
                if len(self._examples) < self._example_limit:
                    self._examples.append(entry)
                # Never retain frame/global/grid objects in diagnostics. They
                # outlive native solvers after reset and can crash shutdown.
                del caller

        setattr(wrapped_pressure, _MARKER, True)
        self._wrapper = wrapped_pressure
        manta_module.solvePressure = wrapped_pressure

    def reinitialize_fresh_domain(self):
        """Trigger normal initDomain/from-manta-import on an EMPTY new cache."""
        import bpy
        if not self._enabled or self._stats["calls"]:
            raise RuntimeError("Refresh is permitted only before the first patched call")
        domain = bpy.data.objects.get(self._domain_name)
        if domain is None:
            raise RuntimeError("Diagnostic domain no longer exists")
        settings = _domain_settings(domain)
        if settings.cache_type != "MODULAR":
            raise RuntimeError("Fresh-domain refresh requires a MODULAR diagnostic cache")
        if bpy.context.scene.frame_current != settings.cache_frame_start:
            raise RuntimeError("Move to cache_frame_start before installing the bridge")
        for name in dir(settings):
            if name.startswith(("has_cache_baked_", "is_cache_baked_", "is_cache_baking_")) and getattr(settings, name):
                raise RuntimeError("Refusing to reset a baked or baking cache: " + name)
        if not settings.cache_directory:
            raise RuntimeError("An explicit fresh cache directory is required")
        cache = Path(bpy.path.abspath(settings.cache_directory)).resolve()
        if cache.exists() and any(p.is_file() for p in cache.rglob("*")):
            raise RuntimeError("Refusing to reset nonempty cache: " + str(cache))
        resolution = settings.resolution_max
        alternate = resolution + 1 if resolution < 10000 else resolution - 1
        try:
            settings.resolution_max = alternate
        finally:
            settings.resolution_max = resolution
        bpy.context.view_layer.update()
        self._stats["freshDomainReinitialized"] = True

    def assert_exercised(self):
        if not self._stats["actualLevelsetInjections"] or self._stats["failures"]:
            raise RuntimeError("Pressure bridge was not successfully exercised: " + str(self.snapshot()))
        if self._stats["nativeCallsSucceeded"] != self._stats["calls"]:
            raise RuntimeError("Some intercepted native pressure calls did not complete")

    def assert_success(self):
        """Integration alias: require real successful calls, never just FINISHED."""
        self.assert_exercised()

    def snapshot(self):
        return {"kind": "actual-native-liquid-levelset-injection",
                "claim": "Experimental pressure boundary; physical accuracy not validated",
                "domain": self._domain_name, "enabled": self._enabled,
                **self._stats, "solverIds": sorted(self._solver_ids),
                "examples": [dict(row) for row in self._examples]}

    def restore(self):
        self._enabled = False
        if self._manta.solvePressure is self._wrapper:
            self._manta.solvePressure = self._original
        # Do not overwrite another caller's subsequent monkeypatch.
        self._stats["moduleAttributeRestored"] = self._manta.solvePressure is self._original


def install_pressure_levelset_patch(domain):
    """Initialize native registry normally, then install one temporary bridge."""
    import bpy
    _domain_settings(domain)
    liquid_domains = [obj for obj in bpy.context.scene.objects
                      if any(m.type == "FLUID" and m.fluid_type == "DOMAIN" and
                             m.domain_settings.domain_type == "LIQUID"
                             for m in obj.modifiers)]
    if liquid_domains != [domain]:
        raise RuntimeError("Use an isolated scene containing only the target liquid domain")
    bpy.context.view_layer.update()
    # Import order is intentional: importing manta before Blender initializes
    # its classes can leave LevelsetGrid without inherited methods.
    import manta
    if not hasattr(manta.LevelsetGrid, "setConst"):
        raise RuntimeError("Mantaflow class registry not initialized; restart with normal domain setup first")
    return PressureLevelsetPatch(manta, domain.name)
