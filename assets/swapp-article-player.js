'use strict';
/* Explicit, removable Twitch miniplayer for SWAPP articles.
 * Creates no third-party iframe or network request until the visitor clicks.
 * Native SWAPP streams retain their direct channel navigation.
 */
(function(root,factory){
 const api=factory(root);
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.SwappArticlePlayer=api;
})(typeof window!=='undefined'?window:null,function(root){
 const validLogin=value=>/^[a-z0-9_]{2,25}$/i.test(String(value||''));
 function playerUrl(login,hostname){
  if(!validLogin(login)||!hostname||!/^[a-z0-9.-]+$/i.test(hostname))return null;
  const url=new URL('https://player.twitch.tv/');
  url.searchParams.set('channel',String(login).toLowerCase());
  url.searchParams.set('parent',hostname);
  url.searchParams.set('autoplay','true');
  url.searchParams.set('muted','true');
  return url.href;
 }
 // Twitch requires at least 400x300 pixels; narrow screens use the full player.
 function canEmbed(width,height){
  return Number(width)>=430&&Number(height)>=500;
 }
 let panel=null,article=null,opener=null;
 function close(restoreFocus=true){
  if(!panel)return;
  panel.remove();
  panel=null;article=null;
  const source=opener;opener=null;
  if(restoreFocus&&source?.isConnected)source.focus?.({preventScroll:true});
 }
 function open({login,name,game,source}={}){
  if(!root||!root.document||!validLogin(login))return false;
  if(!canEmbed(root.innerWidth,root.innerHeight))return false;
  const current=root.document.querySelector('#actus.view.active .swapp-actus-reading');
  if(!current)return false;
  const url=playerUrl(login,root.location.hostname);
  if(!url)return false;
  close(false);
  article=current;
  opener=source||null;
  const d=root.document;
  const shell=d.createElement('aside');
  shell.className='swapp-article-mini-player';
  shell.setAttribute('role','region');
  shell.setAttribute('aria-label','Mini-lecteur du direct');
  const head=d.createElement('div');
  head.className='swapp-article-mini-head';
  const copy=d.createElement('div');
  copy.className='swapp-article-mini-copy';
  const eyebrow=d.createElement('small');
  eyebrow.textContent='EN DIRECT · TWITCH';
  const title=d.createElement('strong');
  title.textContent=String(name||login).slice(0,65);
  title.title=String(game||'');
  copy.append(eyebrow,title);
  const actions=d.createElement('div');
  actions.className='swapp-article-mini-actions';
  const link=d.createElement('a');
  link.href='/live/twitch/'+encodeURIComponent(String(login).toLowerCase());
  link.target='_blank';
  link.rel='noopener noreferrer';
  link.textContent='Ouvrir le live ↗';
  link.setAttribute('aria-label','Ouvrir le direct complet de '+String(name||login));
  const button=d.createElement('button');
  button.type='button';
  button.textContent='×';
  button.setAttribute('aria-label','Fermer le mini-lecteur');
  button.onclick=()=>close(true);
  actions.append(link,button);
  head.append(copy,actions);
  const video=d.createElement('div');
  video.className='swapp-article-mini-video';
  const frame=d.createElement('iframe');
  frame.src=url;
  frame.title='Live Twitch de '+String(name||login);
  frame.allow='autoplay; fullscreen; picture-in-picture';
  frame.allowFullscreen=true;
  frame.referrerPolicy='strict-origin-when-cross-origin';
  video.append(frame);
  shell.append(head,video);
  d.body.append(shell);
  panel=shell;
  // Keep the user's scroll position; Esc/Close returns focus to the source button.
  button.focus?.({preventScroll:true});
  // A deliberate opening has priority over any previous embed. Sound starts muted.
  return true;
 }
 if(root?.addEventListener){
  root.addEventListener('popstate',()=>close(false));
  root.addEventListener('pagehide',()=>close(false));
  root.addEventListener('resize',()=>{if(panel&&!canEmbed(root.innerWidth,root.innerHeight))close(false)});
  root.addEventListener('keydown',event=>{if(event.key==='Escape'&&panel){event.preventDefault?.();close(true)}});
  const boot=()=>{
   const target=root.document?.getElementById('actus');
   if(!target||typeof MutationObserver==='undefined')return;
   new MutationObserver(()=>{
    if(panel&&(!article?.isConnected||!target.classList.contains('active')))close(false);
   }).observe(target,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  };
  if(root.document?.readyState==='loading')root.document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
 }
 return Object.freeze({open,close,playerUrl,validLogin,canEmbed});
});
