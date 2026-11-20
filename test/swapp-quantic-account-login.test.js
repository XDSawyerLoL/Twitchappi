'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash,generateKeyPairSync,sign}=require('node:crypto');
const {createBindingStore,createAccountRouter,createLeaseGuard,digest,generateRecoveryCodes,recoveryDigest,requiresVaultAuthentication,FRESH_PASSWORD_MS,AUTH_LEASE_MS}=require('../modules/swapp-quantic-account-auth');

function identity(){
 const pair=generateKeyPairSync('ed25519');
 const der=pair.publicKey.export({type:'spki',format:'der'});
 const keyId='qid_'+createHash('sha256').update(der).digest('hex').slice(0,32);
 return {
  keyId,
  sign(challenge,audience,now){
   const payload=JSON.stringify({version:1,keyId,challenge,audience,issuedAt:new Date(now).toISOString()});
   return {version:1,algorithm:'ed25519',keyId,publicKey:der.toString('base64url'),payload,
    signature:sign(null,Buffer.from(payload),pair.privateKey).toString('base64url')};
  }
 };
}
async function fixture(t){
 const express=require('express'),session=require('express-session');
 let time=Date.now(),clearCount=0;
 const bindings=new Map(),reverse=new Map(),createdUsers=new Map(),recovery=new Map();
 let generated=0;
 const existing={id:'aa11aa11aa11aa11aa11aa11',login:'alice',password_hash:'current-password'};
 const store={
  async getUser(key){return bindings.get(key)||null},
  async getKey(id){return reverse.get(id)||null},
  async bind(id,key){
   if(bindings.has(key)||reverse.has(id)){const e=Error('duplicate');e.code='ER_DUP_ENTRY';throw e}
   bindings.set(key,id);reverse.set(id,key);
  },
  async unbind(id){const key=reverse.get(id);if(!key)return false;reverse.delete(id);bindings.delete(key);return true},
  async hasRecovery(id){return [...recovery.values()].some(owner=>owner===id)},
  async setRecoveryCodes(id,hashes){
   if(!reverse.has(id))throw Error('no binding');
   for(const [hash,owner] of recovery)if(owner===id)recovery.delete(hash);
   for(const hash of hashes)recovery.set(hash,id);
  },
  async recoverAccount(newHash,recoveryHash){
   const id=recovery.get(recoveryHash);
   if(!id||bindings.has(newHash))throw Error('quantic_recovery_invalid');
   const old=reverse.get(id);
   if(!old||old===newHash)throw Error('quantic_recovery_invalid');
   bindings.delete(old);bindings.set(newHash,id);reverse.set(id,newHash);
   for(const [code,owner] of recovery)if(owner===id)recovery.delete(code);
   return id;
  },
  async createAccountForKey(hash,user){
   const existing=bindings.get(hash);
   if(existing)return {id:existing,created:false};
   if(reverse.has(user.id))throw Error('duplicate identity');
   createdUsers.set(user.id,user);bindings.set(hash,user.id);reverse.set(user.id,hash);
   return {id:user.id,created:true};
  }
 };
 const secret='S'.repeat(48);
 const app=express();
 app.use(express.json());
 app.use(session({secret:'testing-only-express-session-secret',resave:false,saveUninitialized:false,cookie:{sameSite:'lax'}}));
 app.use(createLeaseGuard({now:()=>time,clearRemember:()=>{clearCount++},
  getBoundKey:id=>reverse.get(id)||null,
  getSessionUser:id=>id===existing.id?existing:(createdUsers.get(id)||null)
 }));
 app.post('/__test/password-login',(req,res)=>{
  const user=createdUsers.get(req.body?.userId)||existing;
  req.session.oryonUser={id:user.id,login:user.login};
  if(req.body?.remembered!==true)req.session.swappPasswordAuthenticatedAt=time;
  req.session.save(error=>error?res.status(500).end():res.json({success:true}));
 });
 app.post('/__test/logout',(req,res)=>{
  req.session.oryonUser=null;req.session.quanticAuth=null;req.session.swappPasswordAuthenticatedAt=null;
  req.session.save(error=>error?res.status(500).end():res.json({success:true}));
 });
 app.use('/api/quantic-id/account',createAccountRouter(express,{
  secret,store,enabled:true,production:false,now:()=>time,
  verifyPassword:(password,hash)=>password===hash,
  findUser:id=>id===existing.id?existing:(createdUsers.get(id)||null),
  newUserFactory:()=>({id:'auto_'+(++generated),login:'vault_'+generated,display_name:'Membre Quantic',quantic_only:true}),
  enforceVaultOnly:async id=>{const u=id===existing.id?existing:createdUsers.get(id);if(!u)throw Error('missing');u.quantic_required=true},
  refreshUsers:async()=>{},
  toSession:user=>({id:user.id,login:user.login,is_admin:false}),
  clearRemember:()=>{clearCount++}
 }));
 const server=app.listen(0,'127.0.0.1');
 await new Promise(ok=>server.once('listening',ok));
 t.after(()=>new Promise(ok=>server.close(ok)));
 const origin='http://127.0.0.1:'+server.address().port;
 let cookie='';
 async function request(path,body){
  const options={method:body===undefined?'GET':'POST',headers:{origin}};
  if(body!==undefined){options.headers['content-type']='application/json';options.body=JSON.stringify(body)}
  if(cookie)options.headers.cookie=cookie;
  const response=await fetch(origin+path,options);
  const setCookie=response.headers.get('set-cookie');
  if(setCookie){const first=setCookie.split(';')[0];if(first.startsWith('connect.sid='))cookie=first;}
  const data=await response.json();
  return {status:response.status,data};
 }
 async function challengeAndProof(purpose,key,password,options={}){
  const start=await request('/api/quantic-id/account/challenge',{purpose});
  assert.equal(start.status,200,JSON.stringify(start.data));
  const challenge=start.data.challenge,proof=key.sign(challenge,origin,time);
  return request('/api/quantic-id/account/prove',{purpose,challenge,proof,...(password!==undefined?{password}:{}),...options});
 }
 return {request,challengeAndProof,identity:identity(),origin,get time(){return time},setTime:v=>{time=v},bindings,reverse,createdUsers,secret,
  get clearCount(){return clearCount},recovery,existing};
}

