'use strict';
(()=>{
 const root=document.querySelector('.ss-detail');if(!root)return;
 const feedback=document.getElementById('ss-detail-feedback');
 root.querySelectorAll('[data-ss-vote-id]').forEach(button=>button.addEventListener('click',async()=>{
  const id=String(button.dataset.ssVoteId||'');
  if(!/^[a-f0-9]{32}$/.test(id))return;
  button.disabled=true;
  try{
   const response=await fetch('/api/swapp/serveurs/'+encodeURIComponent(id)+'/vote',{method:'POST',credentials:'same-origin',headers:{Accept:'application/json'}});
   const data=await response.json();
   if(!response.ok)throw Error(({connexion_swapp_requise:'Connecte-toi à ton compte SWAPP pour voter.',vote_deja_effectue:'Ton prochain vote sera disponible deux heures après le précédent.'})[data.error]||'Impossible de voter actuellement.');
   feedback.textContent='Vote validé. Le classement sera actualisé.';
   const number=root.querySelector('.ss-detail-stats strong');
   if(number&&/^\d[\d\s\u202f]*$/.test(number.textContent)){
    const current=Number(number.textContent.replace(/[^0-9]/g,''));if(Number.isSafeInteger(current))number.textContent=(current+1).toLocaleString('fr-FR');
   }
  }catch(e){feedback.textContent=e.message}finally{button.disabled=false}
 }));
 root.querySelectorAll('[data-ss-copy]').forEach(button=>button.addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(button.dataset.ssCopy);button.textContent='Adresse copiée'}catch{feedback.textContent='Copie indisponible.'}
 }));
 root.querySelectorAll('img.ss-detail-art').forEach(image=>image.addEventListener('error',()=>image.remove()));
})();