/* SWAPP MEDIA: editorial × verified public live discovery. */
(() => {
  'use strict';
  const sheets = [...document.querySelectorAll('[data-swapp-live-shelf]')];
  const related=document.querySelector('[data-articles-for-game]');
  if (!sheets.length && !related) return;
  const text = (el,value) => { el.textContent = String(value ?? ''); };
  const safeImage = value => {try {const url = new URL(value);return url.protocol === 'https:'&&!url.username&&!url.password ? url.href : null;}catch{return null;}};
  const normal = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  // Older Safari supports AbortController but not AbortSignal.timeout.
  async function getWithTimeout(url,ms=12000){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),ms);
    try{return await fetch(url,{credentials:'same-origin',headers:{Accept:'application/json'},signal:controller.signal})}
    finally{clearTimeout(timer)}
  }
  // Exact identity (including known editorial aliases). Substring matching
  // incorrectly associates sequels: Hades vs Hades II or Planet Zoo vs Zoo 2.
  const aliases=[
    ['Grand Theft Auto VI','GTA 6','GTA6','GTA VI','Grand Theft Auto 6'],
    ['Planet Zoo 2','Planet Zoo II'],
    ['The Witcher 3: Wild Hunt Remastered','The Witcher 3 Remastered','Witcher 3 Remastered','The Witcher III Remastered'],
    ['The Witcher 3: Wild Hunt','The Witcher 3','Witcher 3'],
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
  function card(item,matchedGame='') {
    const login=String(item.login || '').trim().toLowerCase();
    if(!/^[a-z0-9_]{2,40}$/.test(login)) return null;
    const platform=String(item.platform || '').toLowerCase();
    const isNative=platform==='oryon'||platform==='swapp';
    const el=document.createElement('a');
    el.className='swapp-live-card';
    if(typeof item.fairProof==='string'&&/^[A-Za-z0-9_-]{30,500}\.[a-f0-9]{64}$/.test(item.fairProof))
      el.dataset.swappFairProof=item.fairProof;
    el.href=isNative ? '/'+encodeURIComponent(login) : '/live/twitch/'+encodeURIComponent(login)+(item.game_name?'?game='+encodeURIComponent(String(item.game_name).slice(0,90)):'');
    const cover=document.createElement('div');cover.className='swapp-live-cover';
    const src=safeImage(item.thumbnail_url);
    if(src){const img=document.createElement('img');img.src=src;img.alt='';img.loading='lazy';cover.appendChild(img);}
    const pill=document.createElement('span');pill.className='swapp-live-badge';text(pill,isNative?'LIVE SWAPP':'LIVE TWITCH');cover.appendChild(pill);
    const body=document.createElement('div');body.className='swapp-live-content';
    const title=document.createElement('strong');text(title,item.title||'Live en cours');body.appendChild(title);
    // Show the verified relationship on the existing creator card, not in
    // an additional homepage module or an invented "trending" badge.
    if(matchedGame&&gameMatch(matchedGame,item.game_name||item.category||item.game)){
      const connection=document.createElement('span');
      connection.className='swapp-game-connection';
      text(connection,'Même jeu · '+matchedGame);
      body.appendChild(connection);
      el.classList.add('swapp-game-linked-card');
    }
    const meta=document.createElement('p');text(meta,[item.display_name||login,item.game_name||'',Number(item.viewer_count||0).toLocaleString('fr-FR')+' spectateurs'].filter(Boolean).join(' · '));body.appendChild(meta);
    const action=document.createElement('span');action.className='swapp-live-action';text(action,'Regarder sur SWAPP →');body.appendChild(action);
    el.append(cover,body);return el;
  }
  function message(shelf,notice,{retry=false}={}){
    const target=shelf.querySelector('[data-live-results], [data-related-results]');if(!target)return;
    target.replaceChildren();
    const p=document.createElement('p');p.className='swapp-live-notice';text(p,notice);target.appendChild(p);
    if(retry){
      const button=document.createElement('button');
      button.type='button';
      button.className='swapp-media-button';
      text(button,'Réessayer');
      button.onclick=()=>{
        button.disabled=true;
        message(shelf,'Nouvelle tentative…');
        const game=String(shelf.dataset.game||'').trim();
        if(game)requests.delete(normal(game));
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
      requests.set(key,getWithTimeout(url,12000)
       .then(async response=>{
         if(!response.ok)throw Error('HTTP '+response.status);
         const payload=await response.json();
         if(!payload.success||!Array.isArray(payload.items)||!gameMatch(payload.game,game))throw Error('invalid_game_results');
         const verified=payload.items.filter(item=>gameMatch(game,item.game_name||item.category||item.game));
         // Do not convert an unavailable Twitch integration into a false
         // claim that no streamer is live.
         verified.coverage=String(payload.coverage||'unknown');
         verified.metricsEnabled=payload.fairMetrics?.enabled===true;
         return verified;
       }).catch(error=>{requests.delete(key);throw error;}));
    }
    return requests.get(key);
  }
  let generalPromise;
  async function generalLives(){
    if(!generalPromise){
      generalPromise=getWithTimeout('/api/discovery/home-lives?limit=12&lang=fr',12000).then(async response=>{
        if(!response.ok)throw Error('HTTP '+response.status);
        const result=await response.json();
        if(!result.success||!Array.isArray(result.items))throw Error('unavailable');
        return result.items;
      }).catch(error=>{generalPromise=null;throw error;});
    }
    return generalPromise;
  }
  function validUnique(items,limit,game=''){
    const seen=new Set(),out=[];
    for(const item of items){
      if(!item||typeof item!=='object')continue;
      const key=String(item.platform||'').toLowerCase()+':'+String(item.login||'').trim().toLowerCase();
      if(seen.has(key))continue;
      const node=card(item,game);
      if(!node)continue;
      seen.add(key);out.push(node);
      if(out.length>=limit)break;
    }
    return out;
  }
  // Session-only and OFF by default: a player explicitly requests the
  // sampling pilot. No cookie, localStorage, device ID or implicit telemetry.
  const fairPilots=new WeakMap();
  function setupFairPilot(shelf,cards,available){
    if(!available||!cards.some(node=>node.dataset.swappFairProof)||!('IntersectionObserver' in window))return;
    const heading=shelf.querySelector('.swapp-media-heading');
    if(!heading)return;
    let pilot=fairPilots.get(shelf);
    if(!pilot){
      const button=document.createElement('button');
      button.type='button';button.className='swapp-media-button';
      button.dataset.swappFairOpt='';button.setAttribute('aria-pressed','false');
      button.textContent='Contribuer à une découverte équitable (facultatif)';
      button.title='Compter anonymement les lives réellement vus sur cette page, sans compte ni historique.';
      const explanation=document.createElement('small');
      explanation.className='swapp-fair-optin-info';
      explanation.textContent='Volontaire · cartes visibles et clics uniquement · sans identifiant visiteur · cette page seulement.';
      heading.append(button,explanation);
      pilot={button,active:false,cards:[],seen:new Set(),timers:new Map(),observer:null};
      fairPilots.set(shelf,pilot);
      const stop=()=>{
        pilot.observer?.disconnect();pilot.observer=null;
        for(const timer of pilot.timers.values())clearTimeout(timer);
        pilot.timers.clear();
      };
      const record=(node,event)=>{
        if(!pilot.active||!node.isConnected||document.visibilityState!=='visible')return;
        const proof=node.dataset.swappFairProof,identity=proof+':'+event;
        if(!proof||pilot.seen.has(identity)||pilot.seen.size>=48)return;
        pilot.seen.add(identity);
        // The browser will send a same-origin Origin header. Cookies excluded.
        void fetch('/api/discovery/fair-event',{
          method:'POST',credentials:'omit',keepalive:true,
          headers:{'Content-Type':'application/json','Accept':'application/json'},
          body:JSON.stringify({proof,event})
        }).catch(()=>{});
      };
      const start=()=>{
        stop();
        pilot.observer=new IntersectionObserver(entries=>{
          for(const entry of entries){
            const node=entry.target,previous=pilot.timers.get(node);
            if(previous){clearTimeout(previous);pilot.timers.delete(node)}
            if(entry.intersectionRatio<.5||document.visibilityState!=='visible')continue;
            pilot.timers.set(node,setTimeout(()=>{
              pilot.timers.delete(node);
              if(pilot.active&&document.visibilityState==='visible')record(node,'impression');
            },1250));
          }
        },{threshold:[0,.5,1]});
        for(const node of pilot.cards)pilot.observer.observe(node);
      };
      button.addEventListener('click',()=>{
        pilot.active=!pilot.active;
        button.setAttribute('aria-pressed',String(pilot.active));
        button.textContent=pilot.active?'Mesure volontaire activée · Désactiver':'Contribuer à une découverte équitable (facultatif)';
        if(pilot.active)start();else stop();
      });
      shelf.addEventListener('click',event=>{
        if(!pilot.active)return;
        const node=event.target.closest('.swapp-live-card[data-swapp-fair-proof]');
        if(node&&pilot.cards.includes(node))record(node,'click');
      },true);
      document.addEventListener('visibilitychange',()=>{
        if(!pilot.active)return;
        if(document.visibilityState!=='visible')stop();else start();
      });
      pilot.refresh=()=>{if(pilot.active)start()};
    }
    pilot.cards=cards.filter(node=>!!node.dataset.swappFairProof);
    pilot.refresh();
  }
  async function renderShelf(shelf){
    const game=String(shelf.dataset.game||'').trim().slice(0,90);
    const target=shelf.querySelector('[data-live-results]');
    if(!target)return;
    try{
      const data=game?await gameLives(game):await generalLives();
      if(!shelf.isConnected)return;
      const cards=validUnique(data,game?4:6,game);
      if(cards.length){target.replaceChildren(...cards);setupFairPilot(shelf,cards,!!data.metricsEnabled);return;}
      const coverage=Array.isArray(data)?data.coverage:'';
      const failure=coverage==='native-only'?
       'Les directs SWAPP ont été vérifiés, mais la recherche Twitch est indisponible : des chaînes peuvent être en direct sur '+game+'.':
       coverage==='partial'?
       'Recherche partielle sur '+game+' : Twitch n’a pas pu être interrogé complètement.':
       'Aucun créateur confirmé pour '+game+' dans les résultats vérifiés. Réessaie pour actualiser.';
      message(shelf,game?failure:'Aucun live public disponible pour le moment.',{retry:!!game});
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
    if(!game){try{const login=location.pathname.match(/^\/live\/twitch\/([a-z0-9_]+)\/?$/i)?.[1];if(login){const liveRes=await getWithTimeout('/api/discovery/home-lives?limit=40&lang=fr',12000);if(liveRes.ok){const liveData=await liveRes.json();const match=(liveData.items||[]).find(x=>String(x.login||'').toLowerCase()===login.toLowerCase());game=String(match?.game_name||match?.game||'').slice(0,90)}}}catch{}}
    if(!game){message(related,'Jeu du live non identifié : impossible de garantir une actualité pertinente.');return;}
    try{
      const res=await getWithTimeout('/api/actus',9000);
      if(!res.ok)throw Error('unavailable');
      const data=await res.json();
      const stories=(data.articles||[]).filter(a=>game&&gameMatch(game,a.game)).slice(0,4);
      target.replaceChildren();
      for(const a of stories){
        if(!/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(String(a.slug||'')))continue;
        const link=document.createElement('a');link.href='/actus/'+encodeURIComponent(a.slug);
        link.className='swapp-live-card swapp-related-card swapp-game-linked-card';
        // Reverse journey: the live viewer sees the real editorial artwork
        // for this exact game. No generic stock image or invented article.
        const coverSrc=safeImage(a.image?.url||a.imageUrl);
        if(coverSrc){
          const cover=document.createElement('div');cover.className='swapp-live-cover swapp-related-cover';
          const img=document.createElement('img');img.src=coverSrc;img.alt='';
          img.loading='lazy';img.decoding='async';cover.appendChild(img);
          link.appendChild(cover);
        }
        const body=document.createElement('div');body.className='swapp-live-content';
        const title=document.createElement('strong');text(title,a.title);
        const connection=document.createElement('span');connection.className='swapp-game-connection';
        text(connection,'À lire · '+game);
        const desc=document.createElement('p');text(desc,a.summary||'Actualité du jeu');
        const action=document.createElement('span');action.className='swapp-live-action';text(action,'Lire cet article →');
        body.append(title,connection,desc,action);link.appendChild(body);target.appendChild(link);
      }
      if(!target.children.length)message(related,game?'Pas encore d’article SWAPP consacré à '+game+'.':'Découvre les articles du média SWAPP.');
    }catch{message(related,'Les articles sont momentanément indisponibles.');}
  }
  loadShelves();
  if(related)relatedNews();
})();
