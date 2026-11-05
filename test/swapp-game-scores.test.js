'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {registerGameScores}=require('../modules/swapp-game-scores');
function fixture(){
 const rows=new Map(),routes=[];
 const doc=id=>({id,get:async()=>({exists:rows.has(id),data:()=>structuredClone(rows.get(id))})});
 const firestore={
  collection:name=>({doc:id=>doc(name+'/'+id)}),
  async runTransaction(fn){
   const sets=[];
   const value=await fn({get:d=>d.get(),set:(d,row)=>sets.push([d.id,structuredClone(row)])});
   sets.forEach(([k,v])=>rows.set(k,v));
   return value;
  }
 };
 const router={get:(url,...handlers)=>routes.push(['GET',url,handlers]),
  post:(url,...handlers)=>routes.push(['POST',url,handlers])};
 const resolveGame=async slug=>slug==='hades-ii'?{slug,game:'Hades II'}:null;
 registerGameScores({router,firestore,available:(_req,_res,next)=>next(),resolveGame});
 async function request(method,slug,{rating,user,origin='https://swapp.tv'}={}){
  const entry=routes.find(x=>x[0]===method&&x[1]==='/api/jeux/:slug/score');
  const req={params:{slug},session:user?{oryonUser:{id:user}}:{},body:{rating},headers:origin?{origin}:{}};
  const res={code:200,body:null,headers:{},
   set(k,v){this.headers[k]=v;return this},
   status(n){this.code=n;return this},
   json(x){this.body=x;return this}};
  async function next(i=0){
   const fn=entry[2][i];if(!fn)return;
   let continuation=false;
   await fn(req,res,e=>{if(e)throw e;continuation=true});
   if(continuation)await next(i+1);
  }
  await next();
  return res;
 }
 return {request,rows};
}
test('game votes require auth, valid origin, known game and 1..5 integer',async()=>{
 const {request,rows}=fixture();
 assert.equal((await request('POST','hades-ii',{rating:5})).code,401);
 assert.equal((await request('POST','hades-ii',{rating:5,user:'alice',origin:'https://evil.example'})).code,403);
 assert.equal((await request('POST','hades-ii',{rating:5,user:'alice',origin:null})).code,403);
 assert.equal((await request('POST','hades-ii',{rating:6,user:'alice'})).code,400);
 assert.equal((await request('POST','hades-ii',{rating:2.5,user:'alice'})).code,400);
 assert.equal((await request('POST','unknown-title',{rating:5,user:'alice'})).code,404);
 assert.equal([...rows.keys()].length,0);
});
test('one changeable vote per user, real sample threshold and no fabricated score',async()=>{
 const {request,rows}=fixture();
 const empty=(await request('GET','hades-ii')).body;
 assert.deepEqual(empty,{count:0,average:null,minimumVotes:5,myRating:null,canRate:false,scale:5});
 let result=(await request('POST','hades-ii',{rating:5,user:'alice'})).body;
 assert.equal(result.count,1);
 assert.equal(result.average,null);
 result=(await request('POST','hades-ii',{rating:5,user:'alice'})).body;
 assert.equal(result.count,1);
 result=(await request('POST','hades-ii',{rating:3,user:'alice'})).body;
 assert.equal(result.count,1);
 assert.equal(result.myRating,3);
 for(let i=2;i<=5;i++)result=(await request('POST','hades-ii',{rating:5,user:'player'+i})).body;
 assert.equal(result.count,5);
 assert.equal(result.average,4.6);
 const anonymous=(await request('GET','hades-ii')).body;
 assert.equal(anonymous.myRating,null);
 assert.equal(anonymous.average,4.6);
 const mine=(await request('GET','hades-ii',{user:'alice'})).body;
 assert.equal(mine.myRating,3);
 assert.equal([...rows.keys()].filter(x=>x.startsWith('swapp_game_votes/')).length,5);
});