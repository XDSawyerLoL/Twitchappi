'use strict';
/*
 * SWAPP editorial pre-review: read-only audit of checked-in editorial releases.
 * Heuristics are triage signals, NOT a Google approval score or a substitute
 * for factual/source review. Production MySQL records must be reviewed separately.
 * Usage: node tools/swapp-adsense-editorial-audit.js [--json]
 */
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
function auditArticle(article){
 if(!article||article.status!=='published')return null;
 const kind=String(article.contentType||'article').toLowerCase();
 const body=String(article.body||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
 const summary=String(article.summary||'').trim();
 const sources=Array.isArray(article.sources)?article.sources.filter(s=>/^https:\/\//.test(String(s?.url||''))):[];
 const title=String(article.title||'').trim();
 const signals=[];
 // Thresholds are internal review priorities; Google publishes no word quota.
 if(['article','guide','dossier'].includes(kind)&&body.length<1400)signals.push('contenu_court_a_enrichir');
 if(['article','guide','dossier'].includes(kind)&&sources.length<2)signals.push('verifier_independance_des_sources');
 if(summary.length<80)signals.push('resume_a_developper');
 if(!sources.length)signals.push('references_absentes');
 if(!title||!/^[a-z0-9][a-z0-9-]+$/i.test(String(article.slug||'')))signals.push('titre_ou_url_a_controler');
 return {slug:String(article.slug||''),title,kind,characters:body.length,sourceCount:sources.length,signals};
}
function auditReleases(dataDir=path.join(ROOT,'data')){
 const manifest=JSON.parse(fs.readFileSync(path.join(dataDir,'swapp-editorial-releases.json'),'utf8'));
 if(!Array.isArray(manifest.releases))throw Error('Manifest invalid');
 const articles=[],seen=new Set();
 for(const file of manifest.releases){
  if(!/^[a-z0-9-]+\.json$/.test(String(file)))throw Error('Untrusted release filename');
  const release=JSON.parse(fs.readFileSync(path.join(dataDir,file),'utf8'));
  if(!Array.isArray(release.articles))throw Error('Invalid editorial release '+file);
  for(const entry of release.articles){
   const audit=auditArticle(entry);
   if(!audit)continue;
   if(seen.has(audit.slug))audit.signals.push('url_en_double');
   seen.add(audit.slug);
   audit.release=file;
   articles.push(audit);
  }
 }
 const flagged=articles.filter(x=>x.signals.length);
 const byReason={};
 for(const a of flagged)for(const reason of a.signals)byReason[reason]=(byReason[reason]||0)+1;
 return {scope:'checked_in_releases_not_live_mysql',inspected:articles.length,flagged:flagged.length,byReason,articles:flagged};
}
if(require.main===module){
 try{
  const report=auditReleases();
  if(process.argv.includes('--json'))console.log(JSON.stringify(report,null,2));
  else{
   console.log('SWAPP · Audit éditorial AdSense — TRIAGE, pas certification Google');
   console.log('Publications examinées:',report.inspected,'· À relire:',report.flagged);
   console.log('Motifs:',report.byReason);
   for(const item of report.articles.slice(0,40))console.log(item.slug,':',item.signals.join(', '));
   if(report.articles.length>40)console.log('... autres entrées: utiliser --json');
   console.log('Vérifier séparément les articles du MySQL Hostinger et la qualité humaine du contenu.');
  }
 }catch(error){console.error('Audit indisponible:',error.message);process.exitCode=1}
}
module.exports={auditArticle,auditReleases};
