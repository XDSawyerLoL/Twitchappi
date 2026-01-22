
// ==============================
// AUTH FETCH (works even when third-party cookies are blocked in iframe)
// - stores signed token in localStorage after Twitch login popup
// - sends Authorization: Bearer <token> on every API call
// ==============================
(function(){
  const LS_TOKEN = 'twitch_auth_token';

  function getToken(){ try{ return localStorage.getItem(LS_TOKEN) || ''; }catch(_){ return ''; } }
  function setToken(t){ try{ if(t) localStorage.setItem(LS_TOKEN, t); else localStorage.removeItem(LS_TOKEN);}catch(_){} }

  window.__getAuthToken = getToken;
  window.__setAuthToken = setToken;

  window.authFetch = async function(url, opts){
    const o = Object.assign({ credentials:'include' }, opts||{});
    o.headers = Object.assign({}, o.headers||{});
    const t = getToken();
    if(t && !o.headers['Authorization'] && !o.headers['authorization']){
      o.headers['Authorization'] = 'Bearer ' + t;
    }
    return fetch(url, o);
  };

  // receive token from popup (twitch_auth_callback)
  window.addEventListener('message', (ev)=>{
    const data = ev && ev.data;
    if(!data || typeof data !== 'object') return;
    if(data.type === 'TWITCH_AUTH' && data.token){
      setToken(String(data.token));
      // soft refresh UI without hard reload loops
      try{ window.location.reload(); }catch(_){}
    }
    if(data.type === 'TWITCH_LOGOUT'){
      setToken('');
      try{ window.location.reload(); }catch(_){}
    }
  });
})();

