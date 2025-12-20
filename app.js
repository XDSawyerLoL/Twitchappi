<script src="https://embed.twitch.tv/embed/v1.js"></script>
<script>
/* ============================================================
   VARIABLES GLOBALES
============================================================ */
const API_BASE = window.location.origin;
const DEFAULT_CHANNEL = 'twitch';
const AUTO_CYCLE_DURATION_MS = 3 * 60 * 1000;

let embed = null;
let autoCycleTimer = null; 
let boostTimeout = null; 
let isConnected = false;

/* ============================================================
   ONGLET NAVIGATION
============================================================ */
function openTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.querySelector(`.tab-btn[data-tab-id="${tabId}"]`).classList.add('active');
    
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    
    if (tabId === 'tab-followed') loadFollowedStreams();
}

/* Format utilitaire */
const safeFormat = (val) => (val && val !== 'N/A') ? Number(val).toLocaleString('fr-FR') : 'N/A';

/* ============================================================
   🔥 LECTEUR TWITCH — AUTOPLAY + FIREBASE STATS
============================================================ */
window.launchPlayer = async function(channelName, videoId = null) {

    if (embed && ((!videoId && embed.getChannel() === channelName) || (videoId && embed.getVideo() === videoId))) return;

    const hostWithoutPort = window.location.hostname;
    const parentList = [
        hostWithoutPort, 
        "localhost", 
        "127.0.0.1", 
        "justplayerstreamhubpro.onrender.com", 
        "justplayer.fr"
    ];
    if (window.location.host.includes(':')) parentList.push(window.location.host);

    document.getElementById('twitch-embed').innerHTML = '';

    const config = { 
        width: "100%", 
        height: "100%", 
        layout: "video-and-chat", 
        parent: parentList,
        autoplay: true,
        muted: true
    };

    if (videoId) config.video = videoId;
    else config.channel = channelName;

    embed = new Twitch.Embed("twitch-embed", config);
    document.getElementById('input-channel').value = channelName;

    loadChannelStats(channelName);
};

/* ============================================================
   STATS FIREBASE — TWITCH TRACKER
============================================================ */
async function loadChannelStats(channel) {
    if (!channel) return;
    const box = document.getElementById("stats-container");
    if (!box) return;

    box.innerHTML = "⏳ Chargement stats Firebase…";

    try {
        const res = await fetch(`/stats/${channel}`);
        const data = await res.json();

        if (!data.success) {
            box.innerHTML = "<p style='color:#e34a64;'>❌ Aucune stats trouvée.</p>";
            return;
        }

        const s = data.stats;

        box.innerHTML = `
          <ul style="line-height:22px;">
            <li>👁 Moyenne Viewers : <strong>${s.avg_viewers || "N/A"}</strong></li>
            <li>👥 Followers Totaux : <strong>${s.followers || "N/A"}</strong></li>
            <li>🚀 Pic Viewers : <strong>${s.peak_viewers || "N/A"}</strong></li>
            <li>📅 Dernier Scan : <strong>${new Date(s.lastScan).toLocaleString()}</strong></li>
          </ul>
        `;
    } catch(e) {
        box.innerHTML = `<p style="color:#e34a64;">Erreur: ${e.message}</p>`;
    }
}

/* ============================================================
   LOGIQUE DE ROTATION / BOOST
============================================================ */
async function checkBoostAndPlay(manual = false) {
    const statusEl = document.getElementById('player-channel-status');
    const btnPrev = document.getElementById('btn-prev-stream');
    const btnNext = document.getElementById('btn-next-stream');
    
    if (autoCycleTimer) clearInterval(autoCycleTimer);
    if (manual && boostTimeout) clearTimeout(boostTimeout);

    try {
        const res = await fetch(`${API_BASE}/get_default_stream`);
        const data = await res.json();
        
        if (data.success) {
            launchPlayer(data.channel);
            statusEl.innerHTML = data.message;
            
            if (data.viewers === 'BOOST') {
                btnPrev.disabled = true; 
                btnNext.disabled = true;
                
                const bRes = await fetch(`${API_BASE}/check_boost_status`);
                const bData = await bRes.json();
                if(bData.is_boosted) {
                    boostTimeout = setTimeout(() => checkBoostAndPlay(), (bData.remaining_seconds * 1000) + 2000);
                }
            } else {
                btnPrev.disabled = false; 
                btnNext.disabled = false;

                autoCycleTimer = setInterval(() => cycleStream('next'), AUTO_CYCLE_DURATION_MS);
            }
        } else {
            launchPlayer(DEFAULT_CHANNEL);
        }
    } catch(e) { 
        console.error(e);
        launchPlayer(DEFAULT_CHANNEL); 
    }
}

