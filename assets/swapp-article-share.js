/* SWAPP: compact share actions in both native and SPA readers. First-party, no SDK. */
(()=>{'use strict';
 const ARTICLE=/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/;
 const tag=(type,className,value)=>{
  const node=document.createElement(type);
  if(className)node.className=className;
  if(value!==undefined)node.textContent=String(value);
  return node;
 };
 function icon(src){
  const img=tag('img','sash-icon');
  img.src=src;img.alt='';img.width=18;img.height=18;img.setAttribute('aria-hidden','true');
  return img;
 }
 function link(label,src,href,aria,{primary=false,external=true}={}){
  const a=tag('a','sash-action'+(primary?' sash-primary':''));
  a.href=href;a.setAttribute('aria-label',aria);
  if(external){a.target='_blank';a.rel='noopener noreferrer';}
  a.append(icon(src),tag('span','',label));
  return a;
 }
 function copyIcon(){
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
  svg.setAttribute('class','sash-icon');svg.setAttribute('viewBox','0 0 24 24');
  svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');
  svg.setAttribute('stroke-width','2');svg.setAttribute('stroke-linecap','round');
  svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');
  const rect=document.createElementNS(ns,'rect');
  rect.setAttribute('x','8');rect.setAttribute('y','8');rect.setAttribute('width','13');
  rect.setAttribute('height','13');rect.setAttribute('rx','2');
  const path=document.createElementNS(ns,'path');
  path.setAttribute('d','M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3');
  svg.append(rect,path);return svg;
 }
 function verifiedInvite(raw){
  try{
   const u=new URL(String(raw||''));
   if(u.protocol==='https:'&&u.hostname==='discord.gg'&&!u.username&&!u.password&&!u.search&&!u.hash
     &&/^\/[a-zA-Z0-9-]{2,64}$/.test(u.pathname))return u.href;
  }catch{}
  return null;
 }
 function canonicalLink(raw){
  try{
   const u=new URL(String(raw||''),window.location.href);
   if(u.protocol!=='https:'||!['swapp.tv','www.swapp.tv'].includes(u.hostname)
      ||u.username||u.password||u.port||u.search||u.hash
      ||!/^\/actus\/[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(u.pathname))return null;
   return u.href;
  }catch{return null;}
 }
 function build(article){
  const slug=String(article?.slug||'');
  if(!ARTICLE.test(slug))return null;
  const title=String(article.title||'Une actualité SWAPP').trim().slice(0,130);
  const game=String(article.game||'').trim();
  const address='https://swapp.tv/actus/'+slug;
  const x='https://x.com/intent/tweet?'+new URLSearchParams({text:title,url:address}).toString();
  const blue='https://bsky.app/intent/compose?text='+encodeURIComponent(title+'\n'+address);
  const social='/social?'+new URLSearchParams(game?{game,share:'news',title,url:address}:{share:'news',title,url:address}).toString();
  const nav=tag('nav','swapp-article-share');nav.id='swapp-article-share';
  nav.dataset.swappArticleShare='1';nav.setAttribute('aria-label','Partager cet article');
  const label=tag('strong','sash-label');
  label.append(document.createTextNode('Partager '));
  const arrow=tag('span','','↗');arrow.setAttribute('aria-hidden','true');label.append(arrow);
  const actions=tag('div','sash-actions');
  actions.append(
   link('SWAPP','/favicon.ico',social,'Discuter de cet article sur SWAPP Social',{primary:true,external:false}),
   link('X','/assets/brand-icons/x.svg',x,'Partager cet article sur X'),
   link('Bluesky','/assets/brand-icons/bluesky.svg',blue,'Partager cet article sur Bluesky')
  );
  const copy=tag('button','sash-action sash-copy-button');copy.type='button';
  copy.dataset.swappShareCopy='1';copy.dataset.articleUrl=address;
  copy.setAttribute('aria-label','Copier le lien de cet article');
  const copyLabel=tag('span','','Copier');copyLabel.dataset.swappShareCopyLabel='1';
  copy.append(copyIcon(),copyLabel);
  const notice=tag('span','sash-notice');
  notice.dataset.swappShareNotice='1';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
  actions.append(copy);nav.append(label,actions,notice);
  // Only display the public Discord invite (never a private webhook).
  if(typeof fetch==='function'){
   void fetch('/api/swapp/community-links',{credentials:'same-origin',headers:{Accept:'application/json'}})
    .then(r=>r.ok?r.json():null).then(data=>{
     if(!nav.isConnected||data?.success!==true)return;
     const href=verifiedInvite(data.discordInvite);if(!href)return;
     actions.insertBefore(link('Discord','/assets/brand-icons/discord.svg',href,'Rejoindre le Discord SWAPP'),copy);
    }).catch(()=>{});
  }
  return nav;
 }
 async function copy(url){
  if(navigator.clipboard?.writeText){
   try{await navigator.clipboard.writeText(url);return true;}catch{}
  }
  const field=document.createElement('textarea');field.value=url;field.readOnly=true;
  field.setAttribute('aria-hidden','true');field.style.cssText='position:fixed;top:0;left:-9999px;opacity:0';
  document.body.append(field);
  let copied=false;
  try{field.focus();field.select();copied=document.execCommand('copy');}
  catch{}finally{field.remove();}
  return copied;
 }
 document.addEventListener('click',async event=>{
  const btn=event.target.closest?.('[data-swapp-share-copy]');if(!btn)return;
  const nav=btn.closest('[data-swapp-article-share]');
  const status=nav?.querySelector('[data-swapp-share-notice]');
  const label=btn.querySelector('[data-swapp-share-copy-label]');
  if(!nav||!status||!label)return;
  const address=canonicalLink(btn.dataset.articleUrl);
  if(!address){status.textContent='Lien indisponible.';return;}
  btn.disabled=true;
  try{
   if(await copy(address)){label.textContent='Copié ✓';status.textContent='Lien copié.';}
   else status.textContent='Copie ce lien : '+address;
  }finally{btn.disabled=false;}
 });
 window.SwappArticleShare={build};
})();