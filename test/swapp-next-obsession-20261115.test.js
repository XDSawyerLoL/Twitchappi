'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pickSurprise}=require('../assets/swapp-live-surprise');
const {genreForGame}=require('../assets/swapp-genre-discovery');
const {catalogueContent,page}=require('../modules/swapp-catalogue-lab');
const {renderIntoSpa}=require('../modules/swapp-catalogue-spa');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const live=(id,game,watchUrl='/live/twitch/'+id)=>({
 kind:'live',id,game,gameSlug:game.toLowerCase().replace(/[^a-z0-9]+/g,'-'),
 watchUrl,name:'Streamer '+id,viewers:15,audienceVerified:true
});

test('random discovery never invents lives, or accepts external/open-redirect watch links',()=>{
 assert.equal(pickSurprise([]),null);
 assert.equal(pickSurprise([live('bad','Valorant','https://example.org')]),null);
 assert.equal(pickSurprise([live('bad','Valorant','//evil.test')]),null);
 assert.equal(pickSurprise([{kind:'game',id:'a',watchUrl:'/game'}]),null);
 const result=pickSurprise([live('alpha','Valorant'),live('beta','Aion 2')],{random:()=>0});
 assert.equal(result.id,'alpha');
 assert.equal(result.watchUrl,'/live/twitch/alpha');
 assert.equal(result.viewers,15);
});

test('random creator avoids recently shown streams, and remains fair across game groups',()=>{
 const sources=[live('a1','Valorant'),live('a2','Valorant'),
  live('a3','Valorant'),live('b1','Aion 2')];
 assert.equal(pickSurprise(sources,{random:()=>.999}).id,'b1');
 assert.equal(pickSurprise(sources,{recentIds:['a1'],random:()=>0}).id,'a2');
 assert.equal(pickSurprise(sources,{recentIds:['a1','a2','a3'],random:()=>0}).id,'b1');
 const exhausted=pickSurprise([live('only','Valorant')],{recentIds:['only'],random:()=>.5});
 assert.equal(exhausted.id,'only');
 assert.equal(pickSurprise(sources,{random:()=>Number.NaN}).id,'a1');
});

test('random discovery honors user-selected genre without manufacturing a stream',()=>{
 const sources=[live('a','Valorant'),live('b','Aion 2'),live('c','Forza Horizon 5')];
 const mmorpg=pickSurprise(sources,{genre:'mmorpg',genreForGame,random:()=>0});
 assert.equal(mmorpg.id,'b');
 const course=pickSurprise(sources,{genre:'course',genreForGame,random:()=>0});
 assert.equal(course.id,'c');
 assert.equal(pickSurprise(sources,{genre:'horreur',genreForGame}),null);
});

test('next obsession is a real homepage feature before the live carousel in native and SPA',()=>{
 const homepage=catalogueContent({publicHome:true});
 const ordered=['scl-feature','scl-surprise','scl-live','scl-genres','scl-top-games'];
 for(const id of ordered)assert.ok(homepage.includes('id="'+id+'"'),id);
 for(let i=1;i<ordered.length;i++)
  assert.ok(homepage.indexOf('id="'+ordered[i-1]+'"')<homepage.indexOf('id="'+ordered[i]+'"'));
 assert.match(homepage,/Trouvez votre prochaine obsession/);
 assert.match(homepage,/data-scl-section="live"/);
 assert.match(homepage,/id="scl-surprise-pick"/);
 assert.match(homepage,/id="scl-surprise-watch" disabled/);
 const native=page({publicHome:true});
 const spa=renderIntoSpa(read('index.html'));
 for(const doc of [native,spa]){
  const discovery=doc.indexOf('swapp-live-surprise.js?v=20261115-obsession-v1');
  const catalogue=doc.indexOf('swapp-catalogue-lab.js?v=20261115-hidpi-posters-v30');
  assert.ok(discovery>=0&&catalogue>discovery,'shuffle picker script loads before catalogue');
  assert.match(doc,/swapp-catalogue-lab\.css\?v=20261115-hidpi-covers-v25/);
  assert.match(doc,/Trouvez votre prochaine obsession/);
 }
});

test('the actual client picks only normalized live sessions and provides usable buttons',()=>{
 const js=read('assets/swapp-catalogue-lab.js');
 assert.match(js,/const surpriseApi=typeof window/);
 assert.match(js,/const pool=state\.lives\.filter\(item=>item\.kind==='live'&&matching\(item\)\)/);
 assert.match(js,/surpriseApi\?\.pickSurprise\(pool/);
 assert.match(js,/surpriseHistory=\[\.\.\.surpriseHistory,surpriseCurrent\.id\]\.slice\(-8\)/);
 assert.match(js,/renderSurprise\(\)/);
 assert.match(js,/renderSurprise\(true\)/);
 assert.match(js,/watch\(surpriseCurrent\)/);
 assert.match(js,/surpriseCurrent&&pool\.some\(item=>item\.id===surpriseCurrent\.id\)/);
 assert.match(js,/shuffle\.disabled=true/);
});

test('sharp visuals: 1280-pixel Twitch hero art; black nonblurred discovery and covers',()=>{
 const js=read('assets/swapp-catalogue-lab.js');
 const css=read('assets/swapp-catalogue-lab.css');
 assert.match(js,/function largeHeroImage\(image\)/);
 assert.match(js,/'-1280x720'/);
 assert.match(js,/largeHeroImage\(item\.image\)/);
 assert.match(css,/#swapp-catalogue-lab \.scl-surprise\{/);
 assert.match(css,/background:#050506/);
 assert.match(css,/#swapp-catalogue-lab \.scl-surprise-art img\{/);
 assert.match(css,/object-fit:cover/);
 assert.match(css,/filter:none!important;image-rendering:auto/);
 assert.match(css,/\.scl-feature-vignette\{/);
 assert.match(css,/backdrop-filter:none!important/);
 assert.match(css,/@media\(max-width:650px\)/);
});
