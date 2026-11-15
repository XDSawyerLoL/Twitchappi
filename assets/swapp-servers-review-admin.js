'use strict';
/* A simple authenticated moderation queue for genuine SWAPP member reviews. */
(()=>{
 const panel=document.getElementById('ss-pending-reviews');if(!panel)return;
 const make=(tag,text,className='')=>{const el=document.createElement(tag);el.textContent=String(text||'');if(className)el.className=className;return el};
 let loading=false;
 async function refresh(){
  if(loading)return;loading=true;panel.replaceChildren(make('p','Chargement des avis en attente…'));
  try{
   const response=await fetch('/api/swapp/serveurs/reviews/moderation',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
   if(!response.ok)throw Error('Accès à la modération indisponible.');
   const data=await response.json(),reviews=Array.isArray(data.reviews)?data.reviews:[];
   panel.replaceChildren();
   if(!reviews.length){panel.append(make('p','Aucun avis en attente.'));return}
   for(const review of reviews){
    const card=make('article','', 'ss-review-admin-item');
    card.append(make('h4',review.serverName+' · '+review.game));
    card.append(make('p',review.comment));
    card.append(make('small','Équipe : '+review.staff+'/5 · Ambiance : '+review.atmosphere+'/5 · Disponibilité : '+review.availability+'/5'));
    const actions=make('div','', 'ss-review-admin-actions');
    for(const [status,label] of [['published','Approuver cet avis'],['rejected','Refuser cet avis']]){
     const button=make('button',label);button.type='button';
     button.addEventListener('click',async()=>{
      button.disabled=true;
      try{
       const res=await fetch('/api/swapp/serveurs/reviews/'+encodeURIComponent(review.id)+'/moderation',{
        method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Accept:'application/json'},
        body:JSON.stringify({status})
       });
       if(!res.ok)throw Error('Impossible de traiter cet avis.');
       await refresh();
       window.dispatchEvent(new CustomEvent('swapp-servers-review-moderated'));
      }catch(error){panel.prepend(make('p',error.message));button.disabled=false}
     });actions.append(button);
    }
    card.append(actions);panel.append(card);
   }
  }catch(error){panel.replaceChildren(make('p',error.message))}
  finally{loading=false}
 }
 document.querySelector('#ss-review-refresh')?.addEventListener('click',refresh);
 refresh();
})();
