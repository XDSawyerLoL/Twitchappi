/* SWAPP Creator Autopilot — private owner dashboard, no audience tracking. */
(()=>{'use strict';
 const API='/api/creator/autopilot';
 const dashboardId='dashboard';
 const mounted=new WeakSet();
 const el=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x};
 const makeButton=(label,fn)=>{const x=el('button','swapp-auto-button',label);x.type='button';x.addEventListener('click',fn);return x};
 const liveDate=iso=>{
  const date=Date.parse(iso||'');
  return Number.isFinite(date)?new Intl.DateTimeFormat('fr-FR',{dateStyle:'short',timeStyle:'short'}).format(date):'Date inconnue';
 };
 const load=async section=>{
  const body=section.querySelector('[data-swapp-auto-body]');
  if(!body||!section.isConnected)return;
  body.replaceChildren(el('p','swapp-auto-muted','Vérification des réservations et des possibilités…'));
  try{
   const response=await fetch(API,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
   const data=await response.json().catch(()=>({}));
   if(!section.isConnected)return;
   body.replaceChildren();
   if(response.status===401){
    body.append(el('p','swapp-auto-muted','Connecte-toi à ton compte SWAPP pour configurer ta mise en avant.'));
    return;
   }
   if(!response.ok||!data.success)throw Error('Autopilot temporairement indisponible.');
   const line=el('div','swapp-auto-status');
   line.append(el('strong','',data.enabled?'Autopilot activé':'Autopilot désactivé'));
   line.append(el('span','swapp-auto-muted',data.enabled?
    'Les prochains créneaux peuvent être réservés automatiquement si les vérifications passent.':
    'Tu décides si SWAPP peut réserver des Spotlight depuis ton agenda.'));
   body.append(line);
   if(!data.available){
    body.append(el('p','swapp-auto-warning','Fonction pilote non activée sur Hostinger. Aucun créneau automatique n’est créé.'));
   }else if(!data.twitchLinked){
    body.append(el('p','swapp-auto-warning','Relie une chaîne Twitch vérifiée depuis ton tableau de bord Creator avant d’activer Autopilot.'));
   }
   if(data.available&&data.twitchLinked){
    const button=makeButton(data.enabled?'Désactiver l’automatisation':'Activer gratuitement Autopilot',async()=>{
     button.disabled=true;button.textContent='Enregistrement…';
     try{
      const answer=await fetch(API,{method:'POST',credentials:'same-origin',cache:'no-store',
       headers:{Accept:'application/json','Content-Type':'application/json','X-SWAPP-CREATOR-ACTION':'autopilot'},
       body:JSON.stringify({enabled:!data.enabled})});
      const json=await answer.json().catch(()=>({}));
      if(!answer.ok||!json.success)throw Error(json.error||'Échec de la modification');
      await load(section);
     }catch(e){button.disabled=false;button.textContent='Réessayer';
      body.append(el('p','swapp-auto-warning','Modification non confirmée : '+String(e.message||'erreur').slice(0,100)));}
    });
    body.append(button);
   }
   body.append(el('p','swapp-auto-muted','L’activation est volontaire. Aucun message automatique n’est publié dans ton chat Twitch. Le désabonnement arrête les nouvelles réservations mais n’annule pas les créneaux déjà confirmés.'));
   const calendar=Array.isArray(data.programmeSlots)?data.programmeSlots:[];
   const area=el('section','swapp-auto-group');
   area.append(el('h3','','Programme exploitable'));
   if(!calendar.length)area.append(el('p','swapp-auto-muted','Aucun créneau valide à venir. Ajoute des directs datés et un jeu précis dans le programme de ta chaîne.'));
   else{
    const list=el('ul','swapp-auto-list');
    for(const item of calendar){
     const li=el('li','');
     li.append(el('strong','',item.game));
     li.append(el('span','swapp-auto-muted',liveDate(item.start_at)+' · demande de Spotlight soumise à vérification'));
     list.append(li);
    }
    area.append(list);
   }
   body.append(area);
   const actions=Array.isArray(data.automaticActions)?data.automaticActions:[];
   const audit=el('section','swapp-auto-group');
   audit.append(el('h3','','Preuves d’actions'));
   if(!actions.length)audit.append(el('p','swapp-auto-muted','Aucune réservation automatique enregistrée. Aucun spectateur n’est compté sans preuve.'));
   else{
    const list=el('ul','swapp-auto-list');
    for(const item of actions){
     const li=el('li','');
     li.append(el('strong','',item.game));
     li.append(el('span','swapp-auto-muted','Spotlight réservé le '+liveDate(item.start_at)+' · identifiant '+item.spotlight_id));
     list.append(li);
    }
    audit.append(list);
   }
   body.append(audit);
   const d=data.discovery||{};
   const measure=el('section','swapp-auto-group');
   measure.append(el('h3','','Visibilité générée par SWAPP'));
   if(!d.available)measure.append(el('p','swapp-auto-muted','Mesure non disponible ou non activée : aucun chiffre inventé.'));
   else{
    const rows=Array.isArray(d.placements)?d.placements:[];
    if(!rows.length)measure.append(el('p','swapp-auto-muted','Aucune proposition de carte collectée pendant les sept derniers jours.'));
    for(const item of rows)measure.append(el('p','swapp-auto-metric',String(item.proposals||0)+' propositions API · '+String(item.placement||'')));
    measure.append(el('p','swapp-auto-muted',d.warning||'Ces propositions ne sont pas des vues ni des visiteurs.'));
   }
   body.append(measure);
  }catch(_){
   body.replaceChildren(el('p','swapp-auto-warning','Impossible de charger les données Autopilot. Réessaie depuis ton tableau de bord.'));
   body.append(makeButton('Réessayer',()=>load(section)));
  }
 };
 function mount(){
  const dashboard=document.getElementById(dashboardId);
  if(!dashboard||!dashboard.classList.contains('active')||!dashboard.firstElementChild||dashboard.querySelector('[data-swapp-creator-autopilot]'))return;
  const section=el('section','swapp-creator-autopilot');
  section.setAttribute('data-swapp-creator-autopilot','');
  const heading=el('header','swapp-auto-head');
  heading.append(el('span','swapp-auto-kicker','SWAPP CREATOR / AUTOPILOT'));
  const h=el('h2','','SWAPP travaille pour tes prochains directs');h.id='swapp-autopilot-head';
  heading.append(h);
  heading.append(el('p','swapp-auto-muted','Depuis ton agenda, propose automatiquement tes sessions aux Spotlight gratuits des jeux couverts par SWAPP.'));
  section.setAttribute('aria-labelledby',h.id);
  section.append(heading);
  const body=el('div','swapp-auto-content');
  body.setAttribute('data-swapp-auto-body','');
  body.setAttribute('aria-live','polite');
  section.append(body);
  const main=dashboard.querySelector('.swapp-creator-main')||dashboard;
  const twitch=main.querySelector('[data-creator-twitch-link]');
  if(twitch)twitch.insertAdjacentElement('afterend',section);
  else main.prepend(section);
  load(section);
 }
 function init(){
  const dashboard=document.getElementById(dashboardId);
  if(!dashboard)return;
  const next=()=>window.requestAnimationFrame?requestAnimationFrame(mount):mount();
  const observer=new MutationObserver(next);
  observer.observe(dashboard,{attributes:true,attributeFilter:['class'],childList:true,subtree:false});
  document.addEventListener('click',e=>{if(e.target?.closest?.('button[data-view="dashboard"],a[href="/dashboard"]'))next()});
  window.addEventListener('popstate',next);
  next();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
 else init();
})();