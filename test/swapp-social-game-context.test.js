'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {gameFromQuery,gameRoomQuery,visibleGameRooms}=require('../modules/swapp-social-game-context');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('game room filters only accept valid explicit game names',()=>{
 assert.equal(gameFromQuery('  Hades II  '),'Hades II');
 for(const bad of ['', 'x', 'X'.repeat(66),null,{},['Fortnite']])
  assert.equal(gameFromQuery(bad),'');
 const q=gameRoomQuery('GTA VI');
 assert.equal(q.game,'GTA VI');
 assert.ok(q.args.includes('Grand Theft Auto VI'));
 assert.ok(q.args.includes('GTA 6'));
 assert.equal((q.clause.match(/\?/g)||[]).length,q.args.length);
 assert.ok(!q.clause.includes('GTA VI'),'room filters must use SQL parameters');
 assert.deepEqual(gameRoomQuery(''),{game:'',clause:'',args:[]});
});

test('room identity never merges sequels, remasters or an unrelated game',()=>{
 const rooms=[
  {id:'a',game:'Hades'},{id:'b',game:'Hades II'},
  {id:'c',game:'Planet Zoo'},{id:'d',game:'Planet Zoo II'},
  {id:'e',game:'GTA 6'},{id:'f',game:'Grand Theft Auto VI'},
  {id:'g',game:'The Witcher 3 Remastered'},{id:'h',game:'The Witcher 3'}
 ];
 assert.deepEqual(visibleGameRooms(rooms,'Hades').map(x=>x.id),['a']);
 assert.deepEqual(visibleGameRooms(rooms,'Planet Zoo 2').map(x=>x.id),['d']);
 assert.deepEqual(visibleGameRooms(rooms,'GTA VI').map(x=>x.id),['e','f']);
 assert.deepEqual(visibleGameRooms(rooms,'The Witcher 3: Wild Hunt Remastered').map(x=>x.id),['g']);
 assert.equal(visibleGameRooms(rooms,'Fortnite').length,0);
 assert.equal(visibleGameRooms(rooms,'').length,rooms.length);
});

test('MySQL room queries restrict membership before game filtering and keep credentials private',async()=>{
 const code=read('modules/swapp-social-mysql.js');
 assert.match(code,/WHERE \(p\.room_id IS NULL OR EXISTS/);
 assert.match(code,/membership\.user_id=\?\)\) /);
 assert.match(code,/filter\.clause\+' ORDER BY r\.created_at DESC LIMIT 40'/);
 assert.match(code,/\[req\.member\.id,\.\.\.filter\.args\]/);
 assert.match(code,/visibleGameRooms\(rooms,filter\.game\)/);
 assert.match(code,/private, no-store/);
 assert.match(code,/if\(requested!==undefined&&!gameFromQuery\(requested\)\)/);
 assert.doesNotMatch(code,/r\.game LIKE \?|LOWER\(r\.name\) LIKE/i);
 // Force a route call on the real module with a fake query function.
 const calls=[],handlers=new Map();
 const router={
  use(){return this},
  get(name,fn){handlers.set('GET '+name,fn);return this},
  post(name,fn){handlers.set('POST '+name,fn);return this}
 };
 const express={Router:()=>router};
 const pool={execute:async(sql,args)=>{
  calls.push({sql,args});
  return [[{id:'real',name:'Salon du jeu',game:'GTA 6',created_at:1,message_count:0,personal_room:null},
           {id:'wrong',name:'Autre jeu',game:'GTA V',created_at:1,message_count:0,personal_room:null}]];
 }};
 require('../modules/swapp-social-mysql').createSocialMysqlInteractions({
  express,restoreSession:async()=>({id:'owner',login:'owner'}),pool,clock:()=>100
 });
 const route=handlers.get('GET /rooms');
 assert.equal(typeof route,'function');
 const req={query:{game:'GTA VI'},member:{id:'owner'}};
 const res={headersSent:false,set(k,v){this[k]=v;return this},json(value){this.body=value;return this},status(code){this.statusCode=code;return this}};
 await route(req,res);
 assert.equal(res.body.rooms.length,1);
 assert.equal(res.body.rooms[0].id,'real');
 assert.equal(res.body.game,'GTA VI');
 assert.equal(calls[0].args[0],'owner');
 assert.ok(calls[0].args.includes('GTA 6'));
 assert.ok(calls[0].sql.includes('p.room_id IS NULL OR EXISTS'));
 assert.equal(res['Cache-Control'],'private, no-store');
 const badRes={...res,body:null,statusCode:null};
 await route({query:{game:'X'.repeat(66)},member:{id:'owner'}},badRes);
 assert.equal(badRes.statusCode,400);
 assert.equal(calls.length,1,'invalid input must not reach MySQL');
});

test('fallback store filters before its 40-room pagination and retains auth',()=>{
 const code=read('modules/swapp-social-interactions.js');
 assert.match(code,/router\.get\('\/rooms',auth/);
 assert.match(code,/visibleGameRooms\(data\.rooms,game\)\.slice\(-40\)/);
 assert.match(code,/private, no-store/);
});

test('game deep links open the actual rooms, never auto-join voice or override article reposts',()=>{
 const app=read('assets/swapp-social-native/app.js');
 const widget=read('assets/swapp-social-interactions.js');
 const hubs=read('modules/swapp-hubs.js');
 assert.match(app,/params\.get\('share'\)!=='news'/);
 assert.match(app,/if\(gameRooms\)setView\('rooms','Salons · '\+requestedGame\)/);
 assert.match(widget,/roomGameFilter=initialGame/);
 assert.match(widget,/req\('rooms'\+\(filter\?'\?game='\+encodeURIComponent\(filter\):''\)\)/);
 assert.match(widget,/data-action="toggle-game-rooms"/);
 assert.match(widget,/Aucun salon accessible pour /);
 assert.match(widget,/if\(requestId!==roomRequestId\)return/);
 assert.match(widget,/if\(field&&!field\.value\.trim\(\)\)field\.value=roomGameFilter/);
 assert.match(widget,/await acceptInviteLink\(\)/);
 assert.doesNotMatch(widget,/getUserMedia\(/);
 assert.match(hubs,/swapp-social-interactions\.js\?v=20261019-game-rooms-v2/);
 assert.match(hubs,/swapp-social-native\/app\.js\?v=20261019-game-rooms-v2/);
});
