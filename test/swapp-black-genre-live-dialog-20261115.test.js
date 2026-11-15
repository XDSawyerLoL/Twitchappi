'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createGenreCatalogue,SEEDS}=require('../modules/swapp-genre-catalogue');
const {GENRES,genreForGame}=require('../assets/swapp-genre-discovery');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const twitch=(id,name)=>({
 id:String(id),name,box_art_url:'https://static-cdn.jtvnw.net/ttv-boxart/'+id+'-{width}x{height}.jpg'
});
const racing={
 Forza:[twitch(1,'Forza Horizon 5'),twitch(2,'Forza Motorsport')],
 'Need for Speed':[twitch(3,'Need for Speed Heat'),twitch(4,'Need for Speed Unbound')],
 'F1 20':[twitch(5,'F1 24'),twitch(6,'F1 25')],
 'Gran Turismo':[twitch(7,'Gran Turismo 7')],
 'Assetto Corsa':[twitch(8,'Assetto Corsa Competizione')],
 'Mario Kart':[twitch(9,'Mario Kart 8 Deluxe')],
 Trackmania:[twitch(10,'Trackmania')],
 'The Crew':[twitch(11,'The Crew Motorfest')],
 iRacing:[twitch(12,'iRacing')],
 WRC:[twitch(13,'WRC Generations')],
 'DiRT Rally':[twitch(14,'DiRT Rally 2.0')],
 Burnout:[twitch(15,'Burnout Paradise')]
};
test('Twitch category searches cover every editorial genre but not fabricated items',()=>{
 const expected=GENRES.map(g=>g.id).filter(id=>id!=='autres');
 assert.deepEqual(Object.keys(SEEDS).sort(),expected.sort());
 assert.ok(SEEDS.course.length>=10,'race catalog uses several real search terms');
 for(const [seed,entries] of Object.entries(racing))
  for(const item of entries)assert.equal(genreForGame(item.name),'course',seed+': '+item.name);
});
test('Course obtains more than two independently verified real game categories',async()=>{
 const calls=[];
 const service=createGenreCatalogue(async path=>{
  calls.push(path);
  const seed=Object.keys(racing).find(name=>path.includes(encodeURIComponent(name)));
  return {data:[...(racing[seed]||[]),twitch('other','Just Chatting'),
    twitch('other2','Valorant')]};
 });
 const result=await service.get('course');
 assert.ok(result.length>=12,'Twitch search should populate racing better than top games');
 assert.ok(result.every(item=>genreForGame(item.name)==='course'));
 assert.ok(result.every(item=>item.box_art_url.includes('360x480')));
 assert.equal(new Set(result.map(item=>item.id)).size,result.length);
 assert.equal(calls.length,SEEDS.course.length,'each seed queries Twitch only once');
 const cached=await service.get('course');
 assert.deepEqual(cached,result);
 assert.equal(calls.length,SEEDS.course.length,'cache prevents repeated Twitch searches');
});
test('inflight duplicate requests share a single API series and invalid genre costs nothing',async()=>{
 let calls=0;
 const catalogue=createGenreCatalogue(async()=>{calls++;return {data:[twitch(7,'Gran Turismo 7')]}});
 const [a,b]=await Promise.all([catalogue.get('course'),catalogue.get('course')]);
 assert.deepEqual(a,b);
 assert.equal(calls,SEEDS.course.length);
 assert.equal(await catalogue.get('__prototype__'),null);
 assert.equal(await catalogue.get('autres'),null);
 assert.equal(calls,SEEDS.course.length);
});
test('unreachable Twitch is reported; never replace unavailable catalogue with pretend games',async()=>{
 const service=createGenreCatalogue(async()=>{throw Error('provider offline')});
 await assert.rejects(()=>service.get('course'),/Twitch genre lookup unavailable/);
 const server=read('server.js');
 assert.match(server,/app\.get\('\/api\/categories\/genre', heavyLimiter/);
 assert.match(server,/createGenreCatalogue\(twitchAPI\)/);
 assert.match(server,/source:'twitch-verified'/);
 assert.match(server,/res\.status\(503\)/);
});
test('genre rails can load all verified games on approach without hiding empty genres',()=>{
 const js=read('assets/swapp-catalogue-lab.js');
 const css=read('assets/swapp-catalogue-lab.css');
 assert.match(js,/async function hydrateGenreCatalogue\(genre\)/);
 assert.match(js,/fetchJson\('\/api\/categories\/genre\?genre='/);
 assert.match(js,/new IntersectionObserver\(entries=>/);
 assert.match(js,/rootMargin:'550px 0px'/);
 assert.match(js,/genreLoadStatus\.set\(genre,'ready'\)/);
 assert.match(js,/genreLoadStatus\.set\(genre,'unavailable'\)/);
 assert.match(js,/filter\(group=>\(group\.id!=='autres'/);
 assert.match(js,/hydrateGenreCatalogue\('course'\)/);
 assert.match(js,/if\(result\.length>=1500\)break/);
 assert.match(css,/\.scl-genre-loading\{/);
});
test('game live dialog has real black styling and compact, usable video links',()=>{
 const js=read('assets/swapp-catalogue-lab.js');
 const css=read('assets/swapp-catalogue-lab.css');
 assert.match(js,/dialog\.classList\.toggle\('scl-dialog-game',variant==='game'\)/);
 assert.match(js,/showDialog\(section,'game'\)/);
 assert.match(js,/if\(summary&&!summary\.includes\('Présentation éditoriale à compléter'\)\)/);
 assert.match(js,/const list=create\('div','scl-cards scl-game-live-cards'\)/);
 assert.match(js,/list\.addEventListener\('keydown'/);
 assert.match(js,/requestAnimationFrame\(updateArrows\)/);
 assert.match(css,/#scl-dialog\.scl-dialog-game\{/);
 assert.match(css,/background:#050506/);
 assert.match(css,/#scl-dialog\.scl-dialog-game \.scl-game-live-cards\{/);
 assert.match(css,/overflow-x:auto;overflow-y:hidden/);
 assert.match(css,/\.scl-game-live-cards \.scl-card-watch\{/);
 assert.doesNotMatch(css,/\.scl-game-live-cards \.scl-card-action-row\{\s*display:none/);
 assert.match(css,/@media\(max-width:650px\)/);
});
