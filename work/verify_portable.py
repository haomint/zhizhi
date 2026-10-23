"""Exercise the extracted archive with no Python or developer tools on PATH."""
import json
import os
import subprocess
import time
import zipfile
from pathlib import Path
from urllib.request import ProxyHandler, Request, build_opener

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'work' / '便携验收 空格 & 中文'
ARCHIVE = ROOT / 'outputs' / '知枝-0.3-Windows便携版.zip'
assert not DEST.exists(), 'Use a fresh verification folder to avoid old user data'
with zipfile.ZipFile(ARCHIVE) as package:
    assert package.testzip() is None, 'Archive CRC error'
    package.extractall(DEST)
APP = next(DEST.iterdir())
SYSTEM = Path(os.environ['SystemRoot'])
ENV = {**os.environ, 'PATH': str(SYSTEM / 'System32') + ';' + str(SYSTEM / 'System32' / 'WindowsPowerShell' / 'v1.0'),
       'GROVE_NO_BROWSER': '1', 'GROVE_NO_PAUSE': '1', 'PYTHONUTF8': '1'}
for name in ['PYTHONHOME', 'PYTHONPATH', 'GROVE_DATA_DIR', 'MODEL_BASE_URL', 'MODEL_NAME', 'MODEL_API_KEY', 'DEEPSEEK_API_KEY']:
    ENV.pop(name, None)
HTTP = build_opener(ProxyHandler({}))
checks = []

def check(condition, label):
    assert condition, label
    checks.append(label)

def run_launcher(stop=False):
    file = APP / ('停止知枝.cmd' if stop else '启动知枝.cmd')
    command = '"' + str(SYSTEM / 'System32' / 'cmd.exe') + '" /d /s /c ""' + str(file) + '""'
    result = subprocess.run(command, cwd=ROOT / 'work', env=ENV, capture_output=True, timeout=30)
    assert result.returncode == 0, result.stdout.decode('utf-8', errors='replace') + result.stderr.decode('utf-8', errors='replace')
    if not stop:
        return json.loads((APP / 'data' / 'runtime.json').read_text(encoding='utf-8'))

def request(info, path='/api/state', body=None):
    req = Request(info['url'] + path, data=json.dumps(body).encode() if body is not None else None,
                  headers={'Content-Type':'application/json'})
    with HTTP.open(req, timeout=5) as response:
        return json.load(response)

info = run_launcher()
try:
    check(request(info, '/api/health')['version'] == '0.3.0-local', 'embedded Python launches the new version without developer tools')
    fresh = request(info)
    check(not fresh['state']['trees'] and not fresh['state']['memories'] and not fresh['settings']['has_key'], 'fresh archive has no personal records or key')
    check(run_launcher()['pid'] == info['pid'], 'repeated double-click reuses the existing service')
    demo = request(info, '/api/action', {'type':'demo'})
    tree = demo['state']['trees'][0]
    node = tree['nodes'][0]
    check(len(tree['nodes']) == 12, 'fixed demo works offline')
    request(info, '/api/action', {'type':'set_page','tree_id':tree['id'],'node_id':node['id'],'page':1})
    chat = request(info, '/api/action', {'type':'chat','tree_id':tree['id'],'node_id':node['id'],
                                      'card_id':node['cards'][1]['id'],'message':'请解释这一页。'})
    check(chat['state']['trees'][0]['nodes'][0]['messages'][-1]['card_id'] == node['cards'][1]['id'], 'embedded question saves the selected card context')
    run_launcher(True)
    info = run_launcher()
    restored = request(info)
    check(restored['state']['trees'][0]['nodes'][0]['page'] == 1, 'card page survives stop and restart')
    check(len(restored['state']['trees'][0]['nodes'][0]['messages']) == 2, 'question history survives restart')
    for endpoint, marker in [('/', '知枝'), ('/app.js', 'function renderMap()'), ('/styles.css', '.card-conversation')]:
        with HTTP.open(info['url']+endpoint) as response:
            check(marker in response.read().decode('utf-8'), 'new UI asset served: '+endpoint)
    record = {'url':info['url'],'app':str(APP),'tree_id':tree['id'],'node_id':node['id'],'checks':checks,'result':'PASS'}
    (ROOT / 'work' / 'portable-verification.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'passed':len(checks),'url':info['url'],'tree_id':tree['id'],'result':'PASS'},ensure_ascii=True))
except Exception:
    run_launcher(True)
    raise
