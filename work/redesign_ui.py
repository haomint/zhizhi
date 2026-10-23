from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'outputs' / 'learning-grove'
path = ROOT / 'static' / 'app.js'
source = path.read_text(encoding='utf-8')
source = source.replace("let state = null, config = null, busy = false, memoryFilter = '全部', memoryQuery = '', toastTimer;", "let state = null, config = null, busy = false, memoryFilter = '全部', memoryQuery = '', toastTimer;\nconst chatDrafts = new Map(), historyOpen = new Set();\nconst contextKey = () => currentTree() && currentNode() ? currentTree().id + '/' + currentNode().id : '';" )
start = source.index('function render() {')
end = source.index('function field(', start)
source = source[:start] + r'''
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
  else renderHome();
  if(busy)document.querySelectorAll('#main button').forEach(b=>{b.dataset.wasDisabled=String(b.disabled);b.disabled=true;});
}
function renderHome() {
  const completed=state.trees.reduce((sum,t)=>sum+t.nodes.filter(n=>n.status==='done').length,0),first=state.trees[0];
  $('#main').innerHTML=`<section class="hero"><div><div class="eyebrow"><span class="tiny-line"></span> 留一点时间，给自己的好奇</div><h1>每天一点，<br>长成自己的知识。</h1><p>把想学的事，变成一条走得下去的路线。<br>有方向地探索，也留住每一次理解。</p><div class="hero-actions">${first?`<a class="primary" href="#tree/${first.id}">${icon('book')}继续上次学习${icon('arrow',16)}</a>`:`<button class="primary" data-action="new">＋ 开始第一段学习</button>`}<button class="secondary" data-action="demo">体验高数示例 ${icon('arrow',16)}</button></div></div><div class="hero-art-wrap"><div class="hero-orbit"></div><div class="hero-art">${sproutArt(false,4)}</div><div class="hero-caption">一点理解，一片新叶。</div></div></section>
  <div class="stats"><div class="stat"><span>我的学习树</span><strong>${state.trees.length.toString().padStart(2,'0')}<small>棵</small></strong></div><div class="stat"><span>已点亮知识点</span><strong>${completed.toString().padStart(2,'0')}<small>个</small></strong></div><div class="stat"><span>积累的学习记忆</span><strong>${state.memories.length.toString().padStart(2,'0')}<small>条</small></strong></div></div>
  <div class="section-title"><div><div class="eyebrow">YOUR LEARNING COLLECTION</div><h2>正在生长的学习</h2></div><button class="text-link" data-action="new">新的好奇 ＋</button></div>
  ${state.trees.length?`<div class="tree-cards">${state.trees.map((t,index)=>{const done=t.nodes.filter(n=>n.status==='done').length,percent=Math.round(done/Math.max(1,t.nodes.length)*100);return `<article class="tree-card"><a class="tree-card-art" href="#map/${t.id}" aria-label="查看${esc(t.title)}的学习树">${sproutArt(true,Math.round(percent/100*12))}<span class="collection-no">${String(index+1).padStart(2,'0')} / ${t.demo?'示例':'个人路线'}</span><span class="art-map-link">查看学习树 ${icon('arrow',14)}</span></a><div class="tree-card-body"><h3><a href="#tree/${t.id}">${esc(t.title)}</a></h3><p>${esc(t.goal)}</p><div class="collection-progress"><span>${done} / ${t.nodes.length} 个知识点</span><strong>${percent}%</strong></div><div class="progress-track"><i style="width:${percent}%"></i></div><a class="collection-continue" href="#tree/${t.id}">继续学习 ${icon('arrow',17)}</a></div></article>`;}).join('')}</div>`:'<div class="empty-box"><h3>第一棵树，等一个好奇的念头。</h3><p>聊聊你想学什么，或打开示例，体验一段完整的学习。</p><button class="text-link" data-action="new">开始一段学习 →</button></div>'}
  <div class="quiet-note">${icon('tree',18)}<span>${config.enabled?'每一棵树，都有自己的学习约定。阅读中随时提问，回到全景也能看见来路。':'先用高数示例体验完整流程；在模型设置中连接 DeepSeek 后，即可生成自己的路线。'} 进度保存在这台电脑。</span></div><div class="footer-note">慢一点也没关系，主线一直在。</div>`;
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
      locations[n.id]={x:nx,y:ny};paths+=`<path class="twig ${n.status==='done'?'lit':''}" d="M${x} ${y-8} Q${nx} ${y-28} ${nx} ${ny}"/>`;
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
      paths+=`<path class="twig exploration ${n.status==='done'?'lit':''}" d="M${p.x} ${p.y} Q${p.x} ${ny} ${nx} ${ny}"/>`;
    });if(!changed)break;
  }
  tree.nodes.forEach(n=>{
    const p=locations[n.id];if(!p)return;const active=n.id===selected.id,title=n.title.length>8?n.title.slice(0,8)+'…':n.title;
    nodes+=`<g role="button" tabindex="0" class="node ${esc(n.status)}${active?' selected':''}" data-action="select-node" data-node="${n.id}" aria-label="${esc(n.title+'，'+statusText[n.status])}"><title>${esc(n.title+' · '+statusText[n.status])}</title>${active?`<circle class="halo" cx="${p.x}" cy="${p.y}" r="24"/>`:''}<circle cx="${p.x}" cy="${p.y}" r="12"/>${n.status==='done'?`<path class="node-check" d="m${p.x-5} ${p.y} 3 3 7-7"/>`:''}<text x="${p.x}" y="${p.y+34}">${esc(title)}</text></g>`;
  });
  return `<svg class="map-svg" viewBox="0 0 1000 ${height}" role="group" aria-label="学习树知识点导航">${paths}${labels}${nodes}<ellipse cx="500" cy="${height-64}" rx="76" ry="5" fill="#dce3cf"/><text class="root-label" x="500" y="${height-25}">每一点理解，都在这里生长</text></svg>`;
}
function learningHeader(tree,node,isMap=false) {
  const done=tree.nodes.filter(n=>n.status==='done').length;
  return `<div class="learning-top"><div class="learning-title"><div class="eyebrow">${tree.demo?'示例学习路线':'我的学习路线'} <span class="eyebrow-dot">·</span> ${done} / ${tree.nodes.length} 已点亮</div><h1>${esc(tree.title)}</h1></div><div class="learning-header-actions"><button class="icon-button" data-action="tree-details">${icon('settings',16)}学习约定</button><details class="tree-menu"><summary aria-label="更多学习操作">${icon('more')}</summary><div><button data-action="refill">补充待学卡片</button><button data-action="export">导出学习档案</button><button class="danger" data-action="delete-tree">删除学习树</button></div></details></div></div>
  <div class="learning-subnav"><nav aria-label="当前学习视图"><a href="#tree/${tree.id}/${node.id}" class="${!isMap?'active':''}" ${!isMap?'aria-current="page"':''}>${icon('book',16)}卡片学习</a><a href="#map/${tree.id}/${node.id}" class="${isMap?'active':''}" ${isMap?'aria-current="page"':''}>${icon('tree',17)}学习树全景</a></nav><span class="route-hint">${isMap?'看见来路，也看见下一步':'一次一点，按自己的节奏'}</span></div>`;
}
function renderMap() {
  const tree=currentTree(),node=currentNode(),done=tree.nodes.filter(n=>n.status==='done').length,chapters=[...new Set(tree.nodes.map(n=>n.chapter))];
  $('#main').innerHTML=learningHeader(tree,node,true)+`<div class="map-intro"><div><h2>把学过的，连成自己的风景。</h2><p>${esc(tree.goal)}</p></div><a class="primary" href="#tree/${tree.id}/${node.id}">回到卡片 ${icon('arrow',16)}</a></div><div class="map-layout"><section class="panel map-panel"><div class="map-canvas-heading"><span>${icon('tree',17)} 知识生长图</span><span>${Math.round(done/Math.max(1,tree.nodes.length)*100)}% 已点亮</span></div>${treeSvg(tree,node)}<div class="map-legend"><span>待学习</span><span class="current">正在查看</span><span class="lit">已完成</span><span class="skipped">已跳过</span></div><div class="source-note">${esc(tree.source_status)}<br>点亮代表按本次学习目标完成；点击知识点，进入对应卡片。</div></section><aside class="map-outline"><div class="outline-heading"><span class="eyebrow">LEARNING OUTLINE</span><h3>这段旅程的路线</h3><p>${chapters.length} 个章节 · ${tree.nodes.length} 个知识点</p></div><div class="chapter-list">${chapters.map((ch,i)=>`<details ${tree.nodes.some(n=>n.id===node.id&&n.chapter===ch)?'open':''}><summary><span class="chapter-number">${String(i+1).padStart(2,'0')}</span><span>${esc(ch)}</span><small>${tree.nodes.filter(n=>n.chapter===ch&&n.status==='done').length}/${tree.nodes.filter(n=>n.chapter===ch).length}</small></summary>${tree.nodes.filter(n=>n.chapter===ch).map(n=>`<button class="${n.id===node.id?'selected':''}" data-action="select-node" data-node="${n.id}" ${n.id===node.id?'aria-current="true"':''}><span class="outline-dot ${n.status}"></span><span>${n.parent_id?'↳ ':''}${esc(n.title)}</span><span class="node-state">${statusText[n.status]}</span></button>`).join('')}</details>`).join('')}</div><div class="outline-note">${icon('branch',18)}<p>学习中遇到新的好奇，可以从卡片长出探索分支。</p></div></aside></div>`;
}
function renderTree() {
  const tree=currentTree(),node=currentNode(),index=tree.nodes.indexOf(node),cards=node.cards;
  const page=Math.min(node.page||0,Math.max(0,cards.length-1)),card=cards[page],key=contextKey();
  const prev=tree.nodes[index-1],next=tree.nodes[index+1],isQuestion=card&&/思考|想一想|问题|练习/.test(card.kind||'');
  const otherLinks=node.links.map(link=>{const t=state.trees.find(t=>t.id===link.tree_id),n=t?.nodes.find(n=>n.id===link.node_id);return t&&n?`<button data-action="visit-link" data-tree="${t.id}" data-node="${n.id}">${icon('link',14)} ${esc(t.title)} / ${esc(n.title)} ${icon('arrow',14)}</button>`:'';}).join('');
  $('#main').innerHTML=learningHeader(tree,node)+`<div class="reader-wrap">${tree.demo?`<div class="demo-notice"><span><b>示例体验</b> 固定卡片和回答，帮助你了解学习流程。</span><button data-action="new">创建自己的路线 →</button></div>`:''}<div class="reader-location"><span><span class="chapter-number">${String(index+1).padStart(2,'0')}</span>${esc(node.chapter)}<span class="crumb-divider">/</span>${esc(node.title)}</span><a href="#map/${tree.id}/${node.id}">查看全景 ${icon('tree',16)}</a></div>
  <section class="panel reading-card" aria-label="知识卡片与提问"><div class="reading-card-header"><span class="reading-node-label">${icon('book',16)} ${esc(node.title)}</span><span class="node-status ${esc(node.status)}">${node.status==='done'?icon('check',13):''}${statusText[node.status]}</span></div>
  ${cards.length?`<div class="card-tabs" aria-label="卡片分页">${cards.map((c,i)=>`<button class="${i===page?'active':''}" data-action="page" data-page="${i}" ${i===page?'aria-current="page"':''}><span>${String(i+1).padStart(2,'0')}</span>${esc(c.kind||'知识卡片')}</button>`).join('')}</div><article class="knowledge-card ${isQuestion?'question':''}"><div class="card-kicker"><span>${isQuestion?'留一点空间，自己想一想':'TODAY’S SMALL UNDERSTANDING'}</span><span class="card-folio">${String(page+1).padStart(2,'0')} <small>/ ${String(cards.length).padStart(2,'0')}</small></span></div><h2>${esc(card.title)}</h2><div class="body-text">${esc(card.text)}</div>${card.image?`<figure><img src="${esc(card.image)}" alt="本页知识卡片附图"><figcaption>本页静态图片</figcaption></figure>`:''}</article><div class="card-bottom"><div class="page-dots" aria-label="第${page+1}页，共${cards.length}页">${cards.map((_,i)=>`<span class="${i===page?'active':''}"></span>`).join('')}</div><div class="page-controls"><button data-action="page" data-page="${Math.max(0,page-1)}" ${page===0?'disabled':''} aria-label="上一页">${icon('back',17)}</button><span>${page+1} / ${cards.length}</span><button data-action="page" data-page="${Math.min(cards.length-1,page+1)}" ${page===cards.length-1?'disabled':''} aria-label="下一页">${icon('arrow',17)}</button></div></div>`:`<div class="card-placeholder">${icon('tree',44)}<h2>从这个知识点，继续生长。</h2><p>${esc(node.description||'路线已经准备好。到达这里时，再展开适合你的短卡片。')}</p><button class="primary" data-action="generate-node">准备这一节卡片 ${icon('arrow',16)}</button></div>`}
  <section class="card-conversation" aria-label="卡片内提问"><div class="conversation-heading"><div class="assistant-mark">${icon('chat',18)}</div><div><h3>在这里，聊懂这一页</h3><p>有疑问就问，也可以告诉我怎样讲更适合你。</p></div><span class="conversation-label">${tree.demo?'示例问答':'学习助手'}</span></div>
  ${node.messages.length?`<details class="conversation-history" data-chat-history ${historyOpen.has(key)?'open':''}><summary>本节已有 ${node.messages.length} 条交流 <span>展开 / 收起</span></summary><div class="chat-messages" role="log" aria-label="本节问答记录">${node.messages.map(m=>`<div class="chat-message ${m.role==='user'?'user':'assistant'}"><small>${m.role==='user'?'你':'知枝 · 学习助手'}</small><div>${esc(m.content)}</div></div>`).join('')}</div></details>`:''}
  <div class="chat-chips"><button data-action="chat-chip" data-value="换一个生活中的例子解释一下。">换个例子 ${icon('arrow',12)}</button><button data-action="chat-chip" data-value="请用更简单的方式解释这个概念。">再简单一点 ${icon('arrow',12)}</button><button data-action="chat-chip" data-value="我希望先自己思考，请给我一个提示。">给我一点提示 ${icon('arrow',12)}</button></div><form class="chat-form" id="chat-form"><textarea name="message" aria-label="向学习助手提问" placeholder="关于这一页，你想问什么？" maxlength="4000" required>${esc(chatDrafts.get(key)||'')}</textarea><div class="send-row"><span>交流会记在「${esc(node.title)}」中</span><button class="primary" type="submit">发送 ${icon('arrow',15)}</button></div></form></section>
  <div class="node-tools"><button data-action="branch">${icon('branch',15)}延伸探索</button><button data-action="link">${icon('link',15)}关联旧知识</button>${card?`<button data-action="image">${icon('image',15)}添加图片</button>${card.image?'<button data-action="remove-image">移除图片</button>':''}`:''}</div>${otherLinks?`<div class="links-box"><span class="muted">与以前的学习连起来</span>${otherLinks}</div>`:''}</section>
  <div class="reader-completion"><div><span class="eyebrow">走完这一小步</span><p>按约定完成后，让这个知识点亮起来。</p></div><div class="node-actions"><button class="text-link" data-action="skip">先跳过</button>${node.status==='done'||node.status==='skipped'?'<button class="secondary" data-action="restart-node">重新学习</button>':''}<button class="primary" data-action="complete">${node.status==='done'?'已完成 · 继续下一节':'完成这一节'} ${icon(node.status==='done'?'arrow':'check',16)}</button></div></div><div class="lesson-navigation">${prev?`<button data-action="select-node" data-node="${prev.id}">${icon('back',16)}<span><small>上一个知识点</small>${esc(prev.title)}</span></button>`:'<span></span>'}${next?`<button class="next-lesson" data-action="select-node" data-node="${next.id}"><span><small>下一个知识点</small>${esc(next.title)}</span>${icon('arrow',16)}</button>`:'<span class="journey-end">已经来到路线的最后一个知识点。</span>'}</div><div class="footer-note">一页一点，理解会慢慢连起来。</div></div>`;
  const history=$('[data-chat-history]');if(history)history.addEventListener('toggle',()=>{if(history.open)historyOpen.add(key);else historyOpen.delete(key);});
  const messages=$('.chat-messages');if(messages)messages.scrollTop=messages.scrollHeight;
}
''' + source[end:]
source=source.replace("else if(action==='chat-chip'){$('#chat-form textarea').value=b.dataset.value;$('#chat-form textarea').focus();}", "else if(action==='chat-chip'){$('#chat-form textarea').value=b.dataset.value;chatDrafts.set(contextKey(),b.dataset.value);$('#chat-form textarea').focus();}")
source=source.replace("else if(form.id==='chat-form'){await act({type:'chat',tree_id:t.id,node_id:n.id,message:f.get('message')});}", "else if(form.id==='chat-form'){const key=contextKey();historyOpen.add(key);const r=await act({type:'chat',tree_id:t.id,node_id:n.id,message:f.get('message')},false);if(r){chatDrafts.delete(key);render();$('#chat-form textarea')?.focus();}}")
source=source.replace("document.addEventListener('input',event=>{if(event.target.matches('#draft-form textarea'))", "document.addEventListener('input',event=>{if(event.target.matches('#chat-form textarea'))chatDrafts.set(contextKey(),event.target.value);if(event.target.matches('#draft-form textarea'))")
# Preferences and delete controls can also be reached on the independent map page.
path.write_text(source,encoding='utf-8')
print('Updated reading, learning map, home, and embedded question interactions.')
