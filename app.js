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

// --- VOTRE CACHE COMPLET ---
const CACHE = {
    twitchUser: null,
    lastScanData: null,
    boostedStream: null, // Pour votre fonction checkBoostAndPlay
    globalStreamRotation: { streams: [], currentIndex: 0, lastFetchTime: 0 }
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

// --- ROUTES AUTH (FIX FERMETURE POPUP) ---
app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    res.cookie('twitch_state', state);
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${state}`;
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code } = req.query;
    const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        body: new URLSearchParams({ client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI })
    });
    const tokenData = await tokenRes.json();
    const userRes = await twitchApi('users', tokenData.access_token);
    CACHE.twitchUser = { ...userRes.data[0], access_token: tokenData.access_token };
    res.send(`<html><body><script>if(window.opener){window.opener.location.reload();}window.close();</script></body></html>`);
});

// --- LOGIQUE BOOST & GOLDEN HOUR (VOTRE CODE) ---
app.get('/get_golden_hour_stats', (req, res) => {
    res.json({ success: true, score: Math.floor(Math.random() * 40) + 60 });
});

app.post('/stream_boost', (req, res) => {
    CACHE.boostedStream = req.body.channel;
    res.json({ success: true });
});

app.get('/check_boost', (req, res) => {
    res.json({ boosted: CACHE.boostedStream });
});

// --- DASHBOARD 360 & IA (AJOUTS) ---
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    const userRes = await twitchApi(`users?login=${query}`);
    if (userRes.data && userRes.data.length > 0) {
        const user = userRes.data[0];
        const stream = await twitchApi(`streams?user_id=${user.id}`);
        const follows = await twitchApi(`users/follows?to_id=${user.id}`);
        const vods = await twitchApi(`videos?user_id=${user.id}&first=1`);
        CACHE.lastScanData = { ...user, is_live: stream.data.length > 0, followers: follows.total, last_vod: vods.data[0] };
        return res.json({ success: true, data: CACHE.lastScanData });
    }
    res.json({ success: false });
});

app.post('/auto_action', async (req, res) => {
    const { action_type, target_name } = req.body;
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `Analyse de ${action_type} pour le streamer ${target_name}. Format HTML.`;
    const result = await model.generateContent(prompt);
    res.json({ success: true, html_response: result.response.text() });
});

app.get('/followed_streams', async (req, res) => {
    if(!CACHE.twitchUser) return res.json({ streams: [] });
    const data = await twitchApi(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token);
    res.json({ streams: data.data || [] });
});

app.get('/export_csv', (req, res) => {
    res.setHeader('Content-Type', 'text/csv');
    res.attachment('audit_niche.csv');
    res.send("Pseudo,Followers,Status\n" + (CACHE.lastScanData ? `${CACHE.lastScanData.display_name},${CACHE.lastScanData.followers},${CACHE.lastScanData.is_live}` : "Pas de scan"));
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));
app.listen(PORT, () => console.log(`Cockpit V15 prêt sur port ${PORT}`));
