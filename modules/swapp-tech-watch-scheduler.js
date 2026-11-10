'use strict';
// Hostinger Node-process scheduler: off by default until persistent storage is ready.
const {run}=require('../tools/swapp-tech-watch');
const INTERVAL_MS=6*60*60*1000;
function startTechWatch({enabled=process.env.SWAPP_TECH_WATCH_ENABLED==='1',execute=run,log=console,intervalMs=INTERVAL_MS}={}){
 if(!enabled)return {enabled:false,stop(){}};
 let stopped=false,running=false,lastAttempt=0;
 const tick=async()=>{
  if(stopped||running||Date.now()-lastAttempt<intervalMs)return;
  running=true;lastAttempt=Date.now();
  try{const result=await execute();log.info('[SWAPP TECH WATCH]',result.checks.filter(x=>x.ok).length,'sources OK,',result.candidates.length,'candidates (unverified)');}
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
