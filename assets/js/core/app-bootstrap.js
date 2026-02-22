const API_BASE = window.location.origin;
    const __urlParams = new URLSearchParams(window.location.search);
    const TWITCH_PARENT = __urlParams.get('parent') || window.location.hostname;
    const PARENT_DOMAINS = ['localhost','127.0.0.1',window.location.hostname,'justplayer.fr','www.justplayer.fr'];

    // --- SFX (Base64 short sounds) ---
    // Son "Open/Whoosh" court
    const sfxOpen = new Audio("data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="); 
    // (J'ai mis un placeholder vide pour la taille du code, en vrai je vais générer un son synthétique simple via WebAudio ou un vrai Base64 si tu veux, mais pour l'instant simulons par log ou un beep simple)
    // Pour que ça marche vraiment sans fichier externe, voici des sons très courts encodés:
    
    // Son "Futuristic Click"
    const sfxClick = new Audio("data:audio/wav;base64,UklGRi4AAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="); 

    // Fonction de lecture sécurisée
    function playSound(type) {
        // En prod, remplacez les src ci-dessus par de vrais fichiers mp3/wav
        // ou des base64 valides. Ici c'est pour l'exemple structurel.
        // ex: if(type==='open') sfxOpen.play().catch(()=>{});
        // ex: if(type==='click') sfxClick.play().catch(()=>{});
        console.log("🔊 Audio:", type);
    }

    let socket;
    let currentChannel = 'twitch';
    let currentUser = null;
    let charts = {};
    let raidTarget = null;

    let currentChannelId = null;
    let currentGameId = null;
    let currentGameName = null;

    // TwitFlix infinite scroll
    let currentCursor = null;
    let isLoadingGames = false;

    // TwitFlix content mode (UI segmented control)
    // live: show live streams by game (drawer)
    // vod: show VODs by game (drawer)
    // preview: click toggles preview; hover previews are more aggressive
    let tfContentMode = 'live';
    let tfDrawerOpenForGameId = null;
    let tfDrawerFilters = { lang: 'fr', small: true, days: 60, maxViews: 200000, minViewers: 20, maxViewers: 200 };
    // Drawer mode is the primary, Netflix-like "More like this" interaction.
    // Keep it simple: click a game -> open drawer -> switch LIVE/VOD inside the drawer.
    let tfDrawerMode = 'live'; // live | vod | preview

    // Netflix-like HERO autoplay preview (changes when hovering a game cover)
    const TF_HERO_TTL = 10 * 60 * 1000;
    const tfHeroCache = new Map(); // gameId -> { t, vodId, channel }
    const tfHeroInflight = new Map();
    let tfHeroHoverTimer = null;
    let tfHeroCurrentKey = null;
    let tfHeroCyclerTimer = null;

    // INIT
    window.addEventListener('load', async () => {
      initUnderTabs();
      await checkAuth();
      initPlayer();
      loadStatsDashboard();
      initCarouselScroll();
      initSocket();
      initFirebaseStatus();
      setInterval(loadStatsDashboard, 5 * 60 * 1000);
      
      // Infinite scroll listener
      const tfGrid = document.getElementById('twitflix-grid');
      if(tfGrid){
        tfGrid.addEventListener('scroll', () => {
             if (tfGrid.scrollTop + tfGrid.clientHeight >= tfGrid.scrollHeight - 200) {
                 loadMoreCategories();
             }
        });
      }
    });

    function initUnderTabs(){
      const nav = document.getElementById('under-tabs-nav');
      if (!nav) return;
      nav.querySelectorAll('.u-tab-btn').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const id = btn.getAttribute('data-ut');
                    if(id === 'bourse'){ setTimeout(()=>{ try{ refreshBoursePanel(); }catch(e){} }, 50); }
nav.querySelectorAll('.u-tab-btn').forEach(b=>b.classList.remove('active'));
          btn.classList.add('active');
          document.querySelectorAll('#under-overview,#under-analytics,#under-niche').forEach(p=>p.classList.remove('active'));
          const panel = document.getElementById(`under-${id}`);
          if (panel) panel.classList.add('active');
        });
      });
    }

    // FIREBASE STATUS
    async function initFirebaseStatus() {
      async function checkStatus() {
        try {
          const response = await fetch(`${API_BASE}/firebase_status`);
          const data = await response.json();
          const statusEl = document.getElementById('socket-status');
          if (data.connected) {
            statusEl.innerText = 'HUB SECURE';
            statusEl.className = 'text-[10px] font-bold text-[#00f2ea] border border-[#00f2ea] px-2 rounded connected';
          } else {
            statusEl.innerText = 'HUB DISCONNECTED';
            statusEl.className = 'text-[10px] font-bold text-red-500 border border-red-500 px-2 rounded';
          }
        } catch (error) {
          console.error('Firebase status error:', error);
        }
      }
      checkStatus();
      setInterval(checkStatus, 5000);
    }

    // AUTH
    async function checkAuth() {
      const res = await fetch(`${API_BASE}/twitch_user_status`);
      const data = await res.json();
      if (data.is_connected) {
        currentUser = data.display_name;
        window.currentUser = currentUser; // expose for modules (Market)
        const hud = document.getElementById('hub-user-display');
        if(hud) hud.innerText = data.display_name;

        const btnAuth = document.getElementById('btn-auth');
        const userArea = document.getElementById('user-area');
        if(btnAuth) btnAuth.classList.add('hidden');
        if(userArea) userArea.classList.remove('hidden');

        const userName = document.getElementById('user-name');
        const avatar = document.getElementById('user-avatar');
        if(userName) userName.innerText = data.display_name;
        if (avatar && data.profile_image_url) avatar.src = data.profile_image_url;

        // Billing / credits (user space)
        await loadBillingMe().catch(()=>{});

        await loadFollowed();
      } else {
        // Guest mode: do NOT block the hub and do NOT reload.
        currentUser = 'Guest';
        window.currentUser = currentUser;
        const hud = document.getElementById('hub-user-display');
        if(hud) hud.innerText = 'INVITÉ';

        const btnAuth = document.getElementById('btn-auth');
        const userArea = document.getElementById('user-area');
        if(btnAuth) btnAuth.classList.remove('hidden');
        if(userArea) userArea.classList.add('hidden');

        // Still load billing to display credits=0 / plan=FREE cleanly.
        await loadBillingMe().catch(()=>{});
      }
    }

    async function loadBillingMe(){
  // Requires Twitch session
  const wrap = document.getElementById('billing-menu-wrap');
  const link = document.getElementById('billing-link');
  const elCredits = document.getElementById('billing-credits');
  const elPlan = document.getElementById('billing-plan');
  const elCredits2 = document.getElementById('billing-credits-2');
  const elPlan2 = document.getElementById('billing-plan-2');
  const pfCashTop = document.getElementById('pf-cash-top');
  const pfHold = document.getElementById('pf-top-holdings');

  if(!link || !elCredits || !elPlan) return;

  let d = null;
  try{
    const r = await fetch(`${API_BASE}/api/billing/me`, { credentials:'include' });
    d = await r.json().catch(()=>null);
  }catch(_e){ d = null; }

  const ok = !!(d && (d.success === undefined ? true : d.success));
  if(!ok){
    if(wrap) wrap.classList.add('hidden');
    window.dispatchEvent(new Event('billing:updated'));
    return;
  }

  if(wrap) wrap.classList.remove('hidden');

  let credits = Number(d.credits ?? 0) || 0;
  const plan = String((d.plan || 'FREE')).toUpperCase();

  elCredits.textContent = String(credits);
  elPlan.textContent = plan;
  if(elCredits2) elCredits2.textContent = String(credits);
  if(elPlan2) elPlan2.textContent = plan;

  // Portfolio preview (fallback: use fantasy wallet cash)
  try{
    const fr = await fetch(`${API_BASE}/api/fantasy/profile`, { credentials:'include' });
    const fj = await fr.json().catch(()=>null);
    const cash = Number(fj?.cash ?? fj?.wallet?.cash ?? 0) || 0;

    // Unifier "wallet crédits" : même nombre partout (bourse + portefeuille)
    const walletCredits = Math.max(credits, cash);
    credits = walletCredits;

    // Met à jour les badges crédits/plan + preview portefeuille
    elCredits.textContent = String(credits);
    elPlan.textContent = plan;
    if(elCredits2) elCredits2.textContent = String(credits);
    if(elPlan2) elPlan2.textContent = plan;

    if(pfCashTop) pfCashTop.textContent = String(credits);

    if(pfHold){
      pfHold.innerHTML = '';
      const holdings = fj?.holdings || fj?.positions || [];
      const top = Array.isArray(holdings) ? holdings.slice(0, 3) : [];
      if(!top.length){
        pfHold.innerHTML = '<div class="text-[11px] text-gray-500">Aucune position.</div>';
      }else{
        top.forEach(h=>{
          const login = (h.login || h.streamer || h.id || '').toString();
          const qty = Number(h.qty ?? h.shares ?? 0) || 0;
          const line = document.createElement('div');
          line.className = 'flex items-center justify-between';
          line.innerHTML = `<span class="text-gray-300">${login || '—'}</span><span class="text-gray-500">${qty}</span>`;
          pfHold.appendChild(line);
        });
      }
    }
  }catch(_e){}

  // One-time init for menu actions
  if(!window.__billingMenuInit){
    window.__billingMenuInit = true;

    const menu = document.getElementById('billing-menu');
    const gotoPf = document.getElementById('goto-portfolio');
    const openMarket = document.getElementById('open-market-from-menu');

    function closeMenu(){ if(menu) menu.classList.add('hidden'); }
    function toggleMenu(){ if(menu) menu.classList.toggle('hidden'); }

    link.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); toggleMenu(); });

    document.addEventListener('click', (e)=>{
      const inside = e.target.closest('#billing-menu-wrap');
      if(!inside) closeMenu();
    });

    function openPortfolio(){
      closeMenu();
      if(typeof window.openMarketOverlay === 'function'){
        window.openMarketOverlay();
        setTimeout(()=>{
          const tab = document.querySelector('#market-overlay .mkt-tab[data-tab="portfolio"]');
          if(tab) tab.click();
        }, 80);
      }else{
        window.location.href = '/pricing';
      }
    }

    if(gotoPf) gotoPf.addEventListener('click', (e)=>{ e.preventDefault(); openPortfolio(); });
    if(openMarket) openMarket.addEventListener('click', (e)=>{ e.preventDefault(); closeMenu(); if(typeof window.openMarketOverlay==='function'){ window.openMarketOverlay(); } else { window.location.href='/pricing'; } });
  }

  window.dispatchEvent(new Event('billing:updated'));
}


