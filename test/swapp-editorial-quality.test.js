'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {reviewPublication,needsQualityGate,requirePublicationReview,QUALITY_START}=require('../modules/swapp-news/editorial-quality');
const {selectEditorialReleaseCandidates}=require('../modules/swapp-news/editorial-release-selection');
const baseline={slug:'original-guide',contentType:'article',status:'published',title:'Le guide',
 summary:'Notre dossier montre la méthode et les limites de la sélection, sans inventer de résultats pour les joueurs.',
 body:'Analyse et recommandations rédigées pour un besoin précis. '.repeat(36),
 sources:[{url:'https://example.org/original',label:'Source'}]};
test('internal content standards flag thin content but do not claim a Google word limit',()=>{
 assert.equal(reviewPublication(baseline).ready,true);
 const thin={...baseline,body:'Vague.',summary:'Bref.',sources:[]};
 assert.deepEqual(reviewPublication(thin).issues,['texte_trop_court','resume_insuffisant','source_https_absente']);
 assert.equal(needsQualityGate({...thin,createdAt:'2026-11-16T10:00:00Z'},{production:true}),false);
 assert.equal(needsQualityGate({...thin,createdAt:QUALITY_START},{production:true}),true);
 assert.equal(needsQualityGate({...thin,createdAt:QUALITY_START},{production:false}),false);
 assert.throws(()=>requirePublicationReview({...thin,createdAt:QUALITY_START},{production:true}),/Article : contrôle éditorial/);
 assert.doesNotThrow(()=>requirePublicationReview({...baseline,createdAt:QUALITY_START},{production:true}));
 assert.equal(reviewPublication({...thin,contentType:'post'}).ready,true);
});
test('new thin releases are excluded even with migration verified, while older releases are preserved',()=>{
 const before={...baseline,body:'Une brève.',publishedAt:'2026-11-16T13:00:00Z'};
 const after={...baseline,slug:'new-thin',body:'Une brève.',publishedAt:'2026-11-17T12:00:00Z'};
 const good={...baseline,slug:'new-dossier',publishedAt:'2026-11-17T12:00:00Z'};
 for(const options of [{mysqlMode:true,migrationVerified:true},{mysqlMode:true,migrationVerified:false},{mysqlMode:false,migrationVerified:true}]){
  const found=selectEditorialReleaseCandidates([before,after,good],options);
  assert.ok(found.some(v=>v.slug==='original-guide'));
  assert.ok(found.some(v=>v.slug==='new-dossier'));
  assert.ok(!found.some(v=>v.slug==='new-thin'));
 }
 const code=fs.readFileSync(path.join(__dirname,'../modules/swapp-news/router.js'),'utf8');
 assert.match(code,/new Map\(releaseCandidates\.map\(article=>\[article\.slug,article\]\)\)/);
 assert.match(code,/requirePublicationReview\(old,\{production:process\.env\.NODE_ENV==='production'\}\)/);
});
