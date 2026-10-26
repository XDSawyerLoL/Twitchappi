/* SWAPP channel agenda: actual month calendar, not a vertical list.
   Transport and live player are untouched while the agenda tab is open. */
(function(){
 'use strict';
 const root=document.getElementById('channel');if(!root)return;
 const make=(tag,cls,value)=>{
  const node=document.createElement(tag);if(cls)node.className=cls;
  if(value!==undefined)node.textContent=value;
  return node;
 };
 const pad=n=>String(n).padStart(2,'0');
 const dayKey=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
 const monthKey=d=>d.getFullYear()+'-'+pad(d.getMonth()+1);
 const sameMonth=(a,b)=>a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth();
 const today=()=>new Date();
 const monthName=d=>new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(d);
 const longDate=d=>new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(d);
 const clock=d=>new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit'}).format(d);
 const profileLogin=()=>{try{return typeof state==='undefined'?'':String(state?.channelProfile?.login||'')}catch(_){return ''}};
 function login(){
  const path=location.pathname.match(/^\/(?:c\/)?([a-z0-9_-]{2,48})\/?$/i);
  const value=path?path[1]:profileLogin();
  return /^[a-z0-9_-]{2,48}$/i.test(value)?value.toLowerCase():'';
 }
 const endpoint=name=>'/api/swapp/channel/'+encodeURIComponent(name)+'/programme';
 let mounted=null,seq=0;
 function allowedMonth(d){
  const present=today();
  const distance=(d.getFullYear()-present.getFullYear())*12+d.getMonth()-present.getMonth();
  return distance>=-2&&distance<=7;
 }
 function findDays(items){
  const map=new Map();
  for(const event of items){
   const key=dayKey(new Date(event.start_at));
   if(!map.has(key))map.set(key,[]);
   map.get(key).push(event);
  }
  return map;
 }
 function init(name){
  const panel=make('section','swapp-programme-page swapp-agenda-page');
  panel.dataset.swappProgrammePage='1';panel.setAttribute('aria-label','Agenda des directs');
  panel.hidden=true;
  const header=make('header','swapp-agenda-heading');
  const intro=make('div','swapp-agenda-intro');
  intro.append(make('span','swapp-programme-overline','LA CHAÎNE · AGENDA'));
  intro.append(make('h2','','Agenda des directs'));
  intro.append(make('p','','Retrouve les dates, les horaires et les jeux annoncés par le créateur.'));
  const command=make('div','swapp-agenda-commands');
  const nowButton=make('button','swapp-agenda-today','Aujourd’hui');nowButton.type='button';
  const previous=make('button','swapp-agenda-prev','‹');previous.type='button';
  previous.setAttribute('aria-label','Mois précédent');
  const period=make('strong','swapp-agenda-month','');
  const next=make('button','swapp-agenda-next','›');next.type='button';
  next.setAttribute('aria-label','Mois suivant');
  command.append(nowButton,previous,period,next);header.append(intro,command);panel.append(header);
  const shell=make('div','swapp-agenda-layout');
  const calendar=make('div','swapp-agenda-calendar');
  const weekdays=make('div','swapp-agenda-weekdays');
  for(const day of ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'])weekdays.append(make('span','',day));
  const grid=make('div','swapp-agenda-grid');grid.setAttribute('role','group');grid.setAttribute('aria-label','Jours du mois');
  calendar.append(weekdays,grid);
  const sidebar=make('aside','swapp-agenda-side');
  const dayHeader=make('div','swapp-agenda-dayhead');
  const dayTitle=make('h3','','');
  const count=make('span','swapp-agenda-count','');
  dayHeader.append(dayTitle,count);
  const dayEvents=make('div','swapp-agenda-dayevents');
  const add=make('button','swapp-agenda-add','+ Programmer un direct');
  add.type='button';add.hidden=true;
  sidebar.append(dayHeader,dayEvents,add);
  shell.append(calendar,sidebar);panel.append(shell);
  const status=make('p','swapp-programme-status','');
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  panel.append(status);
  const form=make('form','swapp-programme-owner swapp-agenda-editor');
  form.hidden=true;
  const formHead=make('div','swapp-agenda-form-head');
  const formTitle=make('h3','','Programmer un direct');
  const close=make('button','swapp-agenda-close','Fermer');
  close.type='button';close.addEventListener('click',()=>{form.hidden=true});
  formHead.append(formTitle,close);
  const fields=make('div','swapp-programme-formgrid');
  const title=make('input','');title.name='title';title.required=true;title.minLength=3;title.maxLength=120;title.placeholder='Titre du direct';
  const game=make('input','');game.name='game';game.maxLength=60;game.placeholder='Jeu ou catégorie';
  const date=make('input','');date.type='datetime-local';date.name='start_at';date.required=true;
  const duration=make('select','');duration.name='duration_minutes';
  for(const mins of [30,60,90,120,180,240,360]){
   const option=make('option','',mins+' min');option.value=String(mins);
   if(mins===120)option.selected=true;
   duration.append(option);
  }
  const repeat=make('select','');repeat.name='repeat';
  for(const entry of [['none','Une seule fois'],['weekly','Toutes les semaines']]){
   const option=make('option','',entry[1]);option.value=entry[0];repeat.append(option);
  }
  fields.append(title,game,date,duration,repeat);
  const note=make('textarea','');note.name='note';note.maxLength=240;note.rows=2;
  note.placeholder='Précisions pour les spectateurs (facultatif)';
  const actions=make('div','swapp-agenda-form-actions');
  const save=make('button','btn','Enregistrer ce rendez-vous');save.type='submit';
  const cancel=make('button','swapp-agenda-cancel','Annuler');cancel.type='button';
  cancel.addEventListener('click',()=>{form.hidden=true});
  actions.append(save,cancel);form.append(formHead,fields,note,actions);panel.append(form);
  const model={name,panel,calendar,grid,period,previous,next,dayTitle,dayEvents,count,add,status,form,formTitle,title,game,date,duration,repeat,note,save,editingTimezone:null,month:new Date(today().getFullYear(),today().getMonth(),1),selected:dayKey(today()),items:[],owner:false,editing:null,loaded:null};
  const openEditor=item=>{
   if(!model.owner)return;
   model.editing=item?.id||null;
   model.editingTimezone=item?.timezone||null;
   formTitle.textContent=item?(item.repeat==='weekly'?'Modifier le direct hebdomadaire':'Modifier un rendez-vous'):'Programmer un direct';
   form.hidden=false;
   form.reset();
   if(item){
    title.value=item.title||'';game.value=item.game||'';note.value=item.note||'';
    const start=new Date(item.base_start_at||item.start_at);
    date.value=dayKey(start)+'T'+pad(start.getHours())+':'+pad(start.getMinutes());
    duration.value=String(item.duration_minutes||120);
    repeat.value=item.repeat||'none';
   }else{
    const chosen=new Date(model.selected+'T20:00:00');
    const minimum=new Date(Date.now()+60*60000);
    const starting=chosen<minimum?new Date(minimum.getTime()+3600000):chosen;
    date.value=dayKey(starting)+'T'+pad(starting.getHours())+':'+pad(starting.getMinutes());
   }
   form.scrollIntoView({behavior:'smooth',block:'nearest'});
   title.focus({preventScroll:true});
  };
  const deleteEvent=async item=>{
   if(!model.owner)return;
   const isSeries=item.repeat==='weekly';
   const question=isSeries?'Supprimer toutes les occurrences de ce direct hebdomadaire ?':'Supprimer ce rendez-vous ?';
   if(!window.confirm(question))return;
   status.textContent='Suppression en cours…';
   try{
    const response=await fetch(endpoint(name)+'/'+encodeURIComponent(item.id),{
     method:'DELETE',credentials:'same-origin',headers:{Accept:'application/json'}
    });
    if(!response.ok)throw Error('Suppression impossible');
    await refresh(model);
    status.textContent='Rendez-vous supprimé.';
   }catch(error){status.textContent=error.message||'Erreur de suppression'}
  };
  const listEvents=()=>{
   const key=model.selected,events=findDays(model.items).get(key)||[];
   const selectedDate=new Date(key+'T12:00:00');
   dayTitle.textContent=longDate(selectedDate);
   count.textContent=events.length?events.length+' direct'+(events.length>1?'s':''):'Aucun direct';
   dayEvents.replaceChildren();
   if(!events.length)dayEvents.append(make('p','swapp-agenda-empty','Aucun direct prévu ce jour.'));
   for(const item of events){
    const card=make('article','swapp-agenda-event');
    const start=new Date(item.start_at);
    const time=make('time','swapp-agenda-time',clock(start));
    time.dateTime=item.start_at;
    const body=make('div','swapp-agenda-eventbody');
    body.append(make('strong','',item.title));
    const meta=[item.game||'',item.duration_minutes+' min',item.repeat==='weekly'?'Chaque semaine':''].filter(Boolean).join(' · ');
    body.append(make('span','swapp-agenda-meta',meta));
    if(item.note)body.append(make('p','swapp-agenda-note',item.note));
    card.append(time,body);
    if(model.owner){
     const buttons=make('div','swapp-agenda-event-actions');
     const edit=make('button','','Modifier');edit.type='button';
     edit.addEventListener('click',()=>openEditor(item));
     const remove=make('button','swapp-agenda-remove','Supprimer');remove.type='button';
     remove.addEventListener('click',()=>void deleteEvent(item));
     buttons.append(edit,remove);card.append(buttons);
    }
    dayEvents.append(card);
   }
  };
  const render=()=>{
   period.textContent=monthName(model.month);
   previous.disabled=!allowedMonth(new Date(model.month.getFullYear(),model.month.getMonth()-1,1));
   next.disabled=!allowedMonth(new Date(model.month.getFullYear(),model.month.getMonth()+1,1));
   add.hidden=!model.owner;
   const byDay=findDays(model.items);
   const year=model.month.getFullYear(),month=model.month.getMonth();
   const first=new Date(year,month,1);
   const offset=(first.getDay()+6)%7;
   const start=new Date(year,month,1-offset);
   const last=new Date(year,month+1,0);
   const weeks=Math.ceil((offset+last.getDate())/7);
   grid.replaceChildren();
   for(let index=0;index<weeks*7;index++){
    const date=new Date(start.getFullYear(),start.getMonth(),start.getDate()+index);
    const key=dayKey(date),events=byDay.get(key)||[];
    const cell=make('button','swapp-agenda-cell');cell.type='button';
    if(!sameMonth(date,model.month))cell.classList.add('outside');
    if(key===dayKey(today()))cell.classList.add('today');
    if(key===model.selected)cell.classList.add('selected');
    cell.setAttribute('aria-pressed',String(key===model.selected));
    cell.setAttribute('aria-label',longDate(date)+' — '+events.length+' directs');
    cell.append(make('span','swapp-agenda-number',String(date.getDate())));
    for(const item of events.slice(0,2)){
     const chip=make('span','swapp-agenda-chip');
     chip.append(make('time','',clock(new Date(item.start_at))));
     chip.append(make('span','',item.title));
     cell.append(chip);
    }
    if(events.length>2)cell.append(make('span','swapp-agenda-more','+'+(events.length-2)+' autre'+(events.length>3?'s':'')));
    if(events.length){
     const dots=make('span','swapp-agenda-dots');
     for(let i=0;i<Math.min(events.length,3);i++)dots.append(make('i',''));
     cell.append(dots);
    }
    cell.addEventListener('click',()=>{
     if(!sameMonth(date,model.month)){
      if(!allowedMonth(date))return;
      model.month=new Date(date.getFullYear(),date.getMonth(),1);
      model.selected=key;
      void refresh(model);
     }else{
      model.selected=key;render();
     }
    });
    grid.append(cell);
   }
   listEvents();
  };
  const changeMonth=step=>{
   const date=new Date(model.month.getFullYear(),model.month.getMonth()+step,1);
   if(!allowedMonth(date))return;
   model.month=date;model.selected=dayKey(new Date(date.getFullYear(),date.getMonth(),1));
   void refresh(model);
  };
  previous.addEventListener('click',()=>changeMonth(-1));
  next.addEventListener('click',()=>changeMonth(1));
  nowButton.addEventListener('click',()=>{
   const current=today();
   model.month=new Date(current.getFullYear(),current.getMonth(),1);
   model.selected=dayKey(current);void refresh(model);
  });
  add.addEventListener('click',()=>openEditor(null));
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(!model.owner)return;
   const epoch=new Date(date.value).getTime();
   if(!Number.isFinite(epoch)){status.textContent='Date incorrecte';return}
   const editing=model.editing,body={
    title:title.value,game:game.value,note:note.value,start_at:new Date(epoch).toISOString(),
    duration_minutes:Number(duration.value),repeat:repeat.value,
    timezone:model.editingTimezone||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'
   };
   if(editing)body.id=editing;
   save.disabled=true;status.textContent='Enregistrement…';
   try{
    const response=await fetch(endpoint(name),{
     method:'POST',credentials:'same-origin',
     headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(result.error||'Enregistrement impossible');
    form.hidden=true;model.editing=null;
    const newDate=new Date(epoch);
    model.month=new Date(newDate.getFullYear(),newDate.getMonth(),1);
    model.selected=dayKey(newDate);
    await refresh(model);status.textContent='Programme enregistré.';
   }catch(error){status.textContent=error.message||'Enregistrement impossible'}
   finally{save.disabled=false}
  });
  model.render=render;render();return model;
 }
 async function refresh(model){
  const id=++seq;
  model.status.textContent='Chargement de l’agenda…';
  const query='?month='+encodeURIComponent(monthKey(model.month));
  try{
   const response=await fetch(endpoint(model.name)+query,{
    credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.error||'Agenda momentanément indisponible');
   if(id!==seq||!model.panel.isConnected)return;
   model.owner=!!data.owner;model.items=Array.isArray(data.items)?data.items:[];
   if(!model.owner)model.form.hidden=true;
   model.render();model.status.textContent='';
   model.loaded=monthKey(model.month);
  }catch(error){
   if(id!==seq||!model.panel.isConnected)return;
   model.status.textContent=error.message||'Chargement impossible';
  }
 }
 function show(page,nav,model,button,open){
  page.classList.toggle('swapp-programme-active',open);
  button.classList.toggle('active',open);
  button.setAttribute('aria-selected',String(open));
  model.panel.hidden=!open;
  for(let sibling=nav.nextElementSibling;sibling;sibling=sibling.nextElementSibling){
   if(sibling===model.panel)continue;
   if(open)sibling.dataset.swappProgrammeSleep='1';
   else delete sibling.dataset.swappProgrammeSleep;
  }
  if(open){
   nav.querySelectorAll('button:not([data-swapp-programme-tab])').forEach(b=>b.classList.remove('active'));
   if(model.loaded!==monthKey(model.month))void refresh(model);
  }
 }
 function install(){
  if(!root.classList.contains('active'))return;
  const page=root.querySelector('.creatorRefine.swapp-channel-polish');
  const nav=page?.querySelector('.channelSubNav'),name=login();
  if(!nav||!name)return;
  // The state is stored as {tab}, never {button}. Checking mounted.button
  // previously failed forever and an observer reinjected tabs on every change.
  if(mounted?.page===page&&mounted.nav===nav&&mounted.model?.name===name&&
     mounted.tab?.isConnected&&mounted.model.panel?.isConnected)return;
  // Dispose of stale listeners before replacing a detached SPA channel view.
  mounted?.dispose?.();
  // Recover if a previous buggy runtime left duplicate navigation/panels.
  nav.querySelectorAll('[data-swapp-programme-tab]').forEach(node=>node.remove());
  page.querySelectorAll('[data-swapp-programme-page]').forEach(node=>node.remove());
  const tab=make('button','','Programme');tab.type='button';
  tab.dataset.swappProgrammeTab='1';tab.setAttribute('aria-label','Agenda de la chaîne');
  nav.append(tab);nav.hidden=false;
  const model=init(name);nav.after(model.panel);
  mounted={page,nav,tab,model};
  const open=enabled=>{
   const url=new URL(location.href);
   if(enabled)url.searchParams.set('tab','programme');
   else url.searchParams.delete('tab');
   history.pushState({},'',url);show(page,nav,model,tab,enabled);
  };
  tab.addEventListener('click',()=>open(true));
  nav.querySelectorAll('button:not([data-swapp-programme-tab])').forEach(button=>{
   button.addEventListener('click',()=>open(false));
  });
  const navigate=()=>{
   if(!page.isConnected)return;
   show(page,nav,model,tab,new URLSearchParams(location.search).get('tab')==='programme');
  };
  window.addEventListener('popstate',navigate);
  mounted.dispose=()=>window.removeEventListener('popstate',navigate);
  navigate();
 }
 let scheduled=false;
 const schedule=()=>{
  if(scheduled)return;scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;install()});
 };
 // Ignore mutations from the agenda's own calendar or the live chat.
 // Only a new/detached channel view needs reinstallation.
 new MutationObserver(()=>{
  if(mounted?.page===root.querySelector('.creatorRefine.swapp-channel-polish')&&
     mounted?.model?.name===login()&&mounted?.tab?.isConnected&&
     mounted?.nav?.isConnected&&mounted?.model?.panel?.isConnected)return;
  schedule();
 }).observe(root,{childList:true,subtree:true});
 window.addEventListener('popstate',schedule);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});
 else schedule();
})();
