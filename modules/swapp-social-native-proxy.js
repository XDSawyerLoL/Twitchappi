'use strict';
/** First-party SWAPP transport for the real Quantic SOCIAL application.
 * Exact allowlist, pinned upstream, strict method/origin checks, no SWAPP cookies.
 */
const SOCIAL_ORIGIN='https://quanticminds.onrender.com';
const crypto=require('node:crypto');
const simple={
 GET:new Set(['/health','/feed','/search','/circles','/notifications','/me','/me/bookmarks','/conversations','/export']),
 POST:new Set(['/auth/login','/auth/register','/auth/logout','/posts','/circles','/notifications/read','/report','/messages']),
 PATCH:new Set(['/me'])
};
const dynamic={
 GET:[/^\/posts\/[a-zA-Z0-9_-]{3,90}$/, /^\/posts\/[a-zA-Z0-9_-]{3,90}\/replies$/, /^\/users\/[a-z0-9_-]{3,32}$/, /^\/messages\/[a-z0-9_-]{3,32}$/],
 POST:[/^\/posts\/[a-zA-Z0-9_-]{3,90}\/(like|repost|bookmark)$/, /^\/users\/[a-z0-9_-]{3,32}\/(follow|block)$/, /^\/circles\/[a-zA-Z0-9_-]{3,90}\/join$/]
};
function permitted(method,path){
 return (simple[method]?.has(path)||dynamic[method]?.some(pattern=>pattern.test(path)))===true;
}
function safeQuery(path,raw){
 const q=new URLSearchParams();
 if(path==='/feed'){
  const input=new URLSearchParams(String(raw||''));
  const mode=input.get('mode');
  q.set('mode',['discover','following'].includes(mode)?mode:'discover');
  q.set('limit',String(Math.min(40,Math.max(1,Number(input.get('limit'))||40))));
 }else if(path==='/search'){
  q.set('q',new URLSearchParams(String(raw||'')).get('q')?.slice(0,80)||'');
 }
 return q.size?'?'+q.toString():'';
}
function swappSocialCredentials(user,secret){
 const id=String(user?.id||'').trim();
 if(!id||!secret)throw Error('social_sso_unconfigured');
 const stem=String(user?.login||'member').toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,10)||'member';
 const suffix=crypto.createHmac('sha256',secret).update('social-handle-v1:'+id).digest('hex').slice(0,10);
 return {handle:'s_'+stem+'_'+suffix,password:crypto.createHmac('sha256',secret).update('social-password-v1:'+id).digest('base64url'),
  displayName:String(user?.display_name||user?.login||'Membre SWAPP').trim().slice(0,50)};
}
function createSocialNativeProxy(fetchImpl,{production=true,restoreLocalSession=null,ssoSecret='',lookupLocalUser=null,listLocalUsers=null,recordAudioBlock=null}={}){

 if(typeof fetchImpl!=='function')throw Error('fetch implementation is required');
 const sessionSso=typeof restoreLocalSession==='function';
 // Collapse parallel feed/me/circles requests into one backend sign-in.
 const signingIn=new Map();
 // A SWAPP member may receive a first DM before they ever open SOCIAL.
 // Provision the deterministic SOCIAL shadow account only when a member sends
 // them a message. Cache in-flight registration attempts for one server process.
 const recipientProvisioning=new Map();
 async function ensureRecipient(local){
  if(!local?.id||!local?.login)return;
  const key=String(local.id);
  if(recipientProvisioning.has(key))return recipientProvisioning.get(key);
  const task=(async()=>{
   const credentials=swappSocialCredentials(local,ssoSecret);
   const response=await fetchImpl(SOCIAL_ORIGIN+'/api/pulse/auth/register',{
    method:'POST',redirect:'error',
    headers:{Accept:'application/json','Content-Type':'application/json'},
    body:JSON.stringify(credentials)
   },10000);
   // 409 means the expected deterministic handle has already been reserved.
   // An existing member must not require a second registration.
   if(response.status===429)throw new Error('social_upstream_rate_limited');
   if(response.status>=500)throw new Error('social_upstream_unavailable');
   if(![200,201,409].includes(response.status))
    throw new Error('social_recipient_not_ready');
   return true;
  })();
  recipientProvisioning.set(key,task);
  try{return await task}
  catch(error){
   recipientProvisioning.delete(key);
   throw error;
  }
 }
 async function issueSocialToken(req,user){
  const cached=req.session?.swappSocialAuth;
  if(cached?.userId===user.id&&typeof cached.token==='string'&&cached.token.length>=20)return cached.token;
  const key=String(req.sessionID||'')+':'+String(user.id);
  if(signingIn.has(key))return signingIn.get(key);
  const task=(async()=>{
   const creds=swappSocialCredentials(user,ssoSecret);
   const authCall=async(kind)=>{
    const endpoint=SOCIAL_ORIGIN+'/api/pulse/auth/'+kind;
    const response=await fetchImpl(endpoint,{method:'POST',redirect:'error',
     headers:{Accept:'application/json','Content-Type':'application/json'},
     body:JSON.stringify(kind==='login'?{handle:creds.handle,password:creds.password}:creds)},10000);
    const payload=await response.json().catch(()=>({}));
    return {status:response.status,payload};
   };
   let result=await authCall('login');
   if(result.status===429)throw Object.assign(new Error('social_upstream_rate_limited'),{status:503});
   if(result.status>=500)throw Object.assign(new Error('social_upstream_unavailable'),{status:503});
   if(result.status===401||result.status===404){
    const created=await authCall('register');
    if(created.status===409)throw Object.assign(new Error('social_identity_conflict'),{status:409});
    if(created.status===429)throw Object.assign(new Error('social_upstream_rate_limited'),{status:503});
    if(created.status>=500)throw Object.assign(new Error('social_upstream_unavailable'),{status:503});
    if(created.status<200||created.status>=300)throw Object.assign(new Error('social_sso_unavailable'),{status:503});
    result=created;
   }
   if(result.status<200||result.status>=300)throw Object.assign(new Error('social_sso_unavailable'),{status:503});
   const token=result.payload?.token;
   if(typeof token!=='string'||!/^[A-Za-z0-9._-]{20,768}$/.test(token))
    throw Object.assign(new Error('social_sso_unavailable'),{status:503});
   if(req.session)req.session.swappSocialAuth={userId:user.id,token};
   return token;
  })();
  signingIn.set(key,task);
  try{return await task}finally{signingIn.delete(key)}
 }
 return async function proxy(req,res){
  res.set('Cache-Control','private, no-store');
  res.set('X-Content-Type-Options','nosniff');
  const method=String(req.method||'').toUpperCase();
  const path=String(req.path||'');
  if(!permitted(method,path))return res.status(404).json({error:'social_route_not_available'});
  if(method!=='GET'){
   const origin=String(req.headers?.origin||'');
   const referer=String(req.headers?.referer||'');
   const allowedOrigins=['https://swapp.tv','https://www.swapp.tv'];
   if(!production)allowedOrigins.push('http://localhost:3000','http://127.0.0.1:3000');
   if(!allowedOrigins.includes(origin)||
      (referer&&!allowedOrigins.some(allow=>referer.startsWith(allow+'/')))){
    return res.status(403).json({error:'social_origin_required'});
   }
  }
  const headers={Accept:'application/json'};
  let swappUser=null;
  if(sessionSso&&path!=='/health'){
   if(path.startsWith('/auth/'))return res.status(403).json({error:'swapp_account_required'});
   if(!ssoSecret||ssoSecret.length<24)return res.status(503).json({error:'social_sso_unconfigured'});
   let restoredUser=null;
   try{restoredUser=await restoreLocalSession(req,res)}
   catch{return res.status(503).json({error:'swapp_session_unavailable'})}
   // The session restoration helper returns the validated local account.
   // Do not depend exclusively on a session object that might not yet have been
   // persisted when the browser immediately opens SOCIAL after login.
   swappUser=req.session?.oryonUser?.id?req.session.oryonUser:restoredUser;
   if(!swappUser?.id||!swappUser?.login)return res.status(401).json({error:'swapp_account_required'});
   try{headers.Authorization='Bearer '+await issueSocialToken(req,swappUser)}
   catch(error){
    const code=String(error?.message||'');
    const allowed=['social_identity_conflict','social_sso_unconfigured','social_upstream_rate_limited','social_upstream_unavailable'];
    return res.status(error.status||503).json({error:allowed.includes(code)?code:'social_sso_unavailable'});
   }
  }else{
   const bearer=String(req.headers?.authorization||'').match(/^Bearer ([A-Za-z0-9_-]{20,256})$/);
   if(bearer)headers.Authorization='Bearer '+bearer[1];
   else if(!['GET'].includes(method)&&!['/auth/login','/auth/register'].includes(path)){
    return res.status(401).json({error:'unauthorized'});
   }
  }
  // Human-facing SWAPP handles are resolved to internal SOCIAL handles only
  // on the server. Do not expose or trust an arbitrary user-provided account ID.
  const resolveHandle=input=>{
   const handle=String(input||'').trim().toLowerCase().replace(/^@/,'');
   if(!sessionSso||typeof lookupLocalUser!=='function')return handle;
   if(!/^[a-z0-9_-]{3,32}$/.test(handle))return handle;
   const local=lookupLocalUser(handle);
   return local?.id&&local?.login?swappSocialCredentials(local,ssoSecret).handle:handle;
  };
  let upstreamPath=path;
  if(sessionSso){
   const userPath=path.match(/^\/(users|messages)\/([a-z0-9_-]{3,32})(\/(?:follow|block))?$/);
   if(userPath)upstreamPath='/'+userPath[1]+'/'+resolveHandle(userPath[2])+(userPath[3]||'');
  }
  let body;
  if(method!=='GET'){
   if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))return res.status(400).json({error:'invalid_body'});
   body=JSON.stringify(sessionSso&&path==='/messages'?{...req.body,handle:resolveHandle(req.body.handle)}:req.body);
   if(body.length>8500)return res.status(413).json({error:'body_too_large'});
   headers['Content-Type']='application/json';
  }
  // The browser supplies only the public SWAPP handle. The server performs
  // recipient onboarding using an HMAC-derived identity before the first DM.
  // Never retry a DM after an ambiguous timeout: that risks duplicate messages.
  if(sessionSso&&method==='POST'&&path==='/messages'&&typeof lookupLocalUser==='function'){
   const handle=String(req.body?.handle||'').trim().toLowerCase().replace(/^@/,'');
   const recipient=lookupLocalUser(handle);
   if(recipient?.id&&recipient?.login){
    try{await ensureRecipient(recipient)}
    catch(error){
     const code=['social_upstream_rate_limited','social_upstream_unavailable'].includes(error?.message)
      ?error.message:'social_recipient_not_ready';
     return res.status(503).json({error:code});
    }
   }
  }
  // A member's explicit Block action disables first-party voice/audio even if
  // the remote SOCIAL backend is slow or returns an error. The operation is
  // idempotent; never permit calls or voice notes to bypass the user's block.
  if(sessionSso&&method==='POST'&&/^\\/users\\/[a-z0-9_-]{3,32}\\/block$/.test(path)&&
    typeof lookupLocalUser==='function'&&typeof recordAudioBlock==='function'){
    const handle=path.split('/')[2];
    const target=lookupLocalUser(handle);
    if(target?.id&&swappUser?.id&&String(target.id)!==String(swappUser.id)){
      try{await recordAudioBlock(swappUser,target)}
      catch{return res.status(503).json({error:'social_audio_block_unavailable'})}
    }
  }
  const endpoint=SOCIAL_ORIGIN+'/api/pulse'+upstreamPath+safeQuery(path,req.originalUrl?.split('?').slice(1).join('?'));
  // Read-only requests may retry once if Render wakes a cold instance.
  // Never retry a write: a timeout must not publish a post or send a DM twice.
  // Retry writes ONLY after an explicit 401 (not after a timeout or server error).
  const attempts=method==='GET'&&path==='/feed'?2:sessionSso?2:1;
  for(let attempt=0;attempt<attempts;attempt++){
   try{
    const result=await fetchImpl(endpoint,{
     method,headers,redirect:'error',
     ...(body===undefined?{}:{body})
    },path==='/health'?5000:method==='GET'?(attempt===0?10000:13000):12000);
    if(!result||!Number.isInteger(result.status))throw Error('bad_upstream');
    const raw=await result.text();
    if(raw.length>1250000)throw Error('response_too_large');
    let data;try{data=JSON.parse(raw)}catch{throw Error('non_json_upstream')}
    if(sessionSso&&result.status===401){
     if(req.session)delete req.session.swappSocialAuth;
     if(attempt+1<attempts){
      try{headers.Authorization='Bearer '+await issueSocialToken(req,swappUser)}
      catch(error){
       const code=String(error?.message||'');
       return res.status(503).json({error:['social_upstream_rate_limited','social_upstream_unavailable','social_sso_unconfigured'].includes(code)?code:'social_sso_unavailable'});
      }
      continue;
     }
     return res.status(503).json({error:'social_sso_unavailable'});
    }
    if(result.status>=500){
     if(method==='GET'&&path==='/feed'&&attempt+1<attempts)continue;
     return res.status(503).json({error:'social_upstream_unavailable'});
    }
    if(sessionSso&&result.status===404&&path==='/messages'&&typeof lookupLocalUser==='function'&&
       lookupLocalUser(String(req.body?.handle||'').toLowerCase().replace(/^@/,''))){
     return res.status(404).json({error:'social_recipient_not_ready'});
    }
    // Opening a new conversation must not show an unavailable screen simply
    // because the recipient has not activated SOCIAL. No upstream account is
    // created by merely viewing a SWAPP member's profile or chat composer.
    if(sessionSso&&method==='GET'&&result.status===404&&path.startsWith('/messages/')&&typeof lookupLocalUser==='function'){
     const local=lookupLocalUser(path.slice('/messages/'.length).toLowerCase());
     if(local?.id&&local?.login)return res.status(200).json({
      user:{handle:local.login,displayName:local.display_name||local.login},
      messages:[]
     });
    }
    if(sessionSso&&result.status>=200&&result.status<300&&typeof listLocalUsers==='function'){
     // Translate backend-only shadow handles back to public SWAPP account names.
     const aliases=new Map();
     try{
      for(const local of (listLocalUsers()||[])){
       if(local?.id&&local?.login)aliases.set(swappSocialCredentials(local,ssoSecret).handle,local);
      }
     }catch{}
     const alias=user=>{
      if(!user||typeof user!=='object')return;
      const local=aliases.get(user.handle);
      if(!local)return;
      user.handle=String(local.login).slice(0,32);
      user.displayName=String(local.display_name||local.login).slice(0,50);
     };
     alias(data?.user);
     alias(data?.post?.author);
     alias(data?.post?.quote?.author);
     for(const item of Array.isArray(data?.posts)?data.posts:[]){
      alias(item?.author);alias(item?.quote?.author);
     }
     for(const item of Array.isArray(data?.users)?data.users:[])alias(item);
     for(const item of Array.isArray(data?.conversations)?data.conversations:[])alias(item?.user);
    }
    if(sessionSso&&path==='/me'&&result.status===200&&data?.user&&swappUser){
     data.user.handle=String(swappUser.login).slice(0,32);
     data.user.displayName=String(swappUser.display_name||swappUser.login).slice(0,50);
    }
    return res.status(result.status).json(data);
   }catch(error){
    if(method==='GET'&&path==='/feed'&&attempt+1<attempts)continue;
    const timedOut=error?.name==='AbortError'||error?.name==='TimeoutError';
    // No Authorization header, session, URL or personal data is logged.
    console.warn('[SWAPP SOCIAL] Backend inaccessible:',timedOut?'timeout': 'network_or_invalid_response');
    return res.status(503).json({error:timedOut?'social_upstream_timeout':'social_upstream_unreachable'});
   }
  }
 };
}
module.exports={SOCIAL_ORIGIN,permitted,safeQuery,swappSocialCredentials,createSocialNativeProxy};
