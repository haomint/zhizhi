// Exercise UI handlers with a local in-memory DOM/fetch fixture; no browser or network.
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'..','outputs','learning-grove','static','app.js'),'utf8');
const handlers={},elements=new Map(),requests=[];
const node=()=>({textContent:'',innerHTML:'',value:'',className:'',classList:{add(){},remove(){},toggle(){}},dataset:{},
  showModal(){},close(){},addEventListener(){},focus(){},disabled:false});
const element=selector=>{if(!elements.has(selector))elements.set(selector,node());return elements.get(selector);};
const fixtureState={trees:[],memories:[],draft:{messages:[],summary:null},revision:0};
const fixtureConfig={provider:'deepseek',base_url:'https://api.deepseek.com',model:'deepseek-flash',enabled:false,
  remember:false,can_remember:true,has_key:false,test_status:'untested',notice:''};
let responseError=false;
const context=vm.createContext({console,location:{hash:'#home'},window:{addEventListener(){},scrollTo(){}},
  document:{body:node(),querySelector:element,querySelectorAll:()=>[],addEventListener:(type,fn)=>handlers[type]=fn},
  setTimeout:()=>1,clearTimeout(){},AbortSignal:{timeout(){return undefined;}},
  FormData:class{constructor(form){this.fields=form.fields;}get(name){return this.fields[name]??null;}has(name){return Boolean(this.fields[name]);}},
  fetch:async(url,options)=>{
    if(!options)return{ok:true,json:async()=>({state:fixtureState,settings:fixtureConfig})};
    const body=JSON.parse(options.body);requests.push(body);
    const settings={...fixtureConfig,enabled:true,has_key:true,remember:true,test_status:responseError?'failed':'passed'};
    return{ok:!responseError,json:async()=>responseError?{error:'HTTP 402：余额不足',settings,settings_saved:true}:
      {state:fixtureState,settings,message:'连接成功'}};
  }});
vm.runInContext(source,context);
async function tick(){await new Promise(resolve=>setImmediate(resolve));}
async function run(){
  await tick();
  vm.runInContext('settingsModal()',context);
  assert.match(element('#modal-content').innerHTML,/保存并测试连接/);
  assert.match(element('#modal-content').innerHTML,/https:\/\/api.deepseek.com/);
  assert.match(element('#modal-content').innerHTML,/deepseek-flash/);
  const form={id:'settings-form',fields:{provider:'deepseek',base_url:'https://api.deepseek.com/v1/chat/completions',
    model:'deepseek-flash',key:'local-fixture-only',remember:true},elements:{key:{value:'local-fixture-only'}}};
  await handlers.submit({preventDefault(){},target:form,submitter:{value:'test'}});
  assert.equal(requests[0].type,'configure_test');
  assert.equal(requests[0].base_url,form.fields.base_url,'Uses current form address, not previously applied config');
  assert.equal(requests[0].key,'local-fixture-only','Uses current form key');
  assert.equal(requests[0].enabled,true,'No easily missed enable checkbox');
  assert.equal(requests[0].remember,true);
  assert.equal(form.elements.key.value,'','Successful test clears the visible password field');
  assert.equal(element('#connection-result').className,'connection-result success');
  assert.match(element('#mode-badge').textContent,/已连接/);
  responseError=true;
  await handlers.submit({preventDefault(){},target:form,submitter:{value:'test'}});
  assert.match(element('#connection-result').textContent,/设置已保存/);
  assert.match(element('#connection-result').textContent,/余额不足/);
  assert.equal(element('#connection-result').className,'connection-result error');
  assert.match(element('#mode-badge').textContent,/连接未通过/);
  const textarea={value:'我想学高数',matches:selector=>selector==='#draft-form textarea'};
  handlers.input({target:textarea});
  assert.equal(element('[data-action="summarize"]').disabled,false,'Typing enables direct requirement summary');
  console.log('PASS: default settings, current-form save/test, secure key handling, visible errors, and direct summary handlers. No network used.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
