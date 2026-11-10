/* First-party article share controls. No third-party SDK, cookies or paid API. */
(()=>{'use strict';
 const canonicalLink=raw=>{
  try{
   const u=new URL(String(raw||''),window.location.href);
   if(u.protocol!=='https:'||!['swapp.tv','www.swapp.tv'].includes(u.hostname)
     ||u.username||u.password||u.port||u.search||u.hash
     ||!/^\/actus\/[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(u.pathname))return null;
   return u.href;
  }catch{return null;}
 };
 async function copy(url){
  if(navigator.clipboard?.writeText){
   try{await navigator.clipboard.writeText(url);return true;}catch{}
  }
  const field=document.createElement('textarea');
  field.value=url;field.readOnly=true;
  field.setAttribute('aria-hidden','true');
  field.style.cssText='position:fixed;top:0;left:-9999px;opacity:0';
  document.body.append(field);
  let copied=false;
  try{field.focus();field.select();copied=document.execCommand('copy');}
  catch{}finally{field.remove();}
  return copied;
 }
 document.addEventListener('click',async event=>{
  const btn=event.target.closest?.('[data-swapp-share-copy]');
  if(!btn)return;
  const box=btn.closest('[data-swapp-article-share]');
  const status=box?.querySelector('[data-swapp-share-notice]');
  const label=btn.querySelector('[data-swapp-share-copy-label]');
  if(!box||!status||!label)return;
  const address=canonicalLink(btn.dataset.articleUrl);
  if(!address){
   status.textContent='Lien de partage indisponible.';
   return;
  }
  btn.disabled=true;
  try{
   if(await copy(address)){
    label.textContent='Lien copié ✓';
    status.textContent='Le lien est prêt à être envoyé.';
   }else{
    status.textContent='Copie ce lien manuellement : '+address;
   }
  }finally{
   btn.disabled=false;
  }
 });
})();
