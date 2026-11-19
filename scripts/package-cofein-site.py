#!/usr/bin/env python3
"""Package the isolated Cofein build without unrelated Casa/admin assets."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('destination', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
build = root / 'frontend/dist-cofein'
destination = args.destination.resolve()
if destination.exists():
    parser.error('Destination already exists; use a fresh release directory.')
if not (build / 'cofein-preview.html').is_file():
    parser.error('Run npm run build:cofein with the intended API configuration first.')
destination.mkdir(parents=True)
shutil.copyfile(build / 'cofein-preview.html', destination / 'index.html')
for directory in ('assets', 'cofein'):
    shutil.copytree(build / directory, destination / directory)
(destination / 'robots.txt').write_text('User-agent: *\nDisallow: /\n')
(destination / 'vercel.json').write_text(json.dumps({
    'version': 2, 'framework': None, 'buildCommand': '', 'installCommand': '', 'outputDirectory': '.',
    'rewrites': [{'source': '/cofein-preview.html', 'destination': '/index.html'}],
    'headers': [{'source': '/(.*)', 'headers': [
        {'key': 'X-Robots-Tag', 'value': 'noindex, nofollow, noarchive'},
        {'key': 'X-Content-Type-Options', 'value': 'nosniff'},
    ]}],
}, indent=2) + '\n')
print(json.dumps({'directory': str(destination), 'files': [
    {'path': str(file.relative_to(destination)), 'bytes': file.stat().st_size,
     'sha256': hashlib.sha256(file.read_bytes()).hexdigest()}
    for file in sorted(destination.rglob('*')) if file.is_file()
]}, ensure_ascii=False, indent=2))
