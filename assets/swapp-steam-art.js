/* Shop-only Steam artwork fallback. No external API, no trackers. */
(()=>{
 'use strict';
 const base='https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/';
 function fail(img){
  const id=img.dataset.steamApp;
  if(!/^[0-9]{3,9}$/.test(id||''))return;
  const stage=Number(img.dataset.steamStage||0);
  if(stage===0){
   img.dataset.steamStage='1';
   img.src=base+id+'/library_600x900_2x.jpg';
  }else if(stage===1){
   img.dataset.steamStage='2';
   img.src=base+id+'/header.jpg';
  }else{
   img.dataset.steamStage='3';
   img.removeAttribute('src');
   img.hidden=true;
   img.parentElement?.classList.add('image-unavailable');
  }
 }
 document.addEventListener('error',event=>{
  const img=event.target;
  if(img instanceof HTMLImageElement&&img.matches('.swapp-editorial-game-art img[data-steam-app]'))fail(img);
 },true);
 // Some failed resources may have completed before the module was evaluated.
 document.querySelectorAll('.swapp-editorial-game-art img[data-steam-app]').forEach(img=>{
  if(img.complete&&img.naturalWidth===0)fail(img);
 });
})();