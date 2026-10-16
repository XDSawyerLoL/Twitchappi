/* Editorial-only dashboard. No user IDs, cookies, individual votes or analytics SDK. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 const labels={useful:'Utile',sourced:'Bien documenté',engaging:'Intéressant'};
 const number=v=>Number(v||0).toLocaleString('fr-FR');
 const score=v=>Number.isFinite(Number(v))&&v!=null
  ?Number(v).toLocaleString('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:1})+'/5':'—';
 const node=(tag,klass,value)=>{
  const el=document.createElement(tag);if(klass)el.className=klass;
  if(value!=null)el.textContent=String(value);return el;
 };
 let pending=false;
 async function refresh(){
  if(pending)return;
  const root=$('ed-insight-table'),status=$('ed-insight-status'),button=$('ed-insight-refresh');
  if(!root||!status||!button)return;
  pending=true;button.disabled=true;status.textContent='Actualisation des retours…';
  try{
   const r=await fetch('/api/editor/actus/insights',{
    credentials:'same-origin',headers:{Accept:'application/json','X-SWAPP-Editor':'1'},
    cache:'no-store'
   });
   if(!r.ok)throw Error(r.status===401||r.status===403
    ?'Accès réservé à la rédaction SWAPP.':'Statistiques momentanément indisponibles.');
   const result=await r.json();
   $('ed-insight-votes').textContent=number(result.totalVotes);
   $('ed-insight-articles').textContent=number(result.ratedArticles)+' / '+number(result.publishedArticles);
   $('ed-insight-average').textContent=score(result.average);
   const reasons=$('ed-insight-reasons');reasons.replaceChildren();
   for(const key of Object.keys(labels)){
    const value=Number(result.reasons?.[key])||0;
    const cell=node('div','swapp-insight-reason');
    cell.append(node('strong','',number(value)),node('span','',labels[key]));
    reasons.append(cell);
   }
   root.replaceChildren();
   const rows=Array.isArray(result.articles)?result.articles:[];
   for(const item of rows){
    const tr=node('tr');
    const title=node('td'),link=node('a','',item.title||'Article SWAPP');
    link.href='/actus/'+encodeURIComponent(item.slug);
    link.target='_blank';link.rel='noopener noreferrer';
    title.append(link);
    if(item.game)title.append(node('small','',item.game));
    const count=node('td','swapp-insight-numeric',number(item.count));
    const average=node('td','swapp-insight-numeric',score(item.average));
    const top=Object.entries(labels).map(([key,label])=>({
     label,count:Number(item.reasons?.[key])||0
    })).sort((a,b)=>b.count-a.count)[0];
    const detail=node('td','',top?.count&&item.count>=5
     ?top.label+' ('+number(top.count)+')':'—');
    tr.append(title,count,average,detail);root.append(tr);
   }
   if(!rows.length){
    const tr=node('tr'),td=node('td','','');
    td.colSpan=4;td.textContent='Aucun article natif publié à analyser.';
    tr.append(td);root.append(tr);
   }
   status.textContent=result.partial
    ?'Résultats partiels : limite de lecture atteinte (500 documents par collection).'
    :'Données agrégées mises à jour. Les articles encore dépendants de JustPlayer sont exclus jusqu’à leur migration.';
  }catch(error){
   status.textContent=error.message;
  }finally{pending=false;button.disabled=false}
 }
 function init(){
  $('ed-insight-refresh')?.addEventListener('click',refresh);
  // The existing Studio controller switches tabs first; then this delegated handler runs.
  document.addEventListener('click',event=>{
   if(event.target.closest?.('[data-go="insights"]'))refresh();
  });
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
 else init();
})();