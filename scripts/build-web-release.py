#!/usr/bin/env python3
"""Build one web target into Vercel Build Output API v3, locally or in CI.

Only public frontend configuration enters the build. Dependencies must first be
installed with `npm --prefix frontend ci`. No credentials or deployment actions.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent

def build(target):
    env = os.environ.copy()
    api = env.get('SEATMAP_PUBLIC_API_URL', 'https://casa-di-fratelli-api.onrender.com')
    if not api.startswith('https://'):
        raise SystemExit('Release API URL must use HTTPS')
    env.update(VITE_API_BASE_URL=api, VITE_COFEIN_API_BASE_URL=api,
               VITE_COFEIN_BOOKINGS_ENABLED='true')
    script = {'casa': 'build', 'cofein': 'build:cofein', 'admin': 'build:admin'}[target]
    subprocess.run(['npm', '--prefix', str(ROOT / 'frontend'), 'run', script], env=env, check=True)
    output = ROOT / '.vercel/output'
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)
    static = output / 'static'
    with tempfile.TemporaryDirectory(prefix='seatmap-package-') as temporary:
        package = Path(temporary) / 'release'
        if target == 'casa':
            shutil.copytree(ROOT / 'frontend/dist', static)
            settings = json.loads((ROOT / 'frontend/vercel.json').read_text())
        else:
            packager = 'package-cofein-site.py' if target == 'cofein' else 'package-shared-admin.py'
            subprocess.run(['python3', str(ROOT / 'scripts' / packager), str(package)],
                           stdout=subprocess.DEVNULL, check=True)
            settings = json.loads((package / 'vercel.json').read_text())
            (package / 'vercel.json').unlink()
            shutil.copytree(package, static)
    routes = []
    if target == 'casa':
        routes.append({'src': '/admin(?:/.*)?', 'status': 307,
                       'headers': {'Location': 'https://seatmap-admin-eight.vercel.app/r/casa-di-fratelli/admin'}})
    for entry in settings.get('headers', []):
        routes.append({'src': entry['source'], 'headers': {h['key']: h['value'] for h in entry['headers']}, 'continue': True})
    routes.append({'handle': 'filesystem'})
    if target == 'casa':
        routes.append({'src': '/.*', 'dest': '/index.html'})
    elif target == 'admin':
        routes.append({'src': '/r/[^/]+/admin(?:/.*)?', 'dest': '/index.html'})
    else:
        routes.append({'src': '/cofein-preview.html', 'dest': '/index.html'})
    (output / 'config.json').write_text(json.dumps({'version': 3, 'routes': routes}, indent=2) + '\n')
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    (static / 'release.json').write_text(json.dumps({'application': target, 'commit': commit, 'api': api}, indent=2) + '\n')
    assert (static / 'index.html').is_file()
    assert list((static / 'assets').glob('*.js'))
    print(f'Release ready: {target}, commit {commit}, {output}')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('target', choices=['casa', 'cofein', 'admin'])
    build(parser.parse_args().target)
