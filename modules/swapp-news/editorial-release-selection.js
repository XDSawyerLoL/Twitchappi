'use strict';
// Retain editorial history authority while allowing NEW verified GitHub releases
// on a Hostinger MySQL installation with its former Firestore archive unverified.
// A prior withdrawal stored as a MySQL draft still takes precedence.
const HOSTINGER_CUTOVER_DATE='2026-11-03T00:00:00.000Z';
const {needsQualityGate,reviewPublication}=require('./editorial-quality');
function selectEditorialReleaseCandidates(items,{mysqlMode=false,migrationVerified=false}={}){
 if(!Array.isArray(items))throw Error('news_release_candidate_list_required');
 // After the editorial quality cutover, decline *new* thin releases rather
 // than failing the entire publisher or exposing them from a raw fallback map.
 // Older approved records and all manual Studio decisions remain authoritative.
 const eligible=items.filter(article=>!needsQualityGate(article,{production:true})||
   reviewPublication(article).ready);
 if(!mysqlMode||migrationVerified)return eligible;
 const earliest=Date.parse(HOSTINGER_CUTOVER_DATE);
 return eligible.filter(article=>
  article?.status==='published'&&typeof article.slug==='string'&&
  Number.isFinite(Date.parse(article.publishedAt||''))&&
  Date.parse(article.publishedAt)>=earliest
 );
}
module.exports={selectEditorialReleaseCandidates,HOSTINGER_CUTOVER_DATE};
