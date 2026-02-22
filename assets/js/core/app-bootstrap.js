
// --- ORYON: ensure fetchJSON is globally available (used by multiple modules) ---
window.fetchJSON = window.fetchJSON || (async function(url, opts){
  const res = await fetch(url, Object.assign({ credentials: "include" }, opts || {}));
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (!res.ok) {
    const body = ct.includes("application/json") ? await res.json().catch(()=>null) : await res.text().catch(()=>"");
    const err = new Error((body && body.error) ? body.error : ((typeof body === "string" && body) ? body : ("HTTP " + res.status)));
    err.status = res.status;
    err.body = body;
    throw err;
  }
  if (ct.includes("application/json")) return res.json();
  const t = await res.text();
  try { return JSON.parse(t); } catch(e) { /* not json */ }
  return t;
});
// -------------------------------------------------------------------------------
/* ORYON TV app-bootstrap v12 IA direct anime (no YT embed) */
const API_BASE = window.location.origin;
    const __urlParams = new URLSearchParams(window.location.search);
    const TWITCH_PARENT = __urlParams.get('parent') || window.location.hostname;

// --- IA helpers safety (v13) ---
// Certains builds appellent iaItemFromIdentifier sans que le helper soit présent (ordre de chargement / merge).
// On garantit des fallback simples basés sur l'embed Archive.org.
if (typeof window.iaThumb !== 'function') {
  window.iaThumb = function iaThumb(identifier){
    return `https://archive.org/services/img/${encodeURIComponent(identifier)}`;
  };
}
if (typeof window.iaEmbed !== 'function') {
  window.iaEmbed = function iaEmbed(identifier){
    return `https://archive.org/embed/${encodeURIComponent(identifier)}`;
  };
}
if (typeof window.iaItemFromIdentifier !== 'function') {
window.iaItemFromIdentifier = async function iaItemFromIdentifier(identifier, fallbackTitle){
    return {
      title: fallbackTitle || identifier,
      identifier,
      mp4: '',
      thumb: window.iaThumb(identifier),
      embedUrl: window.iaEmbed(identifier),
      sourceLabel: 'Archive.org'
    };
  };
}
// --------------------------------


// =========================================================
// Global API fetch guard: single-flight + concurrency limit + 429 backoff
// =========================================================
const __apiInflight = new Map();       // key -> Promise
const __apiCooldownUntil = new Map();  // key -> timestamp (ms)
let __apiActive = 0;
const __apiQueue = [];

function __apiKey(url, opts){
  const method = (opts && opts.method) ? String(opts.method).toUpperCase() : 'GET';
  return method + ' ' + String(url);
}
function __apiNow(){ return Date.now(); }
function __apiSleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function __apiAcquire(){
  if(__apiActive < 4){ __apiActive++; return; }
  await new Promise(res => __apiQueue.push(res));
  __apiActive++;
}
function __apiRelease(){
  __apiActive = Math.max(0, __apiActive - 1);
  const next = __apiQueue.shift();
  if(next) next();
}

async function __apiFetch(url, opts){
  const key = __apiKey(url, opts);
  const until = __apiCooldownUntil.get(key) || 0;
  if(__apiNow() < until){
    // Respect cooldown: don't spam server.
    return new Response(null, { status: 429, statusText: 'Cooldown' });
  }
  if(__apiInflight.has(key)) return __apiInflight.get(key);

  const p = (async ()=>{
    await __apiAcquire();
    try{
      const res = await fetch(url, opts);
      if(res.status === 429){
        const ra = res.headers.get('Retry-After');
        const waitMs = ra && !isNaN(parseInt(ra,10)) ? Math.max(1000, parseInt(ra,10)*1000) : 15000;
        __apiCooldownUntil.set(key, __apiNow() + waitMs);
      }
      return res;
    } finally {
      __apiRelease();
    }
  })().finally(()=>__apiInflight.delete(key));

  __apiInflight.set(key, p);
  return p;
}

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
          const response = await fetch(`${API_BASE}/firebase_status`, { cache: 'no-store' });
          let data = null;
