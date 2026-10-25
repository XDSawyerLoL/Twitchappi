/* SWAPP opt-in live alert bell. Entirely separate from paid creator subs.
 * Only a confirmed Push subscription plus server preference shows "enabled". */
(function(){
 'use strict';
 const root=document.getElementById('channel');
 if(!root)return;
 const LOGIN=/^[a-z0-9_-]{2,48}$/i;
 function notice(text){if(typeof window.toast==='function')window.toast(text);else console.info('[SWAPP]',text)}
 function creator(page){
  const profile=typeof state!=='undefined'?state.channelProfile:null;
  const name=String(profile?.login||page.dataset.channelLogin||'').toLowerCase();
  if(LOGIN.test(name))return name;
  const match=location.pathname.match(/^\/(?:c\/)?([a-z0-9_-]{2,48})\/?$/i);
  return match?match[1].toLowerCase():'';
 }
 async function request(url,method='GET',body){
  const response=await fetch(url,{method,credentials:'same-origin',cache:'no-store',
   headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  let data={};try{data=await response.json()}catch{}
  if(!response.ok||data.success!==true){
   const e=new Error(data.error||'Service indisponible');e.status=response.status;throw e;
  }
  return data;
 }
 function supported(){
  return typeof Notification!=='undefined'&&'serviceWorker' in navigator&&
   'PushManager' in window&&window.isSecureContext===true;
 }
 function show(button,enabled){
  button.dataset.swappAlertEnabled=String(enabled);
  button.setAttribute('aria-pressed',String(enabled));
  button.textContent=enabled?'🔔':'♧';
  button.setAttribute('aria-label',enabled?'Désactiver les alertes de mise en direct':'Activer les alertes de mise en direct');
  button.title=enabled?'Alertes activées — cliquer pour désactiver':'M’avertir quand ce streamer démarre un direct';
 }
 function attach(page,follow){
  if(page.querySelector('.swapp-live-alert-bell'))return;
  const login=creator(page);
  if(!login)return;
  const button=document.createElement('button');
  button.type='button';
  button.className='btn secondary swapp-live-alert-bell';
  button.hidden=true;button.disabled=true;
  button.setAttribute('aria-label','Notifications de direct');
  follow.after(button);
  let enabled=false,authenticated=false,following=false,available=false,key='',busy=false;
  const sync=async()=>{
   try{
    const [config,status]=await Promise.all([
      request('/api/swapp/live-alerts/config'),
      request('/api/swapp/live-alerts/status?creator='+encodeURIComponent(login))
    ]);
    if(!button.isConnected)return;
    available=config.available===true;
    key=String(config.public_key||'');
    authenticated=status.authenticated===true;
    following=status.following===true;
    enabled=status.enabled===true;
    if(!available){button.hidden=true;return}
    button.hidden=false;
    show(button,enabled);
    const compatible=supported();
    button.disabled=!compatible;
    if(!compatible)button.title='Notifications système non disponibles ici. Sur iPhone, ajoute SWAPP à l’écran d’accueil.';
   }catch{
    if(button.isConnected)button.hidden=true;
   }
  };
  void sync();
  button.addEventListener('click',async()=>{
   if(busy||!available||button.disabled)return;
   if(!authenticated){
    if(typeof window.setView==='function')window.setView('settings');
    else location.href='/compte';
    return;
   }
   if(!following){
    notice('Suis d’abord cette chaîne gratuitement pour activer les alertes.');
    return;
   }
   busy=true;button.disabled=true;button.setAttribute('aria-busy','true');
   try{
    if(enabled){
     const result=await request('/api/swapp/live-alerts/disable','POST',{creator:login});
     if(result.enabled===false){enabled=false;show(button,false);notice('Alertes désactivées.')}
    }else{
     // Called directly from a real click: browser permission is NOT requested
     // on page load, after a timer, or as a side effect of following someone.
     const permission=await Notification.requestPermission();
     if(permission!=='granted'){notice('Notifications refusées dans le navigateur.');return}
     const registration=await navigator.serviceWorker.register('/swapp-live-sw.js',{scope:'/'});
     const ready=await navigator.serviceWorker.ready;
     const old=await ready.pushManager.getSubscription();
     const subscription=old||await ready.pushManager.subscribe({
      userVisibleOnly:true,applicationServerKey:key
     });
     const result=await request('/api/swapp/live-alerts/enable','POST',
      {creator:login,subscription:subscription.toJSON()});
     if(result.enabled===true){enabled=true;show(button,true);notice('Alertes de direct activées.')}
    }
   }catch(error){notice(error.message||'Impossible de modifier les alertes.')}
   finally{busy=false;if(button.isConnected){button.disabled=false;button.removeAttribute('aria-busy')}}
  });
  // Server remains authoritative after the free Follow/Unfollow button changes.
  const watcher=new MutationObserver(()=>{
   if(!button.isConnected){watcher.disconnect();return}
   void sync();
  });
  watcher.observe(follow,{attributes:true,attributeFilter:['aria-pressed']});
 }
 function scan(){
  if(!root.classList.contains('active'))return;
  for(const page of root.querySelectorAll('.creatorRefine')){
   const follow=page.querySelector('.channelActionDock .swapp-channel-follow-btn');
   if(follow)attach(page,follow);
  }
 }
 let pending=false;
 new MutationObserver(()=>{
  if(pending)return;pending=true;
  requestAnimationFrame(()=>{pending=false;scan()});
 }).observe(root,{subtree:true,childList:true});
 scan();
})();
