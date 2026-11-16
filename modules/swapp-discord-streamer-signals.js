'use strict';
/* Discord STREAMING presence bridge for SERVEUR +.
 * Streamer Mode is a local privacy setting, not a bot API flag.
 * The bot only processes Gateway Streaming activities (type 1) for an
 * opt-in, owner-approved, Twitch-linked creator. No scanning of arbitrary
 * members is published; no userbot, polling of Discord user pages or paid API.
 * Disabled unless all required operator configuration is present.
 */
const SNOWFLAKE=/^[0-9]{15,22}$/;
const SERVER_ID=/^[0-9a-f]{32}$/;
const LOGIN=/^[a-z0-9_]{2,25}$/;
const TABLE='CREATE TABLE IF NOT EXISTS swapp_server_discord_stream_presence ('+
 'server_id CHAR(32) NOT NULL,swapp_user_id VARCHAR(100) NOT NULL,'+
 'guild_id VARCHAR(22) NOT NULL,creator_login VARCHAR(25) NOT NULL,'+
 'seen_at DATETIME NOT NULL,expires_at DATETIME NOT NULL,'+
 'PRIMARY KEY(server_id,swapp_user_id),KEY swapp_discord_presence_expiry(expires_at),'+
 'CONSTRAINT swapp_discord_presence_server_fk FOREIGN KEY(server_id) REFERENCES swapp_game_servers(id) ON DELETE CASCADE) '+
 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
