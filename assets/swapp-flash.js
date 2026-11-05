/* SWAPP FLASH: no tracking or automatic video loading; works on mobile and keyboard. */
(()=>{
 'use strict';
 const root=document.querySelector('[data-sf-root]');
 if(!root||root.dataset.sfReady==='1')return;
 const slides=Array.from(root.querySelectorAll('[data-sf-slide]'));
 const tracks=Array.from(root.querySelectorAll('[data-sf-track]'));
 const prev=root.querySelector('[data-sf-prev]'),next=root.querySelector('[data-sf-next]');
 const count=root.querySelector('[data-sf-count]'),share=root.querySelector('[data-sf-share]');
 const status=root.querySelector('[data-sf-share-status]');
 if(!slides.length||!prev||!next||tracks.length!==slides.length)return;
 root.dataset.sfReady='1';
 let index=0;
 const videoStop=slide=>{const host=slide?.querySelector('[data-sf-video]');const iframe=host?.querySelector('iframe');
  if(iframe){iframe.remove();const button=host.querySelector('[data-sf-video-play]');
   if(button)button.hidden=false;}
 };
 function navigate(position,{focus=false}={}){
  if(!Number.isInteger(position)||position<0||position>=slides.length)return;
  const old=slides[index];if(position!==index)videoStop(old);
  index=position;
  slides.forEach((slide,i)=>{slide.hidden=i!==index;slide.setAttribute('aria-label','Séquence '+(i+1)+' sur '+slides.length)});
  tracks.forEach((track,i)=>{track.classList.toggle('is-current',i===index);
   track.classList.toggle('is-done',i<index)});
  prev.disabled=index===0;next.disabled=index===slides.length-1;
  if(count)count.textContent=(index+1)+' / '+slides.length;
  if(focus)slides[index].focus({preventScroll:true});
 }
 navigate(0);
 prev.addEventListener('click',()=>navigate(index-1,{focus:true}));
 next.addEventListener('click',()=>navigate(index+1,{focus:true}));
 document.addEventListener('keydown',event=>{
  if(event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey)return;
  const el=document.activeElement;
  if(el&&/INPUT|TEXTAREA|SELECT/.test(el.tagName)||el?.isContentEditable)return;
  if(event.key==='ArrowLeft'){event.preventDefault();navigate(index-1,{focus:true})}
  else if(event.key==='ArrowRight'){event.preventDefault();navigate(index+1,{focus:true})}
 });
 let startX=0,startY=0;
 const rail=root.querySelector('[data-sf-slides]');
 rail?.addEventListener('touchstart',event=>{
  if(event.touches.length!==1)return;startX=event.touches[0].clientX;startY=event.touches[0].clientY;
 },{passive:true});
 rail?.addEventListener('touchend',event=>{
  if(event.changedTouches.length!==1)return;
  // Do not treat scrolling, carousel gestures or embedded video touches as navigation.
  const target=event.target;
  if(target?.closest?.('button,a,iframe,input,[data-sf-video]'))return;
  const dx=event.changedTouches[0].clientX-startX,dy=event.changedTouches[0].clientY-startY;
  if(Math.abs(dx)<75||Math.abs(dx)<Math.abs(dy)*1.5)return;
  navigate(index+(dx<0?1:-1),{focus:false});
 },{passive:true});
 root.addEventListener('click',event=>{
  const button=event.target?.closest?.('[data-sf-video-play]');
  if(!button)return;
  const host=button.closest('[data-sf-video]');
  const id=host?.dataset.sfVideo||'';
  if(!/^[a-zA-Z0-9_-]{11}$/.test(id))return;
  const frame=document.createElement('iframe');
  frame.title='Vidéo liée à cet article SWAPP';
  frame.src='https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1&rel=0';
  frame.allow='accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
  frame.referrerPolicy='strict-origin-when-cross-origin';
  frame.allowFullscreen=true;
  button.hidden=true;host.append(frame);
 });
 share?.addEventListener('click',async()=>{
  const payload={title:document.title,text:'Découvrir ce jeu sur SWAPP FLASH',url:location.href};
  try{
   if(typeof navigator.share==='function'){await navigator.share(payload);if(status)status.textContent='Partage ouvert.';return}
  }catch(error){if(error?.name==='AbortError')return}
  try{
   if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(location.href);
    if(status)status.textContent='Lien copié dans le presse-papiers.';return}
  }catch(_){}
  if(status)status.textContent='Copie le lien depuis la barre d’adresse pour partager ce FLASH.';
 });
})();