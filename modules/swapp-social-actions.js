'use strict';
/* Minimal same-origin SOCIAL bridge.
 * Identity is explicitly SOCIAL, independent from SWAPP.
 * Tokens are never stored server-side, in a SWAPP cookie, logs or database.
 */
const ORIGIN='https://quanticminds.onrender.com';
const HANDLE=/^[a-z0-9_]{3,24}$/;
const POST_ID=/^[a-zA-Z0-9_-]{5,85}$/;
function createSocialRouter({express,fetchImpl,isProd=false}){
 if(typeof express?.Router!=='function'||typeof fetchImpl!=='function')throw Error('social_bridge_dependencies_missing');
 const router=express.Router();
 router.use((req,res,next)=>{
  res.set('Cache-Control','no-store');
  if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'method_not_allowed'});
  const siteOrigin=req.headers.origin;
  if(siteOrigin){
   const authorized=['https://swapp.tv','https://www.swapp.tv'];
   if(!isProd)authorized.push('http://localhost:3000','http://127.0.0.1:3000');
   if(!authorized.includes(siteOrigin))return res.status(403).json({error:'origin_forbidden'});
  }
  next();
 });
 async function forward(res,{endpoint,method='GET',body,token}){
  const headers={Accept:'application/json'};
  if(body!==undefined)headers['Content-Type']='application/json';
  if(token)headers.Authorization='Bearer '+token;
  try{
   const response=await fetchImpl(ORIGIN+endpoint,
    {method,headers,redirect:'error',size:131072,...(body===undefined?{}:{body:JSON.stringify(body)})},6500);
   const payload=await response.json();
   if(!response.ok){
    const supported=['invalid_credentials','unauthorized','rate_limited','invalid_handle','weak_password','empty_post','forbidden','not_found'];
    return res.status([400,401,403,404,409,429].includes(response.status)?response.status:502)
     .json({error:supported.includes(payload?.error)?payload.error:'social_unavailable'});
   }
   return res.json(payload);
  }catch(_){return res.status(503).json({error:'social_unavailable'})}
 }
 const bearer=req=>{const m=String(req.headers.authorization||'').match(/^Bearer ([A-Za-z0-9_-]{20,256})$/);return m?m[1]:null};
 router.post('/login',(req,res)=>{
  const handle=String(req.body?.handle||'').trim().toLowerCase();
  const password=String(req.body?.password||'');
  if(!HANDLE.test(handle)||password.length<10||password.length>128)return res.status(400).json({error:'invalid_credentials'});
  return forward(res,{endpoint:'/api/pulse/auth/login',method:'POST',body:{handle,password}});
 });
 router.get('/me',(req,res)=>{
  const token=bearer(req);if(!token)return res.status(401).json({error:'unauthorized'});
  return forward(res,{endpoint:'/api/pulse/me',token});
 });
 router.post('/post',(req,res)=>{
  const token=bearer(req);if(!token)return res.status(401).json({error:'unauthorized'});
  const body=String(req.body?.body||'').trim();
  if(!body||body.length>420)return res.status(400).json({error:'invalid_post'});
  return forward(res,{endpoint:'/api/pulse/posts',method:'POST',token,body:{body}});
 });
 router.post('/like/:id',(req,res)=>{
  const token=bearer(req),id=String(req.params.id||'');
  if(!token)return res.status(401).json({error:'unauthorized'});
  if(!POST_ID.test(id))return res.status(400).json({error:'invalid_post_id'});
  return forward(res,{endpoint:'/api/pulse/posts/'+encodeURIComponent(id)+'/like',method:'POST',token,body:{}});
 });
 return router;
}
module.exports={ORIGIN,createSocialRouter};
