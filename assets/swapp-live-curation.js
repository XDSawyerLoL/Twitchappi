'use strict';
/* Homepage curation: published games -> genuinely live creators, one existing grid.
 * Exact game metadata is preferred; article-title matching is strictly bounded.
 * No AI guess, invented game association or extra homepage section.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.SwappLiveCuration=api;
})(typeof window!=='undefined'?window:null,function(){
 function loginOf(item){
  const x=item||{};
  return String(x.host_login||x.login||x.room||x.channel||x.user_login||x.broadcaster_login||x.user_name||'')
   .trim().toLowerCase().replace(/^@/,'').replace(/[^a-z0-9_-]/g,'').slice(0,64);
 }
 function isLoopReplay(item){
  const title=String(item?.title||item?.live_title||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  return /\b(rediffusions?|replays?|reruns?|vods?|best[ -]?of)\b|en\s+boucle/.test(title);
 }
 function gameText(value){
  if(typeof value==='string')return value.trim();
  if(value&&typeof value==='object')return String(value.name||value.label||'').trim();
  return '';
 }
 function normalizeGame(text){
  return gameText(text).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
   .replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
 }
 const genericGames=new Set(['jeux video','jeu video','gaming','actualites','actualite','actus','news','twitch','swapp','pc','console','playstation','xbox','nintendo','just chatting','discussion','art','musique','music']);
 function streamGame(item){
  const x=item||{};
  return gameText(x.game_name||x.gameName||x.game||x.category);
 }
 function articleGame(article){
  return gameText(article?.game||article?.game_name||article?.gameName);
 }
 function matchLiveToArticle(live,articles){
  const game=streamGame(live);
  const normalized=normalizeGame(game);
  if(normalized.length<4||genericGames.has(normalized))return null;
  if(!Array.isArray(articles))return null;
  let best=null;
  for(let i=0;i<Math.min(12,articles.length);i++){
   const article=articles[i]||{};
   const slug=String(article.slug||'').trim();
   if(!/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(slug))continue;
   const title=String(article.title||'').trim();
   if(!title)continue;
   const direct=normalizeGame(articleGame(article))===normalized;
   // If a game field is not provided, only use an explicit, whole-title
   // mention of the actual Twitch/SWAPP game (never category-only guessing).
   const titleNorm=' '+normalizeGame(title)+' ';
   const token=' '+normalized+' ';
   const at=titleNorm.indexOf(token);
   const after=at<0?'':titleNorm.slice(at+token.length).trim().split(' ')[0];
   // Do not confuse a current game's title with a differently numbered sequel.
   const sequel=new Set(['2','3','4','5','ii','iii','iv','v']);
   const inTitle=!articleGame(article)&&at>=0&&!sequel.has(after);
   if(!direct&&!inTitle)continue;
   const score=(direct?200:100)+(Math.max(0,12-i));
   if(!best||score>best.score)best={slug,title,game,score};
  }
  return best;
 }
 function featuredGames(articles,limit=2){
  const games=[],seen=new Set();
  for(const article of Array.isArray(articles)?articles.slice(0,8):[]){
   const game=articleGame(article);
   const normalized=normalizeGame(game);
   if(normalized.length<4||genericGames.has(normalized)||seen.has(normalized))continue;
   if(!/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(String(article?.slug||'')))continue;
   seen.add(normalized);
   games.push(game);
   if(games.length>=limit)break;
  }
  return games;
 }
 function curateHomeLives(swappItems,twitchItems,limit=12,articles=[],privateScores={}){
  const out=[],seen=new Set();
  let nativeCount=0,twitchCount=0,skippedReplay=0;
  // Personalisation is a small, bounded tie-breaker below verified editorial
  // relevance. SWAPP natives are always ordered before any Twitch stream.
  const tasteScore=item=>{
   const game=normalizeGame(streamGame(item));
   const raw=privateScores&&Object.prototype.hasOwnProperty.call(privateScores,game)?Number(privateScores[game]):0;
   return genericGames.has(game)||!Number.isFinite(raw)?0:Math.min(40,Math.max(0,raw)*8);
  };
  const sorted=items=>items.map((item,index)=>({
    item,index,match:matchLiveToArticle(item,articles),preference:tasteScore(item)
   })).sort((a,b)=>(b.match?.score||0)-(a.match?.score||0)
    ||b.preference-a.preference||a.index-b.index);
  const add=(item,platform,match)=>{
   const login=loginOf(item);
   if(!login||seen.has(login)||out.length>=limit)return;
   seen.add(login);
   out.push({...item,platform,...(match?{swappNewsMatch:{slug:match.slug,title:match.title,game:match.game}}:{})});
   if(platform==='swapp')nativeCount++;
   else twitchCount++;
  };
  for(const {item,match} of sorted(Array.isArray(swappItems)?swappItems:[]))add(item,'swapp',match);
  for(const {item,match} of sorted((Array.isArray(twitchItems)?twitchItems:[]).filter(item=>{
   if(isLoopReplay(item)){skippedReplay++;return false;}
   return true;
  })))add(item,'twitch',match);
  return {items:out,nativeCount,twitchCount,skippedReplay,matchedCount:out.filter(item=>item.swappNewsMatch).length};
 }
 return Object.freeze({curateHomeLives,isLoopReplay,loginOf,matchLiveToArticle,normalizeGame,featuredGames});
});