if (response.status === 304) {
  data = { connected: true, message: 'cached' };
} else {
  const txt = await response.text();
  try { data = JSON.parse(txt); } catch(_) { data = { connected: false, message: txt?.slice(0,200) }; }
}
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
        document.getElementById('hub-user-display').innerText = data.display_name;

        document.getElementById('btn-auth').classList.add('hidden');
        document.getElementById('user-area').classList.remove('hidden');

        document.getElementById('user-name').innerText = data.display_name;
        if (data.profile_image_url) document.getElementById('user-avatar').src = data.profile_image_url;

        // Billing / credits (user space)
        await loadBillingMe().catch(()=>{});

        await loadFollowed();
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
        if (data.is_connected) { clearInterval(check); location.reload(); }
      }, 1000);
    }

    function logout() { fetch(`${API_BASE}/twitch_logout`, { method:'POST' }).then(()=>location.reload()); }

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
    tfRefreshSteamSession().then(()=> tfLoadPersonalization().then(()=>{ if(tfModalOpen) renderTwitFlix(); }).catch(()=>{})).catch(()=>{});
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

    ;(function tfLoadTrailerCache(){
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

    // LIVE banner should show enough distinct games (Netflix-like "EN LIVE")
    // We source it from real streams (FR + 20–200 viewers) and keep one per game for diversity.
    async function tfRenderLiveCarousel(){
      const wrap = document.getElementById('tf-live-carousel');
      if (!wrap) return;
      tfBindHorizontalWheel(wrap);

      wrap.innerHTML = '<div class="tf-empty">Chargement des lives…</div>';
      try{
        // Primary target: FR small/mid streams
        let items = [];
        const primary = await fetch(`/api/twitch/streams/top?lang=fr&minViewers=20&maxViewers=200&limit=40`, { credentials:'include' });
        const pd = primary.ok ? await primary.json() : null;
        items = (pd && Array.isArray(pd.items)) ? pd.items : [];

        // Fallback: widen viewer range (still FR)
        if (!items.length){
          const fb1 = await fetch(`/api/twitch/streams/top?lang=fr&minViewers=5&maxViewers=800&limit=40`, { credentials:'include' });
          const fd1 = fb1.ok ? await fb1.json() : null;
          items = (fd1 && Array.isArray(fd1.items)) ? fd1.items : [];
        }

        // Fallback: any language (keeps the rail populated rather than empty)
        if (!items.length){
          const fb2 = await fetch(`/api/twitch/streams/top?minViewers=5&maxViewers=800&limit=40`, { credentials:'include' });
          const fd2 = fb2.ok ? await fb2.json() : null;
          items = (fd2 && Array.isArray(fd2.items)) ? fd2.items : [];
        }

        if (!items.length){
          wrap.innerHTML = '<div class="tf-empty">Aucun live trouvé pour le moment.</div>';
          return;
        }

        wrap.innerHTML = '';
        for(const s of items){
          const gameId = String(s.game_id || '');
          const gameName = String(s.game_name || 'Jeu');
          const boxArt = tfNormalizeBoxArt(s.box_art_url || '');
          const channel = String(s.user_login || '').trim();
          if(!gameId || !channel) continue;

          const card = document.createElement('div');
          card.className = 'tf-live-card';
          card.dataset.gameId = gameId;
          card.dataset.channel = channel;
          card.dataset.__previewChannel = channel; // used by tfStartPreview

          card.innerHTML = `
            <div class="tf-live-thumb" style="background-image:url('${boxArt}')">
              <div class="tf-preview"></div>
              <div class="tf-live-badge">EN LIVE</div>
            </div>
            <div class="tf-live-meta">
              <div class="t1">${escapeHtml(gameName)}</div>
              <div class="t2">${escapeHtml(s.user_name || channel)} · ${Number(s.viewer_count||0)} viewers</div>
            </div>
          `;

          // Preview on hover: direct channel preview
          card.addEventListener('mouseenter', () => tfStartPreview(card));
          card.addEventListener('mouseleave', () => tfStopPreview(card));

          // Click => launch that channel immediately (no extra selection step)
          card.addEventListener('click', (e) => {
            e.preventDefault();
            try{ closeTwitFlix(); }catch(_){ }
            // Use the main player loader (live)
            try{ loadPlayerEmbed(channel); }catch(_){ }
            try{ window.scrollTo({ top: 0, behavior: 'smooth' }); }catch(_){ }
          });

          wrap.appendChild(card);
        }
      }catch(_){
        wrap.innerHTML = '<div class="tf-empty">Erreur chargement des lives.</div>';
      }
    }

    function tfRenderTrailerCarousel(){
      const wrap = document.getElementById('tf-trailer-carousel');
      if (!wrap) return;

      tfBindHorizontalWheel(wrap);

      const cats = Array.isArray(tfAllCategories) ? tfAllCategories.slice(0, 18) : [];
      wrap.innerHTML = '';

      if (!cats.length){
        wrap.innerHTML = '<div class="tf-empty">Chargement des trailers…</div>';
        return;
      }

      cats.forEach(cat => {
        const gameName = String(cat.name || '').trim();
        const key = gameName.toLowerCase();
        const vid = TRAILER_MAP[key];

        const card = document.createElement('div');
        card.className = 'tf-trailer-card';

        if (vid){
          card.innerHTML = `
            <iframe
              src="https://www.youtube.com/embed/${encodeURIComponent(vid)}?rel=0&modestbranding=1&playsinline=1&mute=1&origin=${encodeURIComponent(location.origin)}"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              loading="lazy"
              title="Trailer - ${gameName}" allowfullscreen referrerpolicy="strict-origin-when-cross-origin">
            </iframe>
          `;
        } else {
          card.innerHTML = `
            <div class="tf-trailer-fallback">
              <div>
                <div style="font-weight:800;margin-bottom:6px">${gameName || 'Trailer'}</div>
                <div style="opacity:.85">
                  Recherche du trailer…<br/>
                  <span style="opacity:.7;font-size:12px">On tente une récupération automatique.</span>
                </div>
              </div>
            </div>
          `;

          // Auto-resolve, then swap in the iframe
          tfResolveTrailerId(gameName).then((autoId)=>{
            if (!autoId){
              // Show a deterministic end state instead of a forever-loading card.
              const meta = card.querySelector('.tf-trailer-meta');
              if(meta){
                meta.innerHTML = `
                  <div class="tf-title">${gameName}</div>
                  <div class="tf-sub">Trailer introuvable</div>
                `;
              }
              card.classList.add('tf-no-trailer');
              return;
            }
            card.innerHTML = `
              <iframe
                src="https://www.youtube.com/embed/${encodeURIComponent(autoId)}?rel=0&modestbranding=1&playsinline=1&mute=1&origin=${encodeURIComponent(location.origin)}"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                loading="lazy"
                title="Trailer - ${gameName}" allowfullscreen referrerpolicy="strict-origin-when-cross-origin">
              </iframe>
            `;
          }).catch(()=>{});
        }

        wrap.appendChild(card);
      });
    }

    let tfCursor = null;
    let tfLoading = false;
    let tfHasMore = true;
    let tfLastLoadAt = 0;

    let tfSearchQuery = '';
    let tfSearchResults = [];
    let tfVodResults = [];
    let tfTopVodResults = [];
    let tfTopVodLoading = false;
    let tfTopVodLoadedAt = 0;
    let tfVodTimer = null;
    let tfSearchTimer = null;

    let tfObserver = null;

    // Preview cache
    const tfPreviewCache = new Map(); // gameId -> {channel, t}
    const tfPreviewInflight = new Map();
    const TF_PREVIEW_TTL = 10 * 60 * 1000;

    function tfNormalizeTwitchThumb(url){
      const u = String(url||'');
      if(!u) return '';
      // Twitch thumbnails use {width}x{height}
      return u.replace('%{width}','1000').replace('%{height}','562').replace('{width}','1000').replace('{height}','562');
    }

function tfNormalizeBoxArt(url){
  // Force higher-res boxarts to avoid "blurry" upscale in the ORYON TV rows.
  // Uses devicePixelRatio to request sharper images on HiDPI screens.
  const u = String(url || '');
  if (!u) return '';

  const dpr = Math.min(2, (window.devicePixelRatio || 1));
  const desiredW = Math.round(900 * dpr);
  const desiredH = Math.round(1200 * dpr);

  let out = u
    .replace(/%\{width\}|\{width\}/g, String(desiredW))
    .replace(/%\{height\}|\{height\}/g, String(desiredH));

  // If the provider uses fixed dimensions in the path (e.g. "-285x380.jpg"), upgrade them.
  out = out.replace(/-(\d{2,4})x(\d{2,4})\.(jpg|jpeg|png|webp)\b/gi, `-${desiredW}x${desiredH}.$3`);

  // IGDB size upgrades (if IGDB covers)
  out = out.replace(/\/t_thumb\//g,'/t_cover_big_2x/')
           .replace(/\/t_cover_small\//g,'/t_cover_big_2x/')
           .replace(/\/t_cover_big\//g,'/t_cover_big_2x/');

  // Common query params
  out = out.replace(/([?&])w=\d+/g,'$1w=' + desiredW)
           .replace(/([?&])h=\d+/g,'$1h=' + desiredH);

  return out;
}


    function setTwitFlixView(mode){
      tfViewMode = (mode === 'az') ? 'az' : 'rows';
      const bRows = document.getElementById('tf-btn-rows');
      const bAz = document.getElementById('tf-btn-az');
      if (bRows && bAz){
        bRows.classList.toggle('active', tfViewMode === 'rows');
        bAz.classList.toggle('active', tfViewMode === 'az');
      }
      renderTwitFlix();
    }

    async function openTwitFlix(){
  document.body.classList.add('modal-open');
const modal = document.getElementById('twitflix-modal');
      const host = document.getElementById('twitflix-grid');

      // ORYON TV: delegated click safety-net (keeps everything clickable)
      // - game cards: open the Netflix-like info modal
      // - live cards: open stream
      // - VOD cards: open VOD
      // This runs in capture phase to avoid drag/overlay interference.
      try{
        const __grid = document.getElementById('twitflix-grid');
        if(__grid && !__grid.dataset.oryonClickDelegate){
          __grid.dataset.oryonClickDelegate = '1';
          __grid.addEventListener('click', (e)=>{
            const card = e.target.closest && e.target.closest('.tf-card');
            if(!card) return;

            // VOD
            const vodId = card.dataset && card.dataset.vodId;
            if(vodId){
              e.preventDefault(); e.stopPropagation();
              try{ closeTwitFlix(); }catch(_){ }
              try{ loadVodEmbed(String(vodId).replace(/^v/i,'')); }catch(_){ }
              try{ window.scrollTo({ top: 0, behavior: 'smooth' }); }catch(_){ }
              return;
            }

            // Live
            const ch = card.dataset && (card.dataset.channel || card.dataset.__previewChannel);
            if(ch && !card.dataset.gameId){
              e.preventDefault(); e.stopPropagation();
              try{ closeTwitFlix(); }catch(_){ }
              try{ loadPlayerEmbed(String(ch)); }catch(_){ }
              try{ window.scrollTo({ top: 0, behavior: 'smooth' }); }catch(_){ }
              return;
            }

            // Game
            const gid = card.dataset && card.dataset.gameId;
            if(gid){
              // If the card already has its own onclick it will run anyway, but we keep this as a fallback.
              e.preventDefault();
              try{ card.onclick && card.onclick(); }catch(_){ }
              return;
            }
          }, true);
        }
      }catch(_){ }
      const search = document.getElementById('twitflix-search');

      tfModalOpen = true;
      modal.classList.add('active');

      // NOTE: VOD are now contextual to games (via mode switch). No global Top VOD preload.

      document.body.classList.add('tf-bigpicture'); tfBigPicture = true; tfViewMode='rows';

      // TwitFlix intro (Netflix-like) — stylized, minimal
	try{
	  // UX hotfixes (search blur + clickability)
	  if (!document.getElementById('tf-ux-hotfix')){
	    const st = document.createElement('style');
	    st.id = 'tf-ux-hotfix';
	    st.textContent = `
	      /* sharper posters */
	      .tf-card .tf-poster{ image-rendering:auto; filter:none !important; transform:none !important; backface-visibility:hidden; }\n\t      .tf-card{ transform: translateZ(0); }
	      .tf-card{ overflow: hidden; }
	      /* VOD aesthetics */
	      /* VOD cards are landscape (true video covers) to avoid empty black space */
	      .tf-card.tf-is-vod{ flex: 0 0 320px; aspect-ratio: 16/9; }
	      body.tf-bigpicture #twitflix-modal .tf-card.tf-is-vod{ width: 320px; height: auto; }
	      .tf-card.tf-is-vod .tf-poster{ width:100%; height:100%; object-fit:cover; }
	      .tf-card.tf-is-vod .tf-name{ font-size: 13px; line-height: 1.15; }
	      .tf-card.tf-is-vod .tf-subline{ margin-top: 6px; font-size: 11px; opacity: .85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	      .tf-card.tf-is-vod .tf-overlay{ background: linear-gradient(to top, rgba(0,0,0,.85), rgba(0,0,0,.35), rgba(0,0,0,0)); }
	      .tf-card.tf-is-vod .tf-vod-badge{ position:absolute; top:10px; left:10px; padding:4px 8px; border-radius: 999px; font-size: 11px; background: rgba(0,0,0,.65); border: 1px solid rgba(255,255,255,.12); backdrop-filter: blur(4px); }
	      /* Row scroll indicator (Netflix-like bar) */
	      .tf-row{ position: relative; }
	      .tf-row .tf-row-bar{ height:6px; margin-top:10px; width: 520px; max-width: 70vw; border-radius: 999px; background: rgba(255,255,255,.10); overflow:hidden; }
	      .tf-row .tf-row-bar .tf-row-bar-thumb{ height:100%; width: 20%; border-radius: 999px; background: rgba(255,255,255,.35); transform: translateX(0); transition: transform .08s linear; }
	      .tf-row .tf-row-bar.is-hidden{ display:none; }
	      /* overlays must not steal mouse clicks */
	      .tf-card .tf-overlay, .tf-card .tf-preview{ pointer-events:none !important; }
      .tf-card .tf-actions-row, .tf-card .tf-actions-row *{ pointer-events:auto !important; }
	      /* keep images crisp when scaled */
	      .tf-card .tf-poster{ transform: translateZ(0); backface-visibility:hidden; }
	      /* Global mode switch removed (too complex). Mode is handled inside the drawer. */
	      .tf-modebar{ display:none !important; }
	      .tf-modebar .tf-mode-title{ font-weight:900; letter-spacing:.6px; opacity:.92; }
	      .tf-seg{ display:inline-flex; border:1px solid rgba(255,255,255,.14); border-radius: 999px; overflow:hidden; background: rgba(0,0,0,.35); backdrop-filter: blur(8px); }
	      .tf-seg button{ appearance:none; border:0; background:transparent; color: rgba(255,255,255,.78); padding:8px 14px; font-weight:900; letter-spacing:.5px; font-size: 12px; cursor:pointer; }
	      .tf-seg button.active{ background: rgba(0,242,234,.16); color: #00f2ea; }
	      .tf-seg button:not(.active):hover{ background: rgba(255,255,255,.06); }
	      /* Drawer results row under game rails */
	      .tf-drawer{ margin-top: 10px; padding: 0; }
	      .tf-drawer .tf-row-title{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
	      .tf-chips{ display:flex; gap:8px; flex-wrap:wrap; }
	      .tf-chip{ padding:6px 10px; border-radius:999px; font-size:11px; font-weight:900; border:1px solid rgba(255,255,255,.14); background: rgba(0,0,0,.35); color: rgba(255,255,255,.78); cursor:pointer; }
	      .tf-chip.active{ background: rgba(0,242,234,.16); color:#00f2ea; border-color: rgba(0,242,234,.32); }
	      .tf-card.tf-is-live{ flex:0 0 320px; aspect-ratio: 16/9; }
	      .tf-card.tf-is-live .tf-poster{ width:100%; height:100%; object-fit:cover; }
	      .tf-card.tf-is-live .tf-live-badge{ position:absolute; top:10px; left:10px; padding:4px 8px; border-radius:999px; font-size:11px; background: rgba(255,0,72,.18); border:1px solid rgba(255,0,72,.35); color: #ff4b6e; backdrop-filter: blur(4px); font-weight:900; }
	      .tf-card.tf-is-live .tf-subline{ margin-top: 6px; font-size: 11px; opacity: .85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	    `;
	    document.head.appendChild(st);
	  }
  let intro = document.getElementById('twitflix-intro');
  if(!intro){
    intro = document.createElement('div');
    intro.id = 'twitflix-intro';
    intro.className = 'tf-intro';
    intro.innerHTML = `
      <div class="tf-intro-box">
        <div class="tf-scanline"></div>
        <div class="tf-intro-logo">TWITFLIX</div>
        <div class="tf-intro-sub">Mode Netflix • Chargement des streams</div>
      </div>
    `;
    document.body.appendChild(intro);
  }
  intro.classList.remove('outro');
  intro.classList.add('active');
  setTimeout(()=>{ intro.classList.remove('active'); }, 1200);
}catch(_){}// reset
      tfViewMode = 'rows';
      tfAllCategories = [];
      tfCursor = null;
      tfLoading = false;
      tfHasMore = true;
      tfSearchQuery = '';
      tfSearchResults = [];
      if (search) search.value = '';

      // hero default
      tfSetHero({ title: 'ORYON TV', sub: 'Survole un jeu pour lancer un trailer automatique (muet). Clique pour voir LIVE/VOD.', poster: '' });

      // empty ui
      if (host){
        host.innerHTML = '<div id="tf-loading" class="tf-empty"><i class="fas fa-spinner fa-spin"></i> Chargement du catalogue...</div>';
      }

      setTwitFlixView('rows');

      // search handler (IA-assisted)
      if (search){
        search.onkeydown = async (ev)=>{
          if(ev.key === 'Enter'){
            ev.preventDefault();
            const v = String(search.value||'').trim();
            tfSearchQuery = v;
            if (tfSearchTimer) clearTimeout(tfSearchTimer);
            await tfRunSearch(v);
          }
        };
        search.oninput = (e) => {
          const v = String(e.target.value || '').trim();
          tfSearchQuery = v;

          if (tfSearchTimer) clearTimeout(tfSearchTimer);
          tfSearchTimer = setTimeout(async () => {
            await tfRunSearch(v);
          }, 180);
        };
      }

      // sentinel observer for infinite loading
      tfSetupObserver();

      // warm load (2 pages)
      await tfLoadMore(true);
      await tfLoadMore(true);

      // Steam session (OpenID) + ADN
      await tfRefreshSteamSession();
      await tfLoadPersonalization();

      tfRenderLiveCarousel();
      // Trailer carousel is hidden in the Netflix-like mode; hero is the trailer.
      try{ tfRenderTrailerCarousel(); }catch(_){ }
      renderTwitFlix();

      // Start hero cycler once some categories exist
      try{ tfStartHeroCycler(); }catch(_){ }
    }

    function closeTwitFlix(){
  document.body.classList.remove('modal-open');
  tfModalOpen = false;
  try{ tfCloseDrawer(); }catch(_){ }
  document.querySelectorAll('.tf-card.previewing').forEach(tfStopPreview);
  if (tfObserver){
    try{ tfObserver.disconnect(); }catch(_){}
    tfObserver = null;
  }
  const modal = document.getElementById('twitflix-modal');

  // Outro overlay (stylized)
  try{
    let intro = document.getElementById('twitflix-intro');
    if(intro){
      intro.classList.add('outro');
      intro.classList.add('active');
      setTimeout(()=>{ intro.classList.remove('active'); }, 520);
    }
  }catch(_){}

  // Close animation
  modal.classList.add('closing');
  setTimeout(()=>{
    modal.classList.remove('active');
    modal.classList.remove('closing');
  }, 260);
}

    function tfSetupObserver(){
      const host = document.getElementById('twitflix-grid');
      if (!host) return;

      let sentinel = document.getElementById('tf-sentinel');
      if (!sentinel){
        sentinel = document.createElement('div');
        sentinel.id = 'tf-sentinel';
        sentinel.style.height = '1px';
        host.appendChild(sentinel);
      }

      if (tfObserver){
        try{ tfObserver.disconnect(); }catch(_){}
      }

      tfObserver = new IntersectionObserver(async (entries) => {
        if (!tfModalOpen) return;
        if (tfSearchQuery) return; // no infinite scroll while searching
        if (!tfHasMore) return;
        const entry = entries && entries[0];
        if (entry && entry.isIntersecting){
          await tfLoadMore(false);
          renderTwitFlix();
        }
      }, { root: host, threshold: 0.1 });

      tfObserver.observe(sentinel);
    }


    async function tfLoadTopVods(force){
      // Global "Top VOD" selection (Netflix-like). Cached client-side to avoid spam.
      const TTL = 15 * 60 * 1000; // 15 min
      const now = Date.now();
      if (!force && tfTopVodResults.length && (now - tfTopVodLoadedAt) < TTL) return;
      if (tfTopVodLoading) return;
      tfTopVodLoading = true;
      try{
        // FR + "small creators" (best-effort) to match ORYON UX target.
        // We fetch more than we display so we can build category rails client-side.
        // 1) seedLang=fr -> get streams seeded by FR live pool (more likely to yield enough FR VODs)
        // 2) if not enough items, relax the "small" heuristic while keeping FR.
        let r = await fetch(`${API_BASE}/api/twitch/vods/top?lang=fr&seedLang=fr&small=1&maxViews=200000&limit=120`, { credentials:'include' });
        let d = await r.json().catch(()=>null);
        let items = (r.ok && d && Array.isArray(d.items)) ? d.items : [];

        if (items.length < 30){
          r = await fetch(`${API_BASE}/api/twitch/vods/top?lang=fr&seedLang=fr&limit=160`, { credentials:'include' });
          d = await r.json().catch(()=>null);
          const items2 = (r.ok && d && Array.isArray(d.items)) ? d.items : [];
          // merge, keep unique ids
          const byId = new Map();
          for (const it of [...items, ...items2]){
            if(!it || !it.id) continue;
            if(byId.has(it.id)) continue;
            byId.set(it.id, it);
          }
          items = [...byId.values()];
        }

        if (items.length){
          tfTopVodResults = items.map(v=>({
            id: v.id,
            name: `${v.title || v.game_name || 'VOD'}`,
            box_art_url: tfNormalizeTwitchThumb(v.thumbnail_url || ''),
            _vod: v
          }));
          tfTopVodLoadedAt = now;
        } else {
          tfTopVodResults = [];
        }
      }catch(_){
        tfTopVodResults = [];
      }finally{
        tfTopVodLoading = false;
      }
    }

    // Simple game->genre mapping for "Top VOD par catégories".
    // (Best-effort: Twitch does not provide a universal genre taxonomy.)
    function tfVodGenreFromGameName(gameName){
      const g = String(gameName || '').toLowerCase();
      if(!g) return '';
      // FPS
      if(/counter-?strike|cs2|valorant|apex|fortnite|call of duty|warzone|overwatch|rainbow six|tarkov|battlefield|pubg/.test(g)) return 'fps';
      // RPG / ARPG / MMO
      if(/world of warcraft|wow|diablo|path of exile|elden ring|baldur|skyrim|final fantasy|guild wars|lost ark|genshin|starfield/.test(g)) return 'rpg';
      // Fighting / combat
      if(/street fighter|tekken|mortal kombat|smash|guilty gear|dragon ball fighterz|ufc|boxing/.test(g)) return 'combat';
      return '';
    }

    function tfDecorateVodCard(card, vod){
      try{
        if(!card || !vod) return;
        card.classList.add('tf-is-vod');
        // Disable game preview for VOD cards
        card.querySelectorAll('.tf-preview').forEach(el=>{ try{ el.remove(); }catch(_){} });
        // Replace title with a shorter one for readability
        const nameEl = card.querySelector('.tf-name');
        if(nameEl){
          const t = String(vod.title || vod.game_name || 'VOD');
          nameEl.textContent = t.length > 56 ? (t.slice(0,56) + '…') : t;
          nameEl.title = t;
        }
        // Subline (channel • game • views)
        const ov = card.querySelector('.tf-overlay');
        if(ov && !ov.querySelector('.tf-subline')){
          const sub = document.createElement('div');
          sub.className = 'tf-subline';
          const ch = vod.broadcaster_name || vod.user_name || '';
          const gm = vod.game_name || '';
          const vw = vod.view_count ? `${Number(vod.view_count).toLocaleString()} vues` : '';
          sub.textContent = [ch, gm, vw].filter(Boolean).join(' • ');
          ov.insertBefore(sub, ov.querySelector('.tf-actions-row') || null);
        }
        // Badge (duration)
        if(!card.querySelector('.tf-vod-badge')){
          const b = document.createElement('div');
          b.className = 'tf-vod-badge';
          b.textContent = String(vod.duration || '').toUpperCase();
          card.appendChild(b);
        }
        // Ensure clicks open VOD (delegate already does), but prevent game click fallback
        card.onclick = null;
      }catch(_){ }
    }

    function tfDecorateLiveCard(card, live){
      try{
        if(!card || !live) return;
        card.classList.add('tf-is-live');
        // Disable game preview for live cards (we already have the content)
        card.querySelectorAll('.tf-preview').forEach(el=>{ try{ el.remove(); }catch(_){} });

        // Title
        const nameEl = card.querySelector('.tf-name');
        if(nameEl){
          const n = String(live.user_name || live.user_login || 'Live');
          nameEl.textContent = n;
          nameEl.title = n;
        }

        // Subline (game • viewers)
        const ov = card.querySelector('.tf-overlay');
        if(ov && !ov.querySelector('.tf-subline')){
          const sub = document.createElement('div');
          sub.className = 'tf-subline';
          const gm = String(live.game_name || '').trim();
          const vw = live.viewer_count ? `${Number(live.viewer_count).toLocaleString()} viewers` : '';
          sub.textContent = [gm, vw].filter(Boolean).join(' • ');
          ov.insertBefore(sub, ov.querySelector('.tf-actions-row') || null);
        }

        // Badge
        if(!card.querySelector('.tf-live-badge')){
          const b = document.createElement('div');
          b.className = 'tf-live-badge';
          b.textContent = 'LIVE';
          card.appendChild(b);
        }

        // Click => play this specific channel
        const login = String(live.user_login || '').trim();
        if(login){
          card.onclick = (e) => {
            try{ e?.preventDefault?.(); }catch(_){}
            closeTwitFlix();
            changeChannel(login);
            const badge = document.getElementById('player-mode-badge');
            if (badge) badge.innerText = 'TWITCH';
          };
        }
      }catch(_){ }
    }

    function tfBuildVodRow(titleHtml, vodItems, rowId){
      const cats = (vodItems||[]).map(v=>({
        id: v.id,
        name: v.title || v.game_name || 'VOD',
        box_art_url: tfNormalizeTwitchThumb(v.thumbnail_url || ''),
        _vod: v
      }));
      const row = tfBuildRow(titleHtml, cats, rowId);
      row.querySelectorAll('.tf-card').forEach((card, idx)=>{
        const v = vodItems[idx];
        if(!v) return;
        card.dataset.vodId = String(v.id || '').replace(/^v/i,'');
        card.dataset.platform = 'Twitch VOD';
        card.dataset.viewers = v.view_count ? String(v.view_count) : '';
        tfDecorateVodCard(card, v);
      });
      return row;
    }

    async function tfRunSearch(query){
      const q = String(query || '').trim();
      const host = document.getElementById('twitflix-grid');
      if (!host) return;

      if (!q){
        tfSearchResults = [];
        tfVodResults = [];
        renderTwitFlix();
        return;
      }

      // IA-assisted: if query is a sentence, ask the server to translate it into a curated list.
      const looksComplex = (q.length >= 22) || /\bcomme\b|\bmais\b|\bmoins\b|\bplus\b|\bstress\b|\bcraft\b/i.test(q);
      if(looksComplex){
        try{
          const r0 = await fetch(`${API_BASE}/api/search/intent`, {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ text: q })
          });
          if(r0.ok){
            const d0 = await r0.json();
            if(d0 && d0.success && Array.isArray(d0.categories)){
              tfSearchResults = d0.categories.map(c => ({
                id: c.id,
                name: c.name,
                box_art_url: tfNormalizeBoxArt(c.box_art_url || c.boxArtUrl || '')
              }));
              renderTwitFlix();
              return;
            }
          }
        }catch(_){ }
      }

      
      // Also fetch Twitch VODs by title (FR, streamers 20-200 viewers)
      try{
        const rV = await fetch(`${API_BASE}/api/twitch/vods/search?title=${encodeURIComponent(q)}&lang=fr&min=20&max=200&limit=18`);
        if(rV.ok){
          const dV = await rV.json();
          if(dV && dV.success && Array.isArray(dV.items)){
            tfVodResults = dV.items.map(v=>({
              id: v.id,
              name: `${v.title}`,
              box_art_url: tfNormalizeTwitchThumb(v.thumbnail_url || ''),
              _vod: v
            }));
          } else {
            tfVodResults = [];
          }
        } else {
          tfVodResults = [];
        }
      }catch(_){
        tfVodResults = [];
      }

// Try server search (best)
      try{
        const r = await fetch(`${API_BASE}/api/categories/search?q=${encodeURIComponent(q)}`);
        if (r.ok){
          const d = await r.json();
          if (d && d.success && Array.isArray(d.categories)){
            tfSearchResults = d.categories.map(c => ({
              id: c.id,
              name: c.name,
              box_art_url: tfNormalizeBoxArt(c.box_art_url || c.boxArtUrl || '')
            }));
            renderTwitFlix();
            return;
          }
        }
      }catch(_){}

      // Fallback: local filter on already loaded catalogue
      const low = q.toLowerCase();
      tfSearchResults = tfAllCategories
        .filter(c => (c.name||'').toLowerCase().includes(low))
        .slice(0, 120);
      renderTwitFlix();
    }

    async function tfLoadMore(force){
      if (!tfModalOpen) return;
      if (tfLoading) return;
      if (!tfHasMore) return;

      const now = Date.now();
      if (!force && (now - tfLastLoadAt) < 650) return; // throttle
      tfLastLoadAt = now;

      tfLoading = true;

      try{
        let url = `${API_BASE}/api/categories/top`;
        if (tfCursor) url += `?cursor=${encodeURIComponent(tfCursor)}`;

        const res = await fetch(url);
        const data = await res.json();

        const loader = document.getElementById('tf-loading');
        if (loader) loader.remove();

        if (data && data.success && Array.isArray(data.categories)){
          tfCursor = data.cursor || null;

          // If no cursor returned => end
          if (!tfCursor) tfHasMore = false;

          for (const cat of data.categories){
            if (!cat || !cat.id) continue;
            // prevent duplicates
            if (tfAllCategories.find(x => x.id === cat.id)) continue;
            tfAllCategories.push({
              id: cat.id,
              name: cat.name,
              box_art_url: tfNormalizeBoxArt(cat.box_art_url || '')
            });
          }
        } else {
          // stop to avoid looping “in the void”
          tfHasMore = false;
          tfRenderError('Erreur chargement du catalogue.');
        }
      } catch (e){
        tfHasMore = false;
        tfRenderError('Erreur réseau TwitFlix.');
      } finally {
        tfLoading = false;
      }
    }

    function tfRenderError(msg){
      const host = document.getElementById('twitflix-grid');
      if (!host) return;
      host.innerHTML = `
        <div class="tf-empty" style="color:#ff8080;">
          ${escapeHtml(msg || 'Erreur')}
          <div><button class="tf-retry" type="button" onclick="tfRetryLoad()">Réessayer</button></div>
        </div>
      `;
    }

    async function tfRetryLoad(){
      tfHasMore = true;
      await tfLoadMore(true);
      await tfLoadMore(true);
      tfRenderLiveCarousel();
          tfRenderTrailerCarousel();
          renderTwitFlix();
      tfSetupObserver();
    }

    function renderTwitFlix(){
      const host = document.getElementById('twitflix-grid');
      if (!host) return;

      // Keep sentinel at bottom
      const sentinel = document.getElementById('tf-sentinel');

      // SEARCH MODE
      if (tfSearchQuery && tfSearchQuery.trim()){
        host.innerHTML = '';
        const q = tfSearchQuery.trim();
        tfSetHero({ title: q, sub: 'Résultats de recherche' });

        if (!tfSearchResults.length){
          host.innerHTML = `<div class="tf-empty">Aucun résultat pour <span style="color:#00f2ea;font-weight:900;">${escapeHtml(q)}</span>.</div>`;
          
        // Twitch VOD results by title
        if (tfVodResults && tfVodResults.length){
          const vodRow = tfBuildRow(
            `<div class="tf-strip-title"><h4>VOD FR (20-200 viewers)</h4><span class="tf-strip-sub">Titre: ${escapeHtml(q)}</span></div>`,
            tfVodResults.map(x => ({ id:x.id, name:x.name, box_art_url:x.box_art_url })),
            'tf-vod-search-row'
          );
	          // attach click to play VOD inline (main player) instead of opening a new tab
          vodRow.querySelectorAll('.tf-card').forEach((card, idx)=>{
            const v = tfVodResults[idx]?._vod;
            if(!v) return;
            // store twitch video id; backend returns numeric id
            card.dataset.vodId = String(v.id || '').replace(/^v/i,'');
          });
          host.appendChild(vodRow);
        } else {
          // show small hint row when searching
          const hint = document.createElement('div');
          hint.className = 'tf-empty tf-vod-hint';
          hint.style.marginTop = '10px';
          hint.innerHTML = `VOD FR (20-200 viewers) : <span style="opacity:.8">aucun résultat</span>`;
          host.appendChild(hint);
        }

        if (sentinel) host.appendChild(sentinel);
      try{ tfAnnotateRows(); }catch(_){ }
        }

        // In Big Picture (and rows mode), render search results as a single horizontal row (Netflix/Steam style)
        if (document.body.classList.contains('tf-bigpicture') || tfViewMode === 'rows'){
          const row = tfBuildRow(`<div class="tf-strip-title"><h4>Résultats</h4><span class="tf-strip-sub">${escapeHtml(q)}</span></div>`, tfSearchResults, 'tf-search-row');
          host.appendChild(row);
        } else {
          const grid = document.createElement('div');
          grid.className = 'tf-search-grid';
          tfSearchResults.forEach(cat => grid.appendChild(tfBuildCard(cat)));
          host.appendChild(grid);
        }
        if (sentinel) host.appendChild(sentinel);
        return;
      }

      // CATALOG MODE
      host.innerHTML = '';
      tfSetHero({ title: 'ORYON TV', sub: 'Choisis un jeu. LIVE et VOD (petits créateurs) — interface Netflix.' });
      try{ tfRenderHeroMedia(); }catch(_){ }

      const list = tfAllCategories.slice(0);
      if (!list.length){
        host.innerHTML = '<div class="tf-empty"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>';
        if (sentinel) host.appendChild(sentinel);
        return;
      }
      // Netflix-like catalogue: no global mode bar (game click opens an info modal with LIVE/VOD).
      // Ensure featured hero preview is loaded.
      try{ tfEnsureFeaturedHero(); }catch(_){ }


      // VOD are now contextual to game rails (via the LIVE/VOD/PREVIEW switch). No global Top VOD row.

      if (tfViewMode === 'az'){
        tfRenderAZ(host, list);
      } else {
        tfRenderRows(host, list);
      }

      if (!tfHasMore){
        const end = document.createElement('div');
        end.className = 'tf-end';
        end.innerHTML = 'Fin du catalogue.';
        host.appendChild(end);
      } else if (tfLoading){
        const loading = document.createElement('div');
        loading.className = 'tf-empty';
        loading.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Chargement...';
        host.appendChild(loading);
      }

      if (sentinel) host.appendChild(sentinel);
    }

    function tfBuildModeBar(){
      const bar = document.createElement('div');
      bar.className = 'tf-modebar';
      bar.innerHTML = `
        <div class="tf-mode-title">CONTENU</div>
        <div class="tf-seg" role="tablist" aria-label="Mode contenu">
          <button type="button" data-mode="live">LIVE</button>
          <button type="button" data-mode="vod">VOD</button>
          <button type="button" data-mode="preview">PREVIEW</button>
        </div>
      `;

      const btns = Array.from(bar.querySelectorAll('button[data-mode]'));
      const sync = () => {
        btns.forEach(b => b.classList.toggle('active', b.dataset.mode === tfContentMode));
      };
      sync();

      btns.forEach(b => {
        b.addEventListener('click', (e)=>{
          e.preventDefault();
          const m = String(b.dataset.mode || 'live');
          if (m === tfContentMode) return;
          tfContentMode = m;
          tfCloseDrawer();
          // Re-render cards to update CTA labels
          try{ renderTwitFlix(); }catch(_){ }
        });
      });

      return bar;
    }

    function tfCloseDrawer(){
      try{
        const existing = document.getElementById('tf-drawer');
        if (existing) existing.remove();
      }catch(_){ }
      tfDrawerOpenForGameId = null;
    }

    // ===== NETFLIX HERO (autoplay preview) =====
    let tfFeaturedHero = null; // { vodId, title, sub, poster, channel, game }
    let tfFeaturedLoading = false;

    async function tfEnsureFeaturedHero(){
      if (tfFeaturedHero || tfFeaturedLoading) { tfRenderHeroMedia(); return; }
      tfFeaturedLoading = true;
      try{
        const candidates = tfAllCategories.slice(0, 18);
        if (!candidates.length) return;
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        const gameId = String(pick.id || '');
        if (!gameId) return;

        const url = `/api/twitch/vods/by-game-small?game_id=${encodeURIComponent(gameId)}&lang=fr&minViewers=20&maxViewers=200&limit=12&days=60&maxViews=200000`;
        const r = await fetch(url, { credentials:'include' });
        if (!r.ok) return;
        const d = await r.json();
        const items = Array.isArray(d.items) ? d.items : [];
        if (!items.length) return;

        const v = items[0];
        const vodId = String(v.id || '').replace(/^v/i,'').trim();
        if (!vodId) return;

        const poster = (v.thumbnail_url || v.thumbnail || '').replace('{width}','1280').replace('{height}','720');
        tfFeaturedHero = {
          vodId,
          title: String(v.game_name || pick.name || 'Sélection'),
          sub: String(v.title || 'Regarder maintenant'),
          poster,
          channel: String(v.user_name || ''),
          game: String(v.game_name || pick.name || '')
        };
      }catch(_){ }
      finally{
        tfFeaturedLoading = false;
        tfRenderHeroMedia();
      }
    }

    function tfRenderHeroMedia(){
      const media = document.getElementById('tf-hero-media');
      if (!media) return;

      if (!tfFeaturedHero || !tfFeaturedHero.vodId){
        media.innerHTML = '';
        return;
      }

      const parent = encodeURIComponent(window.location.hostname);
      const src = `https://player.twitch.tv/?video=${encodeURIComponent(tfFeaturedHero.vodId)}&parent=${parent}&autoplay=true&muted=true`;
      media.innerHTML = `<iframe class="tf-hero-iframe" src="${src}" allow="autoplay; fullscreen" frameborder="0" scrolling="no" title="preview"></iframe>`;

      tfSetHero({
        title: tfFeaturedHero.title || 'ORYON TV',
        sub: tfFeaturedHero.sub || '',
        poster: tfFeaturedHero.poster || ''
      });

      const btnPlay = document.getElementById('tf-hero-play');
      if (btnPlay){
        btnPlay.onclick = (e)=>{
          e.preventDefault();
          try{ closeTwitFlix(); }catch(_){ }
          try{ loadVodEmbed(tfFeaturedHero.vodId); }catch(_){ }
        };
      }
    }

    // ===== NETFLIX-LIKE INFO MODAL (Game -> LIVE/VOD) =====
    let tfInfoModalOpen = false;
    let tfInfoGame = null;
    let tfInfoTab = 'vod';
    let tfInfoCache = new Map();

    // Local resume store: last played VOD per game (coarse "Reprendre")
    function tfResumeKey(gameId){ return `tf_resume_vod_${String(gameId||'')}`; }
    function tfGetResumeVod(gameId){ try{ return localStorage.getItem(tfResumeKey(gameId)) || ''; }catch(_){ return ''; } }
    function tfSetResumeVod(gameId, vodId){
      try{
        if (!gameId || !vodId) return;
        localStorage.setItem(tfResumeKey(gameId), String(vodId));
        localStorage.setItem(`${tfResumeKey(gameId)}_t`, String(Date.now()));
      }catch(_){ }
    }

    function tfCloseGameModal(){
      const m = document.getElementById('tf-info-modal');
      if (m) m.remove();
      tfInfoModalOpen = false;
      tfInfoGame = null;
      if (__tfModalTrailerTimer) { try{ clearTimeout(__tfModalTrailerTimer); }catch(_){ } __tfModalTrailerTimer = null; }
    }

    let __tfModalTrailerTimer = null;
    async function tfOpenGameModal(cat){
      if (!cat || !cat.id) return;
      // Close any existing modal FIRST (it resets tfInfoGame)
      tfCloseGameModal();

      const safePoster = (cat.box_art_url ? tfNormalizeBoxArt(cat.box_art_url) : '') || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%221280%22 height=%22720%22%3E%3Crect width=%22100%25%22 height=%22100%25%22 fill=%22%230b0b0f%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 fill=%22%23666%22 font-size=%2248%22 font-family=%22Arial%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22%3EORYON%20TV%3C/text%3E%3C/svg%3E';
      tfInfoGame = { id:String(cat.id), name:String(cat.name||''), poster: safePoster };
      // VOD-only modal. No list/choices shown; the Play button launches a random VOD for this game.
      tfInfoTab = 'vod';
      const modal = document.createElement('div');
      modal.id = 'tf-info-modal';
      modal.className = 'tf-info-modal';
      modal.innerHTML = `
        <div class="tf-info-backdrop" role="dialog" aria-modal="true">
          <div class="tf-info-sheet">
            <button class="tf-info-close" aria-label="Fermer">✕</button>
            <div class="tf-info-hero">
              <img class="tf-info-bg" alt="" src="${tfInfoGame.poster}">
              <div class="tf-info-media" id="tf-info-media" aria-hidden="true"></div>
              <div class="tf-info-grad"></div>
              <div class="tf-info-meta">
                <div class="tf-info-title">${escapeHtml(tfInfoGame.name)}</div>
                <div class="tf-info-desc" id="tf-info-desc">Chargement de la description…</div>
                <div class="tf-info-actions">
                  <button class="tf-nx-btn tf-nx-primary" id="tf-info-play"><span>▶</span> Lecture</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      tfInfoModalOpen = true;

      // Fetch an AI description (French). Falls back silently.
      try{
        const rd = await fetch(`/api/ai/game_desc?name=${encodeURIComponent(tfInfoGame.name)}`, { credentials:'include' });
        const jd = rd.ok ? await rd.json().catch(()=>null) : null;
        const desc = jd && (jd.description || jd.text) ? String(jd.description || jd.text) : '';
        const el = document.getElementById('tf-info-desc');
        if (el) el.textContent = desc || tfGetGameDesc(tfInfoGame.name);
      }catch(_){
        const el = document.getElementById('tf-info-desc');
        if (el) el.textContent = tfGetGameDesc(tfInfoGame.name);
      }

      modal.querySelector('.tf-info-close')?.addEventListener('click', (e)=>{ e.preventDefault(); tfCloseGameModal(); });
      modal.querySelector('.tf-info-backdrop')?.addEventListener('click', (e)=>{ if (e.target.classList.contains('tf-info-backdrop')) tfCloseGameModal(); });

      // "Lecture" becomes "Reprendre" if we have a local resume VOD for this game.
      const resumeVod = tfGetResumeVod(tfInfoGame.id);
      const btnPlay = modal.querySelector('#tf-info-play');
      if (btnPlay && resumeVod){
        btnPlay.innerHTML = `<span>▶</span> Reprendre`;
      }

      btnPlay?.addEventListener('click', async (e)=>{
        e.preventDefault();
        // Ultra-fast: ask the server for a random VOD for this game (FR + small).
        let vid = resumeVod ? String(resumeVod).replace(/^v/i,'') : '';
        if (!vid){
          try{
            const r = await fetch(`/api/twiflix/play?game_id=${encodeURIComponent(tfInfoGame.id)}&game_name=${encodeURIComponent(tfInfoGame.name)}&lang=fr&maxViews=800`, { credentials:'include' });
            const j = r.ok ? await r.json().catch(()=>null) : null;
            vid = j && (j.vod_id || j.id) ? String(j.vod_id || j.id).replace(/^v/i,'') : '';
          }catch(_){ }
        }
        if (!vid) return; // nothing found
        tfSetResumeVod(tfInfoGame.id, vid);
        tfCloseGameModal();
        try{ closeTwitFlix(); }catch(_){ }
        try{ loadVodEmbed(vid); }catch(_){ }
      });

      // Removed "Plus d'infos" button: description is always visible.

      // Trailer preview: wait 5 seconds, then autoplay the game trailer behind the hero.
      try{ await tfInfoScheduleTrailerPreview(); }catch(_){ }
    }

    async function tfInfoScheduleTrailerPreview(){
      if (!tfInfoGame) return;
      if (__tfModalTrailerTimer) { try{ clearTimeout(__tfModalTrailerTimer); }catch(_){ } __tfModalTrailerTimer = null; }

      // Pre-resolve trailer id quickly (cached server-side)
      let videoId = '';
      try{
        const r = await fetch(`/api/youtube/trailer?q=${encodeURIComponent(tfInfoGame.name)}&type=game&lang=fr`, { credentials:'include' });
        const j = r.ok ? await r.json().catch(()=>null) : null;
        videoId = j && (j.videoId || j.id) ? String(j.videoId || j.id).trim() : '';
      }catch(_){ }

      if (!videoId) return;

      __tfModalTrailerTimer = setTimeout(()=>{
        // Only mount if modal is still open
        if (!tfInfoModalOpen || !tfInfoGame) return;
        const media = document.getElementById('tf-info-media');
        if (!media) return;
        media.innerHTML = '';
        const iframe = document.createElement('iframe');
        iframe.className = 'tf-info-iframe';
        iframe.allow = 'autoplay; encrypted-media; fullscreen';
        iframe.frameBorder = '0';
        iframe.width = '100%';
        iframe.height = '100%';
        const origin = encodeURIComponent(window.location.origin);
        iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&mute=1&controls=0&rel=0&modestbranding=1&playsinline=1&loop=1&playlist=${encodeURIComponent(videoId)}&origin=${origin}`;
        media.appendChild(iframe);
      }, 5000);
    }

    async function tfInfoMountHeaderPreview(){
      if (!tfInfoGame) return;
      const media = document.getElementById('tf-info-media');
      if (!media) return;
      media.innerHTML = '';

      // Header preview MUST be the GAME TRAILER (YouTube), not a live stream.
      // We use the backend trailer resolver /api/youtube/trailer (cached).
      let videoId = '';
      try{
        const r = await fetch(`/api/youtube/trailer?q=${encodeURIComponent(tfInfoGame.name)}&type=game&lang=fr`, { credentials:'include' });
        const j = r.ok ? await r.json().catch(()=>null) : null;
        videoId = j && (j.videoId || j.id) ? String(j.videoId || j.id).trim() : '';
      }catch(_){ }

      if (!videoId) return;

      const iframe = document.createElement('iframe');
      iframe.className = 'tf-info-iframe';
      iframe.allow = 'autoplay; encrypted-media; fullscreen';
      iframe.frameBorder = '0';
      iframe.width = '100%';
      iframe.height = '100%';

      // Loop + muted autoplay (Netflix-like preview)
      const origin = encodeURIComponent(window.location.origin);
      iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&mute=1&controls=0&rel=0&modestbranding=1&playsinline=1&loop=1&playlist=${encodeURIComponent(videoId)}&origin=${origin}`;
      media.appendChild(iframe);
    }

    async function tfLoadInfoContent(){
      if (!tfInfoGame) return;
      const gameId = tfInfoGame.id;
      if (tfInfoCache.has(gameId)) return;

      const cache = { vods: [] };
      try{
        const vodUrl = `/api/twitch/vods/by-game-small?game_id=${encodeURIComponent(gameId)}&lang=fr&minViewers=20&maxViewers=200&limit=60&days=90&maxViews=200000&perChannel=2`;
        const rv = await fetch(vodUrl, { credentials:'include' });
        if (rv.ok){
          const dv = await rv.json();
          const items = Array.isArray(dv.items) ? dv.items : [];
          cache.vods = items.map(v => ({
            id:v.id,
            name:v.title||'VOD',
            box_art_url: tfFixThumb((v.thumbnail_url||''), 320, 180),
            _vod:v
          }));
        }
      }catch(_){ }

      tfInfoCache.set(gameId, cache);
    }

    function tfRenderInfoContent(){
      const track = document.getElementById('tf-info-track');
      const title = document.getElementById('tf-info-rowtitle');
      if (!track || !tfInfoGame) return;

      const cache = tfInfoCache.get(tfInfoGame.id) || { vods:[], lives:[] };
      const list = cache.vods;
      if (title) title.textContent = `VOD • ${tfInfoGame.name} • FR • Découverte`;

      track.innerHTML = '';
      if (!list || !list.length){
        track.innerHTML = `<div class="tf-info-empty">Aucun résultat.</div>`;
        return;
      }

      list.slice(0, 24).forEach(item => {
        const card = tfBuildCard(item);
        card.classList.add('tf-landscape');
        track.appendChild(card);
      });
    }

    function tfFixThumb(url, w, h){
      if(!url) return '';
      return String(url)
        .replace('{width}', String(w)).replace('{height}', String(h))
        .replace('%{width}', String(w)).replace('%{height}', String(h));
    }

    function tfGetGameDesc(name){
      const n = String(name||'').toLowerCase();
      const map = {
        'league of legends': "MOBA compétitif. Sélection FR de VOD (petits créateurs) sur la Faille de l’invocateur.",
        'valorant': "FPS tactique 5v5. VOD FR de petits créateurs : clutch, stratégies, ranked.",
        'grand theft auto v': "Open-world. VOD FR : RP, braquages, défis et sessions libres.",
        'minecraft': "Sandbox créatif. VOD FR : survie, builds, serveurs, modpacks.",
        'just chatting': "Talk-show live. VOD FR de discussions et segments marquants.",
      };
      return map[n] || "Sélection de VOD FR (découverte) liées à ce jeu, avec priorité aux petits créateurs.";
    }

    async function tfOpenDrawerForGame(rowEl, cat){
      if (!rowEl || !cat || !cat.id) return;

      const gameId = String(cat.id);
      const gameName = String(cat.name || '');

      if (tfDrawerOpenForGameId === gameId){
        tfCloseDrawer();
        return;
      }
      tfCloseDrawer();
      tfDrawerOpenForGameId = gameId;

      const drawer = document.createElement('div');
      drawer.id = 'tf-drawer';
      drawer.className = 'tf-drawer';

      const titleMode = (tfDrawerMode === 'vod') ? 'VOD' : (tfDrawerMode === 'live' ? 'LIVE' : 'PREVIEW');
      drawer.innerHTML = `
        <div class="tf-row" id="tf-drawer-row">
          <div class="tf-row-title">
            <span>${titleMode} • ${escapeHtml(gameName)} <span style="opacity:.7">(${escapeHtml(String(tfDrawerFilters.lang || ''))})</span></span>
            <div class="tf-chips">
              <button type="button" class="tf-chip" data-tab="live">LIVE</button>
              <button type="button" class="tf-chip" data-tab="vod">VOD</button>
              <button type="button" class="tf-chip" data-chip="lang">FR</button>
              <button type="button" class="tf-chip" data-chip="small">DÉCOUVERTE</button>
              <button type="button" class="tf-chip" data-chip="band">20–200</button>
              ${(tfDrawerMode === 'vod') ? `<button type="button" class="tf-chip" data-chip="days">${Number(tfDrawerFilters.days)||60}J</button>` : ``}
            </div>
          </div>
          <div class="tf-row-track"><div class="tf-empty" style="padding:18px;opacity:.85"><i class="fas fa-spinner fa-spin"></i> Chargement…</div></div>
          <div class="tf-row-bar is-hidden"><div class="tf-row-bar-thumb"></div></div>
        </div>
      `;

      rowEl.insertAdjacentElement('afterend', drawer);

      // chips behavior
      const tabLive = drawer.querySelector('[data-tab="live"]');
      const tabVod = drawer.querySelector('[data-tab="vod"]');
      const chipLang = drawer.querySelector('[data-chip="lang"]');
      const chipSmall = drawer.querySelector('[data-chip="small"]');
      const chipBand = drawer.querySelector('[data-chip="band"]');
      const chipDays = drawer.querySelector('[data-chip="days"]');
      const syncChips = () => {
        if (tabLive) tabLive.classList.toggle('active', tfDrawerMode === 'live');
        if (tabVod) tabVod.classList.toggle('active', tfDrawerMode === 'vod');
        if (chipLang) chipLang.classList.toggle('active', (tfDrawerFilters.lang || 'fr') === 'fr');
        if (chipSmall) chipSmall.classList.toggle('active', !!tfDrawerFilters.small);
        if (chipBand) chipBand.classList.toggle('active', true);
        if (chipDays) chipDays.classList.add('active');
      };
      syncChips();

      if (tabLive){
        tabLive.addEventListener('click', ()=>{ tfDrawerMode = 'live'; tfReloadDrawer(cat); });
      }
      if (tabVod){
        tabVod.addEventListener('click', ()=>{ tfDrawerMode = 'vod'; tfReloadDrawer(cat); });
      }

      if (chipLang){
        chipLang.addEventListener('click', ()=>{
          tfDrawerFilters.lang = (tfDrawerFilters.lang || 'fr') === 'fr' ? '' : 'fr';
          tfReloadDrawer(cat);
        });
      }
      if (chipSmall){
        chipSmall.addEventListener('click', ()=>{
          tfDrawerFilters.small = !tfDrawerFilters.small;
          tfReloadDrawer(cat);
        });
      }
      if (chipBand){
        chipBand.addEventListener('click', ()=>{
          const curMin = Number(tfDrawerFilters.minViewers ?? 20);
          const curMax = Number(tfDrawerFilters.maxViewers ?? 200);
          // Toggle between strict band (20–200) and wider band (0–200)
          if (curMin === 20 && curMax === 200){
            tfDrawerFilters.minViewers = 0;
            tfDrawerFilters.maxViewers = 200;
          } else {
            tfDrawerFilters.minViewers = 20;
            tfDrawerFilters.maxViewers = 200;
          }
          tfReloadDrawer(cat);
        });
      }
      if (chipDays){
        chipDays.addEventListener('click', ()=>{
          tfDrawerFilters.days = (Number(tfDrawerFilters.days)||60) === 60 ? 30 : 60;
          tfReloadDrawer(cat);
        });
      }

      if (chipBand){
        chipBand.addEventListener('click', ()=>{
          // Toggle between 20–200 and 20–100 for stricter discovery
          tfDrawerFilters.maxViewers = (Number(tfDrawerFilters.maxViewers)||200) === 200 ? 100 : 200;
          tfReloadDrawer(cat);
        });
      }

      await tfReloadDrawer(cat);
    }

    async function tfReloadDrawer(cat){
      const drawer = document.getElementById('tf-drawer');
      if (!drawer || !cat) return;
      const row = drawer.querySelector('#tf-drawer-row');
      const track = drawer.querySelector('.tf-row-track');
      const bar = drawer.querySelector('.tf-row-bar');
      if (!row || !track) return;

      // update title
      const titleMode = (tfDrawerMode === 'vod') ? 'VOD' : (tfDrawerMode === 'live' ? 'LIVE' : 'PREVIEW');
      const titleEl = row.querySelector('.tf-row-title > span');
      if (titleEl){
        titleEl.innerHTML = `${titleMode} • ${escapeHtml(String(cat.name||''))} <span style="opacity:.7">(${escapeHtml(String(tfDrawerFilters.lang||''))})</span>`;
      }

      track.innerHTML = `<div class="tf-empty" style="padding:18px;opacity:.85"><i class="fas fa-spinner fa-spin"></i> Chargement…</div>`;

      try{
        if (tfDrawerMode === 'vod'){
          const items = await tfFetchVodsByGame(cat.id, tfDrawerFilters);
          track.innerHTML = '';
          if (!items.length){
            track.innerHTML = `<div class="tf-empty" style="padding:18px;opacity:.85">Aucune VOD trouvée. <span style="opacity:.7">Essaie de désactiver SMALL ou FR.</span></div>`;
          } else {
            const cards = items.map(v => ({
              id: v.id,
              name: v.title || v.game_name || 'VOD',
              box_art_url: tfNormalizeTwitchThumb(v.thumbnail_url || ''),
              _vod: v
            }));
            cards.forEach(c => track.appendChild(tfBuildCard(c)));
            track.querySelectorAll('.tf-card').forEach((card, idx)=>{
              const v = items[idx];
              if(!v) return;
              card.dataset.vodId = String(v.id||'').replace(/^v/i,'');
              card.dataset.platform = 'Twitch VOD';
              card.dataset.viewers = v.view_count ? String(v.view_count) : '';
              tfDecorateVodCard(card, v);
            });
          }
        } else if (tfDrawerMode === 'live'){
          const items = await tfFetchLivesByGame(cat.id, tfDrawerFilters);
          track.innerHTML = '';
          if (!items.length){
            track.innerHTML = `<div class="tf-empty" style="padding:18px;opacity:.85">Aucun live trouvé. <span style="opacity:.7">Essaie de désactiver FR.</span></div>`;
          } else {
            const cards = items.map(s => ({
              id: `live_${s.user_login}`,
              name: s.user_name || s.user_login,
              box_art_url: tfNormalizeTwitchThumb(s.thumbnail_url || ''),
              _live: s
            }));
            cards.forEach(c => track.appendChild(tfBuildCard(c)));
            track.querySelectorAll('.tf-card').forEach((card, idx)=>{
              const s = items[idx];
              if(!s) return;
              card.dataset.platform = 'Twitch';
              card.dataset.viewers = s.viewer_count ? String(s.viewer_count) : '';
              card.dataset.channel = s.user_login || '';
              tfDecorateLiveCard(card, s);
            });
          }
        } else {
          // preview mode drawer: show a couple live channels (same as live) but no click-to-play, just hover previews.
          const items = await tfFetchLivesByGame(cat.id, tfDrawerFilters);
          track.innerHTML = '';
          const top = items.slice(0, 10);
          if (!top.length){
            track.innerHTML = `<div class="tf-empty" style="padding:18px;opacity:.85">Aucun contenu preview. </div>`;
          } else {
            const cards = top.map(s => ({
              id: `prev_${s.user_login}`,
              name: s.user_name || s.user_login,
              box_art_url: tfNormalizeTwitchThumb(s.thumbnail_url || ''),
              _live: s
            }));
            cards.forEach(c => track.appendChild(tfBuildCard(c)));
            track.querySelectorAll('.tf-card').forEach((card, idx)=>{
              const s = top[idx];
              if(!s) return;
              card.dataset.platform = 'Twitch';
              card.dataset.viewers = s.viewer_count ? String(s.viewer_count) : '';
              card.dataset.channel = s.user_login || '';
              tfDecorateLiveCard(card, s);
            });
          }
        }

        // row bar
        if (bar){
          setTimeout(()=>{ try{ tfAttachRowBar(track, bar); }catch(_){ } }, 0);
        }
      }catch(_){
        track.innerHTML = `<div class="tf-empty" style="padding:18px;opacity:.85">Erreur de chargement.</div>`;
      }
    }

    async function tfFetchVodsByGame(gameId, filters){
      const id = String(gameId || '').trim();
      if (!id) return [];
      const lang = String(filters?.lang || '').trim().toLowerCase();
      const small = filters?.small ? '1' : '0';
      const days = Math.min(Math.max(7, parseInt(filters?.days || 60, 10) || 60), 180);
      const maxViews = Math.min(Math.max(0, parseInt(filters?.maxViews || 200000, 10) || 0), 5000000);
      // If "small" is enabled, seed VOD from small live channels (20–200 viewers) for this game.
      const base = (filters?.small) ? '/api/twitch/vods/by-game-small' : '/api/twitch/vods/by-game';
      const extra = (filters?.small) ? `&minViewers=${encodeURIComponent(String(filters?.minViewers ?? 20))}&maxViewers=${encodeURIComponent(String(filters?.maxViewers ?? 200))}` : `&small=${small}&maxViews=${encodeURIComponent(String(maxViews))}`;
      const url = `${API_BASE}${base}?game_id=${encodeURIComponent(id)}&lang=${encodeURIComponent(lang)}&limit=24&days=${encodeURIComponent(String(days))}${extra}`;
      const r = await fetch(url, { credentials:'include' });
      const d = await r.json().catch(()=>null);
      return (r.ok && d && Array.isArray(d.items)) ? d.items : [];
    }

    async function tfFetchLivesByGame(gameId, filters){
      const id = String(gameId || '').trim();
      if (!id) return [];
      const lang = String(filters?.lang || '').trim().toLowerCase();
      // Discovery-first: bias toward emerging streamers (e.g. 20–200 viewers)
      const minViewers = Math.max(0, parseInt(filters?.minViewers ?? 20, 10) || 0);
      const maxViewers = Math.max(0, parseInt(filters?.maxViewers ?? 200, 10) || 0);
      const url = `${API_BASE}/api/twitch/streams/by-game?game_id=${encodeURIComponent(id)}&lang=${encodeURIComponent(lang)}&limit=24&minViewers=${encodeURIComponent(String(minViewers))}&maxViewers=${encodeURIComponent(String(maxViewers))}`;
      const r = await fetch(url, { credentials:'include' });
      const d = await r.json().catch(()=>null);
      return (r.ok && d && Array.isArray(d.items)) ? d.items : [];
    }

    function tfRenderRows(host, list){
      const picks1 = list.slice(0, 28);
      const picks2 = list.slice(28, 56);
      const picks3 = tfShuffle(list).slice(0, 28);
      const picks4 = tfShuffle(list).slice(28, 56);

      host.appendChild(tfBuildRow('Top du moment <span>(Twitch)</span>', picks1));

      // ADN row (Steam-based) if available
      if (tfPersonalization && Array.isArray(tfPersonalization.categories) && tfPersonalization.categories.length){
        host.appendChild(tfBuildRow(tfPersonalization.title || 'Parce que tu as aimé', tfPersonalization.categories.slice(0,28)));
      } else {
        host.appendChild(tfBuildRow('Tendances <span>FR</span>', picks2));
      }

      host.appendChild(tfBuildRow('Découverte <span>(aléatoire)</span>', picks3));
      host.appendChild(tfBuildRow('À essayer <span>ce soir</span>', picks4));
    }

    function tfRenderAZ(host, list){
      // group
      const groups = {};
      for (const c of list){
        const n = (c.name || '').trim();
        if (!n) continue;
        const first = n[0].toUpperCase();
        const key = /[A-Z]/.test(first) ? first : (/[0-9]/.test(first) ? '0-9' : '#');
        (groups[key] ||= []).push(c);
      }
      const keys = Object.keys(groups).sort((a,b)=>{
        if (a==='0-9') return -1;
        if (b==='0-9') return 1;
        if (a==='#') return 1;
        if (b==='#') return -1;
        return a.localeCompare(b);
      });

      const bar = document.createElement('div');
      bar.className = 'tf-azbar';
      bar.innerHTML = keys.map(k => `<a class="tf-azlink" href="#tf-${k.replace(/[^a-z0-9]/ig,'_')}">${k}</a>`).join('');
      host.appendChild(bar);

      keys.forEach(k => {
        groups[k].sort((x,y)=> (x.name||'').localeCompare(y.name||''));
        const row = tfBuildRow(`<span>${k}</span>`, groups[k], `tf-${k.replace(/[^a-z0-9]/ig,'_')}`);
        host.appendChild(row);
      });
    }

    function tfBuildRow(titleHtml, items, id){
      const row = document.createElement('div');
      row.className = 'tf-row';
      if (id) row.id = id;

      const title = document.createElement('div');
      title.className = 'tf-row-title';
      title.innerHTML = titleHtml;

      const track = document.createElement('div');
      track.className = 'tf-row-track';

      (items || []).forEach(cat => track.appendChild(tfBuildCard(cat)));

      row.appendChild(title);
      row.appendChild(track);

      // Netflix-like scroll indicator bar (shows row horizontal scroll position)
      const bar = document.createElement('div');
      bar.className = 'tf-row-bar is-hidden';
      bar.innerHTML = '<div class="tf-row-bar-thumb"></div>';
      row.appendChild(bar);

      // attach after layout
      setTimeout(()=>{
        try{ tfAttachRowBar(track, bar); }catch(_){ }
      }, 0);
      return row;
    }

    function tfAttachRowBar(track, bar){
      if(!track || !bar) return;
      const thumb = bar.querySelector('.tf-row-bar-thumb');
      if(!thumb) return;

      const refresh = () => {
        const scrollW = track.scrollWidth || 0;
        const clientW = track.clientWidth || 0;
        const maxScroll = Math.max(0, scrollW - clientW);
        if(maxScroll <= 4){
          bar.classList.add('is-hidden');
          return;
        }
        bar.classList.remove('is-hidden');
        const ratio = clientW / scrollW; // visible fraction
        const barW = bar.clientWidth || Math.min(520, clientW);
        const thumbW = Math.max(32, Math.round(barW * ratio));
        thumb.style.width = thumbW + 'px';
        const x = (track.scrollLeft / maxScroll) * Math.max(0, (barW - thumbW));
        thumb.style.transform = `translateX(${Math.round(x)}px)`;
      };

      track.addEventListener('scroll', refresh, { passive:true });
      window.addEventListener('resize', refresh);
      refresh();
    }

    
function tfEnsurePeekBar(){
  let bar = document.getElementById('tf-peekbar');
  if(bar) return bar;
  bar = document.createElement('div');
  bar.id = 'tf-peekbar';
  bar.className = 'tf-peekbar';
  bar.style.cssText = 'position:fixed;left:18px;bottom:18px;z-index:99999;max-width:520px;padding:10px 12px;border-radius:14px;background:rgba(0,0,0,.68);border:1px solid rgba(255,255,255,.10);backdrop-filter:blur(10px);opacity:0;transform:translateY(8px);transition:opacity .18s ease, transform .18s ease;pointer-events:none;';
  bar.innerHTML = '<div style="font-weight:900;letter-spacing:.4px"> </div><div style="opacity:.85;font-size:12px;margin-top:2px"></div>';
  document.body.appendChild(bar);
  return bar;
}
let tfPeekTimer = null;
function tfShowPeek(meta){
  const bar = tfEnsurePeekBar();
  const t = bar.children[0], s = bar.children[1];
  t.textContent = meta.title || '';
  s.textContent = meta.sub || '';
  bar.style.opacity = '1';
  bar.style.transform = 'translateY(0px)';
}
function tfHidePeek(){
  const bar = document.getElementById('tf-peekbar');
  if(!bar) return;
  bar.style.opacity = '0';
  bar.style.transform = 'translateY(8px)';
}
function tfSchedulePeekFromCard(card){
  if(tfPeekTimer) clearTimeout(tfPeekTimer);
  tfPeekTimer = setTimeout(()=>{
    try{
      if(document.activeElement !== card) return;
      const title = card.dataset.gameName || card.getAttribute('aria-label') || 'Contenu';
      const platform = card.dataset.platform || 'Twitch';
      const viewers = card.dataset.viewers ? ` • ${card.dataset.viewers} viewers` : '';
      const tags = card.dataset.tags ? ` • ${card.dataset.tags}` : '';
      tfShowPeek({ title: title.replace('(ouvrir)','').trim(), sub: platform + viewers + tags });
    }catch(_){}
  }, 320);
}
function tfBuildCard(cat){
      const div = document.createElement('div');
      div.className = 'tf-card';
      div.tabIndex = 0;
      div.setAttribute('role','button');
      const isGame = !(cat && (cat._vod || cat._live));
      div.setAttribute('aria-label', `${cat.name} (ouvrir)`);
      if (isGame){
        div.dataset.gameId = cat.id;
        div.dataset.gameName = cat.name;
      } else {
        if (cat && cat._vod && cat._vod.id) div.dataset.vodId = String(cat._vod.id).replace(/^v/i,'');
        if (cat && cat._live && cat._live.user_login) div.dataset.channel = String(cat._live.user_login || '').trim();
      }

      const poster = isGame
        ? tfNormalizeBoxArt(cat.box_art_url || '')
        : (cat.box_art_url || '');

      div.innerHTML = `
        <img class="tf-poster" src="${poster}" loading="lazy" alt="">
        ${typeof cat.compat === "number" ? `<div class="tf-compat-badge">${Math.round(cat.compat)}% compat</div>` : ``}
        <div class="tf-preview" aria-hidden="true"></div>
        <div class="tf-overlay">
          <div class="tf-name" title="${escapeHtml(cat.name)}">${escapeHtml(cat.name)}</div>
          <div class="tf-actions-row">
            ${isGame ? `<span class="tf-pill"><i class="fas fa-layer-group"></i> Voir</span>` : `<span class="tf-pill"><i class="fas fa-play"></i> Lire</span>`}
            ${isGame ? `<span class="tf-pill ghost"><i class="fas fa-mouse-pointer"></i> Plus</span>` : `<span class="tf-pill ghost"><i class="fas fa-info-circle"></i> Détails</span>`}
          </div>
        </div>
      `;

      // Netflix-like HERO behavior:
      // - Hover a GAME cover => update the HERO autoplay preview for that game
      // - Hover a LIVE/VOD card => card-local preview (handled below)
      if (isGame){
        const hoverSet = () => {
          if (tfHeroHoverTimer) clearTimeout(tfHeroHoverTimer);
          tfHeroHoverTimer = setTimeout(() => {
            tfHeroSetAutoplayForGame(cat.id, cat.name, poster);
          }, 180);
        };
        div.addEventListener('mouseenter', hoverSet);
        div.addEventListener('focus', hoverSet);
      }

      // click behavior
      div.onclick = () => {
        // Game => open Netflix-like info modal (LIVE/VOD tabs)
        if (isGame){
          try{ tfOpenGameModal(cat); }catch(_){ }
          return;
        }

        // Live card => play channel
        if (cat && cat._live){
          const s = cat._live;
          const channel = (s.user_login || div.dataset.channel || '').trim();
          if (!channel) return;
          try{ closeTwitFlix(); }catch(_){ }
          try{ loadPlayerEmbed(channel); }catch(_){ }
          try{ window.scrollTo({ top: 0, behavior: 'smooth' }); }catch(_){ }
          return;
        }

        // VOD card => play VOD
        if (cat && cat._vod){
          const v = cat._vod;
          const vodId = String(v.id || div.dataset.vodId || '').replace(/^v/i,'').trim();
          if (!vodId) return;
          try{ closeTwitFlix(); }catch(_){ }
          try{ loadVodEmbed(vodId); }catch(_){ }
          try{ window.scrollTo({ top: 0, behavior: 'smooth' }); }catch(_){ }
          return;
        }
      };

      div.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          div.click();
        }
      });

      // Hover preview (Netflix-like): only for LIVE/VOD cards (not game covers)
      let t = null;
      const canPreview = !!(cat && (cat._live || cat._vod));
      if (canPreview){
        div.addEventListener('mouseenter', () => {
          t = setTimeout(() => tfStartPreview(div), 420);
        });
        div.addEventListener('mouseleave', () => { if (t) clearTimeout(t); tfStopPreview(div); });

        // Focus preview (gamepad/keyboard): same behavior as hover (Big Picture only)
        div.addEventListener('focus', () => {
          if (!document.body.classList.contains('tf-bigpicture')) return;
          t = setTimeout(() => tfStartPreview(div), 380);
        });
        div.addEventListener('blur', () => { if (t) clearTimeout(t); tfStopPreview(div); });
      }

      return div;
    }

    function tfSetHero({ title, sub, poster }){
      const bg = document.getElementById('tf-hero-bg');
      const media = document.getElementById('tf-hero-media');
      const t = document.getElementById('tf-hero-title');
      const s = document.getElementById('tf-hero-sub');
      if (t) t.textContent = String(title || 'TWITFLIX');
      if (s) s.textContent = String(sub || '');
      if (bg){
        if (poster) { bg.src = poster; bg.style.opacity = (String(title||'').toUpperCase()==='TWITFLIX' ? '.55' : '.78'); }
        else { bg.removeAttribute('src'); bg.style.opacity = '.15'; }
      }

      // Default: if no explicit media is mounted elsewhere, clear the hero media.
      // (Hero autoplay is handled by tfHeroSetAutoplayForGame.)
      if (media && !media.dataset.locked){
        media.innerHTML = '';
      }
    }

    function tfHeroMountIframe(src){
      const media = document.getElementById('tf-hero-media');
      if (!media) return;
      media.dataset.locked = '1';
      media.innerHTML = '';
      const iframe = document.createElement('iframe');
      iframe.className = 'tf-hero-iframe';
      iframe.src = src;
      iframe.width = '100%';
      iframe.height = '100%';
      iframe.allow = 'autoplay; fullscreen';
      iframe.frameBorder = '0';
      media.appendChild(iframe);
    }

    function tfHeroClearMedia(){
      const media = document.getElementById('tf-hero-media');
      if (!media) return;
      media.dataset.locked = '';
      media.innerHTML = '';
    }

    async function tfHeroSetAutoplayForGame(gameId, gameName, poster){
      const key = String(gameId || '');
      if (!key) return;
      if (tfHeroCurrentKey === key) return;
      tfHeroCurrentKey = key;

      // optimistic UI
      tfSetHero({ title: gameName || 'Trailer', sub: 'Prévisualisation automatique (muette)', poster });

      const cached = tfHeroCache.get(key);
      const now = Date.now();
      if (cached && (now - cached.t) < TF_HERO_TTL){
        return tfHeroApplyAutoplay(cached, gameName, poster);
      }

      if (tfHeroInflight.has(key)){
        try{ await tfHeroInflight.get(key); }catch(_){ }
        const cc = tfHeroCache.get(key);
        if (cc) return tfHeroApplyAutoplay(cc, gameName, poster);
        return;
      }

      const p = (async ()=>{
        try{
          // 0) Netflix-like HERO: prefer official GAME trailers (YouTube) first.
          // This makes the HERO behave like Netflix (trailers that change on hover).
          const ytId = await tfResolveTrailerId(gameName);
          if (ytId){
            tfHeroCache.set(key, { t: Date.now(), youtubeId: String(ytId).trim() });
            return;
          }

          // Prefer small creators VODs for this game
          const url = `${API_BASE}/api/twitch/vods/by-game-small?game_id=${encodeURIComponent(key)}&lang=fr&limit=12&days=60&minViewers=20&maxViewers=200&perChannel=1`;
          const r = await fetch(url, { credentials:'include' });
          const d = await r.json().catch(()=>null);
          const items = (r.ok && d && Array.isArray(d.items)) ? d.items : [];
          const first = items.find(x=>x && x.id) || null;
          if (first){
            tfHeroCache.set(key, { t: Date.now(), vodId: String(first.id).replace(/^v/i,'') });
            return;
          }

          // Fallback to a live preview channel
          const ch = await tfGetPreviewChannel(key);
          if (ch){
            tfHeroCache.set(key, { t: Date.now(), channel: ch });
            return;
          }
        }catch(_){ }
      })();

      tfHeroInflight.set(key, p);
      try{ await p; }catch(_){ }
      tfHeroInflight.delete(key);

      const final = tfHeroCache.get(key);
      if (final) return tfHeroApplyAutoplay(final, gameName, poster);
      tfHeroClearMedia();
    }

    function tfHeroApplyAutoplay(obj, gameName, poster){
      // 1) YouTube trailer in HERO (autoplay muted)
      if (obj.youtubeId){
        const vid = String(obj.youtubeId).trim();
        const origin = encodeURIComponent(window.location.origin);
        const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(vid)}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3&fs=0&disablekb=1&origin=${origin}`;
        tfHeroMountIframe(src);

        // Play button opens the game modal (Netflix: hero is teaser; click leads to details)
        const playBtn = document.getElementById('tf-hero-play');
        if (playBtn){
          playBtn.onclick = ()=>{ try{ tfOpenGameModal({ id: String(tfHeroCurrentKey||''), name: gameName, box_art_url: poster }); }catch(_){}; };
        }
        tfSetHero({ title: gameName || 'Trailer', sub: 'Trailer officiel • Prévisualisation automatique', poster });
        return;
      }

      const parentParams = (Array.isArray(PARENT_DOMAINS) && PARENT_DOMAINS.length)
        ? PARENT_DOMAINS.map(p=>`parent=${encodeURIComponent(p)}`).join('&')
        : `parent=${encodeURIComponent(TWITCH_PARENT || window.location.hostname)}`;

      if (obj.vodId){
        const vodId = String(obj.vodId).replace(/^v/i,'');
        const src = `https://player.twitch.tv/?video=v${encodeURIComponent(vodId)}&${parentParams}&muted=true&autoplay=true`;
        tfHeroMountIframe(src);

        // Play button launches the VOD
        const playBtn = document.getElementById('tf-hero-play');
        if (playBtn){
          playBtn.onclick = ()=>{ try{ closeTwitFlix(); }catch(_){}; try{ loadVodEmbed(vodId); }catch(_){}; };
        }
        tfSetHero({ title: gameName || 'VOD', sub: 'Trailer (VOD) • FR • Découverte', poster });
        return;
      }

      if (obj.channel){
        const ch = String(obj.channel);
        const src = `https://player.twitch.tv/?channel=${encodeURIComponent(ch)}&${parentParams}&muted=true&autoplay=true`;
        tfHeroMountIframe(src);
        const playBtn = document.getElementById('tf-hero-play');
        if (playBtn){
          playBtn.onclick = ()=>{ try{ closeTwitFlix(); }catch(_){}; try{ loadPlayerEmbed(ch); }catch(_){}; };
        }
        tfSetHero({ title: gameName || 'LIVE', sub: 'Trailer (LIVE) • FR • Découverte', poster });
      }
    }

    function tfStartHeroCycler(){
      if (tfHeroCyclerTimer) clearInterval(tfHeroCyclerTimer);
      // Rotate featured games in the HERO to mimic Netflix autoplay trailers.
      // User hover always takes precedence (tfHeroCurrentKey is set then).
      tfHeroCyclerTimer = setInterval(() => {
        try{
          if (!tfModalOpen) return;
          if (!Array.isArray(tfAllCategories) || !tfAllCategories.length) return;
          // pick a semi-random game from the first loaded batch
          const pool = tfAllCategories.slice(0, Math.min(24, tfAllCategories.length));
          const pick = pool[Math.floor(Math.random() * pool.length)];
          if (!pick || !pick.id) return;
          // do not override if the user is hovering/focused on a game recently
          // (we treat "current key" as "user selected" for the next few seconds)
          tfHeroSetAutoplayForGame(pick.id, pick.name, tfNormalizeBoxArt(pick.box_art_url || ''));
        }catch(_){ }
      }, 9000);

      // initial kick
      try{
        const first = (Array.isArray(tfAllCategories) && tfAllCategories[0]) ? tfAllCategories[0] : null;
        if (first && first.id){
          tfHeroSetAutoplayForGame(first.id, first.name, tfNormalizeBoxArt(first.box_art_url || ''));
        }
      }catch(_){ }
    }

    // HERO "Plus d'infos" (Netflix-like): open the game modal for the currently previewed game.
    function tfHeroMoreInfo(){
      try{
        const key = String(tfHeroCurrentKey || '').trim();
        if(!key) return;
        const cat = (Array.isArray(tfAllCategories) ? tfAllCategories.find(c=>String(c.id)===key) : null);
        const heroTitle = (document.getElementById('tf-hero-title')?.textContent || '').trim();
        const bgSrc = document.getElementById('tf-hero-bg')?.getAttribute('src') || '';
        tfOpenGameModal(cat || { id: key, name: heroTitle || 'Jeu', box_art_url: bgSrc });
      }catch(_){ }
    }
    window.tfHeroMoreInfo = tfHeroMoreInfo;

    async function tfStartPreview(cardEl){
      try{
        if (!cardEl || cardEl.classList.contains('previewing')) return;
        const gameId = String(cardEl.dataset.gameId || '');
        if (!gameId) return;

        const host = cardEl.querySelector('.tf-preview');
        if (!host) return;

        const channel = await tfGetPreviewChannel(gameId);
        if (!channel) return;

        const parentParams = (Array.isArray(PARENT_DOMAINS) && PARENT_DOMAINS.length)
          ? PARENT_DOMAINS.map(p=>`parent=${encodeURIComponent(p)}`).join('&')
          : `parent=${encodeURIComponent(TWITCH_PARENT || window.location.hostname)}`;
        const src = `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&${parentParams}&muted=true&autoplay=true`;

        const iframe = document.createElement('iframe');
        iframe.src = src;
        iframe.width = '100%';
        iframe.height = '100%';
        iframe.allow = 'autoplay; fullscreen';
        iframe.frameBorder = '0';

        host.innerHTML = '';
        host.appendChild(iframe);
        cardEl.classList.add('previewing');
      }catch(_){}
    }

    function tfStopPreview(cardEl){
      try{
        if (!cardEl) return;
        const host = cardEl.querySelector('.tf-preview');
        if (host) host.innerHTML = '';
        cardEl.classList.remove('previewing');
      }catch(_){}
    }

    async function tfGetPreviewChannel(gameId){
      const now = Date.now();
      const cached = tfPreviewCache.get(gameId);
      if (cached && (now - cached.t) < TF_PREVIEW_TTL) return cached.channel;

      if (tfPreviewInflight.has(gameId)) return tfPreviewInflight.get(gameId);

      const p = (async () => {
        try{
          const res = await fetch(`${API_BASE}/api/stream/by_category`,{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ game_id: gameId })
          });
          const data = await res.json();
          const channel = data && data.success ? data.channel : null;
          if (channel) tfPreviewCache.set(gameId,{ channel, t: Date.now() });
          return channel;
        }catch(_){
          return null;
        }finally{
          tfPreviewInflight.delete(gameId);
        }
      })();

      tfPreviewInflight.set(gameId, p);
      return p;
    }

    async function playTwitFlixCategory(gameId, gameName){
      closeTwitFlix();
      document.getElementById('current-channel-display').innerText = "TWITFLIX…";

      try{
        const res = await fetch(`${API_BASE}/api/stream/by_category`,{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ game_id: gameId })
        });
        const data = await res.json();

        if (data && data.success && data.channel){
          changeChannel(data.channel);
          const badge = document.getElementById('player-mode-badge');
          if (badge) badge.innerText = "TWITFLIX";
        } else {
          alert("Aucun stream trouvé pour ce jeu.");
          document.getElementById('current-channel-display').innerText = "OFFLINE";
        }
      }catch(_){
        alert("Erreur lors de la recherche TwitFlix.");
      }
    }

    function tfShuffle(arr){
      const a = arr.slice();
      for (let i=a.length-1;i>0;i--){
        const j = Math.floor(Math.random()*(i+1));
        [a[i],a[j]] = [a[j],a[i]];
      }
      return a;
    }
