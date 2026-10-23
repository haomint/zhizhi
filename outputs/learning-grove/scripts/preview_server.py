"""Static Android-flow preview; injects an explicit offline native shim only on this server."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
root=Path(__file__).resolve().parents[1]/'static'
shim='''<script>window.Capacitor={isNativePlatform:()=>true,registerPlugin:()=>({status:async()=>({configured:false}),configure:async()=>{throw Error('网页预览不接受密钥，请使用安卓安装包。')},clearKey:async()=>{},generate:async()=>{throw Error('离线预览不调用模型')},complete:async()=>{throw Error('离线预览不调用模型')},exportBackup:async({text})=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'application/json'}));a.download='知枝-预览档案.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}})};</script>'''
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(root),**kwargs)
    def do_GET(self):
        if self.path.split('?')[0] in ('/','/index.html'):
            content=(root/'index.html').read_text().replace('<script defer src="/capacitor-runtime.js"></script>',shim).replace('<title>知枝 · 私人学习助手</title>','<title>知枝 · 安卓流程离线预览</title>').replace('整合验证版 0.7','0.7 离线预览（模型不可用）').encode()
            self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(content)));self.end_headers();self.wfile.write(content)
        else: super().do_GET()
parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,required=True);args=parser.parse_args()
print(f'Offline Android-flow preview: http://localhost:{args.port}/',flush=True)
ThreadingHTTPServer(('0.0.0.0',args.port),Handler).serve_forever()
