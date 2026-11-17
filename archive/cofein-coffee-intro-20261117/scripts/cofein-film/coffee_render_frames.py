"""Render reviewed Mantaflow cache as RGBA frames; never rebuild fluid at playback.

blender -b --threads 8 --python coffee_render_frames.py -- \
  --input v5.blend --world-sequence world-frames --aov-floor-composite \
  --output frames --first 21 --last 120 --samples 32
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import time

import bpy


def configure_device(scene, backend, name):
    """Select an explicit path-tracing device without saving user preferences."""
    if backend == 'CPU':
        if name:
            raise ValueError('--device-name requires --device METAL')
        scene.cycles.device = 'CPU'
        return {'backend': 'CPU', 'devices': [], 'preferencesSaved': False}
    if not name:
        raise ValueError('--device METAL requires an exact --device-name')
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'
    prefs.get_devices()
    for device in prefs.devices:
        device.use = device.type == 'METAL' and device.name == name
    selected = [device for device in prefs.devices if device.use]
    if len(selected) != 1:
        raise RuntimeError(f'Exactly one Metal device named {name!r} is required; CPU fallback is disabled')
    if hasattr(prefs, 'metalrt'):
        prefs.metalrt = 'OFF'
    # The same native override used by the official Cycles --cycles-device CLI.
    import _cycles
    _cycles.set_device_override('METAL')
    scene.cycles.device = 'GPU'
    return {'backend': 'METAL', 'devices': [
        {'name': device.name, 'type': device.type, 'id': device.id} for device in selected
    ], 'metalrt': getattr(prefs, 'metalrt', None), 'preferencesSaved': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--first', type=int, default=21)
    parser.add_argument('--last', type=int, default=120)
    parser.add_argument('--frames', default='')
    parser.add_argument('--width', type=int, default=1024)
    parser.add_argument('--height', type=int, default=768)
    parser.add_argument('--samples', type=int, default=48)
    parser.add_argument('--device', choices=('CPU', 'METAL'), default='CPU')
    parser.add_argument('--device-name', default='', help='Exact Metal device name; no CPU fallback')
    parser.add_argument('--review-after', type=int, default=0, help='Pause after this many frames for local visual review')
    parser.add_argument('--review-signal', help='Fresh JSON path for a matching local render review decision')
    parser.add_argument('--resume', action='store_true', help='Reuse completed frames from an identical recorded render')
    parser.add_argument('--world-sequence', help='Validated NPZ sequence exported into original scene coordinates')
    parser.add_argument('--aov-floor-composite', action='store_true', help='Blend floor coffee into a separate dry render layer')
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    args = parser.parse_args(argv)
    bpy.ops.wm.open_mainfile(filepath=str(Path(args.input).resolve()))
    scene = bpy.context.scene
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    frames = [int(f) for f in args.frames.split(',')] if args.frames else list(range(args.first, args.last + 1))
    if not frames or len(frames) != len(set(frames)):
        raise ValueError('Provide at least one unique frame')
    if bool(args.review_after) != bool(args.review_signal):
        raise ValueError('--review-after and --review-signal must be used together')
    if args.review_after and not 0 < args.review_after < len(frames):
        raise ValueError('Review must leave at least one subsequent frame to render')
    review_signal = Path(args.review_signal).resolve() if args.review_signal else None
    output = Path(args.output).resolve()
    reserved_paths = {output / name for name in ('render-report.json', 'review-request.json')}
    reserved_paths.update(output / f'{frame:04d}.png' for frame in frames)
    if review_signal in reserved_paths:
        raise ValueError('Review signal must not replace a render output or report')
    if review_signal and review_signal.exists():
        raise FileExistsError('Review signal must be a fresh path; stale decisions cannot be reused')
    sequence = None
    sequence_identity = None
    domain = None
    if args.world_sequence:
        from coffee_world_fluid import load_world_sequence, MANIFEST_NAME
        sequence = load_world_sequence(scene, args.world_sequence)
        available = {entry['frame'] for entry in sequence['metadata']['frames']}
        if not set(frames).issubset(available):
            raise RuntimeError('Requested frame is missing from world sequence')
        sequence_identity = hashlib.sha256((Path(args.world_sequence) / MANIFEST_NAME).read_bytes()).hexdigest()
    else:
        domain = bpy.data.objects.get('CoffeeDomain')
        if not domain:
            raise RuntimeError('A baked liquid domain or validated world sequence is required')
        modifier = next((m for m in domain.modifiers if m.type == 'FLUID' and m.fluid_type == 'DOMAIN'), None)
        if not modifier:
            raise RuntimeError('Missing Mantaflow liquid domain modifier')
        cache = Path(bpy.path.abspath(modifier.domain_settings.cache_directory)) / 'mesh'
        for frame in frames:
            if not (cache / f'fluid_mesh_{frame:04d}.bobj.gz').is_file():
                raise RuntimeError(f'Physical mesh cache is missing frame {frame}')
    floor_composite = json.loads(scene.get('cofein_floor_aov_composite', 'null'))
    for obj in scene.objects:
        if obj.get('preview_liquid_only') or obj.name.startswith('CoffeePhysics') or obj.name.startswith('CoffeeSource'):
            obj.hide_render = True
    for system in domain.particle_systems if domain else []:
        if system.settings.type == 'FLUID':
            system.settings.render_type = 'NONE'
    scene.render.engine = 'CYCLES'
    # Keep the unchanged ceramic, lights and shader kernels between frames.
    scene.render.use_persistent_data = True
    render_device = configure_device(scene, args.device, args.device_name)
    scene.cycles.samples = args.samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = .02
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = 'OPENIMAGEDENOISE'
    if hasattr(scene.cycles, 'denoising_use_gpu'):
        scene.cycles.denoising_use_gpu = False
    scene.cycles.seed = 0
    scene.cycles.use_animated_seed = False
    scene.render.resolution_x = args.width
    scene.render.resolution_y = args.height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'
    scene.render.film_transparent = True
    for obj in scene.objects:
        if obj.name == 'StudioFloor':
            obj.is_shadow_catcher = True
    if args.aov_floor_composite:
        from coffee_liquid_aov_composite import configure_liquid_aov_composite
        floor_composite = configure_liquid_aov_composite(scene=scene)
    output.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    report = {'input': str(Path(args.input).resolve()), 'blender': bpy.app.version_string,
              'buildHash': bpy.app.build_hash.decode(), 'renderDevice': render_device,
              'denoisingBackend': 'CPU OpenImageDenoise',
              'inputSha256': hashlib.sha256(Path(args.input).read_bytes()).hexdigest(),
              'worldSequenceSha256': sequence_identity,
              'floorComposite': floor_composite,
              'width': args.width, 'height': args.height, 'samples': args.samples,
              'first': min(frames), 'last': max(frames), 'frames': [], 'status': 'rendering'}
    code_files = [Path(__file__).resolve()]
    if sequence:
        code_files.append(Path(__file__).with_name('coffee_world_fluid.py'))
    if args.aov_floor_composite:
        code_files.append(Path(__file__).with_name('coffee_liquid_aov_composite.py'))
    report['codeSha256'] = {file.name: hashlib.sha256(file.read_bytes()).hexdigest() for file in code_files}
    completed = {}
    report_path = output / 'render-report.json'
    if args.resume and report_path.is_file():
        previous = json.loads(report_path.read_text())
        for key in ('inputSha256', 'worldSequenceSha256', 'codeSha256', 'blender', 'buildHash', 'renderDevice', 'denoisingBackend', 'width', 'height', 'samples', 'floorComposite'):
            if previous.get(key) != report[key]:
                raise RuntimeError(f'Resume settings changed: {key}')
        completed = {entry['frame']: entry for entry in previous.get('frames', [])}

    def local_visual_review():
        if not review_signal or len(report['frames']) != args.review_after:
            return
        # Keep the process and its compiled GPU kernels alive while the actual
        # proof PNGs are inspected. This is an offline production checkpoint.
        request = {key: report[key] for key in ('inputSha256', 'worldSequenceSha256',
                   'codeSha256', 'renderDevice', 'width', 'height', 'samples', 'frames')}
        request_bytes = json.dumps(request, sort_keys=True, indent=2).encode()
        request_hash = hashlib.sha256(request_bytes).hexdigest()
        (output / 'review-request.json').write_bytes(request_bytes)
        report['status'] = 'awaiting-local-visual-review'
        report['reviewRequestSha256'] = request_hash
        report_path.write_text(json.dumps(report, indent=2))
        print('COFEIN_RENDER_REVIEW ' + json.dumps({'requestSha256': request_hash,
              'signal': str(review_signal)}), flush=True)
        while not review_signal.is_file():
            time.sleep(1)
        try:
            decision = json.loads(review_signal.read_text())
            if decision.get('requestSha256') != request_hash or decision.get('decision') != 'continue':
                raise RuntimeError('Local render review did not approve these exact proof frames')
        except Exception as error:
            report['status'] = 'local-visual-review-failed'
            report['error'] = str(error)
            report_path.write_text(json.dumps(report, indent=2))
            raise
        report['status'] = 'rendering'
        report['visualReview'] = {'requestSha256': request_hash, 'decision': 'continue'}
        report_path.write_text(json.dumps(report, indent=2))

    for frame in frames:
        expected_device = 'GPU' if args.device == 'METAL' else 'CPU'
        if scene.cycles.device != expected_device:
            raise RuntimeError('Render device changed unexpectedly')
        frame_path = output / f'{frame:04d}.png'
        if frame in completed and frame_path.is_file():
            # A report entry is written only after Blender finished saving.
            recorded = completed[frame]
            if (recorded.get('bytes') == frame_path.stat().st_size
                    and recorded.get('sha256') == hashlib.sha256(frame_path.read_bytes()).hexdigest()):
                report['frames'].append(recorded)
                print('COFEIN_RENDER_RESUMED ' + str(frame), flush=True)
                local_visual_review()
                continue
        scene.frame_set(frame)
        if sequence:
            sequence['set_frame'](frame)
        before = time.monotonic()
        scene.render.filepath = str(frame_path)
        bpy.ops.render.render(write_still=True)
        entry = {'frame': frame, 'seconds': round(time.monotonic() - before, 3),
                 'bytes': frame_path.stat().st_size,
                 'sha256': hashlib.sha256(frame_path.read_bytes()).hexdigest()}
        report['frames'].append(entry)
        report['seconds'] = round(time.monotonic() - started, 3)
        report_path.write_text(json.dumps(report, indent=2))
        print('COFEIN_RENDER_FRAME ' + json.dumps(entry), flush=True)
        local_visual_review()
    report['seconds'] = round(time.monotonic() - started, 3)
    report['status'] = 'completed'
    report_path.write_text(json.dumps(report, indent=2))
    print('COFEIN_RENDER_COMPLETE ' + json.dumps({'frames': len(frames), 'seconds': report['seconds']}), flush=True)


if __name__ == '__main__':
    main()
