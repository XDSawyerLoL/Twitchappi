/* SWAPP read-only operations overview for an already authorized editor.
 * Never shares secrets, modifies production state or probes accounts as admin.
 */
(()=>{
 'use strict';
 const services=[
  {name:'Comptes SWAPP',url:'/api/oryon/persistence-status',describe:d=>({ok:d.mysql===true&&String(d.persistence||'').startsWith('mysql:'),detail:d.mysql?'MySQL · '+(d.users??'—')+' comptes':'Firestore encore actif'})},
  {name:'SOCIAL',url:'/api/swapp/social-native/backend-status',describe:d=>({ok:d.active_backend==='mysql'&&d.snapshot_present===true,detail:'Stockage : '+String(d.active_backend||'indisponible')})},
  {name:'Spotlight',url:'/api/creator/spotlight/status',describe:d=>({ok:d.enabled===true,detail:d.enabled?'Créneaux activés':'Inactif · comptes MySQL '+(d.accounts_mysql?'prêts':'non prêts')})},
  {name:'Fair Discovery',url:'/api/discovery/fair-summary',describe:d=>({ok:d.enabled===true,detail:d.enabled?'Activé · échantillon '+String(d.sample||'indisponible'):'Désactivé'})},
  {name:'Actualités',url:'/api/actus/release-status',describe:d=>({ok:d.releaseCount>0&&d.releaseCount===d.editableCount,detail:String(d.editableCount||0)+' / '+String(d.releaseCount||0)+' articles du lot éditables'})},
  {name:'Discord',url:'/api/editor/actus/discord/status',describe:d=>({ok:d.discord?.enabled===true,detail:d.discord?.enabled?'Annonce automatique configurée':'À configurer sur Hostinger'})},
  {name:'Référencement',url:'/api/seo/status',describe:d=>({ok:d.articleSource==='ready',detail:String(d.publishedCount||0)+' articles · '+String(d.articleSource||'inconnu')})}
 ];
 async function load(host){
  if(!host?.isConnected||host.dataset.loading==='1')return;
  host.dataset.loading='1';
  host.hidden=false;
  host.replaceChildren();
  const title=document.createElement('h4');title.textContent='État des services SWAPP';
  const subtitle=document.createElement('p');subtitle.textContent='Diagnostics du serveur · lecture seule · aucun compte modifié.';
  const list=document.createElement('div');list.className='swapp-ops-rows';
  host.append(title,subtitle,list);
  const results=await Promise.all(services.map(async service=>{
   const controller=new AbortController();
   const timer=setTimeout(()=>controller.abort(),6000);
   try{
    const r=await fetch(service.url,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal:controller.signal});
    if(!r.ok)throw Error('http_'+r.status);
    return service.describe(await r.json());
   }catch{
    return {ok:null,detail:'Statut non vérifiable'};
   }finally{clearTimeout(timer);}
  }));
  if(!host.isConnected)return;
  for(let i=0;i<services.length;i++){
   const row=document.createElement('div');row.className='swapp-ops-row';
   const name=document.createElement('strong');name.textContent=services[i].name;
   const detail=document.createElement('span');detail.textContent=results[i].detail;
   const status=document.createElement('small');status.textContent=results[i].ok===true?'Actif':results[i].ok===false?'À traiter':'Inconnu';
   status.dataset.status=results[i].ok===true?'ok':results[i].ok===false?'action':'unknown';
   row.append(name,detail,status);list.append(row);
  }
  host.dataset.loading='0';
 }
 window.SwappOpsStatus={load};
})();