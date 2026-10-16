'use strict';
// Safe read-only production checks. Does not send credentials or write data.
const https=require('node:https');
const base=process.env.SWAPP_SMOKE_ORIGIN||'https://swapp.tv';
const paths=['/communaute','/api/pulse/health','/api/oryon/session','/api/swapp/interactions/status','/api/swapp/interactions/rooms'];
async function check(path){
 return new Promise(resolve=>{
  const req=https.get(new URL(path,base),{timeout:8000,headers:{accept:'application/json, text/html;q=0.8','user-agent':'SWAPP-Social-Smoke/1.1'}},res=>{
   let size=0,raw='';
   res.on('data',c=>{size+=c.length;if(raw.length<2000)raw+=c.toString('utf8').slice(0,2000-raw.length)});
   res.on('end',()=>{
    let state;
    if(path.endsWith('/status')){try{const body=JSON.parse(raw);state=body.state}catch{}}
    resolve({path,status:res.statusCode,bytes:size,...(state?{state}:{})});
   });
  });
  req.on('timeout',()=>req.destroy(Error('timeout')));
  req.on('error',e=>resolve({path,error:e.message}));
 });
}
(async()=>{
 const results=[];for(const path of paths)results.push(await check(path));
 console.table(results);
 const [community,,session,status,rooms]=results;
 const ready=status.status===200&&status.state==='configured_not_verified'&&rooms.status===401;
 const disabled=status.status===200&&status.state==='disabled'&&rooms.status===503;
 const basic=community.status===200&&[200,401,403].includes(session.status);
 if(!basic||(!ready&&!disabled)){
  console.error('Production smoke incomplete: verify Hostinger deployment, flags and MySQL connection.');
  process.exitCode=1;
 }else if(disabled)console.warn('Interactive SOCIAL disabled by feature flag. No MySQL functionality verified.');
 else console.log('Routes registered. MySQL connection and schema still require authenticated tests.');
})().catch(e=>{console.error(e.message);process.exitCode=1});
