// Actual browser and UI; model responses are intercepted. No real API key is used.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/usr/local/lib/node_modules/playwright');
const BASE=process.argv[2]||'http://localhost:4183/index.html';
const folder=path.join(__dirname,'../检查截图');
const report={checks:[],pageErrors:[],at:new Date().toISOString()};
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/local/bin/chromium',args:['--no-sandbox']});
 try {
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});page.setDefaultTimeout(12000);
  page.on('pageerror',e=>report.pageErrors.push(e.message));
  let control={},requests=[];
  const extras=['purpose','scope','constraints','examples','style','pace'];
  const plan={description:'按需求从函数开始学习',chapters:[{title:'函数',nodes:[{title:'输入与输出',why:'理解函数的对应关系',minutes:4}]}]};
  const card={title:'函数',lead:'输入确定，**输出唯一**。',body:['函数将允许的输入对应到输出。\n先说明输入范围。'],example:'设 f(x)=x²。\n输入2，得到4。',takeaway:'==一个输入只能对应一个输出==。',pointIds:['p1']};
  await page.route('https://model.test/**',async route=>{
   const req=route.request().postDataJSON();const stage=req.messages[0].content.match(/\[stage:(\w+)\]/)?.[1];
   const input=JSON.parse(req.messages.at(-1).content);requests.push({stage,input});let out;
   if(stage==='intake_questions') {
    if(control.failExtraOnce){control.failExtraOnce=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'模拟断网'}})});}
    const field=control.long?extras.find(k=>!input.answeredFields.includes(k)):control.oneExtra&&!input.answeredFields.includes('examples')?'examples':null;
    out={question:field?{field,importance:'high',reason:'用户的明确需求会影响后续安排',text:field==='examples'?'更想看哪类例子？':'这次更需要哪种安排？',options:['生活例子','课程例子','工作例子']}:null};
   } else if(stage==='plan') {
    if(control.holdPlan)await new Promise(r=>control.releasePlan=r);
    out=plan;
   } else if(stage==='blueprint') out={brief:'理解函数的含义',points:[{id:'p1',text:'输入与输出'}],pages:[{title:'函数',objective:'解释唯一输出',pointIds:['p1']}],blockers:[]};
   else if(stage==='cards') out={cards:input.requestedPages.map(p=>({pageIndex:p.pageIndex,card}))};
   else if(stage==='review') out={decision:'pass',checks:{goal:true,prerequisites:true,definitions:true,examples:true,sequence:true,sources:true,burden:true},issues:[]};
   else throw Error('Unexpected stage '+stage);
   try{await route.fulfill({contentType:'application/json',body:JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(out)}}]})});}catch(e){if(!/closed|disposed|Invalid InterceptionId/i.test(e.message))throw e;}
  });
  const ok=name=>report.checks.push(name);
  const store=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('zhizhi.v3')));
  const seed=async(data={},demo=false)=>{await page.goto(BASE);await page.evaluate(({data,demo})=>localStorage.setItem('zhizhi.v3',JSON.stringify({goals:[],key:demo?'':'test-only',base:'https://model.test',model:'test',...data})),{data,demo});await page.reload();};
  const open=()=>page.click('[data-action="new-goal"]');
  const begin=async(topic='投资学')=>{await open();await page.fill('[data-flow-initial="topic"]',topic);await page.click('[data-flow-action="begin"]');};
  const pick=async n=>{await page.click('[data-flow-pick="'+n+'"]');};
  const ready=()=>page.waitForSelector('[data-flow-action="finish"]');
  fs.mkdirSync(folder,{recursive:true});
  // Form: only the topic is mandatory; no model round trip before two questions.
  await seed();await open();assert.equal(await page.locator('[data-flow-initial]').count(),1);
  assert.equal(await page.isEnabled('[data-flow-action="begin"]'),false);
  assert.equal(await page.textContent('.flow-topic-field > span'),'要学什么');
  await page.waitForTimeout(350);
  const layout=await page.locator('.flow-topic-field').boundingBox();
  const area=await page.locator('#intake-body').boundingBox();
  assert(Math.abs(layout.x+layout.width/2-(area.x+area.width/2))<2);
  assert(Math.abs(layout.y+layout.height/2-(area.y+area.height/2))<35);
  await page.fill('[data-flow-initial="topic"]','投资学');assert.equal(await page.isEnabled('[data-flow-action="begin"]'),true);
  await page.waitForTimeout(350);await page.screenshot({path:path.join(folder,'reading-only-intake-initial.png')});
  await page.click('[data-flow-action="begin"]');
  assert.equal(await page.textContent('.flow-title'),'你的基础如何？');
  assert.equal(await page.locator('[data-flow-pick]').count(),4);
  assert.equal((await page.textContent('[data-flow-pick="3"]')).includes('不确定，先跳过'),true);
  assert.equal(await page.locator('#intake-flow textarea').count(),0);
  assert.equal(await page.locator('[data-flow-pick="4"]').count(),0);
  assert.equal(await page.locator('#intake-flow-footer .btn-primary').count(),0);
  await page.waitForTimeout(350);await page.screenshot({path:path.join(folder,'reading-only-intake-question.png')});
  await pick(1);assert.equal(await page.textContent('.flow-title'),'你想学到什么程度？');assert.equal(requests.length,0);
  ok('single centered topic field, topic alone enables completion, four choices and instant required-question navigation');
  // A selected response survives reload without restoring a free-text control.
  await page.reload();await open();assert.equal(await page.textContent('.flow-title'),'你想学到什么程度？');
  assert.equal(await page.locator('#intake-flow textarea').count(),0);
  await pick(1);await ready();assert.equal((await store()).intake.answers.outcome.origin,'choice');
  assert.equal(requests.filter(r=>r.stage==='intake_questions').length,1);
  ok('question and selected answers survive refresh; every follow-up uses choices only');
  // The brief appears immediately while planning is deliberately blocked.
  control.holdPlan=true;await page.click('[data-flow-action="finish"]');
  await page.waitForSelector('#intake-brief:not([hidden])');
  assert.match(await page.textContent('#intake-brief'),/学过基础/);assert.match(await page.textContent('#intake-brief'),/学会应用/);
  assert.equal((await store()).goals[0].plan,null);assert.equal((await store()).goals[0].intakeResponses.length,2);
  assert.equal((await store()).goals.length,1);
  await page.waitForTimeout(350);await page.screenshot({path:path.join(folder,'reading-only-intake-summary.png')});
  await page.waitForFunction(()=>document.querySelector('#plan-status').hidden===false);
  const deadline=Date.now()+12000;while(!control.releasePlan){if(Date.now()>deadline)throw Error('Plan gate missing');await new Promise(r=>setTimeout(r,10));}
  control.holdPlan=false;control.releasePlan();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('zhizhi.v3')).goals[0]?.nodes.ch1n1?.status==='ready');
  const planReq=requests.find(r=>r.stage==='plan').input;
  assert.equal(planReq.context.agreement.information.background.value,'学过基础');assert.equal(planReq.context.agreement.information.outcome.value,'学会应用');
  ok('final Complete saves one goal, shows a compact brief immediately and starts planning with actual answers');
  // Editing retains the original goal; required questions still appear with the old initial hints.
  const oldId=(await store()).goals[0].id;await page.click('[data-action="edit-agreement"]');
  assert.equal(await page.inputValue('[data-flow-initial="topic"]'),'投资学');await page.click('[data-flow-action="begin"]');
  assert.match(await page.textContent('.flow-hint'),/学过基础/);await pick(3);await pick(2);await ready();await page.click('[data-flow-action="finish"]');
  assert.equal((await store()).goals.length,2);assert.equal((await store()).goals[1].sourceGoalId,oldId);assert.equal((await store()).goals[1].agreement.revision,2);
  ok('editing creates a revised learning goal while preserving the original goal and initial details');
  // Optional preferences use the same five choices and are passed to content generation.
  control={oneExtra:true};requests=[];await seed();await begin();await pick(0);await pick(0);
  await page.waitForFunction(()=>document.querySelector('.flow-title').textContent==='更想看哪类例子？');
  assert.equal(await page.locator('[data-flow-pick]').count(),4);await pick(0);await ready();await page.click('[data-flow-action="finish"]');
  await page.waitForSelector('.chapter');assert.match(requests.find(r=>r.stage==='plan').input.context.preferences,/生活例子/);
  ok('high-impact optional question follows the same tap flow and explicit preference reaches route generation');
  // Even if the model keeps offering questions, the eighth answer ends the flow without a ninth call.
  control={long:true};requests=[];await seed();await begin();await pick(3);await pick(3);
  for(let i=0;i<6;i++){await page.waitForSelector('[data-flow-pick="3"]');await pick(3);}
  await ready();assert.equal((await store()).intake.questions.length,8);assert.equal(requests.filter(r=>r.stage==='intake_questions').length,6);
  await page.click('[data-flow-action="finish"]');await page.waitForSelector('#intake-brief:not([hidden])');
  const skipped=(await store()).goals[0];assert.equal(skipped.agreement.information.background.status,'unknown');assert.equal(skipped.agreement.information.outcome.status,'proposed');assert.equal(skipped.preferences,'');assert.match(await page.textContent('#intake-brief'),/未确定/);
  ok('eight-question hard cap, skipped fields never recur, unknowns remain unknown in the final brief');
  // Rewriting the first answer invalidates dependent follow-ups instead of reusing their assumptions.
  control={oneExtra:true};requests=[];await seed();await begin();await pick(0);await pick(0);
  await page.waitForSelector('[data-flow-pick="3"]');await page.click('[data-flow-action="back"]');await page.click('[data-flow-action="back"]');
  assert.equal(await page.textContent('.flow-title'),'你的基础如何？');assert.equal(await page.getAttribute('[data-flow-pick="0"]','aria-pressed'),'true');await pick(2);
  assert.equal((await store()).intake.answers.outcome,undefined);assert.equal((await store()).intake.questions.length,2);
  ok('going back and revising an earlier answer clears dependent answers and extra questions');
  // Optional model failure cannot trap a user who has answered the two required questions.
  control={failExtraOnce:true};requests=[];await seed();await begin();await pick(1);await pick(1);await ready();
  assert.match(await page.textContent('.flow-error'),/已有回答已保存/);await page.click('[data-flow-action="retry"]');await ready();
  assert.equal(Object.keys((await store()).intake.answers).length,2);await page.click('[data-flow-action="finish"]');
  assert.equal((await store()).goals[0].intakeResponses.length,2);
  ok('optional question service failure allows retry or completion without duplicating answers');
  // Old intake drafts migrate into initial fields; no archived draft is silently discarded.
  control={};await seed({intake:{mode:'collect',messages:[{role:'user',text:'高等数学'}],answer:'未提交的文字',materials:'原材料'}});await open();
  assert.equal(await page.inputValue('[data-flow-initial="topic"]'),'高等数学');
  assert.equal((await store()).intake.materials,'原材料');assert.equal((await store()).intake.legacyDraft.answer,'未提交的文字');assert.match(await page.textContent('#intake-flow details'),/未提交的文字/);
  ok('legacy intake draft migrates into the new form while retaining its provided materials');
  // Local save failures cannot advance answers or start a model request.
  await seed();requests=[];await begin();
  await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('QuotaExceededError','QuotaExceededError');};});
  await pick(0);assert.equal(await page.textContent('.flow-title'),'你的基础如何？');assert.equal(requests.length,0);assert.match(await page.textContent('.flow-error'),/未能保存/);
  ok('storage failure prevents advancing or sending an unsaved answer');
  // Both shared HTML entrypoints load the new flow and remain usable at desktop width.
  await seed();await page.goto(BASE);await open();assert.equal(await page.locator('[data-flow-initial]').count(),1);
  await page.goto(BASE);await open();assert.equal(await page.locator('[data-flow-initial]').count(),1);
  await page.setViewportSize({width:1280,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.waitForTimeout(350);await page.screenshot({path:path.join(folder,'reading-only-intake-desktop.png')});
  assert.deepEqual(report.pageErrors,[]);ok('mobile and desktop layouts and fixed standalone entrypoint load without browser errors');
  report.result='PASS';fs.writeFileSync(path.join(__dirname,'reading-only-intake-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
