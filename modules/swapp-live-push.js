'use strict';
/* SWAPP opt-in live Web Push: free, self-hosted Node/MySQL, no third-party
 * analytics or paid notification API. Off unless all secrets are configured.
 * Browser push gateways are transport providers, not SWAPP accounts.
 */
const crypto=require('node:crypto');
const {URL}=require('node:url');
const path=require('node:path');

const LOGIN=/^[a-z0-9_-]{2,48}$/i;
const PUBLIC_KEY=String(process.env.SWAPP_PUSH_VAPID_PUBLIC_KEY||'').trim();
const PRIVATE_KEY=String(process.env.SWAPP_PUSH_VAPID_PRIVATE_KEY||'').trim();
const SUBJECT=String(process.env.SWAPP_PUSH_VAPID_SUBJECT||'').trim();
const DB_URL=String(process.env.SWAPP_MYSQL_URL||'').trim();
const B64=/^[a-zA-Z0-9_-]+$/;
const ENABLED=process.env.SWAPP_PUSH_ENABLED==='1'&&
 process.env.SWAPP_ACCOUNT_STORE==='mysql'&&!!DB_URL&&
 !!PUBLIC_KEY&&!!PRIVATE_KEY&&/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$|^https:\/\/[^\s]+$/.test(SUBJECT);
