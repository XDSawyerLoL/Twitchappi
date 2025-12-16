const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { GoogleGenAI } = require('@google/genai');

const app = express();

// --- CONFIGURATION ---
const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const genAI = new GoogleGenAI(GEMINI_API_KEY);

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

// CACHE ET ETAT
let CACHE = {
    twitchUser: null,
    lastScanData: null,
    boostedStream: null,
    globalRotation: { streams: [], index: 0, lastFetch: 0 }
};

// --- HELPERS TWITCH ---
async function getAppToken() {
    const res = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' });
    const data = await res.json();
    return data.access_token;
}

async function twitchApi(endpoint, token = null) {
    const t = token || await getAppToken();
    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${t}` }
    });
    return res.json();
}

// --- ROUTES AUTH ---
app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    res.cookie('twitch_state', state);
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${state}`;
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code } = req.query;
    try {
        const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            body: new URLSearchParams({ client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI })
        });
        const tokenData = await tokenRes.json();
        const userRes = await twitchApi('users', tokenData.access_token);
        CACHE.twitchUser = { ...userRes.data[0], access_token: tokenData.access_token };
        
        // FERMETURE AUTO ET REFRESH PARENT
        res.send(`<html><body><script>if(window.opener){window.opener.location.reload();} window.close();</script></body></html>`);
    } catch(e) { res.send("Erreur Auth"); }
});

// --- DASHBOARD & IA ---
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    try {
        const userRes = await twitchApi(`users?login=${query}`);
        if (userRes.data && userRes.data.length > 0) {
            const user = userRes.data[0];
            const stream = await twitchApi(`streams?user_id=${user.id}`);
            const follow = await twitchApi(`users/follows?to_id=${user.id}`); 
            CACHE.lastScanData = { type: 'user', ...user, is_live: stream.data.length > 0, followers: follow.total || 0 };
            return res.json({ success: true, data: CACHE.lastScanData });
        }
        res.json({ success: false, error: "Streamer non trouvé" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/critique_ia', async (req, res) => {
    try {
        const { query } = req.body;
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `Fais une analyse de niche pour le streamer ${query}. Donne un score sur 10, 3 points forts et 1 conseil de croissance. Réponds en HTML simple.`;
        const result = await model.generateContent(prompt);
        res.json({ html: result.response.text() });
    } catch(e) { res.json({ html: "Erreur IA" }); }
});

app.get('/get_latest_vod', async (req, res) => {
    if(!CACHE.lastScanData) return res.json({error: "No scan"});
    const vods = await twitchApi(`videos?user_id=${CACHE.lastScanData.id}&first=1&type=archive`);
    res.json({ vod: vods.data[0] });
});

// --- RAID ---
app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    try {
        const gameRes = await twitchApi(`games?name=${encodeURIComponent(game)}`);
        if(!gameRes.data.length) return res.json({success:false, error:"Jeu introuvable"});
        const streams = await twitchApi(`streams?game_id=${gameRes.data[0].id}&first=100`);
        const targets = streams.data.filter(s => s.viewer_count <= max_viewers).sort((a,b) => b.viewer_count - a.viewer_count);
        res.json({ success: true, targets: targets.slice(0, 5) });
    } catch(e) { res.json({success:false, error:e.message}); }
});

// --- AUTRES ---
app.get('/get_default_stream', async (req, res) => {
    if(CACHE.boostedStream) return res.json({ channel: CACHE.boostedStream });
    const streams = await twitchApi('streams?language=fr&first=50');
    const small = streams.data.filter(s => s.viewer_count < 100);
    res.json({ channel: small[0]?.user_login || 'twitch' });
});

app.post('/stream_boost', (req, res) => {
    CACHE.boostedStream = req.body.channel;
    res.json({ success: true });
});

app.get('/twitch_user_status', (req, res) => res.json({ is_connected: !!CACHE.twitchUser, user: CACHE.twitchUser }));

app.get('/followed_streams', async (req, res) => {
    if(!CACHE.twitchUser) return res.json({ streams: [] });
    const followed = await twitchApi(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token);
    res.json({ streams: followed.data || [] });
});

app.get('/get_golden_hour_stats', (req, res) => {
    const score = Math.floor(Math.random() * (95 - 60) + 60);
    res.json({ success: true, score });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));

app.listen(PORT, () => console.log(`Cockpit prêt sur le port ${PORT}`));
