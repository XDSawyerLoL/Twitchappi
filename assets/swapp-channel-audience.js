/* SWAPP streamer audience + channel-local points, independent of chat rendering. */
(function(){
 'use strict';
 const $=(q,p=document)=>p.querySelector(q);
 const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
 const logged=()=>{
  try{return typeof state!=='undefined'?state.session?.local:null}catch(_){return null}
 };
 const room=()=>{
  try{return String(state.channelProfile?.login||state.lastChannelLogin||state.watchRoom||state.room||'').trim().toLowerCase()}catch(_){return ''}
 };
 const valid=s=>/^[a-z0-9_][a-z0-9_-]{1,39}$/.test(s);
 let lastPulseRoom='',lastPulseOn=false,balanceRoom='',lastBalanceAt=0;
 let lastAudienceAt=0,audienceBusy=false,displayedRoom='';
 async function get(url){
  const response=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
  const result=await response.json().catch(()=>({}));
  if(!response.ok||result.success===false)throw Error(result.error||'Données indisponibles');
  return result;
 }
 // Only a real HTML5 video with decoded dimensions, or a browser WebRTC
 // player which SWAPP has already flagged as displaying decoded frames.
 // A third-party iframe cannot be inspected and earns no points.
 function playback(){
  const panel=$('#channel');
  if(!panel?.classList.contains('active')||document.hidden)return false;
  try{if(state.channelOwner===true||state.view!=='channel')return false}catch(_){return false}
  const videos=Array.from(panel.querySelectorAll('.channelMainPlayer video'));
  // Self-hosted, same-origin HLS may play inside an iframe. Inspect its real
  // video element; cross-origin Twitch/Kick iframes remain uncredited.
  for(const frame of panel.querySelectorAll('.channelMainPlayer iframe')){
   try{if(frame.contentWindow?.location.origin===location.origin)
    videos.push(...frame.contentDocument.querySelectorAll('video'))}catch(_){}
  }
  const html5=videos.some(video=>!!video&&!video.paused&&!video.ended&&!video.seeking&&
   video.readyState>=2&&video.videoWidth>159&&video.currentTime>0);
  let verified=false;try{verified=state.remotePlaying===true}catch(_){}
  return html5||verified;
 }
 function pulse(){
  const user=logged(),name=room();
  let socket=null;try{socket=state.socket}catch(_){}
  const playing=!!user&&!!socket?.connected&&valid(name)&&playback();
  if(!socket?.connected)return;
  if(!playing&&!lastPulseOn)return;
  socket.emit('swapp:channel:watch',{room:playing?name:lastPulseRoom,playing,visible:!document.hidden,player:'html5'});
  lastPulseOn=playing;lastPulseRoom=playing?name:'';
 }
 document.addEventListener('visibilitychange',pulse);
 window.addEventListener('pagehide',()=>{try{if(lastPulseOn&&state.socket?.connected)state.socket.emit('swapp:channel:watch',{room:lastPulseRoom,playing:false,visible:false,player:'html5'});}catch(_){}});
 const sockets=new WeakSet();
 function wire(){
  let s=null;try{s=state.socket}catch(_){}
  if(!s||sockets.has(s))return;
  sockets.add(s);
  s.on('swapp:channel:points',data=>{
   if(data?.room===room()){lastBalanceAt=0;void viewerBalance(true);}
  });
 }
 async function viewerBalance(force=false){
  const channel=$('#channel'),user=logged(),name=room();
  if(!channel?.classList.contains('active')||!user||!valid(name))return;
  let isOwn=false;try{isOwn=state.channelOwner===true}catch(_){}
  if(isOwn)return;
  // Channel points now live in the chat rewards selector. Avoid a redundant dock chip.
  if(channel.querySelector('[data-swapp-rewards-root]')){
   channel.querySelectorAll('[data-swapp-channel-points]').forEach(item=>item.remove());
   return;
  }
  const dock=$('.channelActionDock',channel);
  if(!dock)return;
  let chip=$('[data-swapp-channel-points]',dock);
  if(!chip){chip=node('span','swapp-channel-points-chip','Pts de chaîne : …');
   chip.dataset.swappChannelPoints='1';chip.title='Points propres à cette chaîne, gagnés par visionnage actif';
   dock.appendChild(chip);
  }
  if(!force&&balanceRoom===name&&Date.now()-lastBalanceAt<60000)return;
  balanceRoom=name;lastBalanceAt=Date.now();
  try{
   const result=await get('/api/swapp/channel-points/'+encodeURIComponent(name));
   if(room()===name&&chip.isConnected)chip.textContent='Pts de chaîne : '+result.points.toLocaleString('fr-FR');
  }catch(_){if(chip.isConnected)chip.textContent='Pts de chaîne indisponibles'}
 }
 function managerPanel(){
  const page=$('#manager');
  if(!page?.classList.contains('active')||!logged())return null;
  const main=$('.swapp-creator-main',page);
  if(!main)return null;
  let panel=$('#swapp-channel-audience',page);
  if(panel)return panel;
  panel=node('section','swapp-audience-panel');
  panel.id='swapp-channel-audience';
  const head=node('div','swapp-audience-head');
  const titles=node('div');
  titles.append(node('h2','', 'Communauté de la chaîne'),
   node('p','', 'Comptes SWAPP présents dans ton salon. Les visiteurs anonymes ne sont pas identifiés.'));
  const refresh=node('button','btn secondary','Actualiser');
  refresh.type='button';refresh.addEventListener('click',()=>void refreshAudience(true));
  head.append(titles,refresh);
  panel.append(head,node('p','swapp-audience-summary','Récupération des spectateurs…'),node('div','swapp-audience-list'));
  const loyal=node('section','swapp-audience-loyal');
  loyal.append(node('h3','','Fidèles de la chaîne'),node('div','swapp-audience-leaderboard'));
  panel.appendChild(loyal);
  const note=node('p','swapp-audience-note',
   '5 points par minute de lecture active signalée, maximum 300 points par jour et par chaîne. Les lecteurs externes non vérifiables ne donnent pas de points. Aucune récompense échangeable activée.');
  panel.appendChild(note);main.appendChild(panel);
  return panel;
 }
 function navigation(){
  const nav=document.querySelector('.creatorSide nav[aria-label="Navigation créateur"]');
  if(!nav||nav.querySelector('[data-swapp-audience-link]'))return;
  const link=node('button','','Communauté');
  link.type='button';link.dataset.swappAudienceLink='1';
  link.addEventListener('click',async()=>{
   if(!$('#manager')?.classList.contains('active')){
    try{await Promise.resolve(window.setView?.('manager'))}catch(_){}
   }
   managerPanel();
   setTimeout(()=>$('#swapp-channel-audience')?.scrollIntoView({block:'start',behavior:'smooth'}),90);
   void refreshAudience(true);
  });
  nav.appendChild(link);
 }
 async function refreshAudience(force=false){
  const panel=managerPanel();
  if(!panel)return;
  const user=logged(),name=String(user?.login||'').trim().toLowerCase();
  if(!valid(name)||audienceBusy)return;
  if(!force&&displayedRoom===name&&Date.now()-lastAudienceAt<15000)return;
  audienceBusy=true;lastAudienceAt=Date.now();displayedRoom=name;
  const summary=$('.swapp-audience-summary',panel),list=$('.swapp-audience-list',panel);
  try{
   const stats=await get('/api/swapp/channel-audience/'+encodeURIComponent(name));
   if(!panel.isConnected||!$('#manager').classList.contains('active'))return;
   summary.textContent=(stats.live?'En direct':'Hors ligne')+' · '+stats.connected_accounts+' compte(s) connecté(s) · '+stats.signaled_playback+' lecture(s) signalée(s)';
   list.replaceChildren();
   const header=node('div','swapp-audience-row swapp-audience-thead');
   for(const h of ['Spectateur','Présence','Points'])header.appendChild(node('span','',h));
   list.appendChild(header);
   for(const member of stats.users||[]){
    const row=node('div','swapp-audience-row');
    const identity=node('span','swapp-audience-user');
    identity.append(node('strong','',member.display_name),node('small','', '@'+member.login));
    row.append(identity,node('span',member.watching?'swapp-audience-playing':'',''+(member.watching?'Lecture signalée':'Dans le salon')),
      node('span','swapp-audience-score',Number(member.points||0).toLocaleString('fr-FR')+' pts de chaîne'));
    list.appendChild(row);
   }
   if(!(stats.users||[]).length)list.appendChild(node('p','swapp-audience-empty',
    stats.live?'Aucun compte identifié dans le salon pour le moment.':'Aucun spectateur connecté. La liste est vide hors direct.'));
   const leaderboard=$('.swapp-audience-leaderboard',panel);
   leaderboard.replaceChildren();
   for(const member of stats.leaderboard||[]){
    const row=node('div','swapp-audience-row');
    const who=node('span','swapp-audience-user');
    who.append(node('strong','',member.display_name||member.login),node('small','', '@'+member.login));
    row.append(who,node('span','',Number(member.minutes||0).toLocaleString('fr-FR')+' min cumulées'),
     node('span','swapp-audience-score',Number(member.points||0).toLocaleString('fr-FR')+' pts de chaîne'));
    leaderboard.appendChild(row);
   }
   if(!leaderboard.childElementCount)leaderboard.appendChild(node('p','swapp-audience-empty','Aucun point distribué sur cette chaîne.'));
  }catch(e){summary.textContent=e.message;list.replaceChildren()}
  finally{audienceBusy=false}
 }
 // Only a single timer drives the supplementary UI. It does not replace
 // chat headers, resize the video or traverse every message mutation.
 const tick=()=>{
  wire();navigation();managerPanel();
  if($('#manager')?.classList.contains('active'))void refreshAudience();
  if($('#channel')?.classList.contains('active'))void viewerBalance();
 };
 setInterval(pulse,20000);
 setInterval(tick,2500);
 window.addEventListener('popstate',tick);
 document.addEventListener('DOMContentLoaded',tick,{once:true});
 tick();
})();
