/* Keep a Quantic-issued SWAPP session alive only while the local Vault stays unlocked.
 * No secret or identity data is stored in browser storage. */
(()=>{'use strict';
 const BASE='/api/quantic-id/account',VAULT='http://127.0.0.1:47621';
 const LOCAL={mode:'cors',credentials:'omit',cache:'no-store',targetAddressSpace:'loopback'};
 let auth=false,busy=false,lastRenew=0,closed=false;
 const pause=2500,renewAfter=9000;
 async function remote(path,body){
  const res=await fetch(BASE+'/'+path,{method:'POST',credentials:'same-origin',cache:'no-store',
   headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  if(!res.ok||!String(res.headers.get('content-type')||'').includes('application/json'))throw Error('quantic_session_server_unavailable');
  return res.json();
 }
 async function status(){
  const response=await fetch(BASE+'/status',{cache:'no-store',credentials:'same-origin'});
  if(!response.ok)return null;
  return response.json();
 }
 async function vault(route,options={}){
  return fetch(VAULT+route,{...LOCAL,...options,signal:AbortSignal.timeout(5000)});
 }
 async function terminate(){
  if(closed)return;
  closed=true;auth=false;
  try{await remote('logout',{})}catch{}
  // Protect against stale account chrome showing "signed in" after vault lock.
  if(document.visibilityState==='visible')location.reload();
 }
 async function renew(){
  const result=await remote('challenge',{purpose:'renew'});
  const response=await vault('/v1/assert',{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({challenge:result.challenge,audience:result.audience}),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('quantic_vault_refused');
  await remote('prove',{purpose:'renew',challenge:result.challenge,proof:await response.json()});
  lastRenew=Date.now();
 }
 async function tick(){
  if(!auth||busy||closed)return;
  busy=true;
  try{
   const response=await vault('/v1/status');
   if(!response.ok)throw Error('quantic_vault_unreachable');
   const data=await response.json();
   if(data.product!=='Quantic Identity Vault'||!data.identityAvailable)throw Error('quantic_vault_locked');
   if(Date.now()-lastRenew>=renewAfter){
    if(navigator.locks?.request){
     await navigator.locks.request('swapp-quantic-auth-renew',{ifAvailable:true},async lock=>{
      if(lock)await renew();
     });
    }else await renew();
   }
  }catch{await terminate()}
  finally{busy=false}
 }
 async function init(){
  const info=await status().catch(()=>null);
  if(!info?.quanticSession)return;
  auth=true;lastRenew=Date.now();
  window.setInterval(()=>void tick(),pause);
  void tick();
 }
 window.addEventListener('swapp:quantic-session-started',()=>{auth=true;closed=false;lastRenew=Date.now()});
 void init();
})();