'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const privacy=require('../assets/swapp-local-tastes');
const curation=require('../assets/swapp-live-curation');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const oneDay=86400000;
function storage(){
 const db=new Map();
 return {
  db,
  getItem:k=>db.has(k)?db.get(k):null,
  setItem:(k,v)=>{db.set(k,String(v))},
  removeItem:k=>db.delete(k)
 };
}

test('explicit game choices are the only stored interests; never creators, identity or history',()=>{
 const st=storage(),user=privacy.createStore(st,()=>Date.UTC(2026,9,15));
 assert.equal(user.record('Just Chatting'),false);
 assert.equal(user.record('Twitch'),false);
 assert.equal(user.record('Fortnite'),true);
 assert.equal(user.record('Baldur’s Gate 3'),true);
 const raw=st.db.get(privacy.KEY);
 const saved=JSON.parse(raw);
 assert.equal(saved.length,2);
 assert.deepEqual(saved.map(x=>x.g).sort(),['baldur s gate 3','fortnite']);
 assert.equal(Object.keys(saved[0]).sort().join(','),'d,g,p');
 for(const field of ['userId','ip','url','timestamp','login','creator','article','session']){
  assert.doesNotMatch(raw,new RegExp('"'+field+'"','i'));
 }
 assert.ok(!/fetch\(|sendBeacon|XMLHttpRequest|\.cookie|indexedDB/i.test(read('assets/swapp-local-tastes.js')));
});

test('history stays bounded to 8 games with per-game counts capped at 5',()=>{
 const st=storage(),user=privacy.createStore(st,()=>Date.UTC(2026,9,15));
 for(let i=0;i<20;i++)user.record('Game '+i+' Ultra');
 for(let i=0;i<12;i++)user.record('Game 19 Ultra');
 const rows=JSON.parse(st.db.get(privacy.KEY));
 assert.equal(rows.length,8);
 assert.equal(rows[0].g,'game 19 ultra');
 assert.equal(rows[0].p,5);
 assert.ok(rows.every(x=>x.g.length<=64&&x.p<=5));
});

test('scores decay over time, and interests expire after 30 days',()=>{
 const st=storage();let date=Date.UTC(2026,9,15);
 const user=privacy.createStore(st,()=>date);
 user.record('Elden Ring');
 user.record('Elden Ring');
 assert.equal(user.getScores()['elden ring'],2);
 date+=15*oneDay;
 assert.equal(user.getScores()['elden ring'],.8);
 date+=15*oneDay;
 assert.deepEqual(user.getScores(),{});
});

test('disable erases history and prevents new interest recording until reenabled',()=>{
 const st=storage(),user=privacy.createStore(st,()=>Date.UTC(2026,9,15));
 user.record('Fortnite');
 user.setEnabled(false);
 assert.equal(user.isEnabled(),false);
 assert.equal(st.db.has(privacy.KEY),false);
 assert.equal(user.record('Elden Ring'),false);
 assert.deepEqual(user.getScores(),{});
 user.setEnabled(true);
 assert.equal(user.isEnabled(),true);
 assert.deepEqual(user.getScores(),{});
 user.record('Hades');
 user.clear();
 assert.equal(st.db.has(privacy.KEY),false);
});

test('privacy mode or quota errors degrade safely without blocking recommendations',()=>{
 const bad={
  getItem:()=>{throw Error('SecurityError')},
  setItem:()=>{throw Error('QuotaExceededError')},
  removeItem:()=>{throw Error('SecurityError')}
 };
 const user=privacy.createStore(bad,()=>Date.UTC(2026,9,15));
 assert.deepEqual(user.getScores(),{});
 assert.equal(user.record('Fortnite'),false);
 assert.doesNotThrow(()=>user.setEnabled(false));
 assert.doesNotThrow(()=>user.clear());
 const st=storage();st.setItem(privacy.KEY,'broken json');
 assert.deepEqual(privacy.createStore(st).getScores(),{});
});

test('local preferences improve relevant live ordering, but never displace SWAPP or article matches',()=>{
 const news=[{slug:'elden-ring-news',game:'Elden Ring',title:'Elden Ring DLC'}];
 const swapp=[{host_login:'native-fortnite',game_name:'Fortnite'},{host_login:'native-news',game_name:'Elden Ring'}];
 const twitch=[
  {login:'other',game_name:'Rocket League'},
  {login:'preferred',game_name:'Fortnite'},
  {login:'editorial',game_name:'Elden Ring'}
 ];
 const prefs={'fortnite':5};
 const r=curation.curateHomeLives(swapp,twitch,12,news,prefs);
 assert.deepEqual(r.items.map(x=>curation.loginOf(x)),[
  'native-news','native-fortnite','editorial','preferred','other'
 ]);
 assert.equal(r.items[0].platform,'swapp');
 assert.equal(r.items[2].swappNewsMatch.slug,'elden-ring-news');
 const unchanged=curation.curateHomeLives(swapp,twitch,12,news,{});
 assert.deepEqual(unchanged.items.map(x=>curation.loginOf(x)),[
  'native-news','native-fortnite','editorial','other','preferred'
 ]);
});

test('no additional section or passive impression tracking is introduced',()=>{
 const html=read('index.html'),spa=read('index_script.js');
 const editorial=read('assets/swapp-home-news.js'),actus=read('assets/swapp-actus-app.js');
 const menu=read('assets/swapp-account-menu.js');
 assert.ok(html.indexOf('/assets/swapp-local-tastes.js?')<html.indexOf('/index_script.js?'));
 assert.match(spa,/SwappLocalTastes\?\.getScores\?\.\(\)/);
 assert.match(spa,/SwappLocalTastes\?\.record\?\.\(n\.game\)/);
 assert.match(editorial,/SwappLocalTastes\?\.record\?\.\(game\)/);
 assert.match(actus,/SwappLocalTastes\?\.record\?\.\(a\.game\)/);
 assert.match(menu,/tastes\.setEnabled/);
 assert.match(menu,/tastes\.clear\(\)/);
 assert.match(menu,/Recommandations locales/);
 assert.doesNotMatch(spa,/swapp-taste-hero-new-panel/);
 assert.doesNotMatch(editorial,/automaticTasteTracking|scrollTasteTracking/);
});
