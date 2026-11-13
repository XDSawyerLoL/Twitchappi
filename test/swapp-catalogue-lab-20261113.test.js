'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const lab=require('../modules/swapp-catalogue-lab');
const catalog=require('../assets/swapp-catalogue-lab');

test('catalogue test has an explicit opt-in route and never replaces live or current categories',()=>{
 assert.equal(lab.ROUTE,'/catalogue-test');
 const paths=[];
 lab.register({get(route,handler){paths.push({route,handler})}});
 assert.equal(paths.length,1);
 assert.equal(paths[0].route,'/catalogue-test');
 let output='',mime='',headers={};
 paths[0].handler({},{
  set(k,v){headers[k]=v;return this},
  type(v){mime=v;return this},
  send(v){output=v;return this}
 });
 assert.equal(mime,'html');
 assert.match(output,/noindex,nofollow,noarchive/);
 assert.match(headers['X-Robots-Tag'],/noindex/);
 assert.equal(headers['Cache-Control'],'private, no-store');
 assert.match(output,/scl-feature-title/);
 assert.match(output,/id="scl-live-cards"/);
 assert.match(output,/id="scl-game-cards"/);
 assert.match(output,/id="scl-favorite-cards"/);
 assert.match(output,/href="\/categories"/);
 assert.match(output,/swapp-catalogue-lab\.js/);
 assert.match(output,/swapp-my-games\.js/);
 assert.doesNotMatch(output,/<meta[^>]*rel="canonical"/);
 const server=read('server.js');
 const register=server.indexOf("require('./modules/swapp-catalogue-lab').register(app)");
 const catchAll=server.indexOf("app.get(/^\\/([a-zA-Z0-9_]");
 assert.ok(register>0&&catchAll>register,'new test route must register before creator catch-all');
 assert.doesNotMatch(read('assets/swapp-navigation.js'),/catalogue-test/);
 assert.doesNotMatch(read('modules/swapp-seo.js').slice(0,read('modules/swapp-seo.js').indexOf('const SLUG=')),/catalogue-test/);
});
test('real Twitch and SWAPP streams are normalized without inventing streams',()=>{
 const home=[{platform:'oryon',host_login:'Creator_1',host_name:'Créateur SWAPP',category:'Minecraft',viewer_count:7,thumbnail_url:'https://swapp.tv/stream.png',title:'Survie'}];
 const top=[{user_login:'TwitchUser',user_name:'Twitch User',title:'Match classé',game_name:'VALORANT',viewer_count:42,thumbnail_url:'https://static-cdn.jtvnw.net/previews-ttv/live_user_twitchuser-{width}x{height}.jpg'}];
 const items=catalog.mergeLives(home,top);
 assert.equal(items.length,2);
 assert.equal(items[0].platform,'swapp');
 assert.equal(items[0].watchUrl,'/creator_1');
 assert.equal(items[0].viewers,7);
 assert.equal(items[1].platform,'twitch');
 assert.equal(items[1].watchUrl,'/live/twitch/twitchuser');
 assert.ok(items[1].image.startsWith('https://static-cdn.jtvnw.net/'));
 assert.equal(catalog.mergeLives([...home,...home],top).length,2,'dedupe streams');
 assert.equal(catalog.normalizeLive({user_login:'<img onerror=x>'}),null);
 assert.equal(catalog.normalizeLive({user_login:''}),null);
 assert.deepEqual(catalog.mergeLives([],[]),[]);
});
test('game covers come from real feeds; no invented poster, title or rating',()=>{
 const games=catalog.mergeGames([{id:'123',name:'Minecraft',box_art_url:'https://static-cdn.jtvnw.net/ttv-boxart/123-285x380.jpg'},
  {id:'4',name:'Just Chatting',box_art_url:'https://static-cdn.jtvnw.net/ttv-boxart/4-285x380.jpg'}],[]);
 assert.equal(games.length,1);
 assert.equal(games[0].gameSlug,'minecraft');
 assert.match(games[0].summary,/Explore/);
 assert.equal(catalog.normalizeGame({name:'',box_art_url:''}),null);
 assert.equal(catalog.safeImage('javascript:alert(1)'),'');
 assert.equal(catalog.safeImage('https://evil.example/test.png'),'');
 assert.equal(catalog.safeImage('https://swapp.tv/cover.jpg'),'https://swapp.tv/cover.jpg');
 const fallback=catalog.normalizeGame({name:'Rare Indie Game'});
 assert.match(fallback.summary,/Présentation éditoriale à compléter/);
 assert.ok(!Object.hasOwn(fallback,'rating'));
 assert.ok(!Object.hasOwn(fallback,'score'));
});
test('Mes jeux favorites use the same existing SWAPP storage schema and 30-item limit',()=>{
 const raw={version:1,games:[{slug:'minecraft',game:'Minecraft'},{slug:'minecraft',game:'Duplicated'},
  {slug:'%3Cscript%3E',game:'X'},...Array.from({length:50},(_,i)=>({slug:'game-'+String(i+10),game:'Un jeu '+i}))]};
 const storage={getItem(key){assert.equal(key,'swapp:followed-games:v1');return JSON.stringify(raw)}};
 const saved=catalog.readFavorites(storage);
 assert.equal(saved.length,30);
 assert.equal(saved[0].slug,'minecraft');
 assert.equal(new Set(saved.map(x=>x.slug)).size,30);
 assert.deepEqual(catalog.readFavorites({getItem(){throw Error('denied')}}),[]);
});
test('existing Oryon V4 streamer favorites work in the test catalogue without fake offline lives',()=>{
 const raw=[
  {platform:'oryon',login:'swapper123',name:'Swapper 123',game:'Minecraft',ts:1700000000},
  {platform:'twitch',login:'playerone',name:'Player One',game:'VALORANT',ts:1700000100},
  {platform:'twitch',login:'playerone',name:'Duplicate'},
  {platform:'unknown',login:'someone',name:'Invalid provider'},
  {platform:'twitch',login:'<invalid>',name:'Markup'}];
 const storage={getItem(key){assert.equal(key,'oryon_v4_likes');return JSON.stringify(raw)}};
 const items=catalog.readChannelFavorites(storage);
 assert.equal(items.length,2);
 assert.deepEqual(items.map(x=>x.platform+':'+x.login),['oryon:swapper123','twitch:playerone']);
 assert.equal(items[0].ts,1700000000);
 assert.deepEqual(catalog.readChannelFavorites({getItem(){throw Error('blocked')}}),[]);
 assert.match(read('assets/swapp-catalogue-lab.js'),/window\.localStorage\.setItem\(CHANNEL_KEY/);
 assert.match(read('assets/swapp-catalogue-lab.js'),/state\.lives\.filter\(x=>liveKeys\.has\(x\.id\)\)/);
 assert.match(lab.page(),/Mes favoris/);
});
test('no video preloading, only the explicit user preview path instantiates Twitch iframe',()=>{
 const js=read('assets/swapp-catalogue-lab.js');
 assert.match(js,/function preview\(item\)/);
 assert.match(js,/iframe\.src=url\.href/);
 assert.match(js,/url\.searchParams\.set\('muted','true'\)/);
 assert.match(js,/url\.searchParams\.set\('parent',host\)/);
 assert.match(js,/const iframe=create\('iframe','scl-preview-frame'\)/);
 assert.doesNotMatch(lab.page(),/<iframe/);
 assert.match(js,/const stopPreview=/);
 assert.match(js,/dialog\.addEventListener\('close'/);
 assert.match(js,/image\.onerror=/);
});
test('Netflix-like visual layout is responsive, honors reduced motion and uses uniform uppercase menu',()=>{
 const css=read('assets/swapp-catalogue-lab.css');
 const navCss=read('assets/swapp-unified-nav.css');
 for(const selector of ['.scl-feature','.scl-side','.scl-cards','.scl-card','.scl-dialog','.scl-search'])assert.ok(css.includes(selector),selector);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(navCss,/#nav\.mainNav \.navGroup > a,[\s\S]*#mobileNav\.mobileNav/);
 assert.match(navCss,/text-transform:uppercase!important/);
 const release=read('tools/swapp-release.js');
 for(const file of ['modules/swapp-catalogue-lab.js','assets/swapp-catalogue-lab.js','assets/swapp-catalogue-lab.css'])assert.ok(release.includes("'"+file+"'"));
});