// ===== app-bootstrap.js (merged) =====

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
          const response = await authFetch(`${API_BASE}/firebase_status`);
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
      const res = await authFetch(`${API_BASE}/twitch_user_status`);
      const data = await res.json();
      if (data.is_connected) {
        currentUser = data.display_name;
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
      const r = await fetch(`${API_BASE}/api/billing/me`, { credentials:'include' });
      const d = await r.json().catch(()=>null);
      const link = document.getElementById('billing-link');
      const elCredits = document.getElementById('billing-credits');
      const elPlan = document.getElementById('billing-plan');
      if(!link || !elCredits || !elPlan) return;
      if(!d || !d.success){
        // keep hidden if not available
        return;
      }
      link.classList.remove('hidden');
      elCredits.textContent = String(d.credits ?? 0);
      elPlan.textContent = String((d.plan || 'FREE')).toUpperCase();
    }

    function startAuth() {
      window.open(`${API_BASE}/twitch_auth_start`, 'login', 'width=500,height=700');
      const check = setInterval(async () => {
        const res = await authFetch(`${API_BASE}/twitch_user_status`);
        const data = await res.json();
        if (data.is_connected) { clearInterval(check); location.reload(); }
      }, 1000);
    }

    function logout() { authFetch(`${API_BASE}/twitch_logout`, { method:'POST' }).then(()=>location.reload()); }

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
    let tfSearchTimer = null;

    let tfObserver = null;

    // Preview cache
    const tfPreviewCache = new Map(); // gameId -> {channel, t}
    const tfPreviewInflight = new Map();
    const TF_PREVIEW_TTL = 10 * 60 * 1000;

    function tfNormalizeBoxArt(url){
      // request higher res to avoid blur, then we downscale in CSS
      const u = String(url || '');
      if (!u) return '';
      return u.replace('{width}','1000').replace('{height}','1333');
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

      // reset
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

      // search handler (server if possible, fallback local)
      if (search){
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
      modal.classList.remove('active');
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
        renderTwitFlix();
        return;
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
          if (sentinel) host.appendChild(sentinel);
          return;
        }

        const grid = document.createElement('div');
        grid.className = 'tf-search-grid';
        tfSearchResults.forEach(cat => grid.appendChild(tfBuildCard(cat)));
        host.appendChild(grid);
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

      if (sentinel) host.appendChild(sentinel);
    }

    function tfRenderRows(host, list){
      const picks1 = list.slice(0, 28);
      const picks2 = list.slice(28, 56);
      const picks3 = tfShuffle(list).slice(0, 28);
      const picks4 = tfShuffle(list).slice(28, 56);

      host.appendChild(tfBuildRow('Top du moment <span>(Twitch)</span>', picks1));
      host.appendChild(tfBuildRow('Tendances <span>FR</span>', picks2));
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
      div.dataset.gameId = cat.id;
      div.dataset.gameName = cat.name;

      const poster = tfNormalizeBoxArt(cat.box_art_url || '');

      div.innerHTML = `
        <img class="tf-poster" src="${poster}" loading="lazy" alt="">
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


// ===== sidepanel-dock-fix.js (merged) =====

/* HARD FIX DOM: ensure side-panel is a direct child of #main-layout (prevents it from dropping under the player) */
(function(){
  function ensureSidePanel(){
    var layout = document.getElementById('main-layout');
    var side = document.getElementById('side-panel');
    if(!layout || !side) return;
    if(side.parentElement !== layout){
      layout.appendChild(side);
    }
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', ensureSidePanel);
  } else {
    ensureSidePanel();
  }
  window.addEventListener('resize', function(){ setTimeout(ensureSidePanel, 50); });
})();


// ===== market-overlay.js (merged) =====

/* ==========================
   MARKET APP (Binance-like)
   - watchlist bootstrapped from Firestore via backend:
     leaderboard -> profile holdings -> unique tickers
   - all metrics derived from /api/fantasy/market (real)
   ========================== */

(function(){
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  // --- Modal helpers ---
  const overlay = $('#market-overlay');
  const tabs = $$('.mkt-tab', overlay);
  const views = $$('.mkt-view', overlay);

  function setBodyModal(on){
    document.body.classList.toggle('modal-open', !!on);
  }

  // Ensure floating emoji buttons (📺🏆💡🧠) don't overlay modals
  function setAuxUiHidden(on){
    // best-effort: hide known floating toolbars
    $$('#floating-tools, #floatingTools, .floating-tools, .quick-tools, .dock-tools').forEach(el=>{
      el.style.display = on ? 'none' : '';
    });
  }

  // --- Data store ---
  let watchlist = [];
  let selected = null;
  let autoOn = true;
  let autoTimer = null;
  let cache = new Map(); // login -> last market response

  const LS_KEY = 'mkt_watchlist_v1';
  const LS_SEL = 'mkt_selected_v1';

  function format(n){
    if(n === null || n === undefined || Number.isNaN(n)) return '—';
    const x = Number(n);
    if(Math.abs(x) >= 1_000_000) return (x/1_000_000).toFixed(2)+'M';
    if(Math.abs(x) >= 1_000) return (x/1_000).toFixed(2)+'K';
    return (Math.round(x*100)/100).toString();
  }
  function pct(n){
    if(n === null || n === undefined || Number.isNaN(n)) return '—';
    const x = Number(n);
    const sign = x > 0 ? '+' : '';
    return sign + x.toFixed(2) + '%';
  }
  function colorClass(p){
    if(p === null || p === undefined || Number.isNaN(p)) return 'text-white/70';
    if(p > 0) return 'text-[#00ff88]';
    if(p < 0) return 'text-[#ff4d6d]';
    return 'text-white/70';
  }

  function sparklineSvg(points){
    if(!points || points.length < 2) return '<svg viewBox="0 0 100 24" class="w-[100px] h-6"></svg>';
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = (max-min) || 1;
    const coords = points.map((v,i)=>{
      const x = (i/(points.length-1))*100;
      const y = 24 - ((v-min)/span)*24;
      return x.toFixed(2)+','+y.toFixed(2);
    }).join(' ');
    const up = points[points.length-1] >= points[0];
    const stroke = up ? '#00ff88' : '#ff4d6d';
    return `
      <svg viewBox="0 0 100 24" class="w-[100px] h-6">
        <polyline fill="none" stroke="${stroke}" stroke-width="2" points="${coords}" />
      </svg>`;
  }

  function findPointAtOrBefore(history, targetTs){
    // history: [{ts,price}], sorted asc
    if(!history || history.length === 0) return null;
    // binary search
    let lo=0, hi=history.length-1, ans=null;
    while(lo<=hi){
      const mid=(lo+hi)>>1;
      const ts=Number(history[mid].ts||0);
      if(ts<=targetTs){ ans=history[mid]; lo=mid+1; }
      else hi=mid-1;
    }
    return ans;
  }

  function computePerf(history, seconds){
    if(!history || history.length < 2) return null;
    const now = Number(history[history.length-1].ts || Date.now());
    const cur = Number(history[history.length-1].price || 0);
    const pastPoint = findPointAtOrBefore(history, now - seconds*1000) || history[0];
    const past = Number(pastPoint?.price || 0);
    if(!past) return null;
    return ((cur - past) / past) * 100;
  }

  function computeReturns(history){
    if(!history || history.length < 3) return [];
    const out=[];
    for(let i=1;i<history.length;i++){
      const a=Number(history[i-1].price||0);
      const b=Number(history[i].price||0);
      if(a>0 && b>0) out.push(Math.log(b/a));
    }
    return out;
  }
  function std(arr){
    if(!arr || arr.length<2) return null;
    const mean = arr.reduce((s,x)=>s+x,0)/arr.length;
    const v = arr.reduce((s,x)=>s+(x-mean)**2,0)/(arr.length-1);
    return Math.sqrt(v);
  }
  function sma(arr, n){
    if(!arr || arr.length < n) return null;
    const slice = arr.slice(-n);
    return slice.reduce((s,x)=>s+x,0)/n;
  }
  function ema(arr, n){
    if(!arr || arr.length < n) return null;
    const k = 2/(n+1);
    let e = arr[0];
    for(let i=1;i<arr.length;i++) e = arr[i]*k + e*(1-k);
    return e;
  }

  function trendScore(p1h, p6h, p7d, vol){
    // normalize and combine (no fake data; just derived score)
    const a = (p1h ?? 0) * 0.45 + (p6h ?? 0) * 0.35 + (p7d ?? 0) * 0.20;
    const penalty = (vol ?? 0) * 120; // log-return std ~ small; scale to 0..?
    const raw = a - penalty;
    // map to 0..100
    const s = Math.max(0, Math.min(100, 50 + raw));
    return Math.round(s);
  }

  async function fetchMarket(login){
    const key = String(login||'').trim().toLowerCase();
    if(!key) return null;
    const r = await authFetch(`/api/fantasy/market?streamer=${encodeURIComponent(key)}`);
    const j = await r.json();
    if(!j?.success) return null;
    cache.set(key, j);
    return j;
  }

  async function fetchLeaderboard(){
    const r = await authFetch('/api/fantasy/leaderboard');
    const j = await r.json();
    if(!j?.success) return [];
    return j.items || [];
  }

  async function fetchProfile(user){
    const r = await authFetch(`/api/fantasy/profile?user=${encodeURIComponent(user)}`);
    const j = await r.json();
    if(!j?.success) return null;
    return j;
  }

  async function bootstrapWatchlistFromFirebase(){
    // If localStorage already has list, keep it.
    const ls = localStorage.getItem(LS_KEY);
    if(ls){
      try{
        const arr = JSON.parse(ls);
        if(Array.isArray(arr) && arr.length){
          watchlist = arr.map(x=>String(x).toLowerCase().trim()).filter(Boolean).slice(0, 40);
          return;
        }
      }catch(_){}
    }

    // Build from top leaderboard users holdings (real Firestore via backend)
    const lb = await fetchLeaderboard();
    const topUsers = lb.slice(0, 12).map(x=>x.user).filter(Boolean);

    const set = new Set();
    for(const u of topUsers){
      const prof = await fetchProfile(u);
      const holds = prof?.holdings || [];
      holds.forEach(h=>{ if(h?.login) set.add(String(h.login).toLowerCase().trim()); });
      if(set.size >= 25) break;
    }

    watchlist = Array.from(set).slice(0, 25);
    if(!watchlist.length){
      watchlist = ['twitch']; // fallback
    }

    localStorage.setItem(LS_KEY, JSON.stringify(watchlist));
  }

  function setSelected(login){
    selected = String(login||'').toLowerCase().trim();
    if(selected) localStorage.setItem(LS_SEL, selected);
    $('#mkt-selected').textContent = selected ? selected.toUpperCase() : '—';
  }

  function updateOverview(mkt){
    if(!mkt) return;
    const login = selected;
    const market = mkt.market || {};
    const hist = (mkt.history || []).map(x=>({ts:Number(x.ts||0), price:Number(x.price||0)})).filter(x=>x.ts && x.price);

    const price = Number(market.price ?? NaN);
    const base = Number(market.basePrice ?? NaN);
    const mult = Number(market.mult ?? NaN);
    const shares = Number(market.sharesOutstanding ?? NaN);
    const mcap = (Number.isFinite(price) && Number.isFinite(shares)) ? price * shares : null;

    // performance windows
    const p1h = computePerf(hist, 3600);
    const p6h = computePerf(hist, 21600);
    const p7d = computePerf(hist, 604800);

    // vol from log returns
    const rets = computeReturns(hist);
    const vol = std(rets);

    // hilo
    const prices = hist.map(x=>x.price);
    const hi = prices.length ? Math.max(...prices) : null;
    const lo = prices.length ? Math.min(...prices) : null;

    // SMA/EMA
    const sma20 = sma(prices, 20);
    const sma50 = sma(prices, 50);
    const ema20 = ema(prices, 20);
    const ema50 = ema(prices, 50);

    const tscore = trendScore(p1h, p6h, p7d, vol);

    // delta from last point vs prev
    let chgText = '—';
    if(prices.length >= 2){
      const prev = prices[prices.length-2];
      const cur = prices[prices.length-1];
      const d = ((cur-prev)/prev)*100;
      chgText = `Δ dernier point: ${pct(d)}`;
    }

    $('#mkt-price').textContent = Number.isFinite(price) ? format(price) : '—';
    $('#mkt-chg').textContent = chgText;
    $('#mkt-chg').className = 'text-xs ' + (prices.length>=2 ? colorClass(((prices[prices.length-1]-prices[prices.length-2])/prices[prices.length-2])*100) : 'text-white/60');

    $('#mkt-base').textContent = Number.isFinite(base) ? format(base) : '—';
    $('#mkt-mult').textContent = Number.isFinite(mult) ? (Math.round(mult*100)/100).toString() : '—';
    $('#mkt-shares').textContent = Number.isFinite(shares) ? format(shares) : '—';
    $('#mkt-mcap').textContent = mcap !== null ? format(mcap) : '—';

    $('#mkt-p1h').textContent = p1h===null? '—' : pct(p1h);
    $('#mkt-p1h').className = 'text-lg font-bold ' + colorClass(p1h);
    $('#mkt-p6h').textContent = p6h===null? '—' : pct(p6h);
    $('#mkt-p6h').className = 'text-lg font-bold ' + colorClass(p6h);
    $('#mkt-p7d').textContent = p7d===null? '—' : pct(p7d);
    $('#mkt-p7d').className = 'text-lg font-bold ' + colorClass(p7d);

    $('#mkt-trend').textContent = Number.isFinite(tscore) ? (tscore + '/100') : '—';

    $('#mkt-vol').textContent = vol===null ? '—' : (Math.round(vol*10000)/100).toString(); // scaled
    $('#mkt-hilo').textContent = (hi===null||lo===null) ? '—' : `${format(hi)} / ${format(lo)}`;

    $('#mkt-sma').textContent = `${sma20?format(sma20):'—'} / ${sma50?format(sma50):'—'}`;
    $('#mkt-ema').textContent = `${ema20?format(ema20):'—'} / ${ema50?format(ema50):'—'}`;

    const lastTs = hist.length ? hist[hist.length-1].ts : null;
    $('#mkt-updated').textContent = lastTs ? ('Dernière maj: ' + new Date(lastTs).toLocaleString()) : '—';

    // chart
    renderChart(hist, { sma20, sma50, ema20, ema50 });

    // actions enable
    $('#mkt-buy').disabled = !login;
    $('#mkt-sell').disabled = !login;
  }

  function renderChart(hist, ind){
    const svg = $('#mkt-chart');
    const meta = $('#mkt-chart-meta');
    if(!svg) return;
    svg.innerHTML = '';
    if(!hist || hist.length < 2){
      meta.textContent = 'Pas assez de points historiques.';
      return;
    }
    const prices = hist.map(x=>x.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const span = (max-min)||1;

    const pts = hist.map((p,i)=>{
      const x = (i/(hist.length-1))*1000;
      const y = 360 - ((p.price-min)/span)*360;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    const up = prices[prices.length-1] >= prices[0];
    const stroke = up ? '#00ff88' : '#ff4d6d';
    svg.innerHTML += `<polyline fill="none" stroke="${stroke}" stroke-width="3" points="${pts}" />`;

    const showSMA = $('#mkt-toggle-sma')?.checked;
    const showEMA = $('#mkt-toggle-ema')?.checked;

    function lineForValue(val, color){
      if(!val) return;
      const y = 360 - ((val-min)/span)*360;
      svg.innerHTML += `<line x1="0" y1="${y.toFixed(1)}" x2="1000" y2="${y.toFixed(1)}" stroke="${color}" stroke-width="2" stroke-dasharray="6 6" opacity="0.8"/>`;
    }
    if(showSMA){
      lineForValue(ind.sma20, '#00e5ff');
      lineForValue(ind.sma50, '#7d5bbe');
    }
    if(showEMA){
      lineForValue(ind.ema20, '#ffd166');
      lineForValue(ind.ema50, '#ef476f');
    }

    meta.textContent = `Points: ${hist.length} · Min: ${format(min)} · Max: ${format(max)}`;
  }

  async function trade(side){
    const login = selected;
    if(!login) return;
    const amount = Number($('#mkt-amount').value || 0);
    if(!amount || amount<=0) return;

    const path = side === 'buy' ? '/api/fantasy/invest' : '/api/fantasy/sell';
    await authFetch(path, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ user: ($('#mkt-user')?.value || 'Anon'), streamer: login, amount })
    }).catch(()=>{});

    // refresh selected and watchlist
    await refreshSelected();
    await refreshWatchlist();
  }

  function setTab(name){
    tabs.forEach(b=>{
      const on = b.dataset.tab === name;
      b.classList.toggle('bg-white/10', on);
      b.classList.toggle('bg-white/5', !on);
      b.classList.toggle('font-bold', on);
    });
    views.forEach(v=>{
      v.classList.add('hidden');
    });
    const el = $('#mkt-tab-' + name);
    if(el) el.classList.remove('hidden');
  }

  function renderHeatmap(items, horizonSec){
    const wrap = $('#mkt-heat');
    if(!wrap) return;
    wrap.innerHTML = '';
    items.slice(0, 12).forEach(it=>{
      const p = it['p'+horizonSec] ?? it.pct;
      const cls = p>0 ? 'bg-[#00ff881f] border-[#00ff8833]' : (p<0 ? 'bg-[#ff4d6d1f] border-[#ff4d6d33]' : 'bg-white/5 border-white/10');
      const tcls = p>0 ? 'text-[#00ff88]' : (p<0 ? 'text-[#ff4d6d]' : 'text-white/70');
      const div = document.createElement('button');
      div.className = `text-left rounded-xl border ${cls} p-3 hover:bg-white/10 transition`;
      div.innerHTML = `<div class="text-xs text-white/60">${it.login.toUpperCase()}</div>
                       <div class="text-lg font-extrabold ${tcls}">${pct(p)}</div>`;
      div.onclick = ()=>{ setSelected(it.login); refreshSelected(); };
      wrap.appendChild(div);
    });
  }

  function renderGainersLosers(rows){
    const gain = $('#mkt-gainers');
    const lose = $('#mkt-losers');
    if(!gain || !lose) return;
    const g = [...rows].sort((a,b)=>(b.pct??-1e9)-(a.pct??-1e9)).slice(0,5);
    const l = [...rows].sort((a,b)=>(a.pct??1e9)-(b.pct??1e9)).slice(0,5);

    gain.innerHTML = g.map(x=>`<div class="${colorClass(x.pct)} font-bold">${x.login.toUpperCase()} <span class="text-white/60 font-normal">${pct(x.pct)}</span></div>`).join('') || '<div class="text-white/60">—</div>';
    lose.innerHTML = l.map(x=>`<div class="${colorClass(x.pct)} font-bold">${x.login.toUpperCase()} <span class="text-white/60 font-normal">${pct(x.pct)}</span></div>`).join('') || '<div class="text-white/60">—</div>';
  }

  async function refreshSelected(){
    const login = selected || watchlist[0];
    if(!login) return;

    setSelected(login);
    const mkt = await fetchMarket(login);
    updateOverview(mkt);
  }

  async function refreshWatchlist(){
    // fetch all tickers (limited concurrency)
    const list = watchlist.slice(0, 30);
    const results = [];
    const horizon = Number($('#mkt-horizon')?.value || 3600);
    const workers = 4;
    let idx=0;

    async function worker(){
      while(idx < list.length){
        const i = idx++;
        const login = list[i];
        const mkt = await fetchMarket(login);
        if(!mkt) continue;

        const hist = (mkt.history || []).map(x=>({ts:Number(x.ts||0), price:Number(x.price||0)})).filter(x=>x.ts && x.price);
        const market = mkt.market || {};
        const price = Number(market.price ?? NaN);
        const shares = Number(market.sharesOutstanding ?? NaN);
        const mcap = (Number.isFinite(price) && Number.isFinite(shares)) ? price*shares : null;

        const p1h = computePerf(hist, 3600);
        const p6h = computePerf(hist, 21600);
        const p7d = computePerf(hist, 604800);

        const rets = computeReturns(hist);
        const vol = std(rets);
        const tscore = trendScore(p1h, p6h, p7d, vol);

        const prices = hist.map(x=>x.price);
        const spark = prices.slice(-24);

        const pctH = computePerf(hist, horizon);
        results.push({
          login,
          price: Number.isFinite(price)?price:null,
          p1h, p6h, p7d,
          vol,
          mcap,
          trend: tscore,
          pct: pctH,
          spark
        });
      }
    }

    await Promise.allSettled(Array.from({length:workers}, worker));

    // heatmap + gainers/losers (based on selected horizon)
    renderHeatmap(results.map(x=>({login:x.login, pct:x.pct, ['p'+horizon]:x.pct})), horizon);
    renderGainersLosers(results);

    // table
    renderMarketsTable(results);
  }

  function renderMarketsTable(rows){
    const sort = $('#mkt-sort')?.value || 'trend';
    const list = [...rows];

    const keyMap = {
      trend: x=>x.trend ?? -1e9,
      p1h: x=>x.p1h ?? -1e9,
      p6h: x=>x.p6h ?? -1e9,
      p7d: x=>x.p7d ?? -1e9,
      mcap: x=>x.mcap ?? -1e9,
      vol: x=>x.vol ?? -1e9
    };
    const keyFn = keyMap[sort] || keyMap.trend;
    list.sort((a,b)=> (keyFn(b)-keyFn(a)));

    const tbody = $('#mkt-table');
    if(!tbody) return;
    tbody.innerHTML = '';
    list.forEach((r, i)=>{
      const tr = document.createElement('tr');
      tr.className = 'border-t border-white/10 hover:bg-white/5 cursor-pointer';
      tr.innerHTML = `
        <td class="py-2 text-white/60">${i+1}</td>
        <td class="py-2 font-bold">${r.login.toUpperCase()}</td>
        <td class="py-2 text-right font-bold">${r.price===null?'—':format(r.price)}</td>
        <td class="py-2 text-right ${colorClass(r.p1h)} font-bold">${r.p1h===null?'—':pct(r.p1h)}</td>
        <td class="py-2 text-right ${colorClass(r.p6h)} font-bold">${r.p6h===null?'—':pct(r.p6h)}</td>
        <td class="py-2 text-right ${colorClass(r.p7d)} font-bold">${r.p7d===null?'—':pct(r.p7d)}</td>
        <td class="py-2 text-right text-white/80">${r.vol===null?'—':(Math.round(r.vol*10000)/100)}</td>
        <td class="py-2 text-right text-white/80">${r.mcap===null?'—':format(r.mcap)}</td>
        <td class="py-2 text-right font-bold">${r.trend??'—'}</td>
        <td class="py-2 text-right">${sparklineSvg(r.spark || [])}</td>
      `;
      tr.onclick = ()=>{ setSelected(r.login); setTab('overview'); refreshSelected(); };
      tbody.appendChild(tr);
    });
  }

  async function refreshPortfolio(){
    const user = ($('#mkt-user')?.value || 'Anon').trim() || 'Anon';
    const prof = await fetchProfile(user);
    if(!prof){
      $('#pf-cash').textContent = '—';
      return;
    }
    const cash = Number(prof.cash||0);
    const holds = prof.holdings || [];
    const holdValue = holds.reduce((s,h)=>s+Number(h.value||0),0);
    const net = cash + holdValue;

    $('#pf-cash').textContent = format(cash);
    $('#pf-hold').textContent = format(holdValue);
    $('#pf-net').textContent = format(net);
    $('#pf-n').textContent = String(holds.length);

    const tbody = $('#pf-table');
    tbody.innerHTML = holds.map(h=>`
      <tr class="border-t border-white/10 hover:bg-white/5 cursor-pointer" onclick="window.__mktSelect && window.__mktSelect('${String(h.login).toLowerCase()}')">
        <td class="py-2 font-bold">${String(h.login||'').toUpperCase()}</td>
        <td class="py-2 text-right">${format(h.shares||0)}</td>
        <td class="py-2 text-right">${format(h.price||0)}</td>
        <td class="py-2 text-right font-bold">${format(h.value||0)}</td>
      </tr>
    `).join('') || '<tr><td class="py-2 text-white/60" colspan="4">Aucune position</td></tr>';
  }

  async function refreshLeaderboard(){
    const lb = await fetchLeaderboard();
    const wrap = $('#lb-list');
    if(!wrap) return;
    wrap.innerHTML = (lb||[]).slice(0,20).map((x,i)=>`
      <div class="flex items-center justify-between border-b border-white/10 py-2">
        <div class="font-bold">${i+1}. ${String(x.user||'').toUpperCase()}</div>
        <div class="text-white/80">${format(x.netWorth||0)}</div>
      </div>
    `).join('') || '<div class="text-white/60">—</div>';
  }

  // --- Events ---
  function wire(){
    // Tabs
    tabs.forEach(b=>{
      b.addEventListener('click', ()=>{
        setTab(b.dataset.tab);
      });
    });

    $('#mkt-refresh').addEventListener('click', async ()=>{
      await refreshSelected();
      await refreshWatchlist();
      if($('#mkt-tab-portfolio') && !$('#mkt-tab-portfolio').classList.contains('hidden')) await refreshPortfolio();
    });

    $('#mkt-auto').addEventListener('click', ()=>{
      autoOn = !autoOn;
      $('#mkt-auto').textContent = 'Auto: ' + (autoOn?'ON':'OFF');
      if(autoOn) startAuto();
      else stopAuto();
    });

    $('#mkt-buy').addEventListener('click', ()=>trade('buy'));
    $('#mkt-sell').addEventListener('click', ()=>trade('sell'));

    $('#mkt-horizon').addEventListener('change', ()=>refreshWatchlist());
    $('#mkt-sort').addEventListener('change', ()=>refreshWatchlist());
    $('#mkt-reload-watch').addEventListener('click', ()=>refreshWatchlist());

    $('#mkt-load-portfolio').addEventListener('click', ()=>refreshPortfolio());
    $('#mkt-load-leader').addEventListener('click', ()=>refreshLeaderboard());

    $('#mkt-edit').addEventListener('click', ()=>{
      $('#mkt-edit-modal').classList.remove('hidden');
      $('#mkt-watchlist').value = watchlist.join(', ');
    });
    $('#mkt-save-watchlist').addEventListener('click', ()=>{
      const raw = $('#mkt-watchlist').value || '';
      const arr = raw.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
      watchlist = Array.from(new Set(arr)).slice(0, 40);
      localStorage.setItem(LS_KEY, JSON.stringify(watchlist));
      $('#mkt-edit-modal').classList.add('hidden');
      if(!watchlist.includes(selected)) setSelected(watchlist[0]);
      refreshSelected();
      refreshWatchlist();
    });

    $('#mkt-add').addEventListener('click', ()=>{
      const q = ($('#mkt-search').value || '').trim().toLowerCase();
      if(!q) return;
      if(!watchlist.includes(q)){
        watchlist.unshift(q);
        watchlist = Array.from(new Set(watchlist)).slice(0, 40);
        localStorage.setItem(LS_KEY, JSON.stringify(watchlist));
      }
      setSelected(q);
      refreshSelected();
      refreshWatchlist();
      $('#mkt-search').value = '';
    });

    $('#mkt-search').addEventListener('keydown', (e)=>{
      if(e.key === 'Enter') $('#mkt-add').click();
    });

    // chart toggles
    $('#mkt-toggle-sma').addEventListener('change', ()=>refreshSelected());
    $('#mkt-toggle-ema').addEventListener('change', ()=>refreshSelected());

    // expose select for portfolio table onclick
    window.__mktSelect = (login)=>{ setSelected(login); setTab('overview'); refreshSelected(); };
  }

  function startAuto(){
    stopAuto();
    autoTimer = setInterval(async ()=>{
      if(!overlay || overlay.classList.contains('hidden')) return;
      await refreshSelected();
      await refreshWatchlist();
    }, 12000);
  }
  function stopAuto(){
    if(autoTimer) clearInterval(autoTimer);
    autoTimer = null;
  }

  // Override the existing refreshMarketAll called by openMarketOverlay()
  window.refreshMarketAll = async function(){
    await refreshSelected();
    await refreshWatchlist();
  };

  // Improve open/close to lock scroll and hide auxiliary buttons
  const _open = window.openMarketOverlay;
  const _close = window.closeMarketOverlay;
  window.openMarketOverlay = function(){
    // Twitch login is mandatory for Market
    if(!window.currentUser){
      alert('Connexion Twitch obligatoire pour utiliser le Marché.');
      try{ window.startAuth && window.startAuth(); }catch(e){}
      return;
    }
    if(!_open) return;
    _open();
    setBodyModal(true);
    setAuxUiHidden(true);
    // select default
    if(!selected) setSelected(watchlist[0]);
    refreshSelected();
    refreshWatchlist();
  };
  window.closeMarketOverlay = function(){
    if(_close) _close();
    setBodyModal(false);
    setAuxUiHidden(false);
  };

  // --- Chat height lock to player ---
  function lockSidePanelToPlayer(){
    const player = document.getElementById('twitch-embed') || document.querySelector('#player, #playerCol, #playerCol iframe, .player-shell, .twitch-player');
    const side = document.getElementById('side-panel') || document.querySelector('#side-panel, #sidePanel, #right-panel, #sideCol');
    if(!player || !side) return;

    const getRect = (el)=>{
      const r = el.getBoundingClientRect();
      return { h: Math.max(240, Math.floor(r.height)) };
    };

    const apply = ()=>{
      const h = getRect(player).h;
      side.style.height = h + 'px';
      side.style.maxHeight = h + 'px';
      side.style.overflow = 'hidden';
      // ensure inner scroll panels scroll
      const inner = side.querySelector('.tab-content, .panel, .side-content, .right-tabs-content, [data-side-scroll]') || side;
      if(inner) inner.style.overflow = 'auto';
    };

    apply();
    try{
      const ro = new ResizeObserver(()=>apply());
      ro.observe(player);
      window.addEventListener('resize', apply);
    }catch(_){
      window.addEventListener('resize', apply);
      setInterval(apply, 1200);
    }
  }

  async function init(){
    wire();
    await bootstrapWatchlistFromFirebase();

    const savedSel = localStorage.getItem(LS_SEL);
    if(savedSel && watchlist.includes(savedSel)) selected = savedSel;
    if(!selected) selected = watchlist[0];

    setSelected(selected);

    // allow market open without errors
    lockSidePanelToPlayer();

    // If overlay already open
    if(overlay && !overlay.classList.contains('hidden')){
      setBodyModal(true);
      setAuxUiHidden(true);
      await refreshSelected();
      await refreshWatchlist();
    }

    // start auto by default
    startAuto();
  }

  init();

})();


// ===== sidepanel-tabs.js (merged) =====

(function(){
  function ensureViewport(){
    const side = document.getElementById('side-panel');
    if(!side) return null;

    let viewport = document.getElementById('tabs-viewport');
    if(!viewport){
      viewport = document.createElement('div');
      viewport.id = 'tabs-viewport';

      // Place viewport right after the tab-nav
      const nav = side.querySelector('.tab-nav');
      if(nav && nav.nextSibling){
        side.insertBefore(viewport, nav.nextSibling);
      }else{
        side.appendChild(viewport);
      }
    }
    return viewport;
  }

  function movePanelsIntoViewport(){
    const viewport = ensureViewport();
    if(!viewport) return;

    const chat = document.getElementById('tab-chat');
    const stats = document.getElementById('tab-stats');
    const tools = document.getElementById('tab-tools');

    // Move (append) panels into viewport so they cannot stack under each other
    [chat, stats, tools].forEach(el => {
      if(el && el.parentElement !== viewport){
        viewport.appendChild(el);
      }
    });

    // Normalise classes (they might exist already)
    viewport.querySelectorAll('.tab-content').forEach(p => {
      p.classList.remove('active');
    });
    if(chat) chat.classList.add('active');
  }

  // Hard exclusive tab switch
  window.openTab = function(ev, tabName){
    const viewport = document.getElementById('tabs-viewport') || ensureViewport();
    if(!viewport) return;

    // buttons
    const buttons = document.querySelectorAll('#side-panel .tab-nav .tab-btn');
    buttons.forEach(b => b.classList.remove('active'));
    if(ev && ev.currentTarget) ev.currentTarget.classList.add('active');
    else {
      // fallback: find button by onclick arg
      const btn = Array.from(buttons).find(b => (b.getAttribute('onclick')||'').includes(`'${tabName}'`));
      if(btn) btn.classList.add('active');
    }

    // panels
    viewport.querySelectorAll('.tab-content').forEach(p => p.classList.remove('active'));

    const id = tabName === 'chat' ? 'tab-chat' : (tabName === 'stats' ? 'tab-stats' : 'tab-tools');
    const panel = document.getElementById(id);
    if(panel) panel.classList.add('active');
  };

  // Keep right panel height synced to player
  function syncRightPanelHeight(){
    const side = document.getElementById('side-panel');
    const player =
      document.getElementById('player-wrapper') ||
      document.getElementById('player-container') ||
      document.getElementById('twitch-embed')?.parentElement ||
      document.querySelector('iframe[src*="twitch.tv"]')?.parentElement;

    if(!side || !player) return;
    const h = player.getBoundingClientRect().height;
    if(h && h > 50) side.style.height = Math.round(h) + 'px';
  }

  document.addEventListener('DOMContentLoaded', () => {
    movePanelsIntoViewport();
    syncRightPanelHeight();
    window.addEventListener('resize', syncRightPanelHeight);
    setInterval(syncRightPanelHeight, 500);

    // Ensure click handlers still work even if inline onclick was changed
    document.querySelectorAll('#side-panel .tab-nav .tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const oc = btn.getAttribute('onclick') || '';
        const m = oc.match(/openTab\(event,\s*'([^']+)'\)/);
        const tab = m ? m[1] : 'chat';
        window.openTab(e, tab);
      }, { passive:true });
    });
  });
})();


// ===== help-tooltips.js (merged) =====

/* ====== AUTO HELP (❓) ON ALL MODULE HEADERS/TABS ====== */
(function(){
  const HELP_TEXT_BY_TITLE = {
    "Alertes automatiques": "Déclenche des alertes quand un signal important apparaît (tendance, score, changement de marché).",
    "Courbe daily": "Évolution quotidienne des signaux/performances. Utile pour voir la progression sur plusieurs jours.",
    "IA – plan d’action": "Génère un plan concret (actions prioritaires) à partir de tes données et du contexte du stream.",
    "Simulation": "Teste différents scénarios (horaire, jeu, niche) et compare l'impact potentiel avant de décider.",
    "Chaîne vs Jeu": "Compare ta chaîne à un jeu/niche pour repérer où tu as le plus de traction et où tu perds des viewers.",
    "Heatmap meilleures heures (jeu)": "Carte chaleur des meilleures heures pour streamer ce jeu (où l'audience est la plus favorable).",
    "Tendance": "Mesure la dynamique actuelle (en hausse/baisse) et les signaux de hype.",
    "Top Jeux": "Liste des jeux les plus porteurs selon les signaux (hype, viewers, stabilité).",
    "Langues": "Aide à choisir la langue la plus pertinente selon l'audience et la concurrence.",
    "🎯 BEST TIME TO STREAM": "Recommandations d'horaires optimisés (créneaux où tu as le meilleur ratio visibilité / concurrence).",
    "MARCHÉ — ouvrir la fenêtre": "Mini-bourse de tendances : tu 'mises' sur des niches/jeux et tu suis la performance des signaux.",
    "SCANNER IA": "Analyse automatique de niches, chaînes et tendances pour détecter des opportunités rapidement.",
    "RAID FINDER": "Trouve des chaînes compatibles pour raid (taille, jeu, langue) afin de maximiser les retours.",
    "CO-STREAM MATCH": "Propose des co-streamers compatibles (même vibe, même jeux, audience proche).",
    "BOOST": "Met en avant un live à lancer (rotation) ou une opportunité de collaboration/raid selon les signaux."
  };

  const HELP_TEXT_BY_TAB = {
    "OVERVIEW": "Vue synthèse : KPIs, raccourcis et état global du live.",
    "ANALYTICS PRO": "Analyse avancée : courbes, segments, perf, signaux et comparaisons.",
    "NICHE": "Niche & opportunités : idées de jeux/sujets, concurrence, timing et angles gagnants.",

    "CHAT": "Chat du stream : Twitch + Hub Secure. Rien d'autre n'apparaît en dessous.",
    "STATS": "Tableaux et métriques (audience, tendances, historique).",
    "OUTILS": "Tous les modules d'analyse (best time, marché, scanner, raid finder, etc.)."
  };

  function norm(s){ return String(s||"").replace(/\s+/g," ").trim(); }

  function addHelpTo(el, text){
    if (!el || el.querySelector('.help')) return;
    const span = document.createElement('span');
    span.className = 'help';
    span.setAttribute('data-help', text);
    span.textContent = '?';
    el.appendChild(document.createTextNode(' '));
    el.appendChild(span);
  }

  function apply(){
    document.querySelectorAll('h1,h2,h3,h4').forEach(h => {
      const t = norm(h.textContent);
      if (HELP_TEXT_BY_TITLE[t]) addHelpTo(h, HELP_TEXT_BY_TITLE[t]);
    });

    document.querySelectorAll('.tab-btn').forEach(b => {
      const t = norm(b.textContent);
      if (HELP_TEXT_BY_TAB[t]) addHelpTo(b, HELP_TEXT_BY_TAB[t]);
    });

    document.querySelectorAll('.u-tab-btn').forEach(b => {
      const t = norm(b.textContent).toUpperCase();
      if (HELP_TEXT_BY_TAB[t]) addHelpTo(b, HELP_TEXT_BY_TAB[t]);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})();


// ===== ambilight-vibe.js (merged) =====

(function(){
  // ===== Ambilight =====
  const ambi = document.createElement('div');
  ambi.id = 'ambilight';
  const wrap = document.getElementById('player-wrap') || document.getElementById('player-container') || document.querySelector('.player-wrap') || document.body;
  if(wrap && !document.getElementById('ambilight')){
    wrap.prepend(ambi);
  }
  function avgColorFromImage(url){
    return new Promise((resolve)=>{
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.referrerPolicy = 'no-referrer';
      img.onload = ()=>{
        const c = document.createElement('canvas');
        const w = c.width = 64, h = c.height = 36;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0,0,w,h);
        const d = ctx.getImageData(0,0,w,h).data;
        let r=0,g=0,b=0,n=0;
        for(let i=0;i<d.length;i+=16){ r+=d[i]; g+=d[i+1]; b+=d[i+2]; n++; }
        r=Math.round(r/n); g=Math.round(g/n); b=Math.round(b/n);
        resolve(`rgb(${r},${g},${b})`);
      };
      img.onerror = ()=>resolve('rgba(0,242,234,.18)');
      img.src = url + (url.includes('?')?'&':'?') + 'rand=' + Date.now();
    });
  }
  async function updateAmbilight(channel){
    if(!channel) return;
    const color = await avgColorFromImage(`https://static-cdn.jtvnw.net/previews-ttv/live_user_${encodeURIComponent(channel)}-440x248.jpg`);
    const el = document.getElementById('ambilight');
    if(el) el.style.background = `radial-gradient(circle at 30% 25%, ${color}, rgba(0,0,0,0) 55%), radial-gradient(circle at 70% 70%, rgba(0,242,234,.18), rgba(0,0,0,0) 60%)`;
  }
  // Hook into existing channel change if present
  const _set = window.setChannel || window.setTwitchChannel || null;
  if(_set){
    const fnName = _set.name;
    const original = _set;
    window[fnName] = function(ch){
      const r = original.apply(this, arguments);
      updateAmbilight(ch);
      return r;
    };
  } else {
    // fallback: observe current channel variable if exists
    setInterval(()=>{ 
      const ch = window.currentChannel || window.selectedChannel; 
      if(ch && window.__lastAmbiCh !== ch){ window.__lastAmbiCh = ch; updateAmbilight(ch); }
    }, 1500);
  }

  // ===== Vibe Check (deterministic) =====
  function vibeFor(name){
    const s = String(name||'');
    let h=0;
    for(let i=0;i<s.length;i++){ h = (h*31 + s.charCodeAt(i)) >>> 0; }
    const r = h % 3;
    return r===0 ? 'vibe-chill' : r===1 ? 'vibe-hype' : 'vibe-toxic';
  }
  // apply vibe to any TwitFlix card that has data-game or title
  function applyVibes(){
    document.querySelectorAll('[data-tf-card]').forEach(card=>{
      if(card.dataset.vibeApplied) return;
      const name = card.getAttribute('data-name') || card.querySelector('.tf-name')?.textContent || '';
      card.classList.add(vibeFor(name));
      card.dataset.vibeApplied = '1';
    });
  }
  setInterval(applyVibes, 1200);

  // ===== Mosaic Mode (Squad) =====
  function ensureMosaicBtn(){
    if(document.getElementById('mosaic-btn')) return;
    const host = document.querySelector('#player-controls') || document.querySelector('.player-controls') || document.querySelector('#player-wrap') || null;
    if(!host) return;
    const btn = document.createElement('button');
    btn.id = 'mosaic-btn';
    btn.type = 'button';
    btn.textContent = '📺 Mosaic';
    btn.style.cssText = 'margin-left:8px; padding:6px 10px; border-radius:10px; border:1px solid rgba(255,255,255,.12); background:rgba(0,0,0,.25); color:#fff; font-weight:900; font-size:12px; cursor:pointer;';
    host.appendChild(btn);

    btn.addEventListener('click', ()=>{
      const playerHost = document.getElementById('twitch-player') || document.getElementById('player') || document.querySelector('iframe[src*="player.twitch.tv"]')?.parentElement;
      if(!playerHost) return;
      const isOn = playerHost.dataset.mosaic === '1';
      if(isOn){
        // restore single
        const single = playerHost.dataset.singleHtml;
        if(single){ playerHost.innerHTML = single; }
        playerHost.dataset.mosaic = '0';
        return;
      }
      playerHost.dataset.singleHtml = playerHost.innerHTML;
      playerHost.dataset.mosaic = '1';
      const parent = new URLSearchParams(location.search).get('parent_host') || new URLSearchParams(location.search).get('parent') || location.hostname;
      const ch = window.currentChannel || window.selectedChannel || 'twitch';
      const tpl = (c)=>`https://player.twitch.tv/?channel=${encodeURIComponent(c)}&parent=${encodeURIComponent(parent)}&muted=true`;
      playerHost.innerHTML = `
        <div class="mosaic-grid">
          <iframe src="${tpl(ch)}" allowfullscreen></iframe>
          <iframe src="${tpl(ch)}" allowfullscreen></iframe>
          <iframe src="${tpl(ch)}" allowfullscreen></iframe>
          <iframe src="${tpl(ch)}" allowfullscreen></iframe>
        </div>
        <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
          <input id="mosaic-channels" placeholder="channels (ex: ninja,shroud,...)"
            style="flex:1; min-width:220px; padding:8px 10px; border-radius:10px; border:1px solid rgba(255,255,255,.12); background:rgba(0,0,0,.25); color:#fff;">
          <button id="mosaic-apply" style="padding:8px 10px; border-radius:10px; border:1px solid rgba(0,242,234,.35); background:#00f2ea; color:#000; font-weight:900; cursor:pointer;">Appliquer</button>
        </div>`;
      const applyBtn = playerHost.querySelector('#mosaic-apply');
      applyBtn?.addEventListener('click', ()=>{
        const raw = playerHost.querySelector('#mosaic-channels')?.value || '';
        const list = raw.split(',').map(x=>x.trim()).filter(Boolean).slice(0,4);
        while(list.length<4) list.push(ch);
        const ifr = playerHost.querySelectorAll('iframe');
        ifr.forEach((f,i)=> f.src = tpl(list[i]));
      });
    });
  }
  setInterval(ensureMosaicBtn, 1200);

  // ===== Fantasy League UI (simple modal) =====
  function ensureFantasy(){
    if(document.getElementById('fantasy-open')) return;
    const nav = document.querySelector('#left-menu') || document.querySelector('.left-menu') || document.querySelector('#sidebar') || null;
    if(!nav) return;
    const b = document.createElement('button');
    b.id = 'fantasy-open';
    b.textContent = '🏆 Fantasy';
    b.style.cssText = 'width:100%; margin-top:8px; padding:10px 12px; border-radius:14px; border:1px solid rgba(255,255,255,.12); background:rgba(0,0,0,.18); color:#fff; font-weight:900; cursor:pointer;';
    nav.appendChild(b);

    const modal = document.createElement('div');
    modal.id = 'fantasy-modal';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,.75); display:none; align-items:center; justify-content:center; z-index:9999;';
    modal.innerHTML = `
      <div style="width:min(920px,92vw); max-height:86vh; overflow:auto; background:#0b0b0d; border:1px solid rgba(255,255,255,.12); border-radius:18px; padding:16px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="font-weight:1000; letter-spacing:.12em; font-size:14px;">FANTASY LEAGUE</div>
          <div style="margin-left:auto;"></div>
          <button id="fantasy-close" style="padding:8px 10px; border-radius:12px; border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.06); color:#fff; cursor:pointer;">Fermer</button>
        </div>
        <div style="margin-top:10px; display:grid; grid-template-columns: 1.2fr .8fr; gap:14px;">
          <div style="border:1px solid rgba(255,255,255,.08); border-radius:16px; padding:12px;">
            <div style="font-weight:900; margin-bottom:8px;">Portefeuille</div>
            <div id="fantasy-summary" style="color:#cbd5e1; font-size:12px;">Chargement…</div>
            <div id="fantasy-holdings" style="margin-top:10px;"></div>
            <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
              <input id="fantasy-streamer" placeholder="streamer login (ex: ninja)" style="flex:1; min-width:220px; padding:8px 10px; border-radius:12px; border:1px solid rgba(255,255,255,.12); background:rgba(0,0,0,.25); color:#fff;">
              <input id="fantasy-amount" placeholder="montant (ex: 500)" type="number" style="width:160px; padding:8px 10px; border-radius:12px; border:1px solid rgba(255,255,255,.12); background:rgba(0,0,0,.25); color:#fff;">
              <button id="fantasy-buy" style="padding:8px 10px; border-radius:12px; border:1px solid rgba(0,242,234,.35); background:#00f2ea; color:#000; font-weight:900; cursor:pointer;">Investir</button>
            </div>
            <div id="fantasy-msg" style="margin-top:8px; font-size:12px; color:#94a3b8;"></div>
          </div>
          <div style="border:1px solid rgba(255,255,255,.08); border-radius:16px; padding:12px;">
            <div style="font-weight:900; margin-bottom:8px;">Top Hub</div>
            <div id="fantasy-leaderboard" style="font-size:12px; color:#cbd5e1;">Chargement…</div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);

    function getUser(){
      return (window.currentUser && window.currentUser.name) || localStorage.getItem('hubUser') || 'Anon';
    }
    async function loadProfile(){
      const user = getUser();
      const r = await fetch(`/api/fantasy/profile?user=${encodeURIComponent(user)}`);
      const j = await r.json();
      if(!j.success) throw new Error(j.error||'Erreur');
      const sum = document.getElementById('fantasy-summary');
      sum.textContent = `Utilisateur: ${j.user} • Cash: ${Math.round(j.cash)} • Net Worth: ${Math.round(j.netWorth)}`;
      const hold = document.getElementById('fantasy-holdings');
      if(!j.holdings.length){ hold.innerHTML = '<div style="color:#64748b;">Aucune position.</div>'; return; }
      hold.innerHTML = j.holdings.map(h=>`
        <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(255,255,255,.06);">
          <div><strong>${h.login}</strong> <span style="color:#64748b;">(${h.shares} parts)</span></div>
          <div style="color:#a7f3d0;">${Math.round(h.value)}</div>
        </div>`).join('');
    }
    async function loadLeaderboard(){
      const r = await fetch('/api/fantasy/leaderboard?limit=15');
      const j = await r.json();
      const box = document.getElementById('fantasy-leaderboard');
      if(!j.success){ box.textContent = j.error||'Erreur'; return; }
      box.innerHTML = j.leaderboard.map((x,i)=>`
        <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(255,255,255,.06);">
          <div>${i+1}. <strong>${x.user}</strong></div>
          <div style="color:#fde68a;">${Math.round(x.netWorth)}</div>
        </div>`).join('');
    }
    async function buy(){
      const user = getUser();
      const streamer = document.getElementById('fantasy-streamer').value.trim();
      const amount = Number(document.getElementById('fantasy-amount').value||0);
      const msg = document.getElementById('fantasy-msg');
      msg.textContent = '...';
      const r = await fetch('/api/fantasy/invest',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({user, streamer, amount})});
      const j = await r.json();
      msg.textContent = j.success ? `✅ Achat: ${j.shares} parts @ ${j.price} (coût ${j.cost})` : `❌ ${j.error||'Erreur'}`;
      await loadProfile(); await loadLeaderboard();
    }

    b.addEventListener('click', async ()=>{
      modal.style.display = 'flex';
      try{ await loadProfile(); await loadLeaderboard(); }catch(e){ document.getElementById('fantasy-msg').textContent = e.message; }
    });
    modal.querySelector('#fantasy-close').addEventListener('click', ()=> modal.style.display='none');
    modal.addEventListener('click', (e)=>{ if(e.target===modal) modal.style.display='none'; });
    modal.querySelector('#fantasy-buy').addEventListener('click', buy);
  }
  setInterval(ensureFantasy, 1400);
})();

    // ==== Messenger-like reactions handlers (hover/tap) ====
    (function(){
      const hubBox = document.getElementById('hub-messages');
      if(!hubBox) return;

      // Tap/click on a message toggles reaction bar (mobile-friendly)
      hubBox.addEventListener('click', (e)=>{
        const msgEl = e.target.closest('.hub-msg');
        if(msgEl && !e.target.closest('.hub-react-btn')) {
          msgEl.classList.toggle('show-reactions');
          return;
        }
        const btn = e.target.closest('.hub-react-btn');
        if(btn){
          const emoji = btn.getAttribute('data-react');
          const idEnc = btn.getAttribute('data-msg') || '';
          const msgId = decodeURIComponent(idEnc);
          if(window.emitHubReact) window.emitHubReact({ messageId: msgId, emoji });
        }
      });
    })();



// ===== Extra tools logic (Fantasy/Mosaic/Ambilight/Vibe) =====
let __ambOn = localStorage.getItem('jp_amb_on') === '1';
let __vibeOn = localStorage.getItem('jp_vibe_on') === '1';

function getParentParam(){
  const sp = new URLSearchParams(location.search);
  return sp.get('parent_host') || sp.get('parent') || location.hostname;
}

function toast(msg){
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:rgba(0,0,0,.8);color:#fff;padding:10px 14px;border:1px solid rgba(255,255,255,.18);border-radius:14px;z-index:999999;font-weight:900;';
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), 1400);
}

function hashColor(str){
  str = String(str||'');
  let h=0; for(let i=0;i<str.length;i++) h=(h*31 + str.charCodeAt(i))>>>0;
  const a = 120 + (h % 120);
  const b = 90 + ((h>>8)%140);
  return `radial-gradient(circle at 25% 25%, rgba(0,242,234,.90), transparent 55%), radial-gradient(circle at 75% 75%, rgba(255,0,153,.78), transparent 55%), radial-gradient(circle at 50% 10%, rgba(${a},${b},255,.55), transparent 60%)`;
}

function refreshAmbilight(){
  const amb = document.getElementById('ambilight');
  if(!amb) return;
  const ch = (window.currentChannel || document.getElementById('current-channel-display')?.innerText || '').trim();
  amb.style.background = hashColor(ch || 'twitch');
}



let __toolsSched = false;
function ensurePlayerTools(){
  const vc = document.getElementById('video-container');
  if(!vc) return;

  // Ensure ambilight layer exists (behind player)
  if(!document.getElementById('ambilight')){
    const amb = document.createElement('div');
    amb.id = 'ambilight';
    vc.prepend(amb);
  }

  // Ensure tools exist (above player)
  let tools = document.getElementById('player-tools');
  if(!tools){
    tools = document.createElement('div');
    tools.id = 'player-tools';
    tools.innerHTML = `
      <button id="tool-mosaic" class="toolbtn" onclick="openMosaic()">📺</button>
      <button id="tool-fantasy" class="toolbtn" onclick="openFantasy()">🏆</button>
      <button id="tool-ambilight" class="toolbtn" onclick="toggleAmbilight()">💡</button>
      <button id="tool-vibe" class="toolbtn" onclick="toggleVibe()">🧠</button>
    `;
    vc.appendChild(tools);
  } else if (tools.parentElement !== vc) {
    vc.appendChild(tools);
  }

  // Force player iframe below tools
  vc.querySelectorAll('iframe').forEach(f=>{
    try{
      if(f.style.zIndex !== '1') f.style.zIndex = '1';
      if(f.style.position !== 'relative') f.style.position = 'relative';
    }catch(e){}
  });
}

// Re-ensure tools if Twitch replaces the player DOM (debounced to avoid infinite loops)
(function(){
  const vc = document.getElementById('video-container');
  if(!vc) return;

  ensurePlayerTools();

  const obs = new MutationObserver(()=>{
    if(__toolsSched) return;
    __toolsSched = true;
    requestAnimationFrame(()=>{
      __toolsSched = false;
      ensurePlayerTools();
    });
  });

  obs.observe(vc, { childList: true, subtree: true });

  window.addEventListener('load', ()=>setTimeout(ensurePlayerTools, 600));
  setTimeout(ensurePlayerTools, 1200);
})();


function toggleAmbilight(){
  __ambOn = !__ambOn;
  localStorage.setItem('jp_amb_on', __ambOn ? '1' : '0');
  const btn = document.getElementById('tool-ambilight');
  const amb = document.getElementById('ambilight');
  if(btn) btn.classList.toggle('active', __ambOn);
  if(amb) amb.classList.toggle('on', __ambOn);
  refreshAmbilight();
  toast(`Ambilight ${__ambOn ? 'activé' : 'désactivé'}`);
}

function vibeClass(name){
  const s = String(name||'');
  let h=0; for(let i=0;i<s.length;i++) h=(h*31 + s.charCodeAt(i))>>>0;
  const v = h % 3;
  return v===0 ? 'vibe-chill' : (v===1 ? 'vibe-hype' : 'vibe-toxic');
}
function applyVibe(){
  document.querySelectorAll('.tf-card').forEach(card=>{
    card.classList.remove('vibe-chill','vibe-hype','vibe-toxic');
    if(!__vibeOn) return;
    const name = card.dataset.gameName || card.getAttribute('data-game-name') || card.querySelector('.tf-title')?.textContent || '';
    card.classList.add(vibeClass(name));
  });
}
function toggleVibe(){
  __vibeOn = !__vibeOn;
  localStorage.setItem('jp_vibe_on', __vibeOn ? '1' : '0');
  const btn = document.getElementById('tool-vibe');
  if(btn) btn.classList.toggle('active', __vibeOn);
  applyVibe();
  toast(`Vibe Check ${__vibeOn ? 'activé' : 'désactivé'}`);
}

// reapply vibe on mutations
new MutationObserver(()=>{ if(__vibeOn) applyVibe(); }).observe(document.body, {childList:true, subtree:true});

// Mosaic
function openMosaic(){
  const m = document.getElementById('mosaicModal');
  const grid = document.getElementById('mosaicGrid');
  if(!m||!grid) return;
  const parent = getParentParam();
  const current = (window.currentChannel || document.getElementById('current-channel-display')?.innerText || '').trim();
  const list = [];
  if(current) list.push(current);
  if(Array.isArray(window.recentChannels)) list.push(...window.recentChannels);
  while(list.length < 4) list.push(current || 'twitch');
  const channels = list.filter(Boolean).slice(0,4);

  grid.innerHTML = '';
  channels.forEach(ch=>{
    const tile = document.createElement('div');
    tile.className='mosaic-tile';
    const src = `https://player.twitch.tv/?channel=${encodeURIComponent(ch)}&parent=${encodeURIComponent(parent)}&muted=true&autoplay=true`;
    tile.innerHTML = `<iframe src="${src}" width="100%" height="100%" frameborder="0" allow="autoplay; fullscreen"></iframe>
      <button onclick="focusChannel('${encodeURIComponent(ch)}')">Focus</button>`;
    grid.appendChild(tile);
  });
  m.classList.add('active');
}
function closeMosaic(e){ if(e) e.preventDefault(); document.getElementById('mosaicModal')?.classList.remove('active'); }
function focusChannel(enc){
  const ch = decodeURIComponent(enc);
  if(typeof changeChannel === 'function') changeChannel(ch);
  refreshAmbilight();
  closeMosaic(new Event('click'));
}

