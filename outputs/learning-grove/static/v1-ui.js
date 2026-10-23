/* Product controls layered onto the existing reader; no quiz in the main route. */
(()=>{
const v=(name,text,attrs='')=>`<button type="button" class="secondary" data-v1="${name}" ${attrs}>${text}</button>`;
const previousRender=render;
let background=false,lastTree='',attempted=new Set();
render=function(){previousRender();enhance();scheduleNext();};
function enhance(){
 const t=currentTree(),n=currentNode(),main=$('#main');
 if(t){
  const row=document.createElement('section');row.className='learning-tools';
  row.innerHTML=`${v('materials','学习资料 · '+(t.materials?.length||0))}${v('feedback','调整讲法')}${v('settle','结束本次学习')}${v('tasks','生成任务')}${v('route','调整路线')}`;
  if(route()[0]==='tree'&&n?.ready)row.innerHTML+=v('strengthen',n.reinforcement?.passed&&n.reinforcement.version===n.content_version?'🟠 已通过加强检查':'自愿加强学习')+v('evidence','内容依据')+v('regenerate','重新生成');
  if(n?.content_history?.length)row.innerHTML+=v('rollback','恢复上一版');
  main.append(row);
  if(n?.reinforcement?.passed&&n.reinforcement.version===n.content_version){const label=$('.pocket-heading strong');if(label)label.insertAdjacentHTML('afterend','<span class="mastered-badge">加强已通过</span>');}
  for(const node of t.nodes){if(node.reinforcement?.passed&&node.reinforcement.version===node.content_version){document.querySelectorAll(`[data-node="${CSS.escape(node.id)}"]`).forEach(el=>el.classList.add('reinforced-node'));}}
 }
 if(route()[0]==='profile'||route()[0]==='memories')main.insertAdjacentHTML('beforeend',`<section class="panel archive-tools"><h2>档案与连续学习</h2><p>导入旧版导出的 JSON，或在新设备恢复学习记录。密钥不在档案中。</p>${v('import','导入学习档案')}${v('restore','恢复上一次导入前档案')}<p class="muted">个人策略只用于相应学习情境；不会自动改写通用教学规则。</p></section>`);
 if(route()[0]==='home')($('.garden-resume')||main).insertAdjacentHTML('beforeend',`<section class="learning-tools">${v('tasks','任务与恢复')}${v('import','导入旧版档案')}<span class="small-note">知枝 1.0 · 阅读点亮，自愿加强</span></section>`);
}
function info(title,body){modal(title,body);}
function materialDialog(){const t=currentTree();info('学习资料',`<p>提供教材片段，或检索百科导言。来源是否足够会在生成时检查。</p><form data-v1-form="search"><label class="field">检索关键词<input name="query" value="${esc(currentNode()?.title||t.title)}" maxlength="160" required></label><button class="primary">检索并保存百科摘要</button></form><details><summary>粘贴 / 导入文字材料</summary><form data-v1-form="material">${field('材料标题','title')}${field('来源位置（书名、章节或页码）','location','','text')}<label class="field">来源链接（可选 HTTPS）<input name="url" type="url"></label><label class="field">正文<textarea name="text" maxlength="24000" required></textarea></label><label class="field">从 TXT / Markdown 文件读取<input type="file" data-v1-file="material" accept=".txt,.md,text/plain"></label><button class="primary">保存材料</button></form></details><div class="material-list">${(t.materials||[]).map(m=>`<article><strong>${esc(m.title)}</strong><p class="small-note">${esc(m.location)} · ${esc(m.license)}</p><details><summary>查看正文</summary><p class="source-text">${esc(m.text)}</p></details>${m.url?`<a target="_blank" rel="noopener noreferrer" href="${esc(m.url)}">原文 ↗</a>`:''}${v('remove-material','移除',`data-id="${esc(m.id)}"`)}</article>`).join('')||'<p class="muted">尚无材料。没有依据时，生成会等待补充。</p>'}</div><form data-v1-form="options"><label><input type="checkbox" name="auto_prepare" ${t.auto_prepare?'checked':''}> 阅读时自动准备下一节</label><label><input type="checkbox" name="search_enabled" ${t.search_enabled?'checked':''}> 缺少材料时自动检索百科</label><button class="secondary">保存选项</button></form>`);}
async function call(d,redraw=true){return act(d,redraw);}
async function settle(t){const r=await call({type:'settle',tree_id:t.id});if(r)info('本次学习已整理',`<p>${esc(r.message)}</p>${(r.settlement?.proposals||[]).map(p=>`<p>下次讲解：${esc(p.change)}</p>`).join('')}<p class="muted">已阅读是经历记录，不等于掌握。无需补答问题。</p><a class="primary" href="#home" data-v1="close-home">回到学习空间</a>`);}
async function showTasks(){const r=await fetch('/api/tasks'),{tasks=[]}=await r.json();info('生成任务',`<p>离开应用会保留已经提交的内容；未完成任务可重新开始，不会自动重复计费。</p>${tasks.slice().reverse().map(j=>`<article class="task-row"><strong>${esc(({refill:'准备小节',regenerate:'重写小节',settle:'整理经历',material_search:'检索资料',strengthen:'准备加强问题',strengthen_answer:'解释回答',create_tree:'规划路线',summarize:'整理需求',chat:'回答问题'})[j.type]||'学习任务')}</strong><p>${esc(j.stage)} · ${esc(({completed:'已完成',failed:'失败，可重试',paused:'中断，可继续',running:'进行中',queued:'排队中',cancelled:'已取消'})[j.status]||j.status)}</p>${j.error?`<p class="small-note">${esc(j.error)}</p>`:''}${['running','queued'].includes(j.status)?v('cancel','停止',`data-id="${esc(j.id)}"`):['failed','paused','cancelled'].includes(j.status)?v('retry','重新开始',`data-id="${esc(j.id)}"`):''}</article>`).join('')||'<p>没有生成任务。</p>'}`);}
function strengthenDialog(){const n=currentNode(),q=n.reinforcement?.questions[0];if(!q)return;const result=n.reinforcement.attempts.at(-1);info('自愿加强 · '+n.title,`<p>这是独立练习，随时关闭继续阅读。</p><p class="practice-question">${esc(q.question)}</p><form data-v1-form="answer"><label class="field">你的想法<textarea name="answer" required maxlength="4000"></textarea></label><button class="primary">看看解释</button></form>${result?`<section class="assessment ${result.passed?'passed':''}"><strong>${result.passed?'这次检查通过了':'可以参考这个解释'}</strong><p>${esc(result.explanation)}</p><p class="small-note">${esc(result.evidence)}</p></section>`:''}`);}
document.addEventListener('click',async e=>{
 const button=e.target.closest('[data-v1]');if(!button)return;e.preventDefault();e.stopImmediatePropagation();const k=button.dataset.v1,t=currentTree(),n=currentNode();
 if(k==='close-home'){closeModal();go('home');return;}
 if(k==='cancel'){await fetch('/api/action',{method:'POST',body:JSON.stringify({type:'cancel_task',id:button.dataset.id})});toast('正在停止任务');return;}
 if(k==='tasks'){await showTasks();return;}
 if(busy){toast('当前任务进行中，可继续阅读或在任务中停止。');return;}
 if(k==='materials')materialDialog();
 else if(k==='remove-material'){if(confirm('移除材料？已生成内容会标记需要重新核验。')){await call({type:'material_remove',tree_id:t.id,id:button.dataset.id});materialDialog();}}
 else if(k==='feedback')info('调整后续讲法',`<p>例如“例子尽量联系游戏开发”“保留完整计算过程”。明确要求会马上用于后续生成。</p><form data-v1-form="feedback">${field('希望怎么调整','message','','textarea')}<button class="primary">记下并应用到后续内容</button></form>`);
 else if(k==='settle')await settle(t);
 else if(k==='strengthen'){if(!n.reinforcement||n.reinforcement.version!==n.content_version){if(!await call({type:'strengthen',tree_id:t.id,node_id:n.id}))return;}strengthenDialog();}
 else if(k==='evidence')info('内容依据与版本',`<p>内容版本 ${n.content_version||1} · ${esc(n.generated_at||'固定示例 / 历史内容')}</p>${n.source_warning?`<p>${esc(n.source_warning)}</p>`:''}<p>${n.quality?.decision==='pass'?'已通过 AI 七项内容检查；仍可能存在错误，欢迎反馈。':'固定示例或历史内容，未走新版质检链。'}</p>${(n.knowledge?.claims||[]).map(c=>`<p>${esc(c.text)}<small> 依据：${esc(c.material_ids.map(id=>t.materials.find(m=>m.id===id)?.title||'已移除').join('、'))}</small></p>`).join('')}${v('materials','查看资料正文')}`);
 else if(k==='regenerate'){if(confirm('按当前资料与偏好重新生成本节？成功后替换，上一版保留可恢复。'))await call({type:'regenerate',tree_id:t.id,node_id:n.id});}
 else if(k==='rollback'){await call({type:'rollback_content',tree_id:t.id,node_id:n.id});toast('已恢复上一版');}
 else if(k==='route')info('路线调整建议',`<p>先生成建议，确认后才修改路线。已学节点会保留。</p><form data-v1-form="route">${field('想怎样调整路线','reason','','textarea')}<button class="primary">生成建议</button></form>${t.route_proposal?routeProposal(t):''}`);
 else if(k==='accept-route'){const r=await call({type:'accept_route',tree_id:t.id,proposal_id:t.route_proposal.id});if(r){closeModal();toast(r.message);}}
 else if(k==='import')info('导入学习档案',`<p>支持旧版和 1.0 导出的 JSON。导入前会保存一份本机恢复点，不导入密钥。合并会把导入的树作为独立副本。</p><form data-v1-form="import"><label class="field">档案文件<input type="file" name="archive" accept=".json,application/json" required></label><label class="field">处理方式<select name="mode"><option value="merge">合并为独立副本</option><option value="replace">替换当前学习档案</option></select></label><button class="primary">检查并导入</button></form>`);
 else if(k==='restore'){if(confirm('恢复上一次导入前的档案？当前档案会成为新的恢复点。')){const r=await call({type:'restore_import'});if(r){closeModal();go('home');toast(r.message);}}}
 else if(k==='retry'){const {tasks}=await (await fetch('/api/tasks')).json();const job=tasks.find(x=>x.id===button.dataset.id);if(job){closeModal();await call(job.payload);}}
},true);
function routeProposal(t){return `<section class="panel"><h3>建议路线</h3><p>${esc(t.route_proposal.result.description)}</p>${t.route_proposal.result.chapters.map(c=>`<h4>${esc(c.title)}</h4><p>${esc(c.nodes.map(n=>n.title).join(' → '))}</p>`).join('')}${v('accept-route','确认应用这条路线')}</section>`;}
document.addEventListener('submit',async e=>{
 const form=e.target;if(!form.dataset.v1Form)return;e.preventDefault();e.stopImmediatePropagation();if(busy)return;const f=new FormData(form),t=currentTree(),n=currentNode();let r;
 try{
 switch(form.dataset.v1Form){
 case 'material':r=await call({type:'material_add',tree_id:t.id,title:f.get('title'),text:f.get('text'),url:f.get('url'),location:f.get('location')});if(r)materialDialog();break;
 case 'search':r=await call({type:'material_search',tree_id:t.id,query:f.get('query')});if(r){materialDialog();toast(r.message);}break;
 case 'options':r=await call({type:'learning_options',tree_id:t.id,auto_prepare:f.has('auto_prepare'),search_enabled:f.has('search_enabled')});if(r){closeModal();toast('已保存');}break;
 case 'feedback':r=await call({type:'feedback',tree_id:t.id,node_id:n?.id,message:f.get('message')});if(r){closeModal();toast(r.message);}break;
 case 'answer':r=await call({type:'strengthen_answer',tree_id:t.id,node_id:n.id,answer:f.get('answer')});if(r)strengthenDialog();break;
 case 'route':r=await call({type:'revise_route',tree_id:t.id,reason:f.get('reason')});if(r)info('确认路线调整',routeProposal(currentTree()));break;
 case 'import':{const file=f.get('archive');if(file.size>25000000)throw Error('档案超过 25 MB，请分批整理');const archive=JSON.parse(await file.text());if(f.get('mode')==='replace'&&!confirm('确认替换当前档案？导入前会保留恢复点。'))return;r=await call({type:'import_archive',archive,mode:f.get('mode')});if(r){closeModal();go('home');toast(r.message);}break;}
 }
 }catch(error){toast(error.message);}
},true);
document.addEventListener('change',async e=>{if(e.target.dataset.v1File==='material'){const file=e.target.files[0];if(file){if(file.size>100000){toast('文字文件太大，请选取所需章节');return;}const form=e.target.closest('form');form.elements.text.value=(await file.text()).slice(0,24000);if(!form.elements.title.value)form.elements.title.value=file.name;}}});
async function backgroundAction(payload){if(background||busy)return;background=true;try{const response=await fetch('/api/action',{method:'POST',body:JSON.stringify({...payload,background:true})});const result=await response.json();if(response.ok&&result.state&&result.state.revision>=(state?.revision||0)){state=result.state;config=result.settings;render();}}finally{background=false;}}
function scheduleNext(){const t=currentTree(),n=currentNode();if(!t||!n?.ready||t.demo||!t.auto_prepare||!config?.enabled)return;const next=t.nodes.slice(t.nodes.indexOf(n)+1).find(x=>x.status!=='skipped');if(!next||(next.ready&&!next.needs_refresh))return;const key=[t.id,next.id,t.contract_version,t.material_version,t.strategy_version].join('/');if(attempted.has(key))return;setTimeout(()=>{if(busy||background||currentTree()?.id!==t.id)return;attempted.add(key);void backgroundAction({type:'refill',tree_id:t.id,node_id:next.id});},700);}
window.addEventListener('hashchange',()=>{const t=currentTree();if(!t&&lastTree){const old=state.trees.find(x=>x.id===lastTree);if(old&&state.events?.some(e=>e.tree_id===old.id&&e.seq>old.settled_through&&!e.redacted))void backgroundAction({type:'settle',tree_id:old.id});}lastTree=t?.id||'';});
const strip=document.createElement('aside');strip.id='generation-status';strip.hidden=true;strip.setAttribute('aria-live','polite');document.body.append(strip);
setInterval(async()=>{try{const {tasks}=await (await fetch('/api/tasks')).json();const current=tasks.find(j=>j.status==='running');strip.innerHTML=current?`<span>${esc(current.stage)}… 已保存内容可以继续阅读</span>${v('cancel','停止',`data-id="${esc(current.id)}"`)}`:'';strip.hidden=!current;}catch{}},1200);
})();
