'use strict';
/*
 * Quantic ID account sign-in, separate from the volatile presence demo.
 * Never attach an unlinked public key to a SWAPP account.
 * First link requires an authenticated SWAPP session, explicit consent and a valid Vault signature.
 */
const {createHmac,randomBytes}=require('node:crypto');
const {rateLimit}=require('express-rate-limit');
const {verifySignedAssertion,originAllowed}=require('./swapp-quantic-id-presence');
const AUTH_LEASE_MS=30000,CHALLENGE_MS=120000;
const {accountRow,MAX_USERS:MAX_ACCOUNT_USERS}=require('./swapp-oryon-mysql-accounts');
const DDL='CREATE TABLE IF NOT EXISTS swapp_quantic_account_bindings (key_hash CHAR(64) NOT NULL PRIMARY KEY,user_id VARCHAR(80) NOT NULL,created_at BIGINT NOT NULL,UNIQUE KEY swapp_quantic_one_account_key (user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

function digest(keyId,secret){
 if(!/^qid_[a-f0-9]{32}$/.test(String(keyId||''))||typeof secret!=='string'||secret.length<24)throw Error('quantic_binding_not_configured');
 return createHmac('sha256',secret).update('swapp-quantic-account:v1:').update(keyId).digest('hex');
}
function createBindingStore({mysqlUri,pool,mysqlFactory}={}){
 let client=pool||null,init=null;
 async function ready(){
  if(!init)init=(async()=>{
   if(!client){
    const url=new URL(mysqlUri||'');
    if(url.protocol!=='mysql:'||!url.hostname||!url.username||!url.pathname||url.pathname==='/')throw Error('quantic_mysql_unavailable');
    const factory=mysqlFactory||require('mysql2/promise');
    client=factory.createPool({uri:url.href,connectionLimit:2,waitForConnections:true,queueLimit:25,connectTimeout:5000});
   }
   await client.query(DDL);
  })().catch(error=>{init=null;throw error});
  await init;
 }
 return {
  async getUser(hash){await ready();const [rows]=await client.execute('SELECT user_id FROM swapp_quantic_account_bindings WHERE key_hash=? LIMIT 1',[hash]);return rows[0]?.user_id||null},
  async getKey(id){await ready();const [rows]=await client.execute('SELECT key_hash FROM swapp_quantic_account_bindings WHERE user_id=? LIMIT 1',[id]);return rows[0]?.key_hash||null},
  async bind(id,hash){await ready();await client.execute('INSERT INTO swapp_quantic_account_bindings (key_hash,user_id,created_at) VALUES (?,?,?)',[hash,id,Date.now()])},
  async unbind(id){await ready();const [result]=await client.execute('DELETE FROM swapp_quantic_account_bindings WHERE user_id=?',[id]);return result.affectedRows>0},
  // A new SWAPP account and its Quantic binding must commit together: never orphan an account.
  async createAccountForKey(hash,user){
   if(!/^[a-f0-9]{64}$/.test(String(hash||'')))throw Error('quantic_invalid_key_hash');
   const row=accountRow(user);
   await ready();
   const conn=await client.getConnection();
   try{
    await conn.beginTransaction();
    const [counts]=await conn.execute('SELECT COUNT(*) AS count FROM swapp_oryon_accounts');
    if(Number(counts?.[0]?.count)>=MAX_ACCOUNT_USERS){const err=Error('quantic_account_capacity_reached');err.code='QUANTIC_ACCOUNT_CAPACITY';throw err}
    await conn.execute('INSERT INTO swapp_oryon_accounts (user_id,login,email,payload_json,updated_at) VALUES (?,?,?,?,?)',
     [row.id,row.login,row.email,row.payload,Date.now()]);
    await conn.execute('INSERT INTO swapp_quantic_account_bindings (key_hash,user_id,created_at) VALUES (?,?,?)',
     [hash,row.id,Date.now()]);
    await conn.commit();
    return {id:row.id,created:true};
   }catch(error){
    try{await conn.rollback()}catch{}
    if(error?.code==='ER_DUP_ENTRY'){
     // A simultaneous request may already have registered this key. Reuse it, never mint a second account.
     const id=await this.getUser(hash);
     if(id)return {id,created:false};
     const collision=Error('quantic_registration_collision');collision.code='QUANTIC_ACCOUNT_COLLISION';throw collision;
    }
    throw error;
   }finally{conn.release()}
  }
 };
}
function createAccountRouter(express,{
 secret,store,verifyPassword,findUser,refreshUsers,toSession,clearRemember,newUserFactory,
 now=Date.now,production=process.env.NODE_ENV==='production',enabled=process.env.SWAPP_ACCOUNT_STORE==='mysql'
}={}){
 if(![verifyPassword,findUser,refreshUsers,toSession,clearRemember].every(f=>typeof f==='function'))
  throw Error('quantic_auth_callbacks_missing');
 const router=express.Router(),limited=rateLimit({windowMs:60000,limit:20,standardHeaders:true,legacyHeaders:false});
 // Extra throttle runs ONLY after a valid signature for an identity not yet linked.
 const registrationLimited=rateLimit({windowMs:60*60*1000,limit:3,standardHeaders:true,legacyHeaders:false,message:{success:false,error:'quantic_registration_rate_limited'}});
 const enforceRegistrationLimit=(req,res)=>new Promise(resolve=>{try{registrationLimited(req,res,()=>resolve(true));}catch{resolve(false)}});
 const error=(res,status,code)=>res.status(status).json({success:false,error:code});
 const save=req=>new Promise((ok,no)=>req.session.save(e=>e?no(e):ok()));
 router.use((req,res,next)=>{
  res.set('Cache-Control','no-store');
  if(!enabled||!store||typeof secret!=='string'||secret.length<24)return error(res,503,'quantic_login_not_configured');
  if(req.method==='POST'){
   if(!originAllowed(req.get('Origin'),production)||req.get('Sec-Fetch-Site')==='cross-site')return error(res,403,'quantic_wrong_origin');
   if(!/^application\/json(?:;|$)/i.test(req.get('Content-Type')||''))return error(res,415,'quantic_json_only');
   if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||Buffer.byteLength(JSON.stringify(req.body))>10000)
    return error(res,400,'quantic_invalid_body');
  }
  next();
 });
 router.get('/status',async(req,res)=>{
  const s=req.session||{},active=Boolean(s.quanticAuth&&s.quanticAuth.expiresAt>now());
  let linked=false;
  if(s.oryonUser?.id)try{linked=Boolean(await store.getKey(s.oryonUser.id))}catch{return error(res,503,'quantic_store_unavailable')}
  return res.json({success:true,loggedIn:Boolean(s.oryonUser?.id),login:s.oryonUser?.login||null,linked,quanticSession:active,expiresAt:active?s.quanticAuth.expiresAt:null,leaseMs:AUTH_LEASE_MS});
 });
 router.post('/challenge',limited,async(req,res)=>{
  const purpose=req.body.purpose,s=req.session||{},account=s.oryonUser;
  if(!['link','login','renew','unlink'].includes(purpose))return error(res,400,'quantic_purpose_invalid');
  if(['link','unlink'].includes(purpose)&&(!account?.id||s.quanticAuth))return error(res,401,'swapp_password_login_required');
  if(purpose==='login'&&account?.id)return error(res,409,'swapp_already_logged_in');
  if(purpose==='renew'&&(!account?.id||!s.quanticAuth||s.quanticAuth.expiresAt<=now()))return error(res,401,'quantic_session_expired');
  const challenge=randomBytes(32).toString('base64url'),audience=req.get('Origin');
  req.session.quanticPending={challenge,purpose,audience,userId:account?.id||null,expiresAt:now()+CHALLENGE_MS};
  try{await save(req)}catch{return error(res,503,'quantic_session_unavailable')}
  return res.json({success:true,challenge,audience,expiresAt:now()+CHALLENGE_MS});
 });
 router.post('/prove',limited,async(req,res)=>{
  const s=req.session||{},pending=s.quanticPending;
  delete s.quanticPending;
  if(!pending||pending.expiresAt<=now()||pending.challenge!==req.body.challenge||pending.purpose!==req.body.purpose||
     pending.audience!==req.get('Origin')||(pending.userId||null)!==(s.oryonUser?.id||null))
   return error(res,401,'quantic_challenge_expired_or_used');
  try{await save(req)}catch{return error(res,503,'quantic_session_unavailable')}
  let hash;
  try{
   const key=verifySignedAssertion({proof:req.body.proof,challenge:pending.challenge,audience:pending.audience,now:now()});
   hash=digest(key,secret);
  }catch{return error(res,401,'quantic_invalid_signature')}
  if(pending.purpose==='link'){
   if(!s.oryonUser?.id||s.quanticAuth)return error(res,401,'swapp_password_login_required');
   try{
    await refreshUsers();
    const user=findUser(s.oryonUser.id);
    if(!user)return error(res,401,'swapp_password_login_required');
    if(await store.getKey(user.id))return error(res,409,'quantic_account_already_linked');
    await store.bind(user.id,hash);
    return res.json({success:true,linked:true,login:user.login});
   }catch(e){return error(res,e?.code==='ER_DUP_ENTRY'?409:503,e?.code==='ER_DUP_ENTRY'?'quantic_identity_already_linked':'quantic_store_unavailable')}
  }
  if(pending.purpose==='unlink'){
   if(!s.oryonUser?.id||s.quanticAuth)return error(res,401,'swapp_password_login_required');
   try{
    await refreshUsers();
    const owner=findUser(s.oryonUser.id);
    if(owner?.quantic_only)return error(res,409,'quantic_only_account_recovery_required');
    const linked=await store.getKey(s.oryonUser.id);
    if(!linked||linked!==hash)return error(res,403,'quantic_identity_mismatch');
    return res.json({success:true,unlinked:await store.unbind(s.oryonUser.id)});
   }catch{return error(res,503,'quantic_store_unavailable')}
  }
  if(pending.purpose==='login'){
   if(s.oryonUser?.id)return error(res,409,'swapp_already_logged_in');
   let user;
   let created=false;
   try{
    let id=await store.getUser(hash);
    if(!id){
     if(req.body.createIfMissing!==true)return error(res,401,'quantic_identity_not_linked');
     if(typeof newUserFactory!=='function'||typeof store.createAccountForKey!=='function')
      return error(res,503,'quantic_registration_not_configured');
     const allowed=await enforceRegistrationLimit(req,res);
     if(!allowed)return; // 429 was already sent by express-rate-limit.
     const generated=newUserFactory();
     const result=await store.createAccountForKey(hash,generated);
     id=result.id;created=Boolean(result.created);
    }
    await refreshUsers();user=findUser(id);
    if(!user)return error(res,503,'quantic_account_refresh_failed');
   }catch(e){
    if(e?.code==='QUANTIC_ACCOUNT_CAPACITY')return error(res,503,'quantic_account_capacity_reached');
    if(e?.code==='QUANTIC_ACCOUNT_COLLISION')return error(res,409,'quantic_registration_collision');
    return error(res,503,'quantic_store_unavailable');
   }
   try{
    await new Promise((ok,no)=>req.session.regenerate(e=>e?no(e):ok()));
    req.session.oryonUser={...toSession(user),is_admin:false};
    req.session.twitchUser=null;
    req.session.quanticAuth={hash,expiresAt:now()+AUTH_LEASE_MS};
    clearRemember(res);
    await save(req);
    return res.json({success:true,authenticated:true,created,login:user.login,expiresAt:req.session.quanticAuth.expiresAt});
   }catch{return error(res,503,'quantic_session_unavailable')}
  }
  if(pending.purpose==='renew'){
   if(!s.quanticAuth||s.quanticAuth.hash!==hash||s.quanticAuth.expiresAt<=now()||s.oryonUser?.id!==pending.userId)
    return error(res,401,'quantic_session_expired');
   try{
    const linked=await store.getKey(s.oryonUser.id);
    if(linked!==hash)return error(res,401,'quantic_link_revoked');
    s.quanticAuth.expiresAt=now()+AUTH_LEASE_MS;
    await save(req);
    return res.json({success:true,authenticated:true,expiresAt:s.quanticAuth.expiresAt});
   }catch{return error(res,503,'quantic_store_unavailable')}
  }
  return error(res,400,'quantic_purpose_invalid');
 });
 /* Legacy password-based unlink stays temporarily for compatibility; UI uses signed unlink. */
 router.post('/unlink',limited,async(req,res)=>{
  const s=req.session||{};
  if(!s.oryonUser?.id||s.quanticAuth)return error(res,401,'swapp_password_login_required');
  try{
   await refreshUsers();const user=findUser(s.oryonUser.id),pwd=req.body.password;
   if(!user||typeof pwd!=='string'||pwd.length>512||!verifyPassword(pwd,user.password_hash))
    return error(res,403,'swapp_password_invalid');
   return res.json({success:true,unlinked:await store.unbind(user.id)});
  }catch{return error(res,503,'quantic_store_unavailable')}
 });
 router.post('/logout',limited,async(req,res)=>{
  if(!req.session?.quanticAuth)return res.json({success:true,loggedOut:false});
  req.session.quanticAuth=null;req.session.oryonUser=null;req.session.twitchUser=null;req.session.quanticPending=null;
  clearRemember(res);
  try{await save(req)}catch{return error(res,503,'quantic_session_unavailable')}
  return res.json({success:true,loggedOut:true});
 });
 return router;
}
function createLeaseGuard({now=Date.now,clearRemember=()=>{}}={}){
 return (req,res,next)=>{
  const q=req.session?.quanticAuth;
  if(!q)return next();
  if(Number.isFinite(q.expiresAt)&&q.expiresAt>now())return next();
  req.session.quanticAuth=null;
  req.session.oryonUser=null;
  req.session.twitchUser=null;
  req.session.quanticPending=null;
  clearRemember(res);
  req.session.save(error=>error?next(error):next());
 };
}
module.exports={createBindingStore,createAccountRouter,createLeaseGuard,digest,AUTH_LEASE_MS,CHALLENGE_MS,DDL};
