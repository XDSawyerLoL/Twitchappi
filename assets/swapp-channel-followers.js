/* SWAPP channel community — owner-only followers, points and real chat moderation. */
(function(){
 'use strict';
 const manager=document.getElementById('manager');if(!manager)return;
 const $=(selector,root=manager)=>root.querySelector(selector);
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=String(text);return node};
 const valid=login=>/^[a-z0-9_][a-z0-9_-]{1,39}$/.test(String(login||''));
 let mounted=null,activeRoom='',page=1,search='',busy=false,requestId=0,searchTimer=null;
 const account=()=>{try{return typeof state!=='undefined'?state.session?.local:null}catch(_){return null}};
 const ownerLogin=()=>String(account()?.login||'').trim().toLowerCase();
 const fmt=value=>typeof value==='number'?value.toLocaleString('fr-FR'):'—';
 async function request(url,options={}){
  const response=await fetch(url,{credentials:'same-origin',cache:'no-store',
   headers:{Accept:'application/json',...(options.method?{'Content-Type':'application/json'}:{})},...options});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.success!==true){
   const error=new Error(data.error||'Service momentanément indisponible.');
   error.status=response.status;throw error;
  }
  return data;
 }
 function render(data){
  if(!mounted||activeRoom!==data.room)return;
  const summary=$('.swapp-followers-summary',mounted),body=$('.swapp-followers-rows',mounted);
  const pages=$('.swapp-followers-pager',mounted);
  summary.textContent=data.total+' follower'+(data.total===1?'':'s')+(data.points_available?' · points de chaîne':' · points momentanément indisponibles');
  body.replaceChildren();
  const header=el('div','swapp-followers-row swapp-followers-column-head');
  for(const name of ['Compte SWAPP','Points / temps','Statut','Actions'])header.append(el('span','',name));
  body.append(header);
  const followers=Array.isArray(data.followers)?data.followers:[];
  for(const member of followers){
   if(!valid(member.login))continue;
   const row=el('div','swapp-followers-row');
   const who=el('div','swapp-followers-identity');
   const profile=el('a','',member.display_name||member.login);profile.href='/'+encodeURIComponent(member.login);
   who.append(profile,el('small','','@'+member.login));
   const loyalty=el('div','swapp-followers-points');
   loyalty.append(el('strong','',member.points===null?'Non mesuré':fmt(member.points)+' pts'),
    el('small','',member.minutes===null?'Points indisponibles':fmt(member.minutes)+' min comptabilisées'));
   const flags=el('div','swapp-followers-flags');
   if(member.moderator)flags.append(el('span','swapp-followers-mod','Modérateur'));
   if(member.banned)flags.append(el('span','swapp-followers-ban','Banni du tchat'));
   if(!member.moderator&&!member.banned)flags.append(el('span','swapp-followers-normal','Follower'));
   const actions=el('div','swapp-followers-actions');
   const makeAction=(name,action,danger=false)=>{
    const button=el('button',danger?'swapp-followers-danger':'',name);
    button.type='button';button.dataset.action=action;button.dataset.target=member.login;
    button.setAttribute('aria-label',name+' '+member.login);actions.append(button);
   };
   if(member.moderator)makeAction('Retirer mod.','remove_mod');
   else if(!member.banned)makeAction('Promouvoir mod.','add_mod');
   if(member.banned)makeAction('Débannir','unban');
   else makeAction('Bannir','ban',true);
   row.append(who,loyalty,flags,actions);body.append(row);
  }
  if(!followers.length)body.append(el('p','swapp-followers-empty',
   search?'Aucun follower ne correspond à cette recherche.':'Aucun compte SWAPP ne suit encore cette chaîne.'));
  pages.replaceChildren();
  const previous=el('button','','Précédent');previous.type='button';previous.disabled=data.page<=1||busy;
  previous.addEventListener('click',()=>{page=Math.max(1,page-1);void refresh()});
  const next=el('button','','Suivant');next.type='button';next.disabled=!data.has_more||busy;
  next.addEventListener('click',()=>{page++;void refresh()});
  pages.append(previous,el('span','','Page '+data.page+' · '+data.per_page+' par page'),next);
 }
 async function refresh(){
  if(!mounted||!manager.classList.contains('active')||!valid(activeRoom))return;
  const seq=++requestId,status=$('.swapp-followers-status',mounted);
  status.textContent='Chargement des followers…';
  try{
   const data=await request('/api/swapp/channel-followers/'+encodeURIComponent(activeRoom)+
    '?page='+page+'&q='+encodeURIComponent(search));
   if(seq!==requestId||!mounted?.isConnected||activeRoom!==data.room)return;
   render(data);status.textContent='';
  }catch(error){
   if(seq!==requestId||!mounted?.isConnected)return;
   status.textContent=error.message;
   $('.swapp-followers-rows',mounted).replaceChildren();
  }
 }
 async function act(action,target){
  if(busy||!mounted||!valid(target)||!valid(activeRoom))return;
  const prompts={
   add_mod:'Donner à @'+target+' le droit de modérer ton tchat SWAPP ?',
   remove_mod:'Retirer les droits de modération à @'+target+' ?',
   ban:'Bannir @'+target+' du tchat de cette chaîne ? Ce compte pourra toujours accéder à SWAPP.',
   unban:'Autoriser de nouveau @'+target+' à écrire dans ce tchat ?'
  };
  if(!prompts[action]||!window.confirm(prompts[action]))return;
  const buttons=Array.from(mounted.querySelectorAll('button[data-action]'));
  busy=true;buttons.forEach(button=>button.disabled=true);
  const status=$('.swapp-followers-status',mounted);
  status.textContent='Modification des droits…';
  try{
   await request('/api/swapp/channel-moderation/'+encodeURIComponent(activeRoom),{
    method:'POST',body:JSON.stringify({action,target})
   });
   await refresh();
   status.textContent='Droits actualisés pour @'+target+'.';
  }catch(error){status.textContent=error.message||'Modification refusée.'}
  finally{busy=false;buttons.forEach(button=>{if(button.isConnected)button.disabled=false})}
 }
 function install(){
  if(!manager.classList.contains('active'))return;
  const room=ownerLogin(),panel=$('#swapp-channel-audience',manager);
  if(!valid(room)||!panel)return;
  if(mounted?.isConnected){
   if(activeRoom!==room){activeRoom=room;page=1;search='';++requestId;void refresh()}
   return;
  }
  activeRoom=room;page=1;search='';++requestId;
  mounted=el('section','swapp-followers');mounted.id='swapp-channel-followers';
  const head=el('header','swapp-followers-head'),title=el('div','');
  title.append(el('h3','','Followers et modération'),
   el('p','','Comptes qui suivent ta chaîne, points locaux et permissions de tchat.'));
  const reload=el('button','btn secondary','Actualiser');reload.type='button';
  reload.addEventListener('click',()=>void refresh());head.append(title,reload);
  const tools=el('div','swapp-followers-tools');
  const label=el('label','','Rechercher un follower'),input=el('input','','');
  input.type='search';input.placeholder='Pseudo ou nom affiché';input.maxLength=60;input.autocomplete='off';
  input.setAttribute('aria-label','Rechercher un follower SWAPP');
  input.addEventListener('input',()=>{
   clearTimeout(searchTimer);
   searchTimer=setTimeout(()=>{search=input.value.trim();page=1;void refresh()},320);
  });
  label.append(input);
  tools.append(label,el('span','swapp-followers-summary',''));
  const status=el('p','swapp-followers-status','');
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const list=el('div','swapp-followers-rows'),pager=el('div','swapp-followers-pager');
  const footer=el('p','swapp-followers-note',
   'Les points de chaîne viennent du visionnage actif (5/min, 300/jour maximum). Le bannissement interdit d’écrire dans le tchat SWAPP de cette chaîne sans supprimer le compte ni son suivi.');
  mounted.append(head,tools,status,list,pager,footer);
  mounted.addEventListener('click',event=>{
   const button=event.target.closest('button[data-action]');
   if(button&&mounted.contains(button))void act(button.dataset.action,button.dataset.target);
  });
  const older=panel.querySelector('.swapp-audience-summary');
  if(older)panel.insertBefore(mounted,older);else panel.append(mounted);
  void refresh();
 }
 let queued=false;
 function queue(){
  if(queued)return;queued=true;
  requestAnimationFrame(()=>{queued=false;install()});
 }
 new MutationObserver(queue).observe(manager,{childList:true,subtree:false,attributes:true,attributeFilter:['class']});
 window.addEventListener('popstate',queue);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)queue()});
 setInterval(()=>{if(manager.classList.contains('active'))install()},4000);
 queue();
})();
