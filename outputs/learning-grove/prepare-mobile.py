"""Package only public teaching rules and fixed demonstration content."""
import ast
import json
import shutil
from pathlib import Path

root = Path(__file__).resolve().parent
static = root / 'static'
shutil.copyfile(root / 'node_modules/@capacitor/core/dist/capacitor.js', static / 'capacitor-runtime.js')
(static / 'skills').mkdir(exist_ok=True)
for name in ('intake', 'roadmap', 'cards', 'tutor'):
    shutil.copyfile(root / 'skills' / (name + '.md'), static / 'skills' / (name + '.md'))
source = ast.parse((root / 'server.py').read_text(encoding='utf-8'))
lessons = next(ast.literal_eval(n.value) for n in source.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'DEMO_LESSONS' for t in n.targets))
tree = dict(id='demo', title='高数，从理解变化开始', goal='建立概念直觉，并用简单例子解释变化与累积。', description='从函数出发，经过变化率与导数，走向优化和积分。', preferences=dict(target='理解并解释', difficulty='从基础开始', detail='简洁', style='先例子，再概念', guidance='自主浏览'), nodes=[], demo=True, sources=[], source_status='固定示例，未联网检索')
for i, row in enumerate(lessons):
    cards=[dict(id=str(j),kind=kind,title=title,text=text,image='') for j,(kind,title,text) in enumerate([('核心概念',row[0],row[1]),('具体案例','换个角度理解',row[2]),('思考问题','想一想',row[3])])]
    tree['nodes'].append(dict(id=str(i),title=row[0],description=row[1],chapter=['建立直觉','理解变化','走近导数','连接应用'][i//3],parent_id='',status='unseen',cards=cards,ready=True,messages=[],links=[],page=0))
(static / 'demo.json').write_text(json.dumps(tree,ensure_ascii=False), encoding='utf-8')
print('Public mobile resources prepared; no personal data copied.')
