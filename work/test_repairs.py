"""Regression tests for the reported launcher and DeepSeek configuration failures."""
import json
import os
import socket
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'outputs' / 'learning-grove'
sys.path.insert(0, str(APP))
from model_service import DEFAULT_BASE, DEFAULT_MODEL, ModelClient, normalize_base, protect_secret


class Fixture(BaseHTTPRequestHandler):
    seen = []
    status = 200
    content = 'OK'
    finish_reason = 'stop'

    def log_message(self, *args):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        type(self).seen.append((self.path, body, self.headers.get('Authorization')))
        if type(self).status != 200:
            self.send_response(type(self).status)
            self.end_headers()
            return
        payload = json.dumps({'choices': [{'finish_reason': type(self).finish_reason,
                                         'message': {'content': type(self).content}}]}).encode()
        self.send_response(200)
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


class Repairs(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='repair-', dir=ROOT / 'work')
        self.directory = Path(self.tmp.name)
        self.client = ModelClient(self.directory)
        self.fixture = ThreadingHTTPServer(('127.0.0.1', 0), Fixture)
        threading.Thread(target=self.fixture.serve_forever, daemon=True).start()
        Fixture.seen, Fixture.status, Fixture.content, Fixture.finish_reason = [], 200, 'OK', 'stop'
        self.base = f'http://127.0.0.1:{self.fixture.server_port}/v1'

    def tearDown(self):
        self.fixture.shutdown()
        self.fixture.server_close()
        self.tmp.cleanup()

    def configure(self, **extra):
        self.client.configure({'provider': 'deepseek', 'base_url': self.base, 'model': DEFAULT_MODEL,
                               'enabled': True, 'key': 'sk-local-fixture', 'remember': False, **extra})

    def test_deepseek_defaults_need_only_key(self):
        self.assertEqual(self.client.config['base_url'], DEFAULT_BASE)
        self.assertEqual(self.client.config['model'], DEFAULT_MODEL)
        self.client.configure({'key': 'sk-local-fixture', 'enabled': True})
        self.assertTrue(self.client.public()['enabled'])
        self.assertNotIn('key', self.client.public())

    def test_complete_endpoint_is_not_duplicated(self):
        self.configure(base_url=self.base + '/chat/completions/')
        self.client.probe()
        self.assertEqual(Fixture.seen[0][0], '/v1/chat/completions')
        self.assertEqual(normalize_base('https://api.deepseek.com/chat/completions'), DEFAULT_BASE)

    def test_plain_probe_does_not_require_json(self):
        self.configure()
        self.assertIn('连接成功', self.client.probe())
        body = Fixture.seen[-1][1]
        self.assertNotIn('response_format', body)
        self.assertEqual(body['max_tokens'], 32)
        self.assertEqual(body['thinking'], {'type': 'disabled'})

    def test_generation_uses_json_mode(self):
        self.configure()
        Fixture.content = '{"answer":"hello"}'
        result = self.client.structured('Return JSON: {"answer":"text"}', {'question': 'x'})
        self.assertEqual(result['answer'], 'hello')
        self.assertEqual(Fixture.seen[-1][1]['response_format'], {'type': 'json_object'})

    def test_error_codes_are_actionable(self):
        self.configure()
        for status, phrase in [(401, 'API Key'), (402, '余额不足'), (404, '不存在'), (429, '频繁'), (503, '繁忙')]:
            with self.subTest(status=status):
                Fixture.status = status
                with self.assertRaisesRegex(ValueError, phrase):
                    self.client.probe()

    def test_saved_key_is_encrypted_and_restored(self):
        if os.name != 'nt':
            self.skipTest('Windows DPAPI check')
        self.configure(remember=True)
        saved = self.client.path.read_text()
        self.assertNotIn('sk-local-fixture', saved)
        restored = ModelClient(self.directory)
        self.assertEqual(restored.config['key'], 'sk-local-fixture')
        self.assertTrue(restored.public()['enabled'])
        self.assertTrue(restored.public()['remember'])
        restored.probe()

    def test_key_can_be_cleared(self):
        self.configure(remember=True)
        self.client.configure({'enabled': False, 'clear_key': True, 'remember': False})
        restored = ModelClient(self.directory)
        self.assertFalse(restored.public()['has_key'])
        self.assertEqual(json.loads(self.client.path.read_text())['key_protected'], '')

    def test_cross_provider_does_not_reuse_secret(self):
        self.configure()
        with self.assertRaisesRegex(ValueError, 'API Key'):
            self.client.configure({'provider': 'deepseek', 'base_url': DEFAULT_BASE, 'enabled': True})
        self.assertEqual(self.client.config['base_url'], self.base)

    def test_invalid_config_preserves_previous(self):
        self.configure()
        before = dict(self.client.config)
        with self.assertRaises(ValueError):
            self.client.configure({'base_url': 'http://remote.example/v1', 'key': 'x'})
        self.assertEqual(before, self.client.config)

    def test_bearer_prefix_is_normalized(self):
        self.configure(key='  Bearer sk-local-fixture  ')
        self.client.probe()
        self.assertEqual(Fixture.seen[-1][2], 'Bearer sk-local-fixture')

    def test_empty_and_truncated_content_are_distinct(self):
        self.configure()
        Fixture.content = ''
        with self.assertRaisesRegex(ValueError, '没有返回正文'):
            self.client.probe()
        Fixture.content, Fixture.finish_reason = '{"answer":', 'length'
        with self.assertRaisesRegex(ValueError, '截断'):
            self.client.structured('JSON', {})

    def test_actual_cmd_from_other_working_directory(self):
        env = dict(os.environ, GROVE_DATA_DIR=str(self.directory), GROVE_NO_BROWSER='1', GROVE_NO_PAUSE='1',
                   PYTHONUTF8='1', DEEPSEEK_API_KEY='', MODEL_API_KEY='', MODEL_BASE_URL='', MODEL_NAME='')
        blocker = socket.socket()
        # If the older app is already using 8765, it provides the collision case.
        try:
            blocker.bind(('127.0.0.1', 8765))
            blocker.listen()
            blocked_here = True
        except OSError:
            blocker.close()
            blocked_here = False
        try:
            first = subprocess.run(['cmd.exe', '/d', '/c', str(APP / '启动知枝.cmd')], cwd=str(ROOT / 'work'),
                                   env=env, capture_output=True, timeout=25)
            self.assertEqual(first.returncode, 0, (first.stdout + first.stderr).decode('utf-8', errors='replace'))
            info = json.loads((self.directory / 'runtime.json').read_text())
            self.assertNotEqual(info['url'], 'http://127.0.0.1:8765')
            with urlopen(info['url'] + '/api/health') as response:
                health = json.load(response)
            self.assertEqual(health['version'], '0.2.0-deepseek')
            self.assertEqual(health['project_id'], info['project_id'])
            second = subprocess.run(['cmd.exe', '/d', '/c', str(APP / '启动知枝.cmd')], cwd=str(ROOT / 'work'),
                                    env=env, capture_output=True, timeout=25)
            self.assertEqual(second.returncode, 0)
            self.assertEqual(info['pid'], json.loads((self.directory / 'runtime.json').read_text())['pid'])
            # Exercise save-and-test over the actual application API, with unsaved field values.
            body = {'type': 'configure_test', 'enabled': True, 'provider': 'deepseek', 'base_url': self.base + '/chat/completions',
                    'model': DEFAULT_MODEL, 'key': 'sk-local-fixture', 'remember': True}
            req = Request(info['url'] + '/api/action', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
            with urlopen(req) as response:
                result = json.load(response)
            self.assertEqual(result['settings']['test_status'], 'passed')
            self.assertIn('连接成功', result['message'])
            self.assertNotIn('sk-local-fixture', json.dumps(result))
            Fixture.status = 402
            try:
                urlopen(req)
                self.fail('Expected insufficient-balance response')
            except HTTPError as error:
                result = json.load(error)
                self.assertTrue(result['settings_saved'])
                self.assertIn('余额不足', result['error'])
                self.assertTrue(result['settings']['has_key'])
            stopped_once = subprocess.run(['cmd.exe', '/d', '/c', str(APP / '停止知枝.cmd')], cwd=str(ROOT / 'work'),
                                          env=env, capture_output=True, timeout=20)
            self.assertEqual(stopped_once.returncode, 0)
            restarted = subprocess.run(['cmd.exe', '/d', '/c', str(APP / '启动知枝.cmd')], cwd=str(ROOT / 'work'),
                                      env=env, capture_output=True, timeout=25)
            self.assertEqual(restarted.returncode, 0)
            restored_info = json.loads((self.directory / 'runtime.json').read_text())
            self.assertNotEqual(restored_info['pid'], info['pid'])
            with urlopen(restored_info['url'] + '/api/state') as response:
                restored_settings = json.load(response)['settings']
            self.assertTrue(restored_settings['has_key'])
            self.assertTrue(restored_settings['enabled'])
            self.assertEqual(restored_settings['model'], DEFAULT_MODEL)
        finally:
            stopped = subprocess.run(['cmd.exe', '/d', '/c', str(APP / '停止知枝.cmd')], cwd=str(ROOT / 'work'),
                                     env=env, capture_output=True, timeout=20)
            self.assertEqual(stopped.returncode, 0, (stopped.stdout + stopped.stderr).decode('utf-8', errors='replace'))
            if blocked_here:
                blocker.close()


if __name__ == '__main__':
    unittest.main(verbosity=2)
