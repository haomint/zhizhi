const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('/usr/local/lib/node_modules/playwright');
const BASE=process.argv[2]||'http://localhost:4183/index.html';
const {cards}=require('./fixtures.json');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/local/bin/chromium',args:['--no-sandbox']});
 const checks=[],errors=[];
 try {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  page.on('pageerror',e=>errors.push(e.message));
  const card=n=>({...cards[0],title:n});
  const goal={id:'back',topic:'返回卡片',planStatus:'ready',current:'n1',updatedAt:Date.now(),nodes:{n1:{status:'ready',page:0,cards:[card('第一张'),card('第二张')],chat:[]},optional:{status:'ready',page:0,cards:[card('尚未阅读的选学')],chat:[]},n2:{status:'ready',page:0,cards:[card('第三张'),card('第四张')],chat:[]}},plan:{nodes:[{id:'n1',title:'第一节',why:'阅读',minutes:2},{id:'optional',title:'选学',why:'选学',minutes:1,required:false},{id:'n2',title:'第二节',why:'阅读',minutes:2}]}};
  const open=async(id='n1')=>{await page.click('[data-goal="back"]');await page.click('[data-toggle="'+id+'"]');await page.click('[data-read="'+id+'"]');};
  const prev=()=>page.click('#reader-actions [data-action="previous-card"]');
  const next=()=>page.click('[data-action="next-card"]');
  const title=()=>page.textContent('#reader-body article h1');
  const store=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('zhizhi.v3')));
  await page.goto(BASE);await page.evaluate(g=>localStorage.setItem('zhizhi.v3',JSON.stringify({goals:[g],key:''})),goal);await page.reload();await open();
  assert.equal(await page.isDisabled('#reader-actions [data-action="previous-card"]'),true);
  await next();assert.equal(await title(),'第二张');await prev();assert.equal(await title(),'第一张');assert.equal((await store()).goals[0].nodes.n1.page,0);
  checks.push('first card disables Previous; second card returns to first and saves its position');
  await next();await page.reload();await open();assert.equal(await title(),'第二张');await prev();await page.reload();await open();assert.equal(await title(),'第一张');
  checks.push('backward and forward positions both survive refresh and reopening');
  await next();await next();assert.equal(await title(),'第三张');await prev();assert.equal(await title(),'第二张');assert.equal((await store()).goals[0].current,'n1');
  checks.push('first card of a new section returns to the last read card, skipping an unread optional section');
  await next();await next();assert.equal(await title(),'第四张');await next();assert.match(await page.textContent('#reader-body'),/这条路线读完了/);
  await page.click('#reader-body [data-action="previous-card"]');assert.equal(await title(),'第四张');await page.reload();await open('n2');assert.equal(await title(),'第四张');
  checks.push('completed route can return to its last card and preserve that position across refresh');
  await prev();assert.equal(await title(),'第三张');await next();await next();assert.match(await page.textContent('#reader-body'),/这条路线读完了/);
  assert.equal(await page.locator('#quiz-layer,[data-quiz]').count(),0);checks.push('backward navigation keeps forward reading and final completion usable without a quiz');
  await page.click('#reader-body [data-action="previous-card"]');
  await page.waitForTimeout(350);
  for(const viewport of [{width:390,height:844},{width:1280,height:900}]){
   await page.setViewportSize(viewport);
   const bounds=await page.locator('#reader-actions').boundingBox();assert(bounds.width>0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   const buttons=await page.locator('#reader-actions button').all();for(const button of buttons){const b=await button.boundingBox();assert(b.width>=80&&b.height>=44);}
  }
  checks.push('three reading controls fit mobile and desktop without horizontal overflow');
  assert.deepEqual(errors,[]);
  const report={result:'PASS',checks,pageErrors:errors,at:new Date().toISOString()};fs.writeFileSync(path.join(__dirname,'previous-card-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
