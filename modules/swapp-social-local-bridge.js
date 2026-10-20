'use strict';
/** In-process HTTP-compatible adapter for the vendored Pulse API.
 * No loopback TCP listener, VPS, third-party token, external proxy or duplicate Node app.
 */
const crypto=require('node:crypto');
const INTERNAL_ORIGIN='http://swapp-social.internal';
function normalizedHeaderMap(raw={}){
 const out={};
 for(const [key,value] of Object.entries(raw||{})){
  if(!/^[a-z][a-z0-9-]{0,80}$/i.test(key))continue;
  if(!['accept','content-type','authorization'].includes(key.toLowerCase()))continue;
  out[key.toLowerCase()]=String(value).slice(0,1400);
 }
 return out;
}
function createInProcessPulseFetch({load=()=>import('./swapp-social-native/pulse.mjs')}={}){
 let pending=null;
 async function moduleReady(){
  if(!pending)pending=Promise.resolve().then(load).catch(e=>{pending=null;throw e});
  return pending;
 }
 return async function localFetch(endpoint,options={}){
  const url=new URL(endpoint);
  if(url.origin!==INTERNAL_ORIGIN||!url.pathname.startsWith('/api/pulse/'))
   throw new Error('social_internal_destination_denied');
  const method=String(options.method||'GET').toUpperCase();
  if(!['GET','POST','PATCH','DELETE'].includes(method))throw new Error('social_internal_method_denied');
  const body=options.body===undefined?'':String(options.body);
  if(Buffer.byteLength(body)>65536)throw new Error('social_internal_body_too_large');
  const headers=normalizedHeaderMap(options.headers);
  // Rate-limit by an internal stable pseudonymous source, not the single
  // shared 127.0.0.1 address. Never trust browser-supplied X-Forwarded-For.
  let identity=headers.authorization||'public:'+url.pathname;
  if(method==='POST'&&/^\/api\/pulse\/auth\/(login|register)$/.test(url.pathname)){
    let handle='invalid';
    try{handle=String(JSON.parse(body)?.handle||'invalid').toLowerCase().slice(0,40)}catch(_){}
    // Stable per-handle throttling: varying a password must NOT evade limits.
    identity='auth-handle:'+handle;
  }
  const rateKey=crypto.createHash('sha256').update(identity).digest('hex').slice(0,24);
  headers['x-forwarded-for']='swapp-internal-'+rateKey;
  const req={
   method,headers,socket:{remoteAddress:'127.0.0.1'},
   async *[Symbol.asyncIterator](){if(body)yield Buffer.from(body,'utf8')}
  };
  const result={status:500,body:'',headers:{}};
  const res={
   writeHead(statusCode,responseHeaders={}){result.status=Number(statusCode)||500;result.headers=responseHeaders},
   end(payload=''){result.body=String(payload||'')}
  };
  const pulse=await moduleReady();
  if(typeof pulse.handlePulse!=='function')throw new Error('social_native_pulse_handler_missing');
  await pulse.handlePulse(req,res,url,{});
  return {status:result.status,
    text:async()=>result.body,
    json:async()=>JSON.parse(result.body),
    headers:result.headers};
 };
}
module.exports={INTERNAL_ORIGIN,normalizedHeaderMap,createInProcessPulseFetch};
