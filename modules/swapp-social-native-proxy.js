'use strict';
/** First-party SWAPP transport for the real Quantic SOCIAL application.
 * Exact allowlist, pinned upstream, strict method/origin checks, no SWAPP cookies.
 */
const SOCIAL_ORIGIN='https://quanticminds.onrender.com';
const simple={
 GET:new Set(['/health','/feed','/search','/circles','/notifications','/me','/me/bookmarks','/conversations','/export']),
 POST:new Set(['/auth/login','/auth/register','/auth/logout','/posts','/circles','/notifications/read','/report','/messages']),
 PATCH:new Set(['/me'])
};
const dynamic={
 GET:[/^\/posts\/[a-zA-Z0-9_-]{3,90}$/, /^\/posts\/[a-zA-Z0-9_-]{3,90}\/replies$/, /^\/users\/[a-z0-9_]{3,24}$/, /^\/messages\/[a-z0-9_]{3,24}$/],
 POST:[/^\/posts\/[a-zA-Z0-9_-]{3,90}\/(like|repost|bookmark)$/, /^\/users\/[a-z0-9_]{3,24}\/(follow|block)$/, /^\/circles\/[a-zA-Z0-9_-]{3,90}\/join$/]
};
function permitted(method,path){
 return (simple[method]?.has(path)||dynamic[method]?.some(pattern=>pattern.test(path)))===true;
}
function safeQuery(path,raw){
 const q=new URLSearchParams();
 if(path==='/feed'){
  const input=new URLSearchParams(String(raw||''));
  const mode=input.get('mode');
  q.set('mode',['discover','following'].includes(mode)?mode:'discover');
  q.set('limit',String(Math.min(40,Math.max(1,Number(input.get('limit'))||40))));
 }else if(path==='/search'){
  q.set('q',new URLSearchParams(String(raw||'')).get('q')?.slice(0,80)||'');
 }
 return q.size?'?'+q.toString():'';
}
function createSocialNativeProxy(fetchImpl,{production=true}={}){
 if(typeof fetchImpl!=='function')throw Error('fetch implementation is required');
 return async function proxy(req,res){
  res.set('Cache-Control','private, no-store');
  res.set('X-Content-Type-Options','nosniff');
  const method=String(req.method||'').toUpperCase();
  const path=String(req.path||'');
  if(!permitted(method,path))return res.status(404).json({error:'social_route_not_available'});
  if(method!=='GET'){
   const origin=String(req.headers?.origin||'');
   const referer=String(req.headers?.referer||'');
   const allowedOrigins=['https://swapp.tv','https://www.swapp.tv'];
   if(!production)allowedOrigins.push('http://localhost:3000','http://127.0.0.1:3000');
   if(!allowedOrigins.includes(origin)||
      (referer&&!allowedOrigins.some(allow=>referer.startsWith(allow+'/')))){
    return res.status(403).json({error:'social_origin_required'});
   }
  }
  const headers={Accept:'application/json'};
  const bearer=String(req.headers?.authorization||'').match(/^Bearer ([A-Za-z0-9_-]{20,256})$/);
  if(bearer)headers.Authorization='Bearer '+bearer[1];
  else if(!['GET'].includes(method)&&!['/auth/login','/auth/register'].includes(path)){
   return res.status(401).json({error:'unauthorized'});
  }
  let body;
  if(method!=='GET'){
   if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))return res.status(400).json({error:'invalid_body'});
   body=JSON.stringify(req.body);
   if(body.length>8500)return res.status(413).json({error:'body_too_large'});
   headers['Content-Type']='application/json';
  }
  const endpoint=SOCIAL_ORIGIN+'/api/pulse'+path+safeQuery(path,req.originalUrl?.split('?').slice(1).join('?'));
  try{
   const result=await fetchImpl(endpoint,{
    method,headers,redirect:'error',
    ...(body===undefined?{}:{body})
   },8000);
   if(!result||!Number.isInteger(result.status))throw Error('bad_upstream');
   const raw=await result.text();
   if(raw.length>1250000)throw Error('response_too_large');
   let data;try{data=JSON.parse(raw)}catch{throw Error('non_json_upstream')}
   return res.status(result.status).json(data);
  }catch(_){return res.status(503).json({error:'social_temporarily_unavailable'})}
 };
}
module.exports={SOCIAL_ORIGIN,permitted,safeQuery,createSocialNativeProxy};