function startAuth() {
      window.open(`${API_BASE}/twitch_auth_start`, 'login', 'width=500,height=700');
      const check = setInterval(async () => {
        const res = await fetch(`${API_BASE}/twitch_user_status`);
        const data = await res.json();
        if (data.is_connected) {
          clearInterval(check);
          try{ await initUser(); }catch(_e){}
        }
      }, 1000);
    }

    function logout() {
      fetch(`${API_BASE}/twitch_logout`, { method:'POST' })
        .then(async ()=>{
          try{ currentUser = 'Guest'; window.currentUser = currentUser; }catch(_e){}
          try{ await initUser(); }catch(_e){}
        });
    }

    // PLAYER
    async function initPlayer() {
      const res = await fetch(`${API_BASE}/get_default_stream`);
      const data = await res.json();
      if (data.success) {
        currentChannel = data.channel;
        document.getElementById('current-channel-display').innerText = currentChannel.toUpperCase();
        document.getElementById('player-mode-badge').innerText = data.mode || 'AUTO';
        loadPlayerEmbed(currentChannel);
        updateTwitchChatFrame(currentChannel);
      }
    }

    function loadPlayerEmbed(channel) {
      const container = document.getElementById('video-container');
      const parentParam = PARENT_DOMAINS.join('&parent=');
      const iframeUrl = `https://player.twitch.tv/?channel=${channel}&parent=${parentParam}&theme=dark`;
      container.innerHTML = `<iframe src="${iframeUrl}" width="100%" height="100%" frameborder="0" allow="autoplay" scrolling="no" style="border:none;width:100%;height:100%;"></iframe>`;
      loadStreamInfo(channel);
    }

	    // Play a Twitch VOD inside the main player (Netflix-like inline playback)
	    function loadVodEmbed(videoId, channelHint) {
	      const container = document.getElementById('video-container');
	      const parentParam = PARENT_DOMAINS.join('&parent=');
	      const vid = String(videoId || '').replace(/^v/i,'');
	      if (!vid) return;
	      const iframeUrl = `https://player.twitch.tv/?video=${encodeURIComponent(vid)}&parent=${parentParam}&theme=dark&autoplay=true`;
	      container.innerHTML = `<iframe src="${iframeUrl}" width="100%" height="100%" frameborder="0" allow="autoplay" scrolling="no" style="border:none;width:100%;height:100%;"></iframe>`;
	      // VOD: no guaranteed chat; keep chat on channel if available
	      if (channelHint) {
	        try { updateTwitchChatFrame(channelHint); } catch(_){ }
	        try { document.getElementById('current-channel-display').innerText = `${String(channelHint).toUpperCase()} • VOD`; } catch(_){ }
	      } else {
	        try { document.getElementById('current-channel-display').innerText = `VOD`; } catch(_){ }
	      }
	      try { document.getElementById('player-mode-badge').innerText = 'VOD'; } catch(_){ }
	    }

    function loadStreamInfo(channel) {
      fetch(`${API_BASE}/stream_info`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ channel })
      })
      .then(r=>r.json())
      .then(data=>{
        if (data.success && data.stream) {
          const title = data.stream.title || 'Sans titre';
          const viewers = data.stream.viewer_count || 0;

          const display = document.getElementById('current-channel-display');
          const titleText = title.length > 40 ? title.substring(0,40) + '...' : title;
          display.innerText = `${channel.toUpperCase()} • ${titleText}`;
          display.title = title;

          document.getElementById('viewer-count').innerText = `${viewers.toLocaleString()} viewers`;

          currentGameId = data.stream.game_id || null;
          currentGameName = data.stream.game_name || null;

          // 🔥 Pro data sous le live
          loadChannelProData(channel);
        } else {
          document.getElementById('viewer-count').innerText = `0 viewers`;
        }
      })
      .catch(e=>console.error('Stream info error:', e));
    }

    function updateTwitchChatFrame(channel){
      const parentParam = PARENT_DOMAINS.join('&parent=');
      // FORCE DARK THEME
      const url = `https://www.twitch.tv/embed/${channel}/chat?parent=${parentParam}&theme=dark&darkpopout`;
      const frame = document.getElementById('twitch-chat-frame');
      if (frame) frame.src = url;
    }

    async function cycle(dir){
      const res = await fetch(`${API_BASE}/cycle_stream`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ direction: dir })
      });
      const data = await res.json();
      if (data.success) {
        currentChannel = data.channel;
        document.getElementById('current-channel-display').innerText = currentChannel.toUpperCase();
        document.getElementById('viewer-count').innerText = '-- viewers';
        loadPlayerEmbed(currentChannel);
        updateTwitchChatFrame(currentChannel);
      }
    }

    // CAROUSEL
    function initCarouselScroll(){
      const el = document.getElementById('carousel');
      if (!el) return;
      el.addEventListener('wheel',(evt)=>{ evt.preventDefault(); el.scrollLeft += evt.deltaY; }, { passive:false });
    }

    async function loadFollowed(){
      const el = document.getElementById('carousel');
      el.innerHTML = '<div class="w-full text-center py-10"><i class="fas fa-spinner fa-spin text-[#00f2ea]"></i></div>';
      try{
        const res = await fetch(`${API_BASE}/followed_streams`);
        const data = await res.json();
        if (data.success && data.streams.length > 0){
          el.innerHTML = '';
          data.streams.forEach(s=>{
            const thumb = (s.thumbnail_url||'').replace('{width}','1000').replace('{height}','1333');
            el.innerHTML += `
              <div class="stream-card flex-shrink-0" onclick="changeChannel('${s.user_login}')">
                <img src="${thumb}" class="card-img" onerror="this.src='https://via.placeholder.com/400x225'">
                <div class="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black to-transparent p-3">
                  <div class="font-bold text-white text-sm truncate">${s.user_name}</div>
                </div>
                <div class="absolute top-2 right-2 bg-red-600 text-white text-[10px] font-bold px-1 rounded">LIVE</div>
              </div>`;
          });
        } else {
          el.innerHTML = '<div class="w-full text-center py-10 text-gray-500">Aucune chaîne suivie en live.</div>';
        }
      }catch(e){
        console.error('Carousel error:', e);
        el.innerHTML = '<div class="w-full text-center py-10 text-red-500">Erreur</div>';
      }
    }

    function changeChannel(channel){
      currentChannel = channel;
      document.getElementById('current-channel-display').innerText = channel.toUpperCase();
      document.getElementById('viewer-count').innerText = '-- viewers';
      loadPlayerEmbed(channel);
      updateTwitchChatFrame(channel);
    }

    // RIGHT TABS
    function openTab(e, id){
      document.querySelectorAll('#tab-chat,#tab-stats,#tab-tools').forEach(el=>el.classList.remove('active'));
      document.querySelectorAll('.tab-nav .tab-btn').forEach(el=>el.classList.remove('active'));
      document.getElementById(`tab-${id}`).classList.add('active');
      if (e?.currentTarget) e.currentTarget.classList.add('active');
    }

    function toggleChatMode(mode){
      const twitch = document.getElementById('chat-container-twitch');
      const hub = document.getElementById('chat-container-hub');
      const btnTw = document.getElementById('btn-mode-twitch');
      const btnHb = document.getElementById('btn-mode-hub');

      if (mode === 'hub'){
        twitch.classList.add('hidden');
        hub.classList.remove('hidden'); hub.classList.add('flex');
        btnHb.className = 'flex-1 py-1 text-xs font-bold bg-[#00f2ea] text-black rounded';
        btnTw.className = 'flex-1 py-1 text-xs font-bold bg-[#1a1a1a] text-gray-400 rounded hover:text-white';
      } else {
        hub.classList.add('hidden'); hub.classList.remove('flex');
        twitch.classList.remove('hidden');
        const frame = document.getElementById('twitch-chat-frame');
        if(frame && (!frame.src || frame.src === '')){ try{ updateTwitchChatFrame(currentChannel || 'twitch'); }catch(_){} }
        btnTw.className = 'flex-1 py-1 text-xs font-bold bg-[#6441a5] text-white rounded';
        btnHb.className = 'flex-1 py-1 text-xs font-bold bg-[#1a1a1a] text-gray-400 rounded hover:text-white';
      }
    }

    // SOCKET.IO
    function initSocket(){
      if (window.__hubSocketInited) return;
      window.__hubSocketInited = true;

      try{
        socket = io(undefined, { transports: ['websocket','polling'] });

        const status = document.getElementById('socket-status');
        const setStatus = (ok) => {
          if (!status) return;
          status.textContent = ok ? 'HUB CONNECTÉ' : 'HUB DÉCONNECTÉ';
          status.className = ok
            ? 'text-xs font-bold px-2 py-1 rounded bg-[#00f2ea] text-black'
            : 'text-xs font-bold px-2 py-1 rounded bg-red-600 text-white';
        };

        setStatus(false);
        socket.on('connect', () => setStatus(true));
        socket.on('disconnect', () => setStatus(false));
        socket.on('connect_error', () => setStatus(false));

        // Anti-doublon (évite le double affichage quand le serveur renvoie la même chose via 2 events)
        const seen = new Set();

        // Helpers: émettre "nouvelle" ET "ancienne" API (compat)
        window.emitHubMessage = (payload) => {
          if (!socket) return;
          socket.emit('chat message', payload);
          socket.emit('hub:message', payload); // compat si backend ancien
        };
        window.emitHubReact = (payload) => {
          if (!socket) return;
          socket.emit('chat react', payload);
          socket.emit('hub:react', payload); // compat si backend ancien
        };

        const box = document.getElementById('hub-messages');

        const replaceAllMessages = (msgs) => {
          if (!box) return;
          box.innerHTML = '';
          (msgs || []).forEach(m => {
            if (m && m.id) seen.add(m.id);
            renderHubMessage(m);
          });
          box.scrollTop = box.scrollHeight;
        };

        // === API actuelle (app.js): historique + messages + updates réactions
        socket.on('chat history', (msgs) => {
          try { replaceAllMessages(msgs); } catch(_){}
        });

        socket.on('chat message', (msg) => {
          try{
            if (!msg || !msg.id) return;
            if (seen.has(msg.id)) return;
            seen.add(msg.id);
            if (seen.size > 1200) {
              const arr = Array.from(seen);
              for (let i=0;i<400;i++) seen.delete(arr[i]);
            }
            renderHubMessage(msg);
          }catch(_){}
        });

        socket.on('chat update', ({ id, reactions }) => {
          try{
            const el = document.querySelector(`[data-msg-id="${cssEscape(id)}"] .hub-reactions`);
            if (!el) return;
            el.innerHTML = renderReactionsHtml(reactions || {});
          }catch(_){}
        });

        // === API legacy (si jamais): hub:init / hub:message / hub:react
        socket.on('hub:init', (data) => {
          try{
            const msgs = (data && data.messages) ? data.messages : [];
            replaceAllMessages(msgs);

            if (data && data.profile){
              window.__hubProfile = data.profile;
              renderHubProfile();
            }
          }catch(_){}
        });

        socket.on('hub:message', (msg) => {
          try{
            if (!msg || !msg.id) return;
            if (seen.has(msg.id)) return;
            seen.add(msg.id);
            renderHubMessage(msg);
          }catch(_){}
        });

        socket.on('hub:react', ({ messageId, reactions }) => {
          try{
            const el = document.querySelector(`[data-msg-id="${cssEscape(messageId)}"] .hub-reactions`);
            if (!el) return;
            el.innerHTML = renderReactionsHtml(reactions || {});
          }catch(_){}
        });

      }catch(e){
        console.error('Socket init error', e);
      }
    }

    function sendHubMessage(e){
      e.preventDefault();
      const input = document.getElementById('hub-input');
      const raw = (input?.value || '').trim();
      if (!raw) return;

      // /gif <url>
      let gif = '';
      let text = raw;
      const m = raw.match(/^\/gif\s+(https?:\/\/\S+)/i);
      if (m){
        gif = m[1];
        text = '';
      }

      if (window.emitHubMessage) window.emitHubMessage({ user: currentUser || 'Anon', text, gif });
      input.value = '';
    }

    function escapeHtml(str){
      return String(str||'').replace(/[&<>"']/g, (m) => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
      }[m]));
    }

    // TwitFlix helper: unify escaping helper used across modules.
    function tfEsc(v){
      return escapeHtml(String(v ?? ""));
    }

    // ================== HUB UI (persistant + emotes + gifs + réactions) ==================
    const EMOTE_MAP = {
      ':kappa:':'😏', ':pog:':'🤯', ':gg:':'🏆', ':love:':'💖',
      ':hype:':'🚀', ':rip:':'🪦', ':clap:':'👏', ':fire:':'🔥'
    };

    function parseEmotes(text){
      let out = String(text||'');
      Object.keys(EMOTE_MAP).forEach(k => {
        out = out.split(k).join(EMOTE_MAP[k]);
      });
      return out;
    }

    function cssEscape(s){
      return String(s||'').replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    function renderHubProfile(){
      // Optionnel : affiche grade / XP dans le header si tu as des éléments dédiés
      // On garde simple pour ne pas casser ton layout
    }

    function renderReactionsHtml(reactions){
      const entries = Object.entries(reactions||{}).sort((a,b)=>b[1]-a[1]);
      return entries.map(([emo,count]) => `<span class="hub-react-pill">${escapeHtml(emo)} <span class="text-gray-400">${count}</span></span>`).join('');
    }

    function renderHubMessage(msg){
      const box = document.getElementById('hub-messages');
      if (!box) return;

      const id = msg.id || (Date.now()+'-'+Math.random().toString(36).slice(2));
      const user = escapeHtml(msg.user || 'Anon');
      const grade = msg.grade?.label || msg.grade?.key || '';
      const badgeColor = msg.grade?.color || '#9ca3af';
      const text = msg.text ? escapeHtml(parseEmotes(msg.text)) : '';
      const gif = msg.gif ? String(msg.gif) : '';
      const ts = msg.ts ? new Date(msg.ts) : new Date();

      const el = document.createElement('div');
      el.className = 'hub-msg';
      el.setAttribute('data-msg-id', id);

      el.innerHTML = `
        <div class="flex items-center gap-2">
          <strong class="text-[#00f2ea]">${user}</strong>
          ${grade ? `<span class="hub-badge" style="border-color:${badgeColor}; color:${badgeColor};">${escapeHtml(grade)}</span>` : ``}
          <span class="text-[10px] text-gray-600 ml-auto">${ts.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
        </div>
        ${text ? `<div class="text-gray-200 mt-1">${text}</div>` : ``}
        ${gif ? `<img src="${escapeHtml(gif)}" class="hub-gif" loading="lazy" referrerpolicy="no-referrer" crossorigin="anonymous">` : ``}
        <div class="hub-reactions">${renderReactionsHtml(msg.reactions || {})}</div>
        <div class="hub-react-row flex gap-2 mt-2">
          <button type="button" class="hub-react-btn" data-react="🔥" data-msg="${id}">🔥</button>
          <button type="button" class="hub-react-btn" data-react="😂" data-msg="${id}">😂</button>
          <button type="button" class="hub-react-btn" data-react="💖" data-msg="${id}">💖</button>
          <button type="button" class="hub-react-btn" data-react="👍" data-msg="${id}">👍</button>
        </div>
      `;

      const nearBottom = (box.scrollHeight - box.scrollTop - box.clientHeight) < 120;
      box.appendChild(el);
      if (nearBottom) box.scrollTop = box.scrollHeight;
    }

    function reactToMsg(messageId, emoji){
      // Envoie réaction (id exact du message)
      if (window.emitHubReact) window.emitHubReact({ messageId, emoji });
    }


    function insertAtCursor(input, text){
      const start = input.selectionStart || 0;
      const end = input.selectionEnd || 0;
      const val = input.value || '';
      input.value = val.slice(0,start) + text + val.slice(end);
      input.focus();
      const pos = start + text.length;
      input.setSelectionRange(pos,pos);
    }

    async function openGifModal(){
      const modal = document.getElementById('hub-gif-modal');
      const grid = document.getElementById('hub-gif-grid');
      const search = document.getElementById('hub-gif-search');
      if (!modal || !grid || !search) return;

      modal.classList.remove('hidden');
      grid.innerHTML = `<div class="col-span-full text-gray-400 text-sm">Chargement...</div>`;

      async function loadTrending(){
        const r = await fetch(`${API_BASE}/api/gifs/trending?limit=28`);
        const j = await r.json();
        if (!j.success) {
          grid.innerHTML = `<div class="col-span-full text-red-400 text-sm">GIF indisponibles (ajoute GIPHY_API_KEY côté serveur).</div>`;
          return;
        }
        renderGifGrid(j.gifs || []);
      }

      function renderGifGrid(items){
        grid.innerHTML = '';
        items.forEach(g => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'rounded-xl overflow-hidden border border-[#222] hover:border-[#00f2ea] bg-black';
          b.innerHTML = `<img src="${escapeHtml(g.url)}" class="w-full h-auto block" loading="lazy" referrerpolicy="no-referrer" crossorigin="anonymous">`;
          b.onclick = () => {
            if (socket) if (window.emitHubMessage) window.emitHubMessage({ user: currentUser || 'Anon', text:'', gif: g.url });
            modal.classList.add('hidden');
          };
          grid.appendChild(b);
        });
      }

      let t = null;
      search.oninput = () => {
        clearTimeout(t);
        const q = (search.value || '').trim();
        t = setTimeout(async () => {
          if (!q) return loadTrending();
          grid.innerHTML = `<div class="col-span-full text-gray-400 text-sm">Recherche...</div>`;
          const r = await fetch(`${API_BASE}/api/gifs/search?q=${encodeURIComponent(q)}&limit=28`);
          const j = await r.json();
          if (!j.success) {
            grid.innerHTML = `<div class="col-span-full text-red-400 text-sm">GIF indisponibles.</div>`;
            return;
          }
          renderGifGrid(j.gifs || []);
        }, 220);
      };

      await loadTrending();
    }

    document.addEventListener('DOMContentLoaded', () => {
      const emojiBtn = document.getElementById('hub-emoji-btn');
      const emojiPanel = document.getElementById('hub-emoji-panel');
      const gifBtn = document.getElementById('hub-gif-btn');
      const gifClose = document.getElementById('hub-gif-close');
      const gifModal = document.getElementById('hub-gif-modal');
      const input = document.getElementById('hub-input');

      if (emojiBtn && emojiPanel){
        emojiBtn.onclick = () => emojiPanel.classList.toggle('hidden');
        emojiPanel.querySelectorAll('.hub-emo').forEach(btn => {
          btn.addEventListener('click', () => {
            if (!input) return;
            insertAtCursor(input, btn.textContent + ' ');
            emojiPanel.classList.add('hidden');
          });
        });
        document.addEventListener('click', (e) => {
          if (!emojiPanel.contains(e.target) && e.target !== emojiBtn) emojiPanel.classList.add('hidden');
        });
      }

      if (gifBtn){
        gifBtn.onclick = openGifModal;
      }
      if (gifClose && gifModal){
        gifClose.onclick = () => gifModal.classList.add('hidden');
      }
      if (gifModal){
        gifModal.addEventListener('click', (e) => {
          if (e.target === gifModal) gifModal.classList.add('hidden');
        });
      }
    });


    // TWITFLIX — Netflix-like catalogue (only). Does NOT touch the rest of the app.
    // Requires:
    //  - GET  /api/categories/top?cursor=...
    //  - (optional) GET /api/categories/search?q=...
    //  - POST /api/stream/by_category { game_id } -> { channel }

    let tfModalOpen = false;
    let tfViewMode = 'rows'; // rows | az
    let tfAllCategories = [];

    // Personalisation (Steam ADN) — prefers Steam OpenID session (no manual SteamID64)
