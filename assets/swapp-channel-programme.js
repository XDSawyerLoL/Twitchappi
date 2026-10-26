/* SWAPP public channel programme. Keeps live iframe mounted; only hides it while
   visitors browse the schedule. All saved events live in the existing account store. */
(function(){
 'use strict';
 const root=document.getElementById('channel');
 if(!root)return;
 const el=(tag,cls,txt)=>{
  const node=document.createElement(tag);if(cls)node.className=cls;
  if(txt!==undefined)node.textContent=txt;return node;
 };
 const stateNow=()=>{try{return typeof state==='undefined'?null:state}catch(_){return null}};
 function login(){
  const profile=stateNow()?.channelProfile?.login;
  const path=location.pathname.match(/^\/(?:c\/)?([a-z0-9_-]{2,48})\/?$/i);
  return path?path[1].toLowerCase():/^[a-z0-9_-]{2,48}$/i.test(profile||'')?profile.toLowerCase():'';
 }
 function link(login){return '/api/swapp/channel/'+encodeURIComponent(login)+'/programme'}
 let mounted=null,loadedFor='',request=0;
 function dateLabel(stamp){
  const date=new Date(stamp);
  return Number.isNaN(date.valueOf())?'Date inconnue':
   new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit',timeZone:undefined}).format(date);
 }
 function markupList(panel,data){
  const target=panel.querySelector('.swapp-programme-items');if(!target)return;
  target.replaceChildren();
  const events=Array.isArray(data.items)?data.items:[];
  if(!events.length){target.append(el('p','swapp-programme-empty','Aucun direct programmé pour le moment.'));return}
  for(const item of events){
   const event=el('article','swapp-programme-event');
   const date=el('time','swapp-programme-date',dateLabel(item.start_at));
   date.dateTime=item.start_at;
   const info=el('div','swapp-programme-info');
   info.append(el('strong','',item.title));
   const details=el('p','', [item.game||'',item.duration_minutes+' min',item.repeat==='weekly'?'Chaque semaine':''].filter(Boolean).join(' · '));
   info.append(details);
   if(item.note)info.append(el('p','swapp-programme-note',item.note));
   event.append(date,info);
   if(data.owner){
    const del=el('button','swapp-programme-delete','Supprimer');
    del.type='button';del.title='Supprimer ce créneau';
    del.addEventListener('click',async()=>{
     del.disabled=true;
     try{
      const response=await fetch(link(data.login)+'/'+encodeURIComponent(item.id),{
       method:'DELETE',credentials:'same-origin',headers:{Accept:'application/json'}
      });
      if(!response.ok)throw Error('Impossible de supprimer ce créneau');
      await refresh(panel,data.login);
     }catch(error){del.disabled=false;panel.querySelector('.swapp-programme-status').textContent=error.message}
    });
    event.append(del);
   }
   target.append(event);
  }
 }
 async function refresh(panel,name){
  const seq=++request;
  const status=panel.querySelector('.swapp-programme-status');
  try{
   const response=await fetch(link(name),{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
   if(!response.ok)throw Error('Programme temporairement indisponible');
   const data=await response.json();
   if(seq!==request||!panel.isConnected)return;
   status.textContent='';
   panel.querySelector('.swapp-programme-owner').hidden=!data.owner;
   markupList(panel,data);
  }catch(error){if(seq===request&&panel.isConnected)status.textContent=error.message}
 }
 function programPanel(name){
  const panel=el('section','swapp-programme-page');
  panel.dataset.swappProgrammePage='1';
  panel.setAttribute('aria-label','Programme des directs');
  const intro=el('header','swapp-programme-intro');
  const left=el('div','');
  left.append(el('span','swapp-programme-overline','CHAÎNE SWAPP · AGENDA'));
  left.append(el('h2','','Programme des prochains directs'));
  left.append(el('p','','Retrouve les prochaines diffusions de cette chaîne, les jeux et les horaires locaux.'));
  intro.append(left);panel.append(intro);
  const owner=el('form','swapp-programme-owner');owner.hidden=true;
  const legend=el('h3','','Ajouter un rendez-vous');
  const title=el('input','');title.name='title';title.maxLength=120;title.minLength=3;title.required=true;title.placeholder='Titre du rendez-vous';
  const game=el('input','');game.name='game';game.maxLength=60;game.placeholder='Jeu ou catégorie';
  const date=el('input','');date.type='datetime-local';date.name='start_at';date.required=true;
  const duration=el('select','');duration.name='duration_minutes';
  for(const mins of [30,60,90,120,180,240,360]){
   const opt=el('option','',mins+' minutes');opt.value=String(mins);if(mins===120)opt.selected=true;duration.append(opt);
  }
  const repeat=el('select','');repeat.name='repeat';
  for(const [value,desc] of [['none','Une fois'],['weekly','Toutes les semaines']]){const opt=el('option','',desc);opt.value=value;repeat.append(opt)}
  const note=el('textarea','');note.name='note';note.maxLength=240;note.rows=2;note.placeholder='Informations complémentaires (facultatif)';
  const submit=el('button','btn','Ajouter au programme');submit.type='submit';
  const grid=el('div','swapp-programme-formgrid');grid.append(title,game,date,duration,repeat);
  owner.append(legend,grid,note,submit);panel.append(owner);
  const status=el('p','swapp-programme-status','');status.setAttribute('role','status');
  panel.append(status,el('div','swapp-programme-items'));
  owner.addEventListener('submit',async event=>{
   event.preventDefault();
   if(!date.value)return;
   const timestamp=new Date(date.value).getTime();
   if(!Number.isFinite(timestamp)){status.textContent='Date invalide';return}
   submit.disabled=true;status.textContent='Enregistrement…';
   try{
    const response=await fetch(link(name),{
     method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','Accept':'application/json'},
     body:JSON.stringify({title:title.value,game:game.value,note:note.value,
      start_at:new Date(timestamp).toISOString(),duration_minutes:Number(duration.value),repeat:repeat.value})
    });
    const answer=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(answer.error||'Enregistrement impossible');
    owner.reset();status.textContent='Rendez-vous enregistré.';
    await refresh(panel,name);
   }catch(error){status.textContent=error.message}
   finally{submit.disabled=false}
  });
  return panel;
 }
 function show(page,nav,panel,button,open){
  page.classList.toggle('swapp-programme-active',open);
  button.classList.toggle('active',open);
  button.setAttribute('aria-selected',String(open));
  panel.hidden=!open;
  let sibling=nav.nextElementSibling;
  while(sibling){
   if(sibling!==panel){
    if(open)sibling.dataset.swappProgrammeSleep='1';
    else delete sibling.dataset.swappProgrammeSleep;
   }
   sibling=sibling.nextElementSibling;
  }
  if(open){
   nav.querySelectorAll('button:not([data-swapp-programme-tab])').forEach(b=>b.classList.remove('active'));
   if(loadedFor!==page.dataset.swappProgrammeId){loadedFor=page.dataset.swappProgrammeId;void refresh(panel,page.dataset.swappProgrammeId)}
  }
 }
 function install(){
  if(!root.classList.contains('active'))return;
  const page=root.querySelector('.creatorRefine.swapp-channel-polish');
  const nav=page?.querySelector('.channelSubNav'),name=login();
  if(!nav||!name)return;
  if(mounted?.page===page&&mounted?.button?.isConnected)return;
  const button=el('button','','Programme');button.type='button';
  button.dataset.swappProgrammeTab='1';
  button.setAttribute('aria-label','Voir le programme de cette chaîne');
  nav.append(button);nav.hidden=false;
  const panel=programPanel(name);nav.after(panel);
  page.dataset.swappProgrammeId=name;
  mounted={page,nav,panel,button};
  loadedFor='';
  const set=open=>{
   const url=new URL(location.href);
   if(open)url.searchParams.set('tab','programme');else url.searchParams.delete('tab');
   history.pushState({},'',url);
   show(page,nav,panel,button,open);
  };
  button.addEventListener('click',()=>set(true));
  nav.querySelectorAll('button:not([data-swapp-programme-tab])').forEach(tab=>{
   tab.addEventListener('click',()=>set(false));
  });
  const fromUrl=()=>{
   if(!page.isConnected)return;
   show(page,nav,panel,button,new URLSearchParams(location.search).get('tab')==='programme');
  };
  window.addEventListener('popstate',fromUrl);
  fromUrl();
 }
 let scheduled=false;
 const schedule=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;install()})};
 new MutationObserver(schedule).observe(root,{childList:true,subtree:true});
 window.addEventListener('popstate',schedule);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();