test('Quantic account fingerprints are HMAC scoped, no reversible QID stored',()=>{
 const q=identity(),a=digest(q.keyId,'A'.repeat(32)),b=digest(q.keyId,'B'.repeat(32));
 assert.match(a,/^[a-f0-9]{64}$/);assert.notEqual(a,b);assert.ok(!a.includes(q.keyId));
 assert.throws(()=>digest('qid_not_a_key','A'.repeat(32)));
});

test('Unknown Quantic identity cannot open or hijack any SWAPP account',async t=>{
 const ctx=await fixture(t),q=ctx.identity;
 const tryLogin=await ctx.challengeAndProof('login',q);
 assert.equal(tryLogin.status,401);assert.equal(tryLogin.data.error,'quantic_identity_not_linked');
 const session=await ctx.request('/api/quantic-id/account/status');
 assert.equal(session.data.loggedIn,false);
 assert.equal(ctx.bindings.size,0);
});

test('Link requires an existing SWAPP account and a real signature, without another password',async t=>{
 const ctx=await fixture(t),q=ctx.identity;
 const failed=await ctx.request('/api/quantic-id/account/challenge',{purpose:'link'});
 assert.equal(failed.status,401);
 await ctx.request('/__test/password-login',{});
 const link=await ctx.challengeAndProof('link',q);
 assert.equal(link.status,200,JSON.stringify(link.data));
 assert.equal(ctx.bindings.size,1);
 assert.equal(ctx.bindings.get(digest(q.keyId,ctx.secret)),'aa11aa11aa11aa11aa11aa11');
 const status=await ctx.request('/api/quantic-id/account/status');
 assert.equal(status.data.linked,true);
 const again=await ctx.challengeAndProof('link',q);
 assert.equal(again.status,409);
});