let tfPersonalization = null; // {title, seedGame, categories:[...]} from /api/reco/personalized
const TF_STEAM_STORAGE_KEY = 'twitflix_steamid64'; // legacy fallback
let tfSteamSession = { connected:false, steamid:'', profile:null };

function tfGetSteamId(){
  try{ return (localStorage.getItem(TF_STEAM_STORAGE_KEY) || '').trim(); }catch(_){ return ''; }
}
function tfSetSteamId(v){
  try{ localStorage.setItem(TF_STEAM_STORAGE_KEY, String(v||'').trim()); }catch(_){ }
}

function tfUpdateSteamBtn(){
  const btn = document.getElementById('tf-btn-steam');
  if(!btn) return;
  const persona = (tfSteamSession && tfSteamSession.profile && tfSteamSession.profile.personaname) ? String(tfSteamSession.profile.personaname) : '';
  const connected = !!(tfSteamSession && tfSteamSession.connected);

  // Aesthetic button (icon + compact status) — keep id stable.
  btn.classList.toggle('tf-steam-connected', connected);
  btn.innerHTML = `
    <i class="fab fa-steam" aria-hidden="true"></i>
    <span class="tf-steam-label">${connected ? (persona ? escapeHtml(persona) : 'Steam connecté') : 'Connecter Steam'}</span>
    ${connected ? '<span class="tf-steam-check" aria-hidden="true">✓</span>' : ''}
  `;
  btn.title = connected
    ? (persona ? `Steam connecté : ${persona}` : 'Steam connecté')
    : 'Connecter Steam';
}

