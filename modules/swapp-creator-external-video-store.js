'use strict';
/* Persistent, metadata-only storage for creator external videos.
 * Hostinger MySQL is the source of truth; never download or proxy media.
 */
const {normalizeVideos}=require('../lib/swapp-creator-external-videos');
const LOGIN=/^[a-z0-9_-]{2,48}$/;
function createCreatorVideoStore({uri=process.env.SWAPP_MYSQL_URL,mysqlFactory}={}){
 if(!uri||!/^mysql:\/\//.test(uri))throw Error('creator_video_mysql_not_configured');
 let pool,initializing;
 async function ready(){
  if(!initializing)initializing=(async()=>{
   const driver=mysqlFactory||require('mysql2/promise');
   pool=driver.createPool({uri,connectionLimit:2,waitForConnections:true,queueLimit:30,connectTimeout:5000});
   await pool.query('CREATE TABLE IF NOT EXISTS swapp_creator_external_videos (creator_login VARCHAR(48) NOT NULL, position TINYINT UNSIGNED NOT NULL, provider VARCHAR(12) NOT NULL, video_id VARCHAR(240) NOT NULL, url VARCHAR(320) NOT NULL, title VARCHAR(120) NOT NULL DEFAULT \'\', pinned TINYINT(1) NOT NULL DEFAULT 0, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (creator_login,position)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
   return pool;
  })().catch(error=>{initializing=null;throw error});
  return initializing;
 }
 function login(value){const s=String(value||'').toLowerCase();if(!LOGIN.test(s))throw Error('invalid_creator_login');return s}
 async function list(creator){
  const p=await ready(),name=login(creator);
  const [rows]=await p.execute('SELECT provider,video_id AS id,url,title,position,pinned FROM swapp_creator_external_videos WHERE creator_login=? ORDER BY position ASC LIMIT 5',[name]);
  return rows.map(r=>({...r,pinned:!!r.pinned}));
 }
 async function replace(creator,items){
  const name=login(creator),videos=normalizeVideos(items);
  if(videos.filter(v=>v.pinned).length>1)throw Error('Une seule vidéo à la une.');
  const p=await ready(),conn=await p.getConnection();
  try{
   await conn.beginTransaction();
   await conn.execute('DELETE FROM swapp_creator_external_videos WHERE creator_login=?',[name]);
   for(const v of videos)await conn.execute('INSERT INTO swapp_creator_external_videos (creator_login,position,provider,video_id,url,title,pinned) VALUES (?,?,?,?,?,?,?)',[name,v.position,v.provider,v.id,v.url,v.title,v.pinned?1:0]);
   await conn.commit();
  }catch(e){await conn.rollback();throw e}finally{conn.release()}
  return videos;
 }
 return {list,replace};
}
module.exports={createCreatorVideoStore};
