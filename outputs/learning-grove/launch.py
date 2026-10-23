"""Reliable local launcher: absolute paths, project identity, port fallback, logs."""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import webbrowser
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import ProxyHandler, Request, build_opener

from runtime_info import VERSION, project_id

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get('GROVE_DATA_DIR', str(ROOT / 'data')))
RUNTIME = DATA / 'runtime.json'
PROJECT = project_id(ROOT, DATA)
LOCAL_HTTP = build_opener(ProxyHandler({}))


def read_runtime():
    try:
        info = json.loads(RUNTIME.read_text(encoding='utf-8'))
        url = urlparse(info.get('url', ''))
        if info.get('project_id') != PROJECT or url.hostname != '127.0.0.1' or url.scheme != 'http':
            return None
        with LOCAL_HTTP.open(info['url'] + '/api/health', timeout=1) as response:
            health = json.load(response)
        if health.get('project_id') == PROJECT and health.get('pid') == info.get('pid'):
            return info
    except (OSError, ValueError, KeyError):
        pass
    return None


def stop(info):
    request = Request(info['url'] + '/api/shutdown', data=json.dumps({'token': info['shutdown_token']}).encode(),
                      headers={'Content-Type': 'application/json'})
    with LOCAL_HTTP.open(request, timeout=3) as response:
        json.load(response)
    for _ in range(30):
        if not read_runtime():
            return
        time.sleep(.1)
    raise RuntimeError('Local service did not stop. Please retry in a few seconds.')


class LaunchLock:
    def __enter__(self):
        DATA.mkdir(parents=True, exist_ok=True)
        self.file = (DATA / 'launch.lock').open('a+b')
        if self.file.tell() == 0:
            self.file.write(b'0')
            self.file.flush()
        if os.name == 'nt':
            import msvcrt
            for _ in range(100):
                try:
                    self.file.seek(0)
                    msvcrt.locking(self.file.fileno(), msvcrt.LK_NBLCK, 1)
                    return self
                except OSError:
                    time.sleep(.1)
            raise RuntimeError('Another launcher is busy. Please try again shortly.')
        return self

    def __exit__(self, *args):
        if os.name == 'nt':
            import msvcrt
            self.file.seek(0)
            msvcrt.locking(self.file.fileno(), msvcrt.LK_UNLCK, 1)
        self.file.close()


def ensure_running():
    info = read_runtime()
    if info and info['version'] == VERSION:
        return info
    if info:
        stop(info)
    for filename in ('server.py', 'model_service.py', 'static/index.html'):
        if not (ROOT / filename).is_file():
            raise RuntimeError('Application files are missing. Keep the complete learning-grove folder together.')
    logfile = DATA / 'server.log'
    with logfile.open('ab') as log:
        log.write(('\n--- Learning Grove ' + VERSION + ' start ---\n').encode())
        log.flush()
        flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        process = subprocess.Popen([sys.executable, str(ROOT / 'server.py')], cwd=str(ROOT),
                                   stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                                   creationflags=flags, close_fds=True)
    for _ in range(120):
        info = read_runtime()
        if info and info['pid'] == process.pid:
            return info
        if process.poll() is not None:
            raise RuntimeError('Application startup failed. See log: ' + str(logfile))
        time.sleep(.1)
    raise RuntimeError('Application startup timed out. See log: ' + str(logfile))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--no-browser', action='store_true')
    parser.add_argument('--stop', action='store_true')
    args = parser.parse_args()
    try:
        with LaunchLock():
            if args.stop:
                info = read_runtime()
                if info:
                    stop(info)
                print('Learning Grove stopped. Learning data has been kept.')
                return
            info = ensure_running()
        print(info['url'], flush=True)
        if not args.no_browser and os.environ.get('GROVE_NO_BROWSER') != '1':
            if not webbrowser.open(info['url']):
                print('Please open the local URL above in your browser.')
    except Exception as error:
        print('Learning Grove could not start: ' + str(error), file=sys.stderr)
        raise SystemExit(1)


if __name__ == '__main__':
    main()
