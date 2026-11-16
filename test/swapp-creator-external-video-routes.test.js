'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {installCreatorVideos}=require('../modules/swapp-creator-external-video-routes');
const VIDEO='https://www.youtube.com/watch?v=dQw4w9WgXcQ';
function harness(){
 const routes={};let saved=[];
 const app={get(path,fn){routes['GET '+path]=fn},put(path,_limit,fn){routes['PUT '+path]=fn}};
 installCreatorVideos(app,{restoreSession:async()=>{},readUsers:()=>({users:[{id:'1',login:'alice',channel_public:true},{id:'2',login:'private',channel_public:false}]}),mutationLimiter:(_req,_res,next)=>next(),storeFactory:()=>({list:async()=>saved,replace:async(_login,videos)=>{saved=videos}})});
 async function request(method,login,{user,origin='https://swapp.tv',videos}={}){
  const req={params:{login},body:{videos},session:{oryonUser:user?{id:user}:null},get:name=>name==='origin'?origin:undefined};
  const res={code:200,headers:{},status(code){this.code=code;return this},setHeader(k,v){this.headers[k]=v},json(data){this.body=data;return this}};
  await routes[method+' /api/creator/external-videos/:login'](req,res);return res;
 }
 return {request};
}
test('owner can persist and read videos',async()=>{
 const h=harness();
 const saved=await h.request('PUT','alice',{user:'1',videos:[{url:VIDEO,title:'Présentation',pinned:true}]});
 assert.equal(saved.code,200);assert.equal(saved.body.videos.length,1);
 const publicResult=await h.request('GET','alice');
 assert.equal(publicResult.code,200);assert.equal(publicResult.body.videos[0].title,'Présentation');
});
test('other account and anonymous cannot mutate creator videos',async()=>{
 const h=harness();
 assert.equal((await h.request('PUT','alice',{user:'2',videos:[]})).code,403);
 assert.equal((await h.request('PUT','alice',{videos:[]})).code,401);
});
test('cross-site write and malformed list are rejected',async()=>{
 const h=harness();
 assert.equal((await h.request('PUT','alice',{user:'1',origin:'https://attacker.test',videos:[]})).code,403);
 assert.equal((await h.request('PUT','alice',{user:'1',videos:'bad'})).code,400);
});
test('private creator videos are hidden from strangers',async()=>{
 const h=harness();
 assert.equal((await h.request('GET','private')).code,404);
 assert.equal((await h.request('GET','private',{user:'2'})).code,200);
});
