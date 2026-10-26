'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {PATHS,verifiedOrigin,inspectPage,inspect,submitIndexNow}=require('../tools/swapp-geo-probe');
const {RELEASE_FILES}=require('../tools/swapp-release');

const ORIGIN='https://swapp.tv';
function html(path){
 const schema={'@context':'https://schema.org','@graph':[
  {'@type':path==='/a-propos'?'AboutPage':'WebPage',url:ORIGIN+path}]};
 return '<!doctype html><html lang="fr"><head><title>SWAPP GEO</title>'+
  '<link rel="canonical" href="'+ORIGIN+path+'">'+
  '<script type="application/ld+json">'+JSON.stringify(schema)+'</script></head>'+
  '<body><main id="main-content" class="swapp-geo"><h1>Voici une page publique SWAPP GEO</h1></main></body></html>';
}
const sitemap='<?xml version="1.0"?><urlset>'+
 PATHS.map(p=>'<url><loc>'+ORIGIN+p+'</loc></url>').join('')+'</urlset>';
function fakeFetch({missing='',badCanonical=false}={}){
 const visited=[];
 const fetchImpl=async url=>{
  const path=new URL(url).pathname;
  visited.push(path);
  let body,contentType;
  if(path==='/robots.txt'){body='User-agent: *\nAllow: /\nSitemap: '+ORIGIN+'/sitemap.xml\n';contentType='text/plain'}
  else if(path==='/sitemap.xml'){body=sitemap;contentType='application/xml'}
  else if(PATHS.includes(path)){body=html(path);contentType='text/html';if(badCanonical)body=body.replace('rel="canonical"','rel="canonical-missing"')}
  else return {ok:false,status:404,headers:{get:()=>''},text:async()=>''};
  if(path===missing)return {ok:false,status:404,headers:{get:()=>contentType},text:async()=>''};
  return {ok:true,status:200,headers:{get:()=>contentType},text:async()=>body};
 };
 return {visited,fetchImpl};
}

test('GEO production probe never fetches arbitrary third-party domains',()=>{
 assert.equal(verifiedOrigin(ORIGIN),ORIGIN);
 assert.equal(verifiedOrigin('https://www.swapp.tv'), 'https://www.swapp.tv');
 assert.throws(()=>verifiedOrigin('https://malicious.example'),/Unsupported/);
 assert.throws(()=>verifiedOrigin('http://swapp.tv'),/HTTPS/);
 assert.throws(()=>verifiedOrigin(ORIGIN+'/path'),/bare origin/);
 assert.throws(()=>verifiedOrigin(ORIGIN+'?x=1'),/bare origin/);
});
test('GEO probe confirms only genuine rendered pages with correct structured data',()=>{
 const expected=inspectPage('/a-propos',{status:200,type:'text/html',body:html('/a-propos')});
 assert.equal(expected.structured_data,true);
 assert.throws(()=>inspectPage('/a-propos',{status:200,type:'text/html',body:html('/alternative-twitch')}),/canonical/);
 assert.throws(()=>inspectPage('/a-propos',{status:200,type:'text/html',body:'<html><h1>SWAPP</h1></html>'}),/canonical/);
});
test('GEO one-shot inspection visits exactly sitemap, robots and two GEO pages',async()=>{
 const {visited,fetchImpl}=fakeFetch();
 const report=await inspect({origin:ORIGIN,fetchImpl});
 assert.equal(report.status,'verified_on_http');
 assert.equal(report.pages.length,2);
 assert.deepEqual(visited.sort(),['/robots.txt','/sitemap.xml',...PATHS].sort());
 const failed=fakeFetch({missing:'/a-propos'});
 await assert.rejects(()=>inspect({origin:ORIGIN,fetchImpl:failed.fetchImpl}),/HTTP 404/);
 await assert.rejects(()=>inspect({origin:ORIGIN,fetchImpl:fakeFetch({badCanonical:true}).fetchImpl}),/canonical/);
});
test('GEO pages and probe are tracked in the release fingerprint',()=>{
 for(const filename of ['modules/swapp-geo-pages.js','tools/swapp-geo-probe.js'])
  assert.ok(RELEASE_FILES.includes(filename),filename+' absent from release fingerprint');
});
test('IndexNow sends public GEO URLs only to its documented free endpoint',async()=>{
 const calls=[];
 const status=await submitIndexNow({fetchImpl:async(url,options)=>{
  calls.push({url,options});
  return {status:202};
 }});
 assert.equal(status.accepted,true);
 assert.equal(status.url_count,2);
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'https://api.indexnow.org/indexnow');
 const body=JSON.parse(calls[0].options.body);
 assert.deepEqual(body.urlList,PATHS.map(p=>ORIGIN+p));
 assert.equal(body.host,'swapp.tv');
});
