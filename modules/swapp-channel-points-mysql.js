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
  const [rows]=await p.execute('SELECT user_id,login,display_name,points,minutes,earned_today,earn_day,updated_at FROM swapp_channel_points WHERE channel_login=? ORDER BY points DESC LIMIT 5000',[room]);
  const out=Object.create(null);
  for(const row of rows||[])out[String(row.user_id)]=rowOut(row);
  return out;
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
 return {ensure,getRoom,credit};
}
module.exports={createChannelPointsMysql};
