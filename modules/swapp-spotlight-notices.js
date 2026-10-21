'use strict';
// Private on-SWAPP recognition for a creator actually promoted in Spotlight.
// Never send unsolicited Twitch whispers or fabricate impressions.
const {MIN_FEATURE_VIEWERS}=require('./swapp-discovery-diversity');
const DDL=`CREATE TABLE IF NOT EXISTS swapp_spotlight_recognition (
  reservation_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  user_id VARCHAR(80) NOT NULL,
  twitch_login VARCHAR(40) NOT NULL,
  game_name VARCHAR(100) NOT NULL,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_recognition_user (user_id,recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
function qualifiesForSpotlight(live){
 return live?.state==='live_verified'&&Number.isFinite(Number(live?.viewers))
   &&Number(live.viewers)>=MIN_FEATURE_VIEWERS;
}
function creatorSpotlightMessage(game,login){
 return {
  title:'Ta chaîne est à l’honneur sur SWAPP',
  body:'Ton live '+String(game||'').slice(0,100)+' a été sélectionné pour un Spotlight SWAPP. Ton direct a été vérifié, et les lecteurs peuvent le découvrir depuis la page du jeu. Merci de faire vivre la communauté !',
  action:'Voir ton Spotlight →',
  url:'/live/twitch/'+encodeURIComponent(String(login||'').slice(0,40))
 };
}
function createSpotlightNotices({getPool}={}){
 if(typeof getPool!=='function')throw Error('spotlight_notices_pool_required');
 let init=null;
 async function ready(){
  const pool=getPool();
  if(!pool)throw Error('spotlight_storage_unavailable');
  if(!init)init=Promise.resolve().then(()=>pool.query(DDL)).catch(e=>{init=null;throw e});
  await init;
  return pool;
 }
 async function record(reservation,live){
  if(!qualifiesForSpotlight(live))return false;
  const id=Number(reservation?.id);
  if(!Number.isSafeInteger(id)||id<1)return false;
  const pool=await ready();
  const [result]=await pool.execute(
   `INSERT IGNORE INTO swapp_spotlight_recognition (reservation_id,user_id,twitch_login,game_name)
    SELECT id,user_id,twitch_login,game_name FROM swapp_creator_spotlight
    WHERE id=? AND status='reserved' AND starts_at<=UTC_TIMESTAMP() AND ends_at>UTC_TIMESTAMP() LIMIT 1`,
   [id]);
  return Number(result.affectedRows||0)>0;
 }
 async function mine(userId){
  if(!/^[a-zA-Z0-9_-]{3,80}$/.test(String(userId||'')))return [];
  const pool=await ready();
  const [rows]=await pool.execute(
   `SELECT twitch_login,game_name,DATE_FORMAT(recorded_at,'%Y-%m-%dT%H:%i:%sZ') AS recorded_at
     FROM swapp_spotlight_recognition WHERE user_id=? ORDER BY recorded_at DESC LIMIT 6`,
   [String(userId)]);
  return rows.map(x=>({...creatorSpotlightMessage(x.game_name,x.twitch_login),recordedAt:x.recorded_at}));
 }
 return {ready,record,mine};
}
module.exports={MIN_FEATURE_VIEWERS,qualifiesForSpotlight,creatorSpotlightMessage,createSpotlightNotices,DDL};
