'use strict';
let state = null, config = null, busy = false, memoryFilter = '全部', memoryQuery = '', toastTimer;
const chatDrafts = new Map();
const currentCard = () => { const n=currentNode(); return n?.cards[Math.min(n.page||0,Math.max(0,n.cards.length-1))]; };
const contextKey = () => currentTree() && currentNode() ? currentTree().id + '/' + currentNode().id + '/' + (currentCard()?.id||'empty') : '';
const questionOpen = new Set(), scrollPositions = new Map();
let readerObserver;
function keepReaderPosition(){if(route()[0]==='tree'&&currentTree()){const key=contextKey();scrollPositions.set(key,window.scrollY||0);try{sessionStorage.setItem('grove-reader-scroll:'+key,String(window.scrollY||0));}catch{}}}
function restoreReaderPosition(){const key=contextKey();let y=scrollPositions.get(key);try{y??=Number(sessionStorage.getItem('grove-reader-scroll:'+key)||0);}catch{}requestAnimationFrame(()=>window.scrollTo(0,y||0));}

const $ = (s, root = document) => root.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statusText = {unseen:'待学习',learning:'学习中',done:'已完成',skipped:'已跳过',read:'已浏览'};
const route = () => (location.hash.slice(1) || 'home').split('/');
const currentTree = () => state?.trees.find(t => t.id === route()[1]);
const currentNode = () => {const t = currentTree(); return t?.nodes.find(n => n.id === route()[2]) || t?.nodes.find(n=>n.id===t.current_node_id) || t?.nodes.find(n => n.status === 'learning') || t?.nodes[0];};
const go = hash => {if(location.hash === '#' + hash) render(); else location.hash = hash;};
function toast(text) {clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').classList.add('visible');toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),6500);}
const canReadWhileBusy=b=>['page','advance','select-node','toggle-question','close-modal'].includes(b.dataset.action);
function setBusy(value) {busy=value;document.querySelectorAll('button').forEach(b=>{if(value&&!canReadWhileBusy(b)){b.dataset.wasDisabled=String(b.disabled);b.disabled=true;}else if(b.dataset.wasDisabled!==undefined){b.disabled=b.dataset.wasDisabled==='true';delete b.dataset.wasDisabled;}});$('#save-status').textContent=value?'正在处理…':'已保存至本机';const hint=$('#reader-save-state');if(hint)hint.textContent=value?'正在准备内容，可继续阅读已保存卡片':'阅读位置自动保存在本机';}
function modelBadge(){
  if(!config)return;
  const name=config.provider==='deepseek'?'DeepSeek':'模型服务';
  $('#mode-badge').className='badge '+(config.enabled&&config.test_status==='passed'?'live':'demo');
  $('#mode-badge').textContent=name+' · '+(!config.enabled?'待设置':config.test_status==='passed'?'已连接':config.test_status==='failed'?'连接未通过':'待测试');
  $('#mode-mini').textContent=config.enabled?'· 已设置':'';
}
function connectionResult(text,kind='wait') {const el=$('#connection-result');if(el){el.textContent=text;el.className='connection-result '+kind;}}
async function act(data, redraw = true) {
  const reading=['visit','set_page','advance'].includes(data.type);
  if(busy&&!reading) return null;
  if(!reading)setBusy(true);
  try {
    const response=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(160000)});
    const result=await response.json();
    if(result.settings){config=result.settings;modelBadge();}
    if(!response.ok)throw Error((result.settings_saved?'设置已保存，但连接测试未通过：':'')+(result.error || '操作没有完成，请重试。'));
    if(!state||(result.state.revision||0)>=(state.revision||0))state=result.state;config=result.settings;
    if(redraw)render();
    return result;
  } catch(error) {let message=error.name==='TimeoutError'?'等待模型超时。请稍后刷新查看，避免重复提交。':error.message;if(error.name==='TypeError')message='本地服务暂时没有连接，请重新运行“启动知枝.cmd”，再刷新页面。';toast(message);if(data.type==='configure_test'||data.type==='configure')connectionResult(message,'error');return null;}
  finally {if(!reading)setBusy(false);}
}
function modal(title, html) {$('#modal-content').innerHTML=`<div class="modal-top"><h2>${esc(title)}</h2><button data-action="close-modal" aria-label="关闭">×</button></div>${html}`;$('#modal').showModal();}
function closeModal() {$('#modal').close();}
function sproutArt(mini=false, lit=0) {
  return `<svg viewBox="0 0 440 260" aria-hidden="true"><g fill="none" stroke="#b9c9aa" stroke-linecap="round"><path d="M220 239 Q218 170 220 102" stroke-width="5"/><path d="M220 200 Q167 190 138 143 M220 172 Q274 162 303 112 M220 141 Q173 124 159 80 M220 117 Q255 95 271 55 M220 100 Q213 70 215 34" stroke-width="2.5"/><path d="M138 143 Q96 143 78 119 M138 143 Q131 110 119 95 M303 112 Q335 111 351 89 M303 112 Q301 86 310 66 M159 80 Q136 64 133 42 M159 80 Q176 54 173 38 M271 55 Q286 42 290 25" stroke-width="1.5"/></g><g fill="#e0e8d6" stroke="#a9be96" stroke-width="1.3">${[[78,119],[119,95],[133,42],[173,38],[215,34],[271,55],[290,25],[310,66],[351,89],[159,80],[138,143],[303,112]].map(([x,y],i)=>`<ellipse cx="${x}" cy="${y}" rx="${mini?7:10}" ry="${mini?10:14}" transform="rotate(${i%2?28:-28} ${x} ${y})" ${i<lit?'fill="#91ad79"':''}/>`).join('')}</g><ellipse cx="220" cy="244" rx="58" ry="4" fill="#d9e0cc"/><g fill="#bdc9ad"><circle cx="84" cy="183" r="2"/><circle cx="353" cy="152" r="2"/><circle cx="183" cy="22" r="1.5"/></g></svg>`;
}

