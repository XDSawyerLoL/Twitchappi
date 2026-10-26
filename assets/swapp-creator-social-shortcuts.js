/* SWAPP creator social shortcuts — real public URLs, not placeholder icons.
 * Visually attached to the player's existing tool strip, never overlaying HLS.
 */
(function(){
 'use strict';
 const root=document.getElementById('channel');
 if(!root)return;
 const services=[
  ['signal','Signal','signal'],
  ['bluesky','Bluesky','butterfly'],
  ['mastodon','Mastodon','mastodon'],
  ['minds','Minds','network']
 ];
 const ICON={
  signal:['circle','M4 18l-1 3 4-1','M8 7h8M8 11h6'],
  butterfly:['M12 12C7 5 2 2 2 6c0 4 6 8 10 9','M12 12c5-8 10-10 10-6 0 4-6 8-10 9','M12 11v10'],
  mastodon:['M4 18V9c0-4 3-6 8-6s8 2 8 6v9','M8 17v-7c0-2 4-2 4 0v6-6c0-2 4-2 4 0v7','M5 20c3 2 11 2 14 0'],
  network:['M12 3l6 3v7l-6 7-6-7V6z','M8 15l4-8 4 8','M9 13h6']
 };
 const make=(tag,cls,value)=>{
  const x=document.createElement(tag);
  if(cls)x.className=cls;
  if(value!==undefined)x.textContent=String(value);
  return x;
 };
 const LOGIN=/^[a-z0-9_-]{2,48}$/;
 const cache=new Map(),pending=new Set();
 let dialog=null,fields={},dialogFor='',busy=false;
 const loginFor=page=>{
  const name=String(page?.dataset?.channelLogin||'').trim().toLowerCase();
  if(LOGIN.test(name))return name;
  const match=location.pathname.match(/^\/(?:c\/)?([a-z0-9_-]{2,48})\/?$/i);
  return match?match[1].toLowerCase():'';
 };
 const ownerFor=page=>{
  const name=loginFor(page);
  try{return !!state?.session?.local?.id&&
   String(state.session.local.login||'').toLowerCase()===name}catch(_){return false}
 };
 const blank=()=>({signal:'',bluesky:'',mastodon:'',minds:''});
 function normalized(input){
  const obj=input&&typeof input==='object'?input:{};
  return Object.fromEntries(services.map(([key])=>{
   let url=String(obj[key]||'');
   try{
    if(url.length>500)return [key,''];
    const p=new URL(url);
    if(p.protocol!=='https:'||p.username||p.password)return [key,''];
    const host=p.hostname.toLowerCase();
    const accepted=key==='signal'?['signal.me','signal.group'].includes(host):
      key==='bluesky'?host==='bsky.app':
      key==='minds'?['minds.com','www.minds.com'].includes(host):
      host.includes('.')&&!host.endsWith('.local')&&!host.endsWith('.internal');
    if(!accepted)return [key,''];
    return [key,p.href];
   }catch(_){return [key,'']}
  }));
 }
 function picture(type){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');
  svg.setAttribute('aria-hidden','true');
  svg.setAttribute('width','19');svg.setAttribute('height','19');
  svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');
  svg.setAttribute('stroke-width','1.7');svg.setAttribute('stroke-linecap','round');
  svg.setAttribute('stroke-linejoin','round');
  for(const item of ICON[type]){
   const el=document.createElementNS('http://www.w3.org/2000/svg',item==='circle'?'circle':'path');
   if(item==='circle'){el.setAttribute('cx','12');el.setAttribute('cy','11');el.setAttribute('r','8');el.setAttribute('stroke-dasharray','2 2')}
   else el.setAttribute('d',item);
   svg.append(el);
  }
  return svg;
 }
 function paint(page,links){
  const main=page.querySelector('.channelMainPlayer');
  if(!main)return;
  const dock=main.querySelector('.swapp-watch-tools')||main;
  let row=main.querySelector('.swapp-creator-social-shortcuts');
  const visible=services.filter(([key])=>Boolean(links[key]));
  const owner=ownerFor(page);
  if(!visible.length&&!owner){row?.remove();return}
  if(!row){
   row=make('nav','swapp-creator-social-shortcuts');
   row.setAttribute('aria-label','Réseaux et liens du créateur');
   dock.append(row);
  }else if(row.parentElement!==dock)dock.append(row);
  const mark=visible.map(([key])=>key+':'+links[key]).join('|')+'|owner='+owner;
  if(row.dataset.socialMark===mark)return;
  row.dataset.socialMark=mark;
  row.replaceChildren();
  if(visible.length)row.append(make('span','swapp-creator-social-caption','Retrouve-moi'));
  for(const [key,label,icon] of services){
   if(!links[key])continue;
   const a=make('a','swapp-creator-social-link swapp-creator-social-'+key);
   a.href=links[key];a.target='_blank';a.rel='noopener noreferrer nofollow ugc';
   a.title='Ouvrir '+label+' — lien du créateur';
   a.setAttribute('aria-label',label+' : profil ou communauté du créateur (nouvel onglet)');
   a.append(picture(icon));
   row.append(a);
  }
  if(owner){
   const edit=make('button','swapp-creator-social-inline-edit','+ Liens');
   edit.type='button';edit.title='Configurer Signal, Bluesky, Mastodon et Minds';
   edit.addEventListener('click',()=>open(page));
   row.append(edit);
  }
 }
 async function publicProfile(login){
  const response=await fetch('/api/oryon/profile/'+encodeURIComponent(login),{
   credentials:'same-origin',cache:'no-store',
   headers:{Accept:'application/json'},signal:AbortSignal.timeout(8000)});
  const body=await response.json().catch(()=>({}));
  if(!response.ok||body.success!==true||String(body.user?.login||'').toLowerCase()!==login)
   throw Error('Profil public indisponible.');
  return body.user;
 }
 async function refresh(page,force=false){
  const login=loginFor(page);
  if(!login||(!force&&pending.has(login)))return;
  if(!force&&cache.has(login)){paint(page,cache.get(login));return}
  pending.add(login);
  try{
   const user=await publicProfile(login);
   const links=normalized(user.channel_social_links);
   cache.set(login,links);
   if(page.isConnected&&loginFor(page)===login)paint(page,links);
  }catch(_){if(page.isConnected&&ownerFor(page))paint(page,blank())}
  finally{pending.delete(login)}
 }
 function ensureDialog(){
  if(dialog)return dialog;
  dialog=make('dialog','swapp-creator-links-dialog');
  dialog.setAttribute('aria-label','Mes liens sur le lecteur');
  const header=make('div','swapp-creator-links-head');
  header.append(make('h2','','Mes liens sur le lecteur'));
  const close=make('button','swapp-creator-links-close','×');
  close.type='button';close.setAttribute('aria-label','Fermer');
  close.addEventListener('click',()=>dialog.close());header.append(close);
  dialog.append(header,make('p','swapp-creator-links-desc',
   'Choisis les liens publics à afficher en petites icônes sous les commandes du direct. Un champ vide masque son icône.'));
  for(const [key,label] of services){
   const wrapper=make('label','swapp-creator-links-field');
   wrapper.append(make('span','',label));
   const field=make('input','');
   field.type='url';field.inputMode='url';field.autocomplete='url';
   field.maxLength=500;field.placeholder=key==='signal'?'https://signal.group/#…':
    key==='bluesky'?'https://bsky.app/profile/…':
    key==='mastodon'?'https://mastodon.social/@…':'https://www.minds.com/…';
   field.setAttribute('aria-label','Lien '+label);
   wrapper.append(field);dialog.append(wrapper);
   fields[key]=field;
  }
  const hint=make('p','swapp-creator-links-hint',
   'Signal : lien de groupe ou profil partageable. Mastodon : adresse de ton instance. Les liens externes s’ouvrent dans un nouvel onglet.');
  const status=make('p','swapp-creator-links-status','');status.setAttribute('role','status');
  status.setAttribute('aria-live','polite');
  const footer=make('footer','swapp-creator-links-footer');
  const cancel=make('button','swapp-creator-links-cancel','Annuler');
  cancel.type='button';cancel.addEventListener('click',()=>dialog.close());
  const save=make('button','swapp-creator-links-save','Enregistrer mes liens');
  save.type='button';
  save.addEventListener('click',async()=>{
   if(busy||!dialogFor)return;
   busy=true;save.disabled=true;status.textContent='Enregistrement…';
   const expected=Object.fromEntries(services.map(([key])=>[key,fields[key].value.trim()]));
   try{
    const response=await fetch('/api/oryon/profile',{
     method:'POST',credentials:'same-origin',cache:'no-store',
     headers:{Accept:'application/json','Content-Type':'application/json'},
     body:JSON.stringify({channel_social_links:expected})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.success!==true)
     throw Error(data.error||'Enregistrement impossible.');
    const verified=await publicProfile(dialogFor);
    const actual=normalized(verified.channel_social_links);
    const saved=normalized(data.user?.channel_social_links);
    if(JSON.stringify(actual)!==JSON.stringify(saved))
     throw Error('Les liens ne sont pas encore visibles sur la chaîne publique.');
    cache.set(dialogFor,actual);
    const page=Array.from(root.querySelectorAll('.creatorRefine.swapp-channel-polish'))
     .find(item=>loginFor(item)===dialogFor);
    if(page)paint(page,actual);
    status.textContent='Liens enregistrés sur la chaîne publique.';
    dialog.close();
   }catch(error){status.textContent=String(error.message||'Échec de publication.')}
   finally{busy=false;save.disabled=false}
  });
  footer.append(cancel,save);dialog.append(hint,status,footer);
  document.body.append(dialog);
  return dialog;
 }
 async function open(page){
  if(!ownerFor(page))return;
  dialogFor=loginFor(page);
  ensureDialog();
  const status=dialog.querySelector('.swapp-creator-links-status');
  for(const key of Object.keys(fields))fields[key].value='';
  status.textContent='Chargement des liens publics…';
  if(!dialog.open)dialog.showModal();
  try{
   const user=await publicProfile(dialogFor);
   const links=normalized(user.channel_social_links);
   cache.set(dialogFor,links);
   for(const key of Object.keys(fields))fields[key].value=links[key]||'';
   status.textContent='Seuls les liens renseignés sont visibles par les spectateurs.';
  }catch(error){status.textContent=String(error.message||'Liens temporairement indisponibles.')}
 }
 function scan(){
  if(!root.classList.contains('active'))return;
  for(const page of root.querySelectorAll('.creatorRefine.swapp-channel-polish')){
   const login=loginFor(page);if(!login)continue;
   if(cache.has(login))paint(page,cache.get(login));
   else void refresh(page);
   if(ownerFor(page)){
    const ownerMenu=page.querySelector('.swapp-showcase-owner-menu .swapp-showcase-menu-content');
    if(ownerMenu&&!ownerMenu.querySelector('.swapp-creator-links-edit')){
     const edit=make('button','swapp-creator-links-edit btn secondary','Liens sociaux');
     edit.type='button';edit.addEventListener('click',()=>open(page));
     ownerMenu.append(edit);
    }
   }
  }
 }
 let queued=false;
 const schedule=()=>{
  if(queued)return;queued=true;
  requestAnimationFrame(()=>{queued=false;scan()});
 };
 new MutationObserver(records=>{
  if(records.some(r=>r.addedNodes?.length||r.removedNodes?.length))schedule();
 }).observe(root,{childList:true,subtree:false});
 window.addEventListener('popstate',schedule);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
 setInterval(()=>{if(root.classList.contains('active'))schedule()},3500);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});
 else schedule();
})();
