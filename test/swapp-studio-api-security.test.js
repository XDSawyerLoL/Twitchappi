'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const server=fs.readFileSync(path.join(__dirname,'..','local-agent','server.js'),'utf8');
const start=server.indexOf('function privateStudioOrigin(req,res,next){');
const end=server.indexOf('\napp.use(privateStudioOrigin);',start);
assert.ok(start>=0&&end>start,'CORS middleware source exists');
const privateStudioOrigin=vm.runInNewContext(
 '('+server.slice(start,end).trim()+')',{URL}
);
function attempt(url,{origin='',site='',host='127.0.0.1:8081',method='GET'}={}){
 let next=false,status=200,body=null;const headers={};
 const req={path:url,method,get(name){
  if(name==='Origin')return origin;
  if(name==='Sec-Fetch-Site')return site;
  if(name==='Host')return host;
  return '';
 }};
 const res={
  setHeader(k,v){headers[k]=v},
  status(x){status=x;return this},
  json(x){body=x;return this},
  end(){return this}
 };
 privateStudioOrigin(req,res,()=>{next=true});
 return {next,status,body,headers};
}
test('websites cannot read stream keys and account configuration from the local server',()=>{
 for(const route of ['/api/account/status','/api/setup/check','/api/status','/api/tunnel/status']){
  const res=attempt(route,{origin:'https://malicious.example',site:'cross-site'});
  assert.equal(res.next,false,route);
  assert.equal(res.status,403,route);
  assert.equal(res.body.success,false,route);
  assert.notEqual(res.headers['Access-Control-Allow-Origin'],'*');
 }
});
test('same-origin Creator Studio can read keys and control live, OAuth navigation still works',()=>{
 for(const route of ['/api/account/status','/api/setup/check','/api/screen/status','/api/go-live']){
  const res=attempt(route,{origin:'http://127.0.0.1:8081',site:'same-origin'});
  assert.equal(res.next,true,route);
  assert.equal(res.headers['Access-Control-Allow-Origin'],'http://127.0.0.1:8081');
 }
 const callback=attempt('/api/account/browser-callback',{site:'cross-site',origin:'https://swapp.tv'});
 assert.equal(callback.next,true);
});
test('Origin-less fetch from a foreign site is rejected when Fetch Metadata says cross-site',()=>{
 const r=attempt('/api/account/status',{site:'cross-site'});
 assert.equal(r.status,403);
});
test('old OBS HTML screen cannot be reached via root, RTMP lives in the unified creator studio',()=>{
 assert.match(server,/app\.get\('\/', \(_req, res\) => res\.redirect\(302, '\/studio'\)\)/);
 assert.doesNotMatch(server,/function pageHtml\(key\)/);
 const html=fs.readFileSync(path.join(__dirname,'..','local-agent','studio.html'),'utf8');
 for(const id of ['rtmpServer','streamKey','copyRtmp','copyKey','disconnectButton','repairButton']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
});
