const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 10000;

// Variables d'environnement
const { TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_REDIRECT_URI, GEMINI_API_KEY } = process.env;

// Configuration IA
const ai = new GoogleGenAI(GEMINI_API_KEY).getGenerativeModel({ 
    model: "gemini-1.5-flash", // Version stable
    systemInstruction: "Tu es un expert en croissance Twitch. Réponds EXCLUSIVEMENT en HTML (p, ul, li, h4, strong)."
});

app.use(cors(), express.json(), cookieParser(), express.static(__dirname));

const CACHE = {
    twitchTokens: {}, twitchUser: null, streamBoosts: {}, boostedStream: null, lastScanData: null,
    rotation: { streams: [], currentIndex: 0, lastFetchTime: 0, fetchCooldown: 900000 }
};

// --- HELPERS TWITCH ---
async function getAppToken() {
    if (CACHE.twitchTokens.app?.exp > Date.now()) return CACHE.twitchTokens.app.val;
    const res = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' });
    const data = await res.json();
    CACHE.twitchTokens.app = { val: data.access_token, exp: Date.now() + (data.expires_in * 1000) - 300000 };
    return data.access_token;
}

async function twitchFetch(endpoint, token = null) {
    const atk = token || await getAppToken();
    const r = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${atk}` }
    });
    return r.json();
}

// --- ROUTES AUTH ---
app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    res.cookie('twitch_state', state, { httpOnly: true }).redirect(`https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${TWITCH_REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${state}`);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state } = req.query;
    if (state !== req.cookies.twitch_state) return res.status(400).send("Erreur de sécurité");
    const r = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: TWITCH_REDIRECT_URI })
    });
    const d = await r.json();
    const u = await twitchFetch('users', d.access_token);
    CACHE.twitchUser = { ...u.data[0], access_token: d.access_token, exp: Date.now() + d.expires_in * 1000 };
    res.redirect('/');
});

app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.exp > Date.now()) {
        return res.json({ is_connected: true, display_name: CACHE.twitchUser.display_name });
    }
    res.json({ is_connected: false });
});

// --- SCAN TARGET & ANALYSE ---
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    try {
        const uRes = await twitchFetch(`users?login=${encodeURIComponent(query)}`);
        if (uRes.data?.length > 0) {
            const u = uRes.data[0];
            const [s, f, v] = await Promise.all([
                twitchFetch(`streams?user_id=${u.id}`),
                twitchFetch(`users/follows?followed_id=${u.id}&first=1`),
                twitchFetch(`videos?user_id=${u.id}&type=archive&first=1`)
            ]);
            const data = {
                type: 'user', login: u.login, display_name: u.display_name, profile_image_url: u.profile_image_url,
                is_live: s.data.length > 0, viewer_count: s.data[0]?.viewer_count || 0,
                game_name: s.data[0]?.game_name || 'N/A', total_followers: f.total || 0,
                vod_count: v.total || 0, total_views: u.view_count, creation_date: new Date(u.created_at).toLocaleDateString(),
                ai_calculated_niche_score: u.broadcaster_type === 'partner' ? '8.5/10' : '5.0/10'
            };
            CACHE.lastScanData = data;
            return res.json({ success: true, type: 'user', user_data: data });
        }
        res.status(404).json({ success: false, message: "Non trouvé" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- IA CRITIQUE ---
app.post('/critique_ia', async (req, res) => {
    const { type, query, niche_score } = req.body;
    const prompts = {
        niche: `Analyse niche pour "${query}" (Score: ${niche_score}). Donne 3 points forts et 3 idées de contenu.`,
        repurpose: `Analyse VOD pour "${query}". Suggère 3 clips avec timestamps HH:MM:SS.`,
        trend: `Analyse les tendances Twitch actuelles.`
    };
    try {
        const result = await ai.generateContent(prompts[type]);
        res.json({ success: true, html_response: result.response.text() });
    } catch (e) { res.status(500).json({ success: false, html_response: `<p style="color:red">Erreur IA: ${e.message}</p>` }); }
});

// --- BOOST & ROTATION ---
app.post('/stream_boost', (req, res) => {
    const { channel } = req.body;
    const now = Date.now();
    if (CACHE.streamBoosts[channel] && (now - CACHE.streamBoosts[channel]) < 10800000) {
        return res.status(429).json({ error: "Cooldown de 3h actif." });
    }
    CACHE.streamBoosts[channel] = now;
    CACHE.boostedStream = { channel, endTime: now + 900000 };
    res.json({ success: true, html_response: `<p>✅ Boost activé pour <strong>${channel}</strong> (15 min).</p>` });
});

app.get('/get_default_stream', async (req, res) => {
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
        return res.json({ success: true, channel: CACHE.boostedStream.channel, message: "⚡ BOOST ACTIF" });
    }
    if (Date.now() - CACHE.rotation.lastFetchTime > CACHE.rotation.fetchCooldown) {
        const d = await twitchFetch('streams?language=fr&first=100');
        CACHE.rotation.streams = d.data.filter(s => s.viewer_count <= 100);
        CACHE.rotation.lastFetchTime = Date.now();
    }
    const s = CACHE.rotation.streams[CACHE.rotation.currentIndex++ % CACHE.rotation.streams.length] || { user_login: 'twitch' };
    res.json({ success: true, channel: s.user_login, viewers: s.viewer_count, message: "Auto-Discovery" });
});

// --- RAID & EXPORT ---
app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    const gRes = await twitchFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
    if (!gRes.data?.[0]) return res.json({ success: false, error: "Jeu non trouvé" });
    const sRes = await twitchFetch(`streams?game_id=${gRes.data[0].id}&first=100`);
    const target = sRes.data.find(s => s.viewer_count <= max_viewers);
    if (target) res.json({ success: true, target: { name: target.user_name, login: target.user_login, viewers: target.viewer_count } });
    else res.json({ success: false, error: "Aucune cible" });
});

app.get('/export_csv', (req, res) => {
    const d = CACHE.lastScanData;
    if (!d) return res.status(404).send("Pas de scan");
    let csv = "Metrique,Valeur\n" + Object.entries(d).map(([k, v]) => `${k},${v}`).join("\n");
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=export.csv');
    res.send(csv);
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));
app.listen(PORT, () => console.log(`Cockpit prêt sur le port ${PORT}`));
