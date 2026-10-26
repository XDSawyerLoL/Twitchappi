'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {installChannelAudience}=require('../modules/swapp-channel-audience');
function setup({banned=false}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'swapp-redemptions-'));
 const file=path.join(dir,'balances.json');
 fs.writeFileSync(file,JSON.stringify({version:1,rooms:{streamer:{alice:{
  login:'alice',display_name:'Alice',points:300,minutes:60,date:'2026-10-26',earnedToday:300
 }}}}));
 const routes={},emitted=[];
 const users={alice:{id:'alice',login:'alice',display_name:'Alice'},streamer:{id:'owner',login:'streamer'}};
 const sockets=new Map([['chat1',{data:{nativeRoom:'streamer'},request:{session:{oryonUser:users.alice}}}]]);
 const io={on(){},sockets:{sockets},to(room){return {emit:(event,payload)=>emitted.push({room,event,payload})}}};
 installChannelAudience({app:{get:(p,f)=>routes['GET '+p]=f,post:(p,f)=>routes['POST '+p]=f},
 io,getUser:login=>users[login],getNativeRoom:()=>({host:'present'}),isLocalLive:()=>true,
 storageFile:file,getModState:()=>({state:{banned:banned?['alice']:[],muted:[],timeouts:{}}})});
 const call=async({who='alice',reward='cheer',message='',requestId='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',origin='https://swapp.tv'}={})=>{
  const request={session:{oryonUser:users[who]||{login:'fake',id:'fake'}},
   params:{room:'streamer'},headers:{origin,host:'swapp.tv','content-type':'application/json'},
   body:{reward,message,request_id:requestId}};
  const res={code:200,set(){return this},status(n){this.code=n;return this},json(body){this.body=body;return this}};
  await routes['POST /api/swapp/channel-rewards/:room'](request,res);return res;
 };
 const check=()=>JSON.parse(fs.readFileSync(file,'utf8')).rooms.streamer.alice.points;
 const cleanup=()=>fs.rmSync(dir,{recursive:true,force:true});
 return {call,emitted,check,cleanup};
}
test('Spend succeeds only once and emits after debiting actual points',async()=>{
 const f=setup();try{
  const success=await f.call();
  assert.equal(success.code,200);assert.equal(success.body.points,225);
  assert.equal(f.check(),225);assert.equal(f.emitted.length,1);
  assert.equal(f.emitted[0].event,'swapp:channel:redeemed');
  const replay=await f.call();
  assert.notEqual(replay.code,200);assert.equal(f.check(),225);
  assert.equal(f.emitted.length,1);
 }finally{f.cleanup()}
});
test('No transaction for a banned user, unknown account or other origin',async()=>{
 const f=setup({banned:true});try{
  assert.equal((await f.call()).code,403);
  assert.equal((await f.call({origin:'https://attacker.com'})).code,403);
  assert.equal((await f.call({who:'faker'})).code,401);
  assert.equal(f.check(),300);assert.equal(f.emitted.length,0);
 }finally{f.cleanup()}
});
test('No spending without sufficient balance or valid content',async()=>{
 const f=setup();try{
  assert.equal((await f.call({reward:'question',message:'Bonjour ?'})).code,200);
  const remaining=f.check();assert.equal(remaining,50);
  assert.equal((await f.call({reward:'unknown',requestId:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'})).code,400);
  assert.equal(f.check(),remaining);
 }finally{f.cleanup()}
});
test('Game detection has no manual button and publishes confirmed category through existing metadata',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../assets/swapp-browser-studio.js'),'utf8');
 assert.doesNotMatch(src,/make\('button','btn secondary','Détecter le jeu'\)/);
 assert.match(src,/const saved=await save\(live\.title,game,status\)/);
 assert.match(src,/swappManualGame/);
 assert.match(src,/\/api\/swapp\/live\/auto-game/);
});
test('Agenda teaser always enters the real existing Programme tab',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../assets/swapp-channel-showcase.js'),'utf8');
 assert.match(src,/data-swapp-programme-tab/);
 assert.match(src,/tab\.click\(\)/);
 assert.match(src,/window\.location\.assign\(link\.href\)/);
});
