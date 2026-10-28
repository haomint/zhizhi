// Real browser and real UI, fake model only. No API keys or provider quota used.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/usr/local/lib/node_modules/playwright');
const vm=require('node:vm');
const snapshot=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const moduleScope={module:{exports:{}}};vm.runInNewContext([...snapshot.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1],moduleScope);
const L=moduleScope.module.exports;
const {cards:oldCards}=require('./fixtures.json');
const BASE=process.argv[2]||'http://localhost:4183/index.html';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const until=async fn=>{const end=Date.now()+12000;while(!fn()){if(Date.now()>end)throw Error('Mock gate was not reached');await pause(10);}};
const plan={description:'按大学高数的整体范围安排，先理解函数与极限，再进入微分和积分。',chapters:[
 {title:'函数与极限',why:'理解后续微积分的语言',nodes:[{title:'函数的对应关系',why:'说清确定的输入与输出',prereq:'数与集合'},{title:'极限的趋近过程',why:'解释趋近与取值的区别',prereq:'函数'},{title:'拓展：数列探索',why:'选学拓展',required:false},{title:'函数连续的条件',why:'区分连续与可导',prereq:'极限'}]},
 {title:'导数与微分',why:'理解变化率与局部近似',nodes:[{title:'瞬时变化率',why:'解释导数的定义'},{title:'求导的基本规则',why:'完成简单求导'},{title:'导数的应用',why:'判断单调性与极值'}]},
 {title:'积分',why:'理解累积与变化的联系',nodes:[{title:'原函数',why:'理解微分的逆过程'},{title:'定积分的含义',why:'理解分割与累积'}]}
]};
const report={checks:[],requests:{},pageErrors:[],at:new Date().toISOString()};
const ok=name=>report.checks.push(name);
function makeBP(n){const count=n.id==='ch1n1'?5:n.id==='ch1n2'?2:1;return {brief:n.why+'；保留定义、条件与完整例子。',points:Array.from({length:count},(_,i)=>({id:'p'+(i+1),text:'必要要点'+(i+1),basis:'model_generated'})),pages:Array.from({length:count},(_,i)=>({title:n.title+' · 第'+(i+1)+'部分',objective:'解释要点'+(i+1),pointIds:['p'+(i+1)]})),uncertainties:['模型整理，未核对教材原文'],blockers:[]};}
const goodReview=()=>({decision:'pass',checks:{goal:true,prerequisites:true,definitions:true,examples:true,sequence:true,sources:true,burden:true},issues:[]});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/local/bin/chromium',args:['--no-sandbox']});
 try {
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  page.setDefaultTimeout(12000);
  page.on('pageerror',e=>report.pageErrors.push(e.message));
  const loaded=[];page.on('request',r=>loaded.push(r.url()));
  let control={},requests=[];
  await page.route('https://model.test/**',async route=>{
   const req=route.request().postDataJSON();
   const stage=req.messages[0].content.match(/\[stage:(\w+)\]/)?.[1]||'test';
   const input=JSON.parse(req.messages.at(-1).content);
   report.requests[stage]=(report.requests[stage]||0)+1;requests.push({stage,input});
   await pause(30);
   let out;
   if(stage==='intake') {
    if(control.failIntakeOnce){control.failIntakeOnce=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'调研服务暂时失败'}})});}
    const users=input.conversation.filter(m=>m.role==='user');
    const ready=input.trial || users.length>=3 || users[0].text.includes('目的明确');
    const info={purpose:{value:ready?'理解概念和基本计算':'',status:'proposed'},scope:{value:users[0].text,status:'explicit',evidence:users[0].text},outcome:{value:ready?'能解释极限并完成简单计算':'',status:'proposed'},background:{value:'',status:'unknown'},constraints:{value:'',status:'unknown'}};
    const question=users.length<2?{kind:'core',field:'purpose',impact:'curriculum',reason:'用途会改变整个课程的取舍',text:'这次学习主要为了什么？',options:['理解概念','配合课程','准备考试']}:{kind:'core',field:'outcome',impact:'depth',reason:'目标深度会改变后续推导和计算的比例',text:'先希望做到什么程度？',options:['解释概念并完成基本计算','读懂证明']};
    out={title:'高等数学',summary:'从整体框架出发，先理解函数与极限。',information:info,ready:!!ready,coreGaps:ready?[]:[{field:question.field,impact:question.impact,reason:question.reason}],question:ready?null:question,unknowns:['已有理解程度未确定']};
   } else if(stage==='plan') out=control.narrow?{description:'只回答一个问题',chapters:[{title:'极限',nodes:[{title:'极限与函数值',why:'区分两个概念'}]}]}:plan;
   else if(stage==='blueprint') {out=makeBP(input.node);if(control.longSecond && input.node.id==='ch1n2'){out=makeBP({...input.node,id:'ch1n1'});out.points=out.points.slice(0,4);out.pages=out.pages.slice(0,4);}}
   else if(stage==='card' && input.task) out={example:'原创示例：y=2x，给定 x=3，唯一输出 y=6。'};
   else if(stage==='cards' || stage==='card') {
    const indexes=stage==='cards'?input.requestedPages.map(p=>p.pageIndex):[input.pageIndex];
    if(control.limitBatchOnce && stage==='cards' && indexes.length>1) {control.limitBatchOnce=false;return route.fulfill({contentType:'application/json',body:JSON.stringify({choices:[{finish_reason:'length',message:{content:'{}'}}]})});}
    if(control.failRepair && stage==='card' && input.pageIndex===3) return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'修订中断'}})});
    if(control.failCard && input.node.id==='ch1n2' && indexes.includes(3)) return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'模拟断网'}})});
    if(control.holdCard && input.node.id==='ch1n2') {await new Promise(r=>control.releaseCard=()=>r(true));control.holdCard=false;}
    const makeCard=i=>({...oldCards[0],title:input.blueprint.pages[i].title,body:['函数的输入一旦确定，**输出必须唯一**。\n这并不禁止不同输入对应同一输出。\n\n==同一个输入不能对应两个输出==。','定义时应说明允许输入的范围。例如给定 y=2x，在 x=3 时得到 y=6。'.repeat(3)],source:'模型整理，未核对原文',pointIds:input.blueprint.pages[i].pointIds});
    out=stage==='cards'?{cards:indexes.map(i=>({pageIndex:i,card:makeCard(i)}))}:makeCard(input.pageIndex);
    if(stage==='card' && input.repair) out.body.push('修订完成：允许输入的范围必须说明。');
   } else if(stage==='review') {
    if(control.holdReview && input.node.id==='ch1n1') {await new Promise(r=>control.releaseReview=()=>r(true));control.holdReview=false;}
    out=goodReview();
    if(control.optionalReview) out.issues=[{severity:'optional',category:'style',cardIndexes:[1],reason:'可以更精简',repair:'可删去一句重复说明'}];
    if(control.badReviewOnce && input.node.id==='ch1n1') {control.badReviewOnce=false;out.decision='blocked';out.checks.sources=false;out.issues=[{severity:'core',category:'provenance',cardIndexes:[1],evidence:input.cards[0].source,reason:'把未核验误判为声称核验',repair:'统一来源措辞'}];}
    if(control.repairNeeded && input.node.id==='ch1n1') {
      const broken=[1,3].filter(i=>!input.cards[i].body.some(p=>p.includes('修订完成')));
      if(broken.length) {out.decision='revise';out.checks.definitions=false;out.issues=broken.map(i=>({severity:'core',category:'definitions',cardIndexes:[i+1],evidence:'定义时应说明允许输入的范围。',reason:'本页需要明确输入范围',repair:'保留正文并补明允许输入的范围'}));}
    }
    if(control.blockReview && input.node.id==='ch1n1') {out.decision='revise';out.checks.definitions=false;out.issues=[{severity:'core',category:'definitions',cardIndexes:[2],evidence:'定义时应说明允许输入的范围。',reason:'遗漏定义成立的必要条件',repair:'补齐条件后重写'}];}
    if(control.inconclusiveReview && input.node.id==='ch1n1') {out.decision='revise';out.checks.definitions=false;out.issues=[{severity:'core',category:'definitions',reason:'定义可能需要补充限定条件'}];}
    if(control.badReviewShapeOnce || control.badReviewShapeAlways) {if(control.badReviewShapeOnce) control.badReviewShapeOnce=false;out={unexpected:true};}
   } else if(stage==='qa') {await pause(100);out={answer:'函数允许不同输入得到同一输出，但不允许同一输入得到两个输出。'};}
   else throw Error('Unexpected mock stage '+stage);
   await route.fulfill({contentType:'application/json',body:JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(out)}}]})});
  });
  const store=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('zhizhi.v3')));
  const seed=async goals=>{await page.goto(BASE);await page.evaluate(goals=>localStorage.setItem('zhizhi.v3',JSON.stringify({goals,key:'test-only',base:'https://model.test',model:'test'})),goals||[]);await page.reload();};
  const waitNode=async(id,status)=>page.waitForFunction(({id,status})=>JSON.parse(localStorage.getItem('zhizhi.v3')).goals[0]?.nodes[id]?.status===status,{id,status});
  const seedGoal=()=>({id:'seed',topic:'高等数学',agreement:{revision:1,status:'accepted',title:'高等数学',information:Object.fromEntries(L.fields.map(k=>[k,{value:k,status:'proposed'}]))},plan:L.plan(plan),planStatus:'ready',nodes:{},current:'ch1n1',feedback:[],feedbackVersion:0,pipelineVersion:1,updatedAt:Date.now()});
  const openSeed=async()=>{await page.click('[data-goal="seed"]');await page.click('[data-toggle="ch1n1"]');await page.click('[data-read="ch1n1"]');};
  // Intake UI has its own suite in intake-browser.cjs; verify content with accepted requirements.
  const initial=seedGoal();initial.agreement.information.purpose.value='配合大学课程理解概念和基本计算';initial.materials='教材节选：函数的输入确定时，输出唯一确定。';initial.preferences='多用生活例子，关键条件加粗';
  control.holdReview=true;await seed([initial]);await openSeed();
  assert.equal(await page.textContent('#tree-count'),'3 章 · 9 节');
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('zhizhi.v3')).goals[0].nodes.ch1n1?.phase==='review');
  assert.equal((await store()).goals[0].nodes.ch1n1.cards.length,0);
  assert.equal(await page.locator('#reader-body article').count(),0);
  assert.match(await page.textContent('#reader-body'),/检查/);
  await page.waitForFunction(()=>true); // Gate deliberately models slow semantic review.
  await until(()=>control.releaseReview);
  control.releaseReview();
  await waitNode('ch1n1','ready');await page.waitForSelector('#reader-body article');
  assert.equal(await page.textContent('#reader-count'),'1 / 5');
  assert.equal((await store()).goals[0].nodes.ch1n1.review.coverage.length,5);
  assert.equal(await page.locator('.card-copy strong').count(),1);
  assert.equal(await page.locator('.card-copy mark').count(),1);
  assert.equal(await page.locator('.card-copy br').count(),1);
  assert.equal((await page.textContent('.card-copy')).includes('**'),false);
  assert.equal((await page.textContent('.card-copy')).includes('=='),false);
  ok('generated card emphasis and line breaks render as readable text instead of raw markers');
  assert.equal(requests.filter(r=>r.stage==='cards'&&r.input.node.id==='ch1n1').length,2);
  ok('five-page draft uses two coherent batch requests, preserving variable card counts');
  const contentContext=requests.find(r=>r.stage==='cards').input.context;
  assert.match(contentContext.agreement.information.purpose.value,/大学课程/);assert.match(contentContext.materials,/教材节选/);assert.match(contentContext.preferences,/生活例子/);
  ok('accepted requirements, materials and preferences reach actual card generation');
  ok('hierarchical outline retains 9 sections; 5-card section is published only after review');
  fs.mkdirSync(path.join(__dirname,'../检查截图'),{recursive:true});
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(()=>document.querySelector('.phone').scrollLeft),0);
  assert.equal(await page.evaluate(()=>document.querySelector('[data-screen=reader]').getBoundingClientRect().left),0);
  await page.screenshot({path:path.join(__dirname,'../检查截图/reading-only-content-reader.png')});
  // Reading is not reset when background preparation or delayed QA completes.
  await page.evaluate(()=>document.querySelector('#reader-body').scrollTop=140);
  await waitNode('ch1n2','ready');
  assert.equal(await page.evaluate(()=>document.querySelector('#reader-body').scrollTop),140);
  await page.fill('#chat-input','这和一一对应有何区别？');await page.click('.chat-send');await page.click('[data-action="next-card"]');
  await page.waitForSelector('.msg.bot:not(.pending)');assert.equal(await page.textContent('#reader-count'),'2 / 5');
  assert.match(await page.textContent('.msg.user .meta'),/第1部分/);
  const beforeExample=await page.textContent('.example');await page.click('[data-action="new-example"]');await page.waitForFunction(()=>document.querySelector('.example').textContent.includes('原创示例'));
  assert.notEqual(await page.textContent('.example'),beforeExample);
  for(let i=0;i<3;i++) await page.click('[data-action="next-card"]');
  assert.equal(await page.textContent('#reader-count'),'5 / 5');
  assert.equal(await page.textContent('[data-action="next-card"]'),'下一节 →');
  assert.equal(await page.locator('#quiz-layer,[data-quiz]').count(),0);
  assert.doesNotMatch(await page.textContent('[data-screen="reader"]'),/学习成果|学完检查|及格|检查难度/);
  await page.click('[data-action="next-card"]');
  assert.equal((await store()).goals[0].current,'ch1n2');assert.equal(await page.textContent('#reader-count'),'1 / 2');
  assert((await store()).goals[0].nodes.ch1n1.readCompletedAt);
  await page.click('[data-action="next-card"]');await page.click('[data-action="next-card"]');
  assert.equal((await store()).goals[0].current,'ch1n4');
  assert.equal(requests.filter(r=>r.stage==='quiz').length,0);
  ok('reading goes directly from 5 cards to 2 cards and the next required section, without quiz UI or requests');
  await page.click('[data-action="back-tree"]');await page.waitForTimeout(350);await page.screenshot({path:path.join(__dirname,'../检查截图/reading-only-content-tree.png')});
  const narrow=seedGoal();narrow.plan=L.plan({description:'只解释极限与函数值的区别',chapters:[{title:'极限',nodes:[{title:'极限与函数值',why:'区分两个概念'}]}]});
  await seed([narrow]);await openSeed();await waitNode('ch1n1','ready');
  assert.equal(await page.textContent('#tree-count'),'1 章 · 1 节');
  ok('a narrow accepted goal retains a one-section route');
  // A malformed review response is retried once before it can become a user-facing failure.
  control={badReviewShapeOnce:true};requests=[];await seed([seedGoal()]);await openSeed();await waitNode('ch1n1','ready');
  assert.equal(requests.filter(r=>r.stage==='review'&&r.input.node.id==='ch1n1').length,2);
  ok('malformed review response is retried once without rewriting cards');
  control={badReviewShapeAlways:true};requests=[];await seed([seedGoal()]);await openSeed();await waitNode('ch1n1','ready');
  assert.equal(await page.locator('#reader-body article').count(),1);
  assert.equal(await page.locator('#reader-body .err').count(),0);
  assert.match(await page.textContent('.review-soft-note'),/未核验内容/);
  assert.equal(requests.filter(r=>r.stage==='review'&&r.input.node.id==='ch1n1').length,2);
  const autoFallback=(await store()).goals[0].nodes.ch1n1;
  assert.equal(autoFallback.publishedWithoutReview,true);assert.equal(autoFallback.cards.length,5);assert.equal(autoFallback.draftCards.length,0);
  control.badReviewShapeAlways=false;
  ok('persistent review-output failure automatically opens complete drafts as unverified without blocking reading');
  // Rejected reviews are bounded, preserve drafts and never leak into formal reading.
  control={blockReview:true};requests=[];await seed([seedGoal()]);await openSeed();await waitNode('ch1n1','failed');
  assert.equal((await store()).goals[0].nodes.ch1n1.cards.length,0);assert.equal((await store()).goals[0].nodes.ch1n1.draftCards.length,5);
  assert.equal(requests.filter(r=>r.stage==='review').length,3);
  control.blockReview=false;await page.click('[data-prepare="ch1n1"]');await waitNode('ch1n1','ready');
  ok('semantic review failure blocks publication, two automatic repair rounds run, user retry succeeds');
  // A recheck that still points to no concrete sentence is not a content failure.
  control={inconclusiveReview:true};requests=[];await seed([seedGoal()]);await openSeed();await waitNode('ch1n1','ready');
  assert.equal(requests.filter(r=>r.stage==='review'&&r.input.node.id==='ch1n1').length,2);
  assert.equal((await store()).goals[0].nodes.ch1n1.cards.length,5);
  assert.match(await page.textContent('#reader-body'),/自动检查没有在正文中定位到具体错误/);
  ok('non-actionable review cannot trap readable content after calibration');
  // A repair interrupted on its second affected page must keep the first correction.
  control={repairNeeded:true,failRepair:true};requests=[];await seed([seedGoal()]);await openSeed();await waitNode('ch1n1','failed');
  let first=(await store()).goals[0].nodes.ch1n1;
  assert.deepEqual(first.pendingRepair.remaining,[3]);assert(first.draftCards[1].body.some(p=>p.includes('修订完成')));
  assert.equal(first.cards.length,0);
  assert.equal(await page.locator('#reader-body details[open]').count(),0);
  assert.match(await page.textContent('#reader-body > .article > .node-progress > .err'),/连接暂时中断/);
  assert.equal(await page.textContent('#reader-count'),'尚未完成');
  await page.waitForTimeout(350);await page.screenshot({path:path.join(__dirname,'../检查截图/reading-only-resumable-failure.png')});
  control.failRepair=false;await page.reload();await openSeed();await waitNode('ch1n1','ready');
  assert.equal(requests.filter(r=>r.stage==='card'&&r.input.pageIndex===1).length,1);
  assert.equal(requests.filter(r=>r.stage==='cards'&&r.input.node.id==='ch1n1').length,2);
  ok('interrupted local repair survives refresh, preserves corrected pages and resumes remaining page only');
  // A source-status false positive is reviewed again; no correct draft is rewritten.
  control={badReviewOnce:true};requests=[];await seed([seedGoal()]);await openSeed();await waitNode('ch1n1','ready');
  assert.equal(requests.filter(r=>r.stage==='review'&&r.input.node.id==='ch1n1').length,2);
  assert.equal(requests.filter(r=>r.stage==='card'&&r.input.repair).length,0);
  assert(requests.find(r=>r.stage==='review'&&r.input.calibration));
  ok('canonical source false positive triggers one evidence review and no draft rewrites');
  control={optionalReview:true};requests=[];await seed([seedGoal()]);await openSeed();await waitNode('ch1n1','ready');
  assert.equal(requests.filter(r=>r.stage==='review'&&r.input.node.id==='ch1n1').length,1);
  assert.equal(requests.filter(r=>r.stage==='card'&&r.input.repair).length,0);
  ok('optional wording suggestions allow reading without a repair loop');
  // Truncated batches shrink automatically without changing the learning scope.
  control={limitBatchOnce:true};requests=[];await seed([seedGoal()]);await openSeed();await waitNode('ch1n1','ready');
  assert.equal((await store()).goals[0].nodes.ch1n1.cards.length,5);
  assert.equal((await store()).goals[0].plan.nodes.length,9);
  assert.equal((await store()).goals[0].nodes.ch1n1.batchSize,2);
  ok('provider output truncation reduces batch size automatically and retains full scope');
  // Stale prefetch must not overwrite the user's newer feedback.
  control={holdCard:true};requests=[];
  await seed([seedGoal()]);await openSeed();await waitNode('ch1n1','ready');
  await until(()=>control.releaseCard);
  const firstTitle=await page.textContent('#reader-body article h1');
  await page.click('#feedback-panel summary');await page.fill('#feedback-input','讲得太浅，后续补充条件与完整推导');await page.click('#feedback-form button');
  const release=control.releaseCard;control.holdCard=false;release();
  await waitNode('ch1n2','ready');
  const afterFeedback=await store();assert.equal(afterFeedback.goals[0].nodes.ch1n2.feedbackVersion,1);
  assert.equal(await page.textContent('#reader-body article h1'),firstTitle);
  assert(requests.filter(r=>r.stage==='blueprint'&&r.input.node.id==='ch1n2').at(-1).input.context.feedback[0].text.includes('完整推导'));
  ok('explicit feedback regenerates unread content, stale task is rejected, current published text stays stable');
  // Card request interruption is resumable, with no partial publication.
  control={failCard:true,longSecond:true};requests=[];await seed([seedGoal()]);await openSeed();await waitNode('ch1n1','ready');await waitNode('ch1n2','failed');
  assert.equal((await store()).goals[0].nodes.ch1n2.draftCards.length,3);assert.equal((await store()).goals[0].nodes.ch1n2.cards.length,0);
  control.failCard=false;await page.reload();await page.click('[data-goal="seed"]');await page.click('[data-toggle="ch1n2"]');await page.click('[data-read="ch1n2"]');await waitNode('ch1n2','ready');
  const n2cards=requests.filter(r=>r.stage==='cards'&&r.input.node?.id==='ch1n2');assert.equal(n2cards.filter(r=>r.input.requestedPages.some(p=>p.pageIndex===0)).length,1);
  ok('network failure keeps drafts; refresh retry resumes without regenerating saved cards');
  // A storage failure is visible and cannot start an unsaved generation task.
  control={};await seed([seedGoal()]);
  await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('QuotaExceededError','QuotaExceededError');};});
  await openSeed();await page.waitForSelector('#storage-warning:not([hidden])');
  assert.match(await page.textContent('#reader-body'),/存储失败/);
  ok('storage failure is visible and blocks unsaved content generation');
  // A previously saved complete draft recovers automatically when the content-review response is unusable,
  // without pretending the content passed review.
  const draftBP=L.blueprint(makeBP({id:'ch1n1',title:'函数的对应关系',why:'说清确定的输入与输出'}));
  const draftCards=draftBP.pages.map(p=>({...oldCards[0],title:p.title,pointIds:p.pointIds,source:'模型整理，未核对原文'}));
  const failedDraftGoal={...seedGoal(),nodes:{ch1n1:{cards:[],blueprint:draftBP,draftCards,status:'failed',phase:'review',page:0,error:'检查结果缺少逐项判断，格式不完整',startedAt:Date.now(),chat:[]}}};
  await seed([failedDraftGoal]);await page.click('[data-goal="seed"]');await page.click('[data-toggle="ch1n1"]');
  assert.match(await page.textContent('[data-node="ch1n1"]'),/未核验/);
  assert.doesNotMatch(await page.textContent('[data-node="ch1n1"]'),/需处理/);
  assert.equal(await page.locator('[data-publish-draft="ch1n1"]').count(),0);
  assert.equal(await page.textContent('[data-read="ch1n1"]'),'阅读未核验草稿');
  await page.click('[data-read="ch1n1"]');await page.waitForSelector('#reader-body article');
  assert.equal(await page.textContent('#reader-count'),'1 / 5');
  assert.match(await page.textContent('#reader-body'),/未核验内容/);
  assert.equal((await store()).goals[0].nodes.ch1n1.cards.length,5);
  assert.equal((await store()).goals[0].nodes.ch1n1.publishedWithoutReview,true);
  ok('saved complete drafts recover automatically as unverified, without imposing a learning check');
  // Legacy content stays readable and the whole route can still finish.
  const legacy={id:'old',topic:'旧版学习',planStatus:'ready',plan:{nodes:[{id:'n1',title:'旧小节',why:'原内容',prereq:'无',minutes:4}]},nodes:{n1:{cards:[oldCards[0]],status:'ready',page:0,chat:[]}},updatedAt:Date.now()};
  legacy.nodes.n1.quiz={status:'submitted',difficulty:'high',result:{score:0,passed:false}};
  await seed([legacy]);await page.click('[data-goal="old"]');await page.click('[data-toggle="n1"]');await page.click('[data-read="n1"]');
  assert.equal(await page.textContent('#reader-count'),'1 / 1');
  assert.equal(await page.textContent('[data-action="next-card"]'),'完成路线');
  await page.click('[data-action="next-card"]');assert.match(await page.textContent('#reader-body'),/这条路线读完了/);
  assert((await store()).goals[0].nodes.n1.readCompletedAt);
  await page.reload();await page.click('[data-goal="old"]');await page.click('[data-toggle="n1"]');await page.click('[data-read="n1"]');
  assert.match(await page.textContent('#reader-body'),/这条路线读完了/);
  assert.equal(await page.locator('#quiz-layer,[data-quiz]').count(),0);
  ok('legacy failed quiz cannot block route completion, which survives refresh and reopening');
  // A compact editorial sample checks the final typography with meaningful content.
  const formatted={...oldCards[0],title:'函数：输入与输出',lead:'函数的核心：**输入确定，输出唯一**。',body:['函数是一条规则，把允许的输入对应到输出。\n先说明**输入范围**，再看这条规则如何工作。','不同输入可以得到相同输出。\n\n==同一个输入，不能同时对应两个不同输出==。'],example:'设 f(x)=x²，输入范围是实数。\n\n输入 2，得到 4。\n输入 −2，也得到 4。',takeaway:'判断是不是函数，先看**每个允许的输入是否只有一个输出**。'};
  const richGoal={...legacy,id:'rich',topic:'排版参考样例',nodes:{n1:{cards:[formatted],status:'ready',page:0,chat:[]}}};
  await seed([richGoal]);await page.click('[data-goal="rich"]');await page.click('[data-toggle="n1"]');await page.click('[data-read="n1"]');
  assert.equal(await page.locator('.card-copy p').count(),3);assert.equal(await page.locator('.example-text p').count(),2);
  assert.equal(await page.locator('.card-copy mark').count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.waitForTimeout(350);await page.screenshot({path:path.join(__dirname,'../检查截图/reading-only-reading-format.png')});
  await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('zhizhi.v3'));s.goals[0].nodes.n1.cards[0].body.push('**<img src=x onerror="window.__unsafe=1">**');localStorage.setItem('zhizhi.v3',JSON.stringify(s));});
  await page.reload();await page.click('[data-goal="rich"]');await page.click('[data-toggle="n1"]');await page.click('[data-read="n1"]');
  assert.equal(await page.locator('.card-copy img').count(),0);assert.equal(await page.evaluate(()=>window.__unsafe),undefined);
  assert.match(await page.textContent('.card-copy'),/<img/);
  ok('mobile typography supports semantic paragraphs, restrained emphasis and safe literal HTML');
  await page.setViewportSize({width:1280,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.click('[data-screen="reader"] [data-action="back-tree"]');await page.click('[data-screen="tree"] [data-action="back-home"]');
  await page.waitForTimeout(350);
  await page.screenshot({path:path.join(__dirname,'../检查截图/reading-only-content-desktop.png')});
  assert.equal(loaded.some(u=>/\.(js|css|png)(?:[?]|$)/.test(u)),false);
  assert.deepEqual(report.pageErrors,[]);ok('mobile and desktop rendering without uncaught browser errors');
  report.result='PASS';fs.writeFileSync(path.join(__dirname,'reading-only-browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
