/* SWAPP MEDIA: editorial × verified public live discovery. */
(() => {
  'use strict';
  const escapeCss = () => {};
  const sheets = [...document.querySelectorAll('[data-swapp-live-shelf]')];
  if (!sheets.length) return;
  const text = (el,value) => { el.textContent = String(value ?? ''); };
  const safeImage = value => {try {const url = new URL(value);return url.protocol === 'https:' ? url.href : null;}catch{return null;}};
  const normal = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const gameMatch = (game, liveGame) => {
    const a = normal(game), b = normal(liveGame);
    if(!a || !b) return false;
    return a === b || (a.length >= 7 && b.includes(a)) || (b.length >= 7 && a.includes(b));
  };
  function card(item) {
    const login=String(item.login || '').trim().toLowerCase();
    if(!/^[a-z0-9_]{2,40}$/.test(login)) return null;
    const platform=String(item.platform || '').toLowerCase();
    const isNative=platform==='oryon'||platform==='swapp';
    const el=document.createElement('a');
    el.className='swapp-live-card';
    el.href=isNative ? '/'+encodeURIComponent(login) : '/live/twitch/'+encodeURIComponent(login);
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
  function message(shelf,message){
    const target=shelf.querySelector('[data-live-results]');if(!target)return;
    target.replaceChildren();
    const p=document.createElement('p');p.className='swapp-live-notice';text(p,message);target.appendChild(p);
  }
  async function run(){
    try{
      const response=await fetch('/api/discovery/home-lives?limit=12&lang=fr',{credentials:'same-origin',headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw Error('HTTP '+response.status);
      const data=await response.json();
      if(!data.success||!Array.isArray(data.items))throw Error('unavailable');
      for(const shelf of sheets){
        const game=shelf.dataset.game || '';
        const candidates=game?data.items.filter(x=>gameMatch(game,x.game_name||x.category||x.game)):data.items;
        const unique=new Set();
        const cards=candidates.filter(x=>{
          const key=String(x.platform||'')+':'+String(x.login||'').toLowerCase();if(unique.has(key))return false;unique.add(key);return true;
        }).slice(0,game?3:6).map(card).filter(Boolean);
        const target=shelf.querySelector('[data-live-results]');if(!target)continue;
        if(cards.length){target.replaceChildren(...cards);}
        else message(shelf,game?'Aucun live identifié actuellement sur '+game+'. Explore les autres créateurs SWAPP.':'Aucun live public disponible pour le moment. Reviens bientôt.');
      }
    }catch{
      for(const shelf of sheets) message(shelf,'Impossible de charger les lives actuellement. La lecture des articles reste disponible.');
    }
  }
  run();
})();
