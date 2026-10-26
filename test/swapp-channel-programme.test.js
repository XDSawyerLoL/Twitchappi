'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {installChannelProgramme,expand,validate}=require('../modules/swapp-channel-programme');
function fixture(){
 const owner={id:'owner-1',login:'vnhz',channel_public:true,twitch_link:{id:'123',login:'vnhz'},swapp_channel_programme:[]};
 const users={users:[owner]},routes={},calls=[];let saves=0,unavailable=false;
 const app={get:(p,...f)=>routes['GET '+p]=f.at(-1),post:(p,...f)=>routes['POST '+p]=f.at(-1),delete:(p,...f)=>routes['DELETE '+p]=f.at(-1)};
 installChannelProgramme({app,getUsers:()=>users,findUser:name=>name==='vnhz'?owner:null,
  saveUsers:async()=>{saves++;if(unavailable)throw Error('mysql-down')},
  twitchAPI:async endpoint=>{
   calls.push(endpoint);
   return endpoint.startsWith('streams?')?{data:[{user_login:'vnhz',game_name:'Aion 2'}]}:{data:[]};
  }});
 async function call(method,path,identity=true,body={},origin='https://swapp.tv',id=''){
  const req={params:{login:'vnhz',id},session:identity?{oryonUser:{id:'owner-1',login:'vnhz'}}:{},
   headers:{origin,host:'swapp.tv'},body,get(k){return this.headers[k.toLowerCase()]}};
  const res={code:200,set(){return this},status(n){this.code=n;return this},json(v){this.body=v;return this}};
  await routes[method+' '+path](req,res);return res;
 }
 return {call,owner,users,calls,saves:()=>saves,fail:v=>unavailable=v};
}
const path='/api/swapp/channel/:login/programme';
const event=()=>({title:'Aion 2 PvP',game:'Aion 2',note:'Warfront',start_at:new Date(Date.now()+86400000).toISOString(),duration_minutes:120,repeat:'weekly'});
test('programme is public but write and delete require owner and first-party origin',async()=>{
 const f=fixture();
 assert.equal((await f.call('GET',path,false)).code,200);
 assert.equal((await f.call('POST',path,false,event())).code,401);
 assert.equal((await f.call('POST',path,true,event(),'https://evil.test')).code,403);
 assert.equal((await f.call('DELETE',path+'/:id',false,{},'https://swapp.tv','missing')).code,401);
});
test('owner schedules and deletes weekly streams without paid APIs',async()=>{
 const f=fixture(),saved=await f.call('POST',path,true,event());
 assert.equal(saved.code,200);assert.ok(saved.body.items.length>=4);
 const id=f.owner.swapp_channel_programme[0].id;
 assert.ok((await f.call('GET',path,false)).body.items.every(item=>item.title==='Aion 2 PvP'));
 assert.equal((await f.call('DELETE',path+'/:id',true,{},'https://swapp.tv',id)).code,200);
 assert.equal(f.owner.swapp_channel_programme.length,0);
});
test('invalid dates rejected and persistence failures return 503',async()=>{
 const f=fixture();
 assert.equal((await f.call('POST',path,true,{...event(),start_at:'not-a-date'})).code,400);
 f.fail(true);
 assert.equal((await f.call('POST',path,true,event())).code,503);
 assert.deepEqual(f.owner.swapp_channel_programme,[]);
});
test('game detector uses linked Twitch, and requires the signed-in channel owner',async()=>{
 const f=fixture();
 assert.equal((await f.call('GET','/api/swapp/live/auto-game',false)).code,401);
 const reply=await f.call('GET','/api/swapp/live/auto-game');
 assert.equal(reply.code,200);assert.equal(reply.body.game,'Aion 2');
 assert.equal(reply.body.source,'twitch_live');assert.equal(reply.body.confirmed_live,true);
});
test('programme date checks and weekly expansion remain bounded',()=>{
 assert.throws(()=>validate({...event(),start_at:'bad'}),/invalid_schedule_date/);
 const dates=expand([{...event(),id:'x'}]);
 assert.ok(dates.length<=7);
 assert.ok(dates.every(x=>x.start_at&&x.duration_minutes===120));
});
test('channel frontend has route, owner editor, and Twitch suggestion without image analysis',()=>{
 const fs=require('node:fs'),pathlib=require('node:path');
 const r=file=>fs.readFileSync(pathlib.join(__dirname,'..',file),'utf8');
 const js=r('assets/swapp-channel-programme.js'),studio=r('assets/swapp-browser-studio.js'),html=r('index.html');
 new Function(js);new Function(studio);
 assert.match(js,/history\.pushState/);
 assert.match(js,/swapp-programme-page/);
 assert.match(studio,/\/api\/swapp\/live\/auto-game/);
 assert.match(html,/swapp-channel-programme\.js\?v=/);
});
