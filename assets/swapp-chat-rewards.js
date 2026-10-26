/* SWAPP first-party chat loyalty: real channel-local points, not Twitch Bits. */
(function(){
 'use strict';
 const root=document.getElementById('channel');if(!root)return;
 const $=(q,p=root)=>p.querySelector(q);
 const el=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=String(value);return n};
 const valid=s=>/^[a-z0-9_][a-z0-9_-]{1,39}$/.test(String(s||''));
 let current='',lastBalance=0,busy=false,seq=0,drawer=null,amount=null,trigger=null;
 const defaultRewards=[
  {id:'cheer',label:'Lancer une ovation',cost:75,requires_message:false},
  {id:'highlight',label:'Mettre un message en valeur',cost:150,requires_message:true},
  {id:'question',label:'Poser une question à la communauté',cost:250,requires_message:true}
 ];
 const rewardLabels=Object.fromEntries(defaultRewards.map(x=>[x.id,x.label]));
 function room(){
  try{const s=typeof state!=='undefined'?state:null;
   const name=String(s?.channelProfile?.login||s?.lastChannelLogin||s?.watchRoom||s?.room||'').trim().toLowerCase();
   return valid(name)?name:''}catch(_){return ''}
 }
 function session(){
  try{return typeof state!=='undefined'?state?.session?.local:null}catch(_){return null}
 }
 function socket(){
  try{return typeof state!=='undefined'?state?.socket:null}catch(_){return null}
 }
 async function request(url,body){
  const response=await fetch(url,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',
   headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.success!==true)throw Error(data.error||'Points indisponibles.');
  return data;
 }
 function close(){if(drawer){drawer.hidden=true;trigger?.setAttribute('aria-expanded','false')}}
 function status(text){const n=drawer?.querySelector('[data-rewards-status]');if(n)n.textContent=text}
 async function balance(force=false){
  const name=room(),user=session();
  if(!name||!user||!amount)return;
  if(!force&&Date.now()-lastBalance<20000&&name===current)return;
  const id=++seq;current=name;lastBalance=Date.now();
  try{
   const data=await request('/api/swapp/channel-points/'+encodeURIComponent(name));
   if(id!==seq||room()!==name||!amount.isConnected)return;
   amount.textContent=Number(data.points||0).toLocaleString('fr-FR')+' pts de chaîne';
   amount.dataset.points=String(Number(data.points||0));
   const items=Array.isArray(data.rewards)?data.rewards:defaultRewards;
   if(drawer&&!drawer.hidden)render(items);
  }catch(_){if(id===seq&&amount?.isConnected)amount.textContent='Pts de chaîne indisponibles'}
 }
 function render(rewards=defaultRewards){
  if(!drawer)return;
  const list=drawer.querySelector('[data-rewards-list]');
  list.replaceChildren();
  const known=defaultRewards.filter(x=>rewards.some(r=>r.id===x.id&&r.cost===x.cost));
  for(const reward of known){
   const card=el('div','swapp-rewards-item');
   const description=el('div','swapp-rewards-info');
   description.append(el('strong','',reward.label),el('small','',reward.cost+' pts de chaîne'));
   const button=el('button','','Utiliser');
   button.type='button';button.disabled=busy;button.dataset.reward=reward.id;
   card.append(description,button);
   if(reward.requires_message){
    const input=el('input','');
    input.maxLength=140;input.placeholder=reward.id==='question'?'Ta question (140 caractères max)':'Ton message (140 caractères max)';
    input.setAttribute('aria-label','Texte pour '+reward.label);
    card.append(input);
   }
   list.append(card);
  }
  if(!known.length)status('Aucune récompense disponible.');
 }
 async function redeem(button){
  if(busy||!session()||!socket()?.connected||!valid(room())){status('Connecte-toi au tchat pour échanger tes points.');return}
  const item=button.closest('.swapp-rewards-item'),message=item?.querySelector('input')?.value.trim()||'';
  const reward=button.dataset.reward;
  if(!defaultRewards.some(r=>r.id===reward))return;
  if(reward!=='cheer'&&message.length<2){status('Écris un message de 2 caractères minimum.');return}
  if(!window.confirm('Dépenser '+defaultRewards.find(r=>r.id===reward).cost+' pts de chaîne pour '+rewardLabels[reward]+' ?'))return;
  busy=true;
  const buttons=drawer.querySelectorAll('button[data-reward]');
  buttons.forEach(b=>b.disabled=true);
  status('Dépense en cours…');
  try{
   const name=room();
   const result=await request('/api/swapp/channel-rewards/'+encodeURIComponent(name),{
    reward,message,request_id:crypto.randomUUID()
   });
   if(room()!==name)return;
   amount.textContent=Number(result.points).toLocaleString('fr-FR')+' pts de chaîne';
   amount.dataset.points=String(result.points);lastBalance=Date.now();
   status('Récompense activée dans le tchat.');
   if(item?.querySelector('input'))item.querySelector('input').value='';
   setTimeout(close,1100);
  }catch(error){status(error.message||'Impossible de dépenser les points.')}
  finally{busy=false;buttons.forEach(b=>{if(b.isConnected)b.disabled=false})}
 }
 function mount(){
  if(!root.classList.contains('active'))return;
  const pane=$('.nativeFixedChat[data-chat="oryon"]'),form=pane?.querySelector('.chatForm');
  const name=room();
  if(!pane||!form||!valid(name))return;
  if(pane.querySelector('[data-swapp-rewards-root]'))return;
  const container=el('div','swapp-rewards-anchor');container.dataset.swappRewardsRoot='1';
  trigger=el('button','swapp-rewards-trigger','Échanger');
  trigger.type='button';trigger.setAttribute('aria-label','Mes points de chaîne et récompenses');
  trigger.setAttribute('aria-expanded','false');
  amount=el('span','swapp-rewards-balance',session()?'… pts de chaîne':'Mes pts de chaîne');
  const caption=el('span','swapp-rewards-hint','Échanger');
  trigger.replaceChildren(amount,caption);
  drawer=el('section','swapp-rewards-drawer');drawer.hidden=true;
  drawer.setAttribute('aria-label','Dépenser mes pts de chaîne');
  const top=el('div','swapp-rewards-top');
  top.append(el('strong','','Mes pts de chaîne'));
  const quit=el('button','','×');quit.type='button';quit.setAttribute('aria-label','Fermer les récompenses');
  quit.addEventListener('click',close);top.append(quit);
  const info=el('p','', 'Gagne des pts de chaîne en regardant le direct et utilise-les pour réagir, poser une question ou mettre un message en avant.');
  const list=el('div','');list.dataset.rewardsList='1';
  const notice=el('p','swapp-rewards-status','');notice.dataset.rewardsStatus='1';
  notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
  drawer.append(top,info,list,notice);render(defaultRewards);
  drawer.addEventListener('click',event=>{
   const button=event.target.closest('button[data-reward]');
   if(button)void redeem(button);
  });
  trigger.addEventListener('click',()=>{
   drawer.hidden=!drawer.hidden;
   trigger.setAttribute('aria-expanded',String(!drawer.hidden));
   if(!drawer.hidden){render(defaultRewards);void balance(true)}
  });
  container.append(trigger,drawer);
  // Rewards belong to the quick-actions line, not an absolute overlay
  // competing with the chat input and overflowing at desktop/mobile widths.
  const assist=pane.querySelector('.chatAssist');
  (assist||form).append(container);
  void balance(true);
 }
 const seen=new WeakSet();
 function notice(item){
  if(!item||item.room!==room()||!rewardLabels[item.reward]||!valid(item.user))return;
  const log=$('.nativeFixedChat[data-chat="oryon"] .chatLog');
  if(!log)return;
  const line=el('div','swapp-redeemed-message');
  const caption=item.user_display||item.user;
  line.append(el('strong','',caption+' · '+rewardLabels[item.reward]));
  if(item.message)line.append(el('span','',String(item.message).slice(0,140)));
  const nearBottom=log.scrollHeight-log.scrollTop-log.clientHeight<140;
  log.appendChild(line);
  const notices=log.querySelectorAll('.swapp-redeemed-message');
  if(notices.length>15)notices[0].remove();
  if(nearBottom)log.scrollTop=log.scrollHeight;
  // A redemption event is not a public chat message and does not persist in chat history.
 }
 function wire(){
  const s=socket();
  if(!s||seen.has(s))return;
  seen.add(s);
  s.on('swapp:channel:redeemed',notice);
  s.on('swapp:channel:points',data=>{if(data?.room===room())void balance(true)});
 }
 let scheduled=false;
 function tick(){
  wire();
  if(!root.classList.contains('active')){close();return}
  if(scheduled)return;scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;mount()});
 }
 new MutationObserver(tick).observe(root,{childList:true,subtree:false});
 window.addEventListener('popstate',tick);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){void balance(true);tick()}});
 setInterval(()=>{tick();if(root.classList.contains('active'))void balance()},15000);
 tick();
})();
