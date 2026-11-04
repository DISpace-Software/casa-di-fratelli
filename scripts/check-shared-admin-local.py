#!/usr/bin/env python3
"""Verify shared administration against two new, disposable local PostgreSQL DBs.

Never reads existing database configuration or accepts a database URL. Requires
PostgreSQL CLI tools and .NET 8. --hold keeps the verified local fixture available
for browser inspection until SIGINT/SIGTERM; its credential state is mode 0600.
"""
import argparse
import copy
import datetime
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
CASA = 'casa-di-fratelli'
COFEIN = 'cofein'


def free_port():
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        return listener.getsockname()[1]


def private_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x') as output:
        os.chmod(path, 0o600)
        json.dump(value, output, ensure_ascii=False, indent=2)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fixtures-root', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--origin', default='http://127.0.0.1:5176')
    parser.add_argument('--api-port', type=int, default=0)
    parser.add_argument('--hold', action='store_true')
    parser.add_argument('--state-file', type=Path, default=Path('/tmp/shared-admin-local.json'))
    args = parser.parse_args()
    parsed_origin = urllib.parse.urlsplit(args.origin)
    if parsed_origin.scheme != 'http' or parsed_origin.hostname not in ('localhost', '127.0.0.1') or parsed_origin.path or parsed_origin.query or parsed_origin.fragment or parsed_origin.username:
        parser.error('--origin must be a local HTTP origin without path or credentials')
    if not 0 <= args.api_port <= 65535:
        parser.error('Invalid API port')
    if args.hold and args.state_file.exists():
        parser.error('State file already exists; stop its owner or choose another path')
    source_plan = json.loads((args.fixtures_root / 'docs/cofein-floor-plan.initial.json').read_text())
    assert len(source_plan['tables']) == 30 and sum(x['seats'] for x in source_plan['tables']) == 150
    menu, skipped = [], []
    for kind, department in [('food', 'Kitchen'), ('drinks', 'Bar')]:
        for group in json.loads((args.fixtures_root / f'frontend/src/cofein/data/menu-{kind}.json').read_text()):
            for item in group['items']:
                if item['priceEur'] is None:
                    skipped.append(f'{kind}:{item["id"]}')
                    continue
                assert item['priceEur'] > 0
                menu.append({'nameBg': item['name'], 'descriptionBg': item.get('description', ''), 'weight': item.get('portion', ''), 'price': item['priceEur'], 'department': department, 'category': group['id'], 'isActive': True, 'notifySubscribers': False})
    assert len(menu) == 290 and len(skipped) == 1
    env = {key: value for key, value in os.environ.items() if key in ('PATH', 'HOME', 'TMPDIR', 'DOTNET_ROOT', 'LANG', 'LC_ALL')}
    env.update({'ASPNETCORE_ENVIRONMENT': 'Development', 'DOTNET_CLI_TELEMETRY_OPTOUT': '1'})
    pg_port, api_port = free_port(), args.api_port or free_port()
    while pg_port == api_port:
        pg_port = free_port()
    base = f'http://127.0.0.1:{api_port}'
    passwords = {tenant: secrets.token_urlsafe(24) for tenant in (CASA, COFEIN)}
    env['PGPASSWORD'] = secrets.token_urlsafe(24)
    stopped = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stopped.set())
    checks = []
    report = {'localOnly': True, 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'checks': checks}

    def check(label, condition=True):
        checks.append({'name': label, 'passed': bool(condition)})
        if not condition:
            raise AssertionError(label)

    def command(*arguments, **options):
        result = subprocess.run(arguments, capture_output=True, text=True, env=env, **options)
        if result.returncode:
            raise RuntimeError(f'{Path(arguments[0]).name} failed ({result.returncode}): {result.stderr[-3000:]} {result.stdout[-3000:]}')
        return result.stdout

    def request(path, tenant=COFEIN, method='GET', data=None, token=None, headers=None):
        request_headers = {'Content-Type': 'application/json', 'Origin': args.origin}
        if tenant is not None:
            request_headers['X-Tenant-Id'] = tenant
        if token:
            request_headers['X-Admin-Token'] = token
        request_headers.update(headers or {})
        req = urllib.request.Request(base + path, method=method, headers=request_headers, data=json.dumps(data).encode() if data is not None else None)
        try:
            response = urllib.request.urlopen(req, timeout=30)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            raw = response.read().decode()
            try:
                payload = json.loads(raw) if raw else None
            except ValueError:
                payload = raw
            return response.status, payload, dict(response.headers)

    def expect(path, expected=200, **options):
        status, payload, headers = request(path, **options)
        if status != expected:
            raise AssertionError(f'{options.get("method", "GET")} {path}: expected {expected}, got {status}')
        if status == 200 and options.get('method') != 'OPTIONS':
            actual_tenant = headers.get('X-Tenant-Id') or headers.get('x-tenant-id')
            if actual_tenant != options.get('tenant', COFEIN):
                raise AssertionError(f'{path}: incorrect tenant response')
        return payload

    api, postgres_started, state_written = None, False, False
    with tempfile.TemporaryDirectory(prefix='shared-admin-check-') as directory:
        runtime = Path(directory)
        data_dir = runtime / 'postgres'
        log_path = runtime / 'api.log'
        try:
            command('dotnet', 'build', str(ROOT / 'backend/SeatMap.Api'), '-v:q')
            password_file = runtime / 'postgres-password'
            password_file.write_text(env['PGPASSWORD'])
            password_file.chmod(0o600)
            command('initdb', '-D', str(data_dir), '--auth-local=trust', '--auth-host=scram-sha-256', '-U', 'shared_admin_test', '--pwfile', str(password_file))
            command('pg_ctl', '-D', str(data_dir), '-l', str(runtime / 'postgres.log'), '-o', f'-p {pg_port} -h 127.0.0.1 -k {runtime}', 'start')
            postgres_started = True
            tenants, connections, databases = [], {}, {}
            for tenant_id, title, suffix in [(CASA, 'Casa di Fratelli', 'Casa'), (COFEIN, 'Cofein', 'Cofein')]:
                database = f'shared_admin_{suffix.lower()}'
                databases[tenant_id] = database
                command('createdb', '-h', '127.0.0.1', '-p', str(pg_port), '-U', 'shared_admin_test', database)
                connections[f'Restaurant{suffix}'] = f'Host=127.0.0.1;Port={pg_port};Database={database};Username=shared_admin_test;Password={env["PGPASSWORD"]}'
                tenants.append({'Id': tenant_id, 'Name': title, 'Slug': tenant_id, 'Domain': f'{suffix.lower()}.example.test', 'FrontendUrl': f'http://{suffix.lower()}.example.test', 'FrontendOrigins': [f'http://{suffix.lower()}.example.test'], 'IsActive': True, 'IsListed': False, 'SeedDefaultMenu': False, 'DatabaseMode': 'DedicatedDatabase', 'ConnectionStringKey': f'Restaurant{suffix}', 'AdminEmailConfigurationKey': f'{suffix.upper()}_LOCAL_EMAIL', 'AdminPasswordConfigurationKey': f'{suffix.upper()}_LOCAL_PASSWORD', 'ReservationConfirmationMode': 'Automatic', 'NotificationsEnabled': False})
            config = {'ConnectionStrings': connections, 'Tenancy': {'RequireKnownTenant': True, 'MigrateOnStartup': False, 'DefaultTenant': tenants[0], 'Tenants': tenants}, 'Platform': {'Enabled': False, 'FrontendOrigins': [args.origin]}, 'Logging': {'LogLevel': {'Default': 'Warning'}}}
            for tenant in tenants:
                config[tenant['AdminEmailConfigurationKey']] = 'owner@shared-admin.example.test'
                config[tenant['AdminPasswordConfigurationKey']] = passwords[tenant['Id']]
            private_json(runtime / 'appsettings.json', config)
            dll = str(ROOT / 'backend/SeatMap.Api/bin/Debug/net8.0/SeatMap.Api.dll')
            command('dotnet', dll, '--contentRoot', directory, '--MigrateRestaurants=true', cwd=directory)

            def sql(tenant, statement):
                return command('psql', '-h', '127.0.0.1', '-p', str(pg_port), '-U', 'shared_admin_test', '-d', databases[tenant], '-X', '-w', '-v', 'ON_ERROR_STOP=1', '-Atc', statement).strip()

            for tenant in (CASA, COFEIN):
                sql(tenant, 'INSERT INTO "AppSettings" ("Key", "Value", "UpdatedAtUtc") VALUES (\'ProductTier\', \'Pro\', now()) ON CONFLICT ("Key") DO UPDATE SET "Value" = \'Pro\'')
            with log_path.open('w') as log:
                api = subprocess.Popen(['dotnet', dll, '--contentRoot', directory, f'--urls={base}'], cwd=directory, env=env, stdout=log, stderr=subprocess.STDOUT)
                for _ in range(180):
                    if api.poll() is not None:
                        raise RuntimeError('Isolated API exited during startup')
                    try:
                        if request('/api/floor-plan')[0] == 200:
                            break
                    except (OSError, urllib.error.URLError):
                        pass
                    if stopped.wait(.25):
                        raise RuntimeError('Startup stopped')
                else:
                    raise RuntimeError('API startup timed out')
                auth = {tenant: expect('/api/admin/login', tenant=tenant, method='POST', data={'email': 'owner@shared-admin.example.test', 'password': passwords[tenant]}) for tenant in (CASA, COFEIN)}
                cf, ca = auth[COFEIN]['token'], auth[CASA]['token']
                check('same email authenticates independently with different tenant passwords')
                for tenant in (CASA, COFEIN):
                    context = expect('/api/admin/context', tenant=tenant)
                    check(f'public admin context resolves {tenant} without returning credentials', context['tenantId'] == tenant and set(context) == {'tenantId', 'name', 'frontendUrl', 'notificationsEnabled'} and context['notificationsEnabled'] is False)
                # The shared build packages this exact Casa asset. Keep browser
                # checks local instead of depending on a fake website hostname.
                local_casa_branding = expect('/api/branding', tenant=CASA)
                local_casa_branding['logoUrl'] = args.origin + '/casa-di-fratelli-logo.svg'
                expect('/api/branding', tenant=CASA, method='PUT', token=ca, data=local_casa_branding)
                for tenant, other in [(CASA, COFEIN), (COFEIN, CASA)]:
                    expect('/api/admin/me', tenant=tenant, token=auth[tenant]['token'])
                    expect('/api/admin/me', tenant=tenant, token=auth[other]['token'], expected=401)
                    expect('/api/admin/login', tenant=tenant, method='POST', data={'email': 'owner@shared-admin.example.test', 'password': passwords[other]}, expected=401)
                check('sessions and passwords cannot cross tenant databases')
                expect('/api/admin/me', token=cf, tenant='unknown', expected=404)
                expect('/api/admin/me', token=cf, tenant=None, expected=404)
                expect('/api/admin/me', token=cf, headers={'Origin': 'http://casa.example.test'}, expected=404)
                check('unknown, missing and conflicting tenant selectors fail closed')
                status, _, headers = request('/api/admin/login', tenant=None, method='OPTIONS', headers={'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-tenant-id,x-admin-token'})
                check('shared origin CORS preflight allows tenant and authentication headers', status == 204 and headers.get('Access-Control-Allow-Origin') == args.origin)
                device = secrets.token_urlsafe(40)
                expect('/api/admin/devices', tenant=CASA, token=ca, method='POST', data={'label': 'Disposable verification device', 'credentialToken': device})
                expect('/api/admin/device-login', tenant=CASA, method='POST', data={'credentialToken': device})
                expect('/api/admin/device-login', token=None, method='POST', data={'credentialToken': device}, expected=401)
                check('registered device credential is tenant-scoped')
                check('fresh Cofein contains no Casa defaults', expect('/api/floor-plan')['tables'] == [] and expect('/api/menu') == [])
                initial_plan = expect('/api/floor-plan')
                draft = copy.deepcopy(source_plan)
                draft['revision'] = initial_plan['revision']
                saved_plan = expect('/api/floor-plan', method='PUT', token=cf, data=draft)
                for payload in menu:
                    expect('/api/menu', method='POST', token=cf, data=payload)
                casa_menu = {'nameBg': 'Локално тестово ястие Casa', 'descriptionBg': 'Изолирани тестови данни', 'price': 9.25, 'department': 'Kitchen', 'category': 'pasta', 'isActive': True, 'notifySubscribers': False}
                expect('/api/menu', tenant=CASA, method='POST', token=ca, data=casa_menu)
                check('approved Cofein data imported without guessing missing EUR price', len(expect('/api/menu')) == 290 and len(saved_plan['tables']) == 30 and sum(x['seats'] for x in saved_plan['tables']) == 150 and saved_plan['combinations'] == [])
                casa_before = {path: expect(path, tenant=CASA, token=ca) for path in ['/api/floor-plan', '/api/menu', '/api/branding', '/api/reservations']}
                module_paths = ['/api/product-tier', '/api/reservations', '/api/reservations/public-table-holds', '/api/dining-orders', '/api/menu', '/api/customers', '/api/blacklist', '/api/inventory/items', '/api/inventory/movements', '/api/inventory/audits', '/api/recipes/summary', '/api/floor-plan', '/api/table-layouts', '/api/events/admin', '/api/marketing/settings', '/api/marketing/history', '/api/feedback', '/api/feedback/emails', '/api/admin/users', '/api/admin/audit', '/api/maintenance/backups', '/api/maintenance/backups/settings', '/api/maintenance/reservations/archive?kind=deleted', '/api/restaurant-closure', '/api/seasonal-zones']
                for tenant in (CASA, COFEIN):
                    token = auth[tenant]['token']
                    for path in module_paths:
                        expect(path, tenant=tenant, token=token)
                    check(f'all {len(module_paths)} shared admin module data endpoints work for {tenant}', expect('/api/product-tier', tenant=tenant, token=token)['isPro'])
                before_menu = expect('/api/menu')
                expect('/api/menu/seed', method='POST', token=cf, expected=409)
                check('Cofein cannot seed Casa menu', expect('/api/menu') == before_menu)
                payload = dict(casa_menu, nameBg='Временен тест Cofein', category='verification-cofein', price=7.35)
                created = expect('/api/menu', method='POST', token=cf, data=payload)
                payload.update(nameBg='Редактиран тест Cofein', price=8.45)
                expect(f'/api/menu/{created["id"]}', method='PUT', token=cf, data=payload)
                edited = next(x for x in expect('/api/v1/restaurants/cofein/menu') if x['id'] == created['id'])
                check('admin menu update is visible through Cofein public API', edited['nameBg'] == payload['nameBg'] and edited['price'] == payload['price'])
                expect(f'/api/menu/{created["id"]}', method='DELETE', token=cf)
                check('menu deletion affects only chosen Cofein item', len(expect('/api/menu')) == 290)
                expect('/api/floor-plan', method='PUT', token=ca, data=saved_plan, expected=401)
                edited_tables = copy.deepcopy(saved_plan['tables'])
                edited_tables[0]['seats'] = 6
                expect('/api/table-layouts', method='PUT', token=cf, data=edited_tables, headers={'If-Match': f'"{saved_plan["revision"]}"'})
                changed_plan = expect('/api/floor-plan')
                check('existing table editor changes real Cofein table capacity and preserves zones', changed_plan['tables'][0]['seats'] == 6 and changed_plan['zones'] == saved_plan['zones'] and changed_plan['combinations'] == [])
                expect('/api/table-layouts', method='PUT', token=cf, data=saved_plan['tables'], headers={'If-Match': f'"{saved_plan["revision"]}"'}, expected=428)
                expect('/api/floor-plan', method='PUT', token=cf, data=saved_plan, expected=409)
                check('both full-plan and legacy table-save reject stale revisions', expect('/api/floor-plan') == changed_plan)
                expect('/api/table-layouts', method='PUT', token=cf, data=saved_plan['tables'], headers={'If-Match': f'"{changed_plan["revision"]}"'})
                final_plan = expect('/api/floor-plan')
                check('Cofein provisional map restored to 30 tables and 150 seats', len(final_plan['tables']) == 30 and sum(t['seats'] for t in final_plan['tables']) == 150)
                booking_date = (datetime.date.today() + datetime.timedelta(days=2)).isoformat()
                reservation = {'guestName': 'Локален тестов гост', 'phone': '+359000000001', 'email': 'local-test@example.test', 'guestCount': 4, 'area': 'exterior', 'reservedDate': booking_date, 'reservedTime': '12:00', 'privacyConsent': True, 'tableIds': ['T01']}
                booking = expect('/api/v1/restaurants/cofein/reservations', method='POST', data=reservation)
                check('public booking is automatically approved', booking['status'] == 'Approved' and booking['requiresEmailConfirmation'] is False)
                check('full shared administration sees the new Cofein booking', any(x['id'] == booking['id'] for x in expect('/api/reservations', token=cf)))
                expect('/api/v1/restaurants/cofein/reservations', method='POST', data=reservation, expected=409)
                expect(f'/api/reservations/{booking["id"]}/cancel', method='PATCH', token=cf)
                check('admin cancel releases occupied Cofein table', not any('T01' in x.get('tableIds', []) for x in expect('/api/reservations/blocked-slots')))
                policy = expect('/api/admin/push/config', token=cf)
                check('disabled notification policy is explicit and has no public key', policy.get('enabled') is False and policy.get('publicKey') is None)
                expect('/api/admin/push/subscriptions', method='POST', token=cf, data={'endpoint': 'https://push.example.test/local-only', 'keys': {'p256dh': 'local-test', 'auth': 'local-test'}}, expected=409)
                notification_counts = {
                    'pushSubscriptions': int(sql(COFEIN, 'SELECT count(*) FROM "AdminPushSubscriptions"')),
                    'vapidKeys': int(sql(COFEIN, 'SELECT count(*) FROM "AppSettings" WHERE "Key" ILIKE \'%vapid%\'')),
                    'visitFeedbackEmails': int(sql(COFEIN, 'SELECT count(*) FROM "VisitFeedbackEmails"')),
                    'emailConfirmationTokens': int(sql(COFEIN, 'SELECT count(*) FROM "Reservations" WHERE "EmailConfirmationTokenHash" IS NOT NULL')),
                }
                check('disabled notifications create no subscriptions, keys or queued confirmation/feedback', not any(notification_counts.values()))
                check('Cofein writes leave Casa map, menu, branding and reservations unchanged', casa_before == {path: expect(path, tenant=CASA, token=ca) for path in casa_before})
                report.update({'passed': True, 'finishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'counts': {'checks': len(checks), 'cofeinMenu': 290, 'cofeinTables': 30, 'cofeinSeats': 150, 'moduleEndpointsPerTenant': len(module_paths)}, 'notifications': notification_counts, 'uncertainMenuItemsSkipped': skipped})
                args.report.parent.mkdir(parents=True, exist_ok=True)
                args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
                print(json.dumps({'passed': True, 'checks': len(checks), 'report': str(args.report), 'apiUrl': base}, ensure_ascii=False), flush=True)
                if args.hold:
                    private_json(args.state_file, {'localOnly': True, 'ownerPid': os.getpid(), 'apiPid': api.pid, 'apiUrl': base, 'origin': args.origin, 'runtimeDirectory': directory, 'tenants': {tenant: {'email': 'owner@shared-admin.example.test', 'password': passwords[tenant], 'auth': auth[tenant]} for tenant in (CASA, COFEIN)}})
                    state_written = True
                    print(json.dumps({'stateFile': str(args.state_file), 'stop': f'kill -TERM {os.getpid()}'}), flush=True)
                    stopped.wait()
        except Exception as error:
            report.update({'passed': False, 'error': str(error), 'finishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()})
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
            # Logs remain private during --hold; only a concise failure is emitted.
            print(json.dumps({'passed': False, 'error': str(error), 'report': str(args.report)}, ensure_ascii=False), flush=True)
            raise
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
