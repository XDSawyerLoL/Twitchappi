'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','local-agent/player.html'),'utf8');
const source=fs.readFileSync(path.join(__dirname,'..','modules/swapp-direct-hls-relay.js'),'utf8');
function backend(){
 const routes={get:new Map(),post:new Map(),put:new Map()};
 const express={raw:()=>()=>{},json:()=>()=>{}};
 const mod={exports:{}};
 vm.runInNewContext(source,{
  require(p){if(p==='express')return express;if(p.startsWith('./'))return require('../modules/'+p.slice(2));return require(p)},
  module:mod,process:{env:{}},Buffer,Date,setInterval(){return{unref(){}}}
 });
 const app={get:(p,fn)=>routes.get.set(p,fn),post:(p,...fns)=>routes.post.set(p,fns.at(-1)),
  put:(p,...fns)=>routes.put.set(p,fns.at(-1))};
 mod.exports.attachSwappDirectRelay(app,{
  lookupOwner:async()=>({login:'vnhz'}),
  lookupObsOwner:async key=>key==='a'.repeat(48)?{login:'vnhz'}:null,
  lookupDashboardOwner:async()=>({login:'vnhz'})
 });
 const call=async(method,route,options={})=>{
  const fn=routes[method].get(route);assert.ok(fn,'missing '+route);
  const headers={},req={params:{login:'vnhz',segment:options.segment},
   query:{cid:'a'.repeat(48),file:options.file},headers:{},body:options.body,
   get(key){if(key==='x-swapp-media-name')return this.headers['x-swapp-media-name']||'';
    if(key==='authorization')return 'Bearer VALID';return ''}},
   res={statusCode:200,set(k,v){headers[k]=v;return this},status(code){this.statusCode=code;return this},
    json(body){this.body=body;return this},send(body){this.body=body;return this},
    type(){return this},sendStatus(code){this.statusCode=code;return this}};
  await fn(req,res);return {code:res.statusCode,body:res.body,headers};
 };
 return {call};
}
test('HLS player no longer treats a frozen readyState as a healthy moving image',()=>{
 const inline=html.match(/<script>\s*([\s\S]+?)\s*<\/script>/);
 assert.ok(inline,'embedded player script');
 new Function(inline[1].replace('__SWAPP_HLS_SRC__','"/api/oryon/local-relay/vnhz/index.m3u8"'));
 assert.match(html,/lastProgressTime/);
 assert.match(html,/time-lastProgressTime>=0\.12/);
 assert.match(html,/requestVideoFrameCallback/);
 assert.doesNotMatch(html,/lastFrameAt=Date\.now\(\);retries=0;everDecoded=true/);
});
test('Playback prefers decoder and network recovery before replacing HLS engine',()=>{
 assert.match(html,/h\.recoverMediaError\(\)/);
 assert.match(html,/h\.startLoad\(-1\)/);
 assert.match(html,/networkRecoveries<2/);
 assert.match(html,/mediaRecoveries<2/);
 assert.match(html,/delay=Math\.min\(15000,2000\+retries\*1700\)/);
 assert.match(html,/healthySince>30000/);
 assert.match(html,/liveSyncDurationCount:3/);
 assert.match(html,/liveMaxLatencyDurationCount:7/);
 assert.match(html,/backBufferLength:30,maxBufferLength:20/);
 assert.match(html,/lastLiveCorrection>30000/);
});
test('Seven-minute OBS playlist progression works with bounded relay memory and a second viewer',async()=>{
 const b=backend();
 const up='/api/swapp/obs-hls/put',play='/api/oryon/local-relay/:login/index.m3u8';
 const getSeg='/api/oryon/local-relay/:login/:segment';
 const key='a'.repeat(48),bytes=Buffer.alloc(188*1100);bytes[0]=0x47;
 let count=0,first='';
 for(let n=0;n<212;n++){
  const segment=Buffer.from(bytes);segment[1]=n%256;
  const saved=await b.call('put',up,{file:'index'+n+'.ts',body:segment});
  assert.equal(saved.code,200,'OBS segment '+n);
  const firstSeg=Math.max(0,n-4);
  const parts=Array.from({length:n-firstSeg+1},(_v,j)=>firstSeg+j);
  const text='#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:'+firstSeg+'\n'+
   parts.map(id=>'#EXTINF:2.0,\nindex'+id+'.ts\n').join('');
  const pushed=await b.call('put',up,{file:'index.m3u8',body:Buffer.from(text)});
  assert.equal(pushed.code,200,'OBS playlist '+n);
  if(n%15===0){
   const pl=await b.call('get',play);
   assert.equal(pl.code,200);
   const str=String(pl.body);
   assert.match(str,new RegExp('seg_'+n+'\\.ts'));
   const viewer1=await b.call('get',getSeg,{segment:'seg_'+n+'.ts'});
   const viewer2=await b.call('get',getSeg,{segment:'seg_'+(n-1<0?0:n-1)+'.ts'});
   assert.equal(viewer1.code,200);assert.equal(viewer2.code,200);
   count++;
  }
 }
 const current=await b.call('get','/api/oryon/local-relay/vnhz/state');
 assert.equal(current.code,200);
 assert.equal(current.body.media_fresh,true);
 assert.ok(current.body.segment_bytes_in_memory<=current.body.segment_memory_budget);
 assert.ok(current.body.segment_count>0);
 assert.ok(count>=14);
 const older=await b.call('get',getSeg,{segment:'seg_0.ts'});
 assert.equal(older.code,404,'bounded DVR evicts old media after >5m');
 assert.equal(older.headers['X-SWAPP-HLS-Window'],'expired');
 const diagnostics=await b.call('get','/api/swapp/obs-hls/diagnostics');
 assert.equal(diagnostics.body.missing_segment_requests,1);
 assert.ok(diagnostics.body.segment_bytes_in_memory>0);
 assert.ok(diagnostics.body.segment_memory_budget>0);
});
