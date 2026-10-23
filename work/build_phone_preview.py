import json,os,sys,tempfile
from pathlib import Path
root=Path.cwd();app=root/'outputs/learning-grove';sys.path.insert(0,str(app))
with tempfile.TemporaryDirectory(dir=root/'work') as tmp:
 os.environ['GROVE_DATA_DIR']=tmp
 import server
 state=server.initial_state();server.action(state,{'type':'demo'})
 for n in state['trees'][0]['nodes']:server.generate_cards(state,state['trees'][0],n['id'])
settings={'provider':'deepseek','enabled':False,'has_key':False,'can_remember':False,'model':'deepseek-flash','base_url':'https://api.deepseek.com','test_status':'untested'}
shim='''const previewState=STATE,previewSettings=SETTINGS;
window.fetch=async(url,opts)=>{let ok=true,error='此文件仅供手机界面预览，真实 AI 功能请在正式应用中使用。';let tree=previewState.trees[0];if(opts){let a=JSON.parse(opts.body),n=tree.nodes.find(n=>n.id===a.node_id)||tree.nodes[0];if(a.type==='set_page')n.page=Math.max(0,Math.min(a.page,n.cards.length-1));else if(a.type==='visit')tree.current_node_id=n.id;else if(a.type==='demo'){}else if(a.type==='chat'){n.messages.push({role:'user',content:a.message,card_id:a.card_id},{role:'assistant',content:'这是离线预览的固定回答。你可以上翻参照卡片、切换页面，体验布局。正式应用会结合历史记录回答。',card_id:a.card_id});}else if(a.type==='advance'){n.status='read';let next=tree.nodes[tree.nodes.indexOf(n)+1];if(next)tree.current_node_id=next.id;return {ok:true,json:async()=>({state:previewState,settings:previewSettings,next_node_id:next?.id||''})};}else if(a.type==='refill'){}else ok=false;}return{ok,json:async()=>({state:previewState,settings:previewSettings,tree_id:tree.id,error})};};
'''.replace('STATE',json.dumps(state,ensure_ascii=False),1).replace('SETTINGS',json.dumps(settings),1)
html=(app/'static/index.html').read_text(encoding='utf-8')
for name in ['styles','reader','garden']:
 html=html.replace(f'<link rel="stylesheet" href="/{name}.css">','<style>'+(app/f'static/{name}.css').read_text(encoding='utf-8')+'</style>')
html=html.replace('<script defer src="/app.js"></script>','')
js=(app/'static/app.js').read_text(encoding='utf-8')
html=html.replace('</body>','<script>'+shim+'\n'+js.replace('</script','<\\/script')+'</script></body>')
html=html.replace('<title>知枝 · 私人学习助手</title>','<title>知枝 · 手机布局预览</title>')
out=root/'outputs/知枝-手机预览.html';out.write_text(html,encoding='utf-8')
assert '/app.js' not in html and 'key_protected' not in html
print('Phone preview ready:',out.stat().st_size,'bytes; fixed demo only; no user data.')
