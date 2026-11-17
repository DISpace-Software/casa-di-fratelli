#!/usr/bin/env python3
"""Hold three disposable local restaurant databases for shared dictation checks.

No production credentials, existing database URLs or speech-service tokens are
accepted. SIGTERM stops the owned API/PostgreSQL and removes the private state.
"""
import argparse
import json
import os
from pathlib import Path
import secrets
import signal
import socket
import subprocess
import tempfile
import threading
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
TENANTS = [('casa-di-fratelli', 'Casa di Fratelli', 'Casa'),
           ('cofein', 'Cofein', 'Cofein'),
           ('voice-future-test', 'Future Restaurant', 'Future')]


def private_json(path, value):
    with path.open('x') as output:
        os.chmod(path, 0o600)
        json.dump(value, output, ensure_ascii=False, indent=2)


def free_port():
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        return listener.getsockname()[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fixtures-root', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--state-file', type=Path, required=True)
    parser.add_argument('--origin', default='http://127.0.0.1:5190')
    parser.add_argument('--api-port', type=int, default=8890)
    parser.add_argument('--pro-tenant', action='append', default=[], choices=[row[0] for row in TENANTS])
    args = parser.parse_args()
    origin = urllib.parse.urlsplit(args.origin)
    if origin.scheme != 'http' or origin.hostname != '127.0.0.1' or origin.path or origin.query or origin.fragment or origin.username:
        parser.error('--origin must be a 127.0.0.1 HTTP origin')
    if not 1 <= args.api_port <= 65535 or args.state_file.exists():
        parser.error('Choose a valid API port and unused private state path')
    stopped = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stopped.set())
    env = {key: value for key, value in os.environ.items()
           if key in ('PATH', 'HOME', 'TMPDIR', 'DOTNET_ROOT', 'LANG', 'LC_ALL')}
    env.update({'ASPNETCORE_ENVIRONMENT': 'Development', 'DOTNET_CLI_TELEMETRY_OPTOUT': '1',
                'PGPASSWORD': secrets.token_urlsafe(32)})
    passwords = {tenant: secrets.token_urlsafe(32) for tenant, _, _ in TENANTS}
    api_url = f'http://127.0.0.1:{args.api_port}'
    pg_port = free_port()
    while pg_port == args.api_port:
        pg_port = free_port()
    checks = []

    def command(*arguments, **options):
        result = subprocess.run(arguments, capture_output=True, text=True, env=env, **options)
        if result.returncode:
            # Configuration and runtime logs may contain credentials; keep private.
            raise RuntimeError(f'{Path(arguments[0]).name} exited {result.returncode}')
        return result.stdout

    def request(path, tenant, method='GET', data=None, token=None, expected=200):
        headers = {'Content-Type': 'application/json', 'Origin': args.origin, 'X-Tenant-Id': tenant}
        if token:
            headers['X-Admin-Token'] = token
        req = urllib.request.Request(api_url + path, method=method, headers=headers,
                                     data=json.dumps(data).encode() if data is not None else None)
        try:
            response = urllib.request.urlopen(req, timeout=30)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            if response.status != expected:
                raise AssertionError(f'{tenant} {method} {path}: {response.status}, expected {expected}')
            raw = response.read().decode()
            return json.loads(raw) if raw else None

    with tempfile.TemporaryDirectory(prefix='reservation-voice-check-') as directory:
        runtime = Path(directory)
        api, postgres_started, state_written = None, False, False
        try:
            command('dotnet', 'build', str(ROOT / 'backend/SeatMap.Api'), '-v:q', '-p:UseAppHost=false')
            password_file = runtime / 'postgres-password'
            password_file.write_text(env['PGPASSWORD'])
            password_file.chmod(0o600)
            data_dir = runtime / 'postgres'
            command('initdb', '-D', str(data_dir), '--auth-local=trust', '--auth-host=scram-sha-256',
                    '-U', 'voice_test', '--pwfile', str(password_file))
            command('pg_ctl', '-D', str(data_dir), '-l', str(runtime / 'postgres.log'),
                    '-o', f'-p {pg_port} -h 127.0.0.1 -k {runtime}', 'start')
            postgres_started = True
            tenants, connections, databases = [], {}, {}
            for tenant_id, title, suffix in TENANTS:
                database = f'voice_{suffix.lower()}'
                databases[tenant_id] = database
                command('createdb', '-h', '127.0.0.1', '-p', str(pg_port), '-U', 'voice_test', database)
                connections[f'Restaurant{suffix}'] = f'Host=127.0.0.1;Port={pg_port};Database={database};Username=voice_test;Password={env["PGPASSWORD"]}'
                tenants.append({'Id': tenant_id, 'Name': title, 'Slug': tenant_id,
                    'Domain': f'{suffix.lower()}.example.test', 'FrontendUrl': args.origin,
                    'FrontendOrigins': [f'http://{suffix.lower()}.example.test'], 'IsActive': True, 'IsListed': False,
                    'SeedDefaultMenu': False, 'DatabaseMode': 'DedicatedDatabase',
                    'ConnectionStringKey': f'Restaurant{suffix}',
                    'AdminEmailConfigurationKey': f'{suffix.upper()}_LOCAL_EMAIL',
                    'AdminPasswordConfigurationKey': f'{suffix.upper()}_LOCAL_PASSWORD',
                    'ReservationConfirmationMode': 'Automatic', 'NotificationsEnabled': False})
            config = {'ConnectionStrings': connections,
                'Tenancy': {'RequireKnownTenant': True, 'MigrateOnStartup': False,
                            'DefaultTenant': tenants[0], 'Tenants': tenants},
                'Platform': {'Enabled': False, 'FrontendOrigins': [args.origin]},
                'Logging': {'LogLevel': {'Default': 'Warning'}}}
            for tenant in tenants:
                config[tenant['AdminEmailConfigurationKey']] = 'owner@voice-fixture.example.test'
                config[tenant['AdminPasswordConfigurationKey']] = passwords[tenant['Id']]
            private_json(runtime / 'appsettings.json', config)
            dll = str(ROOT / 'backend/SeatMap.Api/bin/Debug/net8.0/SeatMap.Api.dll')
            command('dotnet', dll, '--contentRoot', directory, '--MigrateRestaurants=true', cwd=directory)
            for tenant, _, _ in TENANTS:
                tier = 'Pro' if tenant in args.pro_tenant else 'Basic'
                command('psql', '-h', '127.0.0.1', '-p', str(pg_port), '-U', 'voice_test',
                        '-d', databases[tenant], '-X', '-w', '-v', 'ON_ERROR_STOP=1', '-Atc',
                        f'''INSERT INTO "AppSettings" ("Key", "Value", "UpdatedAtUtc")
                            VALUES ('ProductTier', '{tier}', now())
                            ON CONFLICT ("Key") DO UPDATE SET "Value" = '{tier}' ''')
            with (runtime / 'api.log').open('w') as log:
                api = subprocess.Popen(['dotnet', dll, '--contentRoot', directory, f'--urls={api_url}'],
                                       cwd=directory, env=env, stdout=log, stderr=subprocess.STDOUT)
                for _ in range(180):
                    if api.poll() is not None:
                        raise RuntimeError('Owned API exited during startup')
                    try:
                        request('/api/admin/context', 'casa-di-fratelli')
                        break
                    except (OSError, urllib.error.URLError):
                        if stopped.wait(.25):
                            raise RuntimeError('Startup cancelled')
                else:
                    raise RuntimeError('Owned API startup timed out')
                auth = {tenant: request('/api/admin/login', tenant, 'POST',
                        {'email': 'owner@voice-fixture.example.test', 'password': passwords[tenant]})
                        for tenant, _, _ in TENANTS}
                cofein = json.loads((args.fixtures_root / 'docs/cofein-floor-plan.initial.json').read_text())
                future = {'schemaVersion': 1, 'zones': [{'id': 'future-hall', 'name': 'Нова зала',
                    'presentation': 'plain', 'isActive': True}], 'tables': [
                    {'id': 'N1', 'area': 'future-hall', 'x': 30, 'y': 35, 'seats': 4, 'isActive': True},
                    {'id': 'N2', 'area': 'future-hall', 'x': 65, 'y': 65, 'seats': 4, 'isActive': True}],
                    'combinations': [], 'publicMaxGuests': 8, 'publicMaxTables': 1}
                for tenant, plan in [('cofein', cofein), ('voice-future-test', future)]:
                    plan['revision'] = request('/api/floor-plan', tenant)['revision']
                    request('/api/floor-plan', tenant, 'PUT', plan, auth[tenant]['token'])
                state_tenants = {}
                for tenant, _, _ in TENANTS:
                    token = auth[tenant]['token']
                    tier = request('/api/product-tier', tenant, token=token)
                    assert tier['tier'] == ('Pro' if tenant in args.pro_tenant else 'Basic')
                    context = request('/api/admin/context', tenant)
                    assert context['tenantId'] == tenant and context['notificationsEnabled'] is False
                    checks.append({'tenant': tenant, 'tier': tier['tier'], 'tableCount':
                        len(request('/api/floor-plan', tenant)['tables']), 'passed': True})
                    assert request('/api/reservations', tenant, token=token) == []
                    state_tenants[tenant] = {'email': 'owner@voice-fixture.example.test',
                        'password': passwords[tenant], 'auth': auth[tenant], 'tier': tier['tier']}
                args.report.parent.mkdir(parents=True, exist_ok=True)
                args.report.write_text(json.dumps({'passed': True, 'localOnly': True, 'checks': checks}, indent=2))
                private_json(args.state_file, {'localOnly': True, 'ownerPid': os.getpid(), 'apiPid': api.pid,
                    'apiUrl': api_url, 'origin': args.origin, 'runtimeDirectory': directory,
                    'voiceTenants': list(state_tenants), 'tenants': state_tenants})
                state_written = True
                print(json.dumps({'passed': True, 'report': str(args.report), 'ownerPid': os.getpid(),
                    'apiPid': api.pid, 'apiUrl': api_url, 'stateFile': str(args.state_file)}), flush=True)
                stopped.wait()
        finally:
            if api and api.poll() is None:
                api.terminate()
                try:
                    api.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    api.kill()
                    api.wait()
            if postgres_started:
                command('pg_ctl', '-D', str(data_dir), '-m', 'fast', 'stop')
            if state_written:
                args.state_file.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
