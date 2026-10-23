const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
(async()=>{
const domain=await import('../src/domain.mjs'),learning=await import('../src/learning.mjs');
const root=require('path').resolve(__dirname,'..');let saved,failWrite=false,key=true,gate,started,failModel=false;
const db={transaction(){const tx={};tx.objectStore=()=>({get(){const r={};setImmediate(()=>{r.result=saved;r.onsuccess();});return r;},put(doc){setImmediate(()=>{if(failWrite)tx.onerror();else{saved=structuredClone(doc);tx.oncomplete();}});}});return tx;},close(){}};
const indexedDB={open(){const r={result:db};setImmediate(()=>r.onsuccess());return r;}};
const native={status:async()=>({configured:key}),configure:async()=>{key=true;},clearKey:async()=>{key=false;},generate:async()=>({content:'OK'})};
const ctx={window:null,Capacitor:{isNativePlatform:()=>true,registerPlugin:()=>native},indexedDB,crypto,structuredClone,Response,console,setTimeout,clearTimeout,AbortController};ctx.window=ctx;
ctx.fetch=async p=>p==='demo.json'?Response.json(JSON.parse(fs.readFileSync(root+'/static/demo.json'))):new Response('teaching rules');
ctx.ZhizhiPi={...domain,...learning,runStage:async x=>{
 if(started)started();if(gate)await gate;if(failModel)throw Error('断网');
 const c=x.context;let result;
 switch(x.stage){
 case 'intake':result={title:'函数',goal:'理解',questions:[],preferences:{}};break;
 case 'roadmap':result={description:'从基础起步',chapters:[{title:'基础',nodes:[{title:'函数',description:'理解函数'},{title:'线性函数',description:'理解线性'}]}]};break;
 case 'knowledge':result={decision:'ready',claims:[{id:'claim',text:'函数定义',status:'supported',material_ids:[c.materials[0].id]}],gaps:[]};break;
 case 'page-plan':result={node_id:c.node_id,pages:[{kind:'定义诠释',purpose:'定义',claim_ids:['claim']},{kind:'例子',purpose:'例子',claim_ids:['claim']}],uncovered_claim_ids:[]};break;
 case 'cards':result={cards:[{node_id:c.nodes[0].id,kind:'定义诠释',title:'函数',text:'每个输入对应唯一输出'},{node_id:c.nodes[0].id,kind:'例子',title:'例子',text:'f(3)=2×3=6'}]};break;
 case 'quality':result={decision:'pass',checks:Object.fromEntries(['goal','prerequisites','definitions','examples','sequence','sources','burden'].map(k=>[k,true])),issues:[]};break;
 case 'tutor':result={answer:'结合当前卡片回答',memories:[]};break;
 case 'settlement':result={event_range:c.event_range,observations:[],strategy_proposals:[]};break;
 default:throw Error('unhandled '+x.stage);
 }return {result};
}};
vm.runInNewContext(fs.readFileSync(root+'/static/mobile-service.js','utf8'),ctx);
async function act(d,ok=true){const r=await ctx.fetch('/api/action',{body:JSON.stringify(d)});const v=await r.json();assert.equal(r.ok,ok,v.error);return v;}
await act({type:'draft_message',message:'学函数'});await act({type:'summarize'});let r=await act({type:'create_tree',title:'函数',goal:'理解'});const tid=r.tree_id,nid=r.state.trees[0].nodes[0].id;
await act({type:'material_add',tree_id:tid,title:'教材片段',text:'函数中每个输入有唯一输出。f(x)=2x，f(3)=6。',location:'自编测试材料'});
r=await act({type:'refill',tree_id:tid,node_id:nid});assert.equal(r.state.trees[0].nodes[0].quality.decision,'pass');const cid=r.state.trees[0].nodes[0].cards[0].id;
await act({type:'set_page',tree_id:tid,node_id:nid,page:1});await act({type:'advance',tree_id:tid,node_id:nid});
assert.equal(saved.state.trees[0].nodes[0].status,'read');await act({type:'settle',tree_id:tid});const count=saved.state.memories.length;await act({type:'settle',tree_id:tid});assert.equal(saved.state.memories.length,count);
let release;gate=new Promise(r=>release=r);let began=new Promise(r=>started=r);const slow=act({type:'chat',tree_id:tid,node_id:nid,card_id:cid,message:'稍等'});await began;await act({type:'set_page',tree_id:tid,node_id:nid,page:0});release();await slow;assert.equal(saved.state.trees[0].nodes[0].page,0);gate=null;started=null;
gate=new Promise(r=>release=r);began=new Promise(r=>started=r);const stale=act({type:'chat',tree_id:tid,node_id:nid,card_id:cid,message:'旧目标'},false);await began;await act({type:'preferences',tree_id:tid,goal:'新目标',preferences:{}});release();await stale;gate=null;started=null;assert(!saved.state.trees[0].nodes[0].messages.some(m=>m.content==='旧目标'));
gate=new Promise(r=>release=r);began=new Promise(r=>started=r);const cancelled=act({type:'chat',tree_id:tid,node_id:nid,card_id:cid,message:'取消这一条'},false);await began;await act({type:'cancel_task'});release();await cancelled;gate=null;started=null;assert.equal(saved.state.tasks.at(-1).status,'cancelled');assert(!saved.state.trees[0].nodes[0].messages.some(m=>m.content==='取消这一条'));
gate=new Promise(r=>release=r);began=new Promise(r=>started=r);const firstQueued=act({type:'chat',tree_id:tid,node_id:nid,card_id:cid,message:'前台第一条'});await began;
const secondQueued=act({type:'chat',tree_id:tid,node_id:nid,card_id:cid,message:'取消排队'},false);
for(let i=0;i<10&&!saved.state.tasks.some(t=>t.status==='queued');i++)await new Promise(setImmediate);
const queued=saved.state.tasks.find(t=>t.status==='queued');assert(queued);await act({type:'cancel_task',id:queued.id});release();await firstQueued;await secondQueued;gate=null;started=null;assert(!saved.state.trees[0].nodes[0].messages.some(m=>m.content==='取消排队'));
const before=JSON.stringify(saved.state.trees);failModel=true;await act({type:'chat',tree_id:tid,node_id:nid,card_id:cid,message:'断网'},false);failModel=false;assert.equal(JSON.stringify(saved.state.trees),before);assert.equal(saved.state.tasks.at(-1).status,'failed');
failWrite=true;await act({type:'draft_message',message:'失败写入'},false);failWrite=false;assert.equal(JSON.stringify(saved.state.trees),before);
const exported=await(await ctx.fetch('/api/export')).json();assert.equal(exported.format,'zhizhi-personal-2');assert(!JSON.stringify(exported).includes('has_key'));
await act({type:'import_archive',archive:{format:'bad',state:{}},mode:'replace'},false);assert.equal(JSON.stringify(saved.state.trees),before);
await act({type:'import_archive',archive:exported,mode:'merge'});assert.equal(saved.state.trees.length,2);await act({type:'restore_import'});assert.equal(saved.state.trees.length,1);
saved.state.tasks.push({id:'interrupted',status:'running',payload:{type:'refill',tree_id:tid},type:'refill'});
vm.runInNewContext(fs.readFileSync(root+'/static/mobile-service.js','utf8'),ctx);await ctx.fetch('/api/state');assert.equal(saved.state.tasks.at(-1).status,'paused');
console.log('PASS: full pipeline, short writes, stale protection, settlement dedup, failed task persistence, archive import and rollback');
})().catch(e=>{console.error(e);process.exitCode=1;});
