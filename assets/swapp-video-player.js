/* SWAPP video viewer: external players load only after explicit click.
 * The SWAPP player must NEVER embed a Fourthwall web page: those pages
 * reject third-party frames. Only publisher-hosted YouTube videos are playable.
 */
(()=>{'use strict';
 if(window.SwappVideoViewer)return;
 let dialog=null,previousFocus=null,previousOverflow=null;
 function validSource(raw){
  try{
   const url=new URL(String(raw),location.origin);
   return url.protocol==='https:'&&url.hostname==='justplayer.fr'&&
    /^\/supporters\/video_embeds\/[a-z0-9-]+\/?$/.test(url.pathname)?url.href:null;
  }catch{return null}
 }
 function close(){
  if(!dialog)return;
  dialog.remove();dialog=null;
  // Restore the page's exact pre-player inline overflow instead of erasing
  // a lock that may already belong to another page component.
  if(previousOverflow){
   if(previousOverflow.value)document.body.style.setProperty('overflow',previousOverflow.value,previousOverflow.priority);
   else document.body.style.removeProperty('overflow');
   previousOverflow=null;
  }
  try{if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true})}catch(_){}
  previousFocus=null;
 }
 function open(trigger){
  const title=String(trigger.dataset.videoTitle||'Vidéo SWAPP').slice(0,180);
  const source=validSource(trigger.dataset.videoSource);
  const youtube=/^[A-Za-z0-9_-]{11}$/.test(trigger.dataset.videoYoutube||'')?trigger.dataset.videoYoutube:null;
  if(!youtube){
   // Legacy cards can survive in browser cache. Do not open a broken iframe.
   if(source)window.open(source,'_blank','noopener,noreferrer');
   return;
  }
  close();previousFocus=trigger;
  const el=(tag,cls,text)=>{
   const n=document.createElement(tag);
   if(cls)n.className=cls;
   if(text!==undefined)n.textContent=String(text);
   return n;
  };
  dialog=el('div','swapp-video-backdrop');
  dialog.setAttribute('role','dialog');
  dialog.setAttribute('aria-modal','true');
  dialog.setAttribute('aria-label','Lecteur vidéo : '+title);
  const panel=el('div','swapp-video-dialog');
  const heading=el('div','swapp-video-dialog-head');
  const titleNode=el('strong','',title);
  const dismiss=el('button','swapp-video-close','×');dismiss.type='button';dismiss.setAttribute('aria-label','Fermer le lecteur');
  dismiss.addEventListener('click',close);
  heading.append(titleNode,dismiss);
  const stage=el('div','swapp-video-stage');
  const frame=el('iframe');
  frame.title=title;
  frame.loading='eager';
  frame.referrerPolicy='strict-origin-when-cross-origin';
  frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';
  frame.allowFullscreen=true;
  frame.src='https://www.youtube-nocookie.com/embed/'+youtube+'?autoplay=1&rel=0&playsinline=1';
  stage.append(frame);
  const bottom=el('div','swapp-video-stage-fallback');
  bottom.append(el('span','',
   'Si le lecteur est désactivé par l’éditeur, ouvre la bande-annonce sur YouTube.'));
  const watch=el('a','','Regarder sur YouTube ↗');
  watch.href='https://www.youtube.com/watch?v='+youtube;
  watch.target='_blank';watch.rel='noopener noreferrer';
  bottom.append(watch);
  if(source){
   const link=el('a','','Voir la publication originale ↗');
   link.href=source;link.target='_blank';link.rel='noopener noreferrer';
   bottom.append(link);
  }
  panel.append(heading,stage,bottom);
  dialog.append(panel);
  dialog.addEventListener('click',e=>{if(e.target===dialog)close()});
  previousOverflow={
   value:document.body.style.getPropertyValue('overflow'),
   priority:document.body.style.getPropertyPriority('overflow')
  };
  document.body.append(dialog);
  document.body.style.setProperty('overflow','hidden');
  dismiss.focus({preventScroll:true});
 }
 document.addEventListener('click',event=>{
  const trigger=event.target.closest?.('[data-swapp-video-play]');
  if(!trigger)return;
  event.preventDefault();open(trigger);
 });
 // Keep keyboard focus inside the video while the dialog is open.
 document.addEventListener('keydown',e=>{
  if(!dialog)return;
  if(e.key==='Escape'){e.preventDefault();close();return}
  if(e.key!=='Tab')return;
  const focusable=[...dialog.querySelectorAll('button:not([disabled]),a[href]')].filter(node=>!node.hidden);
  if(!focusable.length){e.preventDefault();return}
  const first=focusable[0],last=focusable[focusable.length-1],active=document.activeElement;
  if(e.shiftKey&&(active===first||!dialog.contains(active))){e.preventDefault();last.focus()}
  else if(!e.shiftKey&&(active===last||!dialog.contains(active))){e.preventDefault();first.focus()}
 });
 window.addEventListener('popstate',close);
 window.addEventListener('pagehide',close);
 window.SwappVideoViewer=Object.freeze({close,open});
})();
