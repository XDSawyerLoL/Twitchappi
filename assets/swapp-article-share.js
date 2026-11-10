/* First-party article sharing for native pages and the SWAPP SPA. No SDK or tracking. */
(()=>{'use strict';
 const pattern=/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/;
 const tag=(type,className,value)=>{
  const node=document.createElement(type);
  if(className)node.className=className;
  if(value!==undefined)node.textContent=String(value);
  return node;
 };
 const canonicalLink=raw=>{
  try{
   const u=new URL(String(raw||''),window.location.href);
   if(u.protocol!=='https:'||!['swapp.tv','www.swapp.tv'].includes(u.hostname)
     ||u.username||u.password||u.port||u.search||u.hash
     ||!/^\/actus\/[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(u.pathname))return null;
   return u.href;
  }catch{return null;}
 };
 function shareLink(className,label,icon,href,aria,external=true){
  const a=tag('a','sash-action'+(className?' '+className:''));
  a.href=href;a.setAttribute('aria-label',aria);
  if(external){a.target='_blank';a.rel='noopener noreferrer';}
  const mark=tag('span','sash-logo'+(label==='Bluesky'?' sash-blue':''),icon);
  mark.setAttribute('aria-hidden','true');
  const arrow=tag('span','sash-arrow','↗');arrow.setAttribute('aria-hidden','true');
  a.append(mark,tag('span','',label),arrow);return a;
 }
 function verifiedInvite(raw){
  try{
   const u=new URL(String(raw||''));
   if(u.protocol==='https:'&&u.hostname==='discord.gg'&&!u.username&&!u.password&&!u.search&&!u.hash&&/^\/[a-zA-Z0-9-]{2,64}$/.test(u.pathname))return u.href;
  }catch{}
  return null;
 }
 function build(article){
  const slug=String(article?.slug||'');
  if(!pattern.test(slug))return null;
  const title=String(article.title||'Une actualité SWAPP').trim().slice(0,130);
  const game=String(article.game||'').trim();
  const address='https://swapp.tv/actus/'+slug;
  const x='https://x.com/intent/tweet?'+new URLSearchParams({text:title,url:address}).toString();
  const blue='https://bsky.app/intent/compose?text='+encodeURIComponent(title+'\n'+address);
  const social='/social?'+new URLSearchParams(game?{game,share:'news',title,url:address}:{share:'news',title,url:address}).toString();
  const section=tag('section','swapp-article-share');
  section.id='swapp-article-share';section.dataset.swappArticleShare='1';
  section.setAttribute('aria-labelledby','swapp-share-title');
  const intro=tag('div','sash-copy');
  const eyebrow=tag('span','sash-eyebrow');
  const spark=tag('span','','✦');spark.setAttribute('aria-hidden','true');
  eyebrow.append(spark,document.createTextNode(' FAIS CIRCULER L’INFO'));
  const h=tag('h2');h.id='swapp-share-title';
  h.append(document.createTextNode('Cette actu mérite '),tag('em','','d’être partagée.'));
  intro.append(eyebrow,h,tag('p','','Tu connais un joueur que ça intéresse ? Envoie-lui l’article ou lance la discussion.'));
  const right=tag('div','sash-interact');
  const nav=tag('nav','sash-actions');nav.setAttribute('aria-label','Partager cet article');
  nav.append(
   shareLink('sash-primary','En parler sur SWAPP','⌗',social,'Discuter de cet article sur SWAPP Social',false),
   shareLink('','Partager sur X','𝕏',x,'Partager cet article sur X'),
   shareLink('','Bluesky','✦',blue,'Partager cet article sur Bluesky')
  );
  const copyButton=tag('button','sash-action');
  copyButton.type='button';copyButton.dataset.swappShareCopy='1';
  copyButton.dataset.articleUrl=address;copyButton.setAttribute('aria-label','Copier le lien de cet article');
  const copyIcon=tag('span','sash-logo','↗');copyIcon.setAttribute('aria-hidden','true');
  const copyLabel=tag('span','','Copier le lien');copyLabel.dataset.swappShareCopyLabel='1';
  const plus=tag('span','sash-arrow','+');plus.setAttribute('aria-hidden','true');
  copyButton.append(copyIcon,copyLabel,plus);nav.append(copyButton);
  const after=tag('div','sash-after');
  const discHolder=tag('span','','Partage la découverte avec tes amis.');
  const notice=tag('span','sash-notice');notice.dataset.swappShareNotice='1';
  notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
  after.append(discHolder,notice);right.append(nav,after);
  section.append(intro,right);
  // Public invite only. A private Discord announcement webhook must never be reused.
  if(typeof fetch==='function'){
   void fetch('/api/swapp/community-links',{credentials:'same-origin',headers:{Accept:'application/json'}})
   .then(r=>r.ok?r.json():null).then(data=>{
    if(!section.isConnected||data?.success!==true)return;
    const invite=verifiedInvite(data.discordInvite);
    if(!invite)return;
    const a=tag('a','sash-discord');
    a.href=invite;a.target='_blank';a.rel='noopener noreferrer';
    const symbol=tag('span','sash-discord-mark','◈');symbol.setAttribute('aria-hidden','true');
    a.append(symbol,document.createTextNode(' Rejoins les échanges sur Discord '));
    const arrow=tag('span','','↗');arrow.setAttribute('aria-hidden','true');a.append(arrow);
    discHolder.replaceWith(a);
   }).catch(()=>{});
  }
  return section;
 }
 async function copy(url){
  if(navigator.clipboard?.writeText){
   try{await navigator.clipboard.writeText(url);return true;}catch{}
  }
  const field=document.createElement('textarea');
  field.value=url;field.readOnly=true;field.setAttribute('aria-hidden','true');
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
  if(!address){status.textContent='Lien de partage indisponible.';return;}
  btn.disabled=true;
  try{
   if(await copy(address)){
    label.textContent='Lien copié ✓';
    status.textContent='Le lien est prêt à être envoyé.';
   }else status.textContent='Copie ce lien manuellement : '+address;
  }finally{btn.disabled=false;}
 });
 window.SwappArticleShare={build};
})();