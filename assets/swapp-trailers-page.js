/* Only verified article YouTube URLs become native SWAPP trailer entries.
 * No YouTube connection, thumbnail request or iframe until the visitor clicks.
 */
(()=>{'use strict';
 async function start(){
  const host=document.getElementById('swappTrailersNative');
  const grid=document.getElementById('swappTrailersNativeGrid');
  const extras=window.SwappArticleExtras;
  if(!host||!grid||!extras)return;
  try{
   const res=await fetch('/api/actus',{credentials:'same-origin',headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});
   if(!res.ok)throw Error('unavailable');
   const data=await res.json();
   if(!Array.isArray(data.articles))return;
   const seen=new Set();
   for(const a of data.articles){
    const id=extras.trailerId(a?.trailerUrl);
    const slug=String(a?.slug||'');
    if(!id||seen.has(id)||!/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(slug))continue;
    seen.add(id);
    const card=document.createElement('article');card.className='swapp-hub-tile';
    const art=document.createElement('div');art.className='swapp-trailer-card-art';
    const button=document.createElement('button');button.className='swapp-trailer-launch';button.type='button';
    button.dataset.swappTrailerId=id;
    button.textContent='▶ Lire la bande-annonce';
    art.append(button);
    const body=document.createElement('div');body.className='swapp-hub-tile-copy';
    const title=document.createElement('h3');title.textContent=String(a.title||'Bande-annonce SWAPP').slice(0,180);
    const game=document.createElement('p');game.textContent=a.game||'Sélection SWAPP';
    const link=document.createElement('a');link.className='swapp-hub-link';link.href='/actus/'+encodeURIComponent(slug);
    link.textContent='Lire l’article associé →';
    body.append(title,game,link);
    card.append(art,body);grid.append(card);
    if(seen.size>=12)break;
   }
   host.hidden=!grid.children.length;
  }catch(_){host.hidden=true}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
