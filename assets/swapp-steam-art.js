/* Boutique Steam images: canonical image URL from server-side Steam appdetails. */
(()=>{
 'use strict';
 const imgs=[...document.querySelectorAll('.swapp-editorial-game-art img[data-steam-app]')];
 if(!imgs.length)return;
 // Hide known-broken guessed URLs while authoritative artwork is resolved.
 imgs.forEach(img=>{img.hidden=true;img.removeAttribute('src')});
 const safe=url=>{
  try{
   const u=new URL(url);
   return u.protocol==='https:'&&/(^|\.)steamstatic\.com$/.test(u.hostname);
  }catch{return false}
 };
 fetch('/api/boutique/steam-images',{credentials:'same-origin',signal:AbortSignal.timeout(12000)})
 .then(response=>{if(!response.ok)throw Error('images unavailable');return response.json()})
 .then(data=>{
  const mapping=data?.images||{};
  imgs.forEach(img=>{
   const url=mapping[img.dataset.steamApp];
   if(!safe(url))return;
   img.onerror=()=>{img.hidden=true;img.closest('.swapp-editorial-game')?.classList.add('artwork-unavailable')};
   img.onload=()=>{img.hidden=false};
   img.src=url;
  });
 }).catch(()=>{});
})();