// BEST TIME

    async function analyzeBestTime(){
      const gameInput = document.getElementById('best-time-game').value.trim();
      if (!gameInput) return alert('Veuillez entrer un nom de jeu');

      const btn = document.getElementById('analyze-schedule-btn');
      const loading = document.getElementById('best-time-loading');
      const results = document.getElementById('best-time-results');

      btn.disabled = true;
      loading.style.display = 'block';
      results.style.display = 'none';
      results.innerHTML = '';

      try{
        const response = await fetch(`${API_BASE}/analyze_schedule`,{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({ game: gameInput })
        });
        const data = await response.json();
        results.innerHTML = data.html_response || '<p style="color:#ff6666;">❌ Erreur</p>';
        results.style.display = 'block';
      }catch(e){
        results.innerHTML = '<p style="color:#ff6666;">❌ Erreur réseau</p>';
        results.style.display = 'block';
      }finally{
        btn.disabled = false;
        loading.style.display = 'none';
      }
    }

    // STATS DASH
    async function loadStatsDashboard(){
      try{
        const res = await fetch(`${API_BASE}/api/stats/global`);
        const data = await res.json();
        if (data.success){
          document.getElementById('kpi-viewers').innerText = Number(data.total_viewers||0).toLocaleString();
          document.getElementById('kpi-channels').innerText = data.total_channels;
          renderChart('chartViewers','line',data.history.live.labels,data.history.live.values,'Viewers');
        }

        const dGamesR = await window.fetchJSON("/api/stats/top_games");
        const dGames = (dGamesR && dGamesR.ok && dGamesR.json) ? dGamesR.json : { games: [] };
        const labels = (dGames.games||[]).map(g=>g.name);
        const values = (dGames.games||[]).map((g,i)=>(i+1)*20);
        renderChart('chartGames','bar',labels.slice(0,5),values.slice(0,5),'Popularité');

        const resLang = await fetch(`${API_BASE}/api/stats/languages`);
        const dLang = await resLang.json();
        const lLabels = (dLang.languages||[]).map(l=>l.name);
        const lValues = (dLang.languages||[]).map(l=>l.percent);
        renderChart('chartLangs','doughnut',lLabels,lValues,'Part');
      }catch(e){ console.error('Stats error:', e); }
    }

    function renderChart(id,type,labels,data,label){
      const el = document.getElementById(id);
      if (!el) return;
      if (charts[id]) charts[id].destroy();

      charts[id] = new Chart(el.getContext('2d'),{
        type,
        data:{ labels, datasets:[{ label, data, borderWidth:1, fill:(type==='line'), tension:.35 }]},
        options:{
          responsive:true,
          maintainAspectRatio:false,
          plugins:{ legend:{ display:(type==='doughnut'), position:'right', labels:{ color:'white', boxWidth:10 } } },
          scales:{
            x:{ display:(type!=='doughnut'), ticks:{ color:'#666' } },
            y:{ display:(type!=='doughnut'), grid:{ color:'#222' }, ticks:{ color:'#666' } }
          }
        }
      });
    }

    // ===== Sous le live (données backend) =====
    async function loadChannelProData(login){
      if (!login || login === 'twitch') return;

      try{
        const res = await fetch(`${API_BASE}/api/analytics/channel_by_login/${encodeURIComponent(login)}?days=30`);
        const data = await res.json();

        if (!data.success){
          document.getElementById('kpi-growth-label').innerText =
            data.message || data.error || "Pas assez de données (laisse tourner le cron).";
          return;
        }

        currentChannelId = data.channel_id || null;

        const k = data.kpis || {};
        const fmt = v => (v==null ? '--' : Number(v).toLocaleString());

        document.getElementById('kpi-avg').innerText = fmt(k.avg_viewers);
        document.getElementById('kpi-peak').innerText = fmt(k.peak_viewers);
        document.getElementById('kpi-growth').innerText = (k.growth_percent!=null ? `${k.growth_percent}%` : '--');
        document.getElementById('kpi-volatility').innerText = fmt(k.volatility);
        document.getElementById('kpi-hours').innerText = (k.hours_per_week_est!=null ? `${k.hours_per_week_est}h` : '--');
        document.getElementById('kpi-samples').innerText = fmt(k.days);

        const gs = k.growth_score;
        document.getElementById('kpi-growth-score').innerText = (gs!=null ? `${gs}/100` : '--');
        document.getElementById('kpi-growth-label').innerText =
          gs==null ? '--' :
          gs>=80 ? '🔥 En forte accélération' :
          gs>=60 ? '✅ Bonne dynamique' :
          gs>=40 ? '🟡 Stable (optimisable)' :
          '🔴 À relancer';

        if (data.series?.labels?.length){
          renderChart('chartChannelDaily','line',data.series.labels,data.series.values,'Viewers moyens/jour');
        }

        await loadAlerts(login);

        if (currentGameId){
          await loadGameHours(currentGameId);
        }
      }catch(e){
        console.error('loadChannelProData error:', e);
      }
    }

    async function loadAlerts(login){
      const box = document.getElementById('alerts-box');
      if (!box) return;
      box.innerHTML = '<div class="text-gray-500 text-xs"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>';

      try{
        let r = await fetch(`${API_BASE}/api/alerts/channel_by_login/${encodeURIComponent(login)}?limit=8`);
        let data = await r.json();

        if (!data.success || !data.items || data.items.length === 0){
          await fetch(`${API_BASE}/api/alerts/generate`,{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({ login, days:30 })
          }).catch(()=>{});

          r = await fetch(`${API_BASE}/api/alerts/channel_by_login/${encodeURIComponent(login)}?limit=8`);
          data = await r.json();
        }

        if (!data.success || !data.items){
          box.innerHTML = '<div class="text-gray-500 text-xs">Aucune alerte.</div>';
          return;
        }

        box.innerHTML = '';
        data.items.forEach(a=>{
          box.innerHTML += `
            <div class="bg-[#0a0a0a] border border-[#222] rounded p-2 mb-2">
              <div class="flex items-center justify-between gap-2">
                <div class="text-xs font-bold text-white">${escapeHtml(a.title || 'Alerte')}</div>
                <div class="text-[10px] text-gray-500">${escapeHtml(a.day || '')}</div>
              </div>
              <div class="text-[11px] text-gray-300 mt-1 leading-snug">${escapeHtml(a.message || '')}</div>
            </div>`;
        });

      }catch(e){
        console.error('loadAlerts', e);
        box.innerHTML = '<div class="text-gray-500 text-xs">Erreur alertes.</div>';
      }
    }

    async function loadGameHours(gameId){
      try{
        const r = await fetch(`${API_BASE}/api/games/hours?game_id=${encodeURIComponent(gameId)}&days=7`);
        const data = await r.json();
        if (!data.success || !data.hours) return;

        const labels = data.hours.map(x => `${String(x.hour).padStart(2,'0')}h`);
        const values = data.hours.map(x => (x.discoverability_score || 0));
        renderChart('chartGameHours','line',labels,values,'Opportunité');

        const best = data.best || data.hours.slice().sort((a,b)=>(b.discoverability_score||0)-(a.discoverability_score||0))[0];
        document.getElementById('niche-sat').innerText = best?.saturation_score!=null ? `${best.saturation_score}/100` : '--';
        document.getElementById('niche-discover').innerText = best?.discoverability_score!=null ? `${best.discoverability_score}/100` : '--';
        document.getElementById('niche-position').innerText = best ? `${String(best.hour).padStart(2,'0')}h UTC` : '--';
        document.getElementById('niche-verdict').innerText = best?.discoverability_score>=70 ? '🔥 Très bon' : best?.discoverability_score>=45 ? '✅ OK' : '🟡 Risqué';
        document.getElementById('niche-details').innerText =
          best ? `Meilleure fenêtre détectée: ${String(best.hour).padStart(2,'0')}h UTC • viewers totaux observés: ${best.total_viewers || 0}` : '—';
      }catch(e){
        console.error('loadGameHours', e);
      }
    }

    async function loadAIReco(){
      if (!currentChannel || currentChannel === 'twitch') return;
      const box = document.getElementById('ai-reco-box');
      const btn = document.getElementById('btn-ai-reco');

      box.classList.add('hidden');
      box.innerHTML = '';
      btn.disabled = true;
      btn.innerHTML = '<span class="best-time-spinner"></span> Génération...';

      try{
        const res = await fetch(`${API_BASE}/api/ai/reco?login=${encodeURIComponent(currentChannel)}&days=30`);
        const data = await res.json();
        box.innerHTML = data.html_response || "<p style='color:#ff6666;'>❌ Pas de recommandation</p>";
        box.classList.remove('hidden');
      }catch(e){
        box.innerHTML = "<p style='color:#ff6666;'>❌ Erreur IA</p>";
        box.classList.remove('hidden');
      }finally{
        btn.disabled = false;
        btn.innerHTML = '⚡ Générer des recommandations';
      }
    }

    async function runSimulation(){
      const hours = parseInt(document.getElementById('sim-hours').value || '0',10);
      const out = document.getElementById('sim-result');
      if (!currentChannelId || !hours){ out.innerText = '—'; return; }

      out.innerText = '...';
      try{
        const res = await fetch(`${API_BASE}/api/simulate/growth?channel_id=${encodeURIComponent(currentChannelId)}&hours_per_week=${encodeURIComponent(hours)}&days=30`);
        const data = await res.json();
        if (!data.success){ out.innerText = data.message || 'Pas assez de data'; return; }
        const delta = data.target?.expected_change_percent ?? null;
        const expected = data.target?.expected_avg_viewers ?? null;
        out.innerText = (delta==null || expected==null)
          ? 'OK'
          : `${delta >= 0 ? '+' : ''}${delta}% • ~${expected} avg viewers`;
      }catch(e){
        out.innerText = 'Erreur';
      }
    }

    async function loadCoStreamer(){
      const out = document.getElementById('costream-out');
      const btn = document.getElementById('costream-btn');
      if (!out || !btn) return;

      btn.disabled = true;
      out.style.display = 'block';
      out.innerHTML = '<div class="text-gray-500 text-xs"><i class="fas fa-spinner fa-spin"></i> Analyse...</div>';

      try{
        const r = await fetch(`${API_BASE}/api/costream/best?login=${encodeURIComponent(currentChannel)}&days=14`);
        const data = await r.json();

        if (!data.success){
          out.innerHTML = `<p style="color:#ff6666;">❌ ${escapeHtml(data.message || 'Impossible')}</p>`;
          return;
        }

        const best = data.best;
        const list = data.candidates || [];

        out.innerHTML = `
          <div class="flex items-center gap-3 mb-2">
            <img src="${best?.profile_image_url || ''}" onerror="this.style.display='none'" class="w-10 h-10 rounded-full border border-[#00f2ea]">
            <div class="min-w-0">
              <div class="text-white font-bold text-sm">${escapeHtml(best?.display_name || '—')} <span class="text-gray-500">@${escapeHtml(best?.login || '')}</span></div>
              <div class="text-[11px] text-gray-400">Score: <span class="text-[#00f2ea] font-bold">${best?.score ?? '--'}</span></div>
            </div>
            <a class="ml-auto text-[11px] bg-[#00f2ea] text-black px-2 py-1 rounded font-bold" target="_blank" href="https://twitch.tv/${best?.login || ''}">Voir</a>
          </div>
          <div class="text-[11px] text-gray-300">${escapeHtml(best?.why || '')}</div>
          ${list.length ? `
            <div class="mt-3 text-[11px] text-gray-400 font-bold uppercase">Autres options</div>
            <ul class="mt-1 text-[11px] text-gray-300 list-disc pl-5">
              ${list.slice(0,5).map(x=>`<li>${escapeHtml(x.display_name)} — score ${x.score}</li>`).join('')}
            </ul>` : '' }
        `;
      }catch(e){
        out.innerHTML = '<p style="color:#ff6666;">❌ Erreur réseau</p>';
      }finally{
        btn.disabled = false;
      }
    }

    // ====== SCAN / RAID / BOOST (réparés) ======
    async function runScan(){
      const q = document.getElementById('scan-query').value.trim();
      if (!q) return;

      const box = document.getElementById('scan-res');
      box.classList.remove('hidden');
      document.getElementById('scan-ai').innerHTML = `<span class="best-time-spinner"></span> Scan...`;

      try{
        const r = await fetch(`${API_BASE}/scan_target`,{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({ query:q })
        });
        const data = await r.json();
        if (!data.success){
          document.getElementById('scan-ai').innerHTML = `<p style="color:#ff6666;">❌ Introuvable</p>`;
          return;
        }

        if (data.type === 'user'){
          const u = data.user_data;
          document.getElementById('scan-img').src = u.profile_image_url || '';
          document.getElementById('scan-name').innerText = `${u.display_name} (@${u.login})`;
          document.getElementById('scan-game').innerText = `${u.game_name || '—'} • ${u.is_live ? (u.viewer_count+' viewers') : 'offline'}`;

          // mini critique IA (optionnel)
          const ai = await fetch(`${API_BASE}/critique_ia`,{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({ type:'niche', query: u.game_name || q })
          }).then(x=>x.json()).catch(()=>null);

          document.getElementById('scan-ai').innerHTML =
            `<p><strong>Titre:</strong> ${escapeHtml(u.title||'—')}</p>
             <p><strong>Tags:</strong> ${escapeHtml(u.tags||'—')}</p>
             <p><strong>Lang:</strong> ${escapeHtml(u.language||'—')}</p>
             <hr style="border-color:#222;margin:8px 0;">
             ${ai?.html_response || '<p class="text-gray-400">IA indisponible.</p>'}`;
        } else {
          const g = data.game_data;
          document.getElementById('scan-img').src = g.box_art_url || '';
          document.getElementById('scan-name').innerText = `${g.name}`;
          document.getElementById('scan-game').innerText = `Total viewers (snapshot): ${g.total_viewers||0}`;
          document.getElementById('scan-ai').innerHTML = `<p>Score niche estimé: <strong>${g.ai_calculated_niche_score}</strong></p>`;
        }
      }catch(e){
        document.getElementById('scan-ai').innerHTML = `<p style="color:#ff6666;">❌ Erreur</p>`;
      }
    }

    async function runRaid(){
      const game = document.getElementById('raid-game').value.trim();
      const max_viewers = parseInt(document.getElementById('raid-viewers').value||'100',10);
      if (!game) return;

      const box = document.getElementById('raid-res');
      box.classList.remove('hidden');
      document.getElementById('raid-info').innerHTML = `<span class="best-time-spinner"></span> Recherche...`;

      try{
        const r = await fetch(`${API_BASE}/start_raid`,{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({ game, max_viewers })
        });
        const data = await r.json();
        if (!data.success || !data.target){
          document.getElementById('raid-info').innerHTML = `<p style="color:#ff6666;">❌ Aucun raid trouvé</p>`;
          return;
        }
        raidTarget = data.target;
        document.getElementById('raid-img').src = raidTarget.thumbnail_url || '';
        document.getElementById('raid-info').innerHTML =
          `<p><strong>${escapeHtml(raidTarget.name)}</strong> (@${escapeHtml(raidTarget.login)})</p>
           <p>${escapeHtml(raidTarget.game)} • ${raidTarget.viewers} viewers</p>`;
      }catch(e){
        document.getElementById('raid-info').innerHTML = `<p style="color:#ff6666;">❌ Erreur</p>`;
      }
    }

    function goToRaid(){
      if (raidTarget) window.open(`https://twitch.tv/${raidTarget.login}`, '_blank');
    }

    async function runBoost(){
      const channel = document.getElementById('boost-query').value.trim();
      const msg = document.getElementById('boost-msg');
      msg.innerText = '';
      if (!channel) return;

      msg.innerText = '...';
      try{
        const r = await fetch(`${API_BASE}/stream_boost`,{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({ channel })
        });
        const data = await r.json();
        msg.innerText = data.success ? '✅ Boost activé (15 min)' : '❌ Boost refusé';
      }catch(e){
        msg.innerText = '❌ Erreur';
      }
      setTimeout(()=>{ msg.innerText=''; }, 4000);
    }
  
    // Messenger-style reactions: tap message to reveal on mobile
    document.addEventListener('click', (e) => {
      const msgEl = e.target.closest('.hub-msg');
      if(!msgEl) return;
      // if clicked on button, keep
      if(e.target.closest('.hub-react-btn')) return;
      msgEl.classList.toggle('is-tapped');
    });


