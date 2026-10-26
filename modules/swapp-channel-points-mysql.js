'use strict';
/* Transactional points store in existing Hostinger MySQL. */
function createChannelPointsMysql({uri,mysqlFactory,now=Date.now}={}){
 const raw=String(uri||'');
 let url;
 try{url=new URL(raw)}catch(_){throw Error('invalid_channel_points_mysql_url')}
 if(url.protocol!=='mysql:'||!url.hostname||!url.username||!url.pathname||url.pathname==='/')throw Error('invalid_channel_points_mysql_url');
 let pool=null,ready=null;
 const ddl=[
  'CREATE TABLE IF NOT EXISTS swapp_channel_points (',
  'channel_login VARCHAR(40) NOT NULL,',
  'user_id VARCHAR(80) NOT NULL,',
  'login VARCHAR(40) NOT NULL,',
  'display_name VARCHAR(80) NOT NULL,',
  'points INT UNSIGNED NOT NULL DEFAULT 0,',
  'minutes INT UNSIGNED NOT NULL DEFAULT 0,',
  'earned_today SMALLINT UNSIGNED NOT NULL DEFAULT 0,',
  'earn_day CHAR(10) NOT NULL,',
  'updated_at BIGINT NOT NULL,',
  'PRIMARY KEY (channel_login,user_id),',
  'KEY swapp_channel_points_leaderboard (channel_login,points)',
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
 ].join(' ');
 const rewardsDdl=['CREATE TABLE IF NOT EXISTS swapp_channel_redemptions (',
  'channel_login VARCHAR(40) NOT NULL,user_id VARCHAR(80) NOT NULL,',
  'request_id CHAR(36) NOT NULL,reward VARCHAR(40) NOT NULL,',
  'cost INT UNSIGNED NOT NULL,created_at BIGINT NOT NULL,',
  'PRIMARY KEY (channel_login,user_id,request_id),',
  'KEY swapp_redemptions_created (created_at)',
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'].join(' ');
 const queued=new Map();
 async function ensure(){
  if(!ready){
   ready=(async()=>{
    if(!pool){
     const mysql=mysqlFactory||require('mysql2/promise');
     pool=mysql.createPool({uri:raw,connectionLimit:2,waitForConnections:true,queueLimit:60,connectTimeout:5000});
    }
    await pool.query(ddl);return pool;
   })().catch(e=>{ready=null;throw e});
  }
  return ready;
 }
 function rowOut(row){
  return {login:String(row.login||''),display_name:String(row.display_name||''),points:Number(row.points||0),
   minutes:Number(row.minutes||0),earnedToday:Number(row.earned_today||0),
   date:String(row.earn_day||''),updatedAt:Number(row.updated_at||0)};
 }
 async function getRoom(room){
  const p=await ensure();
  const [rows]=await p.execute('SELECT user_id,login,display_name,points,minutes,earned_today,earn_day,updated_at FROM swapp_channel_points WHERE channel_login=? ORDER BY minutes DESC,points DESC LIMIT 5000',[room]);
  const out=Object.create(null);
  for(const row of rows||[])out[String(row.user_id)]=rowOut(row);
  return out;
 }
 // Bounded read for the requested follower page. No full 5,000-wallet hydration.
 async function getByIds(room,ids){
  const filtered=[...new Set((Array.isArray(ids)?ids:[]).map(String).filter(id=>id.length>0&&id.length<=80))].slice(0,50);
  const result=Object.create(null);
  if(!filtered.length)return result;
  const p=await ensure(),placeholders=filtered.map(()=>'?').join(',');
  const [rows]=await p.execute(
   'SELECT user_id,points,minutes FROM swapp_channel_points WHERE channel_login=? AND user_id IN ('+placeholders+')',
   [room,...filtered]
  );
  for(const row of rows||[])result[String(row.user_id)]={points:Number(row.points)||0,minutes:Number(row.minutes)||0};
  return result;
 }

 let redemptionsReady=null;
 async function ensureRedemptions(){
  if(!redemptionsReady)redemptionsReady=ensure().then(p=>p.query(rewardsDdl)).catch(e=>{redemptionsReady=null;throw e});
  await redemptionsReady;
 }
 // Uses the same per-user queue and SQL row locks as credit().
 // An idempotency token prevents accidental double billing after retries/restarts.
 async function spend(room,viewer,reward,cost,requestId){
  const key=room+'|'+viewer.id;
  const operation=async()=>{
   await ensureRedemptions();
   const p=await ensure(),conn=await p.getConnection();
   try{
    await conn.beginTransaction();
    const [existing]=await conn.execute(
     'SELECT request_id FROM swapp_channel_redemptions WHERE channel_login=? AND user_id=? AND request_id=? LIMIT 1',
     [room,viewer.id,requestId]
    );
    if(existing?.length){await conn.rollback();return {ok:false,reason:'duplicate'};}
    const [rows]=await conn.execute(
     'SELECT points FROM swapp_channel_points WHERE channel_login=? AND user_id=? FOR UPDATE',[room,viewer.id]);
    const balance=Number(rows?.[0]?.points)||0;
    if(balance<cost){await conn.rollback();return {ok:false,reason:'insufficient',points:balance};}
    // Serializes unique requests under the locked balance row.
    await conn.execute('UPDATE swapp_channel_points SET points=?,updated_at=? WHERE channel_login=? AND user_id=?',
     [balance-cost,now(),room,viewer.id]);
    await conn.execute('INSERT INTO swapp_channel_redemptions (channel_login,user_id,request_id,reward,cost,created_at) VALUES (?,?,?,?,?,?)',
     [room,viewer.id,requestId,reward,cost,now()]);
    await conn.commit();
    return {ok:true,points:balance-cost};
   }catch(error){try{await conn.rollback()}catch(_){}throw error}
   finally{conn.release();}
  };
  const prior=queued.get(key)||Promise.resolve(),task=prior.catch(()=>{}).then(operation);
  queued.set(key,task);
  try{return await task}finally{if(queued.get(key)===task)queued.delete(key)}
 }
 async function credit(room,viewer,utcDay,cap=300,amount=5){
  const key=room+'|'+viewer.id;
  const operation=async()=>{
   const p=await ensure(),conn=await p.getConnection();
   try{
    await conn.beginTransaction();
    const [rows]=await conn.execute('SELECT points,minutes,earned_today,earn_day FROM swapp_channel_points WHERE channel_login=? AND user_id=? FOR UPDATE',[room,viewer.id]);
    const first=rows?.[0]||null,used=first?.earn_day===utcDay?Number(first.earned_today)||0:0;
    if(used>=cap){await conn.rollback();return {awarded:false,row:first?rowOut({...first,login:viewer.login,display_name:viewer.display_name,updated_at:now()}):null}}
    const gain=Math.min(amount,cap-used),updatedAt=now();
    const points=(Number(first?.points)||0)+gain,minutes=(Number(first?.minutes)||0)+1;
    await conn.execute(
     'INSERT INTO swapp_channel_points (channel_login,user_id,login,display_name,points,minutes,earned_today,earn_day,updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE login=VALUES(login),display_name=VALUES(display_name),points=VALUES(points),minutes=VALUES(minutes),earned_today=VALUES(earned_today),earn_day=VALUES(earn_day),updated_at=VALUES(updated_at)',
     [room,viewer.id,viewer.login,viewer.display_name,points,minutes,used+gain,utcDay,updatedAt]
    );
    await conn.commit();
    return {awarded:true,row:{login:viewer.login,display_name:viewer.display_name,points,minutes,earnedToday:used+gain,date:utcDay,updatedAt}};
   }catch(e){try{await conn.rollback()}catch(_){}throw e}
   finally{conn.release()}
  };
  const prior=queued.get(key)||Promise.resolve();
  const task=prior.catch(()=>{}).then(operation);
  queued.set(key,task);
  try{return await task}finally{if(queued.get(key)===task)queued.delete(key)}
 }
 return {ensure,getRoom,getByIds,credit,spend};
}
module.exports={createChannelPointsMysql};
