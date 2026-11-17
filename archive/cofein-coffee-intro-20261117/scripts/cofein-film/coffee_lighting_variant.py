"""Prepare one unapproved lighting-only coffee comparison; never render or bake.

Only enlarge/brighten the existing rear reflection card. The larger emitting
area covers more liquid normals while a moderate radiance increase preserves
the main ceramic lighting. This is an artistic hypothesis pending a real proof.
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from coffee_optics_variant import scene_guard, shader_state, sha256


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    source, target = Path(args.input).resolve(), Path(args.output).resolve()
    if source == target or target.exists():
        raise ValueError('The lighting comparison must use a new, distinct file')
    source_sha = sha256(source)
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene = bpy.context.scene
    light = bpy.data.objects['Coffee softbox reflection']
    data = light.data
    if data.type != 'AREA' or data.shape != 'DISK':
        raise ValueError('Expected the existing disk-shaped reflection light')
    if hasattr(data, 'normalize') and not data.normalize:
        raise ValueError('The proposed power/area comparison requires normalized area-light power')
    if not math.isclose(data.energy, .045, rel_tol=1e-5) or not math.isclose(data.size, .055, rel_tol=1e-5):
        raise ValueError('Input is not the reviewed baseline reflection-light configuration')
    geometry_before = scene_guard(scene)
    materials_before = shader_state()
    original = {'energy': data.energy, 'size': data.size}
    candidate = {'energy': .36, 'size': .12}
    for property_name, setting in candidate.items():
        setattr(data, property_name, setting)
    if materials_before != shader_state():
        raise AssertionError('The lighting comparison unexpectedly changed a material')
    # The shared guard includes light energy. Normalize the two allowed fields
    # only for the comparison, then restore the candidate before saving.
    for property_name, setting in original.items():
        setattr(data, property_name, setting)
    if geometry_before != scene_guard(scene):
        raise AssertionError('Unexpected geometry, camera, light, bindings or motion changes')
    for property_name, setting in candidate.items():
        setattr(data, property_name, setting)
    bpy.ops.wm.save_as_mainfile(filepath=str(target), check_existing=False)
    if sha256(source) != source_sha:
        raise AssertionError('The optics source blend changed')
    area_ratio = (candidate['size'] / original['size']) ** 2
    power_ratio = candidate['energy'] / original['energy']
    report = {
        'status': 'unapproved-lighting-comparison-awaiting-render',
        'source': str(source), 'sourceSha256': source_sha,
        'output': str(target), 'outputSha256': sha256(target),
        'codeSha256': {name: sha256(Path(__file__).with_name(name))
                       for name in ('coffee_lighting_variant.py', 'coffee_optics_variant.py')},
        'blender': bpy.app.version_string,
        'changedLight': light.name,
        'changedProperties': {name: {'before': original[name], 'after': getattr(data, name)}
                              for name in candidate},
        'unchangedLight': {'shape': data.shape, 'location': list(light.location),
                           'rotationEuler': list(light.rotation_euler), 'color': list(data.color),
                           'normalize': getattr(data, 'normalize', 'legacy normalized area power')},
        'emittingAreaRatio': area_ratio,
        'totalPowerRatio': power_ratio,
        'estimatedRadianceRatioWithNormalizedAreaPower': power_ratio / area_ratio,
        'addedPowerWatts': candidate['energy'] - original['energy'],
        'geometryMotionGuardSha256': geometry_before,
        'unchanged': ['all materials including CoffeeMaterial', 'geometry', 'sampled motion',
                      'camera', 'other lights', 'world shader', 'render settings',
                      'source blend', 'simulation cache'],
        'rationale': [
            'Actual optics proof frame55 loses the upper stream and liquid surface against black.',
            'A larger rear disk covers more reflected/transmitted directions at the pouring liquid.',
            'Power increases eightfold but area increases 4.76-fold, so source radiance rises only about 1.68-fold.',
            'The original key, fill, rim lights, exposure and liquid optics remain untouched.'
        ],
        'limitations': ['Artistic A/B hypothesis, not measured photographic lighting or an accepted production change.',
                        'No render or bake performed; readability and ceramic highlights require the actual comparison.'],
        'reference': 'https://docs.blender.org/manual/en/4.5/render/lights/light_object.html',
    }
    target.with_suffix('.json').write_text(json.dumps(report, indent=2) + '\n')
    print('COFEIN_LIGHTING_COMPARISON_READY', json.dumps(report), flush=True)


if __name__ == '__main__':
    main()
