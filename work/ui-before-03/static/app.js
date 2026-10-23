'use strict';
let state = null, config = null, busy = false, memoryFilter = '全部', memoryQuery = '', toastTimer;
const $ = (s, root = document) => root.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statusText = {unseen:'待学习',learning:'学习中',done:'已完成',skipped:'已跳过'};
const route = () => (location.hash.slice(1) || 'home').split('/');
const currentTree = () => state?.trees.find(t => t.id === route()[1]);
const currentNode = () => {const t = currentTree(); return t?.nodes.find(n => n.id === route()[2]) || t?.nodes.find(n=>n.id===t.current_node_id) || t?.nodes.find(n => n.status === 'learning') || t?.nodes[0];};
const go = hash => {if(location.hash === '#' + hash) render(); else location.hash = hash;};
function toast(text) {clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').classList.add('visible');toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),6500);}
function setBusy(value) {busy=value;document.querySelectorAll('button').forEach(b=>{if(value){b.dataset.wasDisabled=String(b.disabled);b.disabled=true;}else if(b.dataset.wasDisabled!==undefined){b.disabled=b.dataset.wasDisabled==='true';delete b.dataset.wasDisabled;}});$('#save-status').textContent=value?'正在处理…':'已保存至本机';}
function modelBadge(){
  if(!config)return;
  const name=config.provider==='deepseek'?'DeepSeek':'模型服务';
  $('#mode-badge').className='badge '+(config.enabled&&config.test_status==='passed'?'live':'demo');
  $('#mode-badge').textContent=name+' · '+(!config.enabled?'待设置':config.test_status==='passed'?'已连接':config.test_status==='failed'?'连接未通过':'待测试');
  $('#mode-mini').textContent=config.enabled?'· 已设置':'';
}
function connectionResult(text,kind='wait') {const el=$('#connection-result');if(el){el.textContent=text;el.className='connection-result '+kind;}}
async function act(data, redraw = true) {
  if(busy) return null;
  setBusy(true);
  try {
    const response=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(120000)});
    const result=await response.json();
    if(result.settings){config=result.settings;modelBadge();}
    if(!response.ok)throw Error((result.settings_saved?'设置已保存，但连接测试未通过：':'')+(result.error || '操作没有完成，请重试。'));
    state=result.state;config=result.settings;
    if(redraw)render();
    return result;
  } catch(error) {let message=error.name==='TimeoutError'?'等待模型超时。请稍后刷新查看，避免重复提交。':error.message;if(error.name==='TypeError')message='本地服务暂时没有连接，请重新运行“启动知枝.cmd”，再刷新页面。';toast(message);if(data.type==='configure_test'||data.type==='configure')connectionResult(message,'error');return null;}
  finally {setBusy(false);}
}
function modal(title, html) {$('#modal-content').innerHTML=`<div class="modal-top"><h2>${esc(title)}</h2><button data-action="close-modal" aria-label="关闭">×</button></div>${html}`;$('#modal').showModal();}
function closeModal() {$('#modal').close();}
function sproutArt(mini=false, lit=0) {
  return `<svg viewBox="0 0 440 260" aria-hidden="true"><g fill="none" stroke="#b9c9aa" stroke-linecap="round"><path d="M220 239 Q218 170 220 102" stroke-width="5"/><path d="M220 200 Q167 190 138 143 M220 172 Q274 162 303 112 M220 141 Q173 124 159 80 M220 117 Q255 95 271 55 M220 100 Q213 70 215 34" stroke-width="2.5"/><path d="M138 143 Q96 143 78 119 M138 143 Q131 110 119 95 M303 112 Q335 111 351 89 M303 112 Q301 86 310 66 M159 80 Q136 64 133 42 M159 80 Q176 54 173 38 M271 55 Q286 42 290 25" stroke-width="1.5"/></g><g fill="#e0e8d6" stroke="#a9be96" stroke-width="1.3">${[[78,119],[119,95],[133,42],[173,38],[215,34],[271,55],[290,25],[310,66],[351,89],[159,80],[138,143],[303,112]].map(([x,y],i)=>`<ellipse cx="${x}" cy="${y}" rx="${mini?7:10}" ry="${mini?10:14}" transform="rotate(${i%2?28:-28} ${x} ${y})" ${i<lit?'fill="#91ad79"':''}/>`).join('')}</g><ellipse cx="220" cy="244" rx="58" ry="4" fill="#d9e0cc"/><g fill="#bdc9ad"><circle cx="84" cy="183" r="2"/><circle cx="353" cy="152" r="2"/><circle cx="183" cy="22" r="1.5"/></g></svg>`;
}
function render() {
  if(!state)return;
  const [page]=route();
  document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===page));
  $('#memory-count').textContent=state.memories.length;
  $('#tree-nav').innerHTML=state.trees.length?state.trees.map(t=>`<a class="${currentTree()?.id===t.id?'active':''}" href="#tree/${t.id}">${esc(t.title)}</a>`).join(''):'';
  modelBadge();
  $('#breadcrumbs').textContent=page==='tree'?(currentTree()?.title || '学习树'):page==='new'?'新建学习 · 从你的想法开始':page==='profile'?'个人资料库':'我的学习树';
  if(page==='new') renderNew();
  else if(page==='tree' && currentTree()) renderTree();
  else if(page==='profile') renderProfile();
  else renderHome();
  if(busy)document.querySelectorAll('#main button').forEach(b=>{b.dataset.wasDisabled=String(b.disabled);b.disabled=true;});
}
function renderHome() {
  const completed=state.trees.reduce((sum,t)=>sum+t.nodes.filter(n=>n.status==='done').length,0);
  $('#main').innerHTML=`<section class="hero"><div><div class="eyebrow">A LITTLE CURIOSITY, A LITTLE EVERY DAY</div><h1>把好奇，长成自己的知识。</h1><p>从一个想学的念头开始。找到方向，一次学一点，<br>让每段探索都有来处，也有可以回看的痕迹。</p><div class="hero-actions"><button class="primary" data-action="new">＋ 种下第一棵学习树</button><button class="secondary" data-action="demo">先看看高数示例 ↗</button></div></div><div class="hero-art-wrap"><div class="hero-art">${sproutArt()}</div><div class="hero-caption">每一点理解，都会留下痕迹</div></div></section>
  <div class="stats"><div class="stat"><strong>${state.trees.length.toString().padStart(2,'0')}</strong><span>棵学习树</span></div><div class="stat"><strong>${completed.toString().padStart(2,'0')}</strong><span>个已点亮知识点</span></div><div class="stat"><strong>${state.memories.length.toString().padStart(2,'0')}</strong><span>条个人学习记忆</span></div></div>
  <div class="section-title"><h2>我的学习树</h2><span>各自生长，彼此相连</span></div>
  ${state.trees.length?`<div class="tree-cards">${state.trees.map(t=>{const done=t.nodes.filter(n=>n.status==='done').length;return `<a class="tree-card" href="#tree/${t.id}"><div class="tree-card-art">${sproutArt(true,Math.round(done/t.nodes.length*12))}</div><div class="tree-card-body"><span class="eyebrow">${t.demo?'示例学习树':'个人学习路线'}</span><h3>${esc(t.title)}</h3><p>${esc(t.goal)}</p><div class="progress-track"><svg width="100%" height="4"><rect width="${Math.round(done/t.nodes.length*100)}%" height="4" fill="#799b66"/></svg></div><div class="tree-card-meta"><span>${done} / ${t.nodes.length} 个知识点已点亮</span><span>继续学习 →</span></div></div></a>`;}).join('')}</div>`:'<div class="empty-box"><h3>第一棵树，等一个好奇的念头。</h3><p>聊聊你想学什么，或打开示例，体验一段完整的学习。</p></div>'}
  <div class="quiet-note"><span>✳</span><span>${config.enabled?'连接设置已保存。可以先在 DeepSeek 设置中测试，再创建自己的学习路线。':'先看高数示例体验流程；填写 DeepSeek API Key 后，再生成适合自己的学习路线与卡片。'} 进度和资料保存在当前电脑。</span></div><div class="footer-note">慢一点也没关系，主线一直在。</div>`;
}
function treeSvg(tree, selected) {
  const chapters=[...new Set(tree.nodes.filter(n=>!n.parent_id).map(n=>n.chapter))];
  const locations={}, anchors=[{x:210,y:445},{x:650,y:445},{x:235,y:225},{x:625,y:225}];
  let paths='<path class="trunk" d="M430 675 Q425 510 430 130"/>', labels='', nodes='';
  chapters.forEach((chapter,ci)=>{
    const anchor=anchors[ci%4], members=tree.nodes.filter(n=>!n.parent_id&&n.chapter===chapter), left=ci%2===0;
    paths+=`<path class="twig" d="M430 ${anchor.y+90} Q${anchor.x} ${anchor.y+80} ${anchor.x} ${anchor.y}"/>`;
    labels+=`<text class="chapter-label" x="${anchor.x}" y="${anchor.y+34}">${esc(chapter)}</text>`;
    members.forEach((n,j)=>{const x=anchor.x+(j-(members.length-1)/2)*100,y=anchor.y-60-Math.round(25*(1-Math.abs(j-(members.length-1)/2)));locations[n.id]={x,y};paths+=`<path class="twig ${n.status==='done'?'lit':''}" d="M${anchor.x} ${anchor.y} Q${x} ${anchor.y-15} ${x} ${y}"/>`;});
  });
  let extraIndex=0;
  tree.nodes.filter(n=>n.parent_id).forEach(n=>{
    const p=locations[n.parent_id]||{x:430,y:350};
    const x=Math.max(65,Math.min(795,p.x+(extraIndex%2===0?55:-55))),y=Math.max(30,p.y-85-Math.floor(extraIndex/8)*20);
    locations[n.id]={x,y};paths+=`<path class="twig ${n.status==='done'?'lit':''}" d="M${p.x} ${p.y} Q${p.x} ${y} ${x} ${y}"/>`;extraIndex++;
  });
  tree.nodes.forEach(n=>{const p=locations[n.id];if(!p)return;const selectedClass=n.id===selected.id?' selected':'';nodes+=`<g role="button" tabindex="0" class="node ${esc(n.status)}${selectedClass}" data-action="select-node" data-node="${n.id}" aria-label="${esc(n.title+'，'+statusText[n.status])}"><title>${esc(n.title+' · '+statusText[n.status])}</title>${n.id===selected.id?`<circle class="halo" cx="${p.x}" cy="${p.y}" r="23"/>`:''}<circle cx="${p.x}" cy="${p.y}" r="13"/><text x="${p.x}" y="${p.y+38}">${esc(n.title.length>8?n.title.slice(0,8)+'…':n.title)}</text></g>`;});
  return `<svg class="map-svg" viewBox="0 0 860 720" role="group" aria-label="学习树知识点导航">${paths}${labels}${nodes}<ellipse cx="430" cy="684" rx="70" ry="5" fill="#dce3cf"/><text class="root-label" x="430" y="710">从这里，慢慢生长</text></svg>`;
}
function renderTree() {
  const tree=currentTree(),node=currentNode(),done=tree.nodes.filter(n=>n.status==='done').length,chapters=[...new Set(tree.nodes.map(n=>n.chapter))];
  const cards=node.cards,page=Math.min(node.page||0,Math.max(0,cards.length-1)),card=cards[page];
  const otherLinks=node.links.map(link=>{const t=state.trees.find(t=>t.id===link.tree_id),n=t?.nodes.find(n=>n.id===link.node_id);return t&&n?`<button data-action="visit-link" data-tree="${t.id}" data-node="${n.id}">↗ ${esc(t.title)} / ${esc(n.title)}</button>`:'';}).join('');
  $('#main').innerHTML=`<div class="page-heading"><div><div class="eyebrow">${tree.demo?'A SMALL DEMO, A REAL LEARNING PATH':'YOUR PERSONAL LEARNING PATH'}</div><h1>${esc(tree.title)}</h1><p>${esc(tree.goal)}</p></div><div class="actions"><button class="icon-button" data-action="tree-details">学习约定</button><button class="icon-button" data-action="refill">补充卡片</button><button class="icon-button danger" data-action="delete-tree" aria-label="删除这棵学习树">删除</button></div></div>
  ${tree.demo?`<div class="demo-notice"><span>这是一棵固定演示树。DeepSeek 会用于你新建的正式学习树。</span><button class="secondary" data-action="new">开始自己的学习 →</button></div>`:''}<div class="workspace"><section class="panel map-panel"><div class="panel-header"><h3>学习全景</h3><small>${done} / ${tree.nodes.length} 已点亮</small></div>${treeSvg(tree,node)}<div class="map-legend"><span>待学习</span><span class="current">正在查看</span><span class="lit">已完成</span></div><div class="chapter-list">${chapters.map(ch=>`<details ${tree.nodes.some(n=>n.id===node.id&&n.chapter===ch)?'open':''}><summary>${esc(ch)}</summary>${tree.nodes.filter(n=>n.chapter===ch).map(n=>`<button class="${n.id===node.id?'selected':''}" data-action="select-node" data-node="${n.id}"><span>${esc(n.title)}</span><span class="node-state">${statusText[n.status]}</span></button>`).join('')}</details>`).join('')}</div><div class="source-note">${esc(tree.source_status)}<br>轮廓是路线，点亮代表按本次目标完成。</div></section>
  <section class="panel card-panel"><div class="card-heading"><div class="eyebrow">${esc(node.chapter)} / ${statusText[node.status]}</div><h2>${esc(node.title)}</h2></div>${cards.length?'':`<div class="node-info">${esc(node.description)}</div>`}
  ${cards.length?`<div class="card-tabs">${cards.map((c,i)=>`<button class="${i===page?'active':''}" data-action="page" data-page="${i}">${esc(c.kind||'第'+(i+1)+'页')}</button>`).join('')}</div><article class="knowledge-card ${card.kind.includes('思考')||card.kind.includes('想一想')?'question':''}"><h3>${esc(card.title)}</h3><div class="body-text">${esc(card.text)}</div>${card.image?`<img src="${esc(card.image)}" alt="这张卡片附加的静态图片">`:''}</article><div class="card-bottom"><span>一页一点，按自己的节奏来</span><div class="page-controls"><button data-action="page" data-page="${Math.max(0,page-1)}" ${page===0?'disabled':''} aria-label="上一页">←</button><span>${page+1} / ${cards.length}</span><button data-action="page" data-page="${Math.min(cards.length-1,page+1)}" ${page===cards.length-1?'disabled':''} aria-label="下一页">→</button></div></div>`:`<div class="card-placeholder"><div>${sproutArt(true)}</div><p>路线已经在这里。到达这个知识点时，再展开适合你的短卡片。</p><button class="primary" data-action="generate-node">生成这一节卡片</button></div>`}
  <div class="node-actions"><button class="primary" data-action="complete">${node.status==='done'?'已完成 · 继续下一节 →':'按本次目标完成 ✓'}</button><button class="secondary" data-action="skip">跳过这一节</button>${node.status==='done'||node.status==='skipped'?'<button class="secondary" data-action="restart-node">重新学习</button>':''}</div><div class="node-tools"><button data-action="branch">＋ 从这里长出分支</button><button data-action="link">↗ 关联旧知识</button>${card?`<button data-action="image">▧ 添加静态图片</button>${card.image?'<button data-action="remove-image">移除图片</button>':''}`:''}</div>${otherLinks?`<div class="links-box"><span class="muted">连接以前的学习</span>${otherLinks}</div>`:''}</section>
  <section class="panel chat-panel"><div class="panel-header"><h3>随时聊一聊</h3><small>${tree.demo?'固定示例回答':'个人学习助手'}</small></div><div class="chat-context">围绕「${esc(node.title)}」交流，也可以聊学习方法。${tree.demo?'此树为演示，接入模型不会改变已有示例。':''}</div><div class="chat-messages">${node.messages.length?node.messages.map(m=>`<div class="chat-message ${m.role==='user'?'user':'assistant'}"><small>${m.role==='user'?'你':'学习助手'}</small>${esc(m.content)}</div>`).join(''):'<p class="chat-empty">哪里还不清楚？<br>可以问一个问题，也可以告诉我怎样讲更适合你。</p>'}</div><div class="chat-chips"><button data-action="chat-chip" data-value="换一个生活中的例子解释一下。">换个例子</button><button data-action="chat-chip" data-value="请用更简单的方式解释这个概念。">再简单一点</button><button data-action="chat-chip" data-value="我希望先自己思考，请给我一个提示。">给我一点提示</button></div><form class="chat-form" id="chat-form"><textarea name="message" aria-label="向学习助手提问" placeholder="提问，或聊聊你想怎样学…" maxlength="4000" required></textarea><div class="send-row"><span>问题和反馈会保留在本节</span><button class="primary" type="submit">发送 ↑</button></div></form></section></div>`;
  const messages=$('.chat-messages');messages.scrollTop=messages.scrollHeight;
}
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
function renderProfile() {
  const categories=['全部',...new Set(state.memories.map(m=>m.category))];
  const items=state.memories.filter(m=>(memoryFilter==='全部'||m.category===memoryFilter)&&(!memoryQuery||m.content.toLowerCase().includes(memoryQuery.toLowerCase()))).slice().reverse();
  $('#main').innerHTML=`<div class="page-heading"><div><div class="eyebrow">YOUR PERSONAL LEARNING MEMORY</div><h1>关于你，也关于一路的学习。</h1><p>目标、兴趣、偏好和曾经的问题，在这里慢慢积累。你可以随时纠正它。</p></div><button class="primary" data-action="add-memory">＋ 补充一条记忆</button></div><div class="profile-toolbar"><input class="filter-input" id="memory-search" aria-label="搜索个人资料" placeholder="搜索记录…" value="${esc(memoryQuery)}"><button class="secondary" data-action="search-memory">查找</button><button class="secondary" data-action="export">导出档案 ↗</button></div><div class="memory-filters">${categories.map(c=>`<button class="${memoryFilter===c?'active':''}" data-action="memory-filter" data-value="${esc(c)}">${esc(c)}</button>`).join('')}</div>${items.length?`<div class="memory-grid">${items.map(m=>{const tree=state.trees.find(t=>t.id===m.tree_id);return `<article class="memory-card"><div><span class="badge">${esc(m.category)}</span>${m.source==='助手暂时推测'?' <span class="badge demo">待你确认的推测</span>':''}</div><p>${esc(m.content)}</p><div class="memory-meta">${esc(m.source)}${tree?' · '+esc(tree.title):''}<br>${new Date(m.updated).toLocaleDateString('zh-CN')}</div><div class="memory-actions"><button data-action="edit-memory" data-id="${m.id}">修改</button><button data-action="delete-memory" data-id="${m.id}">删除</button>${tree?`<button data-action="visit-link" data-tree="${tree.id}" data-node="${m.node_id||''}">回到学习 →</button>`:''}</div></article>`;}).join('')}</div>`:'<div class="empty-box"><h3>这里会逐渐认识你。</h3><p>可以先写下一条兴趣或目标，也可以从学习中的交流开始积累。</p></div>'}<div class="quiet-note">每条记录保留来源和适用的学习情境。用户完成记录代表主动标记，不等于独立掌握测评。删除一条提取的记忆，不会删除原学习节点中的对话。</div>`;
}
function settingsModal() {
  modal('DeepSeek 连接设置',`<div class="provider-intro"><span class="badge live">默认通道 · DeepSeek</span><p>地址和模型已经填好，粘贴 API Key 就可以开始。应用和学习档案保存在本机，生成内容时联网调用所选模型服务。</p></div><form id="settings-form"><label class="field">DeepSeek API Key <span id="key-presence">${config.has_key?(config.remember?'（已在本机加密保存，留空可保留）':'（本次运行已有密钥，留空可保留）'):''}</span><input type="password" name="key" autocomplete="off" spellcheck="false" placeholder="粘贴在 DeepSeek 开放平台创建的 API Key"></label><label class="checkbox-field"><input type="checkbox" name="remember" ${(config.remember||!config.has_key)&&config.can_remember?'checked':''} ${config.can_remember?'':'disabled'}> 在当前 Windows 账号下加密保存，重启后继续使用</label><details class="advanced-settings"><summary>高级设置 · 默认无需修改</summary>${selectField('模型通道','provider',config.provider==='compatible'?['compatible','deepseek']:['deepseek','compatible'],config.provider)}${field('API 地址','base_url',config.base_url||'https://api.deepseek.com')}${field('模型名称','model',config.model||'deepseek-flash')}<label class="checkbox-field"><input type="checkbox" name="clear_key"> 清除原有密钥</label></details><div id="connection-result" class="connection-result" role="status">${esc(config.notice||'尚未测试。点击“保存并测试连接”会使用上面当前填写的内容。')}</div><div class="form-actions"><button class="primary" type="submit" name="mode" value="test">保存并测试连接</button><button class="secondary" type="submit" name="mode" value="save">仅保存</button></div><p class="small-note">API Key 不会出现在学习档案导出或页面返回数据中。加密保存仅适用于当前 Windows 账号。此应用只在本机提供页面。</p><div class="settings-links"><button type="button" data-action="use-demo">暂用演示模式</button><a href="https://platform.deepseek.com/" target="_blank" rel="noopener noreferrer">前往 DeepSeek 开放平台 ↗</a></div></form>`);
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
document.addEventListener('click', async event=>{
  const b=event.target.closest('[data-action]');if(!b||b.disabled||busy)return;
  const action=b.dataset.action,t=currentTree(),n=currentNode();
  if(action==='new')go('new');
  else if(action==='settings')settingsModal();
  else if(action==='close-modal')closeModal();
  else if(action==='demo'){const r=await act({type:'demo'});if(r)go('tree/'+r.tree_id);}
  else if(action==='select-node')await openNode(b.dataset.node);
  else if(action==='page')await act({type:'set_page',tree_id:t.id,node_id:n.id,page:Number(b.dataset.page)});
  else if(action==='generate-node'){const r=await act({type:'refill',tree_id:t.id,node_id:n.id});if(r&&n.status==='unseen')await act({type:'status',tree_id:t.id,node_id:n.id,status:'learning'});}
  else if(action==='refill'){const r=await act({type:'refill',tree_id:t.id});if(r)toast('已按当前进度准备卡片；待学习余量充足时不会重复生成。');}
  else if(action==='complete')await completeNode(false);
  else if(action==='skip')await completeNode(true);
  else if(action==='restart-node')await act({type:'status',tree_id:t.id,node_id:n.id,status:'learning'});
  else if(action==='chat-chip'){$('#chat-form textarea').value=b.dataset.value;$('#chat-form textarea').focus();}
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
    try{const r=await fetch('/api/export');if(!r.ok)throw Error('导出失败。');const blob=new Blob([JSON.stringify(await r.json(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='知枝-学习档案-'+new Date().toLocaleDateString('sv-SE')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出学习树和个人资料，不包含模型密钥。');}catch(e){toast(e.message);}
  }
});
document.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;const form=event.target,f=new FormData(form),t=currentTree(),n=currentNode();
  if(form.id==='draft-form'){const r=await act({type:'draft_message',message:f.get('message')});if(r)$('#draft-form textarea').focus();}
  else if(form.id==='chat-form'){await act({type:'chat',tree_id:t.id,node_id:n.id,message:f.get('message')});}
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
document.addEventListener('input',event=>{if(event.target.matches('#draft-form textarea')){const button=$('[data-action="summarize"]');if(button&&!busy)button.disabled=!event.target.value.trim()&&!state.draft.messages.length;}});
window.addEventListener('hashchange',()=>{render();window.scrollTo(0,0);});
$('#modal').addEventListener('click',event=>{if(event.target===$('#modal')){const rect=$('#modal').getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeModal();}});
fetch('/api/state').then(async r=>{if(!r.ok)throw Error('无法读取本机学习资料。');return r.json();}).then(result=>{state=result.state;config=result.settings;render();}).catch(error=>{$('#main').textContent=error.message+' 请确认本地服务已经启动，然后刷新。';});
