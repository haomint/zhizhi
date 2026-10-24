"""Serve the built React application; this is a development preview, not a backend."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
root = Path(__file__).resolve().parents[1] / 'dist'
parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, required=True)
args = parser.parse_args()
if not (root / 'index.html').exists():
    raise SystemExit('Run npm run build first.')
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(root), **kwargs)
print(f'React application preview: http://localhost:{args.port}/', flush=True)
ThreadingHTTPServer(('0.0.0.0', args.port), Handler).serve_forever()
