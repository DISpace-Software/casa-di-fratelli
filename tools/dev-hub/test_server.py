"""Exercise real HTTP boundaries and subprocess ownership without restaurant data."""
import importlib.util
import json
from pathlib import Path
import threading
import unittest
from unittest.mock import patch
from urllib.request import Request, urlopen
from urllib.error import HTTPError

spec = importlib.util.spec_from_file_location('hub', Path(__file__).with_name('server.py'))
hub = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hub)


class LauncherChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http = hub.ThreadingHTTPServer(('127.0.0.1', 0), hub.Handler)
        cls.origin = f'http://127.0.0.1:{cls.http.server_port}'
        cls.thread = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()
        cls.thread.join()

    def post(self, path, origin=None):
        return urlopen(Request(self.origin + path, method='POST', headers={
            'Origin': origin or self.origin, 'X-SeatMap-Launcher': '1'}))

    def test_catalog_has_no_credentials_and_workspaces_exist(self):
        data = json.load(urlopen(self.origin + '/api/catalog'))
        for item in data['components']:
            self.assertTrue((hub.ROOT / 'workspaces' / (item['workspace'] + '.code-workspace')).is_file())
            self.assertTrue((hub.ROOT / item['source']).is_dir())
        self.assertNotIn('connectionString', json.dumps(data))

    def test_foreign_origin_cannot_execute(self):
        with self.assertRaises(HTTPError) as error:
            self.post('/api/casa/start', 'https://foreign.example')
        self.assertEqual(error.exception.code, 403)

    def test_host_rebinding_rejected(self):
        with self.assertRaises(HTTPError) as error:
            urlopen(Request(self.origin + '/api/catalog', headers={'Host': 'foreign.example'}))
        self.assertEqual(error.exception.code, 403)

    def test_no_arbitrary_command_or_backend_execution(self):
        for path, status in [('/api/shell/start', 404), ('/api/api/start', 409), ('/api/casa/deploy', 404)]:
            with self.assertRaises(HTTPError) as error:
                self.post(path)
            self.assertEqual(error.exception.code, status)

    def test_external_port_cannot_be_claimed(self):
        with patch.object(hub, 'port_open', return_value=True), patch.object(hub.subprocess, 'Popen') as spawn:
            with self.assertRaises(ValueError): hub.start('casa')
            spawn.assert_not_called()

    def test_start_is_allowlisted_and_uses_local_api(self):
        with patch.object(hub, 'port_open', return_value=False), patch.object(hub, 'executable', return_value='/usr/bin/npm'), patch.object(hub.subprocess, 'Popen') as spawn:
            spawn.return_value.poll.return_value = None
            hub.start('cofein')
            hub.start('cofein')
            self.assertEqual(spawn.call_count, 1)
            args, kwargs = spawn.call_args
            self.assertEqual(args[0], ['/usr/bin/npm', 'run', 'dev:cofein'])
            self.assertEqual(kwargs['env']['VITE_COFEIN_API_BASE_URL'], 'http://localhost:5183')
            self.assertTrue(kwargs['start_new_session'])
            hub.PROCESSES.clear()


if __name__ == '__main__': unittest.main()
