/* Boutique-only image recovery: different asset families, not repeated hosts for the same missing file. */
(()=>{
 'use strict';
 const base='https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/';
 const alternate='https://cdn.cloudflare.steamstatic.com/steam/apps/';
 function next(img){
   const id=img.dataset.steamApp;
   if(!/^[0-9]{3,9}$/.test(id||''))return;
   const stage=Number(img.dataset.steamStage||0);
   const candidates=[
     base+id+'/capsule_616x353.jpg',
     alternate+id+'/capsule_616x353.jpg',
     base+id+'/capsule_467x181.jpg',
     alternate+id+'/header.jpg'
   ];
   if(stage>=candidates.length){
     img.hidden=true;
     img.removeAttribute('src');
     img.closest('.swapp-editorial-game')?.classList.add('artwork-unavailable');
     return;
   }
   img.dataset.steamStage=String(stage+1);
   img.src=candidates[stage];
 }
 document.addEventListener('error',event=>{
   const img=event.target;
   if(img instanceof HTMLImageElement&&img.matches('.swapp-editorial-game-art img[data-steam-app]'))next(img);
 },true);
 document.querySelectorAll('.swapp-editorial-game-art img[data-steam-app]').forEach(img=>{
   if(img.complete&&img.naturalWidth===0)next(img);
 });
})();