async function tfRefreshSteamSession(){
  try{
    const r = await fetch(`${API_BASE}/api/steam/me`, { credentials:'include' });
    const d = await r.json();
    tfSteamSession = (d && d.success && d.connected) ? { connected:true, steamid:d.steamid||'', profile:d.profile||null } : { connected:false, steamid:'', profile:null };
    if(tfSteamSession.connected && tfSteamSession.steamid){
      // keep a local hint for legacy endpoints; not required
      tfSetSteamId(tfSteamSession.steamid);
    }
  }catch(_){
    tfSteamSession = { connected:false, steamid:'', profile:null };
  }
  tfUpdateSteamBtn();
}

async function tfLoadPersonalization(){
  // Prefer server session
  if(tfSteamSession.connected){
    try{
      const r = await fetch(`${API_BASE}/api/reco/personalized`, { credentials:'include' });
      if(!r.ok) { tfPersonalization = null; return; }
      const d = await r.json();
      if(d && d.success && Array.isArray(d.categories) && d.categories.length){
        tfPersonalization = d;
        return;
      }
    }catch(_){}
  }

  // Legacy fallback (manual SteamID64 in localStorage)
  const steamid = tfGetSteamId();
  if(!steamid){ tfPersonalization = null; return; }
  try{
    const r = await fetch(`${API_BASE}/api/reco/personalized?steamid=${encodeURIComponent(steamid)}`);
    if(!r.ok) { tfPersonalization = null; return; }
    const d = await r.json();
    tfPersonalization = (d && d.success && Array.isArray(d.categories) && d.categories.length) ? d : null;
  }catch(_){ tfPersonalization = null; }
}

