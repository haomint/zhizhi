const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const root=require('path').resolve(__dirname,'../outputs/learning-grove');
let saved,failWrite=false,key=true,answer,contexts=[];
const db={transaction(){const tx={};tx.objectStore=()=>({get(){const r={};setImmediate(()=>{r.result=saved;r.onsuccess();});return r;},put(doc){setImmediate(()=>{if(failWrite)tx.onerror();else{saved=structuredClone(doc);tx.oncomplete();}});}});return tx;}};
db.close=()=>{};
const indexedDB={open(){const r={result:db};setImmediate(()=>r.onsuccess());return r;}};
const native={status:async()=>({configured:key}),configure:async()=>{key=true;},clearKey:async()=>{key=false;},generate:async x=>{contexts.push(x);if(answer instanceof Error)throw answer;return {content:JSON.stringify(answer)};}};
const context={window:null,Capacitor:{isNativePlatform:()=>true,registerPlugin:()=>native},indexedDB,crypto,structuredClone,Response,console};context.window=context;
context.fetch=async p=>p==='demo.json'?Response.json(JSON.parse(fs.readFileSync(root+'/static/demo.json'))):new Response('teaching JSON');
vm.runInNewContext(fs.readFileSync(root+'/static/mobile-service.js','utf8'),context);
async function act(d,ok=true){const r=await context.fetch('/api/action',{body:JSON.stringify(d)});const v=await r.json();assert.equal(r.ok,ok,v.error);return v;}
(async()=>{
 await act({type:'draft_message',message:'我想学数学'});
 answer={title:'数学',goal:'理解概念',questions:[],preferences:{}};await act({type:'summarize'});
 answer={description:'路线',chapters:[{title:'基础',nodes:[{title:'函数'},{title:'极限'},{title:'导数'}]}]};let r=await act({type:'create_tree',title:'数学',goal:'理解概念'});const tid=r.tree_id;let t=r.state.trees[0];const nid=t.nodes[0].id;
 answer={cards:t.nodes.flatMap(n=>[{node_id:n.id,title:n.title,text:'概念',kind:'核心'},{node_id:n.id,title:'例子',text:'案例',kind:'案例'}])};r=await act({type:'refill',tree_id:tid,node_id:nid});const first=r.state.trees[0].nodes[0].cards[0].id,second=r.state.trees[0].nodes[0].cards[1].id;
 answer={answer:'第一张解释',memories:[]};await act({type:'chat',tree_id:tid,node_id:nid,card_id:first,message:'关于函数的问题'});
 answer={answer:'结合前文',memories:[]};r=await act({type:'chat',tree_id:tid,node_id:nid,card_id:second,message:'第一张刚才的问题呢'});
 assert.equal(JSON.parse(contexts.at(-1).topic).related_learning_records[0].card_title,'函数');
 assert.equal(r.state.trees[0].nodes[0].messages[2].card_id,second);
 await act({type:'set_page',tree_id:tid,node_id:nid,page:1});r=await act({type:'advance',tree_id:tid,node_id:nid});assert.equal(r.state.trees[0].nodes[0].status,'read');
 const before=JSON.stringify(saved);answer=new Error('模拟断网');await act({type:'chat',tree_id:tid,node_id:nid,card_id:first,message:'失败请求'},false);assert.equal(JSON.stringify(saved),before);
 failWrite=true;await act({type:'draft_message',message:'保存失败'},false);assert.equal(JSON.stringify(saved),before);failWrite=false;
 const exported=await (await context.fetch('/api/export')).json();assert.equal(exported.state.trees.length,1);assert(!JSON.stringify(exported).includes('has_key'));
 console.log('PASS: roadmap/cards, card scopes, related history, read status, network/write rollback, secret-free export');
})().catch(e=>{console.error(e);process.exitCode=1;});
