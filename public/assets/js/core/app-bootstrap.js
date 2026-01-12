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
        document.getElementById('hub-user-display').innerText = data.display_name;

        document.getElementById('btn-auth').classList.add('hidden');
        document.getElementById('user-area').classList.remove('hidden');

        document.getElementById('user-name').innerText = data.display_name;
        if (data.profile_image_url) document.getElementById('user-avatar').src = data.profile_image_url;

        await loadFollowed();
      }
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
            const thumb = (s.thumbnail_url||'').replace('{width}','400').replace('{height}','225');
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

      const cats = Array.isArray(tfAllCategories) ? tfAllCategories.slice(0, 10) : [];
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
              src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(vid)}?rel=0&modestbranding=1&mute=1"
              allow="autoplay; encrypted-media; picture-in-picture"
              loading="lazy"
              title="Trailer - ${gameName}">
            </iframe>
          `;
        } else {
          card.innerHTML = `
            <div class="tf-trailer-fallback">
              <div>
                <div style="font-weight:800;margin-bottom:6px">${gameName || 'Trailer'}</div>
                <div style="opacity:.85">
                  Trailer non configuré.<br/>
                  Ajoute l’ID YouTube dans <code style="opacity:.9">TRAILER_MAP</code>.
                </div>
              </div>
            </div>
          `;
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
      return u.replace('{width}','600').replace('{height}','800');
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
        if (poster) { bg.src = poster; bg.style.opacity = '.55'; }
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

        const parent = encodeURIComponent(TWITCH_PARENT || window.location.hostname);
        const src = `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${parent}&muted=true&autoplay=true`;

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