const clean=x=>String(x??'').trim();
function twitchStream(raw){
 if(!raw||Number(raw.type)!==1)return null;
 let parsed;
 try{parsed=new URL(String(raw.url||''))}catch{return null}
 const host=parsed.hostname.toLowerCase();
 if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port||
    !['twitch.tv','www.twitch.tv'].includes(host)||parsed.search||parsed.hash)return null;
 const match=parsed.pathname.match(/^\/([a-z0-9_]{2,25})\/?$/i);
 if(!match)return null;
 return {platform:'twitch',login:match[1].toLowerCase(),
  url:'https://www.twitch.tv/'+match[1].toLowerCase()};
}
function extractPresence(event){
 const guildId=clean(event?.guild_id),discordId=clean(event?.user?.id);
 if(!SNOWFLAKE.test(guildId)||!SNOWFLAKE.test(discordId))return null;
 const stream=(Array.isArray(event.activities)?event.activities:[]).map(twitchStream).find(Boolean)||null;
 return {guildId,discordId,stream};
}
async function approvedCreatorRows(sql,userId,guildId){
 if(!userId||!SNOWFLAKE.test(guildId))return [];
 const [rows]=await sql.execute(
  'SELECT c.server_id,c.creator_login FROM swapp_server_creators c '+
  'JOIN swapp_game_server_extras x ON x.server_id=c.server_id '+
  'JOIN swapp_game_servers s ON s.id=c.server_id '+
  'WHERE c.user_id=? AND x.discord_guild_id=? AND c.platform="twitch" '+
  'AND c.status="approved" AND s.status="published" LIMIT 15',
  [userId,guildId]);
 return rows.filter(row=>SERVER_ID.test(String(row.server_id))&&LOGIN.test(String(row.creator_login||'')));
}
async function applyPresence(sql,{guildId,userId,stream}){
 const rows=await approvedCreatorRows(sql,userId,guildId);
 for(const row of rows){
  if(stream&&stream.login===String(row.creator_login).toLowerCase()){
   await sql.execute('INSERT INTO swapp_server_discord_stream_presence '+
    '(server_id,swapp_user_id,guild_id,creator_login,seen_at,expires_at) '+
    'VALUES (?,?,?,?,UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 2 MINUTE)) '+
    'ON DUPLICATE KEY UPDATE guild_id=VALUES(guild_id),creator_login=VALUES(creator_login),'+
    'seen_at=VALUES(seen_at),expires_at=VALUES(expires_at)',
    [row.server_id,userId,guildId,stream.login]);
  }else{
   await sql.execute('DELETE FROM swapp_server_discord_stream_presence WHERE server_id=? AND swapp_user_id=? AND guild_id=?',
    [row.server_id,userId,guildId]);
  }
 }
 return rows.length;
}
async function readDiscordStreamers(sql,serverId){
 if(!SERVER_ID.test(String(serverId)))return {items:[],available:false};
 try{
  const [rows]=await sql.execute('SELECT p.creator_login AS login,p.seen_at AS seenAt FROM swapp_server_discord_stream_presence p '+
   'JOIN swapp_server_creators c ON c.server_id=p.server_id AND c.user_id=p.swapp_user_id '+
   'AND c.creator_login=p.creator_login AND c.platform="twitch" AND c.status="approved" '+
   'WHERE p.server_id=? AND p.expires_at>UTC_TIMESTAMP() ORDER BY p.seen_at DESC LIMIT 20',[serverId]);
  return {items:rows.filter(r=>LOGIN.test(String(r.login))).map(r=>({platform:'twitch',login:r.login,
   source:'Discord · activité Streaming',signal:'discord_streaming'})),available:true};
 }catch(error){
  if(!['ER_NO_SUCH_TABLE','ER_TABLEACCESS_DENIED_ERROR','ER_BAD_FIELD_ERROR'].includes(error?.code))
   console.warn('[SWAPP DISCORD STREAM]',String(error?.code||error?.message||error).slice(0,70));
  return {items:[],available:false};
 }
}
function createPresenceBridge({env=process.env,getDatabase,WebSocketCtor=globalThis.WebSocket,accountQuery=null}={}){
 const token=clean(env.SWAPP_DISCORD_PRESENCE_BOT_TOKEN);
 const enabled=env.SWAPP_DISCORD_PRESENCE_ENABLED==='1'&&token.length>20&&
  typeof getDatabase==='function'&&typeof WebSocketCtor==='function';
 let socket=null,heartbeat=null,retry=null,lastSeq=null,sessionId='',resumeUrl='',started=false;
 let retryDelay=2500,pool=null,initialize=null,accounts=null;
 const stamp=()=>{if(heartbeat){clearInterval(heartbeat);heartbeat=null}};
 function send(packet){if(socket?.readyState===1)socket.send(JSON.stringify(packet))}
 async function identity(discordId){
  if(typeof accountQuery==='function'){
   const rows=await accountQuery('SELECT swapp_user_id FROM swapp_discord_identities WHERE discord_user_id=? LIMIT 1',[discordId]);
   return rows?.[0]?.swapp_user_id||null;
  }
  const uri=String(env.SWAPP_ACCOUNT_MYSQL_URL||env.SWAPP_MYSQL_URL||'');
  if(!uri)return null;
  if(!accounts){const mysql=require('mysql2/promise');accounts=mysql.createPool({uri,connectionLimit:2,connectTimeout:5000,waitForConnections:true,queueLimit:20})}
  const [rows]=await accounts.execute('SELECT swapp_user_id FROM swapp_discord_identities WHERE discord_user_id=? LIMIT 1',[discordId]);
  return rows?.[0]?.swapp_user_id||null;
 }
 async function database(){
  pool=await getDatabase();
  if(!initialize)initialize=pool.query(TABLE).catch(e=>{initialize=null;throw e});
  await initialize;return pool;
 }
 async function process(event){
  const presence=extractPresence(event);
  if(!presence)return;
  // Presence events are advisory. Non-registered members are never persisted.
  const userId=await identity(presence.discordId);
  if(!userId)return;
  const sql=await database();
  await applyPresence(sql,{guildId:presence.guildId,userId,stream:presence.stream});
 }
 function reconnect(){
  stamp();
  if(!started||retry)return;
  retry=setTimeout(()=>{retry=null;connect()},retryDelay);
  retry.unref?.();
  retryDelay=Math.min(retryDelay*2,60000);
 }
 function connect(){
  if(!started)return;
  try{
   socket=new WebSocketCtor(resumeUrl||'wss://gateway.discord.gg/?v=10&encoding=json');
   socket.addEventListener('message',event=>{
    let data;try{data=JSON.parse(event.data)}catch{return}
    if(typeof data.s==='number')lastSeq=data.s;
    if(data.op===10){
     stamp();
     const interval=Math.max(10000,Number(data.d?.heartbeat_interval)||45000);
     heartbeat=setInterval(()=>send({op:1,d:lastSeq}),interval);
     heartbeat.unref?.();
     if(sessionId&&resumeUrl)send({op:6,d:{token,session_id:sessionId,seq:lastSeq}});
     else send({op:2,d:{token,intents:257,properties:{os:'linux',browser:'swapp',device:'swapp'},compress:false}});
     return;
    }
    if(data.op===7){try{socket.close()}catch{}return}
    if(data.op===9){sessionId='';resumeUrl='';lastSeq=null;try{socket.close()}catch{}return}
    if(data.op!==0)return;
    if(data.t==='READY'){
     sessionId=String(data.d?.session_id||'');resumeUrl=String(data.d?.resume_gateway_url||'');retryDelay=2500;
    }
    if(data.t==='PRESENCE_UPDATE')void process(data.d).catch(e=>
     console.warn('[SWAPP DISCORD STREAM] Presence ignorée',String(e?.code||e?.message||e).slice(0,80)));
   });
   socket.addEventListener('close',reconnect);
   socket.addEventListener('error',()=>{try{socket.close()}catch{}});
  }catch(e){reconnect()}
 }
 function start(){
  if(started||!enabled)return enabled;
  started=true;connect();return true;
 }
 function stop(){
  started=false;stamp();
  if(retry){clearTimeout(retry);retry=null}
  try{socket?.close()}catch{}
  if(accounts){void accounts.end().catch(()=>{});accounts=null}
 }
 return {enabled,start,stop,process};
}
module.exports={twitchStream,extractPresence,approvedCreatorRows,applyPresence,readDiscordStreamers,createPresenceBridge};