test('Linked Quantic ID starts a real SWAPP session; lock/logout and TTL revoke it',async t=>{
 const ctx=await fixture(t),q=ctx.identity;
 await ctx.request('/__test/password-login',{});
 assert.equal((await ctx.challengeAndProof('link',q,'current-password')).status,200);
 await ctx.request('/__test/logout',{});
 const login=await ctx.challengeAndProof('login',q);
 assert.equal(login.status,200,JSON.stringify(login.data));
 assert.equal(login.data.authenticated,true);
 const status=await ctx.request('/api/quantic-id/account/status');
 assert.equal(status.data.loggedIn,true);
 assert.equal(status.data.quanticSession,true);
 assert.equal(status.data.login,'alice');
 const renew=await ctx.challengeAndProof('renew',q);
 assert.equal(renew.status,200,JSON.stringify(renew.data));
 const logout=await ctx.request('/api/quantic-id/account/logout',{});
 assert.equal(logout.data.loggedOut,true);
 assert.equal((await ctx.request('/api/quantic-id/account/status')).data.loggedIn,false);
 const again=await ctx.challengeAndProof('login',q);
 assert.equal(again.status,200);
 ctx.setTime(ctx.time+AUTH_LEASE_MS+10);
 const expired=await ctx.request('/api/quantic-id/account/status');
 assert.equal(expired.data.loggedIn,false);
 assert.equal(expired.data.quanticSession,false);
 assert.ok(ctx.clearCount>=2,'cookie cleared after login and expiry');
});

test('Wrong audience, key mismatch and replayed proof cannot renew a SWAPP session',async t=>{
 const ctx=await fixture(t),q=ctx.identity,foreign=identity();
 await ctx.request('/__test/password-login',{});
 assert.equal((await ctx.challengeAndProof('link',q,'current-password')).status,200);
 await ctx.request('/__test/logout',{});
 assert.equal((await ctx.challengeAndProof('login',foreign)).status,401);
 const login=await ctx.challengeAndProof('login',q);
 assert.equal(login.status,200);
 const start=await ctx.request('/api/quantic-id/account/challenge',{purpose:'renew'});
 const proof=q.sign(start.data.challenge,ctx.origin,ctx.time);
 const invalid=await ctx.request('/api/quantic-id/account/prove',{purpose:'renew',challenge:start.data.challenge,
  proof:{...proof,payload:proof.payload.replace(ctx.origin,'https://wrong.example')}});
 assert.equal(invalid.status,401);
 const replay=await ctx.request('/api/quantic-id/account/prove',{purpose:'renew',challenge:start.data.challenge,proof});
 assert.equal(replay.status,401);
 const otherKey=await ctx.challengeAndProof('renew',foreign);
 assert.equal(otherKey.status,401);
 const stillValid=await ctx.challengeAndProof('renew',q);
 assert.equal(stillValid.status,200);
});

test('SWAPP user can unlink using a signed proof after normal sign-in',async t=>{
 const ctx=await fixture(t),q=ctx.identity;
 await ctx.request('/__test/password-login',{});
 assert.equal((await ctx.challengeAndProof('link',q,'current-password')).status,200);
 await ctx.request('/__test/logout',{});
 assert.equal((await ctx.challengeAndProof('login',q)).status,200);
 assert.equal((await ctx.request('/api/quantic-id/account/challenge',{purpose:'unlink'})).status,401);
 await ctx.request('/__test/logout',{});
 await ctx.request('/__test/password-login',{});
 const other=identity();
 assert.equal((await ctx.challengeAndProof('unlink',other)).status,403);
 const unlinked=await ctx.challengeAndProof('unlink',q);
 assert.equal(unlinked.status,200);
 assert.equal(unlinked.data.unlinked,true);
 await ctx.request('/__test/logout',{});
 assert.equal((await ctx.challengeAndProof('login',q)).status,401);
});

