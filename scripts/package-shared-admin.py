#!/usr/bin/env python3
"""Package only the shared administration build and its required public assets."""
import argparse
import hashlib
import json
from pathlib import Path
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
destination.mkdir(parents=True)
shutil.copyfile(build / 'admin.html', destination / 'index.html')
shutil.copytree(build / 'assets', destination / 'assets')
public_assets = [
    'admin-push-sw.js', 'restaurant-generic.svg', 'casa-di-fratelli-logo.svg',
    'casa-fratelli-icon-192.png', 'casa-fratelli-icon-512.png', 'favicon-48x48.png', 'favicon-96x96.png',
    'admin-role-chef.jpeg', 'admin-role-waiter.jpeg', 'admin-role-admin.jpeg',
    'admin-role-owner.jpeg', 'admin-role-developer.jpeg',
]
for name in public_assets:
    shutil.copyfile(build / name, destination / name)
(destination / 'robots.txt').write_text('User-agent: *\nDisallow: /\n')
(destination / 'vercel.json').write_text(json.dumps({
    'version': 2, 'framework': None, 'buildCommand': '', 'installCommand': '', 'outputDirectory': '.',
    'rewrites': [{'source': '/r/:restaurant/admin/:path*', 'destination': '/index.html'}],
    'headers': [{'source': '/(.*)', 'headers': [
        {'key': 'X-Robots-Tag', 'value': 'noindex, nofollow, noarchive'},
        {'key': 'X-Content-Type-Options', 'value': 'nosniff'},
        {'key': 'X-Frame-Options', 'value': 'DENY'},
    ]}],
}, indent=2) + '\n')
files = [file for file in destination.rglob('*') if file.is_file()]
assert all(file.suffix in ('.html', '.js', '.css', '.svg', '.png', '.jpeg', '.txt', '.json') for file in files)
print(json.dumps({'directory': str(destination), 'files': [
    {'path': str(file.relative_to(destination)), 'bytes': file.stat().st_size,
     'sha256': hashlib.sha256(file.read_bytes()).hexdigest()} for file in sorted(files)
]}, ensure_ascii=False, indent=2))
