// Optional SWAPP SOCIAL interactive prototype. Requires SWAPP_SOCIAL_FEATURES=1.
(()=>{
 'use strict';
 const host=document.getElementById('swappSocialNative');if(!host)return;
 const area=document.createElement('section');area.className='swapp-interactive';area.hidden=true;
 area.innerHTML='<style>.swapp-interactive{padding:16px;margin:15px 0;border:1px solid #ffffff30;border-radius:15px;background:#1a2438;color:#fff}.swapp-interactive h2{font-size:21px}.swapp-interactive button,.swapp-interactive input{font:inherit;padding:9px;border-radius:9px}.swapp-interactive button{background:#435c99;color:white;border:1px solid #ffffff40;cursor:pointer}.swapp-interactive input{max-width:100%;background:#0c1727;color:white;border:1px solid #ffffff40}.swapp-interactive .s-row{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.swapp-interactive .s-card{padding:12px;margin:8px 0;border:1px solid #ffffff30;border-radius:10px}.swapp-interactive small{color:#baccdf}</style><h2>SWAPP Live Social</h2><p>Joueurs compatibles, votes et salons de discussion. Seules les vraies activités sont affichées.</p><div class="s-row"><button data-mode="matches">Joueurs compatibles</button><button data-mode="polls">Sondages</button><button data-mode="rooms">Salons</button></div><div id="swapp-interactive-out" aria-live="polite"></div>';
 const welcome=document.getElementById('pulse-welcome');(welcome?.parentNode||host).insertBefore(area,welcome?.nextSibling||null);
 const out=area.querySelector('#swapp-interactive-out'),escape=x=>String(x||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const req=async(url,method='GET',body)=>{
  const r=await fetch('/api/swapp/interactions/'+url,{method,credentials:'same-origin',headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store'});
  if(!r.ok)throw Error((await r.json().catch(()=>({}))).error||'Erreur du service');
  return r.json();
 };
 let roomId='',refresh=null;
 async function load(mode){
  if(refresh){clearInterval(refresh);refresh=null}
  out.textContent='Chargement…';
  try{
   if(mode==='matches'){
    const data=await req('matches/compatible');
    out.innerHTML='<h3>Mes compatibilités</h3>'+(data.reason?'<p>Crée d’abord une annonce avec SWAPP Match.</p>':'')+
     (data.matches||[]).map(x=>'<div class="s-card"><strong>'+escape(x.game)+'</strong> · '+escape(x.platform)+'<p>'+escape(x.handle)+' · '+escape(x.availability)+'</p><small>Compatibilité '+x.score+' / 100</small></div>').join('')+
     (!(data.matches||[]).length?'<p>Aucun coéquipier compatible pour le moment.</p>':'');
   }
   if(mode==='polls'){
    const data=await req('polls');
    out.innerHTML='<h3>Votes de la communauté</h3>'+(data.polls||[]).map(p=>'<div class="s-card"><strong>'+escape(p.question)+'</strong>'+
      p.choices.map((c,i)=>'<div class="s-row"><button data-vote="'+escape(p.id)+'" data-choice="'+i+'">'+escape(c)+'</button> <small>'+Number(p.counts[i]||0)+' vote(s)</small></div>').join('')+'</div>').join('')+
      (!(data.polls||[]).length?'<p>Aucun sondage pour le moment.</p>':'');
   }
   if(mode==='rooms'){
    const data=await req('rooms');
    out.innerHTML='<h3>Salons textuels</h3><form id="s-room-create" class="s-row"><input name="name" placeholder="Nom du salon" maxlength="60" required><input name="game" placeholder="Jeu" maxlength="65" required><button>Créer un salon</button></form>'+
      (data.rooms||[]).map(r=>'<button class="s-card" data-room="'+escape(r.id)+'">'+escape(r.name)+' · '+escape(r.game)+'</button>').join('')+
      '<div id="s-chat"></div>';
   }
  }catch(e){out.textContent=e.message}
 }
 async function chat(id){
  roomId=id;
  const pane=document.getElementById('s-chat');if(!pane)return;
  try{
   const data=await req('rooms/'+encodeURIComponent(id)+'/messages');
   pane.innerHTML='<h3>Discussion</h3><div aria-live="polite">'+data.messages.map(m=>'<p><strong>'+escape(m.handle)+'</strong> : '+escape(m.body)+'</p>').join('')+'</div><form id="s-chat-form" class="s-row"><input name="body" maxlength="160" required placeholder="Message…"><button>Envoyer</button></form>';
  }catch(e){pane.textContent=e.message}
 }
 area.addEventListener('click',async e=>{
  const mode=e.target.closest('[data-mode]');if(mode)return load(mode.dataset.mode);
  const vote=e.target.closest('[data-vote]');if(vote){
   try{await req('polls/'+encodeURIComponent(vote.dataset.vote)+'/vote','POST',{choice:Number(vote.dataset.choice)});await load('polls')}
   catch(err){out.insertAdjacentText('afterbegin',err.message+' · ')}return;
  }
  const room=e.target.closest('[data-room]');if(room){await chat(room.dataset.room);refresh=setInterval(()=>{if(document.visibilityState==='visible')void chat(roomId)},5000)}
 });
 area.addEventListener('submit',async e=>{
  if(e.target.id==='s-room-create'){
   e.preventDefault();const f=new FormData(e.target);
   try{await req('rooms','POST',{name:f.get('name'),game:f.get('game')});await load('rooms')}catch(err){out.insertAdjacentText('afterbegin',err.message+' · ')}
  }
  if(e.target.id==='s-chat-form'){
   e.preventDefault();const body=new FormData(e.target).get('body');
   try{await req('rooms/'+encodeURIComponent(roomId)+'/messages','POST',{body});await chat(roomId)}catch(err){out.insertAdjacentText('afterbegin',err.message+' · ')}
  }
 });
 // Probe capability without exposing an inert UI on hosts where feature is disabled.
 req('rooms').then(()=>{area.hidden=false}).catch(()=>{area.remove()});
})();
