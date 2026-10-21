'use strict';
// SWAPP TV queue, independent from Oryon/personal channels. All mutations are MySQL backed.
const DDL=`CREATE TABLE IF NOT EXISTS swapp_tv_queue (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id VARCHAR(80) NOT NULL,
 creator_login VARCHAR(40) NOT NULL,
 twitch_login VARCHAR(40) NOT NULL,
 game_name VARCHAR(100) NOT NULL,
 status ENUM('waiting','on_air','completed','left','skipped') NOT NULL DEFAULT 'waiting',
 active_user VARCHAR(80) UNIQUE DEFAULT NULL,
 joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 started_at DATETIME DEFAULT NULL,
 ended_at DATETIME DEFAULT NULL,
 INDEX idx_tv_order (status,joined_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
function tvError(message,status=400){const e=new Error(message);e.status=status;return e}
function ownerOf(user){
 const id=String(user?.id||''),login=String(user?.login||''),twitch=String(user?.twitch_link?.login||'');
 if(!/^[a-zA-Z0-9_-]{3,80}$/.test(id)||!/^[a-z0-9_-]{3,40}$/.test(login))throw tvError('swapp_account_required',401);
 if(!/^[a-z0-9_]{3,40}$/.test(twitch))throw tvError('verified_twitch_link_required',403);
 return {id,login,twitch};
}
function publicRow(r){return {id:Number(r.id),creator_login:r.creator_login,twitch_login:r.twitch_login,game:r.game_name,status:r.status,joined_at:r.joined_at,started_at:r.started_at||null}}
function createTvQueue({getPool}={}){
 if(typeof getPool!=='function')throw Error('tv_pool_required');
 let schema;
 async function ready(){const pool=getPool();if(!pool)throw tvError('tv_storage_unavailable',503);if(!schema)schema=pool.query(DDL).catch(e=>{schema=null;throw e});await schema;return pool}
 async function enter(user,game){
  const who=ownerOf(user),name=String(game||'').trim().replace(/\s+/g,' ');
  if(name.length<2||name.length>100)throw tvError('invalid_game');
  const pool=await ready();
  try{
   const [r]=await pool.execute("INSERT INTO swapp_tv_queue(user_id,creator_login,twitch_login,game_name,active_user) VALUES (?,?,?,?,?)",[who.id,who.login,who.twitch,name,who.id]);
   return {id:Number(r.insertId),status:'waiting'};
  }catch(e){if(e.code==='ER_DUP_ENTRY')throw tvError('already_in_queue',409);throw e}
 }
 async function leave(user){const who=ownerOf(user),pool=await ready();const [r]=await pool.execute("UPDATE swapp_tv_queue SET status='left',active_user=NULL,ended_at=UTC_TIMESTAMP() WHERE user_id=? AND status='waiting'",[who.id]);return {left:r.affectedRows>0}}
 async function state(userId){
  const pool=await ready();
  const [onAir]=await pool.execute("SELECT id,creator_login,twitch_login,game_name,status,joined_at,started_at FROM swapp_tv_queue WHERE status='on_air' ORDER BY started_at DESC LIMIT 1");
  const [waiting]=await pool.execute("SELECT id,creator_login,twitch_login,game_name,status,joined_at,started_at FROM swapp_tv_queue WHERE status='waiting' ORDER BY joined_at ASC,id ASC LIMIT 100");
  return {on_air:onAir[0]?publicRow(onAir[0]):null,waiting:waiting.map((r,i)=>({...publicRow(r),position:i+1})),mine:userId?waiting.findIndex(r=>String(r.user_id)===String(userId))+1||null:null};
 }
 return {ready,enter,leave,state};
}
module.exports={DDL,ownerOf,publicRow,createTvQueue};