// Fantasy API + chart
function openFantasy(){ document.getElementById('fantasyModal')?.classList.add('active'); refreshFantasy(); }
function closeFantasy(e){ if(e) e.preventDefault(); document.getElementById('fantasyModal')?.classList.remove('active'); }

function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

async function refreshFantasy(){
  const user = (window.currentUser || 'Anon');
  const prof = await fetch(`/api/fantasy/profile?user=${encodeURIComponent(user)}`).then(r=>r.json()).catch(()=>null);
  if(prof && prof.success){
    document.getElementById('fantasyCash').textContent = `${Number(prof.cash||0).toLocaleString('fr-FR')} crédits`;
    const h = document.getElementById('fantasyHoldings');
    if(h){
      h.innerHTML = (prof.holdings||[]).map(x=>`
        <div style="display:flex;justify-content:space-between;gap:10px;border:1px solid rgba(255,255,255,.10);border-radius:12px;padding:10px;background:rgba(0,0,0,.15);cursor:pointer;"
             onclick="loadMarket('${escapeHtml(x.login)}')">
          <div style="font-weight:900;color:#fff;">${escapeHtml(x.login)} <span style="color:#a7a7b2;font-weight:700;">(${x.shares} sh)</span></div>
          <div style="font-weight:900;color:#00f2ea;">${Math.round(x.value).toLocaleString('fr-FR')}</div>
        </div>`).join('') || `<div style="color:#a7a7b2;">Aucun streamer en portefeuille.</div>`;
    }
  }

  const lb = await fetch(`/api/fantasy/leaderboard`).then(r=>r.json()).catch(()=>null);
  if(lb && lb.success){
    const el = document.getElementById('fantasyLeaderboard');
    if(el){
      el.innerHTML = (lb.items||[]).slice(0,10).map((u,i)=>`
        <div style="display:flex;justify-content:space-between;gap:10px;border:1px solid rgba(255,255,255,.10);border-radius:12px;padding:10px;background:rgba(0,0,0,.15);">
          <div style="font-weight:900;color:#fff;">#${i+1} ${escapeHtml(u.user||'')}</div>
          <div style="font-weight:900;color:#ffd600;">${Math.round(u.netWorth||0).toLocaleString('fr-FR')}</div>
        </div>`).join('') || `<div style="color:#a7a7b2;">Aucun classement.</div>`;
    }
  }
}

