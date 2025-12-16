const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 10000;
const { TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_REDIRECT_URI, GEMINI_API_KEY } = process.env;

// Init IA
const genAI = new GoogleGenAI(GEMINI_API_KEY);
const aiModel = genAI.getGenerativeModel({ 
    model: "gemini-2.0-flash",
    systemInstruction: "Tu es un expert Twitch. Réponds en HTML simple (p, ul, li, h4, strong)." 
});

app.use(cors(), express.json(), cookieParser(), express.static(__dirname));

// Cache d'origine préservé
const CACHE = {
    twitchTokens: {}, twitchUser: null, streamBoosts: {}, boostedStream: null, lastScanData: null,
    globalStreamRotation: { streams: [], currentIndex: 0, lastFetchTime: 0, fetchCooldown: 900000 }
};

// --- HELPERS TWITCH (TES FONCTIONS DE BASE) ---
async function getTwitchToken() {
    if (CACHE.twitchTokens.app?.exp > Date.now()) return CACHE.twitchTokens.app.val;
    const r = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' });
    const d = await r.json();
    CACHE.twitchTokens.app = { val: d.access_token, exp: Date.now() + (d.expires_in * 1000) - 300000 };
    return d.access_token;
}

async function twitchApi(endpoint, customToken = null) {
    const token = customToken || await getTwitchToken();
    const r = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
    });
    if (!r.ok) throw new Error(`Twitch API Error: ${r.status}`);
    return r.json();
}

// --- ROUTES AUTH (SANS MODIFICATION) ---
app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    res.cookie('twitch_state', state, { httpOnly: true, secure: true }).redirect(`https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${TWITCH_REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${state}`);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state } = req.query;
    if (state !== req.cookies.twitch_state) return res.status(403).send("State mismatch");
    const r = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: TWITCH_REDIRECT_URI })
    });
    const d = await r.json();
    const u = await twitchApi('users', d.access_token);
    CACHE.twitchUser = { ...u.data[0], access_token: d.access_token, exp: Date.now() + (d.expires_in * 1000) };
    res.redirect('/');
});

// --- LOGIQUE BOOST (COOLDOWN 3H) ---
app.post('/stream_boost', (req, res) => {
    const { channel } = req.body;
    const now = Date.now();
    const COOLDOWN = 3 * 3600000;
    if (CACHE.streamBoosts[channel] && (now - CACHE.streamBoosts[channel]) < COOLDOWN) {
        const rem = Math.ceil((CACHE.streamBoosts[channel] + COOLDOWN - now) / 60000);
        return res.status(429).json({ error: `Cooldown actif. Attendez ${rem} min.` });
    }
    CACHE.streamBoosts[channel] = now;
    CACHE.boostedStream = { channel, endTime: now + 900000 };
    res.json({ success: true, html_response: `<p style="color:#ff0099">⚡ Boost activé pour 15 min sur <strong>${channel}</strong> !</p>` });
});

// --- SCAN & ANALYSE (LA LOGIQUE QUE TU VOULAIS GARDER) ---
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    try {
        const uRes = await twitchApi(`users?login=${encodeURIComponent(query)}`);
        if (uRes.data.length > 0) {
            const u = uRes.data[0];
            const [s, f, v] = await Promise.all([
                twitchApi(`streams?user_id=${u.id}`),
                twitchApi(`users/follows?followed_id=${u.id}&first=1`),
                twitchApi(`videos?user_id=${u.id}&type=archive&first=1`)
            ]);
            const userData = {
                login: u.login, display_name: u.display_name, id: u.id, profile_image_url: u.profile_image_url,
                is_live: s.data.length > 0, viewer_count: s.data[0]?.viewer_count || 0,
                game_name: s.data[0]?.game_name || '', broadcaster_type: (u.broadcaster_type || 'normal').toUpperCase(),
                total_followers: f.total, vod_count: v.total, total_views: u.view_count || 0,
                creation_date: new Date(u.created_at).toLocaleDateString('fr-FR'),
                ai_calculated_niche_score: u.broadcaster_type === 'partner' ? '8.5/10' : '5.0/10',
                type: 'user'
            };
            CACHE.lastScanData = userData;
            return res.json({ success: true, type: 'user', user_data: userData });
        }
        res.status(404).json({ success: false, message: "Non trouvé" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- EXPORT CSV (RÉTABLI) ---
app.get('/export_csv', (req, res) => {
    const d = CACHE.lastScanData;
    if (!d) return res.status(404).send("Pas de données");
    let csv = "Metrique,Valeur\n";
    Object.keys(d).forEach(k => { if(typeof d[k] !== 'object') csv += `${k},${d[k]}\n` });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=export.csv');
    res.send(csv);
});

// --- IA ---
app.post('/critique_ia', async (req, res) => {
    const { type, query, niche_score } = req.body;
    const prompt = type === 'niche' 
        ? `Expert Twitch. Score: ${niche_score}. Analyse "${query}". Donne 3 points forts et 3 suggestions de contenu en HTML.`
        : `Analyse la VOD de "${query}". Donne 3 moments clips avec timestamps (HH:MM:SS). HTML.`;
    const result = await aiModel.generateContent(prompt);
    res.json({ success: true, html_response: result.response.text() });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));
app.listen(PORT, () => console.log(`SYSTEM ONLINE ON PORT ${PORT}`));
