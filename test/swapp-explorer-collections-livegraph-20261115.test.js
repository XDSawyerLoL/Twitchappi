'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const explorer=require('../assets/swapp-explorer');
const {page,register}=require('../modules/swapp-explorer');
const nav=require('../assets/swapp-navigation');
const {genreForGame,GENRES}=require('../assets/swapp-genre-discovery');
const genre=name=>genreForGame(name);

test('Explorer has a real native route for collections, the graph and genre details',()=>{
 const routes=[];
 register({get:(url,fn)=>routes.push({url,fn})});
 assert.deepEqual(routes.map(x=>x.url),['/explorer','/explorer/carte','/explorer/collections/:genre']);
 const collections=page(),graph=page({mode:'carte'});
 for(const html of [collections,graph]){
  assert.match(html,/data-swapp-shell="shared-native-v2"/);
  assert.match(html,/id="nav"/);
  assert.match(html,/href="\/explorer"/);
  assert.match(html,/id="sx-query"/);
  assert.match(html,/swapp-explorer\.js\?v=20261115-collections-cinema-v2/);
  assert.match(html,/swapp-genre-discovery\.js\?v=20261115-hidpi-genre-v8/);
 }
 assert.match(collections,/data-view="collections"/);
 assert.match(graph,/data-view="carte"/);
 assert.match(page({genre:'rpg'}),/data-genre="rpg"/);
 assert.doesNotMatch(page({genre:'<script>'}),/data-genre="<script>"/);
});

test('menu Explorer is a native desktop destination and remains reachable on mobile',()=>{
 assert.equal(nav.explorer.href,'/explorer');
 assert.match(nav.desktopNavigation('explorer'),/href="\/explorer" class="active" aria-current="page">Explorer<\/a>/);
 const mobile=nav.mobileNavigation('explorer');
 assert.match(mobile,/class="swapp-mobile-more"/);
 assert.match(mobile,/href="\/explorer" class="active" aria-current="page">Explorer<\/a>/);
 assert.match(nav.desktopNavigation('tv'),/href="\/decouvrir"/);
 assert.equal(nav.items.at(-1).href,'/tv');
});

test('home hero comes before discovery controls: no banner gap from introduction or filters',()=>{
 const html=require('../modules/swapp-catalogue-lab').catalogueContent({publicHome:true});
 const hero=html.indexOf('id="scl-feature"'),controls=html.indexOf('class="scl-discovery-toolbar"'),status=html.indexOf('id="scl-status"');
 assert.ok(hero>=0&&controls>hero&&status>controls);
 assert.doesNotMatch(html,/Des histoires à regarder en direct\./);
 assert.equal((html.match(/id="scl-search"/g)||[]).length,1);
 assert.match(html,/class="scl-explorer-shortcut" href="\/explorer"/);
 const css=read('assets/swapp-catalogue-spa.css');
 assert.match(css,/\.scl-discovery-toolbar/);
 assert.match(css,/\.scl-discovery-toolbar \.scl-tabs/);
 assert.match(css,/backdrop-filter:none!important/);
});

test('external source images are validated, while Twitch box art gets high density',()=>{
 const url='https://static-cdn.jtvnw.net/ttv-boxart/42-285x380.jpg';
 assert.equal(explorer.picture(url),'https://static-cdn.jtvnw.net/ttv-boxart/42-720x960.jpg');
 assert.equal(explorer.picture('https://static-cdn.jtvnw.net/ttv-boxart/42-{width}x{height}.jpg'),
  'https://static-cdn.jtvnw.net/ttv-boxart/42-720x960.jpg');
 assert.equal(explorer.picture('javascript:alert(1)'),'');
 assert.equal(explorer.picture('https://evil.example/cover.jpg'),'');
 const g=explorer.game({name:'Baldur’s Gate 3',box_art_url:url},genre);
 assert.equal(g.genre,'rpg');
 assert.equal(g.cover,'https://static-cdn.jtvnw.net/ttv-boxart/42-720x960.jpg');
 assert.equal(explorer.game({name:'Just Chatting',box_art_url:url},genre),null);
});

