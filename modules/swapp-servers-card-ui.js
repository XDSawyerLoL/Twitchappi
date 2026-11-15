'use strict';
const {inviteCode}=require('./swapp-servers-discord');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const format=n=>Number(n).toLocaleString('fr-FR');
const numeric=n=>n===null||n===undefined||n===''?null:Number.isSafeInteger(Number(n))&&Number(n)>=0?Number(n):null;
function cardSignals(s){
 const reviewCount=numeric(s.reviewCount),rating=Number(s.ratingAverage);
 const rated=reviewCount>0&&Number.isFinite(rating)&&rating>=1&&rating<=5;
 const rateText=rated?rating.toFixed(1).replace('.',',')+'/5 · '+format(reviewCount)+' avis':reviewCount===0?'Aucun avis':'Avis indisponibles';
 const score=rated?Math.round(rating*20):0;
 const ratingHtml='<div class="ss-card-rating" aria-label="'+esc(rateText)+'"><span class="ss-rating-stars" style="--ss-fill:'+score+'%" aria-hidden="true">★★★★★</span><span>'+esc(rateText)+'</span></div>';
 const facts=[];
 const add=(text,label)=>facts.push('<span class="ss-card-fact"><strong>'+esc(text)+'</strong><small>'+esc(label)+'</small></span>');
 const votes=numeric(s.votes_month),clicks=numeric(s.clicksTotal),lfg=numeric(s.lfgCount);
 if(votes!==null)add(format(votes),'votes ce mois');
 if(clicks!==null)add(format(clicks),'clics SWAPP');
 if(inviteCode(s.website||'')){
  const members=numeric(s.discordMembers),online=numeric(s.discordOnline);
  if(members!==null)add('≈ '+format(members),'membres Discord');
  if(online!==null)add('≈ '+format(online),'en ligne Discord');
  if(members===null&&online===null)add('Indisponible','effectif Discord');
 }else{
  const capacity=numeric(s.capacity);
  add(capacity!==null&&capacity>0?format(capacity):'Non renseignée','capacité / slots');
 }
 if(lfg!==null)add(format(lfg),'joueurs disponibles');
 return {ratingHtml,factsHtml:'<div class="ss-card-facts">'+facts.join('')+'</div>'};
}
module.exports={cardSignals};
