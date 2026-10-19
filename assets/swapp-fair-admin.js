/* SWAPP / Fair Discovery admin. Read-only. No cookies beyond existing session,
 * no external analytics, no per-creator visitor records. */
(()=>{
 'use strict';
 const root=document.getElementById('fair-admin-root');
 if(!root)return;
 const id=name=>document.getElementById('fair-'+name);
 const fmt=n=>Number(n||0).toLocaleString('fr-FR');
 const pct=n=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('fr-FR',{maximumFractionDigits:1})+' %':'—';
 const bands={small:'Petites audiences · 0–25',growing:'En développement · 26–100',established:'Audiences établies · +100'};
 const create=(tag,cls,content)=>{
  const el=document.createElement(tag);
  if(cls)el.className=cls;
  if(content!==undefined)el.textContent=String(content);
  return el;
 };
 let requestId=0;
 function showMessage(heading,description){
  id('data').hidden=true;id('empty').hidden=false;
  id('empty-title').textContent=heading;
  id('empty-description').textContent=description;
 }
 function bar(value,maximum,{small=false}={}){
  const track=create('div','fair-bar-track'),fill=create('div','fair-bar-fill'+(small?' is-small':''));
  fill.style.width=(maximum>0?Math.min(100,Math.max(0,100*value/maximum)):0)+'%';
  track.append(fill);return track;
 }
 function renderCohorts(data){
  const target=id('cohorts');target.replaceChildren();
  const rows=Array.isArray(data.bands)?data.bands:[];
  for(const name of ['small','growing','established']){
   const d=rows.find(x=>x.name===name),available=d?.sample==='limited-voluntary';
   const row=create('article','fair-bar-item');
   const heading=create('div','fair-bar-caption');
   heading.append(create('strong','',bands[name]),
    create('span','',available?pct(d.share):'Données insuffisantes'));
   row.append(heading);
   if(available){
    row.append(bar(d.share,100,{small:name==='small'}));
    row.append(create('small','fair-bar-detail',fmt(d.impressions)+' impressions · '+fmt(d.clicks)+' clics · '+pct(d.clickRate)+' taux de clic'));
   }else row.append(create('small','fair-bar-detail','Seuil de confidentialité non atteint pour ce groupe.'));
   target.append(row);
  }
 }
 function renderTrend(data){
  const target=id('trend');target.replaceChildren();
  const days=Array.isArray(data.trend)?data.trend:[];
  if(!days.length){target.append(create('p','fair-muted','Aucune journée avec mesure volontaire.'));return}
  const max=Math.max(1,...days.filter(x=>x.sample==='limited-voluntary').map(x=>x.impressions||0));
  for(const d of days){
   const available=d.sample==='limited-voluntary';
   const date=create('time','',String(d.day||'').slice(5));
   date.dateTime=d.day;
   const line=create('div','fair-trend-row');
   const amount=available?fmt(d.impressions):'Masqué';
   const track=available?bar(d.impressions,max):create('div','fair-bar-track is-muted');
   const labels=create('span','fair-trend-value',amount);
   const smallShare=create('span','fair-trend-share',available&&typeof d.smallShare==='number'?pct(d.smallShare)+' petits':'—');
   line.append(date,track,labels,smallShare);target.append(line);
  }
 }
 function renderGames(data){
  const target=id('games');target.replaceChildren();
  const items=Array.isArray(data.games)?data.games:[];
  if(!items.length){
   target.append(create('p','fair-muted','Aucun jeu n’a encore atteint les seuils nécessaires à un affichage fiable.'));return;
  }
  const max=Math.max(1,...items.map(x=>x.impressions));
  items.forEach((game,index)=>{
   const article=create('article','fair-game');
   const position=create('span','fair-game-rank',String(index+1).padStart(2,'0'));
   const detail=create('div','fair-game-content');
   const top=create('div','fair-game-title');
   top.append(create('strong','',game.name),create('span','',fmt(game.impressions)+' impressions'));
   detail.append(top,bar(game.impressions,max),create('small','',fmt(game.clicks)+' clics · '+pct(game.clickRate)+' taux de clic'));
   article.append(position,detail);target.append(article);
  });
 }
 async function refresh(){
  const turn=++requestId,button=id('refresh');
  button.disabled=true;id('status').textContent='Actualisation des agrégats…';
  try{
   const response=await fetch('/api/editor/fair-discovery?days='+id('period').value+'&placement='+id('placement').value,{
    credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}
   });
   const body=await response.json().catch(()=>({}));
   if(turn!==requestId)return;
   if(!response.ok)throw Error(response.status===403?'Accès administrateur refusé. Vérifie ton compte SWAPP.':'Statistiques temporairement indisponibles. Vérifie MySQL et le déploiement.');
   if(!body.enabled){
    showMessage('Mesure non activée','Le dispositif Fair Discovery est désactivé sur ce serveur. Les autres fonctions de SWAPP ne sont pas affectées.');
    id('status').textContent='Mesure désactivée';return;
   }
   if(body.sample!=='limited-voluntary'){
    showMessage('Échantillon encore insuffisant','Le tableau de bord attend au moins 50 impressions volontaires et 5 créateurs distincts sur la période sélectionnée. Les données trop faibles restent masquées.');
    id('status').textContent='Collecte activée · publication des statistiques différée';return;
   }
   id('empty').hidden=true;id('data').hidden=false;
   id('impressions').textContent=fmt(body.totals.impressions);
   id('clicks').textContent=fmt(body.totals.clicks);
   id('creators').textContent=fmt(body.totals.creators);
   id('ctr').textContent=pct(body.totals.clickRate);
   renderCohorts(body);renderTrend(body);renderGames(body);
   id('status').textContent='Données agrégées sur '+body.periodDays+' jours · échantillon volontaire · données trop faibles masquées';
  }catch(error){
   if(turn!==requestId)return;
   showMessage('Tableau de bord indisponible',error.message||'Impossible de récupérer les statistiques.');
   id('status').textContent='Erreur de chargement';
  }finally{if(turn===requestId)button.disabled=false}
 }
 id('period').addEventListener('change',refresh);
 id('placement').addEventListener('change',refresh);
 id('refresh').addEventListener('click',refresh);
 refresh();
})();