function icon(name, size=18) {
  const paths={
    tree:'<path d="M12 21V5m0 10-6-4m6 0 6-4M12 8 8 5"/><path d="M4 7c4-1 5 1 4 4-3 1-5 0-4-4Zm12-4c4-1 5 1 4 4-3 1-5 0-4-4ZM8 2c3 0 4 2 3 4-3 0-4-2-3-4Z"/>',
    book:'<path d="M4 4h6a3 3 0 0 1 2 1 3 3 0 0 1 2-1h6v15h-6a3 3 0 0 0-2 1 3 3 0 0 0-2-1H4Z"/><path d="M12 5v15"/>',
    chat:'<path d="M20 11a8 8 0 0 1-8 8H5l-3 2 1-6a8 8 0 1 1 17-4Z"/><path d="M7 10h9m-9 4h6"/>',
    arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
    back:'<path d="M19 12H5m5-5-5 5 5 5"/>',
    branch:'<path d="M6 4v11a4 4 0 0 0 8 0V9m0 0-4-4m4 4 4-4"/><circle cx="6" cy="3" r="2"/><circle cx="14" cy="20" r="2"/>',
    link:'<path d="m10 13 4-4m-6 7-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    image:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m3 17 6-6 5 5 3-3 4 4"/><circle cx="15" cy="8" r="1"/>',
    settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
    more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.arrow}</svg>`;
}
function render() {
  if(!state)return;
  const [page]=route();
  document.body.classList.toggle('focus-reading',page==='tree'&&!!currentTree());
  readerObserver?.disconnect();
  document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===page));
  $('#memory-count').textContent=state.memories.length;
  $('#tree-nav').innerHTML=state.trees.map(t=>`<a class="${currentTree()?.id===t.id?'active':''}" href="#tree/${t.id}" title="${esc(t.title)}"><span class="tree-nav-dot"></span>${esc(t.title)}</a>`).join('');
  modelBadge();
  const treePage=['tree','map'].includes(page)&&currentTree();
  $('#breadcrumbs').innerHTML=treePage?`<a href="#home">学习空间</a><span class="crumb-divider">/</span><span>${esc(currentTree().title)}</span>`:esc(page==='new'?'新建学习 · 从你的想法开始':page==='profile'?'个人资料库':'学习空间');
  $('#main').className=treePage?(page==='map'?'view-map':'view-reader'):'';
  if(page==='new') renderNew();
  else if(treePage) page==='map'?renderMap():renderTree();
  else if(page==='profile') renderProfile();
  else if(page==='memories')renderMemories();
  else if(page==='library')renderLibrary();
  else renderHome();
  document.body.classList.toggle('garden-shell',['home','library','profile','memories'].includes(page));
  document.querySelector('#garden-nav')?.remove();
  if(['home','library','profile','memories'].includes(page))document.querySelector('.main-shell').insertAdjacentHTML('beforeend',gardenNav(page==='memories'?'profile':page));
  if(busy)document.querySelectorAll('#main button').forEach(b=>{if(!canReadWhileBusy(b)){b.dataset.wasDisabled=String(b.disabled);b.disabled=true;}});
}
function gardenNav(page){return `<nav id="garden-nav" aria-label="底部导航">${[['home','主页','tree'],['library','学习库','book'],['profile','个人','settings']].map(([id,label,glyph])=>`<a href="#${id}" class="${page===id?'active':''}" ${page===id?'aria-current="page"':''}>${icon(glyph,23)}<span>${label}</span></a>`).join('')}</nav>`;}
function renderHome(){
 const tree=state.trees.slice().sort((a,b)=>String(b.updated||b.created||'').localeCompare(String(a.updated||a.created||'')))[0];
 const node=tree&&(tree.nodes.find(n=>n.id===tree.current_node_id)||tree.nodes[0]);
 const seen=tree?tree.nodes.filter(n=>['done','read'].includes(n.status)).length:0;
 $('#main').innerHTML=`<section class="garden-home"><div class="garden-brand">${icon('tree',22)}<span>知枝</span></div><div class="garden-shadow" aria-hidden="true">${sproutArt(false,5)}</div><div class="garden-resume"><span class="garden-caption">${tree?'从上次的一点好奇，继续':'给好奇，留一点时间'}</span><h1>${esc(tree?.title||'想从什么开始？')}</h1><p>${tree?esc(node?.title||'你的学习路线已准备好'):'说说想学的事，让知识慢慢长出轮廓。'}</p>${tree?`<div class="garden-progress"><i style="width:${Math.round(seen/Math.max(1,tree.nodes.length)*100)}%"></i></div><span class="garden-count">${seen} / ${tree.nodes.length} 个知识点留下了痕迹</span><a class="garden-continue" href="#tree/${tree.id}">继续学习 ${icon('arrow',19)}</a>`:`<button class="garden-continue" data-action="new">开始一段学习 ${icon('arrow',19)}</button><button class="text-link" data-action="demo">先体验一下</button>`}</div></section>`;
}
function renderLibrary() {
  const completed=state.trees.reduce((sum,t)=>sum+t.nodes.filter(n=>['done','read'].includes(n.status)).length,0),first=state.trees.slice().sort((a,b)=>String(b.updated||b.created||'').localeCompare(String(a.updated||a.created||'')))[0];
  $('#main').innerHTML=`<div class="section-title"><div><div class="eyebrow">YOUR LEARNING COLLECTION</div><h2>正在生长的学习</h2></div><button class="text-link" data-action="new">新的好奇 ＋</button></div>
  ${state.trees.length?`<div class="tree-cards">${state.trees.map((t,index)=>{const done=t.nodes.filter(n=>['done','read'].includes(n.status)).length,percent=Math.round(done/Math.max(1,t.nodes.length)*100);return `<article class="tree-card"><a class="tree-card-art" href="#map/${t.id}" aria-label="查看${esc(t.title)}的学习树">${sproutArt(true,Math.round(percent/100*12))}<span class="collection-no">${String(index+1).padStart(2,'0')} / ${t.demo?'示例':'个人路线'}</span><span class="art-map-link">查看学习树 ${icon('arrow',14)}</span></a><div class="tree-card-body"><h3><a href="#tree/${t.id}">${esc(t.title)}</a></h3><p>${esc(t.goal)}</p><div class="collection-progress"><span>${done} / ${t.nodes.length} 个知识点</span><strong>${percent}%</strong></div><div class="progress-track"><i style="width:${percent}%"></i></div><a class="collection-continue" href="#tree/${t.id}">继续学习 ${icon('arrow',17)}</a></div></article>`;}).join('')}</div>`:'<div class="empty-box"><h3>第一棵树，等一个好奇的念头。</h3><p>聊聊你想学什么，或打开示例，体验一段完整的学习。</p><button class="text-link" data-action="new">开始一段学习 →</button></div>'}
  <div class="quiet-note">${icon('tree',18)}<span>${config.enabled?'每一棵树，都有自己的学习约定。阅读中随时提问，回到全景也能看见来路。':'先用高数示例体验完整流程；在模型设置中连接 DeepSeek 后，即可生成自己的路线。'} 进度保存在这台设备。</span></div><div class="footer-note">慢一点也没关系，主线一直在。</div>`;
}
function treeSvg(tree, selected) {
  const chapters=[...new Set(tree.nodes.filter(n=>!n.parent_id).map(n=>n.chapter))],locations={};
  const children=id=>tree.nodes.filter(n=>n.parent_id===id);
  // Each chapter gets its own lane; additional chapters no longer share the first four anchors.
  const laneSizes=chapters.map(ch=>{
    const roots=tree.nodes.filter(n=>!n.parent_id&&n.chapter===ch);
    return Math.max(230, Math.ceil(roots.length/3)*120+100);
  });
  const pairSizes=[];for(let i=0;i<chapters.length;i+=2)pairSizes.push(Math.max(laneSizes[i],laneSizes[i+1]||0));
  const height=pairSizes.reduce((a,b)=>a+b,0)+180;
  let paths=`<path class="trunk" d="M500 ${height-75} Q490 ${height/2} 500 65"/>`,labels='',nodes='',offset=50;
  chapters.forEach((chapter,ci)=>{
    if(ci>0&&ci%2===0)offset+=pairSizes[ci/2-1];
    const x=ci%2===0?255:745, lane=pairSizes[Math.floor(ci/2)],y=offset+lane-35;
    const members=tree.nodes.filter(n=>!n.parent_id&&n.chapter===chapter);
    paths+=`<path class="twig" d="M500 ${y+40} Q${x} ${y+50} ${x} ${y-8}"/>`;
    labels+=`<text class="chapter-label" x="${x}" y="${y+34}">${esc(chapter.length>17?chapter.slice(0,17)+'…':chapter)}</text>`;
    members.forEach((n,j)=>{
      const row=Math.floor(j/3),count=Math.min(3,members.length-row*3),nx=x+((j%3)-(count-1)/2)*135,ny=y-68-row*120;
      locations[n.id]={x:nx,y:ny};paths+=`<path class="twig ${['done','read'].includes(n.status)?'lit':''}" d="M${x} ${y-8} Q${nx} ${y-28} ${nx} ${ny}"/>`;
    });
  });
  // Explorations remain connected to their parent; lists retain full titles for dense routes.
  const placed=new Set(Object.keys(locations));
  for(let pass=0;pass<tree.nodes.length;pass++){
    let changed=false;
    tree.nodes.filter(n=>n.parent_id&&!placed.has(n.id)).forEach(n=>{
      const p=locations[n.parent_id];if(!p)return;
      const siblings=children(n.parent_id),j=siblings.findIndex(s=>s.id===n.id),direction=p.x<500?-1:1;
      const nx=Math.max(55,Math.min(945,p.x+direction*(45+j*35))),ny=Math.max(25,p.y-63-j*8);
      locations[n.id]={x:nx,y:ny};placed.add(n.id);changed=true;
      paths+=`<path class="twig exploration ${['done','read'].includes(n.status)?'lit':''}" d="M${p.x} ${p.y} Q${p.x} ${ny} ${nx} ${ny}"/>`;
    });if(!changed)break;
  }
  tree.nodes.forEach(n=>{
    const p=locations[n.id];if(!p)return;const active=n.id===selected.id,title=n.title.length>8?n.title.slice(0,8)+'…':n.title;
    nodes+=`<g role="button" tabindex="0" class="node ${esc(n.status)}${active?' selected':''}" data-action="select-node" data-node="${n.id}" aria-label="${esc(n.title+'，'+statusText[n.status])}"><title>${esc(n.title+' · '+statusText[n.status])}</title>${active?`<circle class="halo" cx="${p.x}" cy="${p.y}" r="24"/>`:''}<circle cx="${p.x}" cy="${p.y}" r="12"/>${['done','read'].includes(n.status)?`<path class="node-check" d="m${p.x-5} ${p.y} 3 3 7-7"/>`:''}<text x="${p.x}" y="${p.y+34}">${esc(title)}</text></g>`;
  });
  return `<svg class="map-svg" viewBox="0 0 1000 ${height}" role="group" aria-label="学习树知识点导航">${paths}${labels}${nodes}<ellipse cx="500" cy="${height-64}" rx="76" ry="5" fill="#dce3cf"/><text class="root-label" x="500" y="${height-25}">每一点理解，都在这里生长</text></svg>`;
}
function learningHeader(tree,node,isMap=false) {
  const done=tree.nodes.filter(n=>['done','read'].includes(n.status)).length;
  return `<div class="learning-top"><div class="learning-title"><div class="eyebrow">${tree.demo?'示例学习路线':'我的学习路线'} <span class="eyebrow-dot">·</span> ${done} / ${tree.nodes.length} 已点亮</div><h1>${esc(tree.title)}</h1></div><div class="learning-header-actions"><button class="icon-button" data-action="tree-details">${icon('settings',16)}学习约定</button><details class="tree-menu"><summary aria-label="更多学习操作">${icon('more')}</summary><div><button data-action="refill">补充待学卡片</button><button data-action="export">导出学习档案</button><button class="danger" data-action="delete-tree">删除学习树</button></div></details></div></div>
  <div class="learning-subnav"><nav aria-label="当前学习视图"><a href="#tree/${tree.id}/${node.id}" class="${!isMap?'active':''}" ${!isMap?'aria-current="page"':''}>${icon('book',16)}卡片学习</a><a href="#map/${tree.id}/${node.id}" class="${isMap?'active':''}" ${isMap?'aria-current="page"':''}>${icon('tree',17)}学习树全景</a></nav><span class="route-hint">${isMap?'看见来路，也看见下一步':'一次一点，按自己的节奏'}</span></div>`;
}
function renderMap() {
  const tree=currentTree(),node=currentNode(),done=tree.nodes.filter(n=>['done','read'].includes(n.status)).length,chapters=[...new Set(tree.nodes.map(n=>n.chapter))];
  $('#main').innerHTML=learningHeader(tree,node,true)+`<div class="map-intro"><div><h2>把学过的，连成自己的风景。</h2><p>${esc(tree.goal)}</p></div><a class="primary" href="#tree/${tree.id}/${node.id}">回到卡片 ${icon('arrow',16)}</a></div><div class="map-layout"><section class="panel map-panel"><div class="map-canvas-heading"><span>${icon('tree',17)} 知识生长图</span><span>${Math.round(done/Math.max(1,tree.nodes.length)*100)}% 已点亮</span></div>${treeSvg(tree,node)}<div class="map-legend"><span>待学习</span><span class="current">正在查看</span><span class="read">已浏览</span><span class="lit">标记完成</span><span class="skipped">已跳过</span></div><div class="source-note">${esc(tree.source_status)}<br>浅叶是已浏览，深叶是主动标记完成，均不代表独立掌握测评。点击知识点可回顾卡片。</div></section><aside class="map-outline"><div class="outline-heading"><span class="eyebrow">LEARNING OUTLINE</span><h3>这段旅程的路线</h3><p>${chapters.length} 个章节 · ${tree.nodes.length} 个知识点</p></div><div class="chapter-list">${chapters.map((ch,i)=>`<details ${tree.nodes.some(n=>n.id===node.id&&n.chapter===ch)?'open':''}><summary><span class="chapter-number">${String(i+1).padStart(2,'0')}</span><span>${esc(ch)}</span><small>${tree.nodes.filter(n=>n.chapter===ch&&['done','read'].includes(n.status)).length}/${tree.nodes.filter(n=>n.chapter===ch).length}</small></summary>${tree.nodes.filter(n=>n.chapter===ch).map(n=>`<button class="${n.id===node.id?'selected':''}" data-action="select-node" data-node="${n.id}" ${n.id===node.id?'aria-current="true"':''}><span class="outline-dot ${n.status}"></span><span>${n.parent_id?'↳ ':''}${esc(n.title)}</span><span class="node-state">${statusText[n.status]}</span></button>`).join('')}</details>`).join('')}</div><div class="outline-note">${icon('branch',18)}<p>学习中遇到新的好奇，可以从卡片长出探索分支。</p></div></aside></div>`;
}

function renderTree() {
  const tree=currentTree(),node=currentNode(),cards=node.cards,index=tree.nodes.indexOf(node);
  const page=Math.min(node.page||0,Math.max(0,cards.length-1)),card=cards[page],key=contextKey();
  const messages=node.messages.filter(m=>card&&m.card_id===card.id),legacy=node.messages.filter(m=>!m.card_id);
  const last=cards.length&&page===cards.length-1,next=tree.nodes[index+1];
  const question=card&&/思考|想一想|问题|练习/.test(card.kind||'');
  const answerHtml=items=>items.map(m=>`<article class="reader-message ${m.role==='user'?'user':'assistant'}"><div class="message-author">${m.role==='user'?'你的小问题':'知枝'}${m.card_title?' <span>· '+esc(m.card_title)+'</span>':''}</div><div>${esc(m.content)}</div></article>`).join('');
  $('#main').innerHTML=`<div class="pocket-reader"><header class="pocket-header"><a class="round-control" href="#home" aria-label="返回学习空间">${icon('back',20)}</a><div class="pocket-heading"><strong>${esc(node.title)}</strong></div><details class="pocket-menu"><summary class="round-control" aria-label="更多学习功能">${icon('more',22)}</summary><div class="pocket-menu-sheet"><span class="menu-caption">这一段学习</span><a href="#map/${tree.id}/${node.id}">${icon('tree')}学习树全景</a><button data-action="tree-details">${icon('settings')}学习约定</button><button data-action="branch">${icon('branch')}延伸探索</button><button data-action="link">${icon('link')}关联旧知识</button>${card?`<button data-action="image">${icon('image')}添加图片</button>${card.image?'<button data-action="remove-image">移除图片</button>':''}`:''}<button data-action="refill">补充卡片</button><button data-action="skip">暂时跳过本节</button><button data-action="settings">模型设置</button><a href="#profile">个人资料库</a><button data-action="export">导出学习档案</button><button class="danger" data-action="delete-tree">删除学习树</button></div></details></header>
  <section class="reader-sheet ${question?'is-thought':''}" aria-label="当前知识卡片"><div class="sheet-topline"><span class="sheet-category">${esc(card?.kind||'新的知识点')}</span><span class="sheet-folio">${cards.length?String(page+1).padStart(2,'0'):'—'}<small> / ${String(cards.length).padStart(2,'0')}</small></span></div><article class="sheet-content" ${card?`data-card-id="${card.id}"`:''}>${card?`<div class="sheet-sprout">${icon(question?'chat':'tree',24)}</div><h1>${esc(card.title)}</h1><div class="sheet-body">${esc(card.text)}</div>${card.image?`<figure><img src="${esc(card.image)}" alt="本页知识卡片附图"></figure>`:''}`:`<div class="empty-sprout">${icon('tree',44)}</div><h1>${esc(node.title)}</h1><p class="sheet-body">${esc(node.description||'先有一个方向，再慢慢读懂。')}</p><button class="primary" data-action="generate-node">展开这一节 ${icon('arrow',16)}</button>`}</article><div class="sheet-footnote">${tree.demo?'<span>示例</span>':''}<span class="leaf-dots" aria-hidden="true">${cards.map((_,i)=>`<i class="${i===page?'active':''}"></i>`).join('')}</span></div></section>
  <nav class="pocket-controls" aria-label="卡片阅读操作"><button class="round-control" data-action="page" data-page="${Math.max(0,page-1)}" ${page===0?'disabled':''} aria-label="上一页">${icon('back',20)}</button><button class="ask-pill" data-action="toggle-question" aria-expanded="${questionOpen.has(key)}" aria-controls="reader-question">${icon('chat',17)}问一问${messages.length?'<span class="question-count">'+Math.ceil(messages.length/2)+'</span>':''}<span class="ask-chevron">⌄</span></button>${cards.length?last?`<button class="next-chapter" data-action="advance">${next?'继续下一节':'收好这段学习'}${icon('arrow',17)}</button>`:`<button class="round-control next-page" data-action="page" data-page="${page+1}" aria-label="下一页">${icon('arrow',20)}</button>`:'<span></span>'}</nav>
  <div class="question-reveal"><span></span></div><details id="reader-question" class="reader-question" ${questionOpen.has(key)?'open':''}><summary><span>${icon('chat',18)} 想问什么，都可以</span><span class="question-fold">收起 / 展开</span></summary><div class="question-inner"><div class="chat-chips"><button data-action="chat-chip" data-value="换一个生活中的例子解释一下。">换个例子</button><button data-action="chat-chip" data-value="这与前一张卡片有什么联系？">联系上一张</button><button data-action="chat-chip" data-value="我想先自己想一想，请给我一点提示。">一点提示</button></div><form id="chat-form" class="chat-form"><textarea name="message" aria-label="向学习助手提问" placeholder="这一页，哪里让你好奇？" required maxlength="4000">${esc(chatDrafts.get(key)||'')}</textarea><div class="send-row"><button class="primary" type="submit">发送 ${icon('arrow',16)}</button></div></form><div class="reader-answers" role="log" aria-label="这张卡片的问答">${messages.length?answerHtml(messages):''}</div>${legacy.length?`<details class="legacy-questions"><summary>本知识点以前的交流 · ${legacy.length} 条</summary>${answerHtml(legacy)}</details>`:''}</div></details><footer class="pocket-footer"><span id="reader-save-state" class="visually-hidden" role="status"></span><a href="#home">先看到这里 ${icon('check',13)}</a></footer></div>`;
  const section=$('#reader-question');
  section.addEventListener('toggle',()=>{if(section.open){questionOpen.add(key);delete section.dataset.manualClose;}else{questionOpen.delete(key);section.dataset.manualClose='1';}const b=$('[data-action="toggle-question"]');if(b)b.setAttribute('aria-expanded',String(section.open));});
  if(typeof IntersectionObserver!=='undefined'){
    readerObserver=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&window.scrollY>35&&!section.open&&!section.dataset.manualClose){section.open=true;questionOpen.add(key);}},{threshold:.7});
    readerObserver.observe($('.question-reveal'));
  }
}
async function changeCard(page){keepReaderPosition();const t=currentTree(),n=currentNode();const r=await act({type:'set_page',tree_id:t.id,node_id:n.id,page},false);if(r){questionOpen.delete(contextKey());render();window.scrollTo(0,0);keepReaderPosition();}}
async function advanceReading(){const t=currentTree(),n=currentNode();const r=await act({type:'advance',tree_id:t.id,node_id:n.id},false);if(!r)return;if(r.next_node_id){await openNode(r.next_node_id);const next=currentNode();if(next&&!next.ready&&(t.demo||config.enabled))await act({type:'refill',tree_id:t.id,node_id:next.id});}else{go('map/'+t.id+'/'+n.id);toast('读过的都记下了。想回顾时，随时回来。');}}
function field(label,name,value='',type='text') {return `<label class="field">${esc(label)}${type==='textarea'?`<textarea name="${name}" required>${esc(value)}</textarea>`:`<input name="${name}" value="${esc(value)}" required>`}</label>`;}
function selectField(label,name,options,selected='') {if(selected&&!options.includes(selected))options=[selected,...options];return `<label class="field">${esc(label)}<select name="${name}">${options.map(o=>`<option ${o===selected?'selected':''}>${esc(o)}</option>`).join('')}</select></label>`;}
function renderNew() {
  const draft=state.draft,summary=draft.summary;
  if(summary) {
    const prefs=summary.preferences||{};
    $('#main').innerHTML=`<div class="summary-layout"><div class="page-heading"><div><div class="eyebrow">02 / FIND YOUR DIRECTION</div><h1>先约定方向，再开始生长。</h1><p>这是根据你的叙述整理的起点，学习过程中随时可以调整。</p></div></div><div class="summary-intro">${esc(summary.notes||'补充最重要的信息就好。')}</div><form id="create-form" class="panel summary-form">${field('学习主题','title',summary.title)}${field('本次学习目标与已有基础','goal',summary.goal,'textarea')}${summary.questions.map((q,i)=>`<label class="field">${esc(q.question)}<input name="q${i}" placeholder="选择建议，或写自己的答案"><span class="choice-row">${q.options.map(o=>`<button type="button" data-action="choice" data-field="q${i}" data-value="${esc(o)}">${esc(o)}</button>`).join('')}</span></label>`).join('')}<div class="fields-grid">${selectField('希望达到什么程度','target',['理解并解释','浏览了解','能够做题','能够实际应用'],prefs.target)}${selectField('学习难度','difficulty',['从基础开始','已有一些基础','进阶学习'],prefs.difficulty)}${selectField('内容详细度','detail',['简洁，按需展开','保留必要推导','多一些讲解'],prefs.detail)}${selectField('更喜欢怎样学','style',['先例子，再概念','先概念，再例子','先打比方，再看例题','先提问题，再给提示'],prefs.style)}${selectField('学习节奏','guidance',['自主浏览','更多引导'],prefs.guidance)}</div><label class="field">其他要求 / 对上面选项的修改<textarea name="notes" placeholder="例如：工作日每次 15 分钟；公式推导别省略；举例尽量联系游戏开发。"></textarea></label><div class="form-actions"><button class="primary" type="submit">建立学习路线与树的轮廓 →</button><button class="secondary" type="button" data-action="back-draft">继续补充需求</button></div><p class="small-note">路线由模型组织。首版尚未接入联网检索，不将生成内容标为已经核验的资料。</p></form></div>`;
    return;
  }
  $('#main').innerHTML=`<div class="intake-layout"><section class="intake-copy"><div class="eyebrow">01 / START WITH A THOUGHT</div><h1>你想学些什么？<br>从随便聊聊开始。</h1><p>不用先想清楚所有答案。说说想学的主题、为什么想学，或者目前让你困惑的地方。</p><div class="intake-steps"><div class="intake-step"><i>01</i><div>先听你说<small>自由表达，随时补充。</small></div></div><div class="intake-step"><i>02</i><div>一起整理方向<small>只补问重要的未知信息。</small></div></div><div class="intake-step"><i>03</i><div>让学习长出轮廓<small>先有路线，再逐步展开卡片。</small></div></div></div></section><section class="panel draft-panel"><div class="draft-history">${draft.messages.length?draft.messages.map(m=>`<div class="draft-bubble">${esc(m.content)}</div>`).join(''):'<p class="muted">比如：我想学高数，为理解机器学习做准备。基础有点忘了，希望先从例子开始。</p>'}</div><form id="draft-form"><textarea name="message" aria-label="描述学习需求" placeholder="我想学…" required maxlength="4000"></textarea><div class="form-actions"><button class="secondary" type="submit">${draft.messages.length?'补充这一段':'记下这一段'} ↑</button></div></form><p class="draft-status">${draft.messages.length?'需求已暂存。可以继续补充，觉得说得差不多了，再让助手整理。':'这里会先保存你的叙述。点击“整理需求”时，再请模型归纳和补问。'}</p><button class="primary" data-action="summarize" ${draft.messages.length?'':'disabled'}>我说完了，整理需求 →</button>${!config.enabled?'<div class="quiet-note">生成个人路线需要接入模型。<button data-action="settings">打开模型设置 ↗</button></div>':''}<button class="text-button" data-action="demo">先体验高数演示树 →</button></section></div>`;
}
function renderProfile(){
 $('#main').innerHTML=`<div class="page-heading"><h1>个人</h1></div><div class="personal-settings"><button class="personal-settings-button" data-action="settings">${icon('settings',22)}<span><strong>设置</strong><small>模型连接与 API 配置</small></span>${icon('arrow',18)}</button></div><a class="personal-settings-button" href="#memories">${icon('book',22)}<span><strong>个人资料库</strong><small>${state.memories.length} 条记录 · 查看、修改与整理</small></span>${icon('arrow',18)}</a><button class="personal-settings-button" data-action="export" style="margin-top:18px">${icon('link',22)}<span><strong>导出学习档案</strong><small>学习树与个人记录</small></span>${icon('arrow',18)}</button>`;
}
function renderMemories() {
  const categories=['全部',...new Set(state.memories.map(m=>m.category))];
  const items=state.memories.filter(m=>(memoryFilter==='全部'||m.category===memoryFilter)&&(!memoryQuery||m.content.toLowerCase().includes(memoryQuery.toLowerCase()))).slice().reverse();
  $('#main').innerHTML=`<div class="page-heading"><div><div class="eyebrow">YOUR PERSONAL LEARNING MEMORY</div><h1>关于你，也关于一路的学习。</h1><p>目标、兴趣、偏好和曾经的问题，在这里慢慢积累。你可以随时纠正它。</p></div><button class="primary" data-action="add-memory">＋ 补充一条记忆</button></div><div class="personal-settings"><button class="personal-settings-button" data-action="settings">${icon('settings',20)}<span><strong>设置</strong><small>模型连接与 API 配置</small></span>${icon('arrow',17)}</button></div><div class="profile-toolbar"><input class="filter-input" id="memory-search" aria-label="搜索个人资料" placeholder="搜索记录…" value="${esc(memoryQuery)}"><button class="secondary" data-action="search-memory">查找</button><button class="secondary" data-action="export">导出档案 ↗</button></div><div class="memory-filters">${categories.map(c=>`<button class="${memoryFilter===c?'active':''}" data-action="memory-filter" data-value="${esc(c)}">${esc(c)}</button>`).join('')}</div>${items.length?`<div class="memory-grid">${items.map(m=>{const tree=state.trees.find(t=>t.id===m.tree_id);return `<article class="memory-card"><div><span class="badge">${esc(m.category)}</span>${m.source==='助手暂时推测'?' <span class="badge demo">待你确认的推测</span>':''}</div><p>${esc(m.content)}</p><div class="memory-meta">${esc(m.source)}${tree?' · '+esc(tree.title):''}<br>${new Date(m.updated).toLocaleDateString('zh-CN')}</div><div class="memory-actions"><button data-action="edit-memory" data-id="${m.id}">修改</button><button data-action="delete-memory" data-id="${m.id}">删除</button>${tree?`<button data-action="visit-link" data-tree="${tree.id}" data-node="${m.node_id||''}">回到学习 →</button>`:''}</div></article>`;}).join('')}</div>`:'<div class="empty-box"><h3>这里会逐渐认识你。</h3><p>可以先写下一条兴趣或目标，也可以从学习中的交流开始积累。</p></div>'}<div class="quiet-note">每条记录保留来源和适用的学习情境。用户完成记录代表主动标记，不等于独立掌握测评。删除一条提取的记忆，不会删除原学习节点中的对话。</div>`;
}
function settingsModal() {
  modal('DeepSeek 连接设置',`<div class="provider-intro"><span class="badge live">默认通道 · DeepSeek</span><p>地址和模型已经填好，粘贴 API Key 就可以开始。应用和学习档案保存在本机，生成内容时联网调用所选模型服务。</p></div><form id="settings-form"><label class="field">DeepSeek API Key <span id="key-presence">${config.has_key?(config.remember?'（已在本机加密保存，留空可保留）':'（本次运行已有密钥，留空可保留）'):''}</span><input type="password" name="key" autocomplete="off" spellcheck="false" placeholder="粘贴在 DeepSeek 开放平台创建的 API Key"></label><label class="checkbox-field"><input type="checkbox" name="remember" ${(config.remember||!config.has_key)&&config.can_remember?'checked':''} ${config.can_remember?'':'disabled'}> 在当前设备下加密保存，重启后继续使用</label><details class="advanced-settings"><summary>高级设置 · 默认无需修改</summary>${selectField('模型通道','provider',config.provider==='compatible'?['compatible','deepseek']:['deepseek','compatible'],config.provider)}${field('API 地址','base_url',config.base_url||'https://api.deepseek.com')}${field('模型名称','model',config.model||'deepseek-flash')}<label class="checkbox-field"><input type="checkbox" name="clear_key"> 清除原有密钥</label></details><div id="connection-result" class="connection-result" role="status">${esc(config.notice||'尚未测试。点击“保存并测试连接”会使用上面当前填写的内容。')}</div><div class="form-actions"><button class="primary" type="submit" name="mode" value="test">保存并测试连接</button><button class="secondary" type="submit" name="mode" value="save">仅保存</button></div><p class="small-note">API Key 不会出现在学习档案导出或页面返回数据中。加密保存仅适用于当前设备。此应用只在本机提供页面。</p><div class="settings-links"><button type="button" data-action="use-demo">暂用演示模式</button><a href="https://platform.deepseek.com/" target="_blank" rel="noopener noreferrer">前往 DeepSeek 开放平台 ↗</a></div></form>`);
}
function memoryModal(item=null) {
  modal(item?'修改记忆':'补充个人资料',`<form id="memory-form" data-id="${item?.id||''}">${item?'':selectField('分类','category',['个人背景','长期目标','兴趣与探索','学习偏好'])}${field('你希望助手记住什么','content',item?.content||'','textarea')}<div class="form-actions"><button class="primary" type="submit">保存记忆</button><button class="secondary" type="button" data-action="close-modal">取消</button></div></form>`);
}
async function openNode(id) {const t=currentTree();if(!t)return;const r=await act({type:'visit',tree_id:t.id,node_id:id},false);if(r)go(`tree/${t.id}/${id}`);}
async function completeNode(skip=false) {
  const t=currentTree(),n=currentNode();
  if(n.status!=='done'||skip){const result=await act({type:'status',tree_id:t.id,node_id:n.id,status:skip?'skipped':'done'});if(!result)return;}
  const next=currentTree().nodes.find((x,i)=>i>t.nodes.findIndex(y=>y.id===n.id)&&!['done','skipped'].includes(x.status)) || currentTree().nodes.find(x=>!['done','skipped'].includes(x.status));
  if(next){await openNode(next.id);await act({type:'refill',tree_id:t.id,node_id:next.ready?'':next.id});}
  else toast('本次路线已经走完。你的学习树和探索经历会一直保留。');
}
document.addEventListener('click',event=>{if(event.target.closest('a[href^="#"]'))keepReaderPosition();},true);
document.addEventListener('click', async event=>{
  const b=event.target.closest('[data-action]');if(!b||b.disabled||(busy&&!canReadWhileBusy(b)))return;
  const action=b.dataset.action,t=currentTree(),n=currentNode();
  document.querySelectorAll('.pocket-menu[open]').forEach(menu=>menu.open=false);
  if(action==='new')go('new');
  else if(action==='settings')settingsModal();
  else if(action==='close-modal')closeModal();
  else if(action==='demo'){const r=await act({type:'demo'});if(r)go('tree/'+r.tree_id);}
  else if(action==='select-node')await openNode(b.dataset.node);
  else if(action==='page')await changeCard(Number(b.dataset.page));
  else if(action==='advance')await advanceReading();
  else if(action==='toggle-question'){const section=$('#reader-question');section.open=!section.open;if(section.open){questionOpen.add(contextKey());section.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});}else{section.dataset.manualClose='1';questionOpen.delete(contextKey());window.scrollTo({top:0,behavior:'smooth'});}}
  else if(action==='generate-node'){const r=await act({type:'refill',tree_id:t.id,node_id:n.id});if(r&&n.status==='unseen')await act({type:'status',tree_id:t.id,node_id:n.id,status:'learning'});}
  else if(action==='refill'){const r=await act({type:'refill',tree_id:t.id});if(r)toast('已准备下一段内容。');}
  else if(action==='complete')await completeNode(false);
  else if(action==='skip')await completeNode(true);
  else if(action==='restart-node')await act({type:'status',tree_id:t.id,node_id:n.id,status:'learning'});
  else if(action==='chat-chip'){$('#chat-form textarea').value=b.dataset.value;chatDrafts.set(contextKey(),b.dataset.value);$('#chat-form textarea').focus();}
  else if(action==='branch')modal('从这里，长出一个新问题',`<p>这条支线会连接到「${esc(n.title)}」，并保留在当前学习树中。</p><form id="branch-form">${field('想继续探索什么','title')}<button class="primary" type="submit">加入探索分支</button></form>`);
  else if(action==='link'){
    const others=state.trees.filter(x=>x.id!==t.id);
    if(!others.length){toast('先建立另一棵学习树，就可以把相关知识连接起来。');return;}
    modal('连接以前的学习',`<form id="link-form"><label class="field">选择旧知识<select name="target">${others.map(x=>`<optgroup label="${esc(x.title)}">${x.nodes.map(y=>`<option value="${x.id}/${y.id}">${esc(y.title)} · ${statusText[y.status]}</option>`).join('')}</optgroup>`).join('')}</select></label><button class="primary" type="submit">建立关联</button></form>`);
  }
  else if(action==='visit-link'){go(`tree/${b.dataset.tree}${b.dataset.node?'/'+b.dataset.node:''}`);}
  else if(action==='tree-details')modal('这次学习的约定',`<p>${esc(t.goal)}</p><div class="summary-intro">${Object.entries(t.preferences).map(([key,value])=>esc(({target:'完成标准',difficulty:'难度',detail:'详细度',style:'学习方式',guidance:'引导程度'}[key]||key))+ '：'+esc(value)).join('<br>')}</div><p class="small-note">${esc(t.description)}<br>${esc(t.source_status)}</p><button class="secondary" data-action="edit-preferences">调整这次约定</button>`);
  else if(action==='edit-preferences'){modal('调整学习约定',`<form id="preferences-form">${field('学习目标','goal',t.goal,'textarea')}${Object.entries(t.preferences).map(([k,v])=>field(({target:'完成标准',difficulty:'难度',detail:'详细度',style:'学习方式',guidance:'引导程度'}[k]||k),k,v)).join('')}<p class="small-note">新约定用于后续卡片与问答；已有内容和已完成记录会保留。</p><button class="primary" type="submit">保存调整</button></form>`);}
  else if(action==='delete-tree')modal('删除这棵学习树？',`<p>将删除「${esc(t.title)}」及其问答、图片和关联记忆。可以先导出档案留存。</p><button class="primary" data-action="confirm-delete-tree">确认删除</button> <button class="secondary" data-action="close-modal">保留</button>`);
  else if(action==='confirm-delete-tree'){const r=await act({type:'delete_tree',tree_id:t.id});if(r){closeModal();go('home');}}
  else if(action==='summarize'){const pending=$('#draft-form textarea')?.value.trim();if(pending){const saved=await act({type:'draft_message',message:pending});if(!saved)return;}if(!config.enabled){settingsModal();return;}await act({type:'summarize'});}
  else if(action==='back-draft'){await act({type:'draft_unsummarize'});}
  else if(action==='choice'){const input=$(`[name="${b.dataset.field}"]`);if(input){input.value=b.dataset.value;input.focus();}}
  else if(action==='test-model'){const r=await act({type:'test_model'});if(r)toast(r.message);}
  else if(action==='use-demo'){const r=await act({type:'configure',enabled:false,provider:config.provider,base_url:config.base_url,model:config.model,remember:config.remember},false);if(r){closeModal();render();toast('已切换为演示模式；学习档案和模型设置仍保留。');}}
  else if(action==='add-memory')memoryModal();
  else if(action==='edit-memory')memoryModal(state.memories.find(x=>x.id===b.dataset.id));
  else if(action==='delete-memory')modal('删除这条记忆？',`<p>提取的这条记录会被删除。原学习节点中的问答仍会保留。</p><button class="primary" data-action="confirm-delete-memory" data-id="${b.dataset.id}">确认删除</button> <button class="secondary" data-action="close-modal">取消</button>`);
  else if(action==='confirm-delete-memory'){const r=await act({type:'memory_delete',id:b.dataset.id});if(r)closeModal();}
  else if(action==='memory-filter'){memoryFilter=b.dataset.value;renderProfile();}
  else if(action==='search-memory'){memoryQuery=$('#memory-search').value;renderProfile();}
  else if(action==='image'){
    const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';
    input.addEventListener('change',async()=>{const file=input.files[0];if(!file)return;if(file.size>1000000){toast('为了保持轻量，单张图片请小于 1 MB。');return;}const reader=new FileReader();reader.onload=()=>act({type:'image',tree_id:t.id,node_id:n.id,card_id:n.cards[n.page||0].id,image:reader.result});reader.readAsDataURL(file);});input.click();
  }
  else if(action==='remove-image')await act({type:'image',tree_id:t.id,node_id:n.id,card_id:n.cards[n.page||0].id,image:''});
  else if(action==='export'){
    try{if(window.Capacitor?.isNativePlatform()){const r=await fetch('/api/export');await Capacitor.registerPlugin('Personal').exportBackup({text:JSON.stringify(await r.json(),null,2)});toast('已打开系统分享，请选择保存位置。');return;}const r=await fetch('/api/export');if(!r.ok)throw Error('导出失败。');const blob=new Blob([JSON.stringify(await r.json(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='知枝-学习档案-'+new Date().toLocaleDateString('sv-SE')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出学习树和个人资料，不包含模型密钥。');}catch(e){toast(e.message);}
  }
});
document.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;const form=event.target,f=new FormData(form),t=currentTree(),n=currentNode();
  if(form.id==='draft-form'){const r=await act({type:'draft_message',message:f.get('message')});if(r)$('#draft-form textarea').focus();}
  else if(form.id==='chat-form'){const key=contextKey(),message=f.get('message');chatDrafts.set(key,message);questionOpen.add(key);const y=window.scrollY;const button=form.querySelector('[type="submit"]');if(button)button.textContent='正在想…';const r=await act({type:'chat',tree_id:t.id,node_id:n.id,card_id:currentCard()?.id||'',message},false);if(r){chatDrafts.delete(key);if(contextKey()===key){render();window.scrollTo(0,y);$('#reader-question').open=true;}else render();}else if(button)button.innerHTML='再试一次 '+icon('arrow',16);}
  else if(form.id==='create-form'){
    const preferences=Object.fromEntries(['target','difficulty','detail','style','guidance'].map(k=>[k,f.get(k)]));
    const extra=(state.draft.summary.questions||[]).map((q,i)=>q.question+'：'+(f.get('q'+i)||'未补充')).join('\n');
    const r=await act({type:'create_tree',title:f.get('title'),goal:f.get('goal'),preferences,notes:extra+'\n'+f.get('notes')});
    if(r){go('tree/'+r.tree_id);toast('学习路线已保存，正在准备第一批卡片…');await act({type:'refill',tree_id:r.tree_id});}
  }
  else if(form.id==='settings-form'){const testing=event.submitter?.value!=='save';connectionResult(testing?'正在保存并测试连接，请稍候…':'正在保存设置…');const r=await act({type:testing?'configure_test':'configure',enabled:true,provider:f.get('provider'),base_url:f.get('base_url'),model:f.get('model'),key:f.get('key'),clear_key:f.has('clear_key'),remember:f.has('remember')},false);if(r){form.elements.key.value='';$('#key-presence').textContent=config.has_key?(config.remember?'（已在本机加密保存，留空可保留）':'（本次运行已有密钥，留空可保留）'):'';connectionResult(r.message,'success');toast(r.message);}}
  else if(form.id==='branch-form'){const r=await act({type:'branch',tree_id:t.id,node_id:n.id,title:f.get('title')});if(r){closeModal();go(`tree/${t.id}/${r.node_id}`);}}
  else if(form.id==='memory-form'){const id=form.dataset.id;const r=await act({type:id?'memory_edit':'memory_add',id,content:f.get('content'),category:f.get('category')});if(r)closeModal();}
  else if(form.id==='link-form'){const [other_tree_id,other_node_id]=f.get('target').split('/');const r=await act({type:'link',tree_id:t.id,node_id:n.id,other_tree_id,other_node_id});if(r)closeModal();}
  else if(form.id==='preferences-form'){const preferences=Object.fromEntries(['target','difficulty','detail','style','guidance'].map(k=>[k,f.get(k)]));const r=await act({type:'preferences',tree_id:t.id,goal:f.get('goal'),preferences});if(r){closeModal();toast('约定已更新，将用于之后的生成与问答。');}}
});
document.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&event.target.matches('g[data-action]')){event.preventDefault();event.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
document.addEventListener('input',event=>{if(event.target.matches('#chat-form textarea'))chatDrafts.set(contextKey(),event.target.value);if(event.target.matches('#draft-form textarea')){const button=$('[data-action="summarize"]');if(button&&!busy)button.disabled=!event.target.value.trim()&&!state.draft.messages.length;}});
window.addEventListener('hashchange',()=>{render();if(route()[0]==='tree')restoreReaderPosition();else window.scrollTo(0,0);});
window.addEventListener('scroll',keepReaderPosition,{passive:true});
window.addEventListener('pagehide',keepReaderPosition);
document.addEventListener('pointerdown',event=>{const control=event.target.closest('button,.round-control,.ask-pill,a.primary,summary');if(!control||control.disabled||matchMedia('(prefers-reduced-motion: reduce)').matches)return;control.classList.remove('jelly-tap');void control.offsetWidth;control.classList.add('jelly-tap');control.addEventListener('animationend',()=>control.classList.remove('jelly-tap'),{once:true});});

$('#modal').addEventListener('click',event=>{if(event.target===$('#modal')){const rect=$('#modal').getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeModal();}});
fetch('/api/state').then(async r=>{if(!r.ok)throw Error('无法读取本机学习资料。');return r.json();}).then(result=>{if(!state||(result.state.revision||0)>=(state.revision||0))state=result.state;config=result.settings;render();if(route()[0]==='tree')restoreReaderPosition();}).catch(error=>{$('#main').textContent=error.message+' 请确认本地服务已经启动，然后刷新。';});
