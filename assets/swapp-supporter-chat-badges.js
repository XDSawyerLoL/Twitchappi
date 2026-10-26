/* SWAPP verified supporter badges for authors already visible in the public chat.
 * No client-side assertion of subscriber status; backend entitlements only.
 */
(function(){
 'use strict';
 const root=document.getElementById('channel');
 if(!root)return;
 const NAME=/^[a-z0-9_-]{2,48}$/i;
 const state={room:'',badges:{},lastCheck:0,checking:false};
 function room(){
  const profile=typeof window.state!=='undefined'?window.state.channelProfile:null;
  const page=root.querySelector('.creatorRefine');
  const candidate=String(profile?.login||page?.dataset?.channelLogin||'').trim().toLowerCase();
  if(NAME.test(candidate))return candidate;
  const m=location.pathname.match(/^\/(?:c\/)?([a-z0-9_-]{2,48})\/?$/i);
  return m?m[1].toLowerCase():'';
 }
 function decorate(){
  if(!root.classList.contains('active'))return;
  for(const message of root.querySelectorAll('.nativeFixedChat[data-chat="oryon"] .chatLog .msg')){
   const name=message.querySelector('.chatNameLine b')||message.querySelector('b');
   if(!name)continue;
   const login=String(name.textContent||'').trim().replace(/^@/,'').toLowerCase();
   if(!NAME.test(login))continue;
   const active=state.badges[login],existing=message.querySelector('.swapp-supporter-chat-tag');
   if(!active||!['self','gift'].includes(active.kind)){
    if(existing)existing.remove();continue;
   }
   if(existing){existing.dataset.kind=active.kind;continue}
   const badge=document.createElement('span');
   badge.className='swapp-supporter-chat-tag';
   badge.dataset.kind=active.kind;
   badge.textContent=active.kind==='gift'?'✦ Cadeau':'★ Supporter';
   badge.title=active.kind==='gift'?'Abonnement cadeau SWAPP confirmé':'Abonnement SWAPP actif confirmé';
   name.after(badge);
  }
 }
 async function refresh(){
  const login=room();
  if(!login||!root.classList.contains('active'))return;
  if(login!==state.room){
   state.room=login;state.badges={};state.lastCheck=0;
  }
  decorate();
  if(state.checking||Date.now()-state.lastCheck<20000)return;
  state.checking=true;state.lastCheck=Date.now();
  try{
   const response=await fetch('/api/swapp/subscriptions/chat-badges/'+encodeURIComponent(login),{
    credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
   if(!response.ok)return;
   const payload=await response.json();
   if(payload.success===true&&state.room===login&&payload.badges&&typeof payload.badges==='object'){
    state.badges=payload.badges;decorate();
   }
  }catch{}finally{state.checking=false}
 }
 function addSubscriberGateOption(){
  if(!root.classList.contains('active'))return;
  for(const select of root.querySelectorAll('select[name="gate"],select[name="emoteGate"],select[data-emote-gate]')){
   if(select.querySelector('option[value="subscriber"]'))continue;
   const values=Array.from(select.options).map(o=>o.value);
   if(!values.includes('free')||!values.includes('follow'))continue;
   const option=document.createElement('option');
   option.value='subscriber';option.textContent='Abonnés de la chaîne';
   select.appendChild(option);
  }
 }
 let pending=false;
 function schedule(){
  if(pending)return;pending=true;
  requestAnimationFrame(()=>{
   pending=false;addSubscriberGateOption();void refresh();
  });
 }
 new MutationObserver(schedule).observe(root,{subtree:true,childList:true});
 schedule();
})();
