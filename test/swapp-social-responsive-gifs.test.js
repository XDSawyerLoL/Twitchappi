'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const {REACTIONS,gifBuffer,builtin,safeGifCdn,registerSocialGifs}=require('../modules/swapp-social-gifs');

function fakeApp(){
 const routes=new Map();
 return {routes,get:(route,handler)=>routes.set(route,handler)};
}
function fakeResponse(){
 return {
  code:200,headers:{},data:null,type:'',
  set(arg,value){if(typeof arg==='string')this.headers[arg]=value;else Object.assign(this.headers,arg);return this},
  status(code){this.code=code;return this},
  json(obj){this.data=obj;return this},
  send(data){this.data=data;return this},
  end(){this.data=null;return this}
 };
}

test('12 original, no-key animated GIFs have valid GIF89a envelopes',()=>{
 assert.ok(REACTIONS.length>=12);
 const ids=new Set();
 for(const [id] of REACTIONS){
  assert.ok(!ids.has(id));ids.add(id);
  const gif=gifBuffer(id);
  assert.equal(gif.toString('ascii',0,6),'GIF89a');
  assert.equal(gif.readUInt16LE(6),144);
  assert.equal(gif.readUInt16LE(8),72);
  assert.equal(gif.at(-1),0x3b);
  assert.ok(gif.includes(Buffer.from('NETSCAPE2.0')));
  assert.ok(gif.length<50_000);
  assert.strictEqual(gifBuffer(id),gif,'memory cache is reused');
 }
});
test('French keyword search is bounded and does not need any account or API key',async()=>{
 assert.equal(builtin().length,12);
 assert.ok(builtin('rire').some(item=>item.id==='swapp-lol'));
 assert.ok(builtin('victoire').some(item=>item.id==='swapp-gg'));
 const app=fakeApp();
 registerSocialGifs(app,{key:'',fetchImpl:()=>{throw Error('External API must not be called')}});
 const res=fakeResponse();
 await app.routes.get('/api/swapp/social/gifs')({query:{}},res);
 assert.equal(res.code,200);
 assert.equal(res.data.items.length,12);
 assert.equal(res.data.hasGiphy,false);
 assert.ok(res.data.items.every(item=>item.url.startsWith('/api/swapp/social/gifs/sticker/')));
 const asset=fakeResponse();
 app.routes.get('/api/swapp/social/gifs/sticker/:id.gif')({params:{id:'gg'}},asset);
 assert.equal(asset.headers['Content-Type'],'image/gif');
 assert.equal(asset.data.toString('ascii',0,6),'GIF89a');
 assert.ok(asset.headers['Cache-Control'].includes('max-age=86400'));
 const missing=fakeResponse();
 app.routes.get('/api/swapp/social/gifs/sticker/:id.gif')({params:{id:'unknown'}},missing);
 assert.equal(missing.code,404);
});
test('optional GIPHY API never leaks its key or allows arbitrary thumbnail origins',async()=>{
 assert.equal(safeGifCdn('https://media3.giphy.com/media/123/200.gif'),'https://media3.giphy.com/media/123/200.gif');
 for(const url of ['http://media.giphy.com/x.gif','https://other.example/gif','https://evilgiphy.com/x.gif','https://media.giphy.com.evil.org/g.gif'])
  assert.equal(safeGifCdn(url),'');
 let called='';
 const fetchImpl=async url=>{
  called=url;
  return {ok:true,json:async()=>({data:[{
   id:'approved_001',title:'Réaction sympa',url:'https://giphy.com/gifs/approved_001',
   images:{fixed_width:{url:'https://media1.giphy.com/media/gif/200w.gif',width:'200',height:'150'},
   fixed_width_small:{url:'https://media1.giphy.com/media/gif/100w.gif'}},
   username:'creator'
  }]})};
 };
 const app=fakeApp();
 registerSocialGifs(app,{key:'test_secret_do_not_expose',fetchImpl});
 const res=fakeResponse();
 await app.routes.get('/api/swapp/social/gifs')({query:{q:'reaction'}},res);
 assert.equal(res.data.hasGiphy,true);
 assert.equal(res.data.items.some(item=>item.provider==='GIPHY'),true);
 assert.ok(called.startsWith('https://api.giphy.com/v1/gifs/search?'));
 assert.ok(called.includes('rating=g'));
 assert.ok(!JSON.stringify(res.data).includes('test_secret_do_not_expose'));
});
test('GIF picker replaces URL prompt, allows one-click selection, GIF-only posts and removal',()=>{
 const body=read('assets/swapp-social-native/social-body.html');
 const app=read('assets/swapp-social-native/app.js');
 const backend=read('modules/swapp-social-native/pulse.mjs');
 const module=read('assets/swapp-social-native/gif-picker.js');
 assert.match(body,/data-tool="gif"/);
 assert.doesNotMatch(body,/Image par URL|data-tool="image"/);
 assert.doesNotMatch(app,/Adresse HTTPS de l’image/);
 assert.match(app,/setupSocialGifPicker\(\{requireAuth,state,dom,updateMediaPreview\}\)/);
 assert.match(app,/if\(!body&&!state\.attachment\?\.mediaUrl\)return/);
 assert.match(backend,/if\(!text&&!\(mediaType==='gif'&&mediaUrl\)\)/);
 assert.match(module,/state\.attachment=\{mediaUrl:tile\.dataset\.gifUrl,mediaType:'gif'\}/);
 assert.match(module,/data-gif-close/);
 assert.match(module,/event\.key==='Escape'/);
 assert.match(module,/controller\.abort\(\)/);
});
test('GIFs remain animated, compact and proportional in posts, preview and phones',()=>{
 const render=read('assets/swapp-social-native/render.js');
 const css=read('assets/swapp-social-editorial-air.css');
 const hubs=read('modules/swapp-hubs.js');
 const server=read('server.js');
 assert.match(render,/pulse-gif-post/);
 assert.match(render,/gifIsGiphy/);
 assert.match(render,/hideDuplicateTitle\|\|!cleanBody/);
 assert.match(css,/#swappSocialNative \.pulse-gif-post>img/);
 assert.match(css,/max-height:310px!important/);
 assert.match(css,/max-width:100%!important/);
 assert.match(css,/@media\(max-width:500px\)/);
 assert.match(hubs,/app\.js\?v=20261025-dm-workspace-v1/);
 assert.match(hubs,/swapp-social-editorial-air\.css\?v=20261022-large-tools-v1/);
 assert.ok(server.indexOf('registerSocialGifs(app)')<server.indexOf("app.use('/api/swapp/social',authLimiter"),'read endpoints must precede auth writes');
});
