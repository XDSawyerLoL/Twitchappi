/* All SWAPP native pages share the SAME user's global accent choice as the SPA.
 * The home page stores it under oryon_viewer_accent. Never mutate storage here.
 * The reader's brand colors and partner purchase actions remain unchanged.
 */
(()=>{
 'use strict';
 const KEY='oryon_viewer_accent';
 const DEFAULT='#22d3ee';
 const valid=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
 const root=document.documentElement;
 const apply=()=>{
  let chosen=DEFAULT;
  try{
   const stored=localStorage.getItem(KEY);
   if(valid(stored))chosen=stored;
  }catch(_){}
  root.style.setProperty('--swapp-light-accent',chosen);
  root.style.setProperty('--swapp-side-light',chosen);
  root.style.setProperty('--swapp-page-accent',chosen);
  root.classList.add('swapp-editorial-theme');
 };
 // Apply before body paints: the native article does not load the SPA's JS.
 apply();
 window.addEventListener('pageshow',apply,{passive:true});
 window.addEventListener('storage',event=>{
  if(event.key===KEY||event.key===null)apply();
 });
})();