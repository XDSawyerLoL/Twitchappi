'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createSocialNativeProxy}=require('../modules/swapp-social-native-proxy');
const fs=require('node:fs');
const path=require('node:path');

function harness(loginStatus,{registered=false}={}){
 let calls=[];
 const fetchImpl=async(url)=>{
  calls.push(url);
  const status=url.endsWith('/auth/login')?loginStatus:url.endsWith('/auth/register')?201:200;
  const data=url.endsWith('/auth/login')&&status===200?{token:'A'.repeat(43)}:
   url.endsWith('/auth/register')?{token:'B'.repeat(43)}:
   {user:{id:'backend-user',handle:'s_user_b719024382',displayName:'SWAPP'}};
  return{status,text:async()=>JSON.stringify(data),json:async()=>data};
 };
 const handler=createSocialNativeProxy(fetchImpl,{
  production:true,ssoSecret:'long-stable-secret-with-strong-entropy-for-tests',
  restoreLocalSession:async()=>({id:'swapp-user-123',login:'realplayer',display_name:'Real Player'}),
  lookupLocalUser:()=>null,listLocalUsers:()=>[]
 });
 async function request(){
  let status=200,body=null;
  const res={headersSent:false,set(){return this},status(v){status=v;return this},json(v){body=v;return this}};
  const req={path:'/me',method:'GET',originalUrl:'/api/pulse/me',headers:{},session:{},sessionID:'session-test'};
  await handler(req,res);
  return{status,body};
 }
 return{request,calls};
}

test('SOCIAL reports an upstream login rate limit precisely',async()=>{
 const h=harness(429);
 const result=await h.request();
 assert.equal(result.status,503);
 assert.deepEqual(result.body,{error:'social_upstream_rate_limited'});
 assert.equal(h.calls.length,1,'do not register a new account when throttled');
});

test('SOCIAL reports an unavailable upstream without resetting SWAPP identity',async()=>{
 const h=harness(503);
 const result=await h.request();
 assert.equal(result.status,503);
 assert.deepEqual(result.body,{error:'social_upstream_unavailable'});
 assert.equal(h.calls.length,1);
});

test('SOCIAL automatically creates a backend shadow account without a second login screen',async()=>{
 const h=harness(401);
 const result=await h.request();
 assert.equal(result.status,200);
 assert.equal(result.body.user.handle,'realplayer');
 assert.equal(h.calls.filter(x=>x.endsWith('/auth/register')).length,1);
});

test('the SOCIAL session recovery UI has an actionable retry instead of a generic alert',()=>{
 const code=fs.readFileSync(path.join(__dirname,'../assets/swapp-social-native/session.js'),'utf8');
 assert.match(code,/showConnectionNotice/);
 assert.match(code,/Réessayer la liaison/);
 assert.match(code,/sessionRetryPromise/);
 assert.match(code,/lastSocialSessionError=error/);
 assert.doesNotMatch(code,/alert\('Le compte SWAPP est connecté, mais le service SOCIAL ne répond pas encore/);
});
