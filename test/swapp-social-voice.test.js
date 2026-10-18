'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {installSocialVoice,signTicket,verifyTicket,MAX_PARTICIPANTS,NAMESPACE}=
 require('../modules/swapp-social-voice');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const SECRET='a sufficiently long private SWAPP test secret';
const ROOM='123e4567-e89b-42d3-a456-426614174000';
const origin='http://localhost:3000';

function fakeServer(){
 const endpoints={},namespaces={};
 const app={post:(url,fn)=>{endpoints[url]=fn}};
 const io={of(name){
  const peers=new Map(),rooms=new Map(),listeners={};
  const ns={sockets:peers,adapter:{rooms},use(fn){this.auth=fn},on(name,fn){listeners[name]=fn},listeners};
  namespaces[name]=ns;return ns;
 }};
 const db={async execute(sql,params){
  assert.match(sql,/FROM swapp_social_rooms WHERE id=\?/);
  return [[params[0]===ROOM?{id:ROOM}:undefined].filter(Boolean)];
 }};
 installSocialVoice({
  app,io,restoreSession:async req=>req.user||null,
  getPool:()=>db,secret:SECRET,iceServers:()=>[{urls:['stun:example.org']}]
 });
 const ns=namespaces[NAMESPACE];
 const socket=(id,login)=>{
  const events={},out=[];
  const sock={id,connected:true,data:{},handshake:{headers:{origin},auth:{
   ticket:signTicket({id,login},SECRET)
  }},
   on:(name,fn)=>{events[name]=fn},
   emit:(name,value)=>{out.push([name,value])},
   join(name){if(!ns.adapter.rooms.has(name))ns.adapter.rooms.set(name,new Set());ns.adapter.rooms.get(name).add(id)},
   leave(name){ns.adapter.rooms.get(name)?.delete(id)},
   to(name){return{emit:(event,payload)=>out.push(['broadcast',name,event,payload])}}
  };
  sock.events=events;sock.out=out;
  ns.sockets.set(id,sock);
  ns.auth(sock,error=>{if(error)throw error});
  ns.listeners.connection(sock);
  return sock;
 };
 return {endpoints,ns,socket};
}
async function join(socket,roomId=ROOM){
 return new Promise(resolve=>socket.events['voice:join']({roomId},resolve));
}

test('audio tickets expire, are signed, and reject modification',()=>{
 const ticket=signTicket({id:'user_123',login:'player123'},SECRET,1000);
 assert.deepEqual(verifyTicket(ticket,SECRET,2000),{id:'user_123',handle:'player123'});
 assert.equal(verifyTicket(ticket,SECRET,92000),null);
 assert.equal(verifyTicket(ticket+'spoof',SECRET,2000),null);
 assert.equal(verifyTicket(ticket,'incorrect secret',2000),null);
 assert.equal(verifyTicket('garbage',SECRET),null);
});

test('ticket endpoint accepts SWAPP accounts only and rejects cross-site POST',async()=>{
 const {endpoints}=fakeServer();
 const handler=endpoints['/api/swapp/social/voice-ticket'];
 const request=(origin,user)=>({get:()=>origin,user,session:{}});
 const response=()=>({
  code:200,set(){return this},status(n){this.code=n;return this},
  json(value){this.payload=value;return this}
 });
 const deny=response();await handler(request('https://attacker.example',{id:'42',login:'member42'}),deny);
 assert.equal(deny.code,403);
 const anon=response();await handler(request(origin,null),anon);
 assert.equal(anon.code,401);
 const member=response();await handler(request(origin,{id:'42',login:'member42'}),member);
 assert.equal(member.code,200);
 assert.deepEqual(verifyTicket(member.payload.ticket,SECRET),{id:'42',handle:'member42'});
 assert.equal(member.payload.maxParticipants,MAX_PARTICIPANTS);
});

test('only real database rooms can be joined; full rooms refuse new listeners',async()=>{
 const {socket}=fakeServer();
 const invalid=socket('first','player1');
 assert.equal((await join(invalid,'not-a-uuid')).error,'invalid_room');
 assert.equal((await join(invalid,'523e4567-e89b-42d3-a456-426614174000')).error,'not_found');
 const clients=[];
 for(let i=0;i<MAX_PARTICIPANTS;i++){
  const member=socket('sid'+i,'member'+i);
  clients.push(member);
  assert.equal((await join(member)).ok,true);
 }
 const late=socket('seventh','player7');
 assert.equal((await join(late)).error,'room_full');
 clients[0].events['voice:leave']();
 assert.equal((await join(late)).ok,true);
});

test('WebRTC signalling never crosses room membership boundaries',async()=>{
 const {socket}=fakeServer();
 const a=socket('alpha','player1'),b=socket('beta','player2'),outsider=socket('outsider','player3');
 await join(a);await join(b);
 const payload={to:'beta',kind:'offer',data:{type:'offer',sdp:'audio'}};
 outsider.events['voice:signal'](payload);
 assert.equal(b.out.filter(x=>x[0]==='voice:signal').length,0);
 a.events['voice:signal'](payload);
 assert.deepEqual(b.out.filter(x=>x[0]==='voice:signal')[0][1],{
  from:'alpha',kind:'offer',data:payload.data
 });
 a.events['voice:signal']({...payload,data:{sdp:'x'.repeat(13000)}});
 assert.equal(b.out.filter(x=>x[0]==='voice:signal').length,1);
});

test('SOCIAL voice is integrated in real rooms and never opens microphone without a click',()=>{
 const hub=read('modules/swapp-hubs.js');
 const interactions=read('assets/swapp-social-interactions.js');
 const ui=read('assets/swapp-social-voice.js');
 const server=read('server.js');
 assert.match(hub,/socket\.io\/socket\.io\.js/);
 assert.match(hub,/swapp-social-voice\.js/);
 assert.match(interactions,/ssi:room-selected/);
 assert.match(server,/installSocialVoice\(/);
 assert.match(ui,/joinButton\.addEventListener\('click'/);
 assert.match(ui,/navigator\.mediaDevices\.getUserMedia/);
 assert.match(ui,/media\?\.getTracks\(\)\.forEach\(track=>track\.stop\(\)\)/);
 assert.match(ui,/window\.addEventListener\('pagehide',leave\)/);
 assert.doesNotMatch(ui,/MediaRecorder/);
});
