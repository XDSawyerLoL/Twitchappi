#!/usr/bin/env node
/**
 * Compare les fichiers locaux SWAPP aux fichiers reellement servis en production.
 * Sans dependance npm. Lecture seule : aucune modification du site.
 * Usage: node scripts/production-qa.mjs [https://swapp.tv] [rapport.json]
 */
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const origin=(process.argv[2]||'https://swapp.tv').replace(/\/+$/,'');
const reportPath=resolve(process.argv[3]||'audit-swapp-production.json');
const nonce=Date.now().toString(36);
const checks=[];
function check(name,pass,detail){
 checks.push({name,pass,detail});
 console.log((pass?'OK  ':'FAIL')+' '+name+(detail?' - '+detail:''));
}
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
async function request(path){
 const url=new URL(path,origin);
 url.searchParams.set('_swapp_qa',nonce);
 const response=await fetch(url,{cache:'no-store',redirect:'follow',
  headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(12000)});
 return {response,body:Buffer.from(await response.arrayBuffer())};
}
async function main(){
 let shell;
 try{shell=await readFile(join(root,'index.html'),'utf8')}
 catch{throw Error('Lancer depuis le depot SWAPP (index.html introuvable).')}
 for(const route of ['/','/actus']){
  try{
   const {response,body}=await request(route);
   const html=body.toString('utf8');
   check('page '+route,response.ok&&html.includes('id="actus"')&&html.includes('swapp-art-direction.css'),
     'HTTP '+response.status+', '+body.length+' octets');
   if(route==='/actus'){
    check('ACTUS F5 : amorcage serveur present',
      html.includes('__SWAPP_DIRECT_ACTUS_ENTRY__')&&html.includes('swapp-route-bootstrap.js'),
      'HTML seulement : verifier aussi le comportement F5 dans un navigateur');
   }
   if(route==='/'){
    check('HTML servi conforme au depot',
      html.includes('src="/assets/swapp-actus-app.js?v=')&&
      html.match(/src="\/assets\/swapp-actus-app\.js\?v=[^"]+"/)?.[0]===
      shell.match(/src="\/assets\/swapp-actus-app\.js\?v=[^"]+"/)?.[0],
      'Revision du lecteur Actualite');
   }
  }catch(e){check('page '+route,false,e.message)}
 }
 const files=[...shell.matchAll(/(?:src|href)="(\/(?:assets\/[a-zA-Z0-9_.-]+\.(?:js|css)|index_script\.js))(?:\?[^"]*)?"/g)]
   .map(x=>x[1]).filter((v,i,a)=>a.indexOf(v)===i);
 for(const path of files){
  try{
   const local=await readFile(join(root,path.slice(1)));
   const {response,body}=await request(path);
   check(path,response.ok&&sha(local)===sha(body),
     'HTTP '+response.status+', depot '+local.length+' o / production '+body.length+' o');
  }catch(e){check(path,false,e.message)}
 }
 try{
  const {response,body}=await request('/api/actus');
  let count='';let valid=false;
  try{
   const data=JSON.parse(body.toString('utf8'));
   valid=Array.isArray(data.articles);
   count=valid?' - '+data.articles.length+' articles':'';
  }catch{}
  check('API Actualite',response.ok&&valid,'HTTP '+response.status+count);
 }catch(e){check('API Actualite',false,e.message)}
 const failed=checks.filter(c=>!c.pass);
 const report={date:new Date().toISOString(),origin,
  testedFrom:'machine ayant execute ce script',
  passed:checks.length-failed.length,failed:failed.length,checks};
 await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
 console.log('\nResultat : '+report.passed+'/'+checks.length+' controles. Rapport : '+reportPath);
 if(failed.length)process.exitCode=1;
}
main().catch(error=>{console.error(error.message);process.exitCode=2});
