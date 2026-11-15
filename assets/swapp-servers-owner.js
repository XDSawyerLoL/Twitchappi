'use strict';
(() => {
 const root=document.querySelector('.ss-owner-manage');
 if(!root)return;
 const list=root.querySelector('.ss-owner-manage-list');
 const feedback=root.querySelector('#ss-owner-feedback');
 if(!list||!feedback)return;
 const messageFor=(status,data)=>{
  if(status===401)return 'Reconnecte-toi à ton compte SWAPP avant de supprimer cette fiche.';
  if(status===403)return 'Session non valide : recharge la page avant de réessayer.';
  if(status===404)return 'Fiche introuvable ou ne t’appartenant pas. Actualise la page.';
  if(status===503)return 'La base des serveurs est momentanément indisponible. Réessaie plus tard.';
  return data?.error==='serveur_invalide'?'Identifiant de serveur invalide.':'La suppression n’a pas abouti.';
 };
 root.addEventListener('click',async event=>{
  const button=event.target.closest('button[data-ss-delete-id]');
  if(!button||!root.contains(button)||button.disabled)return;
  const id=button.dataset.ssDeleteId||'';
  const name=button.dataset.ssDeleteName||'ce serveur';
  if(!/^[a-f0-9]{32}$/.test(id)){feedback.textContent='Fiche invalide. Recharge la page.';return}
  // Require explicit confirmation; no data is deleted on page load.
  if(!window.confirm('Supprimer définitivement « '+name+' » ?\n\nCette action efface la fiche, ses images, ses votes, avis et statistiques. Elle ne peut pas être annulée.'))return;
  button.disabled=true;
  feedback.textContent='Suppression de « '+name+' »…';
  try{
   const response=await fetch('/api/swapp/serveurs/'+encodeURIComponent(id),{
    method:'DELETE',credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok||data.deleted!==true)throw Error(messageFor(response.status,data));
   button.closest('.ss-owner-manage-card')?.remove();
   if(!list.querySelector('.ss-owner-manage-card')){
    const empty=document.createElement('div');empty.className='ss-empty';
    const title=document.createElement('h2');title.textContent='Pas encore de serveur';
    const text=document.createElement('p');text.textContent='Tu peux créer une nouvelle fiche SERVEUR +.';
    const link=document.createElement('a');link.href='/serveurs/creer';link.textContent='Créer mon serveur';
    empty.append(title,text,link);list.prepend(empty);
   }
   feedback.textContent='La fiche « '+name+' » a été définitivement supprimée.';
  }catch(error){
   feedback.textContent=error?.message||'Suppression impossible.';
   button.disabled=false;
  }
 });
})();
