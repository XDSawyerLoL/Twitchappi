'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {auditArticle,auditReleases}=require('../tools/swapp-adsense-editorial-audit');

test('editorial audit is read-only and flags weak items for human revision',()=>{
 const good={status:'published',slug:'analyse-jeu-2026',title:'Analyse du lancement du jeu',
  body:'Des observations de jeu vérifiées et expliquées. '.repeat(45),
  summary:'Une analyse détaillée et originale du lancement, de ses conséquences et des expériences des joueurs.',
  sources:[{url:'https://publisher.example/press'},{url:'https://developer.example/blog'}]};
 assert.deepEqual(auditArticle(good).signals,[]);
 const low={...good,body:'Copie sommaire.',sources:[{url:'https://publisher.example/press'}],summary:'Courte'};
 assert.ok(auditArticle(low).signals.includes('contenu_court_a_enrichir'));
 assert.ok(auditArticle(low).signals.includes('verifier_independance_des_sources'));
 assert.equal(auditArticle({...low,status:'draft'}),null);
 assert.equal(auditArticle({...low,status:'unpublished'}),null);
});
test('audit only inspects committed editorial releases and never edits published data',()=>{
 const report=auditReleases();
 assert.equal(report.scope,'checked_in_releases_not_live_mysql');
 assert.ok(report.inspected>0);
 assert.ok(Array.isArray(report.articles));
 for(const item of report.articles){
  assert.ok(item.release.endsWith('.json'));
  assert.ok(item.signals.length>0);
 }
});
