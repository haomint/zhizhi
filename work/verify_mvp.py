"""End-to-end verification against an isolated database and a local model fixture."""
import json
import os
import socket
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

APP = Path(__file__).resolve().parents[1] / 'outputs' / 'learning-grove'
broken = False
tutor_contexts = []


class ModelFixture(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        if broken:
            self.send_response(503)
            self.end_headers()
            return
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        assert self.path == '/v1/chat/completions'
        assert body['model'] == 'local-fixture'
        system = body['messages'][0]['content']
        context = json.loads(body['messages'][1]['content'])
        if '整理用户已经完成' in system:
            result = {'title': '线性代数入门', 'goal': '用几何直觉理解向量和矩阵。', 'notes': '从基础开始。',
                      'questions': [{'question': '希望用在哪些场景？', 'options': ['图形', '数据分析']}]}
        elif '路线规划者' in system:
            result = {'description': '从向量到矩阵。', 'chapters': [
                {'title': chapter, 'nodes': [{'title': f'{chapter}知识点{i}', 'description': '先理解意义，再看例子。'} for i in range(3)]}
                for chapter in ['向量', '空间', '矩阵', '应用']]}
        elif '卡片编写者' in system:
            result = {'cards': [{'node_id': n['id'], 'kind': kind, 'title': n['title'], 'text': f'{n["title"]}的短内容。'}
                                for n in context['nodes'] for kind in ['核心概念', '具体案例', '思考问题']]}
        else:
            tutor_contexts.append(context)
            result = {'answer': '先结合旧知识理解这里的含义。', 'memories': []}
        payload = json.dumps({'choices': [{'message': {'content': json.dumps(result, ensure_ascii=False)}}]}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def verify():
    global broken
    fixture = ThreadingHTTPServer(('127.0.0.1', 0), ModelFixture)
    threading.Thread(target=fixture.serve_forever, daemon=True).start()
    port = free_port()
    base = f'http://127.0.0.1:{port}'
    checks = 0

    def check(condition, message):
        nonlocal checks
        assert condition, message
        checks += 1

    def request(path='/api/state', body=None, origin=None):
        headers = {'Content-Type': 'application/json'}
        if origin:
            headers['Origin'] = origin
        req = Request(base + path, data=json.dumps(body).encode() if body is not None else None, headers=headers)
        with urlopen(req, timeout=10) as response:
            return json.loads(response.read())

    def action(kind, **kwargs):
        return request('/api/action', {'type': kind, **kwargs})

    def expect_error(kind, **kwargs):
        try:
            action(kind, **kwargs)
            raise AssertionError('Expected API error: ' + kind)
        except HTTPError as e:
            check(e.code == 400, 'Expected actionable 400 response')
            return json.loads(e.read())

    with tempfile.TemporaryDirectory(prefix='grove-verify-', dir=Path(__file__).parent) as tmp:
        env = {**os.environ, 'GROVE_DATA_DIR': tmp, 'MODEL_BASE_URL': '', 'MODEL_NAME': '', 'MODEL_API_KEY': ''}
        proc = subprocess.Popen([sys.executable, str(APP / 'server.py'), '--port', str(port)], env=env,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            for _ in range(100):
                try:
                    request('/api/health')
                    break
                except (OSError, HTTPError):
                    time.sleep(.05)
            check(request()['state']['trees'] == [], 'Fresh database starts empty')
            r = action('demo')
            tree = r['state']['trees'][0]
            tid, nid = tree['id'], tree['nodes'][0]['id']
            check(len(tree['nodes']) == 12, 'Full outline generated first')
            check(sum(len(n['cards']) for n in tree['nodes']) == 9, 'Only initial buffer generated')
            check(sum(n['ready'] for n in tree['nodes']) < len(tree['nodes']), 'Future nodes remain ungenerated')
            r = action('set_page', tree_id=tid, node_id=nid, page=1)
            check(r['state']['trees'][0]['nodes'][0]['page'] == 1, 'Card page persists')
            r = action('status', tree_id=tid, node_id=nid, status='done')
            check('独立测评' in r['state']['memories'][0]['content'], 'Completion is not inferred mastery')
            r = action('refill', tree_id=tid)
            tree = r['state']['trees'][0]
            check(sum(n['ready'] for n in tree['nodes']) > 3, 'Buffer replenishes after progress')
            check(9 <= sum(len(n['cards']) for n in tree['nodes'] if n['status'] not in ('done', 'skipped')) <= 12,
                  'Whole-node batches stay near the ten-card target')
            skipid = tree['nodes'][1]['id']
            r = action('status', tree_id=tid, node_id=skipid, status='skipped')
            check(any('掌握程度未知' in m['content'] for m in r['state']['memories']), 'Skip does not imply mastery')
            r = action('chat', tree_id=tid, node_id=nid, message='记住：我希望学数学时先看例子。')
            check(len(r['state']['trees'][0]['nodes'][0]['messages']) == 2, 'Question and answer saved')
            check(any(m['category'] == '学习偏好' for m in r['state']['memories']), 'Explicit preference extracted')
            check('演示回答' in r['state']['trees'][0]['nodes'][0]['messages'][1]['content'], 'Demo responses clearly marked')
            r = action('branch', tree_id=tid, node_id=nid, title='游戏里的运动')
            child = r['node_id']
            check(r['state']['trees'][0]['nodes'][-1]['parent_id'] == nid, 'Exploration attached to originating node')
            r = action('refill', tree_id=tid, node_id=child)
            check(r['state']['trees'][0]['nodes'][-1]['ready'], 'Extension can get card content')
            action('preferences', tree_id=tid, goal='新的目标', preferences={'target': '浏览了解', 'style': '先类比'})
            check(request()['state']['trees'][0]['preferences']['target'] == '浏览了解', 'Learning contract editable')
            r = action('memory_add', category='个人背景', content='测试背景')
            mid = r['state']['memories'][-1]['id']
            action('memory_edit', id=mid, content='修正后的背景')
            check(request()['state']['memories'][-1]['source'] == '用户已修正', 'Memory correction tracked')
            action('memory_delete', id=mid)
            check(not any(m['id'] == mid for m in request()['state']['memories']), 'Memory deletion works')
            action('draft_message', message='我想学习线性代数。')
            expect_error('summarize')
            check(len(request()['state']['draft']['messages']) == 1, 'Draft survives missing provider')
            action('configure', enabled=True, base_url=f'http://127.0.0.1:{fixture.server_port}/v1', model='local-fixture', key='fixture-secret-only')
            check('fixture-secret-only' not in json.dumps(request()), 'Credentials not returned to browser')
            check('fixture-secret-only' not in json.dumps(request('/api/export')), 'Credentials not included in export')
            r = action('summarize')
            check(r['state']['draft']['summary']['title'] == '线性代数入门', 'Live intake adapter works')
            action('draft_unsummarize')
            check(request()['state']['draft']['summary'] is None, 'Return to free discussion preserves draft')
            action('summarize')
            r = action('create_tree', title='线性代数', goal='理解几何意义', preferences={'target': '理解并解释'}, notes='图形方向')
            live = r['state']['trees'][0]
            lid, lnid = live['id'], live['nodes'][0]['id']
            check(not live['demo'], 'Custom tree is distinct from demonstration')
            check(all(not n['ready'] for n in live['nodes']), 'Route saved before card generation')
            r = action('refill', tree_id=lid)
            check(sum(len(n['cards']) for n in r['state']['trees'][0]['nodes']) == 9, 'Live card batch protocol works')
            action('link', tree_id=lid, node_id=lnid, other_tree_id=tid, other_node_id=nid)
            check(request()['state']['trees'][0]['nodes'][0]['links'][0]['tree_id'] == tid, 'Cross-tree connection persists')
            live_cards = request()['state']['trees'][0]['nodes'][0]['cards']
            action('set_page', tree_id=lid, node_id=lnid, page=1)
            action('chat', tree_id=lid, node_id=lnid, message='解释一下这一页', card_id=live_cards[1]['id'])
            check(tutor_contexts[-1]['current_card']['kind'] == live_cards[1]['kind'], 'Embedded question includes the actual reading card')
            check(request()['state']['trees'][0]['nodes'][0]['messages'][-1]['card_id'] == live_cards[1]['id'], 'Conversation retains its originating card')
            check('演示' not in request()['state']['trees'][0]['nodes'][0]['messages'][-1]['content'], 'Live chat uses provider')
            before = request()['state']['revision']
            broken = True
            error = expect_error('chat', tree_id=lid, node_id=lnid, message='触发服务故障')
            check('503' in error['error'], 'Provider failure visible')
            check(request()['state']['revision'] == before, 'Failed generation does not mutate persistent state')
            broken = False
            try:
                request('/api/action', {'type': 'demo'}, 'https://untrusted.invalid')
                raise AssertionError('Cross-origin write should be refused')
            except HTTPError as e:
                check(e.code == 403, 'Cross-origin write blocked')
            for path in ['/server.py', '/data/grove.sqlite3', '/skills/tutor.md', '/../server.py']:
                try:
                    request(path)
                    raise AssertionError('Private file exposed')
                except HTTPError as e:
                    check(e.code == 404, 'Only public static assets exposed')
            expect_error('status', tree_id=tid, node_id=nid, status='mastered')
            expect_error('configure', enabled=True, base_url='http://remote.example/v1', model='x')
            check('fixture-secret-only'.encode() not in (Path(tmp) / 'grove.sqlite3').read_bytes(), 'API key not persisted in SQLite')
            action('visit', tree_id=tid, node_id=nid)
            check(request()['state']['trees'][1]['current_node_id'] == nid, 'Last visited knowledge point persisted')
            proc.terminate()
            proc.wait(timeout=5)
            proc = subprocess.Popen([sys.executable, str(APP / 'server.py'), '--port', str(port)], env=env,
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            for _ in range(100):
                try:
                    restored = request()
                    break
                except OSError:
                    time.sleep(.05)
            check(len(restored['state']['trees']) == 2, 'Trees restored after service restart')
            check(restored['state']['trees'][1]['nodes'][0]['page'] == 1, 'Card position restored after restart')
            check(restored['state']['trees'][1]['current_node_id'] == nid, 'Last visited knowledge point restored after restart')
            check(not restored['settings']['has_key'], 'Session key cleared after service restart')
            check(not restored['settings']['enabled'], 'No silent live-provider reuse after restart')
            print(json.dumps({'passed': checks, 'result': 'PASS', 'provider': 'local fixture; no commercial model called'}))
        finally:
            proc.terminate()
            proc.wait(timeout=5)
            fixture.shutdown()
            fixture.server_close()


if __name__ == '__main__':
    verify()
