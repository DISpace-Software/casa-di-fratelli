#!/usr/bin/env python3
"""Loopback-only development launcher. Only catalogued frontend tasks can run.

No shell commands come from HTTP. Process groups are owned by this instance;
shutdown never kills an unrelated process that happens to use the same port.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import tempfile
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
CATALOG = json.loads((HERE / 'catalog.json').read_text())['components']
COMPONENTS = {item['id']: item for item in CATALOG}
PROCESSES = {}
LOCK = threading.Lock()
LOG_DIR = Path(tempfile.mkdtemp(prefix='seatmap-dev-hub-'))


def executable(name):
    """Prefer the project's supported Node over an older system installation."""
    if name == 'npm':
        for directory in sorted((Path.home() / '.nvm/versions/node').glob('v22.*'), reverse=True):
            if (directory / 'bin/npm').is_file():
                return str(directory / 'bin/npm')
    return shutil.which(name)


def port_open(port):
    try:
        with socket.create_connection(('127.0.0.1', port), timeout=.15):
            return True
    except OSError:
        return False


def stop(component_id):
    process = PROCESSES.get(component_id)
    if process and process.poll() is None:
        os.killpg(process.pid, signal.SIGTERM)
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
    PROCESSES.pop(component_id, None)


def start(component_id):
    item = COMPONENTS[component_id]
    if not item.get('task'):
        raise ValueError('Этот компонент не запускается из панели.')
    existing = PROCESSES.get(component_id)
    if existing and existing.poll() is None:
        return
    if port_open(item['port']):
        raise ValueError('Порт занят другим процессом. Панель не будет останавливать его.')
    npm = executable('npm')
    if not npm:
        raise ValueError('Установите Node.js 22 и npm.')
    env = os.environ.copy()
    env['PATH'] = str(Path(npm).parent) + os.pathsep + env.get('PATH', '')
    # Local preview never silently inherits the production API fallback.
    env.update(VITE_API_BASE_URL='http://localhost:5183',
               VITE_COFEIN_API_BASE_URL='http://localhost:5183',
               VITE_COFEIN_BOOKINGS_ENABLED='true')
    with (LOG_DIR / f'{component_id}.log').open('ab') as log:
        PROCESSES[component_id] = subprocess.Popen(
            [npm, 'run', item['task']], cwd=ROOT / 'frontend', env=env,
            stdout=log, stderr=subprocess.STDOUT, start_new_session=True)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def respond(self, status, body, content_type='application/json'):
        encoded = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'")
        self.end_headers()
        self.wfile.write(encoded)

    def valid_host(self):
        return self.headers.get('Host') == f'127.0.0.1:{self.server.server_port}'

    def do_GET(self):
        if not self.valid_host():
            return self.respond(403, {'error': 'Invalid host'})
        if self.path == '/api/catalog':
            with LOCK:
                result = []
                for item in CATALOG:
                    process = PROCESSES.get(item['id'])
                    running = process is not None and process.poll() is None
                    listening = port_open(item['port']) if item.get('port') else False
                    result.append(dict(item, owned=running,
                        state=('ready' if listening else 'starting') if running else ('external' if listening else 'stopped'),
                        exitCode=process.poll() if process else None,
                        workspaceUrl=(ROOT / 'workspaces' / (item['workspace'] + '.code-workspace')).as_uri()))
            return self.respond(200, {'components': result, 'apiBase': 'http://localhost:5183', 'logDirectory': str(LOG_DIR)})
        assets = {'/': ('index.html', 'text/html; charset=utf-8'), '/app.js': ('app.js', 'text/javascript'), '/style.css': ('style.css', 'text/css')}
        if self.path in assets:
            name, mime = assets[self.path]
            return self.respond(200, (HERE / name).read_bytes(), mime)
        return self.respond(404, {'error': 'Not found'})

    def do_POST(self):
        origin = f'http://127.0.0.1:{self.server.server_port}'
        if not self.valid_host() or self.headers.get('Origin') != origin or self.headers.get('X-SeatMap-Launcher') != '1':
            return self.respond(403, {'error': 'Same-origin launcher requests only'})
        parts = self.path.strip('/').split('/')
        if len(parts) != 3 or parts[0] != 'api' or parts[1] not in COMPONENTS or parts[2] not in ('start', 'stop'):
            return self.respond(404, {'error': 'Unknown action'})
        try:
            with LOCK:
                (start if parts[2] == 'start' else stop)(parts[1])
            self.respond(200, {'ok': True})
        except (ValueError, OSError) as error:
            self.respond(409, {'error': str(error)})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=4310)
    parser.add_argument('--open', action='store_true', help='Open the local panel in your browser')
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    print(f'SeatMap Dev Hub: http://127.0.0.1:{args.port}', flush=True)
    print(f'Local logs: {LOG_DIR}', flush=True)
    if args.open:
        webbrowser.open(f'http://127.0.0.1:{args.port}')
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        with LOCK:
            for component_id in list(PROCESSES):
                stop(component_id)


if __name__ == '__main__':
    main()
