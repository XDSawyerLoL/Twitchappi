/* SWAPP PREMIÈRE — a voluntary interest signal, not an event reservation or purchase. */
(()=>{'use strict';
 const sections=[...document.querySelectorAll('[data-swapp-premiere-interest]')];
 if(!sections.length)return;
 const endpoint='/api/swapp/premiere/interest';
 async function json(url,options={}){
  const response=await fetch(url,{credentials:'same-origin',cache:'no-store',
   ...options,headers:{Accept:'application/json',...(options.headers||{})}});
  const body=await response.json().catch(()=>({}));
  if(!response.ok||body.success===false){
   const error=Error(String(body.error||'premiere_interest_unavailable'));error.status=response.status;throw error;
  }
  return body;
 }
 function displayCount(container,value,minimum){
  const count=container.querySelector('[data-swp-count]');if(!count)return;
  if(Number.isSafeInteger(value)&&value>=minimum)
   count.textContent=value+' membres intéressés · aucun événement confirmé';
  else count.textContent='L’intérêt collectif sera affiché à partir de '+minimum+' membres · aucun événement confirmé';
 }
 function statusText(error){
  const code=String(error?.message||'');
  if(code==='swapp_account_required'||code==='swapp_account_not_found')
   return 'Connecte-toi à ton compte SWAPP pour participer. Aucun compte Twitch nécessaire.';
  if(code==='premiere_interest_limit')return 'Tu peux suivre jusqu’à 30 jeux via SWAPP PREMIÈRE.';
  if(code==='spotlight_game_not_covered')return 'Ce jeu ne possède pas encore de couverture éditoriale publiée.';
  if(code==='premiere_interest_unavailable'||code==='premiere_database_unavailable')
   return 'SWAPP PREMIÈRE est momentanément indisponible.';
  return 'Impossible d’enregistrer ton intérêt pour le moment.';
 }
 async function setup(section){
  if(section.dataset.swpMounted==='1')return;
  section.dataset.swpMounted='1';
  const game=String(section.getAttribute('data-game')||'').trim();
  const button=section.querySelector('[data-swp-toggle]');
  const message=section.querySelector('[data-swp-message]');
  if(!game||!button||!message)return;
  button.disabled=true;
  let active=false,busy=false;
  try{
   const state=await json(endpoint+'?game='+encodeURIComponent(game));
   active=state.active===true;
   displayCount(section,state.publicCount,Number(state.minimum||5));
   button.textContent=active?'Retirer ma demande':'Je veux voir ce jeu testé';
   button.setAttribute('aria-pressed',String(active));
   button.disabled=false;
   section.hidden=false;
  }catch(error){
   if(error.status===503||error.message==='premiere_interest_not_enabled'){
    section.hidden=true;return;
   }
   message.textContent=statusText(error);
   button.disabled=true;return;
  }
  button.addEventListener('click',async()=>{
   if(busy)return;
   busy=true;button.disabled=true;message.textContent='';
   try{
    const state=await json(endpoint,{method:'POST',
     headers:{'Content-Type':'application/json','X-SWAPP-PREMIERE-ACTION':'interest'},
     body:JSON.stringify({game,active:!active})});
    active=state.active===true;
    displayCount(section,state.publicCount,Number(state.minimum||5));
    button.textContent=active?'Retirer ma demande':'Je veux voir ce jeu testé';
    button.setAttribute('aria-pressed',String(active));
    message.textContent=active?'Intérêt enregistré. Ce n’est pas une réservation d’événement.':
      'Ton intérêt a été retiré.';
   }catch(error){message.textContent=statusText(error)}
   finally{busy=false;button.disabled=false}
  });
 }
 sections.forEach(section=>setup(section).catch(()=>{section.hidden=true}));
})();
