/* Related editorial stories inside native SWAPP live watch pages. */
(()=>{'use strict';
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
// Mirror the server's conservative editorial aliases. A sequel is not its predecessor.
const gameAliases=[
 ['Grand Theft Auto VI','GTA 6','GTA6','GTA VI','Grand Theft Auto 6'],
 ['Planet Zoo 2','Planet Zoo II'],
 ['007 First Light','James Bond 007 First Light','007: First Light'],
 ['Assassin’s Creed Black Flag','Assassins Creed IV Black Flag','Assassin’s Creed IV: Black Flag',"Assassin's Creed Black Flag"],
 ['Final Fantasy VII','Final Fantasy 7','FF7'],
 ['MARVEL Tōkon: Fighting Souls','Marvel Tokon Fighting Souls'],
 ['Divinity: Original Sin 3','Divinity Original Sin III'],
 ['Road 96','Road96']
].map(group=>group.map(normalize));
const gameMatch=(a,b)=>{
 a=normalize(a);b=normalize(b);
 return !!(a&&b&&(a===b||gameAliases.some(group=>group.includes(a)&&group.includes(b))));
};
let current='',request=0,queued=false;
async function json(path){
 // AbortSignal.timeout is missing on some iPhone Safari versions.
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  const r=await fetch(path,{credentials:'same-origin',headers:{Accept:'application/json'},signal:controller.signal});
  if(!r.ok)throw Error(String(r.status));
  return await r.json();
 }finally{clearTimeout(timer)}
}
function node(tag,cls,label){const x=document.createElement(tag);x.className=cls||'';if(label!=null)x.textContent=label;return x}
function active(){const match=location.pathname.match(/^\/([a-z0-9_]{2,25})\/?$/i);return match&& !['actus','decouvrir','login','signup','settings','profil','studio','admin','api','live','support'].includes(match[1].toLowerCase())?match[1].toLowerCase():null}
async function mount(){
 const login=active(),host=document.querySelector('.channelPage, .watchShell.channelWatch');
 if(!login||!host){current='';++request;document.querySelector('[data-swapp-live-articles]')?.remove();return}
 const signature=login+'|'+location.pathname;
 if(current===signature && document.querySelector('[data-swapp-live-articles]'))return;
 current=signature;const ticket=++request;
 const existing=document.querySelector('[data-swapp-live-articles]');if(existing)existing.remove();
 const shelf=node('section','swapp-live-articles');shelf.dataset.swappLiveArticles='1';
 shelf.append(node('h2','','Dans l’actualité du jeu'));const statusLine=node('p','swapp-live-articles-status','Recherche du jeu diffusé…'),grid=node('div','swapp-live-articles-grid');shelf.append(statusLine,grid);
 const placement=document.querySelector('.channelPage')||host.parentElement||host;placement.append(shelf);
 try{
  const channel=await json('/api/oryon/channel/'+encodeURIComponent(login)+'/status');
  if(ticket!==request||!shelf.isConnected)return;
  const game=String(channel.live?.category||channel.live?.game_name||'').trim();
  if(!game){statusLine.textContent='Aucun jeu identifié pour ce live actuellement.';return}
  shelf.querySelector('h2').textContent='À lire sur '+game;
  statusLine.textContent='Recherche des articles liés…';
  const data=await json('/api/actus');if(ticket!==request||!shelf.isConnected)return;
  const articles=(Array.isArray(data.articles)?data.articles:[])
   .filter(a=>gameMatch(game,a?.game)&&/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(String(a?.slug||''))&&String(a.title||'').trim())
   .slice(0,3);
  grid.replaceChildren();
  statusLine.textContent=articles.length?'Articles SWAPP consacrés à ce jeu':'Aucun article correspondant parmi les publications actuellement accessibles.';
  for(const a of articles){
   const link=node('a','swapp-live-article-card');link.href='/actus/'+encodeURIComponent(a.slug);
   link.setAttribute('aria-label','Lire sur SWAPP : '+a.title);
   const image=a.image?.url||a.imageUrl;
   if(image)try{
    const u=new URL(image);
    if(u.protocol==='https:'&&!u.username&&!u.password){
     const img=node('img');img.src=u.href;img.alt='';img.loading='lazy';img.decoding='async';
     img.onerror=()=>img.remove();link.append(img);
    }
   }catch{}
   const info=node('span');
   info.append(node('small','swapp-live-article-game','Même jeu · '+game),
    node('strong','',a.title),node('small','',a.summary||'Lire sur SWAPP'));
   link.append(info);grid.append(link);
  }
 }catch{if(ticket===request&&shelf.isConnected)statusLine.textContent='Actualités temporairement indisponibles.'}
}
function schedule(){if(queued)return;queued=true;setTimeout(()=>{queued=false;mount()},250)}
new MutationObserver(schedule).observe(document.body,{childList:true,subtree:false});addEventListener('popstate',schedule);addEventListener('pageshow',schedule);schedule();
})();