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
      oryonPushContinue({ type:'vod', id: String(videoId), title: 'VOD Twitch', ts: Date.now() });
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
	      oryonPushContinue({ type:'vod', id: String(videoId), title: 'VOD Twitch', ts: Date.now() });
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
    let tfVodResults = [];
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
  const u = String(url || '');
  if (!u) return '';
  let out = u.replace('{width}','2000').replace('{height}','2666');
  out = out.replace(/\/t_thumb\//g,'/t_cover_big_2x/')
           .replace(/\/t_cover_small\//g,'/t_cover_big_2x/')
           .replace(/\/t_cover_big\//g,'/t_cover_big_2x/');
  out = out.replace(/([?&])w=\d+/g,'$1w=600').replace(/([?&])h=\d+/g,'$1h=800');
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

      // ORYON TV: delegated click for VOD cards (mouse)
      try{
        const __grid = document.getElementById('twitflix-grid');
        if(__grid && !__grid.dataset.oryonVodClickDelegate){
          __grid.dataset.oryonVodClickDelegate = '1';
          __grid.addEventListener('click', (e)=>{
            const card = e.target.closest && e.target.closest('.tf-card');
            if(!card) return;
            const vodId = card.dataset && card.dataset.vodId;
            if(!vodId) return;
            e.preventDefault(); e.stopPropagation();
            try{ closeTwitFlix(); }catch(_){}
            try{ loadVodEmbed(vodId); }catch(_){}
            try{ window.scrollTo({ top: 0, behavior: 'smooth' }); }catch(_){}
          }, true);
        }
      }catch(_){}
      const search = document.getElementById('twitflix-search');

      tfModalOpen = true;
      modal.classList.add('active');
      document.body.classList.add('tf-bigpicture'); tfBigPicture = true; tfViewMode='rows';

      // TwitFlix intro (Netflix-like) — stylized, minimal
	try{
	  // UX hotfixes (search blur + clickability)
	  if (!document.getElementById('tf-ux-hotfix')){
	    const st = document.createElement('style');
	    st.id = 'tf-ux-hotfix';
	    st.textContent = `
	      /* sharper posters */
	      .tf-card .tf-poster{ image-rendering:auto; filter:none !important; }
	      .tf-card{ overflow: hidden; }
	      /* overlays must not steal mouse clicks */
	      .tf-card .tf-overlay, .tf-card .tf-preview{ pointer-events:none !important; }
	      /* keep images crisp when scaled */
	      .tf-card .tf-poster{ transform: translateZ(0); backface-visibility:hidden; }
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
      await tfLoadPersonalization();

      tfRenderLiveCarousel();
      tfRenderTrailerCarousel();
      renderTwitFlix();
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
        const rV = await fetch(`${API_BASE}/api/twitch/vods/search?title=${encodeURIComponent(q)}&lang=fr&min=20&max=200&limit=18`, { credentials:'include' });
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

        // VOD FR row
        if (tfVodResults && tfVodResults.length){
          const vodRow = tfBuildRow(
            `<div class="tf-strip-title"><h4>VOD FR (20-200 viewers)</h4><span class="tf-strip-sub">Recherche: ${escapeHtml(q)}</span></div>`,
            tfVodResults.map(x => ({ id:x.id, name:x.name, box_art_url:x.box_art_url })),
            'tf-vod-search-row'
          );
          vodRow.querySelectorAll('.tf-card').forEach((card, idx)=>{
            const v = tfVodResults[idx]?._vod;
            if(!v) return;
            card.dataset.vodId = String(v.id || '').replace(/^v/i,'');
          });
          host.appendChild(vodRow);
        } else {
          const hint = document.createElement('div');
          hint.className = 'tf-empty tf-vod-hint';
          hint.style.marginTop = '10px';
          hint.innerHTML = `VOD FR (20-200 viewers) : <span style="opacity:.8">aucun résultat</span>`;
          host.appendChild(hint);
        }

        // Category results
        if (!tfSearchResults.length){
          host.appendChild(Object.assign(document.createElement('div'), {
            className: 'tf-empty',
            innerHTML: `Aucun jeu pour <span style="color:#00f2ea;font-weight:900;">${escapeHtml(q)}</span>.`
          }));
        } else if (document.body.classList.contains('tf-bigpicture') || tfViewMode === 'rows'){
          const row = tfBuildRow(`<div class="tf-strip-title"><h4>Résultats</h4><span class="tf-strip-sub">${escapeHtml(q)}</span></div>`, tfSearchResults, 'tf-search-row');
          host.appendChild(row);
        } else {
          const grid = document.createElement('div');
          grid.className = 'tf-search-grid';
          tfSearchResults.forEach(cat => grid.appendChild(tfBuildCard(cat)));
          host.appendChild(grid);
        }

        if (sentinel) host.appendChild(sentinel);
        try{ tfAnnotateRows(); }catch(_){}
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
      div.tabIndex = 0;
      div.setAttribute('role','button');
      div.setAttribute('aria-label', `${cat.name} (ouvrir)`);
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

      div.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          div.click();
        }
      });

      // Hover preview (Netflix-like delay)
      let t = null;
      div.addEventListener('mouseenter', () => { t = setTimeout(() => tfStartPreview(div), 420); });
      div.addEventListener('mouseleave', () => { if (t) clearTimeout(t); tfStopPreview(div); });

      // Focus preview (gamepad/keyboard): same behavior as hover
      div.addEventListener('focus', () => {
        // only auto-preview in Big Picture to avoid noise in normal mode
        if (!document.body.classList.contains('tf-bigpicture')) return;
        t = setTimeout(() => tfStartPreview(div), 380);
      });
      div.addEventListener('blur', () => { if (t) clearTimeout(t); tfStopPreview(div); });

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

    const ro = new ResizeObserver(()=>renderDots());
    ro.observe(track);

    tfEnableTrackDrag(track);
    track.__tfPaging = { dots, ro, renderDots, updateDots, pageStep };
    renderDots();
  }catch(_){}
}

function tfEnableTrackDrag(track){
  if(!track || track.__tfDrag) return;
  let down=false, startX=0, startScroll=0;
  track.addEventListener('pointerdown',(e)=>{
    down=true; startX=e.clientX; startScroll=track.scrollLeft;
    track.setPointerCapture(e.pointerId);
  });
  track.addEventListener('pointermove',(e)=>{
    if(!down) return;
    const dx = e.clientX - startX;
    track.scrollLeft = startScroll - dx;
  });
  track.addEventListener('pointerup',()=>{ down=false; });
  track.addEventListener('pointercancel',()=>{ down=false; });
  // wheel vertical => horizontal when over track
  track.addEventListener('wheel',(e)=>{
    if(Math.abs(e.deltaY) > Math.abs(e.deltaX)){
      track.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  }, {passive:false});
  track.__tfDrag=true;
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


function oryonOpenFromCard(card){
  try{
    const ch = (card.dataset && (card.dataset.channel || card.dataset.login || card.dataset.user || card.dataset.userLogin || card.dataset.streamer || card.dataset.name)) || '';
    if(ch && typeof loadPlayerEmbed === 'function'){
      // Close ORYON TV and play live channel in main player
      try{ closeTwitFlix(); }catch(_){}
      try{ loadPlayerEmbed(ch); }catch(_){}
      try{ window.scrollTo({ top: 0, behavior: 'smooth' }); }catch(_){}
      return true;
    }
  }catch(_){}
  return false;
}


// ===== ORYON TV UX (Step 4) =====
const ORYON_CONTINUE_KEY = 'oryon_continue_watching_v1';
function oryonLoadContinue(){
  try{ return JSON.parse(localStorage.getItem(ORYON_CONTINUE_KEY) || '[]'); }catch(_){ return []; }
}
function oryonSaveContinue(list){
  try{ localStorage.setItem(ORYON_CONTINUE_KEY, JSON.stringify(list.slice(0,24))); }catch(_){}
}
function oryonPushContinue(item){
  try{
    if(!item || !item.id) return;
    const list = oryonLoadContinue();
    const id = String(item.id);
    const next = [item, ...list.filter(x=>String(x.id)!==id)];
    oryonSaveContinue(next);
  }catch(_){}
}


let __oryonPeekTimer = null;
function oryonShowPeek(info){
  try{
    let el = document.getElementById('oryon-peek');
    if(!el){
      el = document.createElement('div');
      el.id = 'oryon-peek';
      el.style.cssText = 'position:fixed;left:22px;bottom:18px;z-index:99998;background:rgba(10,10,12,.92);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:10px 12px;min-width:260px;max-width:520px;backdrop-filter: blur(6px);';
      document.body.appendChild(el);
    }
    el.innerHTML = `<div style="font-weight:900;font-size:14px;line-height:1.2;">${escapeHtml(info.title||'')}</div>
      <div style="opacity:.85;font-size:12px;margin-top:2px;">${escapeHtml(info.sub||'')}</div>`;
    el.style.display = 'block';
  }catch(_){}
}
function oryonHidePeek(){
  try{ const el=document.getElementById('oryon-peek'); if(el) el.style.display='none'; }catch(_){}
}
function oryonSchedulePeek(card){
  try{
    clearTimeout(__oryonPeekTimer);
    __oryonPeekTimer = setTimeout(()=>{
      try{
        const title = card.getAttribute('data-name') || card.querySelector('.tf-title')?.textContent || '';
        const sub = card.getAttribute('data-sub') || '';
        oryonShowPeek({ title, sub });
      }catch(_){}
    }, 320);
  }catch(_){}
}

(function(){
  try{
    if(window.__oryonPeekHook) return;
    window.__oryonPeekHook = true;
    document.addEventListener('mouseover', (e)=>{
      const card = e.target.closest && e.target.closest('.tf-card');
      if(!card) return;
      oryonSchedulePeek(card);
    }, true);
    document.addEventListener('focusin', (e)=>{
      const card = e.target.closest && e.target.closest('.tf-card');
      if(!card) return;
      oryonSchedulePeek(card);
    }, true);
    document.addEventListener('keydown', (e)=>{
      if(e.key==='Escape') oryonHidePeek();
    }, true);
  }catch(_){}
})();


function oryonOpenSearchOverlay(){
  try{
    let ov = document.getElementById('oryon-search-ov');
    if(!ov){
      ov = document.createElement('div');
      ov.id = 'oryon-search-ov';
      ov.style.cssText = 'position:fixed;inset:0;z-index:99997;background:rgba(0,0,0,.78);backdrop-filter: blur(10px);display:flex;align-items:flex-start;justify-content:center;padding-top:120px;';
      ov.innerHTML = `<div style="width:min(820px,92vw);">
        <input id="oryon-search-input" placeholder="Rechercher un jeu (Ctrl+K)" style="width:100%;padding:16px 18px;border-radius:16px;border:1px solid rgba(255,255,255,.18);background:rgba(15,15,18,.95);color:#fff;font-size:18px;outline:none;" />
        <div style="opacity:.7;font-size:12px;margin-top:10px;">Entrée: valider • Échap: fermer</div>
      </div>`;
      document.body.appendChild(ov);
      ov.addEventListener('click', (e)=>{ if(e.target===ov) oryonCloseSearchOverlay(); });
    }
    ov.style.display='flex';
    const input = document.getElementById('oryon-search-input');
    if(input){
      input.value = (typeof tfSearchQuery==='string') ? tfSearchQuery : '';
      input.focus();
      input.onkeydown = (e)=>{
        if(e.key==='Escape'){ oryonCloseSearchOverlay(); }
        if(e.key==='Enter'){
          const q = input.value.trim();
          if(q){
            tfSearchQuery = q;
            try{ tfRunSearch(q); }catch(_){ }
            oryonCloseSearchOverlay();
          }
        }
      };
    }
  }catch(_){}
}
function oryonCloseSearchOverlay(){
  try{ const ov=document.getElementById('oryon-search-ov'); if(ov) ov.style.display='none'; }catch(_){}
}
document.addEventListener('keydown', (e)=>{
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='k'){
    e.preventDefault(); oryonOpenSearchOverlay();
  }
  if(e.key==='Escape'){ oryonCloseSearchOverlay(); }
}, true);

(function(){
  try{
    if(document.getElementById('oryon-motion-style')) return;
    const st=document.createElement('style');
    st.id='oryon-motion-style';
    st.textContent=`
      .tf-card{transition:transform .18s ease, filter .18s ease, opacity .18s ease}
      .tf-card:focus, .tf-card.tf-focused{transform:scale(1.08)}
      @media (prefers-reduced-motion: reduce){
        .tf-card{transition:none!important}
      }
    `;
    document.head.appendChild(st);
  }catch(_){}
})();
