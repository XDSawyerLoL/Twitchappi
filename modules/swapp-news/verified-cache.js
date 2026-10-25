'use strict';
/*
 * Bounded in-process cache of articles actually confirmed published by the CMS.
 * Never bootstrap this cache from the checked-in releases: a release may have
 * been explicitly withdrawn after Firestore adoption.
 * No disk, paid service, credentials or additional database required.
 */
function createVerifiedPublishedCache({ttlMs=10*60*1000,clock=Date.now,maxItems=500}={}){
 let snapshot=null;
 const valid=()=>snapshot&&clock()-snapshot.at>=0&&clock()-snapshot.at<ttlMs;
 const copy=items=>items.map(item=>({...item}));
 function remember(items){
  if(!Array.isArray(items))throw TypeError('A verified article list is required');
  // Only an actual successful CMS read may call remember.
  snapshot={
   at:clock(),
   items:copy(items.filter(item=>item&&item.status==='published'&&
    typeof item.slug==='string'&&/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(item.slug)&&
    typeof item.title==='string'&&item.title.trim()).slice(0,maxItems))
  };
  return snapshot.items.length;
 }
 function all(){return valid()?copy(snapshot.items):null}
 function get(slug){
  if(!valid())return null;
  const item=snapshot.items.find(item=>item.slug===slug);
  return item?{...item}:null;
 }
 function invalidate(){snapshot=null}
 return {remember,all,get,invalidate};
}
module.exports={createVerifiedPublishedCache};