async function cycleStream(direction) {
    document.getElementById('btn-prev-stream').disabled = true; 
    document.getElementById('btn-next-stream').disabled = true;

    try {
        const res = await fetch(`${API_BASE}/cycle_stream`, { 
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ direction }) 
        });
        const data = await res.json();
        if (data.success) launchPlayer(data.channel);
    } catch(e) {
        console.error(e);
    } finally { 
        checkBoostAndPlay(true); 
    }
}

/* ============================================================
   AUTHENTIFICATION TWITCH
============================================================ */
function startAuth() { 
    window.open(`${API_BASE}/twitch_auth_start`, 'twitch_login_popup', 'width=500,height=650'); 
}

window.addEventListener('message', (event) => {
    if (event.data === 'auth_success') {
        window.location.reload(); 
    }
});

async function checkAuthStatus() {
    const btn = document.getElementById('btn-twitch-login');
    const panel = document.getElementById('followed-panel');

    try {
        const res = await fetch(`${API_BASE}/auth_status`);
        const data = await res.json();

        if (data.connected) {
            isConnected = true;
            btn.innerHTML = `🔓 Déjà connecté`;
            panel.style.display = "block";
        } else {
            isConnected = false;
            btn.innerHTML = `🔐 Se connecter Twitch`;
            panel.style.display = "none";
        }

    } catch(e) { console.error(e); }
}

/* ============================================================
   CHAINES SUIVIES
============================================================ */
async function loadFollowedStreams() {
    const box = document.getElementById('followed-results');
    box.innerHTML = "⏳ Loading…";

    try {
        const res = await fetch(`${API_BASE}/twitch_followed`);
        const data = await res.json();

        if (!data.success) {
            box.innerHTML = "❌ Pas connecté";
            return;
        }

        box.innerHTML = data.list.map(s => `
            <div style="margin:8px; padding:8px; border:1px solid #333;">
               <strong>${s.display_name}</strong> — ${s.viewer_count} viewers
               <button onclick="launchPlayer('${s.login}')">▶ Watch</button>
            </div>
        `).join("");

    } catch(e) {
        box.innerHTML = "Erreur";
    }
}

/* ============================================================
   IA CONTENU / NICHE / BEST TIME
============================================================ */
async function analyzeNiche() {
    const query = document.getElementById('niche-query').value;
    if (!query) return;

    const box = document.getElementById('niche-results');
    box.innerHTML = "⏳ Analyse IA…";

    const res = await fetch(`${API_BASE}/critique_ia`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ type:'niche', query, niche_score:'8.0' })
    });
    const data = await res.json();
    box.innerHTML = data.html_response || "Erreur IA";
}

async function analyzeRepurpose() {
    const url = document.getElementById('vod-url').value;
    if (!url) return;

    const box = document.getElementById('vod-results');
    box.innerHTML = "⏳ IA…";

    const res = await fetch(`${API_BASE}/critique_ia`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ type:'repurpose', query:url })
    });
    const data = await res.json();
    box.innerHTML = data.html_response || "Erreur IA";
}

async function analyzeSchedule() {
    const game = document.getElementById('schedule-game').value;
    if (!game) return;

    const box = document.getElementById('schedule-results');
    box.innerHTML = "⏳ Analyse…";

    const res = await fetch(`${API_BASE}/analyze_schedule`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ game })
    });
    const data = await res.json();
    box.innerHTML = data.html_response || "Erreur IA";
}

/* ============================================================
   RAID SUGGESTIONS
============================================================ */
async function suggestRaid() {
    const g = document.getElementById("raid-game").value;
    const v = document.getElementById("raid-viewers").value;
    const box = document.getElementById("raid-results");
    box.innerHTML = "⏳ Recherche…";

    const res = await fetch(`${API_BASE}/raid_search?game=${encodeURIComponent(g)}&max=${encodeURIComponent(v)}`);
    const data = await res.json();

    if (!data.success) {
        box.innerHTML = "<p>❌ Aucun candidat</p>";
        return;
    }

    const t = data.target;
    box.innerHTML = `
        <p>🎯 Cible trouvée : <strong>${t.name}</strong> — ${t.viewers} viewers</p>
        <p>Jeu : ${t.game}</p>
        <img src="${t.thumbnail_url}" />
        <br><button onclick="launchPlayer('${t.login}')">▶ Voir</button>
    `;
}

/* ============================================================
   DEMARRAGE AUTO
============================================================ */
checkAuthStatus();
checkBoostAndPlay();
</script>