test('Unknown signed Vault identity creates exactly one separate real SWAPP account on explicit login consent',async t=>{
 const ctx=await fixture(t),key=ctx.identity;
 const result=await ctx.challengeAndProof('login',key,undefined,{createIfMissing:true});
 assert.equal(result.status,200,JSON.stringify(result.data));
 assert.equal(result.data.created,true);
 const first=await ctx.request('/api/quantic-id/account/status');
 assert.equal(first.data.loggedIn,true);
 assert.equal(first.data.quanticSession,true);
 assert.equal(ctx.createdUsers.size,1);
 const created=[...ctx.createdUsers.values()][0];
 assert.equal(created.quantic_only,true);
 assert.equal(first.data.login,created.login);
 assert.notEqual(created.id,'aa11aa11aa11aa11aa11aa11');
 await ctx.request('/__test/logout',{});
 const second=await ctx.challengeAndProof('login',key,undefined,{createIfMissing:true});
 assert.equal(second.status,200);
 assert.equal(second.data.created,false);
 assert.equal(second.data.login,created.login);
 assert.equal(ctx.createdUsers.size,1);
});
test('A new Quantic-only account cannot remove its last login factor',async t=>{
 const ctx=await fixture(t),key=ctx.identity;
 assert.equal((await ctx.challengeAndProof('login',key,undefined,{createIfMissing:true})).status,200);
 await ctx.request('/__test/logout',{});
 const created=[...ctx.createdUsers.values()][0];
 await ctx.request('/__test/password-login',{userId:created.id});
 assert.equal((await ctx.challengeAndProof('unlink',key)).status,409);
 assert.equal(ctx.createdUsers.size,1);
 assert.equal(ctx.bindings.size,1);
});
test('Forged assertions and users with an existing account cannot silently auto-bind identity',async t=>{
 const ctx=await fixture(t),key=ctx.identity;
 await ctx.request('/__test/password-login',{});
 assert.equal((await ctx.request('/api/quantic-id/account/challenge',{purpose:'login'})).status,409);
 assert.equal(ctx.createdUsers.size,0);
 await ctx.request('/__test/logout',{});
 const started=await ctx.request('/api/quantic-id/account/challenge',{purpose:'login'});
 const spoof=key.sign(started.data.challenge,ctx.origin,ctx.time);
 spoof.signature='A'.repeat(86);
 const denied=await ctx.request('/api/quantic-id/account/prove',{purpose:'login',challenge:started.data.challenge,proof:spoof,createIfMissing:true});
 assert.equal(denied.status,401);
 assert.equal(ctx.createdUsers.size,0);
});

test('MySQL Quantic signup inserts account and binding in one transaction or rolls both back',async()=>{
 const liveAccounts=new Map(),liveBindings=new Map();
 let tx=null,failBinding=false,rollbacks=0;
 const conn={
  async beginTransaction(){tx={accounts:new Map(liveAccounts),bindings:new Map(liveBindings)}},
  async commit(){liveAccounts.clear();liveBindings.clear();for(const [k,v] of tx.accounts)liveAccounts.set(k,v);for(const [k,v] of tx.bindings)liveBindings.set(k,v);tx=null},
  async rollback(){rollbacks++;tx=null},
  release(){},
  async execute(sql,params=[]){
   if(sql.startsWith('SELECT COUNT(*)'))return [[{count:tx.accounts.size}],[]];
   if(sql.startsWith('INSERT INTO swapp_oryon_accounts')){
    if([...tx.accounts.values()].some(u=>u.login===params[1]||u.email===params[2]))
     throw Object.assign(Error('duplicate account'),{code:'ER_DUP_ENTRY'});
    tx.accounts.set(params[0],{login:params[1],email:params[2],payload_json:params[3]});
    return [{affectedRows:1},[]];
   }
   if(sql.startsWith('INSERT INTO swapp_quantic_account_bindings')){
    if(failBinding)throw Error('database binding failure');
    if(tx.bindings.has(params[0]))throw Object.assign(Error('duplicate key'),{code:'ER_DUP_ENTRY'});
    tx.bindings.set(params[0],params[1]);return [{affectedRows:1},[]];
   }
   throw Error('Unexpected transaction SQL '+sql);
  }
 };
 const pool={
  async query(){return [[],[]]},
  getConnection:async()=>conn,
  async execute(sql,params=[]){
   if(sql.startsWith('SELECT user_id FROM swapp_quantic_account_bindings WHERE key_hash=?'))
    return [liveBindings.has(params[0])?[{user_id:liveBindings.get(params[0])}]:[],[]];
   throw Error('Unexpected lookup SQL '+sql);
  }
 };
 const store=createBindingStore({pool});
 const hash='a'.repeat(64),u={
  id:'auto_123456',login:'vault_abcdef',email:'quantic-a@accounts.swapp.invalid',
  password_hash:'random-hashed-password',quantic_only:true
 };
 failBinding=true;
 await assert.rejects(store.createAccountForKey(hash,u),/database binding failure/);
 assert.equal(rollbacks,1);
 assert.equal(liveAccounts.size,0);
 assert.equal(liveBindings.size,0);
 failBinding=false;
 const created=await store.createAccountForKey(hash,u);
 assert.deepEqual(created,{id:u.id,created:true});
 assert.equal(liveAccounts.size,1);
 assert.equal(liveBindings.get(hash),u.id);
 const repeated=await store.createAccountForKey(hash,{...u,id:'auto_222222',login:'vault_other',email:'quantic-b@accounts.swapp.invalid'});
 assert.deepEqual(repeated,{id:u.id,created:false});
 assert.equal(liveAccounts.size,1);
});

