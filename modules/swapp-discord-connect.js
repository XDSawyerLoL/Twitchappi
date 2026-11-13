'use strict';
/*
 * SWAPP Discord Connect + opt-in community live announcements.
 * OAuth identify -> identity; OAuth identify guilds webhook.incoming -> one
 * Discord channel explicitly selected by its manager. No userbot, Gateway,
 * external service, VPS, privileged intents or paid dependencies.
 */
const crypto=require('node:crypto');
const ID=/^[0-9]{16,22}$/;
const UID=/^[a-zA-Z0-9_-]{3,80}$/;
const LOGIN=/^[a-z0-9_-]{2,48}$/;
const EVENT=/^[a-zA-Z0-9_-]{6,120}$/;
const DISCORD='https://discord.com/api/v10';
const BASE='https://swapp.tv';
const MAX_GUILDS=5;
const safe=(v,n=120)=>String(v||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,n);
const html=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const snowflake=v=>ID.test(String(v||''));
function validWebhook(value){
 try{
  const u=new URL(String(value||''));
  return u.protocol==='https:'&&u.hostname==='discord.com'&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&
   /^\/api\/webhooks\/[0-9]{16,22}\/[A-Za-z0-9_-]{20,}$/.test(u.pathname);
 }catch{return false;}
}
function keyFromEnv(env){
 const raw=String(env.SWAPP_DISCORD_ENCRYPTION_KEY||'');
 return /^[a-f0-9]{64}$/i.test(raw)?Buffer.from(raw,'hex'):null;
}
function encryptWebhook(url,key){
 if(!key||!validWebhook(url))throw Error('discord_encryption_config_invalid');
 const nonce=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,nonce);
 const ciphertext=Buffer.concat([cipher.update(url,'utf8'),cipher.final()]);
 return 'v1.'+Buffer.concat([nonce,cipher.getAuthTag(),ciphertext]).toString('base64url');
}
function decryptWebhook(ciphertext,key){
 if(!key||!/^v1\.[A-Za-z0-9_-]{40,800}$/.test(String(ciphertext||'')))throw Error('discord_cipher_invalid');
 const data=Buffer.from(ciphertext.slice(3),'base64url');
 if(data.length<29)throw Error('discord_cipher_invalid');
 const decipher=crypto.createDecipheriv('aes-256-gcm',key,data.subarray(0,12));
 decipher.setAuthTag(data.subarray(12,28));
 const url=Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString('utf8');
 if(!validWebhook(url))throw Error('discord_webhook_invalid');
 return url;
}
function sameOrigin(req){
 const origin=String(req.get?.('origin')||'');
 const host=String(req.get?.('host')||'');
 try{
  const u=new URL(origin);
  return u.protocol==='https:'&&u.host.toLowerCase()===host.toLowerCase();
 }catch{return false;}
}
function webhookPayload(creator,category){
 const login=String(creator.login||'');
 const title=safe(creator.current_live_title||'Le direct de '+(creator.display_name||login),170).replace(/@(?:everyone|here)/gi,'');
 const game=safe(category||creator.current_live_category||'Jeu vidéo',80);
 const url=BASE+'/'+encodeURIComponent(login);
 return {
  username:'SWAPP Live',
  content:'**'+safe(creator.display_name||login,65)+' est en direct sur SWAPP !**\n'+url,
  embeds:[{title,description:'Catégorie : '+game,url,color:0x42d7cc,
   author:{name:'SWAPP · Direct vérifié',url:BASE},
   footer:{text:'Diffusion annoncée après confirmation du flux vidéo HLS'}}],
  allowed_mentions:{parse:[]},tts:false
 };
}
const TABLES=[
 'CREATE TABLE IF NOT EXISTS swapp_discord_identities (swapp_user_id VARCHAR(80) PRIMARY KEY, discord_user_id VARCHAR(22) NOT NULL UNIQUE, username VARCHAR(100) NOT NULL, avatar_hash VARCHAR(128) NOT NULL DEFAULT "", updated_at BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
 'CREATE TABLE IF NOT EXISTS swapp_discord_communities (swapp_user_id VARCHAR(80) NOT NULL, guild_id VARCHAR(22) NOT NULL, guild_name VARCHAR(100) NOT NULL, channel_id VARCHAR(22) NOT NULL, webhook_cipher TEXT NOT NULL, enabled TINYINT NOT NULL DEFAULT 1, listed TINYINT NOT NULL DEFAULT 0, updated_at BIGINT NOT NULL, PRIMARY KEY (swapp_user_id,guild_id), CONSTRAINT swapp_discord_communities_owner_fk FOREIGN KEY (swapp_user_id) REFERENCES swapp_discord_identities(swapp_user_id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
 'CREATE TABLE IF NOT EXISTS swapp_discord_live_outbox (id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, swapp_user_id VARCHAR(80) NOT NULL, guild_id VARCHAR(22) NOT NULL, event_id VARCHAR(120) NOT NULL, creator_login VARCHAR(48) NOT NULL, status VARCHAR(16) NOT NULL DEFAULT "pending", attempts INT NOT NULL DEFAULT 0, created_at BIGINT NOT NULL, next_attempt_at BIGINT NOT NULL DEFAULT 0, lease_until BIGINT NOT NULL DEFAULT 0, message_id VARCHAR(22) DEFAULT NULL, UNIQUE KEY swapp_discord_live_once (swapp_user_id,guild_id,event_id), KEY swapp_discord_due (status,next_attempt_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
];
function createDiscordConnect({app,env=process.env,mysqlFactory=null,restoreSession,findOwner,getOwnerById,getVerifiedLive,
 limiter=null,fetchImpl=globalThis.fetch,now=Date.now,setIntervalImpl=setInterval}={}){
 if(!app||typeof restoreSession!=='function'||typeof findOwner!=='function'||typeof getOwnerById!=='function'||typeof getVerifiedLive!=='function')throw Error('swapp_discord_dependencies_invalid');
 const clientId=String(env.SWAPP_DISCORD_CLIENT_ID||''),secret=String(env.SWAPP_DISCORD_CLIENT_SECRET||'');
 const redirect=String(env.SWAPP_DISCORD_REDIRECT_URI||'');
 const mysqlUri=String(env.SWAPP_ACCOUNT_MYSQL_URL||env.SWAPP_MYSQL_URL||env.DATABASE_URL||'');
 const key=keyFromEnv(env);
 let uriValid=false,redirectValid=false;
 try{const u=new URL(mysqlUri);uriValid=u.protocol==='mysql:'&&Boolean(u.username&&u.hostname&&u.pathname!=='/');}catch{}
 try{const u=new URL(redirect);redirectValid=u.protocol==='https:'&&u.hostname==='swapp.tv'&&u.pathname==='/api/swapp/discord/callback'&&!u.search&&!u.hash;}catch{}
 const enabled=env.SWAPP_ACCOUNT_STORE==='mysql'&&snowflake(clientId)&&secret.length>=12&&key&&uriValid&&redirectValid&&env.SWAPP_DISCORD_ENABLED!=='false';
 let pool=null,init=null,running=null;
 const ready=async()=>{
  if(!enabled)throw Error('discord_not_configured');
  if(!init){
   init=(async()=>{
    const mysql=mysqlFactory||require('mysql2/promise');
    pool=mysql.createPool({uri:mysqlUri,connectionLimit:3,waitForConnections:true,queueLimit:30,connectTimeout:5000});
    for(const ddl of TABLES)await pool.query(ddl);
   })().catch(e=>{init=null;if(pool){pool.end().catch(()=>{});pool=null}throw e});
  }
  await init;
  return pool;
 };
 const query=async(sql,args=[])=>{const db=await ready();const [rows]=await db.execute(sql,args);return rows};
 const owner=async(req,res)=>{
  await restoreSession(req,res,{allowUserRecovery:false});
  const session=req.session?.oryonUser;
  const stored=session?.id&&session?.login?findOwner(session.login):null;
  if(!stored||String(stored.id)!==String(session.id)||!UID.test(String(stored.id))){
   res.status(401).json({success:false,error:'swapp_account_required'});return null;
  }
  return stored;
 };
 const actionGuard=(req,res)=>{
  if(!sameOrigin(req)||!String(req.get?.('content-type')||'').toLowerCase().startsWith('application/json')){
   res.status(403).json({success:false,error:'same_origin_json_required'});return false;
  }
  return true;
 };
 const fetchJson=async(url,options={})=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
   const response=await fetchImpl(url,{...options,redirect:'error',signal:controller.signal});
   const body=await response.json().catch(()=>null);
   if(!response.ok)throw Error('discord_http_'+response.status);
   return body;
  }finally{clearTimeout(timer)}
 };
 const oauth=async(req,res)=>{
  const person=await owner(req,res);if(!person)return;
  if(!enabled)return res.status(503).json({success:false,error:'discord_not_configured'});
  const mode=req.query?.mode==='server'?'server':'account';
  try{
   const db=await ready();
   if(mode==='server'){
    const linked=await query('SELECT discord_user_id FROM swapp_discord_identities WHERE swapp_user_id=?',[person.id]);
    if(!linked.length)return res.redirect('/discord?error=link_account_first');
   }
   const nonce=crypto.randomBytes(24).toString('base64url');
   req.session.swappDiscordOAuth={nonce,ownerId:String(person.id),mode,until:now()+600000};
   req.session.save(err=>{
    if(err)return res.status(503).send('Session SWAPP indisponible');
    const scopes=mode==='server'?'identify guilds webhook.incoming':'identify';
    const url=new URL('https://discord.com/oauth2/authorize');
    url.search=new URLSearchParams({client_id:clientId,response_type:'code',redirect_uri:redirect,
     scope:scopes,state:nonce,prompt:'consent'}).toString();
    res.set('Cache-Control','no-store').redirect(url.href);
   });
  }catch(_){res.status(503).json({success:false,error:'discord_storage_unavailable'})}
 };
 app.get('/api/swapp/discord/connect',oauth);
 app.get('/api/swapp/discord/callback',async(req,res)=>{
  res.set('Cache-Control','no-store');
  const state=req.session?.swappDiscordOAuth;
  if(req.session)delete req.session.swappDiscordOAuth;
  const person=await owner(req,res);if(!person)return;
  const supplied=String(req.query?.state||'');
  if(!state||state.ownerId!==String(person.id)||now()>state.until||
     !/^[A-Za-z0-9_-]{32}$/.test(supplied)||
     !crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(state.nonce))||
     !/^[A-Za-z0-9_-]{5,300}$/.test(String(req.query?.code||'')))
   return res.redirect('/discord?error=oauth_state');
  try{
   await ready();
   const body=new URLSearchParams({client_id:clientId,client_secret:secret,grant_type:'authorization_code',
     code:String(req.query.code),redirect_uri:redirect});
   const token=await fetchJson('https://discord.com/api/oauth2/token',{method:'POST',
     headers:{'content-type':'application/x-www-form-urlencoded'},body:body.toString()});
   if(typeof token?.access_token!=='string'||!token.access_token||!String(token.scope||'').includes('identify'))
    throw Error('discord_token_invalid');
   const headers={Authorization:'Bearer '+token.access_token};
   const user=await fetchJson(DISCORD+'/users/@me',{headers});
   if(!snowflake(user?.id))throw Error('discord_identity_invalid');
   if(state.mode==='account'){
    await query('INSERT INTO swapp_discord_identities (swapp_user_id,discord_user_id,username,avatar_hash,updated_at) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE discord_user_id=VALUES(discord_user_id),username=VALUES(username),avatar_hash=VALUES(avatar_hash),updated_at=VALUES(updated_at)',
     [String(person.id),String(user.id),safe(user.global_name||user.username,100),safe(user.avatar,128),now()]);
   }else{
    const linked=await query('SELECT discord_user_id FROM swapp_discord_identities WHERE swapp_user_id=?',[person.id]);
    if(String(linked[0]?.discord_user_id||'')!==String(user.id))return res.redirect('/discord?error=discord_account_mismatch');
    const hook=token.webhook;
    if(!hook||!snowflake(hook.guild_id)||!snowflake(hook.channel_id)||!validWebhook(hook.url))
     throw Error('discord_webhook_not_authorized');
    const guilds=await fetchJson(DISCORD+'/users/@me/guilds',{headers});
    const guild=Array.isArray(guilds)?guilds.find(g=>String(g.id)===String(hook.guild_id)):null;
    const permissions=String(guild?.permissions||'');
    if(!guild||!/^\d{1,22}$/.test(permissions)||!(BigInt(permissions)&40n))
     throw Error('discord_manage_guild_required');
    const existing=await query('SELECT guild_id FROM swapp_discord_communities WHERE swapp_user_id=?',[person.id]);
    if(existing.length>=MAX_GUILDS&&!existing.some(x=>String(x.guild_id)===String(hook.guild_id)))
     return res.redirect('/discord?error=server_limit');
    await query('INSERT INTO swapp_discord_communities (swapp_user_id,guild_id,guild_name,channel_id,webhook_cipher,enabled,listed,updated_at) VALUES (?,?,?,?,?,1,0,?) ON DUPLICATE KEY UPDATE guild_name=VALUES(guild_name),channel_id=VALUES(channel_id),webhook_cipher=VALUES(webhook_cipher),enabled=1,updated_at=VALUES(updated_at)',
     [person.id,String(hook.guild_id),safe(guild.name,100),String(hook.channel_id),encryptWebhook(hook.url,key),now()]);
   }
   // Access and refresh OAuth bearer tokens are intentionally discarded.
   return res.redirect('/discord?connected='+state.mode);
  }catch(error){
   const reason=['discord_manage_guild_required','discord_webhook_not_authorized'].includes(error.message)?error.message:'oauth_exchange_failed';
   return res.redirect('/discord?error='+reason);
  }
 });
 app.get('/api/swapp/discord/status',async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  const person=await owner(req,res);if(!person)return;
  if(!enabled)return res.status(503).json({success:false,configured:false,error:'discord_not_configured'});
  try{
   const [account,servers]=await Promise.all([
    query('SELECT discord_user_id,username,avatar_hash FROM swapp_discord_identities WHERE swapp_user_id=?',[person.id]),
    query('SELECT guild_id,guild_name,channel_id,enabled,listed FROM swapp_discord_communities WHERE swapp_user_id=? ORDER BY guild_name LIMIT 5',[person.id])
   ]);
   const user=account[0];
   return res.json({success:true,configured:true,connected:!!user,
    discord:user?{id:String(user.discord_user_id),username:user.username,
      avatar: /^[a-f0-9_]{2,128}$/i.test(user.avatar_hash)?'https://cdn.discordapp.com/avatars/'+user.discord_user_id+'/'+user.avatar_hash+'.png':null}:null,
    communities:servers.map(s=>({guild_id:String(s.guild_id),name:s.guild_name,channel_id:String(s.channel_id),
      announcements:!!s.enabled,public:!!s.listed}))});
  }catch(_){return res.status(503).json({success:false,error:'discord_storage_unavailable'})}
 });
 app.get('/api/swapp/discord/creator/:login',async(req,res)=>{
  res.set('Cache-Control','public, max-age=60');
  const login=String(req.params.login||'').toLowerCase();
  const creator=LOGIN.test(login)?findOwner(login):null;
  if(!creator||creator.channel_public===false)return res.status(404).json({success:false,error:'creator_not_found'});
  if(!enabled)return res.json({success:true,connected:false,communities:[]});
  try{
   const rows=await query('SELECT c.guild_name FROM swapp_discord_communities c JOIN swapp_discord_identities i ON c.swapp_user_id=i.swapp_user_id WHERE c.swapp_user_id=? AND c.listed=1 AND c.enabled=1 LIMIT 5',[creator.id]);
   return res.json({success:true,connected:rows.length>0,communities:rows.map(r=>({name:r.guild_name}))});
  }catch(_){return res.status(503).json({success:false,error:'discord_storage_unavailable'})}
 });
 const routes=limiter?[limiter]:[];
 app.post('/api/swapp/discord/community/:guildId',...routes,async(req,res)=>{
  res.set('Cache-Control','no-store');
  if(!actionGuard(req,res))return;
  const person=await owner(req,res);if(!person)return;
  const guild=String(req.params.guildId||'');
  if(!snowflake(guild)||typeof req.body?.announcements!=='boolean'||typeof req.body?.public!=='boolean')
   return res.status(400).json({success:false,error:'invalid_community_settings'});
  try{
   const rows=await query('UPDATE swapp_discord_communities SET enabled=?,listed=?,updated_at=? WHERE swapp_user_id=? AND guild_id=?',
    [req.body.announcements?1:0,req.body.public?1:0,now(),person.id,guild]);
   return res.status(rows.affectedRows?200:404).json({success:!!rows.affectedRows});
  }catch(_){return res.status(503).json({success:false,error:'discord_storage_unavailable'})}
 });
 app.delete('/api/swapp/discord/community/:guildId',...routes,async(req,res)=>{
  res.set('Cache-Control','no-store');
  if(!actionGuard(req,res))return;
  const person=await owner(req,res);if(!person)return;
  const guild=String(req.params.guildId||'');
  if(!snowflake(guild))return res.status(400).json({success:false,error:'invalid_guild'});
  try{
   await query('DELETE FROM swapp_discord_communities WHERE swapp_user_id=? AND guild_id=?',[person.id,guild]);
   await query('DELETE FROM swapp_discord_live_outbox WHERE swapp_user_id=? AND guild_id=?',[person.id,guild]);
   return res.json({success:true});
  }catch(_){return res.status(503).json({success:false,error:'discord_storage_unavailable'})}
 });
 app.delete('/api/swapp/discord/account',...routes,async(req,res)=>{
  res.set('Cache-Control','no-store');
  if(!actionGuard(req,res))return;
  const person=await owner(req,res);if(!person)return;
  try{
   await query('DELETE FROM swapp_discord_communities WHERE swapp_user_id=?',[person.id]);
   await query('DELETE FROM swapp_discord_live_outbox WHERE swapp_user_id=?',[person.id]);
   await query('DELETE FROM swapp_discord_identities WHERE swapp_user_id=?',[person.id]);
   return res.json({success:true});
  }catch(_){return res.status(503).json({success:false,error:'discord_storage_unavailable'})}
 });
 app.get('/discord',(req,res)=>{
  res.set('Cache-Control','private, no-store');
  const body='<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>Discord Connect — SWAPP</title>'+
   '<link rel="stylesheet" href="/assets/swapp-discord-connect.css?v=20261113-v1"></head><body>'+
   '<main class="sdc-main"><nav><a href="/">← SWAPP</a><a href="/social">SWAPP SOCIAL</a></nav>'+
   '<header><small>SWAPP / COMMUNAUTÉS</small><h1>Discord Connect</h1><p>Ton compte SWAPP reste ton identité principale. Relie Discord et choisis les salons qui recevront tes annonces de live vérifié.</p></header>'+
   '<div role="status" aria-live="polite" id="sdc-status">Chargement…</div>'+
   '<section class="sdc-panel"><h2>1. Ton compte Discord</h2><div id="sdc-identity"></div>'+
   '<a class="sdc-primary" id="sdc-connect" href="/api/swapp/discord/connect?mode=account">Connecter Discord</a>'+
   '<button id="sdc-unlink" type="button" hidden>Déconnecter Discord</button></section>'+
   '<section class="sdc-panel"><h2>2. Tes serveurs</h2><p>Choisis un serveur et un salon dans la fenêtre officielle Discord. Les webhooks restent chiffrés sur SWAPP ; aucun accès aux conversations.</p>'+
   '<a class="sdc-primary" id="sdc-add" href="/api/swapp/discord/connect?mode=server" hidden>Relier un serveur / salon</a>'+
   '<div id="sdc-servers"></div></section>'+
   '<section class="sdc-panel"><h2>3. Annonces automatiques</h2><p>Chaque véritable nouveau live SWAPP confirmé par le flux HLS génère au plus une annonce par serveur autorisé. Jamais de mention @everyone ni de publication sur un serveur non relié.</p></section></main>'+
   '<script src="/assets/swapp-discord-connect.js?v=20261113-v1" defer></script></body></html>';
  res.type('html').send(body);
 });
 async function notifyLive(login,eventId){
  if(!enabled||!LOGIN.test(String(login||''))||!EVENT.test(String(eventId||'')))return false;
  const creator=findOwner(login);
  if(!creator||creator.channel_public===false||!getVerifiedLive(login,eventId))return false;
  try{
   const servers=await query('SELECT guild_id FROM swapp_discord_communities WHERE swapp_user_id=? AND enabled=1 LIMIT 5',[creator.id]);
   for(const server of servers){
    await query('INSERT IGNORE INTO swapp_discord_live_outbox (swapp_user_id,guild_id,event_id,creator_login,status,created_at,next_attempt_at) VALUES (?,?,?,?,"pending",?,0)',
     [creator.id,String(server.guild_id),String(eventId),login,now()]);
   }
   if(servers.length)void flush().catch(()=>{});
   return servers.length>0;
  }catch(_){return false}
 }
 async function flush(){
  if(!enabled)return;
  if(running)return running;
  running=(async()=>{
   const due=await query('SELECT id FROM swapp_discord_live_outbox WHERE (status="pending" AND next_attempt_at<=?) OR (status="sending" AND lease_until<?) ORDER BY created_at LIMIT 12',[now(),now()]);
   for(const item of due){
    const timestamp=now();
    const claimed=await query('UPDATE swapp_discord_live_outbox SET status="sending",lease_until=?,attempts=attempts+1 WHERE id=? AND ((status="pending" AND next_attempt_at<=?) OR (status="sending" AND lease_until<?))',
     [timestamp+90000,item.id,timestamp,timestamp]);
    if(claimed.affectedRows!==1)continue;
    const rows=await query('SELECT o.*,c.webhook_cipher,c.enabled FROM swapp_discord_live_outbox o LEFT JOIN swapp_discord_communities c ON c.swapp_user_id=o.swapp_user_id AND c.guild_id=o.guild_id WHERE o.id=?',[item.id]);
    const row=rows[0],creator=row&&getOwnerById(row.swapp_user_id);
    const active=creator&&creator.channel_public!==false&&row.enabled&&getVerifiedLive(row.creator_login,row.event_id);
    if(!active||timestamp-Number(row.created_at)>3600000){
     await query('UPDATE swapp_discord_live_outbox SET status="cancelled",lease_until=0 WHERE id=?',[item.id]);
     continue;
    }
    try{
     const webhook=decryptWebhook(row.webhook_cipher,key);
     const u=new URL(webhook);u.searchParams.set('wait','true');
     const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
     let response;
     try{
      response=await fetchImpl(u.href,{method:'POST',redirect:'error',signal:controller.signal,
       headers:{'content-type':'application/json'},body:JSON.stringify(webhookPayload(creator))});
     }finally{clearTimeout(timer)}
     if(response.ok){
      const data=await response.json();
      if(!snowflake(data?.id))throw Error('discord_receipt_missing');
      await query('UPDATE swapp_discord_live_outbox SET status="sent",message_id=?,lease_until=0 WHERE id=?',[String(data.id),item.id]);
     }else if(response.status===429&&row.attempts<5){
      const retry=Number(response.headers?.get('retry-after')||10);
      await query('UPDATE swapp_discord_live_outbox SET status="pending",next_attempt_at=?,lease_until=0 WHERE id=?',
       [now()+Math.max(3000,Math.min(120000,Number.isFinite(retry)?retry*1000:10000)),item.id]);
     }else{
      await query('UPDATE swapp_discord_live_outbox SET status="blocked",lease_until=0 WHERE id=?',[item.id]);
     }
    }catch(_){
     // Delivery may already have succeeded despite a lost response. Avoid duplicates.
     await query('UPDATE swapp_discord_live_outbox SET status="uncertain",lease_until=0 WHERE id=?',[item.id]).catch(()=>{});
    }
   }
  })().finally(()=>{running=null});
  return running;
 }
 if(enabled){
  const timer=setIntervalImpl(()=>{void flush().catch(()=>{})},60000);
  if(timer?.unref)timer.unref();
 }
 return {enabled:Boolean(enabled),notifyLive,flush,ready,status:()=>({configured:Boolean(enabled),maxGuilds:MAX_GUILDS})};
}
module.exports={createDiscordConnect,validWebhook,keyFromEnv,encryptWebhook,decryptWebhook,webhookPayload,sameOrigin,TABLES};
