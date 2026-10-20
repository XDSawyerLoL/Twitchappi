'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createSocialNativeProxy}=require('../modules/swapp-social-native-proxy');

const SSO='social-transport-smoke-secret-with-sufficient-length';
const USER_A={id:'swapp-a',login:'alice',display_name:'Alice'};
const USER_B={id:'swapp-b',login:'bob',display_name:'Bob'};
const TOKEN_A='A'.repeat(43);
const TOKEN_B='B'.repeat(43);

function makeTransport({slowPost=false,denyRecipient=false}={}){
 const calls=[];
 const upstreamUsers=new Map();
 const posts=[];
 const messages=[];
 let messageSerial=0,postSerial=0;
 const localUsers=[USER_A,USER_B];
 const aliasHandle=handle=>{
  const {swappSocialCredentials}=require('../modules/swapp-social-native-proxy');
  return swappSocialCredentials(localUsers.find(u=>u.login===handle),SSO).handle;
 };
 const response=(status,data)=>({status,
  text:async()=>JSON.stringify(data),
  json:async()=>data});
 const fetchImpl=async(url,init)=>{
  const pathname=new URL(url).pathname;
  const body=init.body?JSON.parse(init.body):{};
  const token=String(init.headers?.Authorization||'').replace(/^Bearer /,'');
  calls.push({pathname,method:init.method||'GET',body,token});
  if(pathname==='/api/pulse/auth/login'){
   if(!upstreamUsers.has(body.handle))return response(401,{error:'invalid_credentials'});
   const u=upstreamUsers.get(body.handle);
   if(u.password!==body.password)return response(401,{error:'invalid_credentials'});
   return response(200,{token:u.token});
  }
  if(pathname==='/api/pulse/auth/register'){
   if(upstreamUsers.has(body.handle))return response(409,{error:'handle_taken'});
   const token=upstreamUsers.size?TOKEN_B:TOKEN_A;
   upstreamUsers.set(body.handle,{handle:body.handle,password:body.password,token});
   return response(201,{token});
  }
  const sender=[...upstreamUsers.values()].find(u=>u.token===token);
  if(!sender)return response(401,{error:'unauthorized'});
  if(pathname==='/api/pulse/me')return response(200,{
   user:{id:'backend-'+sender.handle,handle:sender.handle,displayName:sender.handle}
  });
  if(pathname==='/api/pulse/posts'&&init.method==='POST'){
   if(slowPost)throw Object.assign(new Error('timeout'),{name:'AbortError'});
   const post={id:'p_'+(++postSerial),body:body.body,replyToId:body.replyToId||null,author:sender.handle};
   posts.push(post);return response(201,{post});
  }
  if(pathname==='/api/pulse/messages'&&init.method==='POST'){
   if(denyRecipient||!upstreamUsers.has(body.handle))return response(404,{error:'not_found'});
   const msg={id:'m_'+(++messageSerial),body:body.body,sender:sender.handle,recipient:body.handle};
   messages.push(msg);return response(201,{message:msg});
  }
  if(pathname.startsWith('/api/pulse/messages/')&&init.method==='GET'){
   const recipient=pathname.split('/').at(-1);
   const found=upstreamUsers.get(recipient);
   if(!found)return response(404,{error:'not_found'});
   return response(200,{user:{handle:recipient,displayName:recipient},
    messages:messages.filter(x=>x.sender===sender.handle&&x.recipient===recipient||
      x.sender===recipient&&x.recipient===sender.handle)});
  }
  return response(404,{error:'not_found'});
 };
 const createClient=user=>{
  const session={oryonUser:user};
  const proxy=createSocialNativeProxy(fetchImpl,{
   production:true,ssoSecret:SSO,
   restoreLocalSession:async()=>user,
   lookupLocalUser:handle=>localUsers.find(u=>u.login===handle)||null,
   listLocalUsers:()=>localUsers
  });
  return async(path,method='GET',body)=>{
   let status=200,data;
   const req={path,method,originalUrl:'/api/pulse'+path,
    headers:{origin:'https://swapp.tv',referer:'https://swapp.tv/social'},
    session,sessionID:'session-'+user.id,body};
   const res={
    set(){return this},status(code){status=code;return this},
    json(payload){data=payload;return this}
   };
   await proxy(req,res);
   return {status,data};
  };
 };
 return {createClient,calls,posts,messages,aliasHandle};
}

test('two SWAPP identities can authenticate and publish through the same transport',async()=>{
 const t=makeTransport(),alice=t.createClient(USER_A),bob=t.createClient(USER_B);
 const [a,b]=await Promise.all([alice('/me'),bob('/me')]);
 assert.equal(a.status,200);
 assert.equal(b.status,200);
 assert.equal(a.data.user.handle,'alice');
 assert.equal(b.data.user.handle,'bob');
 const post=await alice('/posts','POST',{body:'Test technique isolé'});
 assert.equal(post.status,201);
 assert.equal(post.data.post.body,'Test technique isolé');
 const reply=await bob('/posts','POST',{body:'Réponse technique',replyToId:post.data.post.id});
 assert.equal(reply.status,201);
 assert.equal(reply.data.post.replyToId,post.data.post.id);
 assert.equal(t.posts.length,2);
 assert.equal(t.calls.filter(c=>c.pathname.includes('/auth/register')).length,2);
});

