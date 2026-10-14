#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {prepareBatches,mergeMetadataAndContent}=require('./justplayer-import-core');

function usage(){
  console.log('Usage: node tools/justplayer-import.js --input fourthwall-export.json [--catalog data/justplayer-public-catalog.json] [--out output-dir] [--send] [--commit]');
  console.log('Default: prepare JSON batches without any network writes. --send requires SWAPP_BASE_URL and SWAPP_ADMIN_KEY env vars. --commit persists drafts; without it --send sends dry runs only.');
}
function parseFlags(argv){
  const args={};for(let i=0;i<argv.length;i++){const v=argv[i];if(!v.startsWith('--'))throw Error(`Argument inconnu: ${v}`);const key=v.slice(2);if(['send','commit'].includes(key)){args[key]=true;continue;}if(!['input','catalog','out'].includes(key)||!argv[i+1]||argv[i+1].startsWith('--'))throw Error(`Valeur manquante ou argument inconnu: ${v}`);args[key]=argv[++i];}return args;
}
function readJson(filename){return JSON.parse(fs.readFileSync(path.resolve(filename),'utf8'));}
async function sendBatches(batches,{commit=false,baseUrl,key,fetchImpl=global.fetch}={}){
  if(!/^https:\/\/[a-z0-9.-]+(?::\d+)?\/?$/i.test(String(baseUrl||''))||!key)throw Error('SWAPP_BASE_URL HTTPS et SWAPP_ADMIN_KEY requis');
  const responses=[];
  for(let i=0;i<batches.length;i++){
    const request={...batches[i],dryRun:!commit,publish:false};
    const response=await fetchImpl(`${baseUrl.replace(/\/$/,'')}/api/editor/actus/import`,{method:'POST',headers:{'Content-Type':'application/json','x-swapp-admin-key':key},body:JSON.stringify(request)});
    const payload=await response.json();
    if(!response.ok||payload.results?.some(x=>x.status==='failed'))throw Error(`Echec import lot ${i+1}: HTTP ${response.status}; voir rapport serveur`);
    responses.push({batch:i+1,dryRun:request.dryRun,accepted:request.articles.length,result:payload});
  }
  return responses;
}
async function main(argv=process.argv.slice(2)){
  const flags=parseFlags(argv);
  if(!flags.input){usage();process.exitCode=2;return;}
  const raw=readJson(flags.input);
  const catalog=flags.catalog?readJson(flags.catalog):null;
  const {combined,missing}=catalog?mergeMetadataAndContent(catalog,raw):{combined:raw,missing:[]};
  const prepared=prepareBatches(combined);
  const output=path.resolve(flags.out||'justplayer-migration');
  fs.mkdirSync(output,{recursive:true});
  for(let i=0;i<prepared.batches.length;i++)fs.writeFileSync(path.join(output,`batch-${String(i+1).padStart(3,'0')}.json`),JSON.stringify(prepared.batches[i],null,2)+'\n');
  const report={createdAt:new Date().toISOString(),source:flags.input,scope:'JustPlayer',...Object.fromEntries(Object.entries(prepared).filter(([key])=>key!=='batches')),missingFromExport:missing,batchCount:prepared.batches.length,mode:flags.commit?'draft_write_requested':flags.send?'remote_dry_run':'local_only'};
  if(flags.send){const {SWAPP_BASE_URL,SWAPP_ADMIN_KEY}=process.env;report.serverResponses=await sendBatches(prepared.batches,{commit:!!flags.commit,baseUrl:SWAPP_BASE_URL,key:SWAPP_ADMIN_KEY});}
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({total:report.total,accepted:report.accepted,missingFromExport:missing.length,rejected:report.rejected.length,duplicates:report.duplicates.length,batches:report.batchCount,mode:report.mode,output},null,2));
  if(prepared.rejected.length||missing.length)process.exitCode=1; // Incomplete migration must be visible.
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={parseFlags,sendBatches,main};