/* ===========================
   PAYWALL MANAGER (Premium + Credits) — v3
   Objectifs:
   - 1 seul cadenas pour le Dashboard Premium (3 onglets sous le lecteur)
   - Best Time + Co‑Stream Match verrouillés indépendamment
   - En FREE: si crédits > 0 (billing OU portefeuille marché), on ne bloque pas
   - Jamais "blur sans fenêtre": l'overlay est en portal (enfant de <html>)
   =========================== */
;(function(){
  const PRICING_URL = "/pricing";
  const DASHBOARD_SEL = '[data-paywall-feature="dashboard_premium"]';

  function normPlan(p){ return String(p || "FREE").trim().toUpperCase(); }
  function isPremium(plan){ plan = normPlan(plan); return plan !== "FREE"; }

  // ---- API fetch guard (v8) ----
const __apiInflight = new Map();      // url -> Promise
let __apiGlobalCooldownUntil = 0;     // timestamp
let __apiActive = 0;
const __apiQueue = [];
const __API_MAX_CONCURRENCY = 4;

function __apiNow(){ return Date.now(); }

function __apiSleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function __apiAcquire(){
  if (__apiActive < __API_MAX_CONCURRENCY){
    __apiActive++;
    return;
  }
  await new Promise(resolve => __apiQueue.push(resolve));
  __apiActive++;
}
function __apiRelease(){
  __apiActive = Math.max(0, __apiActive - 1);
  const next = __apiQueue.shift();
  if (next) next();
}

function __cacheKey(url){ return "oryon_cache:" + url; }
function __cacheGet(url){
  try{
    const raw = localStorage.getItem(__cacheKey(url));
    if(!raw) return null;
    const obj = JSON.parse(raw);
    if(!obj || !obj.t || (__apiNow() - obj.t) > obj.ttl) return null;
    return obj.v ?? null;
  }catch(e){ return null; }
}
function __cacheSet(url, v, ttl){
  try{
    localStorage.setItem(__cacheKey(url), JSON.stringify({ t: __apiNow(), ttl, v }));
  }catch(e){}
}
function __ttlFor(url){
  // Cache only GET endpoints that are read-only and hit a lot
  if(!url || typeof url !== "string") return 0;
  if(url.startsWith("/api/billing/me")) return 30_000;
  if(url.startsWith("/api/fantasy/profile")) return 30_000;
  if(url.startsWith("/api/stats/top_games")) return 5 * 60_000;
  if(url.startsWith("/api/categories/top")) return 5 * 60_000;
  if(url.startsWith("/api/twitch/streams/top")) return 60_000;
  if(url.startsWith("/api/public-domain/")) return 60 * 60_000;
  return 0;
}

async function fetchJSON(url, opts){
  opts = opts || {};
  const method = (opts.method || "GET").toUpperCase();
  const key = method + " " + url;

  // Global cooldown if we were rate-limited recently
  if (__apiNow() < __apiGlobalCooldownUntil){
    return { ok:false, status:429, json:null, text:"Too many requests (cooldown)" };
  }

  // cache only GET
  const ttl = (method === "GET") ? __ttlFor(url) : 0;
  if (ttl){
    const cached = __cacheGet(key);
    if (cached !== null) return { ok:true, status:200, json: cached };
  }

  if (__apiInflight.has(key)) return __apiInflight.get(key);

  const p = (async ()=>{
    await __apiAcquire();
    try{
      const r = await fetch(url, Object.assign({ credentials:"include" }, opts));

      // Handle 429 with cooldown
      if (r.status === 429){
        const ra = r.headers.get("Retry-After");
        const waitMs = ra ? Math.max(1000, parseInt(ra,10)*1000) : 15_000;
        __apiGlobalCooldownUntil = __apiNow() + waitMs;
        // Don't throw; return a safe object
        return { ok:false, status:429, json:null, text:"Too many requests" };
      }

      const ct = (r.headers.get("content-type") || "").toLowerCase();
      let j = null;
      let t = null;

      if (ct.includes("application/json")){
        j = await r.json().catch(()=>null);
      } else {
        t = await r.text().catch(()=>null);
        // If server returns text error, don't crash JSON consumers
        if (t && t.trim().startsWith("{")){
          try{ j = JSON.parse(t); }catch(e){}
        }
      }

      if (r.ok && ttl && j !== null){
        __cacheSet(key, j, ttl);
      }

      return { ok: r.ok, status: r.status, json: j, text: t };
    } finally {
      __apiRelease();
    }
  })().finally(()=>__apiInflight.delete(key));

  __apiInflight.set(key, p);
  return p;
}


  
  // ---- access memo (v8) ----
  let __accessMemo = { t:0, v:null };
  let __accessInflightP = null;

async function fetchAccess(){
    const ttl = 30_000;
    if(__accessMemo.v && (Date.now()-__accessMemo.t) < ttl) return __accessMemo.v;
    if(__accessInflightP) return __accessInflightP;
    __accessInflightP = (async ()=>{
    // 1) billing
    let plan = "FREE";
    let credits = 0;

    try{
      const b = await window.fetchJSON("/api/billing/me");
      const j = b.json;
      const success = !!(j && (j.success === undefined ? true : j.success));
      if(b.ok && success){
        plan = normPlan(j.plan || j.tier || j.subscription || "FREE");
        credits = Number(j.credits ?? j.balance ?? 0) || 0;
      }
    }catch(_e){}

    // 2) portefeuille marché (source de vérité "wallet" si plus haut que billing)
// On ne modifie pas billing; on s'en sert juste pour décider l'accès via crédits.
    try{
      const f = await window.fetchJSON("/api/fantasy/profile");
      const j = f.json;
      if(f.ok && j){
        const cash = Number(j.cash ?? j.wallet?.cash ?? 0) || 0;
        if(cash > credits) credits = cash;
      }
    }catch(_e){} 



    // 3) DOM fallback (si un autre script remplit le badge crédits)
    if(credits <= 0){
      try{
        const el = document.getElementById('billing-credits');
        if(el){
          const n = Number(String(el.textContent||'').replace(/[^0-9]/g,'')) || 0;
          if(n > credits) credits = n;
        }
      }catch(_e){}
    }
    const out = { plan, credits };
      __accessMemo = { t: Date.now(), v: out };
      return out;
    })().finally(()=>{ __accessInflightP = null; });
    return __accessInflightP;
  }

  // ---------- Portal overlay (Dashboard) ----------
  const PORTAL_ID = "pw-dashboard-portal";
  function getPortal(){
    let el = document.getElementById(PORTAL_ID);
    if(!el){
      el = document.createElement("div");
      el.id = PORTAL_ID;
      el.className = "paywall-portal";
      el.style.cssText = "position:fixed; inset:0; z-index:2147483647; pointer-events:none;";
      document.documentElement.appendChild(el);
    }
    return el;
  }

  function removePortal(){
    const el = document.getElementById(PORTAL_ID);
    if(el) el.remove();
  }

  function esc(s){
    return String(s||"")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  

  // Internet Archive direct client (no backend dependency)
  async function iaJson(url){
    try{
      const r = await fetch(url, {method:"GET", mode:"cors"});
      if(!r.ok) return null;
      return await r.json();
    }catch(_e){ return null; }
  }

  function iaThumb(identifier){
    return `https://archive.org/services/img/${encodeURIComponent(identifier)}`;
  }
  function iaEmbed(identifier){
    return `https://archive.org/embed/${encodeURIComponent(identifier)}`;
  }

  async function iaPickMp4(identifier){
    const meta = await iaJson(`https://archive.org/metadata/${encodeURIComponent(identifier)}`);
    const files = meta?.files || [];
    // pick a reasonable mp4
    const mp4 = files.find(f => (f.name||'').toLowerCase().endsWith('.mp4') && !String(f.name).includes('_thumb'))
              || files.find(f => (f.format||'').toLowerCase().includes('mpeg4') || (f.format||'').toLowerCase().includes('h.264'));
    if(!mp4?.name) return null;
    return `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(mp4.name)}`;
  }

  // Return a list of playable mp4 files inside a single IA item (used when one identifier contains many episodes).
  async function iaListMp4Files(identifier, limit=500){
    const meta = await iaJson(`https://archive.org/metadata/${encodeURIComponent(identifier)}`);
    const files = Array.isArray(meta?.files) ? meta.files : [];
    const mp4s = files
      .filter(f => (f?.name||'').toLowerCase().endsWith('.mp4'))
      .filter(f => !String(f.name).includes('_thumb') && !String(f.name).includes('__ia_thumb'))
      .sort((a,b)=> String(a.name||'').localeCompare(String(b.name||''), undefined, {numeric:true, sensitivity:'base'}));
    const picked = mp4s.slice(0, Math.max(1, limit));
    return picked.map(f => ({
      name: f.name,
      title: (f.title || f.original || f.name || '').toString(),
      url: `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(f.name)}`
    }));
  }

  async function iaItemFromIdentifier(identifier, fallbackTitle){
    const mp4 = await iaPickMp4(identifier);
    return {
      title: fallbackTitle || identifier,
      identifier,
      mp4: mp4 || '',
      thumb: iaThumb(identifier),
      embedUrl: iaEmbed(identifier)
    };
  }

  async function iaSearchItems(query, limit=24){
    const q = `(${query}) AND mediatype:(movies)`;
    const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl[]=identifier&fl[]=title&rows=${limit}&page=1&output=json`;
    const j = await iaJson(url);
    const docs = j?.response?.docs || [];
    // lightweight items (no metadata calls)
    return docs.map(d=>({
      title: d.title || d.identifier,
      identifier: d.identifier,
      mp4: '',
      thumb: iaThumb(d.identifier),
      embedUrl: iaEmbed(d.identifier)
    }));
  }

  // Expose IA helpers for other parts of the app (module/classic-script safe)
  try{
    window.iaJson = window.iaJson || iaJson;
    window.iaThumb = window.iaThumb || iaThumb;
    window.iaEmbed = window.iaEmbed || iaEmbed;
    window.iaPickMp4 = window.iaPickMp4 || iaPickMp4;
    window.iaListMp4Files = window.iaListMp4Files || iaListMp4Files;
    window.iaItemFromIdentifier = window.iaItemFromIdentifier || iaItemFromIdentifier;
    window.iaSearchItems = window.iaSearchItems || iaSearchItems;
  }catch(e){}

function dashboardCardHTML(access){
    const plan = normPlan(access.plan);
    const credits = Number(access.credits||0) || 0;

    let subline = "";
    if(isPremium(plan)){
      subline = "Premium actif — accès complet";
    }else if(credits > 0){
      subline = `${credits} crédits disponibles — accès en FREE (consomme des crédits à l’usage)`;
    }else{
      subline = "0 crédit — Premium ou crédits requis";
    }

    return `
      <div style="
        width:min(560px, calc(100vw - 32px));
        border:1px solid rgba(255,255,255,.10);
        background: rgba(10,10,12,.92);
        box-shadow: 0 18px 70px rgba(0,0,0,.65);
        border-radius: 16px;
        padding: 16px 16px 14px;
        pointer-events:auto;
        ">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:34px; height:34px; border-radius:12px; background:rgba(0,242,234,.12); display:flex; align-items:center; justify-content:center; border:1px solid rgba(0,242,234,.18);">
            <i class="fas fa-lock" style="color:#00f2ea"></i>
          </div>
          <div>
            <div style="font-weight:900; color:#fff; font-size:14px; line-height:1.1;">Analytics Pro — Dashboard Premium</div>
            <div style="font-size:11px; color:rgba(255,255,255,.62); margin-top:2px;">Débloque les 3 onglets de stats sous le lecteur</div>
          </div>
        </div>

        <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
          <span style="font-size:11px; padding:4px 8px; border-radius:999px; border:1px solid rgba(0,242,234,.22); color:#00f2ea;">OVERVIEW</span>
          <span style="font-size:11px; padding:4px 8px; border-radius:999px; border:1px solid rgba(0,242,234,.22); color:#00f2ea;">ANALYTICS PRO</span>
          <span style="font-size:11px; padding:4px 8px; border-radius:999px; border:1px solid rgba(0,242,234,.22); color:#00f2ea;">NICHE</span>
        </div>

        <div style="margin-top:10px; color:rgba(255,255,255,.78); font-size:12px; line-height:1.35;">
          • Graphes + tendances (pics, patterns, historique)<br/>
          • Alertes auto (opportunités/risques) + résumé actionnable<br/>
          • Analyse niche (comparaisons, axes d’optimisation)
        </div>

        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:12px;">
          <a href="${PRICING_URL}" style="display:inline-flex; align-items:center; gap:8px; padding:9px 12px; border-radius:12px; background:#00f2ea; color:#000; font-weight:900; font-size:12px; text-decoration:none;">
            <i class="fas fa-crown"></i> Voir les offres
          </a>
          <div style="font-size:11px; color:rgba(255,255,255,.55); text-align:right;">${esc(subline)}</div>
        </div>
      </div>
    `;
  }

  function positionPortalCard(scope, html){
    const portal = getPortal();
    portal.innerHTML = "";

    if(!scope) return;

    const r = scope.getBoundingClientRect();
    if(r.width < 50 || r.height < 50) return;

    // Wrapper for positioning
    const wrap = document.createElement("div");
    wrap.style.cssText = "position:absolute; inset:0; pointer-events:none;";

    const card = document.createElement("div");
    card.innerHTML = html;
    // Center on scope rect
    const cx = r.left + r.width/2;
    const cy = r.top + Math.min(r.height/2, 220);

    card.style.cssText = `position:fixed; left:${cx}px; top:${cy}px; transform:translate(-50%,-50%); pointer-events:none;`;
    // make inner card clickable
    const inner = card.firstElementChild;
    if(inner) inner.style.pointerEvents = "auto";

    wrap.appendChild(card);
    portal.appendChild(wrap);
  }

  // ---------- Inline overlays (tools) ----------
  function ensureScopeClass(el){
    if(!el.classList.contains("paywall-scope")) el.classList.add("paywall-scope");
  }
  function toolCardHTML({title, desc, access}){
    const plan = normPlan(access.plan);
    const credits = Number(access.credits||0) || 0;
    let subline = "";
    if(isPremium(plan)) subline = "Premium actif";
    else if(credits>0) subline = `${credits} crédits — utilisable en FREE`;
    else subline = "0 crédit — Premium ou crédits requis";

    return `
      <div class="paywall-inline-card">
        <div class="paywall-inline-head"><i class="fas fa-lock"></i> <span>${esc(title || "Fonction Premium")}</span></div>
        <div class="paywall-inline-desc">${esc(desc || "Débloque cette fonctionnalité avec Premium ou crédits.")}</div>
        <div class="paywall-inline-cta">
          <a href="${PRICING_URL}"><i class="fas fa-lock-open"></i> Voir les offres</a>
          <span style="font-size:11px; color: rgba(255,255,255,.55);">${esc(subline)}</span>
        </div>
      </div>
    `;
  }

  function ensureInlineOverlay(el, html){
    let ov = el.querySelector(":scope > .paywall-inline-overlay");
    if(!ov){
      ov = document.createElement("div");
      ov.className = "paywall-inline-overlay";
      ov.addEventListener("click", (e)=>{
        const t = e.target;
        if(t && (t.tagName === "A" || t.closest("a"))) return;
        window.location.href = PRICING_URL;
      });
      el.appendChild(ov);
    }
    ov.innerHTML = html;
  }
  function removeInlineOverlay(el){
    const ov = el.querySelector(":scope > .paywall-inline-overlay");
    if(ov) ov.remove();
  }

  // Remove legacy overlays/cards inside a scope (old versions)
  function cleanupScope(scope){
    if(!scope) return;
    scope.querySelectorAll(".paywall-inline-overlay").forEach(n=>n.remove());
    // Some older versions injected floating cards without wrapper
    scope.querySelectorAll(".paywall-inline-card, .paywall-inline-head, .paywall-inline-desc").forEach(()=>{});
    // Remove old portal(s)
    document.querySelectorAll(".paywall-portal").forEach(p=>{
      if(p.id !== PORTAL_ID) p.remove();
    });
  }

  // Force clear residual blur when unlocked (in case a legacy class remains)
  function clearResidualBlur(scope){
    if(!scope) return;
    scope.style.filter = "";
    scope.style.backdropFilter = "";
    scope.style.webkitBackdropFilter = "";
    scope.classList.remove("is-blurred","blurred","premium-blur","paywall-locked");
    scope.querySelectorAll(".is-blurred,.blurred,.premium-blur,.paywall-locked").forEach(n=>{
      n.classList.remove("is-blurred","blurred","premium-blur","paywall-locked");
      n.style.filter = "";
      n.style.backdropFilter = "";
      n.style.webkitBackdropFilter = "";
    });
  }

  let access = { plan:"FREE", credits:0 };
  let busy = false;

  async function apply(){
    if(busy) return;
    busy = true;

    access = await fetchAccess();

    const dashboard = document.querySelector(DASHBOARD_SEL);
    const all = Array.from(document.querySelectorAll("[data-paywall]"));

    // Always prevent duplicates inside dashboard: only dashboard gets the global portal
    if(dashboard){
      cleanupScope(dashboard);
      // Ensure children never keep locked state from previous runs
      dashboard.querySelectorAll("[data-paywall]").forEach(el=>{
        if(el !== dashboard){
          el.removeAttribute("data-paywall-locked");
          removeInlineOverlay(el);
          clearResidualBlur(el);
        }
      });
    }

    const canUseByCredits = (Number(access.credits||0) > 0);
    const premium = isPremium(access.plan);

    // Dashboard lock/unlock
    if(dashboard){
      ensureScopeClass(dashboard);
      const lockedDash = !(premium || canUseByCredits);
      if(lockedDash){
        dashboard.setAttribute("data-paywall-locked","1");
        positionPortalCard(dashboard, dashboardCardHTML(access));
      }else{
        dashboard.removeAttribute("data-paywall-locked");
        removePortal();
        clearResidualBlur(dashboard);
      }
    }

    // Independent tools (best_time / costream_match)
    for(const el of all){
      const feature = el.getAttribute("data-paywall-feature") || "generic";
      if(feature === "dashboard_premium") continue;
      if(dashboard && dashboard.contains(el)) {
        // never show child paywalls inside dashboard
        el.removeAttribute("data-paywall-locked");
        removeInlineOverlay(el);
        clearResidualBlur(el);
        continue;
      }

      ensureScopeClass(el);

      const locked = !(premium || canUseByCredits);
      if(locked){
        el.setAttribute("data-paywall-locked","1");
        const title = el.getAttribute("data-paywall-title") || "";
        const desc  = el.getAttribute("data-paywall-desc") || "";
        ensureInlineOverlay(el, toolCardHTML({title, desc, access}));
      }else{
        el.removeAttribute("data-paywall-locked");
        removeInlineOverlay(el);
        clearResidualBlur(el);
      }
    }

    busy = false;
  }

  function debounce(fn, wait){
    let t=null;
    return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), wait); };
  }
  const applyDebounced = debounce(apply, 120);

  // Safety net: some auth flows rerender without dispatching events.
  // Re-apply periodically for a short window, then keep a slow heartbeat.
  let __pwTicks = 0;
  setInterval(()=>{
    __pwTicks++;
    // fast for first ~30s
    if(__pwTicks < 20) applyDebounced();
    // then every ~15s
    else if(__pwTicks % 10 === 0) applyDebounced();
  }, 1500);


  // Re-apply when billing changes
  window.addEventListener("billing:updated", applyDebounced);
  window.addEventListener("focus", applyDebounced);
  window.addEventListener("resize", applyDebounced);
  window.addEventListener("scroll", applyDebounced, true);

  // Observe DOM changes (some blocks rerender on login/stream updates)
  try{
    const mo = new MutationObserver(applyDebounced);
    mo.observe(document.documentElement, { childList:true, subtree:true });
  }catch(_e){}

  // Periodic re-apply (certains rerenders login ne déclenchent pas toujours les bons events)
  try{
    setInterval(()=>{
      if(document.hidden) return;
      applyDebounced();
    }, 2000);
  }catch(_e){}

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", apply, { once:true });
  }else{
    apply();
  }

  // --- Expose helpers globally (needed by other modules) ---
  try{
    window.fetchJSON = fetchJSON;
    if (typeof fetchJsonSafe === 'function') window.fetchJsonSafe = fetchJsonSafe;
  }catch(e){}
  try{
    window.iaSearchItems = iaSearchItems;
    window.iaItemFromIdentifier = iaItemFromIdentifier;
    window.iaThumb = iaThumb;
    window.iaEmbed = iaEmbed;
  }catch(e){}

})();




/* ===========================
   ORYON Big Picture (Steam-like)
   - Fullscreen layout + full-width (no black sides)
   - Focus navigation by rows
   - Gamepad support (A/B + dpad/stick)
   - Smooth transition + optional whoosh
   =========================== */

let tfBigPicture = true;
let tfLastFocus = null;
let tfNavEnabled = false;
let tfGamepadTimer = null;
let tfGpPrev = { t:0, ax:0, ay:0, b:[] };

function tfShowBpTransition(){
  const el = document.getElementById('tf-bp-transition');
  if(!el) return;
  el.classList.add('active');
  el.setAttribute('aria-hidden','false');
  // auto-hide quickly
  setTimeout(()=>{ try{ el.classList.remove('active'); el.setAttribute('aria-hidden','true'); }catch(_){} }, 520);
}

function tfWhoosh(){
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const dur = 0.22;
    const sr = ctx.sampleRate;
    const n = Math.floor(sr*dur);
    const buf = ctx.createBuffer(1, n, sr);
    const data = buf.getChannelData(0);
    for(let i=0;i<n;i++){
      const t = i/n;
      // noise with envelope (fast attack, smooth decay)
      const env = Math.exp(-6*t) * (1 - Math.exp(-40*t));
      data[i] = (Math.random()*2-1) * env * 0.65;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    const g = ctx.createGain();
    g.gain.value = 0.9;
    // sweep filter for "whoosh"
    filt.frequency.setValueAtTime(220, ctx.currentTime);
    filt.frequency.exponentialRampToValueAtTime(1600, ctx.currentTime + dur);
    src.connect(filt); filt.connect(g); g.connect(ctx.destination);
    src.start();
    setTimeout(()=>{ try{ ctx.close(); }catch(_){} }, 500);
  }catch(_){}
}

function tfEnsureCardVisible(card){
  try{
    if(!card) return;
    const track = card.closest('.tf-row-track') || card.closest('.tf-row') || card.parentElement;
    if(!track) { card.scrollIntoView({block:'nearest', inline:'nearest'}); return; }

    // If the focused card is outside the visible area of the track, scroll it in.
    const c = card.getBoundingClientRect();
    const t = track.getBoundingClientRect();
    const pad = 28; // breathing room
    if(c.left < t.left + pad){
      const dx = (t.left + pad) - c.left;
      track.scrollBy({ left: -dx, behavior:'smooth' });
    }else if(c.right > t.right - pad){
      const dx = c.right - (t.right - pad);
      track.scrollBy({ left: dx, behavior:'smooth' });
    }

    // keep dots in sync
    if(track.__tfPaging && track.__tfPaging.updateDots){
      requestAnimationFrame(track.__tfPaging.updateDots);
    }
  }catch(_){}
}

function tfSetupRowPaging(rowEl){
  try{
    if(!rowEl) return;
    const track = rowEl.querySelector('.tf-row-track') || rowEl.querySelector('.tf-row');
    const head  = rowEl.querySelector('.tf-row-head') || rowEl.querySelector('.tf-strip-title') || rowEl.querySelector('.tf-row-title')?.parentElement;
    const title = rowEl.querySelector('.tf-row-title') || rowEl.querySelector('.tf-strip-title') || rowEl.querySelector('h4')?.parentElement;
    if(!track || !head) return;

    if(track.__tfPaging) return;

    let dots = head.querySelector('.tf-row-dots');
    if(!dots){
      dots = document.createElement('div');
      dots.className = 'tf-row-dots';
      head.appendChild(dots);
    }
    // C2 PRIME: row arrows
    let arrows = head.querySelector('.tf-row-arrows');
    if(!arrows){
      arrows = document.createElement('div');
      arrows.className = 'tf-row-arrows';
      arrows.innerHTML = `<button class="tf-row-arrow" type="button" data-dir="-1" aria-label="Précédent">‹</button><button class="tf-row-arrow" type="button" data-dir="1" aria-label="Suivant">›</button>`;
      head.appendChild(arrows);
    }

    track.style.scrollSnapType = 'x mandatory';
    track.style.scrollBehavior = 'smooth';

    function pageStep(){ return Math.max(240, Math.floor(track.clientWidth * 0.88)); }
    function pageCount(){
      const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
      if(maxScroll <= 0) return 1;
      return Math.max(1, Math.ceil(maxScroll / pageStep()) + 1);
    }
    function currentPage(){
      const step = pageStep();
      return step ? Math.round(track.scrollLeft / step) : 0;
    }
    function updateDots(){
      const p = currentPage();
      Array.from(dots.children).forEach((el,i)=>el.classList.toggle('active', i===p));
    }
    function renderDots(){
      const n = pageCount();
      dots.innerHTML = '';
      for(let i=0;i<n;i++){
        const d = document.createElement('span');
        d.className = 'tf-dot';
        d.dataset.page = String(i);
        dots.appendChild(d);
      }
      updateDots();
    }

    let raf=null;
    track.addEventListener('scroll', ()=>{
      if(raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(updateDots);
    }, {passive:true});

    dots.addEventListener('click', (e)=>{
      const t = e.target;
      if(!(t && t.dataset && t.dataset.page)) return;
      const p = parseInt(t.dataset.page,10);
      const left = p * pageStep();
      track.scrollTo({ left, behavior:'smooth' });
    });

    // arrows paging
    arrows.addEventListener('click', (e)=>{
      const b = e.target && e.target.dataset ? e.target : null;
      const dir = b && b.dataset && b.dataset.dir ? parseInt(b.dataset.dir,10) : 0;
      if(!dir) return;
      const p = currentPage() + dir;
      const left = Math.max(0, p * pageStep());
      track.scrollTo({ left, behavior:'smooth' });
    });

    const ro = new ResizeObserver(()=>renderDots());
    ro.observe(track);

    tfEnableTrackDrag(track);
    track.__tfPaging = { dots, ro, renderDots, updateDots, pageStep };
    renderDots();
  }catch(_){}
}


// tfGlobalClickDelegate: make mouse clicks reliable even with draggable rows / overlays
;(function tfGlobalClickDelegate(){
  if (window.__tfGlobalClickDelegate) return;
  window.__tfGlobalClickDelegate = true;
  document.addEventListener('click', function(e){
    const t = e.target;
    if(!t) return;
    const pill = t.closest && t.closest('.tf-pill');
    const card = t.closest && t.closest('.tf-card');
    if(!card) return;

    // if user clicked on a pill, prioritize its intent
    if(pill){
      const txt = (pill.textContent||'').toLowerCase();
      if(txt.includes('lire') || txt.includes('play')){
        e.preventDefault(); e.stopPropagation();
        card.click(); // card.onclick already routes (category or VOD)
        return;
      }
      if(txt.includes('preview')){
        e.preventDefault(); e.stopPropagation();
        try{ window.tfPreviewCard && window.tfPreviewCard(card); }catch(_){}
        return;
      }
    }
  }, true);
})();
function tfEnableTrackDrag(track){
  if(!track || track.__tfDrag) return;
  track.__tfDrag = true;
  let down=false, startX=0, startScroll=0, moved=false;
  const TAP_SLOP = 6; // px
  track.addEventListener('pointerdown',(e)=>{
    down=true; moved=false;
    startX=e.clientX; startScroll=track.scrollLeft;
  }, {passive:true});
  track.addEventListener('pointermove',(e)=>{
    if(!down) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > TAP_SLOP) moved=true;
    track.scrollLeft = startScroll - dx;
  }, {passive:true});
  track.addEventListener('pointerup',(e)=>{
    if(!down) return;
    down=false;
    // If it was a tap (no drag), forward a click to the card under cursor
    if(!moved){
      try{
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const card = el && el.closest ? el.closest('.tf-card') : null;
        if(card){
          card.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window}));
        }
      }catch(_){}
    }
  }, {passive:true});
  track.addEventListener('pointercancel',()=>{ down=false; moved=false; }, {passive:true});
}

function tfEnableBigPictureNav(){
  if(tfNavEnabled) return;
  tfNavEnabled = true;

  document.addEventListener('keydown', tfBpKeyHandler, true);
  tfStartGamepad();
}

function tfDisableBigPictureNav(){
  tfNavEnabled = false;
  document.removeEventListener('keydown', tfBpKeyHandler, true);
  tfStopGamepad();
}

function tfToggleBigPicture(){
  // ORYON TV: Big Picture mandatory (button removed)
  tfBigPicture = true;
  document.body.classList.add('tf-bigpicture');
  tfViewMode = 'rows';
  try{ tfEnableBigPictureNav(); }catch(_){}
  try{ renderTwitFlix(); }catch(_){}
}

/* Row-based focus navigation */
function tfGetRows(){
  return Array.from(document.querySelectorAll('#twitflix-modal .tf-row'));
}
function tfGetCardsInRow(row){
  if(!row) return [];
  return Array.from(row.querySelectorAll('.tf-row-track .tf-card'));
}

function tfFocusCard(card, scrollIntoView){
  if(!card) return;
  try{
    document.querySelectorAll('#twitflix-modal .tf-card.tf-focused').forEach(e=>e.classList.remove('tf-focused'));
    card.classList.add('tf-focused');
    card.focus({ preventScroll: true });
      tfEnsureCardVisible(card);
    if(scrollIntoView){
      // keep the focused row roughly centered
      const body = document.getElementById('tf-body');
      const row = card.closest('.tf-row');
      if(body && row){
        const rb = row.getBoundingClientRect();
        const bb = body.getBoundingClientRect();
        const delta = (rb.top + rb.height/2) - (bb.top + bb.height/2);
        body.scrollBy({ top: delta, behavior: 'smooth' });
      }else{
        card.scrollIntoView({ block:'nearest', inline:'nearest', behavior:'smooth' });
      }
    }
  }catch(_){}
}

function tfMoveFocus(dx, dy){
  const rows = tfGetRows();
  if(!rows.length) return;
  const active = document.querySelector('#twitflix-modal .tf-card.tf-focused') || document.activeElement;
  let curRowIdx = 0;
  let curColIdx = 0;

  // locate current
  if(active && active.closest){
    const row = active.closest('.tf-row');
    const ri = rows.indexOf(row);
    if(ri >= 0) curRowIdx = ri;
    const cards = tfGetCardsInRow(row);
    const ci = cards.indexOf(active);
    if(ci >= 0) curColIdx = ci;
  }

  let nextRowIdx = curRowIdx + dy;
  nextRowIdx = Math.max(0, Math.min(rows.length-1, nextRowIdx));
  let row = rows[nextRowIdx];
  let cards = tfGetCardsInRow(row);
  if(!cards.length) return;

  // horizontal within same row
  if(dy === 0){
    let nextColIdx = curColIdx + dx;
    nextColIdx = Math.max(0, Math.min(cards.length-1, nextColIdx));
    tfFocusCard(cards[nextColIdx], true);
    return;
  }

  // vertical: preserve approximate column (by ratio)
  const prevRow = rows[curRowIdx];
  const prevCards = tfGetCardsInRow(prevRow);
  const ratio = prevCards.length ? (curColIdx / Math.max(1, prevCards.length-1)) : 0;
  const targetIdx = Math.round(ratio * Math.max(1, cards.length-1));
  tfFocusCard(cards[targetIdx], true);
}

// Page-based horizontal snap scrolling (Netflix/Prime feel)
function tfGetActiveTrack(){
  const focused = document.querySelector('#twitflix-modal .tf-card.tf-focused') || document.activeElement;
  if(!focused) return null;
  return focused.closest('.tf-row-track') || focused.closest('.tf-search-grid');
}
function tfScrollTrackPage(dir){
  const track = tfGetActiveTrack();
  if(!track) return;
  const delta = Math.max(220, Math.floor(track.clientWidth * 0.88)) * (dir < 0 ? -1 : 1);
  track.scrollBy({ left: delta, behavior: 'smooth' });
  // after scrolling, try to keep focus on a visible card
  setTimeout(()=>{ try{ tfSnapFocusToVisible(track, dir); }catch(_){} }, 260);
}
function tfSnapFocusToVisible(track, dir){
  const cards = Array.from(track.querySelectorAll('.tf-card'));
  if(!cards.length) return;
  const r = track.getBoundingClientRect();
  let best = null;
  for(const c of cards){
    const cr = c.getBoundingClientRect();
    const visible = Math.min(cr.right, r.right) - Math.max(cr.left, r.left);
    if(visible >= Math.min(cr.width, r.width) * 0.55){
      best = c;
      // if moving right, keep iterating to get last visible
      if(dir < 0) break;
    }
  }
  if(!best) best = (dir > 0 ? cards[cards.length-1] : cards[0]);
  tfFocusCard(best, false);
}

function tfBpKeyHandler(e){
  // Only when TwitFlix is open and bigpicture enabled
  if(!tfBigPicture) return;

  // Don't hijack typing in search
  const a = document.activeElement;
  const inSearch = a && (a.id === 'twitflix-search' || a.classList?.contains('tf-search'));
  if(inSearch && !['Escape'].includes(e.key)) return;

  if(e.key === 'Escape'){
    e.preventDefault();
    tfToggleBigPicture(false);
    return;
  }
  if(e.key === 'ArrowLeft'){ e.preventDefault(); tfMoveFocus(-1,0); return; }
  if(e.key === 'ArrowRight'){ e.preventDefault(); tfMoveFocus(1,0); return; }
  if(e.key === 'ArrowUp'){ e.preventDefault(); tfMoveFocus(0,-1); return; }
  if(e.key === 'ArrowDown'){ e.preventDefault(); tfMoveFocus(0,1); return; }

  // Page jump within the current row (Netflix-like)
  if(e.key === 'PageDown' || (e.key === 'ArrowRight' && e.shiftKey)){ e.preventDefault(); tfScrollTrackPage(1); return; }
  if(e.key === 'PageUp'   || (e.key === 'ArrowLeft'  && e.shiftKey)){ e.preventDefault(); tfScrollTrackPage(-1); return; }

  if(e.key === 'Enter' || e.key === ' '){
    const focused = document.querySelector('#twitflix-modal .tf-card.tf-focused');
    if(focused){ e.preventDefault(); focused.click(); }
  }
}

/* Gamepad support (best-effort) */
function tfStartGamepad(){
  if(tfGamepadTimer) return;
  tfGpPrev = { t:0, ax:0, ay:0, b:[] };
  tfGamepadTimer = setInterval(tfPollGamepad, 80);
}
function tfStopGamepad(){
  if(tfGamepadTimer){ clearInterval(tfGamepadTimer); tfGamepadTimer = null; }
}

function tfPressed(btn){ return !!(btn && (btn.pressed || btn.value > 0.5)); }

function tfPollGamepad(){
  if(!tfBigPicture) return;
  const gps = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = gps && (gps[0] || gps[1] || gps[2] || gps[3]);
  if(!gp) return;

  const now = Date.now();
  const cooldown = 160; // ms
  const dead = 0.35;

  const ax = gp.axes?.[0] ?? 0;
  const ay = gp.axes?.[1] ?? 0;

  const dLeft  = tfPressed(gp.buttons?.[14]) || ax < -dead;
  const dRight = tfPressed(gp.buttons?.[15]) || ax >  dead;
  const dUp    = tfPressed(gp.buttons?.[12]) || ay < -dead;
  const dDown  = tfPressed(gp.buttons?.[13]) || ay >  dead;

  const A = tfPressed(gp.buttons?.[0]); // A / Cross
  const B = tfPressed(gp.buttons?.[1]); // B / Circle
  const X  = tfPressed(gp.buttons?.[2]); // X / Square
  const LB = tfPressed(gp.buttons?.[4]); // LB
  const RB = tfPressed(gp.buttons?.[5]); // RB

  // edge detection + cooldown
  const prev = tfGpPrev;
  function edge(name, cur){
    const was = !!prev[name];
    prev[name] = cur;
    return cur && !was;
  }
  if(now - prev.t > cooldown){
    if(edge('l', dLeft))  { tfMoveFocus(-1,0); prev.t = now; return; }
    if(edge('r', dRight)) { tfMoveFocus(1,0);  prev.t = now; return; }
    if(edge('LB', LB))    { tfScrollTrackPage(-1); prev.t = now; return; }
    if(edge('RB', RB))    { tfScrollTrackPage(1);  prev.t = now; return; }
    if(edge('u', dUp))    { tfMoveFocus(0,-1); prev.t = now; return; }
    if(edge('d', dDown))  { tfMoveFocus(0,1);  prev.t = now; return; }
  }

  if(edge('A', A)){
    const focused = document.querySelector('#twitflix-modal .tf-card.tf-focused');
    focused?.click?.();
  }
  if(edge('B', B)){
    tfToggleBigPicture(false);
  }
  if(edge('X', X)){
    // quick toggle search focus
    const s = document.getElementById('twitflix-search');
    if(s){ s.focus(); }
  }
}

// Ensure we exit Big Picture when closing TwitFlix
try{
  const __closeTwitFlix = window.closeTwitFlix;
  if (typeof __closeTwitFlix === 'function'){
    window.closeTwitFlix = function(){
      try{ tfToggleBigPicture(false); }catch(_){}
      return __closeTwitFlix.apply(this, arguments);
    };
  }
}catch(_){}


function tfAnnotateRows(){
  try{
    document.querySelectorAll('#twitflix-modal .tf-row').forEach((row,i)=>{
      row.dataset.rowIndex = String(i);
      try{ tfSetupRowPaging(row); }catch(_){ }
      const t = row.querySelector('.tf-row-track');
      if(t) try{ tfEnableTrackDrag(t); }catch(_){ }
    });

    document.querySelectorAll('#twitflix-modal .tf-row-track').forEach(track=>{
      const row = track.closest('.tf-row') || track.parentElement;
      if(row) try{ tfSetupRowPaging(row); }catch(_){ }
      try{ tfEnableTrackDrag(track); }catch(_){ }
    });
  }catch(_){ }
}
const __renderTwitFlix = window.renderTwitFlix;
window.renderTwitFlix = function(){
  const r = __renderTwitFlix.apply(this, arguments);
  setTimeout(tfAnnotateRows, 0);
  return r;
};


// ORYON_TV_BUILD_MARK v1770423290
console.log('ORYON TV build', 1770423290);


// ORYON TV menu (close / quit)
function tfToggleMenu(e){
  try{ e && e.stopPropagation(); }catch(_){}
  const p = document.getElementById('tf-menu-panel');
  if(!p) return;
  p.style.display = (p.style.display === 'none' || !p.style.display) ? 'block' : 'none';
}
function tfHideMenu(){
  const p = document.getElementById('tf-menu-panel');
  if(p) p.style.display = 'none';
}
function tfQuitApp(){
  // Works in Electron wrapper (window.close). If blocked in browser, user can close tab.
  try{ window.close(); }catch(_){}
}
document.addEventListener('click', ()=>{ try{ tfHideMenu(); }catch(_){ } }, true);

      if(!document.getElementById('oryon-menu-style')){
        const st = document.createElement('style');
        st.id = 'oryon-menu-style';
        st.textContent = `
          .tf-menu{position:relative;display:inline-block;margin-right:8px;}
          .tf-menu-btn{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#fff;border-radius:10px;padding:8px 10px;font-size:16px;line-height:1;cursor:pointer}
          .tf-menu-panel{position:absolute;right:0;top:42px;min-width:200px;background:rgba(10,10,12,.98);border:1px solid rgba(255,255,255,.12);border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.5);padding:6px;z-index:99999}
          .tf-menu-panel button{width:100%;text-align:left;background:transparent;border:0;color:#fff;padding:10px 10px;border-radius:10px;cursor:pointer}
          .tf-menu-panel button:hover{background:rgba(255,255,255,.08)}
        `;
        document.head.appendChild(st);
      }


// =========================================================
// SOCLE C2: TV Search Overlay (Prime)
//  - Ctrl+K opens, Esc closes
//  - Gamepad: Y opens, B closes, A selects
//  - Fetches VOD via /api/twitch/vods/search?title=...
// =========================================================
;(function oryonTvSearchOverlay(){
  try{
    const css = `
    .oryon-so{position:fixed;inset:0;z-index:100000;display:none;align-items:flex-start;justify-content:center;padding:34px 24px;background:rgba(0,0,0,.86);backdrop-filter:blur(7px);}
    .oryon-so.open{display:flex;}
    .oryon-so-panel{width:min(1320px,100%);border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(10,10,10,.92);box-shadow:0 20px 60px rgba(0,0,0,.6);overflow:hidden;}
    .oryon-so-top{display:flex;gap:12px;align-items:center;padding:14px;border-bottom:1px solid rgba(255,255,255,.10);}
    .oryon-so-input{flex:1;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:12px 14px;color:#fff;font-size:16px;outline:none;}
    .oryon-so-hint{font-size:12px;color:rgba(255,255,255,.65);white-space:nowrap;}
    .oryon-so-body{padding:16px;max-height:72vh;overflow:auto;}
    .oryon-so-grid{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:10px;}
    @media (max-width:1200px){.oryon-so-grid{grid-template-columns:repeat(7,1fr)}}
    @media (max-width:980px){.oryon-so-grid{grid-template-columns:repeat(6,1fr)}}
    @media (max-width:760px){.oryon-so-grid{grid-template-columns:repeat(5,1fr)}}
    @media (max-width:560px){.oryon-so-grid{grid-template-columns:repeat(4,1fr)}}
    .oryon-so-card{position:relative;border-radius:14px;overflow:hidden;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);cursor:pointer;user-select:none;}
    .oryon-so-card img{display:block;width:100%;aspect-ratio:3/4;object-fit:cover;}
    .oryon-so-card:focus{outline:none;border-color:rgba(0,242,234,.85);box-shadow:0 0 0 2px rgba(0,242,234,.35);}
    .oryon-so-meta{position:absolute;left:0;right:0;bottom:0;padding:10px;background:linear-gradient(to top, rgba(0,0,0,.86), rgba(0,0,0,0));}
    .oryon-so-title{font-size:12px;font-weight:800;color:#fff;line-height:1.15;max-height:2.3em;overflow:hidden;}
    .oryon-so-sub{font-size:11px;color:rgba(255,255,255,.75);margin-top:4px;display:flex;gap:8px;flex-wrap:wrap;}
    .oryon-so-pill{display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:800;border:1px solid rgba(255,255,255,.18);padding:2px 8px;border-radius:999px;background:rgba(0,0,0,.35);}
    .oryon-so-footer{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:12px 14px;border-top:1px solid rgba(255,255,255,.10);color:rgba(255,255,255,.65);font-size:12px;}
    .oryon-so-close{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:8px 10px;color:#fff;cursor:pointer;}
    `;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

    const root = document.createElement('div');
    root.className='oryon-so';
    root.innerHTML=`
      <div class="oryon-so-panel" role="dialog" aria-modal="true">
        <div class="oryon-so-top">
          <input id="oryonSoInput" class="oryon-so-input" type="text" placeholder="Recherche VOD (titre ou jeu)…" autocomplete="off"/>
          <div class="oryon-so-hint">Ctrl+K / Y • Esc / B</div>
        </div>
        <div class="oryon-so-body">
          <div class="oryon-so-grid" id="oryonSoGrid"></div>
        </div>
        <div class="oryon-so-footer">
          <div id="oryonSoStatus">Tape pour chercher…</div>
          <button id="oryonSoClose" class="oryon-so-close">Fermer</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    const input=root.querySelector('#oryonSoInput');
    const grid=root.querySelector('#oryonSoGrid');
    const status=root.querySelector('#oryonSoStatus');
    const closeBtn=root.querySelector('#oryonSoClose');

    let openFlag=false, timer=null, inflight=0, focusIndex=0;

    function open(){
      if(openFlag) return;
      openFlag=true;
      root.classList.add('open');
      setTimeout(()=>{ try{ input.focus(); input.select(); }catch(_){} }, 20);

      // When opening with empty query, show a global selection (Netflix-like)
      try{
        const q=(input.value||'').trim();
        if(!q){
          status.textContent='Top VOD…';
          (async ()=>{
            const items = await fetchTopVods();
            if(!openFlag) return;
            render(items);
          })();
        }
      }catch(_){ }
    }
    function close(){
      if(!openFlag) return;
      openFlag=false;
      root.classList.remove('open');
      inflight++;
      grid.innerHTML='';
      status.textContent='Tape pour chercher…';
    }

    function esc(s){ return String(s||'').replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

    async function fetchVods(q){
      const u = `${API_BASE}/api/twitch/vods/search?title=${encodeURIComponent(q)}&lang=fr&min=20&max=200&limit=28`;
      const r = await fetch(u, { credentials:'include' });
      const j = await r.json().catch(()=>null);
      return (j && j.items) ? j.items : [];
    }

    async function fetchTopVods(){
      const u = `${API_BASE}/api/twitch/vods/top?lang=fr&small=1&limit=28`;
      const r = await fetch(u, { credentials:'include' });
      const j = await r.json().catch(()=>null);
      return (j && j.items) ? j.items : [];
    }

    function render(items){
      grid.innerHTML='';
      focusIndex=0;
      if(!items.length){ status.textContent='Aucun résultat.'; return; }
      status.textContent = `${items.length} résultat(s).`;
      items.forEach((it,i)=>{
        const b=document.createElement('button');
        b.type='button';
        b.className='oryon-so-card';
        b.tabIndex = (i===0?0:-1);
        b.dataset.idx=String(i);
        b.__item = it;
        const thumb = String(it.thumbnail_url||'').replace('%{width}','540').replace('%{height}','720').replace('{width}','540').replace('{height}','720');
        b.innerHTML = `
          <img src="${thumb}" alt="">
          <div class="oryon-so-meta">
            <div class="oryon-so-title">${esc(it.title || it.game_name || it.user_name || 'VOD')}</div>
            <div class="oryon-so-sub">
              <span class="oryon-so-pill">${esc((it.game_name||'').slice(0,22) || 'Jeu')}</span>
              <span class="oryon-so-pill">${esc((it.user_name||'').slice(0,18) || 'Chaîne')}</span>
            </div>
          </div>
        `;
        b.addEventListener('focus',()=>{ focusIndex=i; });
        b.addEventListener('click',()=>{
          try{ loadVodEmbed(it.id, it.user_login || it.user_name); }catch(_){}
          close();
        });
        grid.appendChild(b);
      });
    }

    function moveFocus(delta){
      const cards=[...grid.querySelectorAll('.oryon-so-card')];
      if(!cards.length) return;
      focusIndex = Math.max(0, Math.min(cards.length-1, focusIndex+delta));
      cards.forEach((c,idx)=> c.tabIndex = (idx===focusIndex?0:-1));
      cards[focusIndex].focus();
      cards[focusIndex].scrollIntoView({block:'nearest', inline:'nearest'});
    }

    input.addEventListener('input',()=>{
      const q=(input.value||'').trim();
      if(timer) clearTimeout(timer);
      timer=setTimeout(async ()=>{
        if(q.length<2){ grid.innerHTML=''; status.textContent='Tape au moins 2 caractères…'; return; }
        const my=++inflight;
        status.textContent='Recherche…';
        const items=await fetchVods(q);
        if(my!==inflight) return;
        render(items);
      }, 320);
    });

    // keybinds
    window.addEventListener('keydown',(e)=>{
      const k=(e.key||'');
      const ctrlk=(e.ctrlKey||e.metaKey) && k.toLowerCase()==='k';
      if(ctrlk){ e.preventDefault(); open(); return; }
      if(!openFlag) return;
      if(k==='Escape'){ e.preventDefault(); close(); return; }
      if(k==='ArrowRight'){ e.preventDefault(); moveFocus(1); }
      if(k==='ArrowLeft'){ e.preventDefault(); moveFocus(-1); }
      if(k==='ArrowDown'){ e.preventDefault(); moveFocus(8); }
      if(k==='ArrowUp'){ e.preventDefault(); moveFocus(-8); }
      if(k==='Enter'){
        const c=grid.querySelector(`.oryon-so-card[data-idx="${focusIndex}"]`);
        if(c) c.click();
      }
    }, true);

    root.addEventListener('click',(e)=>{ if(e.target===root) close(); }, true);
    closeBtn.addEventListener('click', close);

    // gamepad open/close/select
    let last={a:false,b:false,y:false,up:false,down:false,left:false,right:false};
    setInterval(()=>{
      try{
        if(!navigator.getGamepads) return;
        const gp=(navigator.getGamepads()||[])[0]; if(!gp) return;
        const a=gp.buttons[0]?.pressed, b=gp.buttons[1]?.pressed, y=gp.buttons[3]?.pressed;
        const up=gp.buttons[12]?.pressed, down=gp.buttons[13]?.pressed, left=gp.buttons[14]?.pressed, right=gp.buttons[15]?.pressed;
        if(y && !last.y) open();
        if(openFlag){
          if(b && !last.b) close();
          if(right && !last.right) moveFocus(1);
          if(left && !last.left) moveFocus(-1);
          if(down && !last.down) moveFocus(8);
          if(up && !last.up) moveFocus(-8);
          if(a && !last.a){
            const c=grid.querySelector(`.oryon-so-card[data-idx="${focusIndex}"]`);
            if(c) c.click();
          }
        }
        last={a,b,y,up,down,left,right};
      }catch(_){}
    }, 100);

    window.__oryonSo = { open, close };
  }catch(_){}
})();


// =========================================================
// ORYON TV — Tabs (VOD / LIVE / ANIME)
// =========================================================
;(function(){
  // Robust tab binding: works even if openTwitFlix is never called or scripts load out-of-order.
  function qs(sel){ return document.querySelector(sel); }
  function qsa(sel){ return Array.from(document.querySelectorAll(sel)); }

  function safeCall(fn){ try{ if(typeof fn === "function") fn(); }catch(_e){} }

  function setTab(tab){
    qsa('#tf-tabsbar .tf-tabbtn').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));

    const hero = qs('.tf-hero');
    const grid = qs('#twitflix-grid');
    const trailerBlock = qs('#tf-trailer-carousel')?.closest('.tf-header-block');
    const liveBlock = qs('#tf-live-carousel')?.closest('.tf-header-block');
    const animeBlock = qs('#tf-anime-block');

    const showVod = (tab==='vod');
    const showLive = (tab==='live');
    const showAnime = (tab==='anime');

    if (hero) hero.style.display = showVod ? '' : 'none';
    if (grid) grid.style.display = showVod ? '' : 'none';
    if (trailerBlock) trailerBlock.style.display = showVod ? '' : 'none';
    if (liveBlock) liveBlock.style.display = showLive ? '' : 'none';
    if (animeBlock) animeBlock.style.display = showAnime ? '' : 'none';

    // Force init/rerender AFTER toggles (prevents "ran while hidden" races)
    if (showVod) setTimeout(()=> safeCall(window.tfRenderTrailerCarousel), 0);

    if (showLive) {
      setTimeout(()=>{
        try{ window.__tfLiveForceRerender = true; }catch(_e){}
        safeCall(window.tfRenderLiveThemes);
      }, 0);
    }

    if (showAnime) {
      setTimeout(()=>{
        if (typeof window.tfInitAnime === 'function') {
          try{ window.tfInitAnime(true); }catch(_e){}
        } else {
          const any = document.querySelector('#tf-anime-block .tf-carousel');
          if (any && !any.querySelector('.tf-empty')) {
            any.innerHTML = '<div class="tf-empty">Chargement animés indisponible (script non chargé).</div>';
          }
        }
      }, 0);
    }
  }

  function initTabsOnce(){
    if (window.__tfTabsInit) return;
    const bar = qs('#tf-tabsbar');
    if(!bar) return;
    window.__tfTabsInit = true;

    bar.addEventListener('click', (e)=>{
      const btn = e.target.closest('.tf-tabbtn');
      if(!btn) return;
      setTab(btn.dataset.tab);
    });

    // default
    setTab('vod');
  }

  // Init as soon as possible
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTabsOnce, { once:true });
  } else {
    initTabsOnce();
  }

  // Also hook openTwitFlix if it exists (harmless)
  const _open = window.openTwitFlix;
  window.openTwitFlix = function(){
    const r = _open?.apply(this, arguments);
    try{ initTabsOnce(); }catch(_e){}
    return r;
  };
})();

// =========================================================
// ORYON TV — Simple MP4 player overlay (for Public Domain anime)
// =========================================================
;(function(){
  function ensurePlayer(){
    let overlay = document.getElementById('tf-player-overlay');
    if(overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'tf-player-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.85);display:none;align-items:center;justify-content:center;padding:18px;';
    overlay.innerHTML = `
      <div style="width:min(1100px,96vw);max-height:92vh;display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div id="tf-player-title" style="font-weight:900;letter-spacing:.02em;opacity:.95;"></div>
          <button id="tf-player-close" type="button" style="padding:.4rem .7rem;border-radius:10px;border:1px solid rgba(255,255,255,.18);font-weight:900;">✕</button>
        </div>
        <video id="tf-player-video" controls playsinline style="width:100%;aspect-ratio:16/9;border-radius:16px;background:#000;"></video>
        <iframe id=\"tf-player-iframe\" allow=\"autoplay; encrypted-media\" referrerpolicy=\"origin\" style=\"display:none;width:100%;aspect-ratio:16/9;border-radius:16px;background:#000;border:0;\"></iframe>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#tf-player-close').onclick = ()=>{ overlay.style.display='none'; const v=overlay.querySelector('#tf-player-video'); const f=overlay.querySelector('#tf-player-iframe'); try{ v.pause(); }catch(_e){} v.removeAttribute('src'); v.load(); v.style.display='block'; if(f){ f.removeAttribute('src'); f.style.display='none'; } };
    overlay.addEventListener('click',(e)=>{ if(e.target===overlay) overlay.querySelector('#tf-player-close').click(); });
    return overlay;
  }
  window.tfPlayMp4 = function(url, title){
    const o = ensurePlayer();
    o.querySelector('#tf-player-title').textContent = title || '';
    const v = o.querySelector('#tf-player-video');
    v.src = url;
    o.style.display = 'flex';
    v.play().catch(()=>{});
  };
  window.tfPlayIframe = function(url, title){
    const o = ensurePlayer();
    o.querySelector('#tf-player-title').textContent = title || '';
    const v = o.querySelector('#tf-player-video');
    const f = o.querySelector('#tf-player-iframe');
    // reset
    try{ v.pause(); }catch(_e){}
    v.style.display='none';
    v.removeAttribute('src');
    v.load();

    f.style.display='block';
    f.src = url || '';
    o.style.display = 'flex';
  };

})()

// =========================================================
// ORYON TV — YouTube playlist overlay (for curated collections)
// =========================================================
;(function(){
  function ensureYT(){
    let overlay = document.getElementById('tf-yt-overlay');
    if(overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'tf-yt-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.85);display:none;align-items:center;justify-content:center;padding:18px;';
    overlay.innerHTML = `
      <div style="width:min(1100px,96vw);max-height:92vh;display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div id="tf-yt-title" style="font-weight:900;letter-spacing:.02em;opacity:.95;"></div>
          <button id="tf-yt-next" style="margin-right:.5rem;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);color:#fff;padding:.45rem .75rem;border-radius:10px;font-weight:900;display:none;">Source suivante</button>
        <a id="tf-yt-open" href="#" target="_blank" rel="noopener" style="margin-right:.5rem;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);color:#fff;padding:.45rem .75rem;border-radius:10px;font-weight:900;text-decoration:none;">Ouvrir YouTube</a>
        <button id="tf-yt-close" type="button" style="padding:.4rem .7rem;border-radius:10px;border:1px solid rgba(255,255,255,.18);font-weight:900;">✕</button>
        </div>
        <iframe id="tf-yt-frame" style="width:100%;aspect-ratio:16/9;border-radius:16px;background:#000;border:0;" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#tf-yt-next').onclick = ()=>{
      try{
        const ids = JSON.parse(overlay.dataset.ids||'[]');
        let idx = parseInt(overlay.dataset.idx||'0',10);
        idx = (idx + 1) % Math.max(1, ids.length);
        overlay.dataset.idx = String(idx);
        const id = ids[idx];
        const kind = overlay.dataset.kind;
        const origin = encodeURIComponent(window.location.origin);
        const f = overlay.querySelector('#tf-yt-frame');
        const open = overlay.querySelector('#tf-yt-open');
        if(kind==='playlist'){
          f.src = `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(id)}&autoplay=1&mute=1&playsinline=1&rel=0&enablejsapi=1&origin=${origin}`;
          open.href = `https://www.youtube.com/playlist?list=${encodeURIComponent(id)}`;
        } else {
          f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&mute=1&playsinline=1&rel=0&enablejsapi=1&origin=${origin}`;
          open.href = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
        }
      }catch(e){}
    };

    overlay.querySelector('#tf-yt-close').onclick = ()=>{
      overlay.style.display='none';
      const f=overlay.querySelector('#tf-yt-frame');
      f.removeAttribute('src');
    };
    overlay.addEventListener('click',(e)=>{ if(e.target===overlay) overlay.querySelector('#tf-yt-close').click(); });
    return overlay;
  }

  window.tfPlayYouTubePlaylist = function(listIdOrList, title){
  const ids = Array.isArray(listIdOrList) ? listIdOrList.filter(Boolean) : [listIdOrList].filter(Boolean);
  if(!ids.length) return;
  const o = ensureYT();
  o.querySelector('#tf-yt-title').textContent = title || 'Playlist';
  o.dataset.kind = 'playlist';
  o.dataset.ids = JSON.stringify(ids);
  o.dataset.idx = '0';
  const origin = encodeURIComponent(window.location.origin);
  const id = ids[0];
  const src = `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(id)}&autoplay=1&mute=1&playsinline=1&rel=0&enablejsapi=1&origin=${origin}`;
  const f = o.querySelector('#tf-yt-frame');
  f.src = src;
  const open = o.querySelector('#tf-yt-open');
  open.href = `https://www.youtube.com/playlist?list=${encodeURIComponent(id)}`;
  const nextBtn = o.querySelector('#tf-yt-next');
  nextBtn.style.display = ids.length > 1 ? 'inline-block' : 'none';
  o.style.display='flex';
};

// Expand a YouTube playlist into a real rail by fetching its items server-side (no API key)
window.tfLoadYouTubePlaylistEpisodesInto = async function(containerId, listId, label){
  const wrap = document.getElementById(containerId);
  if(!wrap) return;
  wrap.innerHTML = '<div class="tf-empty">Chargement de la playlist…</div>';
  // Accept a raw listId (PL/OL...), or a full YouTube URL containing ?list=...
  const raw = String(listId||'').trim();
  let safeList = raw;
  try{
    const m = raw.match(/[?&]list=([^&#]+)/i);
    if(m && m[1]) safeList = decodeURIComponent(m[1]);
  }catch(_e){ /* ignore */ }
  safeList = String(safeList||'').trim();
  if(!safeList){ wrap.innerHTML = '<div class="tf-empty">Aucun épisode.</div>'; return; }

  let json = null;
  try{
    const r = await window.fetchJSON(`/api/youtube/playlist?listId=${encodeURIComponent(safeList)}`);
    if(r && r.ok) json = r.json;
  }catch(_e){ json = null; }

  if(!json || !json.success || !Array.isArray(json.items) || !json.items.length){
    wrap.innerHTML = '<div class="tf-empty">Aucun épisode (playlist YouTube indisponible).</div>';
    return;
  }

  const items = json.items.map((it)=>{
    const vid = String(it.videoId || '').trim();
    const t = (it.title || '').trim() || 'Épisode';
    return {
      title: t,
      thumb: it.thumb || (vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : ''),
      sourceLabel: 'YouTube',
      embedUrl: vid
        ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(vid)}?autoplay=1&mute=0&controls=1&modestbranding=1&playsinline=1&rel=0&origin=${encodeURIComponent(location.origin)}`
        : ''
    };
  }).filter(x => x.embedUrl);

  wrap.innerHTML = '';
  const meta = document.createElement('div');
  meta.className = 'text-sm opacity-70 mb-2';
  meta.textContent = label ? `${label} — ${items.length} épisodes` : `${items.length} épisodes`;
  wrap.appendChild(meta);
  const rail = document.createElement('div');
  rail.id = `${containerId}__rail`;
  wrap.appendChild(rail);
  // renderItemsInto is defined below in the Anime IIFE; call lazily when available
  if(typeof window.__tf_renderItemsInto === 'function'){
    window.__tf_renderItemsInto(rail.id, items);
  }else{
    // fallback: use a minimal card renderer
    items.slice(0,24).forEach(it=>{
      const card=document.createElement('div');
      card.className='tf-card';
      const img=document.createElement('img');
      img.className='tf-thumb';
      img.loading='lazy';
      img.src=it.thumb;
      card.appendChild(img);
      const t=document.createElement('div');
      t.className='tf-title';
      t.textContent=it.title;
      card.appendChild(t);
      card.onclick=()=>window.tfPlayIframe(it.embedUrl,it.title);
      rail.appendChild(card);
    });
  }
};
})();

;


// =========================================================
// ORYON TV — Anime (Public Domain) via server proxy (Archive.org)
//   - rails stacked (no sub-tabs)
//   - some rails are "best-effort" via Archive search
// =========================================================
;(function(){
  let inited=false;

  function esc(s){ return String(s||'').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  async function fetchJsonSafe(url){
  try{
    const r = await window.fetchJSON(url, { method:"GET" });
    if(!r || !r.ok) return null;
    return r.json;
  }catch(_e){
    return null;
  }
}

  function renderItemsInto(carouselId, items){
    const wrap = document.getElementById(carouselId);
    if(!wrap) return;
    if(!items?.length){ wrap.innerHTML = '<div class="tf-empty">Aucun épisode.</div>'; return; }
    wrap.innerHTML='';
    items.slice(0,24).forEach(it=>{
      const card = document.createElement('div');
      card.className='tf-card';
      card.style.minWidth='260px';

      const hasMp4 = !!(it.mp4 && String(it.mp4).trim());
      const thumb = it.thumb || (it.identifier ? iaThumb(it.identifier) : '');
      card.innerHTML = `
        <div class="tf-thumb" style="position:relative;overflow:hidden;border-radius:14px;height:146px;background:#000;display:flex;align-items:center;justify-content:center;">
          ${hasMp4 ? `<video class="tf-card-video" muted playsinline loop preload="metadata" src="${it.mp4}"></video>`
                   : `<img alt="" loading="lazy" src="${thumb}" style="width:100%;height:100%;object-fit:cover;opacity:.95;" />`}
        </div>
        <div class="tf-card-meta">
          <div class="tf-card-title">${esc(it.title||'')}</div>
          <div class="tf-card-sub" style="opacity:.7;font-weight:700;">${it.sourceLabel || 'Archive.org'}</div>
        </div>`;

      if(hasMp4){
        const v=card.querySelector('video');
        try{ v.autoplay=true; v.play().catch(()=>{}); }catch(_e){}
        card.addEventListener('click',()=>window.tfPlayMp4(it.mp4, it.title));
      }else{
        const u = it.embedUrl || (it.identifier ? iaEmbed(it.identifier) : '');
        card.addEventListener('click',()=>window.tfPlayIframe(u, it.title));
      }
      wrap.appendChild(card);
    });
  }

  // expose for other modules
  window.__tf_renderItemsInto = renderItemsInto;
  function renderYouTubePlaylistsInto(carouselId, playlists){
    const wrap = document.getElementById(carouselId);
    if(!wrap) return;
    if(!playlists?.length){ wrap.innerHTML = '<div class="tf-empty">Aucune playlist.</div>'; return; }
    wrap.innerHTML='';
    playlists.forEach(pl=>{
      const card = document.createElement('div');
      card.className='tf-card';
      card.style.minWidth='260px';
      const thumb = pl.thumb || '';
      card.innerHTML = `
        <div class="tf-thumb" style="position:relative;overflow:hidden;border-radius:14px;height:146px;background:#000;">
          <img src="${thumb}" alt="" style="width:100%;height:100%;object-fit:cover;opacity:.92;" />
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
            <div style="background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.18);padding:.35rem .55rem;border-radius:999px;font-weight:900;">
              ▶ Playlist
            </div>
          </div>
        </div>
        <div class="tf-card-meta">
          <div class="tf-card-title">${esc(pl.title||'')}</div>
          <div class="tf-card-sub" style="opacity:.7;font-weight:700;">YouTube</div>
        </div>`;
      card.addEventListener('click', ()=> window.tfPlayYouTubePlaylist?.(pl.listId, pl.title));
      wrap.appendChild(card);
    });
  }



  async function loadByIdentifier(carouselId, identifier){
    const wrap = document.getElementById(carouselId);
    if(!wrap) return;
    wrap.innerHTML = '<div class="tf-empty">Chargement…</div>';
    try{
      const it = await window.iaItemFromIdentifier(identifier, identifier);
      renderItemsInto(carouselId, it ? [it] : []);
    }catch(e){
      wrap.innerHTML = `<div class="tf-empty">Erreur animés: ${esc(e.message||e)}</div>`;
    }
  }

  // For IA items that contain many episodes as separate mp4 files.
  async function loadByItemFiles(carouselId, identifier, label){
    const wrap = document.getElementById(carouselId);
    if(!wrap) return;
    wrap.innerHTML = '<div class="tf-empty">Chargement…</div>';
    try{
      const eps = await window.iaListMp4Files(identifier, 80);
      const thumb = iaThumb(identifier);
      const items = (eps||[]).map((e, idx)=>({
        title: (label ? `${label} — ${e.title || e.name}` : (e.title || e.name || `Épisode ${idx+1}`)),
        identifier,
        thumbnail: thumb,
        mp4: e.url
      }));
      renderItemsInto(carouselId, items);
    }catch(e){
      wrap.innerHTML = `<div class="tf-empty">Erreur animés: ${esc(e.message||e)}</div>`;
    }
  }

  async function loadBySearch(carouselId, q){
    const wrap = document.getElementById(carouselId);
    if(!wrap) return;
    wrap.innerHTML = '<div class="tf-empty">Recherche…</div>';
    try{
      const items = await window.iaSearchItems(q, 24);
      renderItemsInto(carouselId, items || []);
    }catch(e){
      wrap.innerHTML = `<div class="tf-empty">Erreur animés: ${esc(e.message||e)}</div>`;
    }
  }

  window.tfInitAnime = function(force){
    // Re-try if the first init happened while the tab was hidden or if a previous attempt produced no content.
    const hasContent = !!document.querySelector('#tf-anime-block .tf-card, #tf-anime-block .tf-empty');
    if(inited && hasContent && !force) return;
    inited=true;

    // Known identifiers (stable)
    // Use per-file listing when the IA item is a bundle of many episodes.
    loadByItemFiles('tf-anime-loneranger', 'LoneRangerCartoon1966CrackOfDoom', 'Lone Ranger (1966)');
    // Superman: render playlist as episode rail (avoid single tile + YouTube error 153)
    if(typeof window.tfLoadYouTubePlaylistEpisodesInto === 'function'){
      window.tfLoadYouTubePlaylistEpisodesInto('tf-anime-superman', 'PLY0ZiQRbASD0wo9ISF2yJ3U7D6khG8I8K', 'Superman (Fleischer, 1941–1943)');
    }else{
      renderYouTubePlaylistsInto('tf-anime-superman', [
        { title: 'Superman (Fleischer, 1941–1943) — playlist', listId: 'PLY0ZiQRbASD0wo9ISF2yJ3U7D6khG8I8K', thumb: 'https://i.ytimg.com/vi/nJgKykPNLWI/hqdefault.jpg' }
      ]);
    }

    // The Black Bat: playlist rail
    if(typeof window.tfLoadYouTubePlaylistEpisodesInto === 'function'){
      window.tfLoadYouTubePlaylistEpisodesInto('tf-anime-blackbat', 'PLROATyFwoQdeLIm6iYcu3WhFQc3jSgnWS', 'The Black Bat — playlist');
    }else{
      renderYouTubePlaylistsInto('tf-anime-blackbat', [
        { title: 'The Black Bat — playlist', listId: 'PLROATyFwoQdeLIm6iYcu3WhFQc3jSgnWS', thumb: 'https://i.ytimg.com/vi/0rePuQ_ER0Y/hqdefault.jpg' }
      ]);
    }
    loadByItemFiles('tf-anime-popeye', 'popeye-pubdomain', 'Popeye');
    loadByItemFiles('tf-anime-felix', 'FelixTheCat-FelineFollies1919', 'Felix le Chat');


    // Curated YouTube playlists (non-Archive)
    renderYouTubePlaylistsInto('tf-anime-snafu', [
      { title: 'Private Snafu — playlist 1', listId: 'PL_ChVVP9EtuS5rDlqK1-Jhw8Y0cjRytbV', thumb: 'https://i.ytimg.com/vi/aBp_0TsIHvU/hqdefault.jpg' },
      { title: 'Private Snafu — playlist 2', listId: 'PL-PEP3oDTy0boKsCSaMMAa7ZLQSs5mFF1', thumb: 'https://i.ytimg.com/vi/dOWoT5gwHkY/hqdefault.jpg' },
      { title: 'Private Snafu — playlist 3', listId: 'PL_ChVVP9EtuT9bQfp4qH-6tfwyasFx-nA', thumb: 'https://i.ytimg.com/vi/QJf01lZvT_w/hqdefault.jpg' }
    ]);

    // Best-effort search rails
    loadBySearch('tf-anime-betty', 'Betty Boop public domain');
    loadBySearch('tf-anime-bugs', 'Bugs Bunny A Tale of Two Kitties The Wabbit Who Came to Supper public domain');
    loadBySearch('tf-anime-daffy', 'Daffy Duck and the Dinosaur 1939 public domain');
    loadBySearch('tf-anime-porky', 'Porky Pig black and white 1930 public domain');
    loadBySearch('tf-anime-casper', 'Casper The Friendly Ghost 1945 public domain');
    loadBySearch('tf-anime-gabby', 'Gabby Gulliver 1939 public domain');
    loadBySearch('tf-anime-gertie', 'Gertie the Dinosaur 1914 public domain');
  };
})();



// =========================================================
// ORYON TV — Trailers jeux vidéo (YouTube search embeds)
//  - avoids Helix clips confusion
//  - best-effort: some videos can be blocked from embed
// =========================================================
;(function(){
  const BAD = new Set(['Just Chatting','Music','ASMR','IRL','Talk Shows & Podcasts','Slots','Art','Sports','Travel & Outdoors']);
  function esc(s){ return String(s||'').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function ytSearchEmbed(query){
    // listType=search autoplay allowed when muted; keep controls minimal
    const q = encodeURIComponent(query);
    return `https://www.youtube-nocookie.com/embed?listType=search&list=${q}&autoplay=1&mute=1&controls=0&modestbranding=1&playsinline=1&rel=0`;
  }

  window.tfRenderTrailerCarousel = async function(){
    const wrap = document.getElementById('tf-trailer-carousel');
    if(!wrap) return;
    wrap.innerHTML = '<div class="tf-empty">Chargement des trailers…</div>';

    try{
      const cats = Array.isArray(window.tfAllCategories) ? window.tfAllCategories : [];
      const picks = cats.filter(c=>c && c.id && c.name && !BAD.has(String(c.name))).slice(0,6);
      if(!picks.length){ wrap.innerHTML='<div class="tf-empty">Aucun jeu trouvé.</div>'; return; }

      wrap.innerHTML='';
      for (const g of picks){
        const query = `${g.name} official trailer`;
        const src = ytSearchEmbed(query);

        const card = document.createElement('div');
        card.className='tf-card';
        card.style.minWidth='360px';
        card.innerHTML = `
          <div class="tf-thumb" style="position:relative;overflow:hidden;border-radius:14px;height:202px;background:#000;">
            <iframe
              title="${esc(g.name)} trailer"
              src="${src}"
              allow="autoplay; encrypted-media; picture-in-picture"
              referrerpolicy="strict-origin-when-cross-origin"
              style="border:0;width:100%;height:100%;"></iframe>
            <div style="position:absolute;left:10px;top:10px;background:rgba(255,0,153,.85);padding:.2rem .5rem;border-radius:999px;font-weight:900;font-size:11px;letter-spacing:.08em;">TRAILER</div>
          </div>
          <div class="tf-card-meta">
            <div class="tf-card-title">${esc(g.name)}</div>
            <div class="tf-card-sub" style="opacity:.7;font-weight:700;">YouTube (recherche)</div>
          </div>`;

        wrap.appendChild(card);
      }
    }catch(e){
      wrap.innerHTML = `<div class="tf-empty">Erreur trailers: ${esc(e.message||e)}</div>`;
    }
  };
})();


// =========================================================
// ORYON TV — LIVE tab: multiple rails by themes (fast, cached, debounced)
// =========================================================
;(function(){
  const THEMES = [
    { label:'Top', type:'top' },

    // Genre-like rails (picked from well-known games on Twitch)
    { label:'RPG', games:['Baldur\'s Gate 3','Elden Ring','Diablo IV','Final Fantasy XIV Online','Path of Exile'] },
    { label:'FPS', games:['VALORANT','Counter-Strike','Apex Legends','Overwatch 2','Call of Duty: Warzone'] },
    { label:'Survie', games:['Rust','DayZ','ARK: Survival Ascended','Valheim','The Forest'] },
    { label:'MOBA', games:['League of Legends','Dota 2','SMITE','Heroes of the Storm'] },
    { label:'MMO', games:['World of Warcraft','Final Fantasy XIV Online','Lost Ark','Black Desert'] },
    { label:'Stratégie', games:['Teamfight Tactics','Age of Empires IV','StarCraft II','Civilization VI'] },
    { label:'Course', games:['iRacing','Forza Horizon 5','Assetto Corsa','Gran Turismo 7'] },
    { label:'Sport', games:['EA Sports FC 26','NBA 2K25','Rocket League','F1 25'] },
    { label:'Horreur', games:['Dead by Daylight','Phasmophobia','Resident Evil 4','The Outlast Trials'] },
    { label:'Indé', games:['Hades','Stardew Valley','Hollow Knight','Balatro'] },

    // Extra rails to feel “as rich as VOD”
    { label:'Action', games:['Grand Theft Auto V','Fortnite','Minecraft','Genshin Impact'] },
    { label:'Rogue‑lite', games:['Hades','Dead Cells','The Binding of Isaac: Rebirth','Balatro'] },
    { label:'JRPG', games:['Persona 5 Royal','Final Fantasy VII Rebirth','Like a Dragon: Infinite Wealth'] },
    { label:'Fight', games:['Street Fighter 6','Tekken 8','Mortal Kombat 1'] },
    { label:'Sandbox', games:['Minecraft','Garry\'s Mod','Terraria','Roblox'] }
  ];
  let rendered=false;
  const cache = new Map();

  async function getJson(url){
    if(cache.has(url)) return cache.get(url);
    const p = fetch(url, { cache:'no-store' })
      .then(r=>r.json().catch(()=>null).then(j=>({ok:r.ok,status:r.status,j})))
      .then(o=>{ if(!o.ok) throw new Error(`HTTP ${o.status}`); return o.j;});
    cache.set(url,p);
    return p;
  }

  function ensureContainer(){
    const liveBlock = document.getElementById('tf-live-carousel')?.closest('.tf-header-block');
    if(!liveBlock) return null;
    let c = document.getElementById('tf-live-rails');
    if(c) return c;
    c = document.createElement('div');
    c.id='tf-live-rails';
    c.style.marginTop='14px';
    liveBlock.appendChild(c);
    return c;
  }

  function renderRail(parent, title, items){
    const block = document.createElement('div');
    block.className='tf-header-block tf-live-rail';
    block.innerHTML = `
      <div class="tf-strip-title"><h4>${title}</h4></div>
      <div class="tf-carousel" aria-label="${title}"></div>`;
    const wrap = block.querySelector('.tf-carousel');
    wrap.innerHTML='';
    if(!items?.length){ wrap.innerHTML='<div class="tf-empty">Aucun live.</div>'; parent.appendChild(block); return; }
    items.slice(0,24).forEach(s=>{
      const card = document.createElement('div');
      card.className='tf-card';
      card.style.minWidth='260px';
      card.innerHTML = `
        <div class="tf-thumb" style="position:relative;overflow:hidden;border-radius:14px;height:146px;background:#000;">
          <img class="tf-card-video" alt="" src="${(s.thumbnail_url||'').replace('{width}','480').replace('{height}','272')}" />
        </div>
        <div class="tf-card-meta">
          <div class="tf-card-title">${String(s.user_name||'').replace(/</g,'&lt;')}</div>
          <div class="tf-card-sub" style="opacity:.7;font-weight:700;">${String(s.title||'').replace(/</g,'&lt;')}</div>
        </div>`;
      card.addEventListener('click', ()=>{
        // open twitch player in a new tab (safe) or existing logic if present
        window.open(`https://www.twitch.tv/${encodeURIComponent(s.user_login||s.user_name||'')}`, '_blank');
      });
      wrap.appendChild(card);
    });
    parent.appendChild(block);
  }

  
  
  window.tfRenderLiveThemes = async function(){
    const container = ensureContainer();
    if(!container) return;

    // Allow a forced re-render when switching back to LIVE.
    try{
      if (window.__tfLiveForceRerender){
        rendered = false;
        window.__tfLiveForceRerender = false;
      }
    }catch(_e){}

    // If we've already rendered and content exists, keep it.
    if(rendered && container.childElementCount) return;
    rendered = true;

    // 1) Fetch Top games directly (do NOT rely on VOD state)
    let topGames = [];
    try{
      const cats = await getJson('/api/categories/top');
      topGames = (cats && Array.isArray(cats.categories)) ? cats.categories.slice(0, 14) : [];
    }catch(_e){
      topGames = [];
    }

    // Fallback: if /api/categories/top failed, reuse any categories already loaded for VOD
    if(!topGames.length){
      try{
        const cached = Array.isArray(window.tfAllCategories) ? window.tfAllCategories : [];
        topGames = cached.slice(0, 14);
      }catch(_e){}
    }

    container.innerHTML = '';

    // 2) Rail "Top FR < 500" (diverse games, FR only)
    try{
      const j = await getJson('/api/twitch/streams/top?lang=fr&maxViewers=500&limit=30');
      renderRail(container, 'Top FR (<500 spectateurs)', (j?.items || []));
    }catch(_e){
      renderRail(container, 'Top FR (<500 spectateurs)', []);
    }

    // 3) Multiple rails by game (FR only, <500 viewers)
    //    If a rail is empty, we simply skip it (keeps UX clean).
    for(const g of topGames){
      const gid = String(g.id||'');
      const gname = String(g.name||'').trim();
      if(!gid || !gname) continue;
      try{
        const s = await getJson(`/api/twitch/streams/by-game?game_id=${encodeURIComponent(gid)}&limit=24&lang=fr&maxViewers=500`);
        const items = (s?.items || []);
        if(items.length){
          renderRail(container, gname, items);
        }
      }catch(_e){
        // skip
      }
    }

    // Fallback if nothing rendered besides Top
    if(!container.querySelector('.tf-live-rail:nth-of-type(2)')){
      const empty = document.createElement('div');
      empty.className='tf-empty';
      empty.textContent = "Aucun live FR (<500 viewers) trouvé pour le moment.";
      container.appendChild(empty);
    }
  };


})();
