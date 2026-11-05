'use strict';
(function(){
 function start(){
  const root=document.querySelector('[data-swapp-game-score]');
  if(!root)return;
  const slug=root.getAttribute('data-game-slug');
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug||''))return;
  const score=root.querySelector('[data-game-score-result]');
  const message=root.querySelector('[data-game-score-message]');
  const buttons=[...root.querySelectorAll('[data-game-rating]')];
  const url='/api/jeux/'+encodeURIComponent(slug)+'/score';
  function show(data){
   const count=Number(data.count)||0;
   score.textContent=count>=5&&Number.isFinite(data.average)
    ?'Note des joueurs : '+data.average.toFixed(1)+'/5 · '+count+' votes'
    :'Note des joueurs en attente · '+count+'/5 votes nécessaires';
   buttons.forEach(button=>{
    const selected=Number(button.getAttribute('data-game-rating'))===data.myRating;
    button.setAttribute('aria-pressed',selected?'true':'false');
    button.classList.toggle('selected',selected);
   });
   if(data.myRating)message.textContent='Ta note : '+data.myRating+'/5. Tu peux la modifier.';
  }
  fetch(url,{credentials:'same-origin',headers:{'Accept':'application/json'}})
   .then(r=>{if(!r.ok)throw Error('Service indisponible');return r.json()})
   .then(show).catch(()=>{score.textContent='Notes temporairement indisponibles';});
  buttons.forEach(button=>button.addEventListener('click',async()=>{
   const rating=Number(button.getAttribute('data-game-rating'));
   buttons.forEach(x=>x.disabled=true);
   message.textContent='Enregistrement…';
   try{
    const response=await fetch(url,{method:'POST',credentials:'same-origin',
     headers:{'Content-Type':'application/json','Accept':'application/json'},
     body:JSON.stringify({rating})});
    if(response.status===401){message.textContent='Connecte-toi à SWAPP pour noter ce jeu.';return;}
    if(!response.ok)throw Error('Note non enregistrée');
    show(await response.json());
   }catch(_){message.textContent='Impossible de noter ce jeu pour le moment.';}
   finally{buttons.forEach(x=>x.disabled=false);}
  }));
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);
 else start();
})();