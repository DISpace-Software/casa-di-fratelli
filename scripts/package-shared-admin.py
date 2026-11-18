#!/usr/bin/env python3
"""Package only the shared administration build and its required public assets."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('destination', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
build = root / 'frontend/dist-admin'
destination = args.destination.resolve()
if destination.exists():
    parser.error('Destination already exists; use a fresh release directory.')
if not (build / 'admin.html').is_file():
    parser.error('Run npm run build:admin first.')

# This immutable directory is loaded lazily by the local speech worker. Copy
# only its manifest allowlist, never the entire public directory or extra files.
speech_path = Path('speech/bg-zipformer/8d2f8f4-sherpa-1.12.36')
speech = build / speech_path
manifest_file = speech / 'manifest.json'
speech_files = []
try:
    if manifest_file.is_symlink():
        raise ValueError('Speech manifest must be a regular file.')
    manifest_bytes = manifest_file.read_bytes()
    if manifest_bytes != (root / 'frontend/public' / speech_path / 'manifest.json').read_bytes():
        raise ValueError('Speech manifest differs from source; rebuild the admin.')
    manifest = json.loads(manifest_bytes)
    if (manifest.get('model') != 'preslaff/bulgarian-asr-zipformer'
            or manifest.get('revision') != '8d2f8f4f159918a27b33c430e4fa83b10c705c28'
            or manifest.get('runtime') != 'sherpa-onnx v1.12.36'):
        raise ValueError('Unexpected local speech model/runtime.')
    entries = manifest.get('files')
    if not isinstance(entries, list) or not entries:
        raise ValueError('Speech manifest has no file allowlist.')
    names = set()
    for entry in entries:
        name = entry.get('name')
        size = entry.get('bytes')
        digest = entry.get('sha256')
        if (not isinstance(name, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]*', name)
                or Path(name).suffix not in {'.onnx', '.wasm', '.js', '.txt', '.md'}
                or name in names or not isinstance(size, int) or isinstance(size, bool) or size <= 0
                or not isinstance(digest, str) or not re.fullmatch(r'[0-9a-f]{64}', digest)):
            raise ValueError('Invalid or duplicate speech manifest entry.')
        names.add(name)
        source = speech / name
        if source.is_symlink() or not source.is_file():
            raise ValueError(f'Speech asset is not a regular file: {name}')
        data = source.read_bytes()
        if len(data) != size or hashlib.sha256(data).hexdigest() != digest:
            raise ValueError(f'Speech asset length/hash mismatch: {name}')
        speech_files.append(name)
    required = {
        'encoder-epoch-40-avg-8.int8.onnx', 'decoder-epoch-40-avg-8.int8.onnx',
        'joiner-epoch-40-avg-8.int8.onnx', 'tokens.txt', 'sherpa-asr.js',
        'sherpa-runtime.js', 'sherpa-runtime.wasm',
    }
    if not required <= names:
        raise ValueError('Speech manifest omits required model/runtime files.')
except (OSError, ValueError, TypeError, AttributeError) as error:
    parser.error(f'Invalid local speech package: {error}')

destination.mkdir(parents=True)
shutil.copyfile(build / 'admin.html', destination / 'index.html')
shutil.copytree(build / 'assets', destination / 'assets')
public_assets = [
    'admin-push-sw.js', 'restaurant-generic.svg', 'casa-di-fratelli-logo.svg',
    'casa-fratelli-icon-192.png', 'casa-fratelli-icon-512.png', 'favicon-48x48.png', 'favicon-96x96.png',
    'admin-role-chef.jpeg', 'admin-role-waiter.jpeg', 'admin-role-admin.jpeg',
    'admin-role-owner.jpeg', 'admin-role-developer.jpeg',
    'cofein/brand/cofein-lockup.svg', 'cofein/favicon.svg',
]
for name in public_assets:
    (destination / name).parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(build / name, destination / name)
(destination / speech_path).mkdir(parents=True)
for name in [*speech_files, 'manifest.json']:
    shutil.copyfile(speech / name, destination / speech_path / name)
(destination / 'robots.txt').write_text('User-agent: *\nDisallow: /\n')
(destination / 'vercel.json').write_text(json.dumps({
    'version': 2, 'framework': None, 'buildCommand': '', 'installCommand': '', 'outputDirectory': '.',
    'rewrites': [{'source': '/r/:restaurant/admin/:path*', 'destination': '/index.html'}],
    'headers': [{'source': '/(.*)', 'headers': [
        {'key': 'X-Robots-Tag', 'value': 'noindex, nofollow, noarchive'},
        {'key': 'X-Content-Type-Options', 'value': 'nosniff'},
        {'key': 'X-Frame-Options', 'value': 'DENY'},
    ]}, {'source': f'/{speech_path.as_posix()}/:asset', 'headers': [
        {'key': 'Cache-Control', 'value': 'public, max-age=31536000, immutable'},
    ]}] + [
        {'source': f'/{speech_path.as_posix()}/{name}', 'headers': [
            {'key': 'Content-Type', 'value': 'application/wasm' if name.endswith('.wasm') else 'application/octet-stream'},
        ]}
        for name in speech_files if Path(name).suffix in {'.wasm', '.onnx'}
    ],
}, indent=2) + '\n')
files = [file for file in destination.rglob('*') if file.is_file()]
speech_allowlist = {speech_path / name for name in [*speech_files, 'manifest.json']}
assert all(file.relative_to(destination) in speech_allowlist
           or file.suffix in ('.html', '.js', '.css', '.svg', '.png', '.jpeg', '.txt', '.json') for file in files)
print(json.dumps({'directory': str(destination), 'files': [
    {'path': str(file.relative_to(destination)), 'bytes': file.stat().st_size,
     'sha256': hashlib.sha256(file.read_bytes()).hexdigest()} for file in sorted(files)
]}, ensure_ascii=False, indent=2))
