"""Bake actual liquid in a stationary cup reference frame.

The full original cup motion is sampled before any animation is changed. Its
inverse moves the floor and saucer collision proxies, while effective gravity
includes the rotated world gravity and cup translational acceleration. This is
a documented rotating-frame approximation: omitted rotational inertial terms
must not be presented as an exact world-space Navier–Stokes simulation.

Use a short containment/volume diagnostic before a full sequence. All outputs
must be fresh. The resulting native cache remains in simulation coordinates;
export it through coffee_world_fluid.py before world-space rendering/tracking.
"""

import argparse
import importlib.util
import json
import math
from pathlib import Path
import sys
import time

import bpy


def load_helper(filename, module_name):
    spec = importlib.util.spec_from_file_location(module_name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--input', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--cache', required=True)
parser.add_argument('--frames', type=int, default=55)
parser.add_argument('--target-cell', type=float, default=0.0035437829792499542)
parser.add_argument('--resolution', type=int, help='Explicit resolution, never coarser than target-cell')
parser.add_argument('--surface-tension', type=float, default=0.0)
parser.add_argument('--spray', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
if not 1 <= args.frames <= 120 or args.target_cell <= 0:
    raise ValueError('Require 1..120 frames and a positive target cell size')
output = Path(args.output).resolve()
cache = Path(args.cache).resolve()
if output.exists() or (cache.exists() and any(cache.iterdir())):
    raise RuntimeError('Only a fresh output and empty cache may be used')
output.parent.mkdir(parents=True, exist_ok=True)
base = load_helper('coffee_liquid_bake.py', 'cofein_liquid_base')
pressure = load_helper('coffee_pressure_wrapper.py', 'cofein_pressure_wrapper')
cup_frame = load_helper('coffee_cup_frame.py', 'cofein_cup_frame')
bpy.ops.wm.open_mainfile(filepath=str(Path(args.input).resolve()))
scene = bpy.context.scene
world_low = (-0.1743142157793045, -0.12849999964237213, -0.017999999225139618)
world_high = (0.1658889353275299, 0.12849999964237213, 0.1706610471010208)
motion = cup_frame.sample_cup_motion(scene, frame_start=1, frame_end=120, sample_step=.25)
sim_low, sim_high = motion.simulation_bounds(world_low, world_high, padding=.008)
minimum_resolution = math.ceil(max(sim_high[a] - sim_low[a] for a in range(3)) / args.target_cell)
resolution = args.resolution or minimum_resolution
if resolution < minimum_resolution:
    raise ValueError(f'Resolution {resolution} is too coarse; require at least {minimum_resolution}')
domain, report = base.configure_liquid(
    scene, cache, resolution=resolution, frame_end=args.frames,
    surface_tension=args.surface_tension, timesteps_max=12,
    domain_min=sim_low, domain_max=sim_high, source_inset_cells=1.25,
    conservative_wall=True, fractional_obstacles=False,
    delete_in_obstacle=True, mesh_smooth=3, timesteps_min=1, cfl=2.0,
    spray=args.spray,
)
frame_report = cup_frame.configure_cup_frame(
    scene, domain, motion=motion, world_bounds=(world_low, world_high), resize_domain=False,
)
report.update(
    experiment='stationary-cup-reference-frame', status='incomplete-diagnostic',
    target_cell_m=args.target_cell, minimum_resolution=minimum_resolution,
    cupFrame=frame_report,
    scope='Actual native simulated cache in moving reference frame; numerical review and world remap required',
)
scene['cofein_liquid_setup'] = json.dumps(report)
base._active(domain)
bpy.ops.wm.save_as_mainfile(filepath=str(output))
bpy.context.view_layer.update()
handle = pressure.install_pressure_levelset_patch(domain)
try:
    handle.reinitialize_fresh_domain()
    bpy.ops.wm.save_as_mainfile(filepath=str(output))
    report['pressurePatchBeforeBake'] = handle.snapshot()
    print('CUP_FRAME_SETUP ' + json.dumps(report), flush=True)
    started = time.monotonic()
    result = bpy.ops.fluid.bake_data()
    report['data_bake_seconds'] = time.monotonic() - started
    report['bakeDataResult'] = list(result)
    report['pressurePatch'] = handle.snapshot()
    if 'FINISHED' not in result:
        raise RuntimeError('Native fluid data bake did not finish')
    handle.assert_success()
    if report['pressurePatch']['actualLevelsetInjections'] < args.frames:
        raise RuntimeError('Pressure hook did not execute at least once per frame')
    if report['pressurePatch']['actualLevelsetInjections'] != report['pressurePatch']['liquidCalls']:
        raise RuntimeError('Not every liquid pressure call received the actual level-set')
    print('CUP_FRAME_DATA_COMPLETE ' + json.dumps({
        'seconds': report['data_bake_seconds'], 'pressurePatch': report['pressurePatch'],
    }), flush=True)
    started = time.monotonic()
    if 'FINISHED' not in bpy.ops.fluid.bake_mesh():
        raise RuntimeError('Native fluid mesh bake did not finish')
    report['mesh_bake_seconds'] = time.monotonic() - started
    if args.spray:
        started = time.monotonic()
        if 'FINISHED' not in bpy.ops.fluid.bake_particles():
            raise RuntimeError('Native secondary-particle bake did not finish')
        report['spray_bake_seconds'] = time.monotonic() - started
    report['mesh_samples'] = base.sample_liquid(domain, [
        f for f in [1, 12, 20, 21, 30, 35, 40, 55, 80, 105, 120] if f <= args.frames
    ])
    report['cache_bytes'] = sum(p.stat().st_size for p in cache.rglob('*') if p.is_file())
    report['status'] = 'baked-awaiting-numerical-review'
    scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(output))
except Exception as error:
    report['status'] = 'failed-diagnostic'
    report['error'] = repr(error)
    raise
finally:
    report['pressurePatch'] = handle.snapshot()
    handle.restore()
    report['pressurePatchAfterRestore'] = handle.snapshot()
    output.with_suffix('.json').write_text(json.dumps(report, indent=2) + '\n')
print('CUP_FRAME_COMPLETE ' + json.dumps(report), flush=True)