const noCache=res=>res.set('Cache-Control','private, no-store');
function sameOrigin(req){
 const origin=String(req.get('origin')||'');
 if(!origin)return false;
 try{
  const url=new URL(origin);
  return url.protocol==='https:'&&['swapp.tv','www.swapp.tv'].includes(url.hostname)&&url.host===req.get('host');
 }catch{return false}
}
function validEndpoint(value){
 try{
  const url=new URL(String(value||''));
  const host=url.hostname.toLowerCase();
  return url.protocol==='https:'&&!url.username&&!url.password&&
   url.href.length<=2048&&(
    host==='fcm.googleapis.com'||
    host==='updates.push.services.mozilla.com'||
    host==='web.push.apple.com'||host.endsWith('.push.apple.com')||
    host.endsWith('.notify.windows.com')||host.endsWith('.wns.windows.com'));
 }catch{return false}
}
function validSubscription(value){
 if(!value||!validEndpoint(value.endpoint))return false;
 const a=value.keys?.p256dh,b=value.keys?.auth;
 if(typeof a!=='string'||typeof b!=='string'||!B64.test(a)||!B64.test(b))return false;
 try{return Buffer.from(a,'base64url').length===65&&
   Buffer.from(a,'base64url')[0]===4&&Buffer.from(b,'base64url').length===16}
 catch{return false}
}
const hashEndpoint=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
function base64(value){return Buffer.from(value).toString('base64url')}
function hmac(key,bytes){return crypto.createHmac('sha256',key).update(bytes).digest()}
function extract(salt,input){return hmac(salt,input)}
function expand(prk,info,size){return hmac(prk,Buffer.concat([Buffer.from(info),Buffer.from([1])])).subarray(0,size)}
function vapidKey(){
 const publicBytes=Buffer.from(PUBLIC_KEY,'base64url');
 const secret=Buffer.from(PRIVATE_KEY,'base64url');
 if(publicBytes.length!==65||publicBytes[0]!==4||secret.length!==32)throw Error('push_vapid_invalid');
 return crypto.createPrivateKey({key:{kty:'EC',crv:'P-256',x:base64(publicBytes.subarray(1,33)),
  y:base64(publicBytes.subarray(33,65)),d:base64(secret)},format:'jwk'});
}
function webPushRequest(subscription,payload){
 if(!validSubscription(subscription))throw Error('push_endpoint_invalid');
 const recipient=Buffer.from(subscription.keys.p256dh,'base64url');
 const auth=Buffer.from(subscription.keys.auth,'base64url');
 const sender=crypto.createECDH('prime256v1');
 sender.generateKeys();
 const senderPublic=sender.getPublicKey();
 const shared=sender.computeSecret(recipient);
 const info=Buffer.concat([Buffer.from('WebPush: info\0'),recipient,senderPublic]);
 const ikm=expand(extract(auth,shared),info,32);
 const salt=crypto.randomBytes(16);
 const prk=extract(salt,ikm);
 const cek=expand(prk,Buffer.from('Content-Encoding: aes128gcm\0'),16);
 const nonce=expand(prk,Buffer.from('Content-Encoding: nonce\0'),12);
 const cipher=crypto.createCipheriv('aes-128-gcm',cek,nonce);
 const plain=Buffer.concat([Buffer.from(JSON.stringify(payload),'utf8'),Buffer.from([2])]);
 if(plain.length>2500)throw Error('push_payload_too_large');
 const encrypted=Buffer.concat([cipher.update(plain),cipher.final(),cipher.getAuthTag()]);
 const record=Buffer.alloc(5);record.writeUInt32BE(4096,0);record[4]=senderPublic.length;
 const body=Buffer.concat([salt,record,senderPublic,encrypted]);
 const jwtHeader=base64(JSON.stringify({typ:'JWT',alg:'ES256'}));
 const jwtPayload=base64(JSON.stringify({aud:new URL(subscription.endpoint).origin,
   exp:Math.floor(Date.now()/1000)+3600,sub:SUBJECT}));
 const unsigned=jwtHeader+'.'+jwtPayload;
 const signature=crypto.sign('sha256',Buffer.from(unsigned),{key:vapidKey(),dsaEncoding:'ieee-p1363'});
 return {body,headers:{
  'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream',
  'TTL':'120','Urgency':'normal',
  'Authorization':'vapid t='+unsigned+'.'+base64(signature)+', k='+PUBLIC_KEY
 }};
}
function makeLivePush({isFollowing=()=>false,send=globalThis.fetch,logger=console}={}){
 let pool=null,ready=null,configOkay=ENABLED;
 async function db(){
  if(!configOkay)throw Error('push_disabled');
  if(pool)return pool;
  if(ready)return ready;
  ready=(async()=>{
   vapidKey();
   const parsed=new URL(DB_URL);
   if(parsed.protocol!=='mysql:'||!parsed.hostname||!parsed.username||!parsed.pathname.slice(1))
    throw Error('push_mysql_invalid');
   const mysql=require('mysql2/promise');
   const candidate=mysql.createPool({uri:DB_URL,connectionLimit:2,
    waitForConnections:true,queueLimit:30,connectTimeout:5000,enableKeepAlive:true});
   try{
    await candidate.query(`CREATE TABLE IF NOT EXISTS swapp_live_push_devices (
     endpoint_hash CHAR(64) PRIMARY KEY,
     viewer_id VARCHAR(80) NOT NULL,
     endpoint TEXT NOT NULL,
     p256dh VARCHAR(150) NOT NULL,
     auth_secret VARCHAR(80) NOT NULL,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     INDEX idx_swapp_push_device_viewer (viewer_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await candidate.query(`CREATE TABLE IF NOT EXISTS swapp_live_push_preferences (
     viewer_id VARCHAR(80) NOT NULL,
     creator_login VARCHAR(48) NOT NULL,
     enabled TINYINT(1) NOT NULL DEFAULT 0,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     PRIMARY KEY(viewer_id,creator_login),
     INDEX idx_swapp_push_creator (creator_login,enabled)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await candidate.query(`CREATE TABLE IF NOT EXISTS swapp_live_push_events (
     creator_login VARCHAR(48) NOT NULL,
     event_id VARCHAR(80) NOT NULL,
     notified_at BIGINT NOT NULL,
     PRIMARY KEY(creator_login,event_id),
     INDEX idx_swapp_push_last (creator_login,notified_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    pool=candidate;return pool;
   }catch(e){await candidate.end().catch(()=>{});throw e}
  })();
  try{return await ready}finally{ready=null}
 }
 function register(app){
  app.get('/swapp-live-sw.js',(_req,res)=>{
   res.set('Cache-Control','no-store');
   res.set('Service-Worker-Allowed','/');
   return res.type('application/javascript').sendFile(path.join(__dirname,'..','swapp-live-sw.js'));
  });
  app.get('/api/swapp/live-alerts/config',(_req,res)=>{
   noCache(res);
   res.json({success:true,available:configOkay,public_key:configOkay?PUBLIC_KEY:null});
  });
  app.get('/api/swapp/live-alerts/status',async(req,res)=>{
   noCache(res);
   const creator=String(req.query.creator||'').toLowerCase();
   if(!LOGIN.test(creator))return res.status(400).json({success:false,error:'Chaîne invalide.'});
   const viewerId=req.session?.oryonUser?.id;
   if(!viewerId)return res.json({success:true,authenticated:false,available:configOkay,following:false,enabled:false});
   const following=Boolean(isFollowing(viewerId,creator));
   if(!configOkay)return res.json({success:true,authenticated:true,available:false,following,enabled:false});
   try{
    const [rows]=await (await db()).execute(
     'SELECT p.enabled,(SELECT COUNT(*) FROM swapp_live_push_devices d WHERE d.viewer_id=p.viewer_id) AS devices FROM swapp_live_push_preferences p WHERE p.viewer_id=? AND p.creator_login=?',
     [viewerId,creator]);
    return res.json({success:true,authenticated:true,available:true,following,
     enabled:following&&rows[0]?.enabled===1&&Number(rows[0]?.devices)>0});
   }catch(e){return res.status(503).json({success:false,error:'Alertes temporairement indisponibles.'})}
  });
  app.post('/api/swapp/live-alerts/enable',async(req,res)=>{
   noCache(res);
   if(!sameOrigin(req))return res.status(403).json({success:false,error:'Origine interdite.'});
   const viewerId=req.session?.oryonUser?.id;
   if(!viewerId)return res.status(401).json({success:false,error:'Compte SWAPP requis.'});
   if(!configOkay)return res.status(503).json({success:false,error:'Notifications Push non configurées.'});
   const creator=String(req.body?.creator||'').toLowerCase();
   if(!LOGIN.test(creator)||!isFollowing(viewerId,creator))
    return res.status(403).json({success:false,error:'Suis cette chaîne avant d’activer la cloche.'});
   const subscription=req.body?.subscription;
   if(!validSubscription(subscription))
    return res.status(400).json({success:false,error:'Abonnement navigateur invalide.'});
   try{
    const conn=await (await db()).getConnection();
    try{
     await conn.beginTransaction();
     await conn.execute(`INSERT INTO swapp_live_push_devices(endpoint_hash,viewer_id,endpoint,p256dh,auth_secret)
      VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE viewer_id=VALUES(viewer_id),
       endpoint=VALUES(endpoint),p256dh=VALUES(p256dh),auth_secret=VALUES(auth_secret)`,
      [hashEndpoint(subscription.endpoint),String(viewerId),subscription.endpoint,subscription.keys.p256dh,subscription.keys.auth]);
     await conn.execute(`INSERT INTO swapp_live_push_preferences(viewer_id,creator_login,enabled)
      VALUES(?,?,1) ON DUPLICATE KEY UPDATE enabled=1`,[String(viewerId),creator]);
     await conn.commit();
    }catch(e){await conn.rollback().catch(()=>{});throw e}finally{conn.release()}
    return res.json({success:true,enabled:true});
   }catch(e){return res.status(503).json({success:false,error:'Impossible d’enregistrer la cloche.'})}
  });
  app.post('/api/swapp/live-alerts/disable',async(req,res)=>{
   noCache(res);
   if(!sameOrigin(req))return res.status(403).json({success:false,error:'Origine interdite.'});
   const viewerId=req.session?.oryonUser?.id;
   if(!viewerId)return res.status(401).json({success:false,error:'Compte SWAPP requis.'});
   const creator=String(req.body?.creator||'').toLowerCase();
   if(!LOGIN.test(creator))return res.status(400).json({success:false,error:'Chaîne invalide.'});
   if(!configOkay)return res.json({success:true,enabled:false});
   try{
    await (await db()).execute('UPDATE swapp_live_push_preferences SET enabled=0 WHERE viewer_id=? AND creator_login=?',[String(viewerId),creator]);
    return res.json({success:true,enabled:false});
   }catch(e){return res.status(503).json({success:false,error:'Désactivation indisponible.'})}
  });
  app.post('/api/swapp/live-alerts/device/remove',async(req,res)=>{
   noCache(res);
   if(!sameOrigin(req))return res.status(403).json({success:false,error:'Origine interdite.'});
   const viewerId=req.session?.oryonUser?.id;
   if(!viewerId)return res.status(401).json({success:false,error:'Compte SWAPP requis.'});
   const endpoint=req.body?.endpoint;
   if(!validEndpoint(endpoint))return res.status(400).json({success:false,error:'Appareil invalide.'});
   if(!configOkay)return res.json({success:true});
   try{
    await (await db()).execute('DELETE FROM swapp_live_push_devices WHERE viewer_id=? AND endpoint_hash=?',
     [String(viewerId),hashEndpoint(endpoint)]);
    return res.json({success:true});
   }catch{return res.status(503).json({success:false,error:'Suppression indisponible.'})}
  });
 }
 async function notifyLive(creator,eventId,title=''){
  if(!configOkay||!LOGIN.test(String(creator||''))||!/^[-a-zA-Z0-9_]{6,80}$/.test(String(eventId||'')))return {sent:0,skipped:true};
  const p=await db();
  const login=String(creator).toLowerCase(),now=Date.now();
  const conn=await p.getConnection();
  try{
   await conn.beginTransaction();
   const [prior]=await conn.execute(
    'SELECT notified_at FROM swapp_live_push_events WHERE creator_login=? ORDER BY notified_at DESC LIMIT 1 FOR UPDATE',[login]);
   // Reconnects must not cause a second ping for effectively the same live.
   if(prior.length&&now-Number(prior[0].notified_at)<20*60*1000){
    await conn.rollback();return {sent:0,skipped:true,reason:'cooldown'};
   }
   const [saved]=await conn.execute(
    'INSERT IGNORE INTO swapp_live_push_events(creator_login,event_id,notified_at) VALUES(?,?,?)',[login,eventId,now]);
   if(saved.affectedRows!==1){await conn.rollback();return {sent:0,skipped:true,reason:'duplicate'}}
   await conn.commit();
  }catch(e){await conn.rollback().catch(()=>{});throw e}finally{conn.release()}
  const [rows]=await p.execute(`SELECT d.viewer_id,d.endpoint,d.endpoint_hash,d.p256dh,d.auth_secret
   FROM swapp_live_push_preferences p
   JOIN swapp_live_push_devices d ON d.viewer_id=p.viewer_id
   WHERE p.creator_login=? AND p.enabled=1 LIMIT 2000`,[login]);
  let sent=0,failed=0;
  for(let i=0;i<rows.length;i+=4){
   await Promise.all(rows.slice(i,i+4).map(async row=>{
    if(!isFollowing(row.viewer_id,login))return;
    try{
     const request=webPushRequest({endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth_secret}},{
      title:login+' est en direct sur SWAPP',
      body:String(title||'Son direct vient de commencer.').slice(0,160),
      url:'/'+encodeURIComponent(login),tag:'swapp-live-'+login
     });
     const response=await send(row.endpoint,{method:'POST',headers:request.headers,
      body:request.body,redirect:'error',signal:AbortSignal.timeout(8000)});
     if(response.ok)sent++;
     else if(response.status===404||response.status===410)
      await p.execute('DELETE FROM swapp_live_push_devices WHERE endpoint_hash=?',[row.endpoint_hash]);
     else failed++;
    }catch(e){failed++;logger.warn?.('[SWAPP PUSH] send failed',String(e?.name||'error'))}
   }));
  }
  return {sent,failed};
 }
 return {register,notifyLive,configured:()=>configOkay};
}
module.exports={makeLivePush,validSubscription,validEndpoint,webPushRequest};
