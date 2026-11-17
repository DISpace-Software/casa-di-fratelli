"""Prepare the one agreed, bounded reflection-light transition; no fluid edits."""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from coffee_optics_variant import scene_guard, shader_state, sha256


def light_values(frame):
    progress = min(1.0, max(0.0, (frame - 21) / 34))
    eased = progress * progress * (3 - 2 * progress)
    size = .075 + (.12 - .075) * eased
    return size, .36 * (size / .12) ** 2


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    source, target = Path(args.input).resolve(), Path(args.output).resolve()
    if source == target or target.exists():
        raise ValueError('The motion-lighting comparison must be a fresh, distinct file')
    source_sha = sha256(source)
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene = bpy.context.scene
    original_frame, original_subframe = scene.frame_current, scene.frame_subframe
    data = bpy.data.objects['Coffee softbox reflection'].data
    if data.type != 'AREA' or data.shape != 'DISK' or not data.normalize:
        raise ValueError('Expected the reviewed normalized disk reflection light')
    if not math.isclose(data.energy, .36, rel_tol=1e-5) or not math.isclose(data.size, .12, rel_tol=1e-5):
        raise ValueError('Input must be the accepted f55 lighting candidate')
    if data.animation_data and (data.animation_data.action or data.animation_data.drivers or data.animation_data.nla_tracks):
        raise ValueError('The original reflection light unexpectedly has animation')
    before_geometry = scene_guard(scene)
    before_materials = shader_state()
    original_size, original_energy = data.size, data.energy
    for frame in range(1, 121):
        data.size, data.energy = light_values(frame)
        data.keyframe_insert(data_path='size', frame=frame)
        data.keyframe_insert(data_path='energy', frame=frame)
    action = data.animation_data.action
    action.name = 'CoffeeReflectionPhotographicRamp'
    curves = list(action.fcurves)
    if {curve.data_path for curve in curves} != {'size', 'energy'} or len(curves) != 2:
        raise AssertionError('Unexpected lighting animation channels')
    for curve in curves:
        curve.extrapolation = 'CONSTANT'
        for key in curve.keyframe_points:
            key.interpolation = 'LINEAR'
    evaluated = []
    max_error = 0.0
    for frame in range(1, 121):
        scene.frame_set(frame)
        size, energy = light_values(frame)
        max_error = max(max_error, abs(data.size - size), abs(data.energy - energy))
        if not math.isclose(data.size, size, rel_tol=1e-6) or not math.isclose(data.energy, energy, rel_tol=1e-6):
            raise AssertionError(f'Lighting evaluation differs at frame {frame}')
        evaluated.append({'frame': frame, 'size': data.size, 'energy': data.energy})
    # Temporarily mute ONLY the new curves for the unchanged-scene guard. The
    # original source has these two properties fixed at the accepted f55 values.
    for curve in curves:
        curve.mute = True
    data.size, data.energy = original_size, original_energy
    scene.frame_set(original_frame, subframe=original_subframe)
    if scene_guard(scene) != before_geometry or shader_state() != before_materials:
        raise AssertionError('Unexpected source geometry, motion, lighting or material change')
    for curve in curves:
        curve.mute = False
    scene.frame_set(original_frame, subframe=original_subframe)
    bpy.ops.wm.save_as_mainfile(filepath=str(target), check_existing=False)
    if sha256(source) != source_sha:
        raise AssertionError('The original lit scene changed')
    report = {
        'status': 'bounded-lighting-transition-awaiting-frame21-review',
        'source': str(source), 'sourceSha256': source_sha,
        'output': str(target), 'outputSha256': sha256(target),
        'blender': bpy.app.version_string,
        'codeSha256': {name: sha256(Path(__file__).with_name(name))
                       for name in ('coffee_lighting_motion_variant.py', 'coffee_optics_variant.py')},
        'changedLight': 'Coffee softbox reflection', 'changedPaths': ['size', 'energy'],
        'formula': 't=clamp((frame-21)/34); size=.075+.045*t*t*(3-2*t); energy=.36*(size/.12)^2',
        'interpolation': 'Integer-frame samples of smoothstep; linear between samples; constant extrapolation',
        'testedIntegerFrames': 120, 'maxAbsoluteEvaluationError': max_error,
        'evaluatedValues': evaluated,
        'geometryMotionGuardSha256': before_geometry,
        'unchanged': ['all materials', 'geometry', 'cup and saucer motion', 'camera',
                      'light position, orientation and color', 'other lights', 'world shader',
                      'render settings', 'source blend', 'simulation cache'],
        'limitations': ['Artistic source-light animation, not a change to simulated liquid.',
                        'Frame55 and later use the identical accepted lighting values.',
                        'Preparation performs no render or bake.'],
    }
    target.with_suffix('.json').write_text(json.dumps(report, indent=2) + '\n')
    print('COFEIN_LIGHTING_MOTION_READY', json.dumps({key: value for key, value in report.items()
                                                   if key != 'evaluatedValues'}), flush=True)


if __name__ == '__main__':
    main()
