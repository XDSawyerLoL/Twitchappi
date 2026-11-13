'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const dir=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(dir,file),'utf8');
const lab=require('../modules/swapp-catalogue-lab');
const catalogue=require('../assets/swapp-catalogue-lab');

function live(platform,login,viewers,game='Minecraft'){
 return {platform,user_login:login,host_login:login,user_name:login,
  viewer_count:viewers,game_name:game,title:'Direct en cours',thumbnail_url:''};
}
test('public homepage has a canonical indexable catalogue, original lab remains noindex',()=>{
 const home=lab.page({publicHome:true}),oldLab=lab.page();
 assert.match(home,/rel="canonical" href="https:\/\/swapp\.tv\/"/);
 assert.match(home,/<title>SWAPP — Directs, jeux et actualités<\/title>/);
 assert.match(home,/class="swapp-editorial-route swapp-catalogue-lab-page swapp-catalogue-home"/);
 assert.doesNotMatch(home,/classic=1|Ancien accueil|Catalogue classique/);
 assert.match(home,/href="\/mentions-legales"/);
 assert.match(home,/href="\/confidentialite"/);
 assert.match(home,/google-site-verification/);
 assert.match(home,/pagead2\.googlesyndication\.com/);
 assert.match(home,/href="\/"[^>]*aria-current="page"/);
 assert.doesNotMatch(home,/meta name="robots" content="noindex/);
 assert.match(oldLab,/noindex,nofollow,noarchive/);
 assert.match(oldLab,/Catalogue immersif · Laboratoire SWAPP/);
 assert.doesNotMatch(oldLab,/rel="canonical" href="https:\/\/swapp\.tv\/"/);
 assert.match(oldLab,/href="\/categories"/);
 const assets=[['swapp-catalogue-lab.js','20261113-x-share-edge-hints-v7'],
  ['swapp-catalogue-lab.css','20261113-x-share-edge-hints-v7']];
 for(const [name,version] of assets){
  assert.ok(home.includes(name+'?v='+version));
  assert.ok(oldLab.includes(name+'?v='+version));
 }
});
test('root route serves only the immersive catalogue and redirects legacy bookmarks',()=>{
 const server=read('server.js'),start=server.indexOf("app.get('/', (req, res) => {");
 const end=server.indexOf('\n});',start)+4;
 assert.ok(start>0&&end>start);
 const routes=[],warnings=[];
 new Function('app','require','console',server.slice(start,end))(
  {get(route,handler){routes.push({route,handler})}},
  ()=>({page:({publicHome})=>publicHome?'PUBLIC_SWAPP_CATALOGUE':'LAB'}),
  {warn:(...parts)=>warnings.push(parts.join(' '))}
 );
 const handler=routes.find(x=>x.route==='/')?.handler;
 assert.equal(typeof handler,'function');
 const response=()=>({headers:{},sent:null,redirected:null,type(name){this.mime=name;return this},
  set(k,v){this.headers[k]=v;return this},send(body){this.sent=body;return this},
  status(code){this.statusCode=code;return this},redirect(code,url){this.redirected={code,url};return this}});
 const publicRes=response();handler({query:{}},publicRes);
 assert.equal(publicRes.sent,'PUBLIC_SWAPP_CATALOGUE');
 assert.equal(publicRes.mime,'html');
 assert.equal(publicRes.headers['Cache-Control'],'public, max-age=45');
 const legacy=response();handler({query:{classic:'1'}},legacy);
 assert.deepEqual(legacy.redirected,{code:308,url:'/'});
 assert.equal(legacy.headers['Cache-Control'],'no-store');
 const broken=[],appFail={get(_route,fn){broken.push(fn)}};
 new Function('app','require','console',server.slice(start,end))(
  appFail,()=>{throw Error('incomplete Hostinger upload')},
  {warn:(...parts)=>warnings.push(parts.join(' '))}
 );
 const failure=response();broken[0]({query:{}},failure);
 assert.equal(failure.statusCode,503);
 assert.equal(failure.headers['Cache-Control'],'no-store');
 assert.equal(failure.sent,'Accueil SWAPP temporairement indisponible.');
 assert.ok(warnings.some(x=>x.includes('Catalogue indisponible')));
 assert.equal(server.slice(start,end).includes('sendSwappUi'),false);
});
test('small communities use dedicated verified sources, prefer up to 50 and accurately expand to 150',()=>{
 assert.match(catalogue.API.small,/\/api\/oryon\/discover\/find-live\?mood=petite-commu/);
 assert.match(catalogue.API.smallBackup,/\/api\/twitch\/streams\/small\?/);
 const four=[live('twitch','alpha11',9),live('twitch','beta22',32),live('twitch','gamma33',49),live('twitch','delta44',50)];
 const found=catalogue.chooseSmallCommunities([],four,[live('twitch','huge00',250)],12);
 assert.equal(found.max,50);
 assert.equal(found.items.length,4);
 assert.ok(found.items.every(x=>x.viewers<=50));
 const expanded=catalogue.chooseSmallCommunities([],four.slice(0,2),[
  live('twitch','epsilon55',87),live('twitch','zeta66',125),live('twitch','overLimit',170)
 ]);
 assert.equal(expanded.max,150);
 assert.equal(expanded.items.length,4);
 assert.ok(expanded.items.every(x=>x.viewers<=150));
 assert.ok(expanded.items.some(x=>x.viewers===125));
 assert.ok(!expanded.items.some(x=>x.viewers===170));
 const duplicate=catalogue.chooseSmallCommunities([],four,[four[0],four[1]]);
 assert.equal(duplicate.items.length,4);
});
test('small stream search rejects malformed identifiers and does not fabricate offline sessions',()=>{
 const candidates=[live('twitch','<fake>',12),live('twitch','validuser',21),
  {...live('twitch','offlinefake',25),platform:'peertube'},
  live('twitch','noaudience',301)];
 const result=catalogue.chooseSmallCommunities([],candidates,[]);
 assert.equal(result.items.length,1);
 assert.equal(result.items[0].login,'validuser');
 assert.deepEqual(catalogue.chooseSmallCommunities([],[],[]).items,[]);
 const source=read('assets/swapp-catalogue-lab.js');
 assert.match(source,/void loadSmallCommunities\(\)/);
 assert.match(source,/Promise\.allSettled\(sources\.map\(/);
 assert.match(source,/state\.smallLoading=false/);
 assert.match(source,/JUSQU’À 150 SPECTATEURS/);
 assert.match(source,/Découvrir tous les lives SWAPP/);
});
test('unknown audience is not silently advertised as a verified zero-viewer stream',()=>{
 const unknown=live('twitch','unknown12',undefined);
 const nonnumeric=live('twitch','badcount12','many');
 const negative=live('twitch','negative12',-1);
 const genuineZero=live('twitch','genuinezero',0);
 assert.equal(catalogue.normalizeLive(unknown).audienceVerified,false);
 assert.equal(catalogue.normalizeLive(unknown).viewers,null);
 assert.equal(catalogue.normalizeLive(genuineZero).audienceVerified,true);
 assert.equal(catalogue.normalizeLive(genuineZero).viewers,0);
 const selected=catalogue.chooseSmallCommunities([], [unknown,nonnumeric,negative,genuineZero], []);
 assert.deepEqual(selected.items.map(x=>x.login),['genuinezero']);
});
test('ACTUS recycles old-home article poster with real published art and internal article/live links',()=>{
 const js=read('assets/swapp-actus-app.js');
 const begin=js.indexOf('function renderFeaturedActusHero(');
 const finish=js.indexOf('async function showList(',begin);
 assert.ok(begin>0&&finish>begin);
 const nodes=[];
 const el=(tag,cls='',txt='')=>{
  const n={tag,cls,textContent:txt,children:[],attributes:{},
   classList:{added:[],add(x){this.added.push(x)}},
   setAttribute(k,v){this.attributes[k]=String(v)},
   append(...c){this.children.push(...c)},
   replaceChildren(...c){this.children=[...c]},
   addEventListener(){}};
  nodes.push(n);return n;
 };
 const func=new Function('el','slugOk','url','window',js.slice(begin,finish)+';return renderFeaturedActusHero;')(
  el,s=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s),
  raw=>{try{const u=new URL(raw);return u.protocol==='https:'?u.href:null}catch{return null}},
  {SwappArticleExtras:{cardImageSources:a=>[a.thumbnail?.url].filter(Boolean)}}
 );
 const host=el('div');
 const articles=[{slug:'article-feature-gaming',title:'Une actualité publiée de SWAPP',
  status:'published',summary:'Une annonce confirmée',game:'Minecraft',
  publishedAt:'2026-11-13T10:00:00Z',
  image:{url:'https://blog.playstation.com/image.jpg'}}];
 const hero=func(host,articles);
 assert.equal(host.children[0],hero);
 const card=hero.children[0],actions=hero.children[1];
 assert.ok(card.cls.includes('swapp-home-hero-feature'));
 assert.equal(card.href,'/actus/article-feature-gaming');
 assert.ok(card.children.some(x=>x.tag==='img'&&x.src===articles[0].image.url));
 assert.deepEqual(actions.children.map(x=>x.href),['/actus/article-feature-gaming','/decouvrir']);
 assert.match(js,/renderFeaturedActusHero\(featuredMount,items\)/);
 assert.match(js,/const featuredMount=el\('div','swapp-actus-featured-mount'\)/);
 assert.match(read('index.html'),/swapp-actus-app\.css\?v=20261113-relocated-feature-v2/);
 assert.match(read('index.html'),/swapp-actus-app\.js\?v=20261113-direct-x-v3/);
});
test('official muted trailer from former homepage is scoped to ACTUS and never autoplays on touch devices',()=>{
 const motion=read('assets/swapp-home-motion.js'),actus=read('assets/swapp-actus-app.js');
 const css=read('assets/swapp-actus-app.css');
 assert.match(actus,/window\.SwappHomeMotion\?\.attach\?\.\(link,featured\)/);
 assert.match(motion,/tile\.closest\('#actus\.view\.active \.swapp-actus-featured-hero'\)/);
 assert.match(motion,/tile\.closest\('#home\.view\.active'\)/);
 assert.match(motion,/prefers-reduced-motion: reduce/);
 assert.match(motion,/navigator\.connection\?\.saveData/);
 assert.match(css,/\.swapp-home-motion-playing > \.swapp-home-motion/);
 assert.match(css,/@media\(max-width:979px\),\(pointer:coarse\),\(prefers-reduced-motion:reduce\)/);
 assert.match(read('index.html'),/swapp-home-motion\.js\?v=20261113-actus-relocation-v3/);
});
test('ACTUS published article hero stays responsive, without embedding the old homepage',()=>{
 const css=read('assets/swapp-actus-app.css');
 assert.match(css,/#actus \.swapp-actus-featured-hero/);
 assert.match(css,/#actus \.swapp-actus-featured-overlay strong/);
 assert.match(css,/#actus \.swapp-actus-featured-actions/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 const server=read('server.js');
 assert.ok(server.includes("app.get('/', (req, res) => {"));
 assert.ok(!read('assets/swapp-navigation.js').includes('catalogue-test'));
});
