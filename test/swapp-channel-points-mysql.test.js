'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createChannelPointsMysql}=require('../modules/swapp-channel-points-mysql');

function mockDatabase(){
 const records=new Map(),statements=[];
 const connection={
  async beginTransaction(){statements.push('BEGIN')},
  async commit(){statements.push('COMMIT')},
  async rollback(){statements.push('ROLLBACK')},
  release(){},
  async execute(sql,params){
   statements.push(sql);
   if(sql.startsWith('SELECT points,minutes')){
    const value=records.get(params[0]+'|'+params[1]);return [value?[value]:[]];
   }
   if(sql.startsWith('INSERT INTO swapp_channel_points')){
    const [channel_login,user_id,login,display_name,points,minutes,earned_today,earn_day,updated_at]=params;
    records.set(channel_login+'|'+user_id,{login,display_name,points,minutes,earned_today,earn_day,updated_at,user_id});
    return [{affectedRows:1}];
   }
   throw Error('unknown transaction statement');
  }
 };
 const pool={
  async query(sql){statements.push(sql);return [[]]},
  async execute(sql,params){
   statements.push(sql);
   if(sql.startsWith('SELECT user_id,login')){
    return [[...records.entries()].filter(([key])=>key.startsWith(params[0]+'|')).map(([,v])=>v)];
   }
   throw Error('unknown query');
  },
  async getConnection(){return connection}
 };
 return {factory:{createPool(){return pool}},records,statements};
}

test('MySQL channel points are transaction-backed and isolated per streamer',async()=>{
 const db=mockDatabase();
 const store=createChannelPointsMysql({uri:'mysql://unit:test@localhost:3306/swapp',mysqlFactory:db.factory,now:()=>123456789});
 const viewer={id:'user_1',login:'viewer',display_name:'Spectateur'};
 const first=await store.credit('streamer1',viewer,'2026-10-25');
 assert.equal(first.awarded,true);assert.equal(first.row.points,5);
 const second=await store.credit('streamer1',viewer,'2026-10-25');
 assert.equal(second.row.points,10);
 const other=await store.credit('streamer2',viewer,'2026-10-25');
 assert.equal(other.row.points,5);
 const room=await store.getRoom('streamer1');
 assert.equal(room.user_1.points,10);
 assert.equal(room.user_1.minutes,2);
 assert.ok(db.statements.some(s=>s.includes('CREATE TABLE IF NOT EXISTS swapp_channel_points')));
 assert.ok(db.statements.some(s=>s.includes('FOR UPDATE')));
 assert.equal(db.statements.filter(s=>s==='COMMIT').length,3);
});
test('points cap cannot be exceeded and refreshes on UTC date change',async()=>{
 const db=mockDatabase();
 const store=createChannelPointsMysql({uri:'mysql://unit:test@localhost:3306/swapp',mysqlFactory:db.factory});
 const viewer={id:'viewer1',login:'viewer',display_name:'V'};
 for(let n=0;n<60;n++)await store.credit('creator',viewer,'2026-10-25');
 const blocked=await store.credit('creator',viewer,'2026-10-25');
 assert.equal(blocked.awarded,false);
 assert.equal((await store.getRoom('creator')).viewer1.points,300);
 const next=await store.credit('creator',viewer,'2026-10-26');
 assert.equal(next.awarded,true);
 assert.equal((await store.getRoom('creator')).viewer1.points,305);
});
test('invalid connection URL is refused without local fallback',()=>{
 assert.throws(()=>createChannelPointsMysql({uri:'https://not-mysql.example'}),/invalid_channel_points_mysql_url/);
});
