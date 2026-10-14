#!/usr/bin/env node
'use strict';

/**
 * Import public Fourthwall/JustPlayer -> SWAPP drafts. No credentials to Fourthwall.
 * Read-only public crawl. By default only local JSON; production writes require
 * both --send and --commit, plus the admin credentials in environment variables.
 */
const fs = require('node:fs');
const path = require('node:path');
const {collectPublicCatalog} = require('./justplayer-public-fetch');
const {prepareBatches,mergeMetadataAndContent} = require('./justplayer-import-core');
const {sendBatches} = require('./justplayer-import');

function parseArgs(argv) {
  const result={};
  for(let i=0;i<argv.length;i++) {
    const arg=argv[i];
    if(arg==='--help'){result.help=true;continue;}
    if(arg==='--send'||arg==='--commit'){result[arg.slice(2)]=true;continue;}
    if(!['--catalog','--out'].includes(arg)||!argv[i+1]||argv[i+1].startsWith('--')) {
      throw Error(`Argument inconnu ou incomplet : ${arg}`);
    }
    result[arg.slice(2)]=argv[++i];
  }
  if(result.commit&&!result.send)throw Error('--commit exige --send');
  return result;
}
function writeJson(dir,name,data,writeFileSync=fs.writeFileSync){
  writeFileSync(path.join(dir,name),JSON.stringify(data,null,2)+'\n','utf8');
}
async function migratePublic({catalog,fetchImpl=global.fetch,send=false,commit=false,baseUrl,key,
  out='justplayer-public-migration',fileSystem=fs}={}) {
  if(!catalog || !Array.isArray(catalog.items))throw Error('Catalogue JustPlayer manquant ou invalide');
  if(commit&&!send)throw Error('Un import réel exige --send et --commit');
  const result=await collectPublicCatalog(catalog,{fetchImpl});
  const {combined,missing}=mergeMetadataAndContent(catalog,result.articles);
  const prepared=prepareBatches(combined);
  const report={
    createdAt:new Date().toISOString(),source:'justplayer_public_pages',
    isComplete:false, // Public HTML does not prove all account posts are represented.
    pagesChecked:result.postsChecked, extracted:result.articles.length,
    draftCount:prepared.accepted,batchCount:prepared.batches.length,
    failures:result.failures,excluded:result.excluded,
    notRecovered:missing.map(({id,url,reason})=>({id,url,reason})),
    rejected:prepared.rejected,duplicates:prepared.duplicates,warnings:prepared.warnings,
    networkWriteRequested:!!send,productionDraftWriteRequested:!!commit
  };
  const target=path.resolve(out);
  fileSystem.mkdirSync(target,{recursive:true});
  writeJson(target,'extracted-public-articles.json',result.articles,fileSystem.writeFileSync);
  for(let i=0;i<prepared.batches.length;i++){
    const filename=`batch-${String(i+1).padStart(3,'0')}.json`;
    writeJson(target,filename,prepared.batches[i],fileSystem.writeFileSync);
  }
  if(send && prepared.batches.length) {
    report.remote=await sendBatches(prepared.batches,{commit,baseUrl,key,fetchImpl});
  }
  writeJson(target,'report.json',report,fileSystem.writeFileSync);
  return report;
}
async function main(argv=process.argv.slice(2)){
  const args=parseArgs(argv);
  if(args.help){
    console.log('node tools/justplayer-public-migrate.js [--catalog data/justplayer-public-catalog.json] [--out output-folder] [--send [--commit]]');
    console.log('Default: public read-only scan and local JSON draft batches. --send is remote dry-run; --send --commit writes drafts (not published).');
    return;
  }
  const source=path.resolve(args.catalog||'data/justplayer-public-catalog.json');
  const catalog=JSON.parse(fs.readFileSync(source,'utf8'));
  const report=await migratePublic({catalog,out:args.out||'justplayer-public-migration',send:!!args.send,commit:!!args.commit,
    baseUrl:process.env.SWAPP_BASE_URL,key:process.env.SWAPP_ADMIN_KEY});
  console.log(JSON.stringify({checked:report.pagesChecked,recovered:report.extracted,drafts:report.draftCount,
    failed:report.failures.length,unrecovered:report.notRecovered.length,mode:report.productionDraftWriteRequested?'draft_write':report.networkWriteRequested?'remote_dry_run':'local_only'},null,2));
  if(report.failures.length||report.notRecovered.length||report.rejected.length)process.exitCode=2;
}
if(require.main===module)main().catch(err=>{console.error(err.message);process.exitCode=1;});
module.exports={parseArgs,migratePublic,main};
