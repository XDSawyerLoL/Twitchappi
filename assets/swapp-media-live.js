/* SWAPP MEDIA: editorial × verified public live discovery. */
(() => {
  'use strict';
  const sheets = [...document.querySelectorAll('[data-swapp-live-shelf]')];
  const related=document.querySelector('[data-articles-for-game]');
  if (!sheets.length && !related) return;
  const text = (el,value) => { el.textContent = String(value ?? ''); };
  const safeImage = value => {try {const url = new URL(value);return url.protocol === 'https:' ? url.href : null;}catch{return null;}};
  const normal = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  // Exact identity (including known editorial aliases). Substring matching
  // incorrectly associates sequels: Hades vs Hades II or Planet Zoo vs Zoo 2.
  const aliases=[
    ['Grand Theft Auto VI','GTA 6','GTA6','GTA VI','Grand Theft Auto 6'],
    ['Planet Zoo 2','Planet Zoo II'],
    ['007 First Light','James Bond 007 First Light','007: First Light'],
    ['Assassin’s Creed Black Flag','Assassins Creed IV Black Flag','Assassin’s Creed IV: Black Flag','Assassin\'s Creed Black Flag'],
    ['Final Fantasy VII','Final Fantasy 7','FF7'],
    ['MARVEL Tōkon: Fighting Souls','Marvel Tokon Fighting Souls'],
    ['Divinity: Original Sin 3','Divinity Original Sin III'],
    ['Road 96','Road96']
  ].map(group=>group.map(normal));
  const gameMatch = (game, liveGame) => {
    const a=normal(game),b=normal(liveGame);
    return !!a&&!!b&&(a===b||aliases.some(group=>group.includes(a)&&group.includes(b)));
  };
  function card(item) {
    const login=String(item.login || '').trim().toLowerCase();
    if(!/^[a-z0-9_]{2,40}$/.test(login)) return null;
    const platform=String(item.platform || '').toLowerCase();
    const isNative=platform==='oryon'||platform==='swapp';
    const el=document.createElement('a');
    el.className='swapp-live-card';
    el.href=isNative ? '/'+encodeURIComponent(login) : '/live/twitch/'+encodeURIComponent(login)+(item.game_name?'?game='+encodeURIComponent(String(item.game_name).slice(0,90)):'');
    const cover=document.createElement('div');cover.className='swapp-live-cover';
    const src=safeImage(item.thumbnail_url);
    if(src){const img=document.createElement('img');img.src=src;img.alt='';img.loading='lazy';cover.appendChild(img);}
    const pill=document.createElement('span');pill.className='swapp-live-badge';text(pill,isNative?'LIVE SWAPP':'LIVE TWITCH');cover.appendChild(pill);
    const body=document.createElement('div');body.className='swapp-live-content';
    const title=document.createElement('strong');text(title,item.title||'Live en cours');body.appendChild(title);
    const meta=document.createElement('p');text(meta,[item.display_name||login,item.game_name||'',Number(item.viewer_count||0).toLocaleString('fr-FR')+' spectateurs'].filter(Boolean).join(' · '));body.appendChild(meta);
    const action=document.createElement('span');action.className='swapp-live-action';text(action,'Regarder sur SWAPP →');body.appendChild(action);
    el.append(cover,body);return el;
  }
  function message(shelf,message,{retry=false}={}){
    const target=shelf.querySelector('[data-live-results], [data-related-results]');if(!target)return;
    target.replaceChildren();
    const p=document.createElement('p');p.className='swapp-live-notice';text(p,message);target.appendChild(p);
    if(retry){
      const button=document.createElement('button');
      button.type='button';
      button.className='swapp-media-button';
      text(button,'Réessayer');
      button.onclick=()=>{
        button.disabled=true;
        message(shelf,'Nouvelle tentative…');
        renderShelf(shelf);
      };
      target.appendChild(button);
    }
  }
  // Request relevant lives from SWAPP's EXISTING server endpoint, not from
  // the first 12 global streams. At most one request per game per page.
  // Delay network work until the shelf enters view (unless IO is unsupported).
  const requests=new Map();
  function gameLives(game){
    const key=normal(game);
    if(!requests.has(key)){
      const url='/api/discovery/game-lives?limit=6&game='+encodeURIComponent(game.slice(0,90));
      requests.set(key,fetch(url,{credentials:'same-origin',headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)})
       .then(async response=>{
         if(!response.ok)throw Error('HTTP '+response.status);
         const payload=await response.json();
         if(!payload.success||!Array.isArray(payload.items)||!gameMatch(payload.game,game))throw Error('invalid_game_results');
         return payload.items.filter(item=>gameMatch(game,item.game_name||item.category||item.game));
       }).catch(error=>{requests.delete(key);throw error;}));
    }
    return requests.get(key);
  }
  let generalPromise;
  async function generalLives(){
    if(!generalPromise){
      generalPromise=fetch('/api/discovery/home-lives?limit=12&lang=fr',{
        credentials:'same-origin',headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)
      }).then(async response=>{
        if(!response.ok)throw Error('HTTP '+response.status);
        const result=await response.json();
        if(!result.success||!Array.isArray(result.items))throw Error('unavailable');
        return result.items;
      }).catch(error=>{generalPromise=null;throw error;});
    }
    return generalPromise;
  }
  function validUnique(items,limit){
    const seen=new Set(),out=[];
    for(const item of items){
      if(!item||typeof item!=='object')continue;
      const key=String(item.platform||'').toLowerCase()+':'+String(item.login||'').trim().toLowerCase();
      if(seen.has(key))continue;
      const node=card(item);
      if(!node)continue;
      seen.add(key);out.push(node);
      if(out.length>=limit)break;
    }
    return out;
  }
  async function renderShelf(shelf){
    const game=String(shelf.dataset.game||'').trim().slice(0,90);
    const target=shelf.querySelector('[data-live-results]');
    if(!target)return;
    try{
      const data=game?await gameLives(game):await generalLives();
      if(!shelf.isConnected)return;
      const cards=validUnique(data,game?4:6);
      if(cards.length){target.replaceChildren(...cards);return;}
      message(shelf,game?
       'Aucun créateur en direct confirmé sur '+game+' pour le moment. Découvre les autres lives SWAPP.':
       'Aucun live public disponible pour le moment.');
    }catch{
      if(shelf.isConnected)message(shelf,game?
       'Les lives de '+game+' sont momentanément indisponibles. Les articles restent accessibles.':
       'Impossible de charger les lives actuellement. La lecture des articles reste disponible.',{retry:true});
    }
  }
  function loadShelves(){
    if(!sheets.length)return;
    if(!('IntersectionObserver' in window)){
      for(const shelf of sheets)renderShelf(shelf);
      return;
    }
    const observer=new IntersectionObserver(entries=>{
      for(const entry of entries){
        if(!entry.isIntersecting)continue;
        observer.unobserve(entry.target);
        renderShelf(entry.target);
      }
    },{rootMargin:'420px 0px'});
    for(const shelf of sheets)observer.observe(shelf);
  }
  async function relatedNews(){
    if(!related)return;
    let game=String(related.dataset.articlesForGame||'').slice(0,90);
    const target=related.querySelector('[data-related-results]');if(!target)return;
    if(!game){try{const login=location.pathname.match(/^\/live\/twitch\/([a-z0-9_]+)\/?$/i)?.[1];if(login){const liveRes=await fetch('/api/discovery/home-lives?limit=40&lang=fr',{credentials:'same-origin'});if(liveRes.ok){const liveData=await liveRes.json();const match=(liveData.items||[]).find(x=>String(x.login||'').toLowerCase()===login.toLowerCase());game=String(match?.game_name||match?.game||'').slice(0,90)}}}catch{}}
    if(!game){message(related,'Jeu du live non identifié : impossible de garantir une actualité pertinente.');return;}
    try{
      const res=await fetch('/api/actus',{credentials:'same-origin',headers:{Accept:'application/json'},signal:AbortSignal.timeout(9000)});
      if(!res.ok)throw Error('unavailable');
      const data=await res.json();
      const stories=(data.articles||[]).filter(a=>game&&gameMatch(game,a.game)).slice(0,4);
      target.replaceChildren();
      for(const a of stories){
        if(!/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(String(a.slug||'')))continue;
        const link=document.createElement('a');link.href='/actus/'+encodeURIComponent(a.slug);
        link.className='swapp-live-card swapp-related-card';
        const body=document.createElement('div');body.className='swapp-live-content';
        const title=document.createElement('strong');text(title,a.title);
        const desc=document.createElement('p');text(desc,a.summary||'Actualité du jeu');
        const action=document.createElement('span');action.className='swapp-live-action';text(action,'Lire cet article →');
        body.append(title,desc,action);link.appendChild(body);target.appendChild(link);
      }
      if(!target.children.length)message(related,game?'Pas encore d’article SWAPP consacré à '+game+'.':'Découvre les articles du média SWAPP.');
    }catch{message(related,'Les articles sont momentanément indisponibles.');}
  }
  loadShelves();
  if(related)relatedNews();
})();
