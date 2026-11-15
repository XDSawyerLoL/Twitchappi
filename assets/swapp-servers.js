'use strict';
(()=> {
 const root=document.querySelector('.ss');if(!root)return;
 const $=s=>root.querySelector(s), results=$('#ss-results'),feedback=$('#ss-feedback'),count=$('#ss-count');
 const dialog=$('#ss-dialog'),form=$('#ss-form'),status=$('#ss-form-status');
 const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e};
 const state={servers:[],loading:false,request:0};
 const serverCard=(s,i)=>{
  const article=make('article','ss-card');
  const art=make('div','ss-card-image');
  if(s.bannerUrl){const img=make('img');img.src=s.bannerUrl;img.alt='';img.loading='lazy';img.onerror=()=>img.remove();art.append(img);}
  const top=make('div','ss-card-top');top.append(make('span','ss-rank','#'+(i+1)),make('span','ss-card-game',s.game));art.append(top);
  const content=make('div','ss-card-content'),heading=make('h3','',s.name);
  const details=make('p','ss-description',s.description);
  const meta=make('div','ss-meta');meta.append(make('span','',s.region||'Région non précisée'),make('span','',Number(s.votes_month||0).toLocaleString('fr-FR')+' vote(s) ce mois'));
  const tags=make('div','ss-tags');(Array.isArray(s.tags)?s.tags:[]).slice(0,5).forEach(t=>tags.append(make('span','',t)));
  content.append(heading,details,meta,tags);
  const actions=make('div','ss-card-actions'),vote=make('button','ss-vote','♥ Voter');
  vote.type='button';
  vote.addEventListener('click',async()=>{
   vote.disabled=true;
   try{
    const r=await fetch('/api/swapp/serveurs/'+encodeURIComponent(s.id)+'/vote',{method:'POST',credentials:'same-origin',headers:{'Accept':'application/json'}});
    const data=await r.json();
    if(!r.ok)throw Error(({connexion_swapp_requise:'Connecte-toi à ton compte SWAPP pour voter.',vote_deja_effectue:'Tu as déjà voté pour ce serveur. Nouveau vote dans deux heures.',origine_invalide:'Session invalide, recharge la page.'})[data.error]||'Vote indisponible.');
    feedback.textContent='Vote enregistré pour '+s.name+'.';await load();
   }catch(e){feedback.textContent=e.message}finally{vote.disabled=false}
  });
  actions.append(vote);
  if(s.website){const link=make('a','ss-join','Rejoindre ↗');link.href=s.website;link.target='_blank';link.rel='noopener noreferrer nofollow';actions.append(link)}
  if(s.joinAddress){const address=make('button','ss-address','Copier l’adresse');address.type='button';address.onclick=async()=>{try{await navigator.clipboard.writeText(s.joinAddress);address.textContent='Adresse copiée'}catch{address.textContent=s.joinAddress}};actions.append(address)}
  content.append(actions);article.append(art,content);return article;
 };
 const draw=()=>{
  const items=state.servers;count.textContent=items.length+' serveur'+(items.length===1?'':'s')+' référencé'+(items.length===1?'':'s');
  results.replaceChildren(...items.map(serverCard));
  if(!items.length){const empty=make('div','ss-empty');empty.append(make('h3','','Aucun serveur référencé pour cette recherche'),make('p','','Ajoute ton serveur : les nouvelles fiches seront visibles après modération.'));results.append(empty)}
 };
 async function load(){
  const seq=++state.request;
  const params=new URLSearchParams({q:$('#ss-q').value.trim(),game:$('#ss-game').value,sort:$('#ss-sort').value});
  feedback.textContent='Mise à jour du classement…';
  try{const res=await fetch('/api/swapp/serveurs?'+params.toString(),{credentials:'same-origin',headers:{Accept:'application/json'}});if(!res.ok)throw Error('L’annuaire est temporairement indisponible.');const data=await res.json();if(seq!==state.request)return;state.servers=Array.isArray(data.servers)?data.servers:[];draw();feedback.textContent='Classement basé sur les votes réels du mois, sans faux statut en ligne.'}
  catch(e){if(seq!==state.request)return;results.replaceChildren();count.textContent='Indisponible';feedback.textContent=e.message}
 }
 let timer;$('#ss-q').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(load,250)});
 $('#ss-game').addEventListener('change',load);$('#ss-sort').addEventListener('change',load);
 $('#ss-add').onclick=()=>dialog.showModal();$('#ss-cancel').onclick=()=>dialog.close();
 form.onsubmit=async event=>{
  event.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;status.textContent='Vérification…';
  const payload=Object.fromEntries(new FormData(form).entries());
  try{const res=await fetch('/api/swapp/serveurs',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(payload)});const data=await res.json();if(!res.ok)throw Error(({connexion_swapp_requise:'Connecte-toi à ton compte SWAPP avant de proposer un serveur.',limite_de_cinq_serveurs:'Limite de cinq fiches par compte atteinte.',informations_invalides:'Vérifie le nom, la description, le jeu et les URL HTTPS.'})[data.error]||'Soumission indisponible.');status.textContent='Serveur soumis. La fiche est en attente de validation.';form.reset()}catch(e){status.textContent=e.message}finally{button.disabled=false}
 };
 const admin=$('#ss-review'),adminRefresh=$('#ss-review-refresh');
 if(admin&&adminRefresh){
  async function review(){
   admin.textContent='Chargement des propositions…';
   try{
    const response=await fetch('/api/swapp/serveurs/moderation',{credentials:'same-origin'});
    if(!response.ok)throw Error('Modération indisponible.');
    const data=await response.json();
    const servers=Array.isArray(data.servers)?data.servers:[];
    admin.replaceChildren();
    if(!servers.length){admin.append(make('p','','Aucune proposition en attente.'));return}
    for(const item of servers){
     const card=make('article','ss-review-card');
     card.append(make('h3','',item.name+' · '+item.game),make('p','',item.description),make('p','',item.website||item.joinAddress||'Aucun lien'));
     for(const [decision,label] of [['published','Approuver'],['rejected','Refuser']]){
      const button=make('button','',label);button.type='button';
      button.onclick=async()=>{
       button.disabled=true;
       try{
        const response=await fetch('/api/swapp/serveurs/'+encodeURIComponent(item.id)+'/moderation',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({status:decision})});
        if(!response.ok)throw Error('Décision impossible.');
        await review();await load();
       }catch(error){admin.prepend(make('p','',error.message));button.disabled=false}
      };
      card.append(button);
     }
     admin.append(card);
    }
   }catch(error){admin.textContent=error.message}
  }
  adminRefresh.onclick=review;review();
 }

 load();
})();