test('lives are validated and never acquire invented audience or malicious routes',()=>{
 const a=explorer.live({user_login:'playerone',game_name:'Cyberpunk 2077',thumbnail_url:'https://static-cdn.jtvnw.net/preview-{width}x{height}.jpg'},'twitch',genre);
 assert.equal(a.watchUrl,'/live/twitch/playerone');
 assert.equal(a.genre,'rpg');
 assert.equal(a.viewers,null);
 assert.equal(a.cover,'https://static-cdn.jtvnw.net/preview-960x540.jpg');
 const b=explorer.live({host_login:'example_user',category:'Minecraft',viewer_count:8},'swapp',genre);
 assert.equal(b.watchUrl,'/example_user');
 assert.equal(b.viewers,8);
 assert.equal(explorer.live({user_login:'<script>',game_name:'Minecraft'},'twitch',genre),null);
 assert.equal(explorer.live({user_login:'otherone',viewer_count:-3},'twitch',genre).viewers,null);
});

test('collections count actual inventory only, with no fake entries or viewers',()=>{
 const games=[explorer.game({name:'Cyberpunk 2077'},genre),
  explorer.game({name:'Dark Souls Remastered'},genre)];
 const lives=[
  explorer.live({user_login:'alpha',game_name:'Cyberpunk 2077',viewer_count:45},'twitch',genre),
  explorer.live({user_login:'beta',game_name:'Cyberpunk 2077'},'twitch',genre)
 ];
 const groups=explorer.collections(games,lives,GENRES);
 assert.ok(groups.length>=2);
 const rpg=groups.find(g=>g.id==='rpg'),arpg=groups.find(g=>g.id==='arpg');
 assert.equal(rpg.gameCount,1);assert.equal(rpg.liveCount,2);
 assert.equal(arpg.gameCount,1);assert.equal(arpg.liveCount,0);
 assert.ok(groups.every(g=>g.gameCount||g.liveCount));
});

test('LiveGraph links games to verified streams and editorial genres only',()=>{
 const games=[explorer.game({name:'Cyberpunk 2077'},genre),explorer.game({name:'Baldur’s Gate 3'},genre)];
 const lives=[
  explorer.live({user_login:'alpha',game_name:'Cyberpunk 2077'},'twitch',genre),
  explorer.live({user_login:'beta',game_name:'Cyberpunk 2077'},'twitch',genre),
  explorer.live({user_login:'gamma',game_name:'Baldur’s Gate 3'},'twitch',genre)
 ];
 const graph=explorer.graphModel(games,lives,'cyberpunk-2077',genre);
 assert.equal(graph.focus.slug,'cyberpunk-2077');
 assert.equal(graph.nodes.filter(x=>x.kind==='creator').length,2);
 assert.equal(graph.edges.filter(x=>x.kind==='live').length,2);
 assert.ok(graph.edges.every(e=>e.kind==='genre'||e.kind==='live'));
 assert.ok(!graph.edges.some(e=>e.from.startsWith('creator:')&&e.to.startsWith('creator:')));
 assert.deepEqual(explorer.graphModel(games,lives,'unknown',genre).edges,[]);
});

test('Explorer is packaged and mounted before generic creator routing',()=>{
 const server=read('server.js'),pack=read('tools/swapp-hostinger-package.js');
 assert.match(server,/require\('\.\/modules\/swapp-explorer'\)\.register\(app\)/);
 assert.ok(server.indexOf("require('./modules/swapp-explorer').register(app)")<
  server.indexOf("app.get('/categories'"));
 for(const file of ['modules/swapp-explorer.js','assets/swapp-explorer.css','assets/swapp-explorer.js']){
  assert.ok(pack.includes(file),file+' absent from Hostinger package');
  assert.ok(read('tools/swapp-release.js').includes(file),file+' absent from release manifest');
 }
});

test('Explorer supplies X and Open Graph images without client JavaScript',()=>{
 for(const html of [page(),page({mode:'carte'}),page({genre:'rpg'})]){
  assert.match(html,/property="og:image" content="https:\/\/swapp\.tv\/swapp-share-card\.png"/);
  assert.match(html,/name="twitter:image" content="https:\/\/swapp\.tv\/swapp-share-card\.png"/);
  assert.match(html,/name="twitter:card" content="summary_large_image"/);
  assert.match(html,/property="og:image:width" content="1200"/);
 }
});
