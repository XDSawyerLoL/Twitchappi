/* Related editorial stories inside native SWAPP live watch pages. */
(()=>{'use strict';
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const gameMatch=(a,b)=>{a=normalize(a);b=normalize(b);return !!(a&&b&&(a===b||(a.length>=7&&b.includes(a))||(b.length>=7&&a.includes(b))))};
let current='',request=0,queued=false;
async function json(path){const r=await fetch(path,{credentials:'same-origin',headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error(String(r.status));return r.json()}
function node(tag,cls,label){const x=document.createElement(tag);x.className=cls||'';if(label!=null)x.textContent=label;return x}
function active(){const match=location.pathname.match(/^\/([a-z0-9_]{2,25})\/?$/i);return match&& !['actus','decouvrir','login','signup','settings','profil','studio','admin','api','live','support'].includes(match[1].toLowerCase())?match[1].toLowerCase():null}
async function mount(){
 const login=active(),host=document.querySelector('.channelPage, .watchShell.channelWatch');
 if(!login||!host){current='';return}
 const signature=login+'|'+location.pathname;
 if(current===signature && document.querySelector('[data-swapp-live-articles]'))return;
 current=signature;const ticket=++request;
 const existing=document.querySelector('[data-swapp-live-articles]');if(existing)existing.remove();
 const shelf=node('section','swapp-live-articles');shelf.dataset.swappLiveArticles='1';
 shelf.append(node('h2','','Dans l’actualité du jeu'));const status=node('p','swapp-live-articles-status','Recherche du jeu diffusé…'),grid=node('div','swapp-live-articles-grid');shelf.append(status,grid);
 const placement=document.querySelector('.channelPage')||host.parentElement||host;placement.append(shelf);
 try{
  const live=await json('/api/discovery/home-lives?limit=40&lang=fr');if(ticket!==request||!shelf.isConnected)return;
  const streamer=(live.items||[]).find(x=>String(x.login||'').toLowerCase()===login&&['swapp','oryon'].includes(String(x.platform||'').toLowerCase()));
  const game=String(streamer?.game_name||streamer?.game||'').trim();if(!game){status.textContent='Aucun jeu vérifiable pour ce live actuellement.';return}
  shelf.querySelector('h2').textContent='À lire sur '+game;status.textContent='Recherche des articles liés…';
  const data=await json('/api/actus');if(ticket!==request||!shelf.isConnected)return;
  const articles=(data.articles||[]).filter(a=>gameMatch(game,a.game)&&/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(String(a.slug||''))).slice(0,3);
  grid.replaceChildren();status.textContent=articles.length?'Articles SWAPP consacrés à ce jeu':'Aucun article associé à ce jeu pour le moment.';
  for(const a of articles){const link=node('a','swapp-live-article-card');link.href='/actus/'+encodeURIComponent(a.slug);const image=a.image?.url||a.imageUrl;if(image){try{const u=new URL(image);if(u.protocol==='https:'){const img=node('img');img.src=u.href;img.alt='';img.loading='lazy';img.onerror=()=>img.remove();link.append(img)}}catch{}}const info=node('span');info.append(node('strong','',a.title),node('small','',a.summary||'Lire sur SWAPP'));link.append(info);grid.append(link)}
 }catch{if(ticket===request&&shelf.isConnected)status.textContent='Actualités temporairement indisponibles.'}
}
function schedule(){if(queued)return;queued=true;setTimeout(()=>{queued=false;mount()},250)}
new MutationObserver(schedule).observe(document.body,{childList:true,subtree:false});addEventListener('popstate',schedule);addEventListener('pageshow',schedule);schedule();
})();