'use strict';
// Retain editorial history authority while allowing NEW verified GitHub releases
// on a Hostinger MySQL installation with its former Firestore archive unverified.
// A prior withdrawal stored as a MySQL draft still takes precedence.
const HOSTINGER_CUTOVER_DATE='2026-11-03T00:00:00.000Z';
function selectEditorialReleaseCandidates(items,{mysqlMode=false,migrationVerified=false}={}){
 if(!Array.isArray(items))throw Error('news_release_candidate_list_required');
 if(!mysqlMode||migrationVerified)return items.slice();
 const earliest=Date.parse(HOSTINGER_CUTOVER_DATE);
 return items.filter(article=>
  article?.status==='published'&&typeof article.slug==='string'&&
  Number.isFinite(Date.parse(article.publishedAt||''))&&
  Date.parse(article.publishedAt)>=earliest
 );
}
module.exports={selectEditorialReleaseCandidates,HOSTINGER_CUTOVER_DATE};
