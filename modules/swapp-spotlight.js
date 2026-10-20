'use strict';
// SWAPP Spotlight: first-party, MySQL-only game-time reservations.
// No phantom availability, no Firestore fallback and no autonomous stream hosting.
const {gameSlug}=require('./swapp-game-pages');
const MIN_LEAD_MS=60*60*1000,MAX_AHEAD_MS=45*24*60*60*1000,SLOT_MS=30*60*1000;
const MAX_UPCOMING=3;
const DDL=`CREATE TABLE IF NOT EXISTS swapp_creator_spotlight (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(80) NOT NULL,
  creator_login VARCHAR(40) NOT NULL,
  twitch_user_id VARCHAR(48) NOT NULL,
  twitch_login VARCHAR(40) NOT NULL,
  game_name VARCHAR(100) NOT NULL,
  game_slug VARCHAR(100) NOT NULL,
  twitch_game_id VARCHAR(48) NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  status ENUM('reserved','cancelled') NOT NULL DEFAULT 'reserved',
  active_game_slot VARCHAR(190) UNIQUE DEFAULT NULL,
  active_user_slot VARCHAR(150) UNIQUE DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_spotlight_game_time (game_slug,starts_at),
  INDEX idx_spotlight_creator (user_id,starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
const VIEW=`id,user_id,creator_login,twitch_user_id,twitch_login,game_name,game_slug,twitch_game_id,status,
 DATE_FORMAT(starts_at,'%Y-%m-%dT%H:%i:%sZ') AS start_at,
 DATE_FORMAT(ends_at,'%Y-%m-%dT%H:%i:%sZ') AS end_at`;
function apiError(code,status=400){const e=Error(code);e.status=status;return e}
function validateSlot(input,{now=Date.now()}={}){
 const raw=String(input||'');
 if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?(?:\.\d{1,3})?Z$/.test(raw))throw apiError('slot_utc_iso_required');
 const time=Date.parse(raw);
 if(!Number.isFinite(time)||time<now+MIN_LEAD_MS||time>now+MAX_AHEAD_MS)throw apiError('slot_outside_booking_window');
 if(time%SLOT_MS!==0)throw apiError('slot_must_start_on_half_hour');
 return {time,startsAt:new Date(time).toISOString().slice(0,19).replace('T',' '),
   endsAt:new Date(time+SLOT_MS).toISOString().slice(0,19).replace('T',' ')};
}
function validateGame(game){
 const name=String(game||'').trim().replace(/\s+/g,' ');
 const slug=gameSlug(name);
 if(name.length<2||name.length>100||!slug)throw apiError('invalid_game');
 return {name,slug};
}
function validateOwner(user){
 if(!/^[a-zA-Z0-9_-]{3,80}$/.test(String(user?.id||'')))throw apiError('swapp_account_required',401);
 if(!/^[a-z0-9_-]{3,40}$/.test(String(user?.login||'')))throw apiError('invalid_swapp_account',401);
 const twitch=user?.twitch_link;
 if(!/^\d{3,48}$/.test(String(twitch?.id||''))||!/^[a-z0-9_]{3,40}$/.test(String(twitch?.login||'')))
  throw apiError('verified_twitch_link_required',403);
 return {id:String(user.id),login:String(user.login),twitchId:String(twitch.id),twitchLogin:String(twitch.login)};
}
function publicReservation(row){
 return {id:Number(row.id),creator_login:String(row.creator_login||''),twitch_login:String(row.twitch_login||''),
  game:String(row.game_name||''),game_slug:String(row.game_slug||''),
  start_at:String(row.start_at||''),end_at:String(row.end_at||''),status:String(row.status||'')};
}
function createSpotlightStore({getPool,now=Date.now}={}){
 if(typeof getPool!=='function')throw Error('spotlight_pool_required');
 let schema=null;
 async function ready(){
  const pool=getPool();
  if(!pool)throw apiError('spotlight_storage_unavailable',503);
  if(!schema)schema=Promise.resolve().then(()=>pool.query(DDL)).catch(error=>{schema=null;throw error});
  await schema;return pool;
 }
 function keys(gameSlug,userId,iso){
  return {game:gameSlug+':'+iso,user:userId+':'+iso};
 }
 async function list(game,{limit=12}={}){
  const {slug}=validateGame(game);
  const pool=await ready();
  const [rows]=await pool.execute(`SELECT ${VIEW} FROM swapp_creator_spotlight
   WHERE game_slug=? AND status='reserved' AND ends_at>UTC_TIMESTAMP()
   ORDER BY starts_at ASC LIMIT ?`,[slug,Math.max(1,Math.min(24,Number(limit)||12))]);
  return rows.map(publicReservation);
 }
 async function mine(ownerId){
  const pool=await ready();
  const [rows]=await pool.execute(`SELECT ${VIEW} FROM swapp_creator_spotlight
    WHERE user_id=? AND status='reserved' AND ends_at>UTC_TIMESTAMP()
    ORDER BY starts_at ASC LIMIT 20`,[ownerId]);
  return rows.map(publicReservation);
 }
 async function reserve({user,game,start_at,twitchGameId}){
  const owner=validateOwner(user),g=validateGame(game),slot=validateSlot(start_at,{now:now()});
  if(!/^\d{1,48}$/.test(String(twitchGameId||'')))throw apiError('twitch_game_not_verified',422);
  const pool=await ready(),iso=new Date(slot.time).toISOString(),key=keys(g.slug,owner.id,iso);
  // Unique indices prevent duplicate booked game times and simultaneous user slots.
  const [result]=await pool.execute(`INSERT INTO swapp_creator_spotlight
   (user_id,creator_login,twitch_user_id,twitch_login,game_name,game_slug,twitch_game_id,
    starts_at,ends_at,active_game_slot,active_user_slot)
   SELECT ?,?,?,?,?,?,?,?,?,?,? FROM DUAL
   WHERE (SELECT COUNT(*) FROM swapp_creator_spotlight
     WHERE user_id=? AND status='reserved' AND ends_at>UTC_TIMESTAMP()) < ?`,
    [owner.id,owner.login,owner.twitchId,owner.twitchLogin,g.name,g.slug,String(twitchGameId),
     slot.startsAt,slot.endsAt,key.game,key.user,owner.id,MAX_UPCOMING]);
  if(!result.affectedRows)throw apiError('spotlight_max_upcoming_reached',409);
  return {id:Number(result.insertId),game:g.name,start_at:iso,end_at:new Date(slot.time+SLOT_MS).toISOString()};
 }
 async function cancel(id,user){
  const owner=validateOwner(user),pool=await ready();
  const [result]=await pool.execute(`UPDATE swapp_creator_spotlight
   SET status='cancelled',active_game_slot=NULL,active_user_slot=NULL
   WHERE id=? AND user_id=? AND status='reserved' AND starts_at>UTC_TIMESTAMP()`,
   [id,owner.id]);
  if(!result.affectedRows)throw apiError('spotlight_reservation_not_found',404);
  return {cancelled:true,id:Number(id)};
 }
 async function reschedule(id,user,start_at){
  const owner=validateOwner(user),slot=validateSlot(start_at,{now:now()}),pool=await ready();
  const [rows]=await pool.execute(`SELECT id,game_slug FROM swapp_creator_spotlight
    WHERE id=? AND user_id=? AND status='reserved' AND starts_at>UTC_TIMESTAMP() LIMIT 1`,[id,owner.id]);
  if(!rows.length)throw apiError('spotlight_reservation_not_found',404);
  const iso=new Date(slot.time).toISOString(),key=keys(rows[0].game_slug,owner.id,iso);
  const [result]=await pool.execute(`UPDATE swapp_creator_spotlight
   SET starts_at=?,ends_at=?,active_game_slot=?,active_user_slot=?
   WHERE id=? AND user_id=? AND status='reserved' AND starts_at>UTC_TIMESTAMP()`,
   [slot.startsAt,slot.endsAt,key.game,key.user,id,owner.id]);
  if(!result.affectedRows)throw apiError('spotlight_reservation_not_found',404);
  return {id:Number(id),start_at:iso,end_at:new Date(slot.time+SLOT_MS).toISOString()};
 }
 return {ready,list,mine,reserve,cancel,reschedule};
}
module.exports={createSpotlightStore,validateSlot,validateGame,validateOwner,publicReservation,apiError,DDL};
