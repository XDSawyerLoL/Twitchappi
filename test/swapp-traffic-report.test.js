'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {parseLine,section,searchEngine,trafficReport}=require('../tools/swapp-traffic-report');
const log=(date,uri,{referer='-',ua='Mozilla/5.0',status=200}={})=>
 '203.0.113.9 - - ['+date+'] "GET '+uri+' HTTP/1.1" '+status+' 512 "'+referer+'" "'+ua+'"';
test('parses Apache/Nginx timezone and filters internal endpoints',()=>{
 const parsed=parseLine(log('16/Oct/2026:13:45:01 +0200','/actus/gta-6?q=hidden'));
 assert.equal(parsed.date.toISOString(),'2026-10-16T11:45:01.000Z');
 assert.equal(section(parsed.uri),'Articles');
 assert.equal(section('/assets/app.js'),null);
 assert.equal(section('/api/health'),null);
 assert.equal(section('/gestionnaire'),null);
 assert.equal(section('/jeux/grand-theft-auto-vi'),'Dossiers jeux');
 assert.equal(section('/username_2026'),'Chaînes');
 assert.equal(section('https://other-site.tld/actus/article'),null);
});
test('recognizes free organic search referrers but excludes internal and social sources',()=>{
 assert.equal(searchEngine('https://www.google.fr/search?q=jeu'),'Google');
 assert.equal(searchEngine('https://www.bing.com/search?q=x'),'Bing');
 assert.equal(searchEngine('https://search.brave.com/search?q=x'),'Brave Search');
 assert.equal(searchEngine('https://swapp.tv/actus'),null);
 assert.equal(searchEngine('https://reddit.com/r/gaming'),null);
});
test('reports only aggregate pages and search referrals; never stores personal data',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'swapp-traffic-'));
 const file=path.join(dir,'access.log');
 try{
  fs.writeFileSync(file,[
   log('16/Oct/2026:13:45:01 +0200','/actus/gta-6?search=personal',{referer:'https://www.google.fr/search?q=personal'}),
   log('16/Oct/2026:13:46:01 +0200','/jeux/grand-theft-auto-vi',{referer:'https://www.bing.com/search?q=x'}),
   log('16/Oct/2026:13:47:01 +0200','/assets/app.js'),
   log('16/Oct/2026:13:48:01 +0200','/actus/private',{ua:'Googlebot/2.1'}),
   log('16/Oct/2026:13:49:01 +0200','/actus/article',{status:404}),
   log('01/Sep/2026:13:45:01 +0200','/'),
   log('16/Oct/2026:13:50:01 +0200','/communaute')
  ].join('\n'));
  const result=await trafficReport(file,{days:30,now:Date.parse('2026-10-16T12:00:00Z')});
  assert.equal(result.pageViews,3);
  assert.equal(result.searchReferrals,2);
  assert.equal(result.bySection.Articles,1);
  assert.equal(result.bySection['Dossiers jeux'],1);
  assert.equal(result.bySearchEngine.Google,1);
  const output=JSON.stringify(result);
  assert.doesNotMatch(output,/203\.0\.113\.9|personal|gta-6|Mozilla\/5\.0/);
  assert.match(output,/not unique visitors or Google search impressions/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
