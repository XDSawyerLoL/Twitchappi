/* SWAPP home editorial lane. Native articles appear inside the main experience. */
(() => {
 'use strict';
 let cached=null,loading=null,queued=false;
 const escPath=s=>/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(s);
 async function entries(){
   if(cached)return cached;
   if(!loading)loading=fetch('/api/actus',{credentials:'same-origin',headers:{Accept:'application/json'},signal:AbortSignal.timeout(9000)})
     .then(r=>r.ok?r.json():{articles:[]}).then(d=>{cached=Array.isArray(d.articles)?d.articles:[];return cached;})
     .catch(()=>[]).finally(()=>{loading=null;});
   return loading;
 }
 function mount(){
   const home=document.getElementById('home');
   if(!home || home.querySelector('[data-swapp-home-editorial]'))return;
   const body=home.querySelector('.homeOnlyMain')||home;
   if(!body.children.length)return;
   const section=document.createElement('section');
   section.className='swapp-home-editorial';
   section.dataset.swappHomeEditorial='1';
   const top=document.createElement('div');top.className='swapp-home-editorial-top';
   const title=document.createElement('div');
   title.innerHTML='<small>SWAPP · ACTUS × LIVE</small><h2>L’actu du jeu vidéo, dans la même aventure.</h2><p>Un article à lire, des créateurs à découvrir et le jeu à vivre en direct.</p>';
   const link=document.createElement('a');link.href='/actus';link.textContent='Toutes les actualités →';link.className='swapp-media-button primary';
   top.append(title,link);
   const grid=document.createElement('div');grid.className='swapp-home-story-grid';
   section.append(top,grid);
   body.insertBefore(section,body.firstChild);
   entries().then(data=>{
     if(!section.isConnected)return;
     grid.replaceChildren();
     const valid=data.filter(x=>escPath(String(x.slug||''))).slice(0,3);
     if(!valid.length){
       const p=document.createElement('p');p.className='swapp-home-empty';
       p.textContent='La rédaction prépare ses articles. Retrouve déjà tous les lives et les actualités dans le nouveau média SWAPP.';
       grid.appendChild(p);return;
     }
     for(const item of valid){
       const a=document.createElement('a');a.className='swapp-home-story';a.href='/actus/'+encodeURIComponent(item.slug);
       const tag=document.createElement('span');tag.textContent=item.category||'ACTUS';
       const h=document.createElement('strong');h.textContent=item.title||'Nouvel article';
       const g=document.createElement('small');g.textContent=item.game?'Un jeu, une histoire : '+item.game+' · Lire →':'Lire cet article →';
       a.append(tag,h,g);grid.appendChild(a);
     }
   });
 }
 function queue(){
   if(queued)return;queued=true;
   setTimeout(()=>{queued=false;mount();},160);
 }
 const home=document.getElementById('home');
 if(home){new MutationObserver(queue).observe(home,{childList:true,subtree:false});queue();}
 window.addEventListener('pageshow',queue);
})();
