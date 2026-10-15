'use strict';
/**
 * SWAPP x SOCIAL prototype — public, read-only adapter.
 * Never forwards SWAPP cookies, credentials, Bearer tokens or user input to SOCIAL.
 * Host is pinned: not an open proxy. The upstream feed itself excludes private circles.
 */
const SOCIAL_ORIGIN='https://quanticminds.onrender.com';
function clean(value,limit){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,limit)}
function normalizePublicPosts(raw){
 if(!raw||!Array.isArray(raw.posts))throw Error('unexpected_social_response');
 const seen=new Set(),out=[];
 for(const post of raw.posts){
  const id=clean(post?.id,80),body=clean(post?.body,420);
  if(!id||!body||seen.has(id))continue;
  if(post.circleId)continue; // Defense in depth: no closed circle ever crosses SWAPP.
  seen.add(id);
  const author=post.author||{};
  const created=new Date(post.createdAt);
  out.push({
   id,body,
   author:clean(author.displayName||author.handle||'Membre SOCIAL',70),
   handle:clean(author.handle,30),
   createdAt:Number.isNaN(created.getTime())?null:created.toISOString()
  });
  if(out.length>=24)break;
 }
 return out;
}
function createPreviewHandler(fetchImpl){
 if(typeof fetchImpl!=='function')throw Error('fetch required');
 return async function preview(_req,res){
  res.set('Cache-Control','no-store');
  try{
   const response=await fetchImpl(SOCIAL_ORIGIN+'/api/pulse/feed?mode=following&limit=24',
    {headers:{Accept:'application/json'},redirect:'error',size:160000},4500);
   if(!response.ok)throw Error('social_http_'+response.status);
   const posts=normalizePublicPosts(await response.json());
   return res.json({success:true,source:'SOCIAL / Quantic Sillage',readonly:true,posts});
  }catch(_){
   return res.status(503).json({success:false,error:'social_preview_unavailable',posts:[]});
  }
 };
}
module.exports={SOCIAL_ORIGIN,normalizePublicPosts,createPreviewHandler};
