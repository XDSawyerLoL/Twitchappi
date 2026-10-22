/* SWAPP read-only operations overview for an already authorized editor.
 * Never shares secrets, modifies production state or probes accounts as admin.
 */
(()=>{
 'use strict';
 const services=[
  {name:'Comptes SWAPP',url:'/api/oryon/persistence-status',key:'accounts',describe:d=>({
   ok:d.mysql===true&&String(d.persistence||'').startsWith('mysql:'),
   detail:d.mysql===true?'MySQL · '+(d.users??'—')+' comptes':'Firestore · '+(d.users??'—')+' comptes. Migration à valider avant Spotlight.'
  })},
  {name:'SOCIAL',url:'/api/swapp/social-native/backend-status',key:'social',describe:d=>{
   const ready=d.active_backend==='mysql'&&d.snapshot_present===true&&d.snapshot_type==='fresh'&&!d.writes_frozen;
   const initStillOn=d.fresh_auto_init_requested===true||d.fresh_start_approved===true;
   return {ok:ready&&!initStillOn,live:ready,
    detail:ready?(initStillOn?'MySQL actif · autorisations d’initialisation temporaire à désactiver sur Hostinger':'MySQL actif · données conservées'):
     'Stockage non prêt : '+String(d.active_backend||'indisponible')};
  }},
  {name:'SWAPP TV',url:'/api/swapp-tv/queue/status',key:'tv',describe:d=>({
   ok:d.enabled===true&&d.director_enabled===true,
   detail:!d.enabled?'File désactivée sur Hostinger':!d.director_enabled?'Inscriptions ouvertes, régie automatique inactive':
    'Régie active · '+(Array.isArray(d.waiting)?d.waiting.length:0)+' en attente'
  })},
  {name:'Spotlight',url:'/api/creator/spotlight/status',key:'spotlight',describe:d=>({
   ok:d.enabled===true&&d.accounts_mysql===true,
   detail:d.enabled?'Créneaux activés':'Inactif · '+(d.accounts_mysql?'prérequis de comptes prêts':'comptes SWAPP MySQL requis')
  })},
  {name:'Fair Discovery',url:'/api/discovery/fair-summary',describe:d=>({ok:d.enabled===true,detail:d.enabled?'Activé · échantillon '+String(d.sample||'indisponible'):'Désactivé'})},
  {name:'Actualités',url:'/api/actus/release-status',describe:d=>({ok:d.releaseCount>0&&d.releaseCount===d.editableCount,detail:String(d.editableCount||0)+' / '+String(d.releaseCount||0)+' articles du lot éditables'})},
  {name:'Discord',url:'/api/editor/actus/discord/status',describe:d=>({ok:d.discord?.enabled===true,detail:d.discord?.enabled?'Annonce automatique configurée':'À configurer sur Hostinger'})},
  {name:'Liens communautaires',url:'/api/swapp/community-links',describe:d=>({ok:!!d.discordInvite,detail:[d.discordInvite?'Invitation Discord prête':'Invitation Discord à renseigner',d.xProfile?'X relié':'X non relié',d.blueskyProfile?'Bluesky relié':'Bluesky non relié'].join(' · ')})},
  {name:'Référencement',url:'/api/seo/status',describe:d=>({ok:d.articleSource==='ready',detail:String(d.publishedCount||0)+' articles · '+String(d.articleSource||'inconnu')})}
 ];
 async function load(host){
  if(!host?.isConnected||host.dataset.loading==='1')return;
  host.dataset.loading='1';
  host.hidden=false;
  host.replaceChildren();
  const title=document.createElement('h4');title.textContent='État des services SWAPP';
  const subtitle=document.createElement('p');subtitle.textContent='Diagnostics du serveur · lecture seule · aucun compte modifié.';
  const launch=document.createElement('p');launch.className='swapp-ops-launch';launch.setAttribute('role','status');
  const list=document.createElement('div');list.className='swapp-ops-rows';
  host.append(title,subtitle,launch,list);
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
  const readiness=Object.fromEntries(services.map((service,index)=>[service.key||service.name,results[index]]));
  const required=['accounts','social','tv','spotlight'];
  const missing=required.filter(key=>readiness[key]?.ok!==true);
  launch.textContent=missing.length===0
   ? 'Parcours P0 : prérequis techniques déclarés actifs. Tests réels de connexion, file et réservations encore nécessaires.'
   : 'Lancement P0 bloqué · '+missing.length+' prérequis à traiter : '+
      missing.map(key=>({accounts:'comptes MySQL',social:'SOCIAL / initialisation',tv:'régie TV',spotlight:'Spotlight'})[key]).join(', ')+
      '. Ne pas basculer les comptes ou ouvrir les réservations sans test à deux comptes.';
  launch.dataset.ready=missing.length===0?'candidate':'blocked';
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