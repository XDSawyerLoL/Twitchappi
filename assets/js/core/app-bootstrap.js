    const __urlParams = new URLSearchParams(window.location.search);
    // IMPORTANT: this app is often embedded on justplayer.fr in an iframe,
    // while the API is hosted on Render (onrender.com). We therefore support
    // passing the API base via a query param: ?api=https://your-render-host
    const __apiParam = String(__urlParams.get('api') || '').trim().replace(/\/+$/,'');
    const API_BASE = __apiParam || window.location.origin;
    const API_ORIGIN = (()=>{ try{ return new URL(API_BASE, window.location.href).origin; }catch(_){ return window.location.origin; }})();
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

    // =========================================================
    // TWITFLIX BIG PICTURE MODE (web "console" UX)
    // =========================================================
    let tfBigPictureEnabled = false;
    let __tfGamepadLoopInited = false;

    // Big Picture must affect *only* the TwitFlix overlay (not the underlying StreamerHub UI).
    function tfIsBigPicture(){
      const modal = document.getElementById('twitflix-modal');
      return !!(modal && modal.classList.contains('tf-big-picture'));
    }

    function tfSetBigPicture(enabled){
      tfBigPictureEnabled = !!enabled;

      // Big Picture implies TwitFlix is the primary "second screen" view.
      // If the user toggles it while the modal is closed, open TwitFlix first.
      if(tfBigPictureEnabled && !tfModalOpen){
        try{ (typeof openTwitFlix === 'function') && openTwitFlix(); }catch(_){}
      }

      const modal = document.getElementById('twitflix-modal');
      if(modal) modal.classList.toggle('tf-big-picture', tfBigPictureEnabled);

      // IMPORTANT: Big Picture must not change the underlying StreamerHub page state.
      // Do NOT touch <body> / <html> overflow here. The TwitFlix overlay already captures input.
      try{ localStorage.setItem('tf_big_picture', tfBigPictureEnabled ? '1' : '0'); }catch(_){ }

      const btn = document.getElementById('tf-btn-bigpic');
      if(btn){
        btn.classList.toggle('active', tfBigPictureEnabled);
        btn.innerHTML = tfBigPictureEnabled ? '🎮 BIG PICTURE: ON' : '🎮 BIG PICTURE';
      }

      // True fullscreen (best effort; browsers may block until user gesture)
      if(tfBigPictureEnabled){
        if(!document.fullscreenElement){
          // Prefer fullscreen on the TwitFlix overlay element.
          (modal?.requestFullscreen || document.documentElement.requestFullscreen)?.call(modal || document.documentElement)?.catch(()=>{});
        }
        // focus search for instant "Steam-like" typing
        setTimeout(()=>{ try{ document.getElementById('twitflix-search')?.focus(); }catch(_){ } }, 50);
      }else{
        if(document.fullscreenElement){
          document.exitFullscreen?.().catch(()=>{});
        }
      }
    }

    // Hard fallback for environments where the modal header is re-rendered
    // or event listeners get lost.
    window.tfToggleBigPicture = () => tfSetBigPicture(!tfIsBigPicture());

    function tfInitBigPictureUI(){
      // Restore saved state
      try{ tfBigPictureEnabled = localStorage.getItem('tf_big_picture') === '1'; }catch(_){ tfBigPictureEnabled = false; }
      const modal = document.getElementById('twitflix-modal');
      if(tfBigPictureEnabled && modal) modal.classList.add('tf-big-picture');

      
      // Escape exits Big Picture (without closing TwitFlix)
      if(!window.__tfBigPictureKeyHandler){
        window.__tfBigPictureKeyHandler = true;
        window.addEventListener('keydown', (e)=>{
          if(e.key === 'Escape' && tfIsBigPicture()){
            e.preventDefault();
            tfSetBigPicture(false);
          }
        }, {capture:true});
      }
// Wire button (if present)
      const btn = document.getElementById('tf-btn-bigpic');
      if(btn && !btn.__wired){
        btn.__wired = true;
        btn.addEventListener('click', ()=> tfSetBigPicture(!tfIsBigPicture()));
      }

      // Start gamepad loop once
      if(!__tfGamepadLoopInited){
        __tfGamepadLoopInited = true;
        tfStartGamepadLoop();
      }
    }

    function tfFocusableCards(){
      return Array.from(document.querySelectorAll('#twitflix-modal .tf-card[data-focus="tf-card"]'))
        .filter(el => el && el.offsetParent !== null);
    }

    function tfEnsureCardsFocusable(){
      const cards = document.querySelectorAll('#twitflix-modal .tf-card');
      cards.forEach(el => {
        if(!el.hasAttribute('tabindex')) el.setAttribute('tabindex','0');
        el.setAttribute('data-focus','tf-card');
      });
    }

    function tfMoveFocus(dir){
      const items = tfFocusableCards();
      if(!items.length) return;
      const active = document.activeElement;
      const from = items.includes(active) ? active : items[0];

      const r0 = from.getBoundingClientRect();
      const cx0 = r0.left + r0.width/2;
      const cy0 = r0.top + r0.height/2;

      const isOk = (r) => {
        const cx = r.left + r.width/2;
        const cy = r.top + r.height/2;
        if(dir === 'left') return cx < cx0 - 8;
        if(dir === 'right') return cx > cx0 + 8;
        if(dir === 'up') return cy < cy0 - 8;
        if(dir === 'down') return cy > cy0 + 8;
        return false;
      };

      let best = null;
      let bestScore = Infinity;
      for(const el of items){
        if(el === from) continue;
        const r = el.getBoundingClientRect();
        if(!isOk(r)) continue;
        const cx = r.left + r.width/2;
        const cy = r.top + r.height/2;
        // Directional distance: prioritize moving in the intended axis, then minimize total distance
        const dx = cx - cx0;
        const dy = cy - cy0;
        const primary = (dir === 'left' || dir === 'right') ? Math.abs(dx) : Math.abs(dy);
        const secondary = (dir === 'left' || dir === 'right') ? Math.abs(dy) : Math.abs(dx);
        const score = primary * 1.0 + secondary * 0.35;
        if(score < bestScore){ bestScore = score; best = el; }
      }

      (best || from).focus({preventScroll:false});
      (best || from).scrollIntoView({block:'nearest', inline:'nearest'});
    }

    function tfHookBigPictureKeyboard(){
      if(window.__tfBigPictureKeys) return;
      window.__tfBigPictureKeys = true;
      window.addEventListener('keydown', (e)=>{
        if(!tfIsBigPicture()) return;
        // Only when TwitFlix is open
        const modal = document.getElementById('twitflix-modal');
        if(!modal || !modal.classList.contains('open')) return;

        if(e.key === 'ArrowLeft'){ e.preventDefault(); tfMoveFocus('left'); }
        if(e.key === 'ArrowRight'){ e.preventDefault(); tfMoveFocus('right'); }
        if(e.key === 'ArrowUp'){ e.preventDefault(); tfMoveFocus('up'); }
        if(e.key === 'ArrowDown'){ e.preventDefault(); tfMoveFocus('down'); }
        if(e.key === 'Enter'){
          const el = document.activeElement;
          if(el && el.classList && el.classList.contains('tf-card')){ e.preventDefault(); el.click(); }
        }
        if(e.key === 'Escape'){ /* keep existing close */ }
      });
    }

    function tfStartGamepadLoop(){
      let last = 0;
      const cooldown = 170;
      const pressed = (gp, i) => !!(gp.buttons && gp.buttons[i] && gp.buttons[i].pressed);

      function tick(){
        const now = Date.now();
        const modal = document.getElementById('twitflix-modal');
        const isActive = tfIsBigPicture() && modal && modal.classList.contains('open');
        if(isActive){
          const gps = navigator.getGamepads?.() || [];
          const gp = gps.find(g => g && g.connected);
          if(gp && now - last > cooldown){
            const axX = gp.axes?.[0] || 0;
            const axY = gp.axes?.[1] || 0;

            // D-pad (standard mapping): 14 left, 15 right, 12 up, 13 down
            if(axX > 0.6 || pressed(gp, 15)){ tfMoveFocus('right'); last = now; }
            else if(axX < -0.6 || pressed(gp, 14)){ tfMoveFocus('left'); last = now; }
            else if(axY > 0.6 || pressed(gp, 13)){ tfMoveFocus('down'); last = now; }
            else if(axY < -0.6 || pressed(gp, 12)){ tfMoveFocus('up'); last = now; }

            // A / Cross (0) to activate
            if(pressed(gp, 0)){
              const el = document.activeElement;
              if(el && el.classList && el.classList.contains('tf-card')){ el.click(); last = now; }
            }
          }
        }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }

    // TwitFlix infinite scroll
    let currentCursor = null;
    let isLoadingGames = false;

    // INIT
    window.addEventListener('load', async () => {
      initUnderTabs();
      initPlaySessionHUD();
      initPerformanceWidget();
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

      // Big Picture init (safe even if TwitFlix modal is closed)
      tfInitBigPictureUI();
      tfHookBigPictureKeyboard();
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

          try{ updatePlayGameLabel(); }catch(_e){}
          try{ updatePerformanceWidget(); }catch(_e){}
          try{ if(window.tfModalOpen){ window.tfAutoLoadTips && window.tfAutoLoadTips(); } }catch(_e){}

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
      // Socket must connect to the API host (Render) even when embedded on justplayer.fr.
      // Also, guard against double init (scripts loaded twice / SPA re-init).
      if (window.__hubSocket && window.__hubSocket.connected) {
        socket = window.__hubSocket;
        return;
      }
      if (window.__hubSocketInited) return;
      window.__hubSocketInited = true;

      try{
        socket = io(API_ORIGIN, {
          path: '/socket.io',
          transports: ['websocket'],
          withCredentials: true,
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 500,
          reconnectionDelayMax: 2500,
          timeout: 8000,
        });
        window.__hubSocket = socket;

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
const TF_STEAM_TOKEN_KEY = 'jp_steam_token'; // fallback when 3rd-party cookies blocked
let tfSteamSession = { connected:false, steamid:'', profile:null };

function tfGetSteamId(){
  try{ return (localStorage.getItem(TF_STEAM_STORAGE_KEY) || '').trim(); }catch(_){ return ''; }
}
function tfSetSteamId(v){
  try{ localStorage.setItem(TF_STEAM_STORAGE_KEY, String(v||'').trim()); }catch(_){ }
}

function tfGetSteamToken(){
  try{ return (localStorage.getItem(TF_STEAM_TOKEN_KEY) || '').trim(); }catch(_){ return ''; }
}
function tfSetSteamToken(v){
  try{
    const s = String(v||'').trim();
    if(s) localStorage.setItem(TF_STEAM_TOKEN_KEY, s);
    else localStorage.removeItem(TF_STEAM_TOKEN_KEY);
  }catch(_){ }
}

function tfAuthHeaders(extra){
  const h = Object.assign({}, extra || {});
  const tok = tfGetSteamToken();
  if(tok) h['X-Steam-Token'] = tok;
  return h;
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
    const r = await fetch(`${API_BASE}/api/steam/me`, { credentials:'include', headers: tfAuthHeaders() });
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
      const r = await fetch(`${API_BASE}/api/reco/personalized`, { credentials:'include', headers: tfAuthHeaders() });
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
  // Return to the iframe host page (justplayer.fr) after auth.
  // Backend will validate allowlist via safeReturnTo.
  const return_to = window.location.href;
  const url = `${API_BASE}/auth/steam?return_to=${encodeURIComponent(return_to)}`;
  // popup first (second screen friendly)
  const w = 720, h = 640;
  const left = Math.max(0, (window.screen.width - w) / 2);
  const top = Math.max(0, (window.screen.height - h) / 2);
  const popup = window.open(url, 'steamAuth', `width=${w},height=${h},left=${left},top=${top}`);
  if(!popup){
    // popup blocked -> full redirect
    window.location.href = url;
    return;
  }

  // Fallback watcher: if postMessage is blocked by browser policies,
  // we still refresh Steam state when the popup closes.
  try{
    const started = Date.now();
    const timer = setInterval(()=>{
      if(popup.closed){
        clearInterval(timer);
        tfRefreshSteamSession()
          .then(()=> tfLoadPersonalization())
          .then(()=>{ if(tfModalOpen) renderTwitFlix(); })
          .catch(()=>{});
      }
      // safety stop after 2 minutes
      if(Date.now() - started > 120000){ clearInterval(timer); }
    }, 600);
  }catch(_){ }
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
  // The popup is served by the API host (Render). When embedded in an iframe on justplayer.fr,
  // we must validate against the API origin, not the current page origin.
  if(ev.origin !== API_ORIGIN) return;
  const data = ev?.data;
  if(!data || data.type !== 'steam:connected') return;
  if(data.ok){
    if(data.token){ try{ tfSetSteamToken(String(data.token)); }catch(e){} }
    tfRefreshSteamSession()
      .then(() => tfLoadPersonalization())
      .then(() => { if(tfModalOpen) renderTwitFlix(); })
      .then(() => { try{ window.dispatchEvent(new Event('tf:provider-changed')); }catch(e){} })
      // No full reload: we refresh modules in-place to avoid breaking the embedding page.
      .then(() => { try{ updatePerformanceWidget && updatePerformanceWidget(); }catch(e){} })
      .catch(()=>{});
  }else{
    tfRefreshSteamSession().catch(()=>{});
    alert('Connexion Steam échouée.');
  }
});



// Riot + Epic (OAuth) buttons
let tfRiotSession = { connected:false, userinfo:null };
let tfEpicSession = { connected:false };
let tfUbisoftSession = { connected:false };
let tfXboxSession = { connected:false };

function tfUpdateOauthButtons(){
  const setBtn = (id, connected, labelOn, labelOff, dotClass, iconClass)=>{
    const btn = document.getElementById(id);
    if(!btn) return;
    btn.classList.toggle('tf-oauth-connected', !!connected);
    btn.innerHTML = `
      ${iconClass ? `<i class="${iconClass}" aria-hidden="true"></i>` : `<span class="tf-oauth-dot ${dotClass||''}" aria-hidden="true"></span>`}
      <span class="tf-oauth-label">${connected ? labelOn : labelOff}</span>
      ${connected ? '<span class="tf-steam-check" aria-hidden="true">✓</span>' : ''}
    `;
  };

  // Riot / Epic keep the colored dot (more consistent with your UI)
  setBtn('tf-btn-riot',  !!tfRiotSession.connected,  'Riot connecté',   'Connecter Riot', 'tf-dot-riot', '');
  setBtn('tf-btn-epic',  !!tfEpicSession.connected,  'Epic connecté',   'Connecter Epic', 'tf-dot-epic', '');

  // Ubisoft / Xbox: show brand icons if FontAwesome provides them
  setBtn('tf-btn-ubisoft', !!tfUbisoftSession.connected, 'Ubisoft connecté', 'Connecter Ubisoft', 'tf-dot-ubi', 'fab fa-ubisoft');
  setBtn('tf-btn-xbox',    !!tfXboxSession.connected,    'Xbox connecté',    'Connecter Xbox',    'tf-dot-xbox','fab fa-xbox');
}

async function tfRefreshRiotSession(){
  try{
    const r = await fetch(`${API_BASE}/api/riot/me`, { credentials:'include' });
    const d = await r.json();
    tfRiotSession = (d && d.success && d.connected) ? { connected:true, userinfo:d.userinfo||null } : { connected:false, userinfo:null };
  }catch(_){
    tfRiotSession = { connected:false, userinfo:null };
  }
  tfUpdateOauthButtons();
}

async function tfRefreshEpicSession(){
  try{
    const r = await fetch(`${API_BASE}/api/epic/me`, { credentials:'include' });
    const d = await r.json();
    tfEpicSession = (d && d.success && d.connected) ? { connected:true } : { connected:false };
  }catch(_){
    tfEpicSession = { connected:false };
  }
  tfUpdateOauthButtons();
}


async function tfRefreshUbisoftSession(){
  try{
    const r = await fetch(`${API_BASE}/api/ubisoft/me`, { credentials:'include' });
    const d = await r.json();
    tfUbisoftSession = (d && d.success && d.connected) ? { connected:true } : { connected:false };
  }catch(_){
    tfUbisoftSession = { connected:false };
  }
  tfUpdateOauthButtons();
}

async function tfRefreshXboxSession(){
  try{
    const r = await fetch(`${API_BASE}/api/xbox/me`, { credentials:'include' });
    const d = await r.json();
    tfXboxSession = (d && d.success && d.connected) ? { connected:true } : { connected:false };
  }catch(_){
    tfXboxSession = { connected:false };
  }
  tfUpdateOauthButtons();
}


function tfConnectRiot(){
  const returnTo = document.referrer || window.location.href;
  const url = `${API_BASE}/auth/riot?return_to=${encodeURIComponent(returnTo)}`;
  const w = 720, h = 720;
  const left = Math.max(0, (window.screen.width - w) / 2);
  const top = Math.max(0, (window.screen.height - h) / 2);
  const popup = window.open(url, 'riotAuth', `width=${w},height=${h},left=${left},top=${top}`);
  if(!popup) window.location.href = url;
}
function tfConnectEpic(){
  const returnTo = document.referrer || window.location.href;
  const url = `${API_BASE}/auth/epic?return_to=${encodeURIComponent(returnTo)}`;
  const w = 720, h = 720;
  const left = Math.max(0, (window.screen.width - w) / 2);
  const top = Math.max(0, (window.screen.height - h) / 2);
  const popup = window.open(url, 'epicAuth', `width=${w},height=${h},left=${left},top=${top}`);
  if(!popup) window.location.href = url;
}


function tfConnectUbisoft(){
  const returnTo = document.referrer || window.location.href;
  const url = `${API_BASE}/auth/ubisoft?return_to=${encodeURIComponent(returnTo)}`;
  const w = 720, h = 720;
  const left = Math.max(0, (window.screen.width - w) / 2);
  const top = Math.max(0, (window.screen.height - h) / 2);
  const popup = window.open(url, 'ubisoftAuth', `width=${w},height=${h},left=${left},top=${top}`);
  if(!popup) window.location.href = url;
}
function tfConnectXbox(){
  const returnTo = document.referrer || window.location.href;
  const url = `${API_BASE}/auth/xbox?return_to=${encodeURIComponent(returnTo)}`;
  const w = 720, h = 720;
  const left = Math.max(0, (window.screen.width - w) / 2);
  const top = Math.max(0, (window.screen.height - h) / 2);
  const popup = window.open(url, 'xboxAuth', `width=${w},height=${h},left=${left},top=${top}`);
  if(!popup) window.location.href = url;
}


async function tfPromptRiot(){
  if(tfRiotSession.connected){
    const ok = confirm('Riot est déjà connecté. Voulez-vous déconnecter ?');
    if(!ok) return;
    try{ await fetch(`${API_BASE}/api/riot/unlink`, { method:'POST', credentials:'include' }); }catch(_){}
    tfRiotSession = { connected:false, userinfo:null };
    tfUpdateOauthButtons();
    return;
  }
  tfConnectRiot();
}
async function tfPromptEpic(){
  if(tfEpicSession.connected){
    const ok = confirm('Epic est déjà connecté. Voulez-vous déconnecter ?');
    if(!ok) return;
    try{ await fetch(`${API_BASE}/api/epic/unlink`, { method:'POST', credentials:'include' }); }catch(_){}
    tfEpicSession = { connected:false };
    tfUpdateOauthButtons();
    return;
  }
  tfConnectEpic();
}
window.tfPromptRiot = tfPromptRiot;
window.tfPromptEpic = tfPromptEpic;

async function tfPromptUbisoft(){
  if(tfUbisoftSession.connected){
    alert('Ubisoft est connecté. (Déconnexion: bientôt)');
    return;
  }
  tfConnectUbisoft();
}
async function tfPromptXbox(){
  if(tfXboxSession.connected){
    alert('Xbox est connecté. (Déconnexion: bientôt)');
    return;
  }
  tfConnectXbox();
}
window.tfPromptUbisoft = tfPromptUbisoft;
window.tfPromptXbox = tfPromptXbox;


window.addEventListener('message', (ev) => {
  // Popups are served by the API host (Render). When embedded, origin must match API origin.
  if(ev.origin !== API_ORIGIN) return;
  const data = ev?.data;
  if(!data || !data.type) return;

  const done = () => { try{ window.dispatchEvent(new Event('tf:provider-changed')); }catch(_){} };

  if(data.type === 'riot:connected'){
    if(data.ok) tfRefreshRiotSession().then(done).catch(()=>{});
    else { tfRefreshRiotSession().catch(()=>{}); alert('Connexion Riot échouée.'); }
  }
  if(data.type === 'epic:connected'){
    if(data.ok) tfRefreshEpicSession().then(done).catch(()=>{});
    else { tfRefreshEpicSession().catch(()=>{}); alert('Connexion Epic échouée.'); }
  }
  if(data.type === 'ubisoft:connected'){
    if(data.ok) tfRefreshUbisoftSession().then(done).catch(()=>{});
    else { tfRefreshUbisoftSession().catch(()=>{}); alert('Connexion Ubisoft non configurée.'); }
  }
  if(data.type === 'xbox:connected'){
    if(data.ok) tfRefreshXboxSession().then(done).catch(()=>{});
    else { tfRefreshXboxSession().catch(()=>{}); alert('Connexion Xbox non configurée.'); }
  }
});
    else { tfRefreshRiotSession().catch(()=>{}); alert('Connexion Riot échouée.'); }
  }
  if(data.type === 'epic:connected'){
    if(data.ok) tfRefreshEpicSession().catch(()=>{});
    else { tfRefreshEpicSession().catch(()=>{}); alert('Connexion Epic échouée.'); }
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
    const tfTrailerCache = new Map(); // key -> { id, t }
    const TF_TRAILER_TTL = 24 * 60 * 60 * 1000;

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
      try{
        const q = `${name} game trailer`;
        const r = await fetch(`${API_BASE}/api/youtube/trailer?q=${encodeURIComponent(q)}`);
        if (r.ok){
          const d = await r.json();
          if (d && d.success && d.videoId){
            tfTrailerCache.set(key, { id: d.videoId, t: now });
            return d.videoId;
          }
        }
      }catch(_){}

      tfTrailerCache.set(key, { id: null, t: now });
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

    function tfRenderLiveCarousel(){
      const wrap = document.getElementById('tf-live-carousel');
      if (!wrap) return;

      tfBindHorizontalWheel(wrap);

      // Build from categories already loaded in TwitFlix
      const cats = Array.isArray(tfAllCategories) ? tfAllCategories.slice(0, 18) : [];
      if (!cats.length){
        wrap.innerHTML = '<div class="tf-empty">Chargement des lives…</div>';
        return;
      }

      wrap.innerHTML = '';
      cats.forEach(cat => {
        const gameId = String(cat.id || '');
        const gameName = String(cat.name || 'Jeu');
        const boxArt = tfNormalizeBoxArt(cat.box_art_url || cat.boxArt || '');

        const card = document.createElement('div');
        card.className = 'tf-live-card';
        card.dataset.gameId = gameId;

        card.innerHTML = `
          <div class="tf-live-thumb" style="background-image:url('${boxArt}')">
            <div class="tf-preview"></div>
            <div class="tf-live-badge">LIVE</div>
          </div>
          <div class="tf-live-meta">
            <div class="t1">${gameName}</div>
            <div class="t2">Survole pour preview · Clique pour lancer</div>
          </div>
        `;

        // Preview on hover (uses existing TwitFlix preview logic)
        card.addEventListener('mouseenter', () => tfStartPreview(card));
        card.addEventListener('mouseleave', () => tfStopPreview(card));

        // Click => launch a stream for this category
        card.addEventListener('click', () => {
          try { playTwitFlixCategory(gameId, gameName, boxArt); } catch(_) {}
        });

        wrap.appendChild(card);
      });
    }

    function tfRenderTrailerCarousel(){
      const wrap = document.getElementById('tf-trailer-carousel');
      // Live Tips replaces trailers
      if(wrap){
        wrap.innerHTML = '<div class="tf-empty">Clips de progrès…</div>';
      }
      try{ window.tfLoadProgressClips && window.tfLoadProgressClips(true); }catch(_e){}
      return;
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
            if (!autoId) return;
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
    let tfSearchRails = null; // [{titleHtml, items:[...]}, ...] for Netflix-like reorg

    let tfSearchTimer = null;
    let tfSearchSeq = 0; // prevents stale async search results from overriding newer queries

    let tfObserver = null;

    // Preview cache
    const tfPreviewCache = new Map(); // gameId -> {channel, t}
    const tfPreviewInflight = new Map();
    const TF_PREVIEW_TTL = 10 * 60 * 1000;

    function tfNormalizeBoxArt(url){
      // request higher res to avoid blur, then we downscale in CSS
      const u = String(url || '');
      if (!u) return '';
      // Twitch commonly returns either a template with {width}/{height} or a concrete size like -285x380.
      // Normalize both to a high-res variant to avoid blurry covers.
      let out = u
        .replace('{width}','1000').replace('{height}','1333')
        .replace(/-\d+x\d+(?=\.[a-zA-Z]{2,4}$)/, '-1000x1333');
      // If the url has no template and no -WxH pattern, keep it as-is.
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
      const search = document.getElementById('twitflix-search');

      tfModalOpen = true;
      modal.classList.add('active');

      // Ensure Big Picture button is wired (modal buttons may be created/updated dynamically)
      tfInitBigPictureUI();

      // TwitFlix intro (Netflix-like) — stylized, minimal
try{
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
      tfSearchRails = null;
      if (search) search.value = '';

      // hero default
      tfSetHero({ title: 'TWITFLIX', sub: 'Découvre des jeux, survole pour une preview, clique pour lancer un stream.' });

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
      await tfRefreshRiotSession();
      await tfRefreshEpicSession();
      await tfRefreshUbisoftSession();
      await tfRefreshXboxSession();
      await tfLoadPersonalization();

      tfRenderLiveCarousel();
      tfRenderTrailerCarousel();
      renderTwitFlix();
      // Wire Big Picture button again after render in case the header was re-rendered.
      tfInitBigPictureUI();
    }

    function closeTwitFlix(){
  document.body.classList.remove('modal-open');
  tfModalOpen = false;
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

    function tfMakeSearchRails(q, results){
      const r = Array.isArray(results) ? results : [];
      if (!r.length) return null;

      const rails = [];
      rails.push({ titleHtml: 'Résultats de votre recherche', items: r.slice(0, 28) });

      // Keep ADN row visible even in search mode (second screen feel)
      if (tfPersonalization && Array.isArray(tfPersonalization.categories) && tfPersonalization.categories.length){
        rails.push({ titleHtml: tfPersonalization.title || 'Parce que tu as aimé', items: tfPersonalization.categories.slice(0, 28) });
      }

      // Add a "Top du moment" row but avoid duplicates
      const exclude = new Set(r.map(x => String(x.id)));
      const extra = (Array.isArray(tfAllCategories) ? tfAllCategories : [])
        .filter(c => !exclude.has(String(c.id)))
        .slice(0, 28);

      rails.push({ titleHtml: 'Tendances du moment', items: extra });

      return rails;
    }

    async function tfRunSearch(query){
      const q = String(query || '').trim();
      const host = document.getElementById('twitflix-grid');
      if (!host) return;

      const mySeq = ++tfSearchSeq;

      if (!q){
        tfSearchResults = [];
        tfSearchRails = null;
        renderTwitFlix();
        return;
      }

      // Fast feedback (prevents the feeling that nothing happens)
      try{
        tfSearchResults = [];
        tfSearchRails = null;
        renderTwitFlix();
      }catch(_){ }

      // IA-assisted: if query is a sentence, ask the server to translate it into a curated list.
      const looksComplex = (q.length >= 22) || /\bcomme\b|\bmais\b|\bmoins\b|\bplus\b|\bstress\b|\bcraft\b/i.test(q);
      if(looksComplex){
        try{
          const r0 = await fetch(`${API_BASE}/api/search/intent`, {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            credentials: 'include',
            body: JSON.stringify({ text: q })
          });
          if(r0.ok){
            const d0 = await r0.json();
            if(d0 && d0.success && Array.isArray(d0.categories)){
              if(mySeq !== tfSearchSeq) return; // stale
              tfSearchResults = d0.categories.map(c => ({
                id: c.id,
                name: c.name,
                compat: (typeof c.compat === 'number') ? c.compat : undefined,
                box_art_url: tfNormalizeBoxArt(c.box_art_url || c.boxArtUrl || '')
              }));
              tfSearchRails = tfMakeSearchRails(q, tfSearchResults);
              renderTwitFlix();
              return;
            }
          }
        }catch(_){ }
      }

      // Try server search (best)
      try{
        const r = await fetch(`${API_BASE}/api/categories/search?q=${encodeURIComponent(q)}`, { credentials: 'include' });
        if (r.ok){
          const d = await r.json();
          if (d && d.success && Array.isArray(d.categories)){
            if(mySeq !== tfSearchSeq) return; // stale
            tfSearchResults = d.categories.map(c => ({
              id: c.id,
              name: c.name,
              compat: (typeof c.compat === 'number') ? c.compat : undefined,
              box_art_url: tfNormalizeBoxArt(c.box_art_url || c.boxArtUrl || '')
            }));
            tfSearchRails = tfMakeSearchRails(q, tfSearchResults);
            renderTwitFlix();
            return;
          }
        }
      }catch(_){}

      // Fallback: local filter on already loaded catalogue
      const low = q.toLowerCase();
      const local = tfAllCategories
        .filter(c => (c.name||'').toLowerCase().includes(low))
        .slice(0, 120);
      if(mySeq !== tfSearchSeq) return; // stale
      tfSearchResults = local;
      tfSearchRails = tfMakeSearchRails(q, tfSearchResults);
      renderTwitFlix();

      // Re-wire again after initial render, in case the header was rebuilt.
      tfInitBigPictureUI();
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
        tfSetHero({ title: q, sub: 'Recherche IA-assisted • Réorganisation instantanée' });

        const rails = tfSearchRails || tfMakeSearchRails(q, tfSearchResults);

        if (!tfSearchResults.length || !rails || !rails.length){
          host.innerHTML = `<div class="tf-empty">Aucun résultat pour <span style="color:#00f2ea;font-weight:900;">${escapeHtml(q)}</span>.</div>`;
          if (sentinel) host.appendChild(sentinel);
          return;
        }

        rails.forEach(r => {
          if (!r || !Array.isArray(r.items) || !r.items.length) return;
          host.appendChild(tfBuildRow(r.titleHtml || 'Résultats', r.items));
        });

        if (sentinel) host.appendChild(sentinel);
        return;
      }

      // CATALOG MODE
      host.innerHTML = '';
      tfSetHero({ title: 'TWITFLIX', sub: 'Survole un jeu pour la preview, clique pour lancer un stream.' });

      const list = tfAllCategories.slice(0);
      if (!list.length){
        host.innerHTML = '<div class="tf-empty"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>';
        if (sentinel) host.appendChild(sentinel);
        return;
      }

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

      // Re-wire TwitFlix controls that may be present in the modal header
      // (some builds inject/re-render parts of the modal).
      tfInitBigPictureUI();

      // Big Picture: make cards focusable + preserve console navigation
      tfEnsureCardsFocusable();
      // Ensure the toggle button remains wired if DOM got replaced.
      tfInitBigPictureUI();
      if(tfIsBigPicture()){
        const first = host.querySelector('.tf-card');
        if(first && document.activeElement === document.body){
          first.focus({preventScroll:true});
        }
      }

      if (sentinel) host.appendChild(sentinel);
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
      return row;
    }

    function tfBuildCard(cat){
      const div = document.createElement('div');
      div.className = 'tf-card';
      div.setAttribute('tabindex','0');
      div.setAttribute('data-focus','tf-card');
      div.dataset.gameId = cat.id;
      div.dataset.gameName = cat.name;

      const poster = tfNormalizeBoxArt(cat.box_art_url || '');

      div.innerHTML = `
        <img class="tf-poster" src="${poster}" loading="lazy" alt="">
        ${typeof cat.compat === "number" ? `<div class="tf-compat-badge">${Math.round(cat.compat)}% compat</div>` : ``}
        <div class="tf-preview" aria-hidden="true"></div>
        <div class="tf-overlay">
          <div class="tf-name" title="${escapeHtml(cat.name)}">${escapeHtml(cat.name)}</div>
          <div class="tf-actions-row">
            <span class="tf-pill"><i class="fas fa-play"></i> Lire</span>
            <span class="tf-pill ghost"><i class="fas fa-volume-mute"></i> Preview</span>
          </div>
        </div>
      `;

      // hero update on hover/focus
      div.addEventListener('mouseenter', () => tfSetHero({ title: cat.name, poster }));
      div.addEventListener('focus', () => tfSetHero({ title: cat.name, poster }));

      // click play
      div.onclick = () => playTwitFlixCategory(cat.id, cat.name);

      // Hover preview (Netflix-like delay)
      let t = null;
      div.addEventListener('mouseenter', () => { t = setTimeout(() => tfStartPreview(div), 420); });
      div.addEventListener('mouseleave', () => { if (t) clearTimeout(t); tfStopPreview(div); });

      return div;
    }

    function tfSetHero({ title, sub, poster }){
      const bg = document.getElementById('tf-hero-bg');
      const t = document.getElementById('tf-hero-title');
      const s = document.getElementById('tf-hero-sub');
      if (t) t.textContent = String(title || 'TWITFLIX');
      if (s) s.textContent = String(sub || '');
      if (bg){
        if (poster) { bg.src = poster; bg.style.opacity = (String(title||'').toUpperCase()==='TWITFLIX' ? '.55' : '.78'); }
        else { bg.removeAttribute('src'); bg.style.opacity = '.15'; }
      }
    }

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

        const resGames = await fetch(`${API_BASE}/api/stats/top_games`);
        const dGames = await resGames.json();
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
      btn.innerHTML = '<span class="best-time-spinner"></span> Rapport en cours...';

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
        btn.innerHTML = '📄 Lancer le rapport';
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
(function(){
  const PRICING_URL = "/pricing";
  const DASHBOARD_SEL = '[data-paywall-feature="dashboard_premium"]';

  function normPlan(p){ return String(p || "FREE").trim().toUpperCase(); }
  function isPremium(plan){ plan = normPlan(plan); return plan !== "FREE"; }

  async function fetchJSON(url){
    const r = await fetch(url, { credentials:"include" });
    const j = await r.json().catch(()=>null);
    return { ok: r.ok, json: j };
  }

  async function fetchAccess(){
    // 1) billing
    let plan = "FREE";
    let credits = 0;

    try{
      const b = await fetchJSON("/api/billing/me");
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
      const f = await fetchJSON("/api/fantasy/profile");
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
    return { plan, credits };
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
    // hard cleanup to avoid multiple padlocks layers
    el.querySelectorAll('.paywall-inline-overlay').forEach(n=>n.remove());
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
})();



// ================================
// Second Screen: Play Session HUD
// ================================
let __playSession = { active:false, level:1, xp:0, progressPct:0, game:null, secondsToday:0 };

async function apiPlayGetStatus(){
  try{
    const r = await fetch(`${API_BASE}/api/play/status`, { credentials:'include' });
    if(!r.ok) return null;
    return await r.json().catch(()=>null);
  }catch(_){ return null; }
}
async function apiPlayStart(){
  const r = await fetch(`${API_BASE}/api/play/start`, { method:'POST', credentials:'include' });
  return await r.json().catch(()=>null);
}
async function apiPlayStop(){
  const r = await fetch(`${API_BASE}/api/play/stop`, { method:'POST', credentials:'include' });
  return await r.json().catch(()=>null);
}
async function apiPlayTick(){
  const r = await fetch(`${API_BASE}/api/play/tick`, { method:'POST', credentials:'include' });
  return await r.json().catch(()=>null);
}

function updatePlayGameLabel(){
  const el = document.getElementById('play-game');
  if(el) el.textContent = currentGameName ? String(currentGameName) : '—';
}

function renderPlayHUD(){
  const hud = document.getElementById('play-hud');
  const btn = document.getElementById('btn-play-session');
  const lbl = document.getElementById('play-session-label');
  if(btn && lbl){
    lbl.textContent = __playSession.active ? 'EN SESSION' : 'JE JOUE';
    btn.classList.toggle('border-[#00f2ea33]', __playSession.active);
    btn.classList.toggle('text-[#00f2ea]', __playSession.active);
  }

  if(!hud) return;
  if(__playSession.active){
    hud.classList.remove('hidden');
  }else{
    hud.classList.add('hidden');
  }
  const meta = document.getElementById('play-hud-meta');
  if(meta){
    const m = __playSession.active ? `Actif • ${Math.round((__playSession.secondsToday||0)/60)} min aujourd’hui` : '—';
    meta.textContent = m;
  }
  const level = document.getElementById('play-level');
  const xp = document.getElementById('play-xp');
  const bar = document.getElementById('play-progress');
  if(level) level.textContent = String(__playSession.level || 1);
  if(xp) xp.textContent = String(Math.round(__playSession.xp || 0));
  if(bar) bar.style.width = `${Math.max(0, Math.min(100, Number(__playSession.progressPct||0)))}%`;
  updatePlayGameLabel();
}

let __playTickTimer = null;

async function initPlaySessionHUD(){
  // Only if logged in; still safe to call
  const st = await apiPlayGetStatus();
  if(st && st.success){
    __playSession = Object.assign(__playSession, st.session || {});
  }
  renderPlayHUD();

  // background ticker
  if(__playTickTimer) clearInterval(__playTickTimer);
  __playTickTimer = setInterval(async ()=>{
    if(!__playSession.active) return;
    if(document.hidden) return;
    const d = await apiPlayTick();
    if(d && d.success){
      __playSession = Object.assign(__playSession, d.session || {});
      renderPlayHUD();
    }
  }, 20000);
}

async function togglePlaySession(){
  // must be authenticated
  try{
    const st0 = await apiPlayGetStatus();
    if(!st0 || !st0.success){
      alert('Connecte-toi pour activer la session jeu.');
      return;
    }
  }catch(_){}
  if(__playSession.active){
    const d = await apiPlayStop();
    if(d && d.success){
      __playSession = Object.assign(__playSession, d.session || {active:false});
      renderPlayHUD();
    }
  }else{
    const d = await apiPlayStart();
    if(d && d.success){
      __playSession = Object.assign(__playSession, d.session || {active:true});
      renderPlayHUD();
    }
  }
}
window.togglePlaySession = togglePlaySession;

// ================================
// Streamer Hub Predictif (LoL) — Riot compare (historical CS@15)
// ================================
let __perfInit = false;
async function initPerformanceWidget(){
  if(__perfInit) return;
  __perfInit = true;

  const btnLink = document.getElementById('riot-me-link');
  const btnBind = document.getElementById('riot-streamer-bind');
  const btnAuth = document.getElementById('riot-auth-btn');

  if(btnAuth){
    btnAuth.addEventListener('click', ()=>{
      const next = '/';
      const url = `${API_BASE}/auth/riot?next=${encodeURIComponent(next)}`;
      const w = 720, h = 720;
      const left = Math.max(0, (window.screen.width - w) / 2);
      const top = Math.max(0, (window.screen.height - h) / 2);
      const popup = window.open(url, 'riotAuth', `width=${w},height=${h},left=${left},top=${top}`);
      if(!popup) window.location.href = url;
    });
  }

  if(btnLink){
    btnLink.addEventListener('click', async ()=>{
      const name = String(document.getElementById('riot-me-name')?.value || '').trim();
      if(!name){ alert('Entre ton Summoner.'); return; }
      const r = await fetch(`${API_BASE}/api/riot/link`, {
        method:'POST',
        credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ region:'euw1', summonerName: name })
      });
      const d = await r.json().catch(()=>null);
      if(d?.success){ alert('Compte LoL lié.'); updatePerformanceWidget(); }
      else alert(d?.error || 'Erreur Riot (link).');
    });
  }

  if(btnBind){
    btnBind.addEventListener('click', async ()=>{
      const name = String(document.getElementById('riot-streamer-name')?.value || '').trim();
      if(!name){ alert('Entre le Summoner du streamer.'); return; }
      const r = await fetch(`${API_BASE}/api/riot/bind-streamer`, {
        method:'POST',
        credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ region:'euw1', twitchLogin: String(currentChannel||'').trim(), summonerName: name })
      });
      const d = await r.json().catch(()=>null);
      if(d?.success){ alert('Streamer associé.'); updatePerformanceWidget(); }
      else alert(d?.error || 'Erreur Riot (bind).');
    });
  }
}

function isLoL(){
  const g = String(currentGameName||'').toLowerCase();
  return g.includes('league of legends') || g === 'lol';
}

async function updatePerformanceWidget(){
  const status = document.getElementById('perf-status');
  const body = document.getElementById('perf-body');
  const actions = document.getElementById('perf-actions');
  if(!status || !body || !actions) return;

  if(!currentChannel || currentChannel === 'twitch'){
    status.textContent = '—';
    body.textContent = 'Sélectionne un live pour analyser.';
    actions.classList.add('hidden');
    return;
  }


// Ensure we have fresh game info from Twitch (fixes LoL detection when currentGameName isn't set yet)
try{
  const peek = await fetch(`${API_BASE}/api/twitch/stream_by_login?login=${encodeURIComponent(String(currentChannel||''))}`, { credentials:'include' });
  const pd = await peek.json().catch(()=>null);
  if(pd?.success && pd?.live && pd?.game_name){
    currentGameName = String(pd.game_name);
    try{ updatePlayGameLabel && updatePlayGameLabel(); }catch(_){}
  }
}catch(_){}

  if(!isLoL()){
    // Second-screen performance: prioritize the platforms the user connected (Steam/Epic/Riot/Ubisoft/Xbox).
    status.textContent = (currentGameName ? 'Jeu détecté' : '—');
    actions.classList.add('hidden'); // Advanced Riot comparison stays LoL-only (see below)

    const safeGet = async (path)=>{
      try{
        const r = await fetch(`${API_BASE}${path}`, { credentials:'include', headers: tfAuthHeaders() });
        return await r.json().catch(()=>null);
      }catch(_){ return null; }
    };

    const [steamMe, epicMe, riotMe, ubiMe, xboxMe, steamRecent] = await Promise.all([
      safeGet('/api/steam/me'),
      safeGet('/api/epic/me'),
      safeGet('/api/riot/me'),
      safeGet('/api/ubisoft/me'),
      safeGet('/api/xbox/me'),
      safeGet('/api/steam/recent')
    ]);

    const steamOn = !!(steamMe && steamMe.success && steamMe.connected);
    const epicOn  = !!(epicMe  && epicMe.success  && epicMe.connected);
    const riotOn  = !!(riotMe  && riotMe.success  && riotMe.connected);
    const ubiOn   = !!(ubiMe   && ubiMe.success   && ubiMe.connected);
    const xboxOn  = !!(xboxMe  && xboxMe.success  && xboxMe.connected);

    // Context game priority:
    // 1) Steam "best" (recent/now/top) if Steam is connected
    // 2) Current Twitch live game (if a live is selected)
    let ctxSource = '';
    let ctxGame = '';

    try{
      if(steamOn && steamRecent?.success){
        const best = steamRecent?.best?.name || steamRecent?.recent?.[0]?.name || '';
        if(best){
          ctxGame = String(best);
          ctxSource = 'Steam';
        }
      }
    }catch(_){}

    if(!ctxGame && currentGameName){
      ctxGame = String(currentGameName);
      ctxSource = 'Live';
    }

    // Small readable badges row
    const badges = [
      steamOn ? 'Steam ✅' : 'Steam —',
      epicOn  ? 'Epic ✅'  : 'Epic —',
      riotOn  ? 'Riot ✅'  : 'Riot —',
      ubiOn   ? 'Ubisoft ✅' : 'Ubisoft —',
      xboxOn  ? 'Xbox ✅' : 'Xbox —'
    ];

    // Steam recent detail (useful even when not watching a live)
    let steamLine = '';
    try{
      const list = Array.isArray(steamRecent?.recent) ? steamRecent.recent : [];
      if(list.length){
        const top = list[0];
        const name = String(top?.name || '').trim();
        const mins = Number(top?.playtime_2weeks || 0);
        const hrs = mins ? Math.round((mins/60)*10)/10 : 0;
        if(name){
          steamLine = hrs ? `Activité Steam récente : <b>${escapeHTML(name)}</b> (~${hrs} h sur 2 semaines).` : `Activité Steam récente : <b>${escapeHTML(name)}</b>.`;
        }
      }
    }catch(_){}

    const ctxLine = ctxGame
      ? `Contexte prioritaire : <b>${escapeHTML(ctxGame)}</b> <span class="text-gray-500">(${escapeHTML(ctxSource)})</span>.`
      : `Contexte : <span class="text-gray-500">branche un compte (Steam/Epic...) pour activer l’analyse</span>.`;

    body.innerHTML = `
      <div class="text-gray-200 font-bold">Analyse de performance</div>
      <div class="mt-1 text-[11px] text-gray-500">${badges.join(' · ')}</div>
      <div class="mt-2 text-[12px] text-gray-300">${ctxLine}</div>
      ${steamLine ? `<div class="mt-2 text-[12px] text-gray-300">${steamLine}</div>` : ''}
      <div class="mt-2 text-[11px] text-gray-500">
        Steam te donne déjà un signal fiable (activité récente). Riot sert aux comparaisons <i>League of Legends</i> quand un live LoL est sélectionné.
        Epic/Ubisoft/Xbox: bouton de connexion prêt, données d’activité à brancher selon les APIs.
      </div>
    `;
    return;
  }

  status.textContent = 'LoL détecté';
  actions.classList.remove('hidden');
  body.innerHTML = '<span class="text-gray-500">Analyse…</span>';

  try{
    const r = await fetch(`${API_BASE}/api/riot/compare?twitchLogin=${encodeURIComponent(String(currentChannel||''))}&region=euw1`, { credentials:'include' });
    const d = await r.json().catch(()=>null);
    if(d?.success){
      body.innerHTML = `
        <div class="text-gray-200 font-bold">${d.message || 'Comparaison prête.'}</div>
        <div class="mt-2 text-[11px] text-gray-500">Basé sur les derniers matchs publics (moyenne CS@15).</div>
      `;
      // prefill streamer summoner if known
      if(d.streamer?.summonerName){
        const in2 = document.getElementById('riot-streamer-name');
        if(in2 && !in2.value) in2.value = d.streamer.summonerName;
      }
      return;
    }
    body.textContent = d?.error || 'Comparaison indisponible. Lie ton compte et associe le streamer.';
  }catch(e){
    body.textContent = 'Erreur chargement Riot.';
  }
}
window.updatePerformanceWidget = updatePerformanceWidget;

// ================================
// Live Tips: "Clips de Progrès" (YouTube short tips)
// ================================
let tfTipsGameName = '';

let __tfTipsCache = { q:'', t:0, clips:[] };

function tfFillTipsGameSelect(options){
  const sel = document.getElementById('tf-tips-game');
  if(!sel) return;

  const saved = localStorage.getItem('tf_tips_game') || '';
  const mkLabel = (o)=>{
    const prefix = o.source === 'now' ? '🎮 ' : (o.source === 'recent' ? '🕒 ' : '⭐ ');
    return prefix + (o.name || '');
  };

  const safeOptions = Array.isArray(options) ? options : [];
  sel.innerHTML = '<option value="">Jeu : Auto</option>' + safeOptions.map(o=>{
    const name = String(o.name||'').trim();
    if(!name) return '';
    const value = encodeURIComponent(name);
    const label = mkLabel(o).replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<option value="${value}">${label}</option>`;
  }).join('');

  // restore selection if present
  if(saved){
    const encoded = encodeURIComponent(saved);
    const has = Array.from(sel.options).some(op => op.value === encoded);
    if(has) sel.value = encoded;
  }

  sel.onchange = ()=>{
    const v = sel.value ? decodeURIComponent(sel.value) : '';
    localStorage.setItem('tf_tips_game', v);
  };
}


async function tfEnsureTipsGameContext(){
  const sel0 = document.getElementById('tf-tips-game');
  const needFill = sel0 && sel0.options && sel0.options.length <= 1;

  // If we already resolved a tips game and the select is filled, reuse it.
  if (tfTipsGameName && !needFill) return tfTipsGameName;

  // Prefer Steam context when Steam is linked (second screen).
  try{
    if (tfSteamSession && tfSteamSession.connected){
      const r = await fetch(`${API_BASE}/api/steam/recent`, { credentials:'include' });
      const d = await r.json().catch(()=>null);

      if(d?.success){
        // Fill the dropdown (Auto + now/recent/top)
        try{ tfFillTipsGameSelect(d.options || d.names || []); }catch(_){}

        const seed = d?.best?.name || d?.names?.[0]?.name || null;
        if (seed){
          tfTipsGameName = String(seed);
          return tfTipsGameName;
        }
      }
    }
  }catch(_){}

  // Fallback to the currently watched live game (if any)
  if(!tfTipsGameName && currentGameName){
    tfTipsGameName = String(currentGameName);
  }

  return tfTipsGameName;
}

function tfRenderProgressClips(clips, qLabel){
  const wrap = document.getElementById('tf-trailer-carousel');
  const sub = document.getElementById('tf-tips-sub');
  if(!wrap) return;

  tfBindHorizontalWheel(wrap);
  wrap.innerHTML = '';

  if(sub){
    sub.textContent = qLabel ? `Recherche: ${qLabel}` : '';
  }

  if(!clips || !clips.length){
    wrap.innerHTML = '<div class="tf-empty">Aucun clip trouvé. Essaye un autre mot-clé.</div>';
    return;
  }

  clips.slice(0, 10).forEach(c=>{
    const vid = c.videoId || c.id;
    const title = c.title || 'Clip';
    const card = document.createElement('div');
    card.className = 'tf-trailer-card';
    card.innerHTML = `
      <iframe
        src="https://www.youtube.com/embed/${encodeURIComponent(vid)}?rel=0&modestbranding=1&playsinline=1&mute=1&origin=${encodeURIComponent(location.origin)}"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        loading="lazy"
        title="${title}" allowfullscreen referrerpolicy="strict-origin-when-cross-origin">
      </iframe>
    `;
    wrap.appendChild(card);
  });
}

async function tfLoadProgressClips(silent){
  const input = document.getElementById('tf-tips-query');
  let extra = String(input?.value || '').trim();

  function normalizeTipsText(s){
    return String(s||'')
      .replace(/\s+/g,' ')
      .trim();
  }

  function stripTrailingPunct(s){
    return String(s||'')
      .replace(/["'“”’]+$/g,'')
      .replace(/[\s\.,;:!?\)\]]+$/g,'')
      .trim();
  }

  function cleanIssueText(s){
    const t = normalizeTipsText(s)
      .replace(/^je\s+suis\s+/i,'')
      .replace(/^j\s*'?\s*ai\s+/i,'')
      .replace(/\b(bloqu[eé]|bloqu[eé]e|bloqu[eé]s|bloqu[eé]es|coinc[eé]|stuck)\b/ig,'')
      .replace(/\b(sur|dans|avec|au|à|a|en|le|la|les|un|une|des|du|de)\b/ig,'')
      .replace(/\s+/g,' ')
      .trim();
    return t;
  }

  function buildTipsQuery(game, issue){
    const g = normalizeTipsText(game);
    const i = cleanIssueText(issue);
    // Force a gaming/help intent to avoid off-topic results.
    const intent = (i && i.length >= 3) ? `${i} astuce guide` : 'guide astuces boss build';
    return normalizeTipsText(`${g} ${intent}`);
  }

  await tfEnsureTipsGameContext();
  let g = String(tfTipsGameName || currentGameName || '').trim();

  // Heuristic: if user explicitly mentions a different game (e.g. "bloqué sur minecraft"),
  // do NOT prepend the previously detected game. This avoids queries like
  // "Albion Online je suis bloqué sur minecraft".
  let forcedGame = '';
  let rest = extra;

  // Detect an explicit game mention inside the text (avoids picking up
  // “sur le 3ème boss de X” as if it were the game name).
  const detectGameFromText = (txt)=>{
    const raw = String(txt||'');
    const low = raw.toLowerCase();

    // 1) Try to match against the user's own game list (dropdown options)
    let best = '';
    try{
      const sel = document.getElementById('tf-tips-game');
      if(sel){
        const opts = Array.from(sel.options || []).map(o=>String(o.textContent||'').trim()).filter(Boolean);
        // Remove the “Auto” label
        const names = opts.filter(n=>!/^jeu\s*:\s*auto$/i.test(n));
        for(const n of names){
          const nl = n.toLowerCase();
          if(nl && low.includes(nl) && nl.length > best.length) best = n;
        }
      }
    }catch(_){ }

    // 2) A few high-frequency titles / typos (French users often type these)
    const manual = [
      ['lies of p', 'Lies of P'],
      ['lie of p',  'Lies of P'],
      ['elden ring','Elden Ring'],
      ['minecraft', 'Minecraft'],
      ['league of legends','League of Legends'],
      ['valorant','VALORANT'],
      ['rocket league','Rocket League']
    ];
    if(!best){
      for(const [k,v] of manual){
        if(low.includes(k)) { best = v; break; }
      }
    }

    if(!best) return { game:'', cleaned: raw };

    // Remove the detected game chunk from the issue text so the query stays clean
    const cleaned = normalizeTipsText(raw.replace(new RegExp(best.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'ig'), ' '));
    return { game: best, cleaned };
  };

  // Pattern A: "<jeu> : <situation>" or "<jeu> - <situation>"
  const mColon = extra.match(/^([^:]{2,40})\s*[:\-–]\s*(.+)$/);
  if(mColon){
    const cand = String(mColon[1]).trim();
    // Only accept if it looks like a title (avoid “je suis bloqué ...”)
    if(cand && cand.length <= 40 && !/\b(bloqu|boss|chapitre|niveau|level|craft|base)\b/i.test(cand)){
      forcedGame = cand;
      rest = String(mColon[2] || '').trim();
    }
  }

  // Pattern B: find a game mention anywhere in the sentence
  if(!forcedGame){
    const dg = detectGameFromText(extra);
    if(dg.game){ forcedGame = dg.game; rest = dg.cleaned; }
  }

  // Pattern C (last resort): "sur <jeu>" but only if the chunk does NOT contain progress words
  if(!forcedGame){
    const mSur = extra.match(/\bsur\s+([^\n\r]+)$/i);
    if(mSur && mSur[1]){
      const cand = stripTrailingPunct(String(mSur[1]).trim().replace(/^["'“”’]/,''));
      if(cand && cand.length <= 40 && !/https?:\/\//i.test(cand) && !/\b(boss|chapitre|niveau|level|acte|phase|craft|base)\b/i.test(cand)){
        forcedGame = cand;
        rest = String(extra).slice(0, mSur.index).trim();
      }
    }
  }

  const sel = document.getElementById('tf-tips-game');
  const chosen = sel && sel.value ? decodeURIComponent(sel.value) : '';
  const game = (forcedGame || chosen || g).trim();
  const finalQ = buildTipsQuery(game, rest);

  if(!finalQ){
    tfRenderProgressClips([], '');
    return;
  }

  const now = Date.now();
  if(__tfTipsCache.q === finalQ && (now - __tfTipsCache.t) < 60_000 && __tfTipsCache.clips?.length){
    tfRenderProgressClips(__tfTipsCache.clips, finalQ);
    return;
  }

  if(!silent){
    const wrap = document.getElementById('tf-trailer-carousel');
    if(wrap) wrap.innerHTML = '<div class="tf-empty">Recherche de clips…</div>';
  }

  try{
    const r = await fetch(`${API_BASE}/api/youtube/tips?q=${encodeURIComponent(finalQ)}`);
    const d = await r.json().catch(()=>null);
    const clips = (d && d.success && Array.isArray(d.items)) ? d.items : [];
    __tfTipsCache = { q: finalQ, t: now, clips };
    tfRenderProgressClips(clips, finalQ);
  }catch(_){
    tfRenderProgressClips([], finalQ);
  }
}
window.tfLoadProgressClips = tfLoadProgressClips;

// Auto-load tips when TwitFlix opens and a game is known
window.tfAutoLoadTips = function(){
  if(!window.tfModalOpen) return;
  tfLoadProgressClips(true);
};


// When a provider changes (Steam/Riot/Epic...), refresh second-screen context.
window.addEventListener('tf:provider-changed', () => {
  try{ __tfTipsCache = { q:'', t:0, clips:[] }; }catch(_){}
  try{ tfTipsGameName = ''; }catch(_){}
  try{ if(window.tfModalOpen) tfLoadProgressClips(true); }catch(_){}
  try{ if(typeof updatePerformanceWidget === 'function') updatePerformanceWidget(); }catch(_){}
});
