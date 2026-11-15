'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {register,page}=require('../modules/swapp-servers');
const serverId='b'.repeat(32);
const published={
 id:serverId,owner_id:'owner-1',name:'SWAPP — NE JOUE PLUS DANS TON COIN.',
 slug:'swapp-communaute-bbbbbbb',game:'Discord / Multigaming',
 description:'Une vraie communauté Discord SWAPP pour partager et découvrir des jeux.',
 logoUrl:'/media/serveurs/'+serverId+'/logo',brandBannerUrl:'',
 banner_url:''
};
function harness({owned=true,rows=[published],broken=false}={}){
 const handlers={},calls=[];
 const db={
  async execute(sql,args=[]){
   calls.push({sql,args});
   if(broken)throw Error('database temporarily unavailable');
   if(sql.startsWith('SELECT s.id,s.name,s.slug,s.game,s.description,s.banner_url'))return [rows];
   if(sql.startsWith('SELECT COUNT(*) AS n FROM swapp_game_servers WHERE game='))return [[{n:rows.length}]];
   if(sql.startsWith('SELECT s.id,s.name,s.slug,s.game,s.description,s.status'))
    return [rows.map(r=>({...r,status:r.status||'published',description:r.description,
      logo_url:r.logoUrl,accent_color:'#8ceaf0'}))];
   if(sql.startsWith('DELETE FROM swapp_game_servers WHERE id=? AND owner_id IN (?,?)'))
    return [{affectedRows:owned?1:0}];
   throw Error('unexpected SQL in test: '+sql);
  }
 };
 const app={
  get:(route,...f)=>{handlers['GET '+route]=f.at(-1)},
  post:(route,...f)=>{handlers['POST '+route]=f.at(-1)},
  put:(route,...f)=>{handlers['PUT '+route]=f.at(-1)},
  delete:(route,...f)=>{handlers['DELETE '+route]=f.at(-1)}
 };
 register(app,{getDatabase:async()=>db,isAdmin:()=>false,enableAutoReview:false});
 const request=(options={})=>({
  params:{id:serverId,jeu:'discord-multigaming'},
  session:{oryonUser:{id:'owner-1'}},query:{},
  get:key=>key==='origin'?'https://swapp.tv':'',
  ...options
 });
 const response=()=>({
  code:200,html:'',data:null,headers:{},
  status(n){this.code=n;return this},
  set(k,v){this.headers[k]=v;return this},
  type(){return this},
  send(html){this.html=html;return this},
  json(value){this.data=value;return this},
  sendStatus(n){this.code=n;return this},
  redirect(n,url){this.code=n;this.url=url;return this}
 });
 return {handlers,calls,request,response};
}
test('Discord category lists published communities before generic game discovery without JS',async()=>{
 const h=harness(),res=h.response();
 await h.handlers['GET /serveurs/:jeu'](h.request(),res);
 assert.equal(res.code,200);
 assert.match(res.html,/SWAPP — NE JOUE PLUS DANS TON COIN/);
 assert.match(res.html,/href="\/serveurs\/discord-multigaming\/swapp-communaute-bbbbbbb"/);
 assert.match(res.html,/ss-category-preloaded/);
 assert.ok(res.html.indexOf('id="ss-results"')<res.html.indexOf('id="ss-featured-games"'),
  'community listings must precede games and promotional discovery');
 assert.ok(res.html.indexOf('ss-category-preloaded')<res.html.indexOf('ss-grow-title'),
  'growth banner must not bury category listings');
 assert.match(res.html,/1 serveur référencé/);
 assert.deepEqual(h.calls[0].args,['Discord / Multigaming']);
});
test('category database error is never mislabeled as zero published servers',async()=>{
 const h=harness({broken:true}),res=h.response();
 await h.handlers['GET /serveurs/:jeu'](h.request(),res);
 assert.equal(res.code,200);
 assert.match(res.html,/Classement temporairement indisponible/);
 assert.doesNotMatch(res.html,/id="ss-count">0 serveur/);
});
test('owner area offers deletion on both published and pending communities',async()=>{
 const h=harness({rows:[published,{...published,id:'c'.repeat(32),name:'SWAPP Minecraft',game:'Minecraft',status:'pending'}]});
 const res=h.response();
 await h.handlers['GET /serveurs/mes-serveurs'](h.request(),res);
 assert.equal(res.code,200);
 assert.equal((res.html.match(/class="ss-owner-delete"/g)||[]).length,2);
 assert.match(res.html,/Fiche en vérification/);
 assert.match(res.html,/swapp-servers-owner\.js/);
 assert.match(res.html,/ss-owner-feedback/);
});
test('authenticated owner can delete a listing through a parameterized scoped query',async()=>{
 const h=harness(),res=h.response();
 await h.handlers['DELETE /api/swapp/serveurs/:id'](h.request(),res);
 assert.equal(res.code,200);
 assert.deepEqual(res.data,{deleted:true,id:serverId});
 const deletion=h.calls.find(x=>x.sql.startsWith('DELETE FROM swapp_game_servers'));
 assert.ok(deletion);
 assert.deepEqual(deletion.args,[serverId,'owner-1','owner-1']);
 assert.doesNotMatch(deletion.sql,/status="published"/,'pending listings must also be removable');
 assert.equal(res.headers['Cache-Control'],'private,no-store');
});
test('another account, anonymous user, bad origin and malformed IDs cannot delete',async()=>{
 const stranger=harness({owned:false}),notOwner=stranger.response();
 await stranger.handlers['DELETE /api/swapp/serveurs/:id'](stranger.request(),notOwner);
 assert.equal(notOwner.code,404);
 const anonymous=harness(),notLogged=anonymous.response();
 await anonymous.handlers['DELETE /api/swapp/serveurs/:id'](anonymous.request({session:{}}),notLogged);
 assert.equal(notLogged.code,401);assert.equal(anonymous.calls.length,0);
 const badOrigin=harness(),crossOrigin=badOrigin.response();
 await badOrigin.handlers['DELETE /api/swapp/serveurs/:id'](badOrigin.request({get:()=> 'https://untrusted.example'}),crossOrigin);
 assert.equal(crossOrigin.code,403);assert.equal(badOrigin.calls.length,0);
 const badID=harness(),invalid=badID.response();
 await badID.handlers['DELETE /api/swapp/serveurs/:id'](badID.request({params:{id:'../bad-id'}}),invalid);
 assert.equal(invalid.code,422);assert.equal(badID.calls.length,0);
});
test('owner deletion JS always confirms irreversible action and never fires automatically',()=>{
 const js=fs.readFileSync(path.join(__dirname,'../assets/swapp-servers-owner.js'),'utf8');
 assert.match(js,/window\.confirm/);
 assert.match(js,/method:'DELETE'/);
 assert.match(js,/\.addEventListener\('click'/);
 assert.match(js,/\.disabled=true/);
});