test('legacy account mode guard requires Vault for Quantic-only and optional strict accounts',()=>{
 assert.equal(requiresVaultAuthentication({quantic_only:true}),true);
 assert.equal(requiresVaultAuthentication({quantic_required:true}),true);
 assert.equal(requiresVaultAuthentication({quantic_only:false}),false);
 assert.equal(requiresVaultAuthentication({}),false);
});
test('linking a new Vault key rejects remembered and stale password sessions',async t=>{
 const c=await fixture(t),q=c.identity;
 await c.request('/__test/password-login',{remembered:true});
 const remembered=await c.request('/api/quantic-id/account/challenge',{purpose:'link'});
 assert.equal(remembered.status,401);
 assert.equal(remembered.data.error,'swapp_recent_password_required');
 await c.request('/__test/logout',{});
 await c.request('/__test/password-login',{});
 c.setTime(c.time+FRESH_PASSWORD_MS+1);
 const stale=await c.request('/api/quantic-id/account/challenge',{purpose:'link'});
 assert.equal(stale.status,401);
 assert.equal(stale.data.error,'swapp_recent_password_required');
 await c.request('/__test/logout',{});
 await c.request('/__test/password-login',{});
 assert.equal((await c.challengeAndProof('link',q)).status,200);
});
test('legacy password unlink cannot remove the only Quantic factor',async t=>{
 const c=await fixture(t),q=c.identity;
 const signed=await c.challengeAndProof('login',q,undefined,{createIfMissing:true});
 assert.equal(signed.status,200);
 const created=[...c.createdUsers.values()][0];
 await c.request('/__test/logout',{});
 await c.request('/__test/password-login',{userId:created.id});
 const bypass=await c.request('/api/quantic-id/account/unlink',{password:undefined});
 assert.equal(bypass.status,409);
 assert.equal(bypass.data.error,'quantic_only_account_recovery_required');
 assert.equal(c.bindings.size,1);
});
test('server disables password, remember and reset fallback for Quantic-only accounts',()=>{
 const fs=require('node:fs');
 const src=fs.readFileSync(require.resolve('../server.js'),'utf8');
 assert.match(src,/if\(requiresVaultAuthentication\(user\)\)return null/);
 assert.match(src,/if\(!user \|\| requiresVaultAuthentication\(user\) \|\| !verifyOryonPassword/);
 assert.match(src,/if\(!user \|\| requiresVaultAuthentication\(user\) \|\| !verifyOryonRememberToken/);
 assert.match(src,/app\.post\('\/api\/oryon\/login', authLimiter/);
 assert.match(src,/req\.session\.regenerate\(err=>err\?no\(err\):ok\(\)\)/);
});

test('Recovery codes are uniformly random, secret-scoped, hashed and not reversible',()=>{
 const codes=generateRecoveryCodes();
 assert.equal(codes.length,8);
 assert.equal(new Set(codes).size,8);
 const s='S'.repeat(48);
 for(const code of codes){
  assert.match(code,/^qrc_[A-Za-z0-9_-]{43}$/);
  const hash=recoveryDigest(code,s);
  assert.match(hash,/^[a-f0-9]{64}$/);
  assert.equal(hash.includes(code),false);
  assert.notEqual(hash,recoveryDigest(code,'T'.repeat(48)));
 }
 assert.throws(()=>recoveryDigest('qrc_123',s),/quantic_recovery_invalid/);
});
test('Vault signed enrollment displays 8 codes once, one code atomically replaces a copied private key',async t=>{
 const c=await fixture(t),old=c.identity,newKey=identity();
 const first=await c.challengeAndProof('login',old,undefined,{createIfMissing:true});
 assert.equal(first.status,200);
 const account=first.data.login;
 const enroll=await c.challengeAndProof('recovery-enroll',old);
 assert.equal(enroll.status,200,JSON.stringify(enroll.data));
 assert.equal(enroll.data.recoveryCodes.length,8);
 assert.equal(c.recovery.size,8);
 const code=enroll.data.recoveryCodes[0];
 assert.equal(c.recovery.has(recoveryDigest(code,c.secret)),true);
 const status=await c.request('/api/quantic-id/account/status');
 assert.equal(status.data.recoveryReady,true);
 await c.request('/__test/logout',{});
 const invalid=await c.challengeAndProof('recover',newKey,undefined,{recoveryCode:'qrc_'+'x'.repeat(43)});
 assert.equal(invalid.status,401);
 const rotated=await c.challengeAndProof('recover',newKey,undefined,{recoveryCode:code});
 assert.equal(rotated.status,200,JSON.stringify(rotated.data));
 assert.equal(rotated.data.recovered,true);
 assert.equal(rotated.data.login,account);
 assert.equal(c.recovery.size,0,'all previous recovery codes revoked on rotation');
 await c.request('/__test/logout',{});
 const replay=await c.challengeAndProof('recover',identity(),undefined,{recoveryCode:code});
 assert.equal(replay.status,401);
 assert.equal((await c.challengeAndProof('login',old)).status,401,'old copied key revoked');
 assert.equal((await c.challengeAndProof('login',newKey)).status,200,'new Vault key recovers same account');
});
test('Classic SWAPP accounts require signed Vault and offline recovery before enabling mandatory Vault mode',async t=>{
 const c=await fixture(t),key=c.identity;
 await c.request('/__test/password-login',{});
 assert.equal((await c.challengeAndProof('link',key)).status,200);
 await c.request('/__test/logout',{});
 assert.equal((await c.challengeAndProof('login',key)).status,200);
 const withoutCodes=await c.challengeAndProof('strict-enable',key);
 assert.equal(withoutCodes.status,409);
 assert.equal(withoutCodes.data.error,'quantic_recovery_required');
 assert.equal((await c.challengeAndProof('recovery-enroll',key)).status,200);
 const strict=await c.challengeAndProof('strict-enable',key);
 assert.equal(strict.status,200);
 assert.equal(c.existing.quantic_required,true);
 await c.request('/__test/logout',{});
 await c.request('/__test/password-login',{});
 const oldSession=await c.request('/api/quantic-id/account/status');
 assert.equal(oldSession.data.loggedIn,false,'legacy password session rejected by guard');
 assert.equal((await c.challengeAndProof('login',key)).status,200);
 assert.equal((await c.request('/api/quantic-id/account/status')).data.strict,true);
});
test('Server rejects a copied SWAPP session immediately after Vault key rotation',async()=>{
 let saved=false,cleared=0,nextCalled=false;
 const req={path:'/api/oryon/session',session:{
  oryonUser:{id:'user-1'},quanticAuth:{hash:'a'.repeat(64),expiresAt:Date.now()+20000},
  save:callback=>{saved=true;callback(null)}
 }};
 const res={clearCookie:()=>{},set:()=>res,status:()=>res,json:()=>res};
 const guard=createLeaseGuard({
  getBoundKey:async()=> 'b'.repeat(64),clearRemember:()=>{cleared++}
 });
 await guard(req,res,()=>{nextCalled=true});
 assert.equal(saved,true);
 assert.equal(nextCalled,true);
 assert.equal(req.session.quanticAuth,null);
 assert.equal(req.session.oryonUser,null);
 assert.equal(cleared,1);
});
test('Source guards all classic account backdoors before accepting Vault mandatory mode',()=>{
 const fs=require('node:fs'),src=fs.readFileSync(require.resolve('../server.js'),'utf8');
 assert.match(src,/getBoundKey:id=>swappQuanticBindings/);
 assert.match(src,/enforceVaultOnly:async id=>/);
 assert.match(src,/quantic_required=true/);
 assert.match(src,/if\(requiresVaultAuthentication\(user\)\)return res\.status\(403\)/);
});
