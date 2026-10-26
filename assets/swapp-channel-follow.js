/* SWAPP channels — real free follow toggle. Reuses the existing account and
 * follow API; never resembles a paid subscription or a Push notification. */
(function(){
 'use strict';
 const root=document.getElementById('channel');
 if(!root)return;
 function loginFor(page){
  const current=typeof state!=='undefined'?state.channelProfile:null;
  const candidate=String(current?.login||page?.dataset?.channelLogin||'').trim().toLowerCase();
  if(/^[a-z0-9_-]{2,48}$/.test(candidate))return candidate;
  const pathname=(location.pathname||'').match(/^\/(?:c\/)?([a-z0-9_-]{2,48})\/?$/i);
  return pathname?pathname[1].toLowerCase():'';
 }
 function alertMessage(text){
  if(typeof window.toast==='function')window.toast(text);
  else console.warn('[SWAPP Suivi]',text);
 }
 async function request(path,method='GET'){
  const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',
   headers:{Accept:'application/json',...(method==='GET'?{}:{'Content-Type':'application/json'})}});
  let data;try{data=await response.json()}catch{data={}}
  if(!response.ok||data.success!==true){
   const error=new Error(data.error||'Le suivi ne répond pas.');
   error.status=response.status;throw error;
  }
  return data;
 }
 function show(button,following){
  button.dataset.swappFollowing=following?'true':'false';
  button.setAttribute('aria-pressed',String(following));
  button.textContent=following?'✓ Suivi':'Suivre';
  button.title=following?'Ne plus suivre cette chaîne (gratuit)':'Suivre cette chaîne gratuitement';
  button.setAttribute('aria-label',button.title);
 }
 function attach(button,page){
  if(button.dataset.swappFollowBound==='true')return;
  const login=loginFor(page);
  if(!login)return;
  button.dataset.swappFollowBound='true';
  button.classList.add('swapp-channel-follow-btn');
  button.type='button';
  // Remove the original always-POST inline handler to prevent double requests.
  button.removeAttribute('onclick');
  const path='/api/oryon/follow/'+encodeURIComponent(login);
  let following=false,authenticated=false,busy=false;
  button.disabled=true;
  button.textContent='Suivi…';
  button.setAttribute('aria-busy','true');
  request(path).then(result=>{
   if(!button.isConnected)return;
   authenticated=result.authenticated===true;
   following=result.following===true;
   show(button,following);
   button.disabled=false;
  }).catch(()=>{
   if(!button.isConnected)return;
   button.textContent='Suivi indisponible';
   button.title='Impossible de vérifier le suivi pour le moment';
   button.disabled=true;
  }).finally(()=>button.removeAttribute('aria-busy'));
  button.addEventListener('click',async()=>{
   if(busy||button.disabled)return;
   if(!authenticated){
    if(typeof window.setView==='function')window.setView('settings');
    else location.href='/compte';
    return;
   }
   busy=true;button.disabled=true;button.setAttribute('aria-busy','true');
   try{
    const next=await request(path,following?'DELETE':'POST');
    if(!button.isConnected)return;
    following=following?false:(next.is_following===true||Array.isArray(next.following)&&next.following.includes(login));
    show(button,following);
   }catch(error){
    if(error.status===401){authenticated=false;alertMessage('Reconnecte-toi à SWAPP pour suivre cette chaîne.')}
    else alertMessage(error.message||'Suivi temporairement indisponible.');
   }finally{
    busy=false;
    if(button.isConnected){button.disabled=false;button.removeAttribute('aria-busy')}
   }
  });
 }
 function scan(){
  if(!root.classList.contains('active'))return;
  for(const page of root.querySelectorAll('.creatorRefine')){
   const button=page.querySelector('.channelActionDock button[onclick*="followOryon"],.swapp-channel-follow-btn');
   if(button)attach(button,page);
  }
 }
 let queued=false;
 function schedule(){
  if(queued)return;queued=true;
  requestAnimationFrame(()=>{queued=false;scan()});
 }
 new MutationObserver(schedule).observe(root,{childList:true,subtree:true});
 schedule();
})();