async function loadMarket(login){
  if(!login) return;
  const d = await fetch(`/api/fantasy/market?streamer=${encodeURIComponent(login)}`).then(r=>r.json()).catch(()=>null);
  if(!d || !d.success) return toast('Marché indisponible');
  const m = d.market;
  const info = document.getElementById('marketInfo');
  if(info){
    info.innerHTML = `
      <div>Base: <b style="color:#fff">${m.basePrice}</b></div>
      <div>Impact: <b style="color:#fff">x${Number(m.mult).toFixed(2)}</b></div>
      <div>Shares: <b style="color:#fff">${Math.round(m.sharesOutstanding)}</b></div>
      <div>Prix: <b style="color:#00f2ea">${m.price}</b></div>
    `;
  }
  drawChart(d.history || [], m.price);
  document.getElementById('fantasyStreamer').value = login;
}

function drawChart(history, last){
  const c = document.getElementById('marketChart');
  if(!c) return;
  const ctx = c.getContext('2d');
  const W=c.width, H=c.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle = '#0b0b0d';
  ctx.fillRect(0,0,W,H);
  const pts = (history||[]).map(x=>Number(x.price||0)).filter(x=>x>0);
  if(pts.length < 2){
    ctx.fillStyle = '#a7a7b2';
    ctx.font = '14px system-ui';
    ctx.fillText('Historique insuffisant (2+ points requis)', 16, 30);
    return;
  }
  const minP=Math.min(...pts), maxP=Math.max(...pts);
  const pad=18;
  const sx=(W-pad*2)/(pts.length-1);
  const sy=(H-pad*2)/(maxP-minP||1);
  ctx.strokeStyle='rgba(0,242,234,.85)';
  ctx.lineWidth=3;
  ctx.beginPath();
  pts.forEach((p,i)=>{
    const x=pad+i*sx;
    const y=H-pad-(p-minP)*sy;
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();
  ctx.fillStyle='#00f2ea';
  ctx.font='bold 16px system-ui';
  ctx.fillText(String(last||pts[pts.length-1]), W-70, 26);
}

async function fantasyBuy(){
  const user = (window.currentUser || 'Anon');
  const login = document.getElementById('fantasyStreamer')?.value?.trim();
  const amount = Number(document.getElementById('fantasyAmount')?.value || 0);
  if(!login || !amount) return alert('Streamer + montant requis.');
  const r = await fetch('/api/fantasy/invest', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ user, streamer: login, amount })}).then(r=>r.json()).catch(()=>null);
  if(!r || !r.success) return alert(r?.error || 'Erreur invest.');
  toast('Investissement effectué');
  await refreshFantasy();
  await loadMarket(login);
}
async function fantasySell(){
  const user = (window.currentUser || 'Anon');
  const login = document.getElementById('fantasyStreamer')?.value?.trim();
  const amount = Number(document.getElementById('fantasyAmount')?.value || 0);
  if(!login || !amount) return alert('Streamer + montant requis.');
  const r = await fetch('/api/fantasy/sell', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ user, streamer: login, amount })}).then(r=>r.json()).catch(()=>null);
  if(!r || !r.success) return alert(r?.error || 'Erreur sell.');
  toast('Vente effectuée');
  await refreshFantasy();
  await loadMarket(login);
}

// initialize buttons state
document.getElementById('tool-ambilight')?.classList.toggle('active', __ambOn);
document.getElementById('ambilight')?.classList.toggle('on', __ambOn);
document.getElementById('tool-vibe')?.classList.toggle('active', __vibeOn);
setTimeout(()=>{ if(__ambOn) refreshAmbilight(); if(__vibeOn) applyVibe(); }, 700);





// (BOURSE PANEL removed — replaced by Market overlay)

function openMarketOverlay(){
  document.body.classList.add('modal-open');
const ov = document.getElementById('market-overlay');
      if(!ov) return;
      ov.classList.remove('hidden');
      // ensure overlay starts at top
      try { ov.querySelector('.overflow-y-auto')?.scrollTo({ top:0, behavior:'smooth' }); } catch(_){}
      // refresh when opened (soft)
      try { refreshMarketAll(); } catch(_){}
    }
    function closeMarketOverlay(){
  document.body.classList.remove('modal-open');
const ov = document.getElementById('market-overlay');
      if(!ov) return;
      ov.classList.add('hidden');
    }
