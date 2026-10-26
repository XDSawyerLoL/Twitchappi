/* SWAPP CREATOR impact: creator's own verified-source aggregate signals.
 * Never claim additional viewers, subscriptions or cross-series conversion.
 */
(function(){
 'use strict';
 const root=document.getElementById('dashboard');
 if(!root)return;
 const element=(tag,cls,value)=>{
  const el=document.createElement(tag);
  if(cls)el.className=cls;
  if(value!==undefined)el.textContent=String(value);
  return el;
 };
 const number=value=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('fr-FR'):'Non mesuré';
 const label={home:'Accueil',discover:'Découvrir',game:'Fiches de jeux'};
 let inflight=0,queued=false;
 function mount(){
  if(!root.classList.contains('active')||!root.firstElementChild||
     root.querySelector('[data-swapp-creator-impact]'))return;
  const section=element('section','swapp-creator-impact');
  section.dataset.swappCreatorImpact='1';
  section.setAttribute('aria-labelledby','swapp-creator-impact-title');
  const header=element('div','swapp-impact-head');
  const copy=element('div','');
  copy.append(element('span','swapp-impact-kicker','SWAPP CREATOR / DÉCOUVERTE'));
  const heading=element('h2','','La visibilité de ta chaîne');
  heading.id='swapp-creator-impact-title';
  copy.append(heading,element('p','',
   'Mesures de tes cartes SWAPP, sans suivi individuel des visiteurs ni statistiques inventées.'));
  const actions=element('div','swapp-impact-actions');
  const select=element('select','swapp-impact-period');
  select.setAttribute('aria-label','Période des statistiques');
  for(const days of [7,14]){
   const option=element('option','',days+' derniers jours');
   option.value=String(days);select.append(option);
  }
  const refresh=element('button','swapp-impact-refresh','Actualiser');
  refresh.type='button';
  actions.append(select,refresh);header.append(copy,actions);
  const status=element('p','swapp-impact-status','Chargement des mesures…');
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const grid=element('div','swapp-impact-grid');
  const cells=[
   {key:'impressions',title:'Cartes signalées visibles',detail:'Signal du navigateur, pas un spectateur unique'},
   {key:'clicks',title:'Clics vers les lives',detail:'Signal de clic, pas une lecture confirmée'},
   {key:'proposals',title:'Propositions du serveur',detail:'Présence dans des réponses API, pas des vues'}
  ];
  const values={};
  for(const item of cells){
   const card=element('div','swapp-impact-stat');
   card.append(element('span','',item.title));
   const strong=element('strong','','—');
   strong.dataset.impactValue=item.key;
   values[item.key]=strong;
   card.append(strong,element('small','',item.detail));grid.append(card);
  }
  const sources=element('div','swapp-impact-sources');
  const games=element('div','swapp-impact-games');
  const footer=element('footer','swapp-impact-foot');
  footer.append(element('p','','Ces deux séries ne doivent jamais servir à calculer un taux de conversion. Les audiences Twitch/Kick liées ne sont pas comptées ici.'));
  const links=element('nav','swapp-impact-links');
  const univers=element('a','','Explorer les univers de jeux');
  univers.href='/jeux';
  const dashboard=element('a','','Gérer Spotlight');
  dashboard.href='/dashboard';
  links.append(univers,dashboard);
  footer.append(links);
  section.append(header,status,grid,sources,games,footer);
  const main=root.querySelector('.swapp-creator-main')||root;
  const assoc=main.querySelector('[data-creator-twitch-link]');
  if(assoc&&assoc.parentElement===main)assoc.insertAdjacentElement('afterend',section);
  else {
   const heading=main.querySelector('.pageHead,.swapp-dashboard-header,.swapp-workspace-header');
   if(heading?.parentElement===main)heading.insertAdjacentElement('afterend',section);
   else main.prepend(section);
  }
  const render=body=>{
   values.impressions.textContent=number(body.visible?.collected?body.visible.total:null);
   values.clicks.textContent=number(body.visible?.collected?body.visible.clicks:null);
   values.proposals.textContent=number(body.proposals?.collected?body.proposals.total:null);
   sources.replaceChildren();games.replaceChildren();
   const byPlace=element('div','swapp-impact-placement');
   byPlace.append(element('h3','','Où SWAPP présente ta chaîne'));
   const places=element('div','swapp-impact-place-items');
   for(const key of ['home','discover','game']){
    const item=element('span','',label[key]+ ' : ');
    const n=body.visible?.placements?.find(row=>row.placement===key);
    item.append(element('strong','',body.visible?.collected?number(n?.value||0):'Non mesuré'));
    places.append(item);
   }
   byPlace.append(places,element('small','','Cartes signalées visibles uniquement, par emplacement.'));
   sources.append(byPlace);
   if(body.games?.length){
    games.append(element('h3','','Jeux associés aux cartes vues'));
    const names=element('ul','');
    for(const game of body.games){
     const li=element('li','');
     li.append(element('span','',game.name),element('strong','',number(game.impressions)+' vues signalées'));
     names.append(li);
    }
    games.append(names);
   }
   if(body.login&&/^[a-z0-9_][a-z0-9_-]{1,39}$/.test(body.login)){
    const programme=element('a','','Mon programme de diffusion');
    programme.href='/'+encodeURIComponent(body.login)+'?tab=programme';
    links.replaceChildren(programme,univers,dashboard);
   }
  };
  async function load(){
   const token=++inflight;
   refresh.disabled=true;
   status.textContent='Vérification des données de la chaîne…';
   try{
    const res=await fetch('/api/creator/impact?days='+select.value,{
     credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}
    });
    const data=await res.json().catch(()=>({}));
    if(token!==inflight||!section.isConnected)return;
    if(!res.ok)throw Error(res.status===401?'Connecte-toi à ton compte SWAPP pour consulter tes statistiques.':
     res.status===403?'La session ne correspond pas au propriétaire de la chaîne.':
     'Mesures indisponibles. Vérifie MySQL et le déploiement Hostinger.');
    render(data);
    status.textContent=!data.enabled?'Mesure désactivée dans la configuration SWAPP.':
     data.sample==='not_collected'?'Les tables de mesure ne sont pas encore disponibles.':
     data.sample==='no_signals'?'Aucun signal enregistré pour cette période. Cela ne signifie pas que personne ne regarde ta chaîne.':
     'Données agrégées disponibles pour ta chaîne SWAPP uniquement.';
   }catch(error){
    if(token!==inflight||!section.isConnected)return;
    status.textContent=error.message||'Mesures temporairement indisponibles.';
    for(const value of Object.values(values))value.textContent='—';
    sources.replaceChildren();games.replaceChildren();
   }finally{if(token===inflight)refresh.disabled=false}
  }
  refresh.addEventListener('click',()=>void load());
  select.addEventListener('change',()=>void load());
  void load();
 }
 function schedule(){
  if(queued)return;
  queued=true;
  requestAnimationFrame(()=>{queued=false;mount()});
 }
 new MutationObserver(schedule).observe(root,{childList:true,subtree:false,attributes:true,attributeFilter:['class']});
 window.addEventListener('popstate',schedule);
 schedule();
})();
