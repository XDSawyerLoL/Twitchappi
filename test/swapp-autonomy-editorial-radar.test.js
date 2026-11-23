'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {buildEditorialRadar, createEditorialRadarService} =
  require('../modules/swapp-autonomy/editorial-radar');
function trend(changes) {
  return {
    state: 'ready', comparable: true, source: 'twitch-helix-fr-first100',
    coverage: 'bounded-provider-sample-not-market-share', ageSeconds: 120,
    sampledAt: '2026-11-20T09:40:00.936Z',
    previousSampledAt: '2026-11-20T09:35:00.936Z',
    games: changes || [
      {game:'Grand Theft Auto VI',gameId:'1867279146',streams:25,observedViewers:21971,
        smallStreams:3,deltaStreams:-1,deltaObservedViewers:192,deltaSmallStreams:0},
      {game:'World of Warcraft',gameId:'18122',streams:7,observedViewers:1337,
        smallStreams:4,deltaStreams:1,deltaObservedViewers:166,deltaSmallStreams:-1},
      {game:'Dofus',gameId:'20596',streams:2,observedViewers:805,
        smallStreams:0,deltaStreams:0,deltaObservedViewers:22,deltaSmallStreams:0}
    ]
  };
}
const pub = (slug,game,more={}) => ({
  status:'published',slug,game,title:'Article '+game,summary:'Texte vérifié',
  publishedAt:'2026-11-18T10:00:00Z',category:'Actualités JV',...more
});
test('comparable observations only: no fake news from a single sample',()=>{
  for(const input of [
    {...trend(),state:'warming',comparable:false},
    {...trend(),state:'stale'}, {...trend(),comparable:false},
    {...trend(),ageSeconds:1000},
    {...trend(),coverage:'global-market-share'}, {...trend(),previousSampledAt:null}
  ]) {
    const value=buildEditorialRadar({trends:input});
    assert.equal(value.state,'awaiting-comparable-samples');
    assert.deepEqual(value.opportunities,[]);
  }
});
test('GTA 6 alias matches only a real published article, never a draft',()=>{
 const result=buildEditorialRadar({trends:trend(),
  articles:[
    pub('gta-vi-lancement-officiel','GTA 6',{title:'GTA VI : lancement officiel'}),
    pub('gta-vi-brouillon','Grand Theft Auto VI',{status:'draft',title:'Confidentiel'}),
    pub('wow-guide-public','World of Warcraft',{category:'Guides',title:'Guide WoW'}),
    pub('wow-guide-nonvalide','World of Warcraft',{status:'withdrawn',category:'Guides',title:'Ancien guide'})
  ]});
 assert.equal(result.state,'ready');assert.equal(result.publicationAuthorized,false);
 assert.deepEqual(result.opportunities.map(x=>x.game),
   ['World of Warcraft','Grand Theft Auto VI','Dofus']);
 const gta=result.opportunities.find(x=>x.game==='Grand Theft Auto VI');
 assert.equal(gta.editorial.relatedArticle.url,'/actus/gta-vi-lancement-officiel');
 assert.equal(gta.editorial.publishedGuide,null);
 assert.equal(gta.editorial.publicationAuthorized,false);
 const wow=result.opportunities[0];
 assert.equal(wow.editorial.publishedGuide.url,'/actus/wow-guide-public');
 assert.equal(wow.editorial.recommendedAction,'review-existing-guide');
 assert.equal(JSON.stringify(result).includes('Confidentiel'),false);
});
test('Aion 2 uses only the real native guide route, no guessed guide routes',()=>{
 const data=trend([{game:'Aion 2',gameId:'aion2',streams:3,observedViewers:80,smallStreams:2,
   deltaStreams:1,deltaObservedViewers:12,deltaSmallStreams:1}]);
 const result=buildEditorialRadar({trends:data});
 assert.equal(result.opportunities[0].editorial.publishedGuide.url,'/guides/aion-2');
 assert.equal(result.opportunities[0].editorial.relatedArticle,null);
});
test('no positive sample change means zero proposals, not invented trends',()=>{
 const data=trend([{game:'Star Citizen',streams:2,observedViewers:100,smallStreams:1,
   deltaStreams:0,deltaObservedViewers:-5,deltaSmallStreams:0}]);
 const result=buildEditorialRadar({trends:data});
 assert.equal(result.state,'ready');assert.equal(result.actionable,false);
 assert.deepEqual(result.opportunities,[]);
});
test('malformed and missing slugs are not exposed as published links',()=>{
 const result=buildEditorialRadar({trends:trend(),articles:[
  pub('invalid/slug','World of Warcraft'),pub('valid-guide','World of Warcraft',{status:'draft'})
 ]});
 assert.equal(result.opportunities[0].editorial.publishedGuide,null);
 assert.equal(result.opportunities[0].editorial.relatedArticle,null);
});
test('read-only service does not query articles while trend is warming',async()=>{
 let calls=0;
 const service=createEditorialRadarService({getTrends:async()=>({...trend(),state:'warming'}),
  loadPublished:async()=>{calls++;return []}});
 const result=await service.report();
 assert.equal(result.state,'awaiting-comparable-samples');assert.equal(calls,0);
});
test('simultaneous public reads share one bounded MySQL catalogue scan',async()=>{
 let calls=0, t=100000;
 const service=createEditorialRadarService({
  getTrends:async()=>trend(),now:()=>t,loadPublished:async()=>{calls++;return [pub('gta6-test','GTA 6')]}
 });
 const results=await Promise.all(Array.from({length:12},()=>service.report()));
 assert.equal(calls,1);
 assert.ok(results.every(x=>x.opportunities[1].editorial.relatedArticle.url==='/actus/gta6-test'));
 t+=599999;await service.report();assert.equal(calls,1);
 t+=2;await service.report();assert.equal(calls,2);
});
test('MySQL catalogue failures are safe and cached temporarily',async()=>{
 let calls=0,t=100000;
 const service=createEditorialRadarService({
  getTrends:async()=>trend(),now:()=>t,
  loadPublished:async()=>{calls++;throw new Error('PRIVATE_SQL_PASSWORD');}
 });
 const a=await service.report(),b=await service.report();
 assert.equal(a.state,'ready');
 assert.equal(a.catalogueStatus,'unavailable');assert.equal(calls,1);
 assert.equal(a.opportunities[1].editorial.relatedArticle,null);
 assert.equal(JSON.stringify(a).includes('PRIVATE_SQL_PASSWORD'),false);
 assert.deepEqual(a,b);
 t+=60001;await service.report();assert.equal(calls,2);
});
test('unrecognized sample source and malformed clocks never authorize publication',()=>{
 assert.throws(()=>buildEditorialRadar({nowMs:-1}),/clock/);
 const a=buildEditorialRadar({trends:{...trend(),source:'untrusted'}});
 assert.equal(a.actionable,false);assert.equal(a.opportunities.length,0);
});

test('unavailable CMS catalogue cannot authorize actionable editorial work',()=>{
 const result=buildEditorialRadar({trends:trend(),articles:[],catalogueStatus:'unavailable'});
 assert.equal(result.state,'ready');
 assert.equal(result.catalogueStatus,'unavailable');
 assert.equal(result.actionable,false);
 assert.equal(result.publicationAuthorized,false);
 assert.ok(result.opportunities.length>0);
 for(const suggestion of result.opportunities){
  assert.equal(suggestion.editorial.relatedArticle,null);
  assert.equal(suggestion.editorial.sourceVerificationRequired,true);
  assert.equal(suggestion.editorial.publicationAuthorized,false);
 }
});
test('radar service fails closed after a published catalogue query error',async()=>{
 const service=createEditorialRadarService({
  getTrends:async()=>trend(),
  loadPublished:async()=>{throw Error('mysql_unavailable');}
 });
 const result=await service.report();
 assert.equal(result.catalogueStatus,'unavailable');
 assert.equal(result.actionable,false);
 assert.equal(result.publicationAuthorized,false);
 assert.equal(JSON.stringify(result).includes('mysql_unavailable'),false);
});
