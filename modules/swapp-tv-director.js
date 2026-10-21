'use strict';
// Shared TV director. No candidate can go on air without positive live verification.
// All transitions are serialised by a single MySQL row lock, across Node workers.
const DDL=`CREATE TABLE IF NOT EXISTS swapp_tv_director (
 id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
 current_queue_id BIGINT UNSIGNED DEFAULT NULL,
 started_at DATETIME DEFAULT NULL,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
const MAX_AIR_SECONDS=10*60;
function choice(rows,{recentUsers=[]}={}){
 const recent=new Set(recentUsers.map(String));
 const eligible=rows.filter(x=>x&&x.status==='waiting'&&!recent.has(String(x.user_id))&&/^[a-z0-9_]{3,40}$/.test(String(x.twitch_login||'')));
 return eligible.sort((a,b)=>new Date(a.joined_at)-new Date(b.joined_at)||Number(a.id)-Number(b.id))[0]||null;
}
function createDirector({getPool,verifyLive,now=Date.now}={}){
 if(typeof getPool!=='function'||typeof verifyLive!=='function')throw Error('tv_director_dependencies_required');
 async function advance(){
  const pool=getPool();if(!pool)throw Error('tv_storage_unavailable');
  await pool.query(DDL);
  await pool.execute('INSERT IGNORE INTO swapp_tv_director(id) VALUES (1)');
  const db=await pool.getConnection();
  try{
   await db.beginTransaction();
   const [head]=await db.execute('SELECT current_queue_id,started_at FROM swapp_tv_director WHERE id=1 FOR UPDATE');
   if(head[0]?.current_queue_id&&head[0].started_at&&now()-Date.parse(String(head[0].started_at).replace(' ','T').replace(/Z?$/,'Z'))<MAX_AIR_SECONDS*1000){
    await db.commit();return {changed:false,reason:'slot_active'};
   }
   // A completed turn receives a cooldown; it cannot immediately occupy another position.
   await db.execute("UPDATE swapp_tv_queue SET status='completed',active_user=NULL,ended_at=UTC_TIMESTAMP() WHERE id=? AND status='on_air'",[head[0]?.current_queue_id||0]);
   await db.execute('UPDATE swapp_tv_director SET current_queue_id=NULL,started_at=NULL WHERE id=1');
   const [recent]=await db.execute("SELECT user_id FROM swapp_tv_queue WHERE status='completed' AND ended_at>DATE_SUB(UTC_TIMESTAMP(), INTERVAL 60 MINUTE)");
   const [waiting]=await db.execute("SELECT id,user_id,twitch_login,game_name,status,joined_at FROM swapp_tv_queue WHERE status='waiting' ORDER BY joined_at,id LIMIT 100 FOR UPDATE");
   let next=null;
   const tried=new Set();
   while(true){
    const candidate=choice(waiting.filter(x=>!tried.has(x.id)),{recentUsers:recent.map(x=>x.user_id)});
    if(!candidate)break;
    tried.add(candidate.id);
    let verified=false;
    try{verified=(await verifyLive(candidate))===true}catch{}
    if(verified){next=candidate;break}
   }
   if(next){
    await db.execute("UPDATE swapp_tv_queue SET status='on_air',started_at=UTC_TIMESTAMP() WHERE id=? AND status='waiting'",[next.id]);
    await db.execute('UPDATE swapp_tv_director SET current_queue_id=?,started_at=UTC_TIMESTAMP() WHERE id=1',[next.id]);
   }
   await db.commit();return {changed:true,on_air:next?{id:Number(next.id),twitch_login:next.twitch_login,game:next.game_name}:null};
  }catch(error){await db.rollback();throw error}finally{db.release()}
 }
 return {advance};
}
module.exports={DDL,MAX_AIR_SECONDS,choice,createDirector};
