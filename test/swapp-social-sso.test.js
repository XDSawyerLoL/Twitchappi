'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createSocialNativeProxy,swappSocialCredentials}=require('../modules/swapp-social-native-proxy');

const secret='S'.repeat(48);
const account={id:'swapp-user-01',login:'Player_01',display_name:'SWAPP Player'};
const token='abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH';
function request(path,method='GET',authenticated=true){
 return {path,method,headers:{origin:'https://swapp.tv',referer:'https://swapp.tv/social'},
  session:authenticated?{oryonUser:{...account}}:{},sessionID:'swapp-session-test',
  originalUrl:'/api/pulse'+path,body:method==='GET'?undefined:{body:'Bonjour',handle:'member_02'}};
}
function response(){
 return {statusCode:200,set(){return this},status(n){this.statusCode=n;return this},
  json(data){this.data=data;return this}};
}
function backend(){
 const calls=[];let signins=0;let remoteExpired=false;
 const fetchImpl=async (url,opts)=>{
  const pathname=new URL(url).pathname;
  calls.push({pathname,method:opts.method,authorization:opts.headers.Authorization||''});
  if(pathname.endsWith('/auth/login')){signins++;return {status:signins===1?401:200,json:async()=>signins===1?{error:'invalid_credentials'}:{token}}}
  if(pathname.endsWith('/auth/register'))return {status:201,json:async()=>({token})};
  if(remoteExpired&&pathname.endsWith('/posts')){remoteExpired=false;return {status:401,text:async()=>JSON.stringify({error:'unauthorized'})}}
  return {status:200,text:async()=>JSON.stringify(pathname.endsWith('/me')?{user:{id:'remote-user',handle:'s_player'}}:{success:true})};
 };
 return {calls,fetchImpl,expire(){remoteExpired=true}};
}
const gate=(fetchImpl,extra={})=>createSocialNativeProxy(fetchImpl,{
 production:true,ssoSecret:secret,restoreLocalSession:async()=>{},...extra
});

test('SWAPP user receives an upstream account without disclosing credentials to the browser',async()=>{
 const b=backend(),proxy=gate(b.fetchImpl),req=request('/posts','POST'),res=response();
 await proxy(req,res);
 assert.equal(res.statusCode,200);
 assert.equal(b.calls.filter(c=>c.pathname.includes('/auth/')).length,2);
 assert.equal(b.calls.at(-1).authorization,'Bearer '+token);
 assert.equal(req.session.swappSocialAuth.userId,account.id);
 assert.equal(JSON.stringify(res.data).includes(token),false);
 const me=response();
 await proxy({...req,path:'/me',method:'GET',originalUrl:'/api/pulse/me'},me);
 assert.equal(me.data.user.displayName,account.display_name);
 assert.equal(b.calls.filter(c=>c.pathname.includes('/auth/')).length,2);
});
test('SWAPP authentication is required even if the browser provides an old SOCIAL token',async()=>{
 const b=backend(),proxy=gate(b.fetchImpl),req=request('/posts','POST',false),res=response();
 req.headers.authorization='Bearer '+token;
 await proxy(req,res);
 assert.equal(res.statusCode,401);
 assert.equal(res.data.error,'swapp_account_required');
 assert.equal(b.calls.length,0);
});
test('legacy upstream username/password endpoints are rejected',async()=>{
 const b=backend(),proxy=gate(b.fetchImpl),res=response();
 await proxy(request('/auth/login','POST'),res);
 assert.equal(res.statusCode,403);
 assert.equal(b.calls.length,0);
});
test('expired upstream bearer is renewed after explicit 401 and post is sent once successfully',async()=>{
 const b=backend(),proxy=gate(b.fetchImpl),req=request('/posts','POST');
 await proxy(req,response());
 b.expire();
 const res=response();
 await proxy(req,res);
 assert.equal(res.statusCode,200);
 assert.equal(b.calls.filter(c=>c.pathname.endsWith('/posts')).length,3);
 assert.equal(b.calls.filter(c=>c.pathname.endsWith('/auth/login')).length,2);
});
test('generated identity is stable and scoped to SWAPP user id',()=>{
 const a=swappSocialCredentials(account,secret);
 assert.match(a.handle,/^[a-z0-9_]{3,24}$/);
 assert.ok(a.password.length>=20);
 assert.equal(a.handle,swappSocialCredentials(account,secret).handle);
 assert.notEqual(a.handle,swappSocialCredentials({...account,id:'another'},secret).handle);
});

test('DM to a SWAPP username uses only the account-mapped backend handle',async()=>{
 const b=backend();
 const recipient={id:'swapp-user-02',login:'recipient_02',display_name:'Recipient'};
 const proxy=gate(b.fetchImpl,{lookupLocalUser:handle=>handle===recipient.login?recipient:null,
  listLocalUsers:()=>[account,recipient]});
 const req=request('/messages','POST'),res=response();
 req.body={handle:recipient.login,body:'Salut !'};
 await proxy(req,res);
 assert.equal(res.statusCode,200);
 const last=b.calls.at(-1);
 assert.equal(last.pathname,'/api/pulse/messages');
 assert.equal(last.authorization,'Bearer '+token);
 const pathRes=response();
 await proxy({...req,path:'/messages/'+recipient.login,method:'GET',originalUrl:'/api/pulse/messages/'+recipient.login},pathRes);
 assert.equal(pathRes.statusCode,200);
 assert.equal(b.calls.at(-1).pathname,'/api/pulse/messages/'+swappSocialCredentials(recipient,secret).handle);
});
