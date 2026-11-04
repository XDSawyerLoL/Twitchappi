'use strict';
// Offline editorial workstation only; never call from a public HTTP route or cron.
const fs=require('node:fs');
const path=require('node:path');
const {validateEpisode,estimateCost,synthesizeEpisode,VOICES,MODEL}=
 require('../modules/swapp-on-air-voice');

async function main(args=process.argv.slice(2),env=process.env){
 const input=args.find(x=>!x.startsWith('--'))||
  'data/swapp-on-air/episode-00-voice-demo.json';
 const absolute=path.resolve(process.cwd(),input);
 const episode=validateEpisode(JSON.parse(fs.readFileSync(absolute,'utf8')));
 const estimate=estimateCost(episode);
 const approval=Number((args.find(x=>x.startsWith('--budget-usd='))||'').split('=')[1]||0);
 const execute=args.includes('--execute');
 const info={episode:episode.title,mode:execute?'execute':'dry-run',
  provider:'Gemini TTS via AURA/Mairaiy method',model:MODEL,voices:VOICES,
  publication_allowed:false,estimate};
 if(!execute){
  console.log(JSON.stringify(info,null,2));
  console.log('Aucun appel API. Pour tester volontairement : --execute --budget-usd=0.20 avec SWAPP_ON_AIR_TTS_ENABLED=1 et GEMINI_API_KEY (local).');
  return info;
 }
 if(env.SWAPP_ON_AIR_TTS_ENABLED!=='1')throw Error('SWAPP_ON_AIR_TTS_ENABLED=1_required');
 const key=env.GEMINI_API_KEY||env.TTS_API_KEY;
 const result=await synthesizeEpisode(episode,{
  apiKey:key,enabled:true,budgetUsd:approval,
  onChunk:chunk=>console.log('Dialogue '+chunk.index+'/'+chunk.total+' généré')
 });
 const outDir=path.resolve(process.cwd(),'.swapp-on-air-private');
 fs.mkdirSync(outDir,{recursive:true,mode:0o700});
 const file=path.join(outDir,'swapp-on-air-episode-00-aoede.wav');
 const meta=path.join(outDir,'swapp-on-air-episode-00-aoede.json');
 // Never overwrite prior reviewed takes.
 fs.writeFileSync(file,result.wav,{mode:0o600,flag:'wx'});
 fs.writeFileSync(meta,JSON.stringify({...info,render:result.metadata},null,2),{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({created:true,localFile:file,metadata:meta,bytes:result.wav.length,
  message:'Fichier privé non publié : écoute humaine obligatoire avant diffusion.'},null,2));
 return {file,meta};
}
if(require.main===module)main().catch(e=>{
 console.error('SWAPP ON AIR : '+String(e.message||'unknown').slice(0,140));
 process.exitCode=1;
});
module.exports={main};
