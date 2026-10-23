from pathlib import Path
r=Path('outputs/learning-grove/static')
p=r/'app.js';s=p.read_text(encoding='utf-8');s=s.replace('function renderHome() {','function renderLibrary() {',1)
s=s.replace("  else renderHome();","  else if(page==='library')renderLibrary();\n  else renderHome();\n  document.body.classList.toggle('garden-shell',['home','library','profile'].includes(page));\n  document.querySelector('#garden-nav')?.remove();\n  if(['home','library','profile'].includes(page))document.querySelector('.main-shell').insertAdjacentHTML('beforeend',gardenNav(page));")
pos=s.index('function renderLibrary()')
s=s[:pos]+'''function gardenNav(page){return `<nav id="garden-nav" aria-label="底部导航">${[['home','主页','tree'],['library','学习库','book'],['profile','个人','settings']].map(([id,label,glyph])=>`<a href="#${id}" class="${page===id?'active':''}" ${page===id?'aria-current="page"':''}>${icon(glyph,23)}<span>${label}</span></a>`).join('')}</nav>`;}
function renderHome(){
 const tree=state.trees.slice().sort((a,b)=>String(b.updated||b.created||'').localeCompare(String(a.updated||a.created||'')))[0];
 const node=tree&&(tree.nodes.find(n=>n.id===tree.current_node_id)||tree.nodes[0]);
 const seen=tree?tree.nodes.filter(n=>['done','read'].includes(n.status)).length:0;
 $('#main').innerHTML=`<section class="garden-home"><div class="garden-brand">${icon('tree',22)}<span>知枝</span></div><div class="garden-shadow" aria-hidden="true">${sproutArt(false,5)}</div><div class="garden-resume"><span class="garden-caption">${tree?'从上次的一点好奇，继续':'给好奇，留一点时间'}</span><h1>${esc(tree?.title||'想从什么开始？')}</h1><p>${tree?esc(node?.title||'你的学习路线已准备好'):'说说想学的事，让知识慢慢长出轮廓。'}</p>${tree?`<div class="garden-progress"><i style="width:${Math.round(seen/Math.max(1,tree.nodes.length)*100)}%"></i></div><span class="garden-count">${seen} / ${tree.nodes.length} 个知识点留下了痕迹</span><a class="garden-continue" href="#tree/${tree.id}">继续学习 ${icon('arrow',19)}</a>`:`<button class="garden-continue" data-action="new">开始一段学习 ${icon('arrow',19)}</button><button class="text-link" data-action="demo">先体验一下</button>`}</div></section>`;
}
''' +s[pos:]
# Library uses the existing collection, without its former promotional hero and statistics.
a=s.index('function renderLibrary()');b=s.index('function treeSvg',a);part=s[a:b];start=part.index('<section class="hero">');end=part.index('<div class="section-title">',start);part=part[:start]+part[end:];s=s[:a]+part+s[b:];p.write_text(s,encoding='utf-8')
p=r/'index.html';s=p.read_text(encoding='utf-8').replace('<link rel="stylesheet" href="/reader.css">','<link rel="stylesheet" href="/reader.css">\n  <link rel="stylesheet" href="/garden.css">');p.write_text(s,encoding='utf-8')
p=Path('outputs/learning-grove/server.py');s=p.read_text(encoding='utf-8').replace('"/reader.css")','"/reader.css", "/garden.css")').replace('"reader.css": "text/css"','"reader.css": "text/css", "garden.css": "text/css"');p.write_text(s,encoding='utf-8')
p=Path('outputs/learning-grove/runtime_info.py');s=p.read_text().replace('0.4.0-pocket','0.5.0-garden');p.write_text(s)
