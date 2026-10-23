/* Android-local service. All writes commit before UI receives success. */
(()=>{
if(!window.Capacitor?.isNativePlatform())return;
const native=Capacitor.registerPlugin('Personal'),originalFetch=window.fetch.bind(window);
const uid=()=>crypto.randomUUID().replaceAll('-','').slice(0,12),now=()=>new Date().toISOString();
const clean=(v,n=4000)=>String(v??'').trim().slice(0,n);
const required=(v,n=4000)=>{v=clean(v,n);if(!v)throw Error('必要内容为空，请补充后重试。');return v;};
let db,stored,queue=Promise.resolve();
const ready=new Promise((resolve,reject)=>{const r=indexedDB.open('zhizhi-app',1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onerror=()=>reject(Error('无法打开本地资料库。'));r.onsuccess=()=>{db=r.result;const q=db.transaction('state').objectStore('state').get('document');q.onerror=()=>reject(Error('无法读取学习资料。'));q.onsuccess=async()=>{const fresh=!q.result;stored=q.result||{state:{trees:[],memories:[],draft:{messages:[],summary:null},revision:0},settings:{provider:'deepseek',base_url:'https://api.deepseek.com',model:'deepseek-flash',enabled:true,remember:true,test_status:'untested'}};try{if(fresh)await migrateLegacy();resolve();}catch{reject(Error('旧卡片迁移失败，请重开应用重试。'));}};};});
async function migrateLegacy(){
const record=await new Promise((resolve,reject)=>{const r=indexedDB.open('zhizhi-personal',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('cards'))r.result.createObjectStore('cards');};r.onerror=()=>reject(Error());r.onsuccess=()=>{const old=r.result;const q=old.transaction('cards').objectStore('cards').get('latest');q.onsuccess=()=>{old.close();resolve(q.result);};q.onerror=()=>{old.close();reject(Error());};};});
if(!record?.content)return;
const n=node(clean(record.topic,60)||'之前的学习卡片','独立运行验证阶段保存的内容','已保存');n.cards=[{id:uid(),kind:'已保存',title:n.title,text:record.content,image:''}];n.ready=true;
stored.state.trees.push({id:uid(),title:n.title,goal:'回顾之前保存的学习内容',description:'从安卓验证版保留的卡片',preferences:{},nodes:[n],demo:false,sources:[],source_status:'历史生成内容，未联网核验',created:record.created_at||now(),updated:now()});await commit(stored);
}
function commit(doc){return new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(doc,'document');tx.oncomplete=()=>{stored=doc;resolve();};tx.onerror=tx.onabort=()=>reject(Error('本地保存失败，请保留当前内容后重试。'));});}
async function config(doc){const s=await native.status();return {...doc.settings,has_key:s.configured,can_remember:true,remember:true,enabled:doc.settings.enabled&&s.configured};}
const skills={};
async function ask(name,context,doc){
 if(!doc.settings.enabled)throw Error('请先启用模型。');
 const load=async name=>{skills[name]??=await originalFetch('skills/'+name+'.md').then(r=>{if(!r.ok)throw Error('教学规则未找到。');return r.text();});return skills[name];};
 if(!window.ZhizhiPi)throw Error('Pi 运行资源缺失，请重新构建应用。');
 const request=async(payload,{signal}={})=>{const requestId=uid();const cancel=()=>native.cancel({requestId}).catch(()=>{});if(signal?.aborted)throw Error('已取消');signal?.addEventListener('abort',cancel,{once:true});try{return await native.complete({requestId,payload});}finally{signal?.removeEventListener('abort',cancel);}};
 const {result}=await window.ZhizhiPi.runStage({stage:name,context,system:(await load('agent'))+'\n'+await load(name),model:doc.settings.model,request});
 return result;
}
function memory(s,category,content,tree='',node='',source='用户明确表达',key=''){content=clean(content,900);if(!content)return;const old=key&&s.memories.find(m=>m.key===key);const item={id:old?.id||uid(),category,content,tree_id:tree,node_id:node,source,key,updated:now()};if(old)Object.assign(old,item);else s.memories.push(item);}
function node(title,description,chapter,parent=''){return {id:uid(),title,description,chapter,parent_id:parent,status:'unseen',cards:[],ready:false,messages:[],links:[],page:0};}
async function cards(s,t,priority,doc){const missing=t.nodes.filter(n=>!n.ready&&n.status!=='skipped').sort((a,b)=>(b.id===priority)-(a.id===priority));const chosen=missing.slice(0,1);if(!chosen.length)return;const result=await ask('cards',{tree:{title:t.title,goal:t.goal,preferences:t.preferences},nodes:chosen.map(n=>({id:n.id,title:n.title,description:n.description})),memories:s.memories.slice(-20)},doc);if(!Array.isArray(result.cards))throw Error('卡片格式无效，请重试。');const groups=new Map(chosen.map(n=>[n.id,[]]));for(const c of result.cards.slice(0,8)){if(groups.has(c.node_id))groups.get(c.node_id).push({id:uid(),kind:clean(c.kind,30),title:required(c.title,70),text:required(c.text,600),image:''});}if(chosen.some(n=>!groups.get(n.id).length))throw Error('模型遗漏了知识点，请重新生成。');for(const n of chosen){n.cards=groups.get(n.id);n.ready=true;}}
function related(s,t,n,c,message){const terms=new Set((message.toLowerCase().match(/[a-z0-9]{2,}|[\u4e00-\u9fff]/g)||[]));const chinese=[...message].filter(x=>/[\u4e00-\u9fff]/.test(x)).join('');for(let i=0;i<chinese.length-1;i++)terms.add(chinese.slice(i,i+2));let target='';const m=message.match(/第([一二三四五六七八九十]|\d+)(?:个|张|页)/);if(m){const i=/\d/.test(m[1])?Number(m[1]):'一二三四五六七八九十'.indexOf(m[1])+1;target=n.cards[i-1]?.id;}else if(/上一[张页]|前一张/.test(message)){target=n.cards[n.cards.findIndex(x=>x.id===c?.id)-1]?.id;}const rows=[];for(const tree of s.trees)for(const nd of tree.nodes)nd.messages.forEach((msg,i)=>{if(msg.role!=='user')return;const pair=nd.messages.slice(i,i+2);const text=(nd.title+msg.card_title+pair.map(x=>x.content).join('')).toLowerCase();let score=[...terms].filter(x=>text.includes(x)).length;const same=nd.id===n.id&&tree.id===t.id;if(same)score+=3;if(same&&target&&msg.card_id===target)score+=100;if(score>(same?0:3))rows.push({score,at:msg.at||'',tree_title:tree.title,node_title:nd.title,card_title:msg.card_title,messages:pair.map(x=>({role:x.role,content:x.content.slice(0,1800)}))});});return rows.sort((a,b)=>b.score-a.score||b.at.localeCompare(a.at)).slice(0,8);}
async function action(doc,d){const s=doc.state,k=d.type;
if(['configure','configure_test','test_model'].includes(k)){
 if(k!=='test_model'){if(d.base_url&&d.base_url.replace(/\/$/,'')!=='https://api.deepseek.com')throw Error('安卓个人版目前仅支持 DeepSeek 官方地址。');if(d.clear_key)await native.clearKey();if(clean(d.key))await native.configure({key:d.key});Object.assign(doc.settings,{enabled:d.enabled!==false,model:clean(d.model,100)||doc.settings.model,remember:true,test_status:'untested'});await commit(doc);}
 if(k!=='configure'){try{await native.generate({model:doc.settings.model,system:'只回复OK',topic:'连接测试'});doc.settings.test_status='passed';}catch(e){doc.settings.test_status='failed';await commit(doc);e.settings_saved=true;throw e;}}return {message:k==='configure'?'设置已保存，密钥由安卓系统加密保存。':'连接成功。'};
}
if(k==='draft_message'){s.draft.messages.push({role:'user',content:required(d.message)});s.draft.summary=null;return {};}
if(k==='clear_draft'){s.draft={messages:[],summary:null};return {};}
if(k==='draft_unsummarize'){s.draft.summary=null;return {};}
if(k==='summarize'){if(!s.draft.messages.length)throw Error('先说说你想学什么吧。');const r=await ask('intake',{messages:s.draft.messages,memories:s.memories.slice(-20)},doc);s.draft.summary={title:required(r.title,80),goal:required(r.goal,900),notes:clean(r.notes,600),preferences:r.preferences||{},information:r.information||{},questions:(Array.isArray(r.questions)?r.questions:[]).slice(0,1).map(q=>({question:clean(q.question,160),options:(q.options||[]).slice(0,4).map(x=>clean(x,80))}))};return {};}
if(k==='demo'){const data=await originalFetch('demo.json').then(r=>r.json());let t=s.trees.find(t=>t.demo);if(!t){t=data;t.id=uid();t.created=t.updated=now();t.nodes.forEach(n=>{n.id=uid();n.cards.forEach(c=>c.id=uid());});s.trees.unshift(t);}return {tree_id:t.id};}
if(k==='create_tree'){const title=required(d.title,80),goal=required(d.goal,900),preferences=d.preferences||{};const r=await ask('roadmap',{title,goal,preferences,notes:clean(d.notes,3000),conversation:s.draft.messages,memories:s.memories.slice(-20),past_trees:s.trees.map(t=>({title:t.title,goal:t.goal}))},doc);const nodes=[];for(const ch of (r.chapters||[]).slice(0,6))for(const n of (ch.nodes||[]))nodes.push(node(required(n.title,60),clean(n.description,400),required(ch.title,50)));if(!nodes.length||nodes.length>24)throw Error('路线过于简略，请重试。');const t={id:uid(),title,goal,preferences,nodes,description:clean(r.description,500),created:now(),updated:now(),demo:false,sources:[],source_status:'模型组织的初步路线；尚未联网检索与核验'};s.trees.unshift(t);memory(s,'长期目标',title+'：'+goal,t.id,'','用户明确表达',t.id+':goal');s.draft={messages:[],summary:null};return {tree_id:t.id};}
if(k.startsWith('memory_')){if(k==='memory_add')memory(s,clean(d.category,30)||'个人背景',required(d.content,900));else{const m=s.memories.find(x=>x.id===d.id);if(!m)throw Error('找不到记忆。');if(k==='memory_delete')s.memories=s.memories.filter(x=>x.id!==d.id);else Object.assign(m,{content:required(d.content,900),source:'用户已修正',updated:now()});}return {};}
const t=s.trees.find(t=>t.id===d.tree_id);if(!t)throw Error('找不到学习树。');t.updated=now();
if(k==='delete_tree'){s.trees=s.trees.filter(x=>x!==t);s.memories=s.memories.filter(m=>m.tree_id!==t.id);for(const tree of s.trees)for(const n of tree.nodes)n.links=n.links.filter(l=>l.tree_id!==t.id);return {};}
if(k==='preferences'){t.goal=required(d.goal,900);t.preferences=d.preferences||{};memory(s,'长期目标',t.title+'：'+t.goal,t.id,'','用户明确表达',t.id+':goal');return {};}
if(k==='refill'){if(!t.demo)await cards(s,t,d.node_id,doc);return {};}
const n=t.nodes.find(n=>n.id===d.node_id);if(!n)throw Error('找不到知识点。');t.current_node_id=n.id;
if(k==='visit')return {};
if(k==='set_page'){n.page=Math.max(0,Math.min(Number(d.page)||0,n.cards.length-1));return {};}
if(k==='advance'){if(!n.cards.length||n.page!==n.cards.length-1)throw Error('先读到本节最后一页。');if(n.status!=='done')n.status='read';n.read_at=now();const visited=t.nodes.filter(x=>['read','done'].includes(x.status)).map(x=>x.title);memory(s,'学习经历',t.title+'：已浏览 '+visited.join('、')+'。阅读不等于经过测评掌握。',t.id,'','阅读进度汇总',t.id+':reading');const next=t.nodes[t.nodes.indexOf(n)+1];if(next)t.current_node_id=next.id;return {next_node_id:next?.id||''};}
if(k==='status'){if(!['unseen','learning','done','skipped'].includes(d.status))throw Error('未知状态。');n.status=d.status;return {};}
if(k==='chat'){const message=required(d.message),c=d.card_id?n.cards.find(c=>c.id===d.card_id):n.cards[n.page||0];if(d.card_id&&!c)throw Error('卡片不属于当前节点。');const r=t.demo?{answer:'【演示回答】'+(c?.text||n.description)+'\n创建正式学习树后，回答将根据你的问题生成。',memories:[]}:await ask('tutor',{message,tree:{title:t.title,goal:t.goal,preferences:t.preferences},node:{title:n.title,description:n.description,cards:n.cards.map(({title,text,kind})=>({title,text,kind}))},current_card:c,history:n.messages.slice(-12),related_learning_records:related(s,t,n,c,message),memories:s.memories.slice(-20)},doc);const answer=required(r.answer,5000);n.messages.push(...[{role:'user',content:message},{role:'assistant',content:answer}].map(x=>({...x,at:now(),card_id:c?.id||'',card_title:c?.title||''})));for(const m of (r.memories||[]).slice(0,2))memory(s,clean(m.category,30)||'学习偏好',m.content,t.id,n.id,m.source==='助手暂时推测'?m.source:'用户明确表达');return {};}
if(k==='branch'){if(t.nodes.length>=40)throw Error('单棵树最多40个节点。');const child=node(required(d.title,60),'从「'+n.title+'」延伸的探索。','探索支线',n.id);t.nodes.push(child);return {node_id:child.id};}
if(k==='link'){const other=s.trees.find(x=>x.id===d.other_tree_id);if(!other||other===t||!other.nodes.some(x=>x.id===d.other_node_id))throw Error('请选择另一棵树的有效节点。');if(!n.links.some(l=>l.tree_id===other.id&&l.node_id===d.other_node_id))n.links.push({tree_id:other.id,node_id:d.other_node_id});return {};}
if(k==='image'){const c=n.cards.find(x=>x.id===d.card_id);if(!c)throw Error('卡片不存在。');const image=clean(d.image,1500000);if(image&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image))throw Error('图片格式无效。');c.image=image;return {};}
throw Error('未知操作。');}
let generationQueue=Promise.resolve();
const shortWrite=fn=>{const out=queue.then(fn,fn);queue=out.catch(()=>{});return out;};
const readingActions=new Set(['visit','set_page','advance']);
const generationActions=new Set(['summarize','create_tree','refill','chat']);
function preserveReading(doc){
 for(const tree of doc.state.trees){const current=stored.state.trees.find(t=>t.id===tree.id);if(!current)continue;
 tree.current_node_id=current.current_node_id;
 for(const n of tree.nodes){const old=current.nodes.find(x=>x.id===n.id);if(old){n.page=old.page;n.status=old.status;if(old.read_at)n.read_at=old.read_at;}}}
 const latest=stored.state.memories.filter(m=>m.source==='阅读进度汇总');
 doc.state.memories=doc.state.memories.filter(m=>m.source!=='阅读进度汇总').concat(structuredClone(latest));
}
window.fetch=async function(input,options={}){
 const path=typeof input==='string'?input:input.url;if(!path.startsWith('/api/'))return originalFetch(input,options);await ready;
 if(path==='/api/state')return Response.json({state:stored.state,settings:await config(stored)});
 if(path==='/api/export')return Response.json({state:stored.state,exported_at:now(),format:'zhizhi-personal-1'});
 if(path!=='/api/action')return Response.json({error:'未知接口'},{status:404});
 try{
 const d=JSON.parse(options.body);
 const execute=async()=>{
   const doc=structuredClone(stored),base=doc.state.semantic_revision||0;
   const result=await action(doc,d);
   const publish=async()=>{
     if(generationActions.has(d.type)){
       if((stored.state.semantic_revision||0)!==base)throw Error('学习目标或资料已更新，本次旧结果未保存，请重试。');
       preserveReading(doc);
     }
     doc.state.revision=(stored.state.revision||0)+1;
     doc.state.semantic_revision=base+(readingActions.has(d.type)?0:1);
     await commit(doc);
     return Response.json({...result,state:doc.state,settings:await config(doc)});
   };
   return generationActions.has(d.type)?shortWrite(publish):publish();
 };
 if(generationActions.has(d.type)){const out=generationQueue.then(execute,execute);generationQueue=out.catch(()=>{});return await out;}
 return await shortWrite(execute);
 }catch(e){return Response.json({error:e.message,settings_saved:!!e.settings_saved,settings:await config(stored)},{status:400});}
};
})();
