'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const curation=require('../assets/swapp-live-curation');
const root=path.resolve(__dirname,'..');

test('SWAPP live priority fills the remaining grid slots with real Twitch streams',()=>{
 const swapp=[{host_login:'alpha',title:'SWAPP: live du soir'}];
 const twitch=Array.from({length:11},(_,i)=>({user_login:'twitch'+i,title:'Découverte en direct '+i,viewer_count:i+10}));
 const result=curation.curateHomeLives(swapp,twitch);
 assert.equal(result.nativeCount,1);
 assert.equal(result.twitchCount,11);
 assert.equal(result.items.length,12);
 assert.equal(result.items[0].platform,'swapp');
 assert.equal(result.items[1].platform,'twitch');
});
test('no duplicated creator across native and Twitch results',()=>{
 const result=curation.curateHomeLives([{host_login:'Dup'},{host_login:'native'}],[{user_login:'dup'},{user_login:'fresh'},{user_login:'fresh'}]);
 assert.deepEqual(result.items.map(x=>curation.loginOf(x)),['dup','native','fresh']);
 assert.equal(result.nativeCount,2);
 assert.equal(result.twitchCount,1);
});
test('rediffusions en boucle are not advertised as genuine discovery lives',()=>{
 const result=curation.curateHomeLives([],[{login:'recorded',title:'LIVE 24H / 24H (REDIFFUSIONS EN BOUCLE)'},{login:'real',title:'On découvre le jeu ensemble'}]);
 assert.deepEqual(result.items.map(x=>x.login),['real']);
 assert.equal(result.skippedReplay,1);
 assert.equal(curation.isLoopReplay({title:'Best-of du weekend'}),true);
 assert.equal(curation.isLoopReplay({title:'Marathon 24h pour la communauté'}),false);
});
test('empty/missing data does not invent streams and respects the limit',()=>{
 assert.deepEqual(curation.curateHomeLives(null,null).items,[]);
 const result=curation.curateHomeLives([{login:'valid'}],[{login:'other'}],1);
 assert.equal(result.items.length,1);
 assert.equal(result.twitchCount,0);
});
test('the runtime uses the shared curation logic and loads it before the SPA',()=>{
 const spa=fs.readFileSync(path.join(root,'index_script.js'),'utf8');
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const css=fs.readFileSync(path.join(root,'assets/swapp-art-direction.css'),'utf8');
 assert.match(spa,/SwappLiveCuration\?\.curateHomeLives\(swappItems,twitchItems,12,latestArticleMatches\)/);
 assert.match(spa,/const twitchItems=swappItems\.length<8\?await getTwitchLives\(\):\[\]/);
 assert.match(spa,/const platform = \['swapp','oryon','native'\]\.includes\(rawPlatform\)/);
 assert.ok(html.indexOf('/assets/swapp-live-curation.js?v=20261015-discovery-35')<html.indexOf('/index_script.js?v='));
 assert.match(css,/#home \.homeLiveGrid1014/);
});
