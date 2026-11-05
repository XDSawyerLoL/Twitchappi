'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {SLUG,validateEpisode,publicEpisodes,home,episodePage,mp3Exists}=require('../modules/swapp-on-air');
const src={slug:'on-air-premiere-demo',title:'Nova et Kern découvrent un jeu indépendant',
 description:'Un épisode test vérifié avec une mise en contexte, une discussion et des sources officielles.',
 durationSec:123,audio:'on-air-premiere-demo.mp3',status:'published',audioReviewed:true,editorialApproved:true,
 publishedAt:'2026-11-05T12:00:00.000Z',reviewedAt:'2026-11-05T11:00:00.000Z',
 sources:[{label:'Annonce du studio',url:'https://example.com/game'}],articles:['/actus/un-jeu-independant']};
function fixture(){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'swapp-on-air-'));
 const mp3=path.join(temp,src.audio);
 fs.writeFileSync(mp3,Buffer.concat([Buffer.from('ID3'),Buffer.alloc(35000)]));
 return {temp,mp3,clean(){fs.rmSync(temp,{recursive:true,force:true})}};
}
test('Empty source catalog cannot produce pretend audio players',()=>{
 const h=home([]);
 assert.match(h,/SWAPP ON AIR/);
 assert.match(h,/Pas encore d’enregistrement validé/);
 assert.doesNotMatch(h,/<audio/);
 assert.equal(episodePage('made-up-episode',[]),null);
});
test('Public listing never shows a non-approved or absent podcast',()=>{
 const f=fixture();
 try{
  assert.equal(mp3Exists(f.mp3),true);
  assert.ok(validateEpisode(src,{mediaDir:f.temp}));
  assert.equal(validateEpisode({...src,status:'draft'},{mediaDir:f.temp}),null);
  assert.equal(validateEpisode({...src,audioReviewed:false},{mediaDir:f.temp}),null);
  assert.equal(validateEpisode({...src,editorialApproved:false},{mediaDir:f.temp}),null);
  assert.equal(validateEpisode({...src,audio:'../../stolen.mp3'},{mediaDir:f.temp}),null);
  assert.equal(validateEpisode({...src,slug:'../evil'},{mediaDir:f.temp}),null);
  fs.unlinkSync(f.mp3);
  assert.equal(validateEpisode(src,{mediaDir:f.temp}),null);
 }finally{f.clean()}
});
test('No fake media link or path traversal in the public manifest',()=>{
 const f=fixture();
 try{
  const list=path.join(f.temp,'index.json');
  fs.writeFileSync(list,JSON.stringify({schema:1,episodes:[
   {...src,title:'Nova <script>alert(1)</script> présente le jeu'},
   {...src,slug:'../../escape',audio:'../../escape.mp3'},
   {...src,status:'draft'}]}));
  const items=publicEpisodes({index:list,mediaDir:f.temp});
  assert.equal(items.length,1);
  assert.equal(items[0].audioUrl,'/assets/on-air/on-air-premiere-demo.mp3');
  const page=episodePage(items[0].slug,items);
  assert.match(page,/<audio controls preload="none"/);
  assert.doesNotMatch(page,/<script>alert\(1\)<\/script>/);
  assert.match(page,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(page,/Annonce du studio/);
 }finally{f.clean()}
});
test('An absent or spoofed MP3 is never considered playable',()=>{
 const f=fixture();
 try{
  fs.writeFileSync(f.mp3,Buffer.alloc(35000,65));
  assert.equal(mp3Exists(f.mp3),false);
  fs.unlinkSync(f.mp3);
  assert.equal(mp3Exists(f.mp3),false);
 }finally{f.clean()}
});
test('Navigation exposes a stable ON AIR entry on desktop and mobile',()=>{
 const n=require('../assets/swapp-navigation');
 const desktop=n.serverHeader('onair'),mobile=n.serverMobile('onair');
 assert.match(desktop,/href="\/on-air"/);
 assert.match(mobile,/href="\/on-air"/);
 assert.match(desktop,/Podcast ON AIR/);
 assert.match(mobile,/Podcast ON AIR/);
 assert.match(desktop,/href="\/actus"/);
});
test('ON AIR route is server rendered and does not expose unapproved assets via API',()=>{
 const code=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
 assert.match(code,/app.get\('\/on-air'/);
 assert.match(code,/app.get\('\/on-air\/:slug'/);
 assert.match(code,/swappOnAir\.publicEpisodes\(\)/);
 assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../modules/swapp-on-air.js'),'utf8'),/googleapis|elevenlabs|stripe|openai\.com/);
});
