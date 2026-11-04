'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createCreatorAutopilot,planSlots,requestOriginOk}=require('../modules/swapp-creator-autopilot');
const NOW=Date.parse('2026-11-05T12:00:00Z');
const programme=(overrides={})=>[{
 id:'calendar-1',title:'Where Winds Meet',game:'Where Winds Meet',
 start_at:'2026-11-05T14:10:00.000Z',duration_minutes:120,repeat:'none',
 timezone:'Europe/Paris',...overrides
}];
const creator=()=>({
 id:'userabc',login:'samplecreator',
 twitch_link:{id:'123456',login:'samplecreator'},swapp_channel_programme:programme(),
 swapp_creator_autopilot_enabled:true,swapp_creator_autopilot_twitch_id:'123456'
});
function pilot({eligible=true,confirmGame=true,linkId='123456',featureEnabled=true}={}){
 const user=creator();
 user.swapp_creator_autopilot_enabled=eligible;
 user.swapp_creator_autopilot_twitch_id=linkId;
 const data={users:[user]},routes=new Map(),rows=[],audit=[],queries=[];
 let saved=0;
 const app={get:(path,cb)=>routes.set('GET '+path,cb),post:(path,...cbs)=>routes.set('POST '+path,cbs.at(-1))};
 const pool={
  query:async sql=>{queries.push(sql);return [[]]},
  execute:async(sql,params)=>{
   if(sql.includes('INSERT IGNORE INTO swapp_creator_autopilot_actions'))audit.push(params);
   if(sql.includes('SELECT programme_id,game_name'))return [audit.map(a=>({programme_id:a[2],game_name:a[3],spotlight_id:a[5],start_at:a[4]}))];
   return [[]];
  }
 };
 const spotlightStore={
  mine:async()=>rows.map(x=>({id:x.id,start_at:x.start_at,game:x.game})),
  reserve:async({user,game,start_at,twitchGameId})=>{
   const row={id:rows.length+1,game,start_at,twitchGameId,user:user.login};rows.push(row);return row;
  }
 };
 const service=createCreatorAutopilot({
  app,getUsers:()=>data,findUser:login=>login===user.login?user:null,
  saveUsers:async()=>{saved++},
  spotlightStore,spotlightPublishedGame:async game=>{
   if(!confirmGame)throw Error('spotlight_game_not_covered');
  },
  getExactTwitchGameId:async game=>game==='Where Winds Meet'?'7890':null,
  getPool:()=>pool,isReady:()=>true,featureEnabled,now:()=>NOW,schedule:false,
  logger:{warn:()=>{}}
 });
 const req={session:{oryonUser:{id:user.id,login:user.login}},
  get:header=>({'origin':'https://swapp.tv','host':'swapp.tv','content-type':'application/json','x-swapp-creator-action':'autopilot'}[header]),body:{enabled:true}};
 function response(){
  return {statusCode:200,body:null,set:()=>{},status(n){this.statusCode=n;return this},
    json(v){this.body=v;return this}};
 }
 return {service,user,data,rows,audit,queries,routes,req,response,saveCount:()=>saved};
}
test('Plans a full half-hour inside a creator-provided schedule, never inventing dates',()=>{
 const x=planSlots(programme(),NOW);
 assert.equal(x.length,1);
 assert.equal(x[0].start_at,'2026-11-05T14:30:00.000Z');
 assert.equal(planSlots(programme({duration_minutes:15}),NOW).length,0);
 assert.equal(planSlots(programme({game:''}),NOW).length,0);
 assert.equal(planSlots(programme({start_at:'2026-11-05T12:20:00.000Z'}),NOW).length,0);
});
test('Does not accept cross-origin activation',()=>{
 assert.equal(requestOriginOk({get:h=>h==='origin'?'https://attacker.example':'swapp.tv'}),false);
 assert.equal(requestOriginOk({get:h=>h==='origin'?'https://swapp.tv':'swapp.tv'}),true);
});
test('Never schedules without explicit creator opt-in',async()=>{
 const p=pilot({eligible:false});
 const result=await p.service.tick();
 assert.equal(result.scheduled,0);assert.equal(p.rows.length,0);
});
test('Creates exactly one verified Spotlight and records it without audience claims',async()=>{
 const p=pilot();
 const first=await p.service.tick();
 assert.equal(first.state,'completed');assert.equal(first.scheduled,1);
 assert.equal(p.rows[0].game,'Where Winds Meet');assert.equal(p.rows[0].twitchGameId,'7890');
 assert.equal(p.audit.length,1);assert.equal(p.audit[0][0],'userabc');
 await p.service.tick();
 assert.equal(p.rows.length,1,'A later cycle cannot duplicate the reserved timeslot');
});
test('Does not schedule when the news game is not published on SWAPP',async()=>{
 const p=pilot({confirmGame:false});
 const result=await p.service.tick();
 assert.equal(result.scheduled,0);assert.equal(p.rows.length,0);
});
test('Requires opt-in to match the currently linked Twitch account',async()=>{
 const p=pilot({linkId:'99999'});
 assert.equal((await p.service.tick()).scheduled,0);
 assert.equal(p.rows.length,0);
});
test('The switch to OFF needs no Twitch link, is stored and stops future bookings',async()=>{
 const p=pilot();
 p.user.twitch_link={};
 p.req.body={enabled:false};
 const res=p.response();
 await p.routes.get('POST /api/creator/autopilot')(p.req,res);
 assert.equal(res.statusCode,200);
 assert.equal(p.user.swapp_creator_autopilot_enabled,false);
 assert.equal(p.saveCount(),1);
 assert.equal((await p.service.tick()).scheduled,0);
});
test('Server feature flag fails closed without writing account data',async()=>{
 const p=pilot({featureEnabled:false});
 const res=p.response();
 await p.routes.get('POST /api/creator/autopilot')(p.req,res);
 assert.equal(res.statusCode,503);
 assert.equal(p.saveCount(),0);
});
test('Status endpoint rejects anonymous requests',async()=>{
 const p=pilot();const res=p.response();
 await p.routes.get('GET /api/creator/autopilot')({session:{},get:p.req.get},res);
 assert.equal(res.statusCode,401);assert.equal(res.body.success,false);
});

test('Can revoke an older opt-in while Hostinger feature is disabled and Twitch changed',async()=>{
 const p=pilot({featureEnabled:false,linkId:'999999'});
 p.req.body={enabled:false};
 const res=p.response();
 await p.routes.get('POST /api/creator/autopilot')(p.req,res);
 assert.equal(res.statusCode,200);
 assert.equal(p.user.swapp_creator_autopilot_enabled,false);
 assert.equal(p.saveCount(),1);
});
