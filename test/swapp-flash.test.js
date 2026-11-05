'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {model,excerpts,youtube,renderFlash}=require('../modules/swapp-flash');
const fixture={slug:'indie-launch-pilot',status:'published',title:'Lancement du jeu indépendant Atlas',
 summary:'Un studio dévoile une nouvelle démo jouable et présente les premières informations sur son projet.',
 body:'## Les annonces\n\nLe studio a annoncé la mise à disposition d’une démo publique et présenté ses ambitions pour le jeu. Les prochaines étapes dépendront de ses retours.\n\n## Le rendez-vous\n\nLes créateurs volontaires pourront participer à des présentations pendant la période de test. Il reste des questions sur la date définitive de sortie.',
 game:'Atlas',category:'Actualités JV',author:'Rédaction SWAPP',
 publishedAt:'2026-11-04T10:00:00.000Z',
 trailerUrl:'https://www.youtube.com/watch?v=mFu8t9735IY',
 sources:[{label:'Communiqué du studio',url:'https://example.org/studio-news'}]};
test('only verified published news with valid slug and meaningful summary gets a FLASH',()=>{
 assert.ok(model(fixture));assert.equal(model({...fixture,status:'draft'}),null);
 assert.equal(model({...fixture,status:'unpublished'}),null);
 assert.equal(model({...fixture,legacySuppressRecovery:true}),null);
 assert.equal(model({...fixture,slug:'../../path'}),null);
 assert.equal(model({...fixture,summary:'trop court'}),null);
});
test('slides quote article paragraphs verbatim; no synthetic claims or summary repetition',()=>{
 const list=excerpts(fixture);
 assert.equal(list.length,2);
 assert.equal(list[0],'Le studio a annoncé la mise à disposition d’une démo publique et présenté ses ambitions pour le jeu. Les prochaines étapes dépendront de ses retours.');
 assert.match(list[1],/Il reste des questions/);
});
test('video only accepts exact trustworthy YouTube host and IDs',()=>{
 assert.equal(youtube(fixture.trailerUrl),'mFu8t9735IY');
 assert.equal(youtube('https://youtu.be/mFu8t9735IY'),'mFu8t9735IY');
 for(const u of ['http://youtube.com/watch?v=mFu8t9735IY',
  'https://youtube.com.evil.example/watch?v=mFu8t9735IY',
  'javascript:alert(1)','https://vimeo.com/mFu8t9735IY'])
  assert.equal(youtube(u),'');
});
test('HTML is escaped and never turns news text into executable markup',()=>{
 const art={...fixture,title:'Test <script>alert(1)</script>',summary:'Une très longue information avec <img src=x onerror=alert(1)> des données à lire et à comprendre.'};
 const result=renderFlash(art);
 assert.ok(result.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
 assert.ok(!result.includes('<script>alert(1)</script>'));
 assert.ok(!result.includes('<img src=x onerror=alert(1)>'));
});
test('player does not preload a third-party embed or send viewer tracking requests',()=>{
 const html=renderFlash(fixture);
 assert.match(html,/data-sf-video="mFu8t9735IY"/);
 assert.doesNotMatch(html,/<iframe[^>]*youtube/i);
 assert.match(html,/swapp-flash\.js/);
 assert.match(html,/swapp-flash\.css/);
 assert.match(html,/meta name="robots" content="noindex,follow"/);
 const client=fs.readFileSync(path.join(__dirname,'../assets/swapp-flash.js'),'utf8');
 assert.doesNotMatch(client,/fetch\(|sendBeacon|analytics|localStorage|sessionStorage/);
 assert.match(client,/youtube-nocookie\.com\/embed/);
 assert.match(client,/touchend/);
 assert.match(client,/ArrowRight/);
});
test('end of briefing links to the real SWAPP article, game, community and live shelf',()=>{
 const html=renderFlash(fixture);
 assert.match(html,/href="\/actus\/indie-launch-pilot"/);
 assert.match(html,/href="\/jeux\/atlas"/);
 assert.match(html,/href="\/social\?game=Atlas"/);
 assert.match(html,/data-swapp-live-shelf data-game="Atlas"/);
 assert.match(html,/data-swapp-follow-game/);
 assert.match(html,/Source/);
});
test('no fabricated thumbnail, video, article excerpts or availability without source',()=>{
 const basic={...fixture,body:'',trailerUrl:'',sources:[],image:null,thumbnail:null};
 const m=model(basic),html=renderFlash(basic);
 assert.equal(m.videoId,'');assert.deepEqual(m.excerpts,[]);
 assert.doesNotMatch(html,/data-sf-video=/);
 assert.ok(!html.includes('LIVE · ACTIF'));
});
test('deployed feature remains read-only and uses authoritative CMS publication snapshot',()=>{
 const server=fs.readFileSync(path.join(__dirname,'../modules/swapp-news/router.js'),'utf8');
 const idx=server.indexOf("router.get('/flash/:slug'");
 assert.ok(idx>0);
 const piece=server.slice(idx,idx+1200);
 assert.match(piece,/await published\(\)/);
 assert.match(piece,/item.status==='published'/);
 assert.match(piece,/!isReady\(\)/);
 assert.doesNotMatch(piece,/router.post|apiKey|Stripe|schedule|insert\(/);
});
