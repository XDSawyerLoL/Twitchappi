'use strict';
// Hostinger Node-process scheduler: off by default until persistent storage is ready.
const {run}=require('../tools/swapp-tech-watch');
const {saveCandidates,withWatchLock}=require('./swapp-tech-watch-store');
const INTERVAL_MS=6*60*60*1000;
function startTechWatch({enabled=process.env.SWAPP_TECH_WATCH_ENABLED==='1',execute=run,log=console,intervalMs=INTERVAL_MS}={}){
 if(!enabled)return {enabled:false,stop(){}};
 let stopped=false,running=false,lastAttempt=0;
 const tick=async()=>{
  if(stopped||running||Date.now()-lastAttempt<intervalMs)return;
  running=true;lastAttempt=Date.now();
  try{
   const uri=process.env.SWAPP_NEWS_MYSQL_URL||process.env.SWAPP_MYSQL_URL;
   if(!uri)throw Error('MySQL not configured; collection disabled');
   const mysql=require('mysql2/promise');
   const pool=mysql.createPool({uri,connectionLimit:2,connectTimeout:5000});
   try{
    const outcome=await withWatchLock(pool,async()=>{
     // JSON is temporary collection output; MySQL is the persistent source of truth.
     const result=await execute();
     if(!result.checks.some(x=>x.ok))throw Error('All source feeds failed');
     const saved=await saveCandidates(pool,result.candidates);
     return {saved,checks:result.checks};
    });
    log.info('[SWAPP TECH WATCH]',outcome.skipped||('Saved '+outcome.saved+' unverified candidates'));
   }finally{await pool.end();}
  }
  catch(error){log.error('[SWAPP TECH WATCH] Collection failed:',error.message);}
  finally{running=false;}
 };
 // Keep existing HTTP server startup independent of slow external feeds.
 const timer=setInterval(()=>void tick(),Math.min(intervalMs,60*1000));
 timer.unref?.();
 setImmediate(()=>void tick());
 return {enabled:true,stop(){stopped=true;clearInterval(timer);}};
}
module.exports={startTechWatch,INTERVAL_MS};
