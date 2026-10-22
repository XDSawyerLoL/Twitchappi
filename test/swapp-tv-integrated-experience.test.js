'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const {page}=require('../modules/swapp-program');
test('queue is visible with accurate closed-enrollment states',()=>{
 const tv=page('tv'),js=read('assets/swapp-tv-broadcast.js');
 for(const id of ['stv-next-list','stv-creator-access','stv-creator-hint','stv-queue-status'])assert.match(tv,new RegExp('id="'+id+'"'));
 assert.match(js,/access\.hidden=false/);
 assert.doesNotMatch(js,/access\.hidden=!enabled/);
 assert.match(js,/Inscriptions fermées temporairement/);
 assert.match(js,/disabled=!enabled/);
});
test('embedded programme reuses canonical calendar without navigating away',()=>{
 const tv=page('tv'),calendar=page('agenda'),js=read('assets/swapp-tv-broadcast.js');
 for(const id of ['stv-program-dialog','stv-program-open','stv-program-close','scal-grid'])assert.match(tv,new RegExp('id="'+id+'"'));
 assert.match(tv,/<section id="swapp-calendar" class="scal">/);
 assert.match(calendar,/<main id="swapp-calendar"/);
 assert.equal((tv.match(/id="swapp-calendar"/g)||[]).length,1);
 assert.match(js,/programme\.showModal\(\)/);
 assert.match(js,/programme\?\.close\(\)/);
});
test('both chats use genuine first-party and Twitch channels',()=>{
 const tv=page('tv'),js=read('assets/swapp-tv-broadcast.js'),server=read('server.js');
 for(const id of ['stv-tab-swapp','stv-tab-twitch','stv-pane-swapp','stv-pane-twitch','stv-swapp-chat-form','stv-swapp-messages'])assert.match(tv,new RegExp('id="'+id+'"'));
 assert.match(js,/https:\/\/www\.twitch\.tv\/embed\//);
 assert.match(js,/parent:location\.hostname/);
 assert.match(js,/\/api\/swapp-tv\/chat/);
 assert.match(js,/by\('span',null,String\(m\.body/);
 assert.match(server,/app\.get\('\/api\/swapp-tv\/chat'/);
 assert.match(server,/app\.post\('\/api\/swapp-tv\/chat'/);
 assert.match(server,/swapp_social_room_messages/);
 assert.match(server,/social_origin_required/);
 assert.match(server,/swapp_account_required/);
});
test('TV and programme inherit the single global SWAPP accent without local picker',()=>{
 const css=read('assets/swapp-program.css'),shell=read('modules/swapp-news/site-shell.js');
 assert.match(css,/--tv-accent:var\(--swapp-page-accent,#22d3ee\)/);
 assert.match(shell,/swapp-editorial-color\.js/);
 for(const html of [page('tv'),page('agenda')]){
  assert.match(html,/swapp-program\.css/);
  assert.doesNotMatch(html,/swapp-page-colors\.js|stv-dock-close/);
 }
});
test('SWAPP chat permits public reading but protects all writes',async()=>{
 const server=read('server.js'),start=server.indexOf('// SWAPP TV discussion is one permanent public room'),end=server.indexOf('// Opt-in Fair Discovery pilot:',start);
 assert.ok(start>0&&end>start);
 const routes={get:{},post:{}},app={get:(p,l,h)=>{routes.get[p]=h},post:(p,l,h)=>{routes.post[p]=h}};
 const messages=[],pool={query:async(sql,args)=>{
  if(sql.startsWith('INSERT IGNORE'))return[{}];
  if(sql.startsWith('SELECT id,handle'))return[[...messages].reverse()];
  if(sql.startsWith('SELECT id FROM'))return[[]];
  if(sql.startsWith('INSERT INTO')){messages.push({id:args[0],handle:args[3],body:args[4],created_at:args[5]});return[{}]}
  throw Error('unexpected SQL');
 }};
 const factory=new Function('app','rateLimit','socialInteractionsInit','socialInteractionsState','socialInteractionsPool','restoreOryonSessionFromRememberCookie','process','crypto',server.slice(start,end));
 factory(app,()=>((req,res,next)=>next()),Promise.resolve(),'active',pool,async()=>null,{env:{NODE_ENV:'production'}},{randomUUID:()=> '00000000-0000-4000-8000-0000000000ff'});
 const res=()=>({statusCode:200,status(n){this.statusCode=n;return this},set(){return this},json(x){this.data=x;return this}});
 const publicRead=res();await routes.get['/api/swapp-tv/chat']({session:{},headers:{}},publicRead);
 assert.equal(publicRead.statusCode,200);assert.deepEqual(publicRead.data.messages,[]);
 const denied=res();await routes.post['/api/swapp-tv/chat']({headers:{origin:'https://not-swapp.test'},session:{},body:{body:'Hello'}},denied);
 assert.equal(denied.statusCode,403);
 const guest=res();await routes.post['/api/swapp-tv/chat']({headers:{origin:'https://swapp.tv'},session:{},body:{body:'Hello'}},guest);
 assert.equal(guest.statusCode,401);
 const member=res();await routes.post['/api/swapp-tv/chat']({headers:{origin:'https://swapp.tv'},session:{oryonUser:{id:'id_1',login:'membre_1'}},body:{body:'Bonjour SWAPP TV'}},member);
 assert.equal(member.statusCode,201);
 const readBack=res();await routes.get['/api/swapp-tv/chat']({headers:{},session:{}},readBack);
 assert.equal(readBack.data.messages[0].body,'Bonjour SWAPP TV');
});