function tfConnectSteam(){
  const next = '/'; // keep it simple: return to home
  const url = `${API_BASE}/auth/steam?next=${encodeURIComponent(next)}`;
  // popup first (second screen friendly)
  const w = 720, h = 640;
  const left = Math.max(0, (window.screen.width - w) / 2);
  const top = Math.max(0, (window.screen.height - h) / 2);
  const popup = window.open(url, 'steamAuth', `width=${w},height=${h},left=${left},top=${top}`);
  if(!popup){
    // popup blocked -> full redirect
    window.location.href = url;
  }
}

async function tfPromptSteam(){
  // No more manual prompt: always use Steam OpenID.
  if(tfSteamSession.connected){
    const ok = confirm('Steam est déjà connecté. Voulez-vous déconnecter Steam pour cette session ?');
    if(!ok) return;
    try{ await fetch(`${API_BASE}/api/steam/unlink`, { method:'POST', credentials:'include' }); }catch(_){}
    tfSteamSession = { connected:false, steamid:'', profile:null };
    tfUpdateSteamBtn();
    tfPersonalization = null;
    if(tfModalOpen) renderTwitFlix();
    return;
  }
  tfConnectSteam();
}
window.tfPromptSteam = tfPromptSteam;

// Listen for popup completion
window.addEventListener('message', (ev) => {
  const data = ev?.data;
  if(!data || data.type !== 'steam:connected') return;
  if(data.ok){
    tfRefreshSteamSession().then(()=> tfLoadPersonalization().then(()=>{ if(tfModalOpen) renderTwitFlix(); }).catch(()=>{
            try{ clearTimeout(tfTrailerFallbackTimer); }catch(_){}})).catch(()=>{});
  }else{
    tfRefreshSteamSession().catch(()=>{});
    alert('Connexion Steam échouée.');
  }
});


    // ====== TWITFLIX: LIVE CAROUSEL + TRAILERS ======
    // Add YouTube video IDs here to enable embedded trailers in TwitFlix.
    // Key: game name (lowercased). Value: YouTube videoId.
    const TRAILER_MAP = {
      // examples (edit freely)
      "fortnite": "2gUtfBmw86Y",
      "minecraft": "MmB9b5njVbA",
      "league of legends": "aR-KAldshAE",
      "valorant": "e_E9W2vsRbQ",
      "apex legends": "innmNewjkuk",
      "call of duty": "o7lUq2X4y4c"
    };

    // ====== AUTO TRAILER RESOLVER (no more manual IDs) ======
    // We throttle + persist results.
    // Reason: the UI can request many trailers at once (18+ tiles) and we hit API
    // limits (YouTube/Invidious). Persisting lets us load instantly on next visit.

    const TF_TRAILER_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
    const TF_TRAILER_LS_KEY = 'oryon_tv_trailer_cache_v1';

    const tfTrailerCache = new Map(); // key -> { id, t }

    (function tfLoadTrailerCache(){
      try {
        const raw = localStorage.getItem(TF_TRAILER_LS_KEY);
        if(!raw) return;
        const obj = JSON.parse(raw);
        const now = Date.now();
        for(const k of Object.keys(obj||{})){
          const v = obj[k];
          if(v && v.id && v.t && (now - v.t) < TF_TRAILER_TTL){
            tfTrailerCache.set(k, { id: v.id, t: v.t });
          }
        }
      } catch(e) {}
    })();

    function tfPersistTrailerCache(){
      try {
        const out = {};
        for(const [k,v] of tfTrailerCache.entries()) out[k] = v;
        localStorage.setItem(TF_TRAILER_LS_KEY, JSON.stringify(out));
      } catch(e) {}
    }

    // Small promise queue to avoid firing too many parallel trailer lookups.
    const tfTrailerQueue = [];
    let tfTrailerInFlight = 0;
    const TF_TRAILER_CONCURRENCY = 2;

    function tfEnqueueTrailerLookup(fn){
      return new Promise((resolve) => {
        tfTrailerQueue.push(async () => {
          try { resolve(await fn()); } catch(e){ resolve(null); }
        });
        tfDrainTrailerQueue();
      });
    }

    async function tfDrainTrailerQueue(){
      while(tfTrailerInFlight < TF_TRAILER_CONCURRENCY && tfTrailerQueue.length){
        const job = tfTrailerQueue.shift();
        tfTrailerInFlight++;
        Promise.resolve().then(job).finally(() => {
          tfTrailerInFlight--;
          setTimeout(tfDrainTrailerQueue, 0);
        });
      }
    }

    async function tfResolveTrailerId(gameName){
      const name = String(gameName || '').trim();
      if (!name) return null;
      const key = name.toLowerCase();
      const now = Date.now();

      const cached = tfTrailerCache.get(key);
      if (cached && (now - cached.t) < TF_TRAILER_TTL) return cached.id;

      // 1) manual map still supported (instant)
      if (TRAILER_MAP[key]){
        tfTrailerCache.set(key, { id: TRAILER_MAP[key], t: now });
        return TRAILER_MAP[key];
      }

      // 2) server resolver (best, avoids CORS + no API key)
      // Throttled via a tiny queue to avoid 18 parallel calls.
      try{
        const base = name;
        const variants = [
          base,
          `${base} trailer`,
          `${base} bande annonce`,
          `${base} official trailer`,
        ];

        // bugfix: use the actual queue function name
        const resolved = await tfEnqueueTrailerLookup(async () => {
          for (const q of variants){
            const url = `${API_BASE}/api/youtube/trailer?q=${encodeURIComponent(q)}&hl=fr&gl=FR`;
            const r = await fetch(url, { cache: 'no-store' });
            if (!r.ok) continue;
            const d = await r.json();
            if (d && d.success && d.videoId) return d.videoId;
          }
          return null;
        });

        if (resolved){
          tfTrailerCache.set(key, { id: resolved, t: now });
          // bugfix: use the actual persist function name
          tfPersistTrailerCache();
          return resolved;
        }
      }catch(_){}

      tfTrailerCache.set(key, { id: null, t: now });
      // bugfix: use the actual persist function name
      tfPersistTrailerCache();
      return null;
    }


    function tfBindHorizontalWheel(el){
      if (!el || el.__wheelBound) return;
      el.__wheelBound = true;
      el.addEventListener('wheel', (e) => {
        // Convert vertical wheel to horizontal scroll (like Twitch)
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          el.scrollLeft += e.deltaY;
          e.preventDefault();
        }
      }, { passive: false });
    }

    // Public-domain anime rail (small loop previews + click to open a large player)
    
    // Public-domain rail — The Lone Ranger (Archive.org) + click to open a large player
    
    // Robust fetch helper: handles non-JSON responses and exposes HTTP status for UX debugging
    async function tfFetchJsonSafe(url, opts){
      const o = Object.assign({ cache:'no-store', credentials:'include' }, opts||{});
      try{
        const r = await fetch(url, o);
        const ct = (r.headers.get('content-type') || '').toLowerCase();
        const txt = await r.text();
        let j = null;
        if (ct.includes('application/json')){
          try{ j = JSON.parse(txt); }catch(_){}
        }else{
          // Try parse anyway (some servers forget content-type)
          try{ j = JSON.parse(txt); }catch(_){}
        }
        return { ok:r.ok, status:r.status, json:j, text:txt };
      }catch(e){
        return { ok:false, status:0, json:null, text:String(e && e.message ? e.message : e) };
      }
    }
    function tfErrMsg(resp){
      if(!resp) return 'Erreur réseau';
      if(resp.status===0) return 'Erreur réseau';
      const msg = resp.json && (resp.json.error || resp.json.message);
      return `HTTP ${resp.status}${msg ? ' — ' + msg : ''}`;
    }
