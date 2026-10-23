const el=id=>document.getElementById(id);
const native=window.Capacitor?.registerPlugin?.('Personal');
let db;
function write(record){return new Promise((resolve,reject)=>{const tx=db.transaction('cards','readwrite');tx.objectStore('cards').put(record,'latest');tx.oncomplete=resolve;tx.onerror=()=>reject(Error('本地保存失败'));});}
function show(record){el('card').textContent=record.content;el('card').hidden=false;el('topic').value=record.topic;}
const opened=indexedDB.open('zhizhi-personal',1);
opened.onupgradeneeded=()=>opened.result.createObjectStore('cards');
opened.onsuccess=()=>{db=opened.result;const req=db.transaction('cards').objectStore('cards').get('latest');req.onsuccess=()=>{if(req.result)show(req.result);};};
opened.onerror=()=>el('status').textContent='无法打开本地资料库。';
el('save').onclick=async()=>{try{if(!native)throw Error('请在安卓应用中配置。');await native.configure({key:el('key').value});el('key').value='';el('status').textContent='密钥已加密保存在手机上。';}catch(e){el('status').textContent=e.message;}};
el('generate').onclick=async()=>{el('generate').disabled=true;try{if(!native)throw Error('请在安卓应用中使用。');if(!db)throw Error('资料库尚未就绪，请稍后重试。');el('status').textContent='正在生成，请保持应用在前台…';const topic=el('topic').value;const result=await native.generate({topic,model:el('model').value});const record={topic,content:result.content,created_at:new Date().toISOString()};show(record);await write(record);el('status').textContent='已保存，可以离线回顾。';}catch(e){el('status').textContent=e.message;}finally{el('generate').disabled=false;}};
native?.status().then(r=>{el('status').textContent=r.configured?'已配置 API，可直接生成。':'请先展开模型设置，填写 API Key。';});
