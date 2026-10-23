// Only the preview server's minimal shim lacks Capacitor.getPlatform.
// Actual Capacitor (including Android) never enters this branch.
if(window.Capacitor?.isNativePlatform()&&!window.Capacitor.getPlatform){
 const previewNative=window.Capacitor.registerPlugin('Personal');
 window.Capacitor.registerPlugin=()=>({...previewNative,searchMaterials:async({query})=>{
  const params=new URLSearchParams({action:'query',format:'json',generator:'search',gsrnamespace:'0',gsrlimit:'3',prop:'extracts',exintro:'1',explaintext:'1',exlimit:'3',exchars:'1200',gsrsearch:query,origin:'*'});
  const r=await fetch('https://zh.wikipedia.org/w/api.php?'+params,{signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('百科检索暂不可用');return r.json();
 }});
 document.addEventListener('DOMContentLoaded',()=>{const el=document.querySelector('.version');if(el)el.textContent='知枝 1.0 · 浏览器预览（模型不可用）';});
}
