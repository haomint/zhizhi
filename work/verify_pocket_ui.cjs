const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../outputs/learning-grove/static/app.js'),'utf8');
const elements=new Map(),handlers={},positions=[];
function element(selector){if(!elements.has(selector))elements.set(selector,{innerHTML:'',textContent:'',value:'',dataset:{},open:false,disabled:false,classList:{add(){},remove(){},toggle(){}},addEventListener(){},setAttribute(k,v){this[k]=v;},remove(){},insertAdjacentHTML(){},scrollIntoView(){},querySelector(s){return element(s);},focus(){},showModal(){},close(){}});return elements.get(selector);}
const fixture={trees:[{id:'tree',title:'测试学习',goal:'理解概念',preferences:{},nodes:[{id:'node',chapter:'第一章',title:'函数',status:'learning',cards:[{id:'a',kind:'概念',title:'输入与输出',text:'卡片一正文'},{id:'b',kind:'例子',title:'打车',text:'卡片二正文'}],page:0,links:[],messages:[{role:'user',content:'FIRST-ONLY',card_id:'a'},{role:'assistant',content:'FIRST-ANSWER',card_id:'a'},{role:'user',content:'SECOND-ONLY',card_id:'b'},{role:'assistant',content:'SECOND-ANSWER',card_id:'b'}]}]}],memories:[],draft:{messages:[],summary:null}};
const config={provider:'deepseek',enabled:false};let fail=false;
const ctx=vm.createContext({console,location:{hash:'#tree/tree/node'},window:{scrollY:0,addEventListener(){},scrollTo(...p){positions.push(p);}},sessionStorage:{setItem(){},getItem(){return null;}},requestAnimationFrame:fn=>fn(),matchMedia:()=>({matches:true}),
document:{body:element('body'),querySelector:element,querySelectorAll:()=>[],addEventListener:(type,fn,capture)=>{if(!capture)handlers[type]=fn;}},
setTimeout:()=>1,clearTimeout(){},AbortSignal:{timeout(){}},FormData:class{constructor(form){this.form=form;}get(k){return this.form.fields[k];}},
fetch:async(url,options)=>{if(!options)return{ok:true,json:async()=>({state:fixture,settings:config})};const action=JSON.parse(options.body);if(action.type==='set_page')fixture.trees[0].nodes[0].page=action.page;if(action.type==='chat'&&!fail)fixture.trees[0].nodes[0].messages.push({role:'assistant',content:'NEW-ANSWER',card_id:action.card_id});return{ok:!fail,json:async()=>fail?{error:'模拟服务暂不可用',settings:config}:{state:fixture,settings:config}};}});
vm.runInContext(source,ctx);
async function click(action,data={}){return handlers.click({target:{closest:()=>({dataset:{action,...data},disabled:false})}});}
async function run(){await new Promise(r=>setImmediate(r));let html=element('#main').innerHTML;
assert.match(html,/FIRST-ANSWER/);assert.doesNotMatch(html,/SECOND-ANSWER/);assert.doesNotMatch(html,/card-tabs|learning-subnav|reader-completion/);assert.match(html,/pocket-menu-sheet/);assert.match(html,/href="#map\/tree\/node"/);
assert.doesNotMatch(html,/<details id="reader-question" class="reader-question" open/);
handlers.input({target:{value:'草稿一',matches:s=>s==='#chat-form textarea'}});
await click('page',{page:'1'});html=element('#main').innerHTML;assert.match(html,/SECOND-ANSWER/);assert.doesNotMatch(html,/FIRST-ANSWER/);assert.doesNotMatch(html,/草稿一/);assert.match(html,/收好这段学习/);assert.doesNotMatch(html,/完成这一节/);
await click('page',{page:'0'});assert.match(element('#main').innerHTML,/草稿一/);
await click('toggle-question');assert.equal(element('#reader-question').open,true);
const form={id:'chat-form',fields:{message:'当前页提问'},querySelector:()=>element('submit')};
fail=true;await handlers.submit({preventDefault(){},target:form});assert.equal(vm.runInContext('chatDrafts.get(contextKey())',ctx),'当前页提问');
fail=false;await handlers.submit({preventDefault(){},target:form});assert.equal(vm.runInContext('chatDrafts.has(contextKey())',ctx),false);assert.match(element('#main').innerHTML,/NEW-ANSWER/);
console.log('PASS: card-scoped history, isolated drafts, collapsed questions, minimal reader, hidden tree menu, final-card continuation, retry retention, successful send.');}
run().catch(e=>{console.error(e);process.exitCode=1;});