test('a sent private message resolves the real SWAPP recipient and both users can read it',async()=>{
 const t=makeTransport(),alice=t.createClient(USER_A),bob=t.createClient(USER_B);
 await alice('/me');await bob('/me');
 const sent=await alice('/messages','POST',{handle:'bob',body:'Salut Bob'});
 assert.equal(sent.status,201);
 assert.equal(t.messages.length,1);
 assert.equal(t.messages[0].recipient,t.aliasHandle('bob'),'server resolves recipient without trusting browser shadow ID');
 const aliceThread=await alice('/messages/bob');
 const bobThread=await bob('/messages/alice');
 assert.equal(aliceThread.status,200);
 assert.equal(bobThread.status,200);
 assert.equal(aliceThread.data.user.handle,'bob');
 assert.equal(bobThread.data.user.handle,'alice');
 assert.equal(aliceThread.data.messages.length,1);
 assert.equal(bobThread.data.messages.length,1);
 assert.equal(aliceThread.data.messages[0].body,'Salut Bob');
});

test('a write that times out is not replayed by the proxy',async()=>{
 const t=makeTransport({slowPost:true}),alice=t.createClient(USER_A);
 const result=await alice('/posts','POST',{body:'Do not repeat this'});
 assert.equal(result.status,503);
 assert.equal(result.data.error,'social_upstream_timeout');
 assert.equal(t.calls.filter(x=>x.pathname==='/api/pulse/posts').length,1);
});

test('a SWAPP member can receive their first DM before opening SOCIAL',async()=>{
 const t=makeTransport(),alice=t.createClient(USER_A);
 const result=await alice('/messages','POST',{handle:'bob',body:'Première invitation'});
 assert.equal(result.status,201);
 assert.equal(t.messages.length,1);
 assert.equal(t.messages[0].recipient,t.aliasHandle('bob'));
 const thread=await alice('/messages/bob');
 assert.equal(thread.status,200);
 assert.equal(thread.data.messages.length,1);
 const bob=t.createClient(USER_B);
 const received=await bob('/messages/alice');
 assert.equal(received.status,200);
 assert.equal(received.data.messages[0].body,'Première invitation');
});

test('opening a new DM composer does not silently register the recipient',async()=>{
 const t=makeTransport(),alice=t.createClient(USER_A);
 const empty=await alice('/messages/bob');
 assert.equal(empty.status,200);
 assert.equal(empty.data.user.handle,'bob');
 assert.deepEqual(empty.data.messages,[]);
 assert.equal(t.calls.filter(x=>x.pathname==='/api/pulse/auth/register').length,1,
  'only the authenticated sender is provisioned on read');
});

test('a second DM does not repeat recipient provisioning',async()=>{
 const t=makeTransport(),alice=t.createClient(USER_A);
 await alice('/messages','POST',{handle:'bob',body:'Premier'});
 await alice('/messages','POST',{handle:'bob',body:'Deuxième'});
 assert.equal(t.messages.length,2);
 const registrations=t.calls.filter(x=>x.pathname==='/api/pulse/auth/register');
 assert.equal(registrations.length,2,'sender and recipient register once each');
});

test('unknown SWAPP recipients are never auto-provisioned',async()=>{
 const t=makeTransport(),alice=t.createClient(USER_A);
 const result=await alice('/messages','POST',{handle:'nobody',body:'Message'});
 assert.equal(result.status,404);
 assert.equal(t.messages.length,0);
 assert.equal(t.calls.filter(x=>x.pathname==='/api/pulse/auth/register').length,1);
});

test('a cross-origin write is rejected before reaching the SOCIAL backend',async()=>{
 const t=makeTransport();
 // The transport contract requires a strict SWAPP Origin on every write.
 const {createSocialNativeProxy}=require('../modules/swapp-social-native-proxy');
 const proxy=createSocialNativeProxy(async()=>{throw Error('unexpected upstream call')},{
  production:true,ssoSecret:SSO,restoreLocalSession:async()=>USER_A
 });
 let status=200,payload=null;
 const res={set(){return this},status(v){status=v;return this},json(v){payload=v;return this}};
 await proxy({path:'/posts',method:'POST',headers:{origin:'https://untrusted.example'},
  originalUrl:'/api/pulse/posts',body:{body:'Unauthorised request'},session:{}},res);
 assert.equal(status,403);
 assert.deepEqual(payload,{error:'social_origin_required'});
 assert.equal(t.posts.length,0);
});

test('writes carry the server-issued bearer and never include the account password',async()=>{
 const t=makeTransport(),alice=t.createClient(USER_A);
 const result=await alice('/posts','POST',{body:'Post SWAPP'});
 assert.equal(result.status,201);
 const sent=t.calls.find(c=>c.pathname==='/api/pulse/posts');
 assert.equal(sent.token,TOKEN_A);
 assert.ok(!('password' in sent.body));
});