// Unified player modal (used for Public Domain anime + Twitch clip "trailers")
function tfOpenAnimeModal({ title='', year='', src='', embed='', thumb='' }={}){
  try{
    // Close existing
    const old = document.getElementById('tf-player-modal');
    if (old) old.remove();
    const overlay = document.createElement('div');
    overlay.id = 'tf-player-modal';
    overlay.className = 'tf-player-overlay';
    overlay.innerHTML = `
      <div class="tf-player-sheet" role="dialog" aria-modal="true">
        <button class="tf-player-close" aria-label="Fermer">✕</button>
        <div class="tf-player-head">
          <div class="tf-player-title">${escapeHtml(title || 'Lecture')}</div>
          <div class="tf-player-sub">${escapeHtml([year && year.trim(), 'Lecture intégrée'].filter(Boolean).join(' • '))}</div>
        </div>
        <div class="tf-player-media" id="tf-player-media"></div>
        <div class="tf-player-foot">
          ${embed ? `<a class="tf-player-link" href="${tfEsc(embed)}" target="_blank" rel="noopener">Ouvrir la source</a>` : ``}
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const media = overlay.querySelector('#tf-player-media');
    const close = ()=>{ overlay.remove(); };

    overlay.addEventListener('click', (e)=>{ if(e.target === overlay) close(); });
    overlay.querySelector('.tf-player-close')?.addEventListener('click', (e)=>{ e.preventDefault(); close(); });

    // Prefer MP4 source if provided.
    if (src){
      const v = document.createElement('video');
      v.controls = true;
      v.autoplay = true;
      v.playsInline = true;
      v.preload = 'metadata';
      v.style.width = '100%';
      v.style.height = '100%';
      v.style.background = '#000';
      if (thumb) v.poster = thumb;
      const s = document.createElement('source');
      s.src = src;
      s.type = 'video/mp4';
      v.appendChild(s);
      media.appendChild(v);
    } else if (embed){
      const ifr = document.createElement('iframe');
      ifr.src = embed;
      ifr.allow = 'autoplay; fullscreen; picture-in-picture';
      ifr.referrerPolicy = 'origin-when-cross-origin';
      ifr.loading = 'lazy';
      ifr.style.width='100%';
      ifr.style.height='100%';
      ifr.style.border='0';
      media.appendChild(ifr);
    } else {
      media.innerHTML = `<div class="tf-empty">Aucune source vidéo disponible.</div>`;
    }
  }catch(e){
    console.error('[tfOpenAnimeModal]', e);
  }
}

async function tfInitPublicDomainAnimeRail(){
      const rail = document.getElementById('tf-anime-carousel');
      if(!rail || rail.__animeBound) return;
      rail.__animeBound = true;

      const bindCards = ()=>{
        rail.querySelectorAll('.tf-card.tf-anime').forEach(card => {
          if(card.__bound) return;
          card.__bound = true;
          card.addEventListener('click', (e)=>{
            e.preventDefault();
            const title = card.getAttribute('data-anime-title') || 'Épisode';
            const year = card.getAttribute('data-anime-year') || '';
            const src = card.getAttribute('data-anime-src') || '';
            const embed = card.getAttribute('data-anime-embed') || '';
            const thumb = card.getAttribute('data-anime-thumb') || '';
            tfOpenAnimeModal({ title, year, src, embed, thumb });
          });
        });
      };

      try{
        const SERIES = {
          'lone-ranger': { endpoint: '/api/public-domain/lone-ranger', title: 'Lone Ranger', yearHint: '1966' },
          'superman': { endpoint: '/api/public-domain/superman-fleischer', title: 'Superman (Fleischer)', yearHint: '1941' },
          'popeye': { endpoint: '/api/public-domain/popeye', title: 'Popeye', yearHint: '' },
          'felix': { endpoint: '/api/public-domain/felix', title: 'Felix le Chat', yearHint: '' },
        };

        const tabs = document.querySelectorAll('[data-anime-series]');
        const setActiveTab = (key)=>{
          tabs.forEach(b=>{
            b.classList.toggle('tf-chip-active', (b.getAttribute('data-anime-series')===key));
          });
          try{ localStorage.setItem('tf_anime_series', key); }catch(_){}
        };

        const animeCache = (rail.__animeCache ||= new Map());

        const renderSeries = async (key)=>{
          const cfg = SERIES[key] || SERIES['lone-ranger'];
          key = (SERIES[key] ? key : 'lone-ranger');
          setActiveTab(key);

          // loader
          rail.innerHTML = `<div class="tf-trailer-fallback" style="min-width:360px">Chargement…</div>`;

          // cache (client) 5 min
          const cached = animeCache.get(key);
          if(cached && (Date.now()-cached.ts) < 5*60*1000){
            rail.innerHTML = cached.html;
            bindCards();
            // autoplay previews
            try{
              rail.querySelectorAll('video[data-autoplay]').forEach(v=>{ try{ v.play().catch(()=>{});}catch(_){}} );
            }catch(_){}
            return;
          }

          const r = await fetch(`${API_BASE}${cfg.endpoint}`, { cache:'no-store', credentials:'include' });
          const txt = await r.text();
          let j = null;
          try{ j = JSON.parse(txt); }catch(_){}

          if(!r.ok){
            rail.innerHTML = `<div class="tf-empty">${tfHttpErrText({ ok:false, status:r.status, json:j })}</div>`;
            return;
          }
          if(!j || !j.ok || !j.data || !Array.isArray(j.data.items) || j.data.items.length === 0){
            rail.innerHTML = `<div class="tf-empty">Aucun épisode disponible.</div>`;
            return;
          }

          const items = j.data.items.slice(0, 18); // limite UX
          const cards = items.map((it)=>{
            const title = tfEsc(it.title || 'Épisode');
            const year = tfEsc(it.year || cfg.yearHint || '');
            const mp4 = it.mp4 ? String(it.mp4) : '';
            const embed = it.embed ? String(it.embed) : '';
            const thumb = it.thumb ? String(it.thumb) : '';
            const src = mp4 || '';
            const preview = src
              ? `<video data-autoplay muted playsinline preload="metadata" loop style="width:100%;height:100%;object-fit:cover;border-radius:16px" src="${src}"></video>`
              : (thumb ? `<img alt="${title}" src="${thumb}" style="width:100%;height:100%;object-fit:cover;border-radius:16px">` : `<div class="tf-card-img"></div>`);
            return `
              <a class="tf-card tf-anime" href="#" data-anime-title="${title}" data-anime-year="${year}" data-anime-src="${tfEsc(src)}" data-anime-embed="${tfEsc(embed)}" data-anime-thumb="${tfEsc(thumb)}" style="min-width:260px">
                <div class="tf-card-img" style="position:relative;overflow:hidden;border-radius:16px">${preview}</div>
                <div class="tf-card-meta">
                  <div class="tf-card-title">${title}</div>
                  <div class="tf-card-sub">${year}</div>
                </div>
              </a>
            `;
          }).join('');

          rail.innerHTML = cards;
          animeCache.set(key, { ts: Date.now(), html: rail.innerHTML });
          bindCards();
          // autoplay previews
          try{
            rail.querySelectorAll('video[data-autoplay]').forEach(v=>{ try{ v.play().catch(()=>{});}catch(_){}} );
          }catch(_){}
        };

        // bind tabs once
        if(!rail.__animeTabsBound){
          rail.__animeTabsBound = true;
          tabs.forEach(btn=>{
            btn.addEventListener('click', ()=>{
              const key = btn.getAttribute('data-anime-series');
              renderSeries(key);
            });
          });
        }

        let initial = 'lone-ranger';
        try{ initial = localStorage.getItem('tf_anime_series') || initial; }catch(_){}
        // if HTML marks one active, honor it
        const activeBtn = Array.from(tabs).find(b=>b.classList.contains('tf-chip-active'));
        if(activeBtn) initial = activeBtn.getAttribute('data-anime-series') || initial;

        await renderSeries(initial);

      }catch(e){
        wrap.innerHTML = `<div class="tf-empty">Erreur chargement des clips (${tfEsc(tfErrMsg(resp))}).</div>`;
      }
    }

async function tfRenderTrailerCarousel(){
      const wrap = document.getElementById('tf-trailer-carousel');
      if (!wrap) return;

      tfBindHorizontalWheel(wrap);
      wrap.innerHTML = '';

      // Prefer the currently featured game (hero). Fallback to first "game-like" category.
      const blacklist = /^(just chatting|irl|music|special events|talk shows|podcasts|sports)$/i;
      let gameId = String(tfCurrentGameId || '').trim();
      let gameName = String(tfCurrentGameName || '').trim();

      if(!gameId){
        const cats = Array.isArray(tfAllCategories) ? tfAllCategories : [];
        const pick = cats.find(c=>c && c.id && c.name && !blacklist.test(String(c.name||'').trim()));
        if(pick){
          gameId = String(pick.id);
          gameName = String(pick.name||'');
        }
      }

      if(!gameId){
        wrap.innerHTML = '<div class="tf-empty">Chargement…</div>';
        return;
      }

      // Load multiple clips in one call for better UX.
      let resp = null;
      try{
        resp = await tfFetchJsonSafe(`${API_BASE}/api/twitch/clips/by-game?game_id=${encodeURIComponent(gameId)}&limit=8`);
        const j = resp && resp.json;
        const items = (j && j.success && Array.isArray(j.items)) ? j.items : [];
        if(!items.length){
          wrap.innerHTML = `<div class="tf-empty">Aucun trailer dispo pour ${escapeHtml(gameName||'ce jeu')}.</div>`;
          return;
        }

        items.slice(0,6).forEach((it)=>{
          const thumb = String(it.thumbnail_url || '');
          const src = String(it.mp4 || '');
          const title = String(it.title || gameName || 'Trailer');
          const card = document.createElement('div');
          card.className = 'tf-trailer-card tf-clip-card';
          if(src){
            card.innerHTML = `
              <div class="tf-clip-badge">TRAILER</div>
              <video class="tf-clip-video" muted playsinline autoplay loop preload="metadata" poster="${tfEsc(thumb)}">
                <source src="${tfEsc(src)}" type="video/mp4">
              </video>
              <div class="tf-clip-title">${tfEsc(title)}</div>
            `;
            card.addEventListener('click', (e)=>{
              e.preventDefault();
              tfOpenAnimeModal({ title, year:'', src, embed:(it.url||''), thumb });
            });
          } else {
            card.innerHTML = `
              <div class="tf-trailer-fallback">
                <div>
                  <div style="font-weight:800;margin-bottom:6px">${escapeHtml(gameName || 'Trailer')}</div>
                  <div style="opacity:.75">Aucun clip lisible</div>
                </div>
              </div>
            `;
          }
          wrap.appendChild(card);
        });
      }catch(_){
        wrap.innerHTML = `<div class="tf-empty">Erreur trailers (${escapeHtml(tfErrMsg(resp || null))}).</div>`;
      }
    }


