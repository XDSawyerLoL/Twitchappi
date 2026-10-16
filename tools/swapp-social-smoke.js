'use strict';
// Safe, read-only production smoke check. Never sends SWAPP credentials or writes content.
// Run: node tools/swapp-social-smoke.js
const https=require('node:https');
const base=process.env.SWAPP_SMOKE_ORIGIN||'https://swapp.tv';
const paths=['/communaute','/api/pulse/health','/api/oryon/session','/api/swapp/interactions/rooms'];
async function check(path){
 return new Promise(resolve=>{
  const req=https.get(new URL(path,base),{timeout:8000,headers:{accept:'application/json, text/html;q=0.8','user-agent':'SWAPP-Social-Smoke/1.0'}},res=>{
   let size=0;res.on('data',c=>{size+=c.length});res.on('end',()=>resolve({path,status:res.statusCode,bytes:size}));
  });req.on('timeout',()=>req.destroy(Error('timeout')));req.on('error',e=>resolve({path,error:e.message}));
 });
}
(async()=>{
 const results=[];for(const path of paths)results.push(await check(path));
 console.table(results);
 const community=results[0],session=results[2],rooms=results[3];
 if(community.status!==200||!([200,401,403].includes(session.status))||!([401,403,404].includes(rooms.status))){
  console.error('Smoke test incomplete or unexpected: inspect release, feature flag and session routes.');
  process.exitCode=1;
 }
})().catch(e=>{console.error(e.message);process.exitCode=1});
