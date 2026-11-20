'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash,generateKeyPairSync,sign}=require('node:crypto');
const {createAccountRouter,createLeaseGuard,digest,AUTH_LEASE_MS}=require('../modules/swapp-quantic-account-auth');

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
 const bindings=new Map(),reverse=new Map();
 const existing={id:'aa11aa11aa11aa11aa11aa11',login:'alice',password_hash:'current-password'};
 const store={
  async getUser(key){return bindings.get(key)||null},
  async getKey(id){return reverse.get(id)||null},
  async bind(id,key){
   if(bindings.has(key)||reverse.has(id)){const e=Error('duplicate');e.code='ER_DUP_ENTRY';throw e}
   bindings.set(key,id);reverse.set(id,key);
  },
  async unbind(id){const key=reverse.get(id);if(!key)return false;reverse.delete(id);bindings.delete(key);return true}
 };
 const secret='S'.repeat(48);
 const app=express();
 app.use(express.json());
 app.use(session({secret:'testing-only-express-session-secret',resave:false,saveUninitialized:false,cookie:{sameSite:'lax'}}));
 app.use(createLeaseGuard({now:()=>time,clearRemember:()=>{clearCount++}}));
 app.post('/__test/password-login',(req,res)=>{
  req.session.oryonUser={id:existing.id,login:existing.login};
  req.session.save(error=>error?res.status(500).end():res.json({success:true}));
 });
 app.post('/__test/logout',(req,res)=>{
  req.session.oryonUser=null;req.session.quanticAuth=null;
  req.session.save(error=>error?res.status(500).end():res.json({success:true}));
 });
 app.use('/api/quantic-id/account',createAccountRouter(express,{
  secret,store,enabled:true,production:false,now:()=>time,
  verifyPassword:(password,hash)=>password===hash,
  findUser:id=>id===existing.id?existing:null,
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
 async function challengeAndProof(purpose,key,password){
  const start=await request('/api/quantic-id/account/challenge',{purpose});
  assert.equal(start.status,200,JSON.stringify(start.data));
  const challenge=start.data.challenge,proof=key.sign(challenge,origin,time);
  return request('/api/quantic-id/account/prove',{purpose,challenge,proof,...(password!==undefined?{password}:{})});
 }
 return {request,challengeAndProof,identity:identity(),origin,get time(){return time},setTime:v=>{time=v},bindings,reverse,secret,
  get clearCount(){return clearCount}};
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
