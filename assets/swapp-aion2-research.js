(()=>{'use strict';
 // Local progress suggestion only. No personal data or analytics emitted.
 const form=document.querySelector('[data-ag-cross-form]');
 const output=document.querySelector('[data-ag-cross-result]');
 if(!form||!output)return;
 const $=id=>form.querySelector('#'+id);
 const tiers=[
  {max:1000,title:'Finir les gains gratuits avant de farmer',note:'Histoire et quêtes régionales, donjons scellés, bastions et premiers points Daevanion. Vise environ 1 000 de niveau d’objet.',url:'/guides/aion-2/fin-de-jeu#ilvl-0'},
  {max:1400,title:'Préparer les premières Conquêtes',note:'Cauchemar, équipement adapté et progression permanente, puis donjons dont le butin peut vraiment te faire monter vers 1 400.',url:'/guides/aion-2/fin-de-jeu#ilvl-1000'},
  {max:1900,title:'Consolider ton set, sans supposer Vakron accessible',note:'Teste les seuils de Conquête dans ton client ; des guides donnent des chiffres contradictoires. Remplace d’abord tes pièces les plus faibles.',url:'/guides/aion-2/fin-de-jeu#ilvl-1400'},
  {max:2100,title:'Compléter les cartes Arcana',note:'Travaille la Transcendance de ton palier ; conserve l’énergie d’Od pour un cube utile.',url:'/guides/aion-2/fin-de-jeu#ilvl-1900'},
  {max:2500,title:'Viser les instances d’équipement supérieur',note:'Choisis les Conquêtes qui remplacent vraiment ton équipement ; transfère tes améliorations compatibles.',url:'/guides/aion-2/fin-de-jeu#ilvl-2100'},
  {max:Infinity,title:'Préparer le raid de Sanctuaire',note:'Vise 2 800 de niveau d’objet puis vérifie les conditions d’accès, la survie et les stratégies de groupe.',url:'/guides/aion-2/fin-de-jeu#ilvl-2500'}
 ];
 function safeInt(value,max){const n=Number(value);return Number.isFinite(n)&&n>=0?Math.min(max,Math.floor(n)):null}
 function show(){
  const gear=safeInt($('ag-gear').value,10000),od=safeInt($('ag-od').value,840),cost=safeInt($('ag-cost').value,40);
  if(gear===null||od===null||!cost){output.replaceChildren();const p=document.createElement('p');p.textContent='Saisis deux valeurs positives pour voir le conseil.';output.append(p);return}
  const tier=tiers.find(t=>gear<t.max)||tiers[tiers.length-1];
  const cubes=Math.floor(od/cost),rest=od%cost;
  const title=document.createElement('strong');title.textContent=tier.title;
  const para=document.createElement('p');para.textContent=tier.note;
  const odline=document.createElement('p');odline.textContent='Avec '+od+' Od et des cubes à '+cost+', tu peux ouvrir '+cubes+' cube'+(cubes>1?'s':'')+' et conserver '+rest+' Od, sous réserve des autres limites du donjon. La recharge varie selon les sources : vérifie ton client.';
  const link=document.createElement('a');link.href=tier.url;link.textContent='Voir ce palier en détail ↗';
  output.replaceChildren(title,para,odline,link);
 }
 form.addEventListener('submit',ev=>{ev.preventDefault();show()});
 form.querySelectorAll('input,select').forEach(el=>el.addEventListener('change',show));
 show();
})();