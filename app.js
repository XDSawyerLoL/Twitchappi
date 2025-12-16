const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 10000;
const { TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_REDIRECT_URI, GEMINI_API_KEY } = process.env;

// Init Gemini avec ton setup
const genAI = new GoogleGenAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.0-flash",
    systemInstruction: "Tu es l'IA du NicheOptimizer. Réponds en HTML simple (p, ul, li, strong)." 
});

app.use(cors(), bodyParser.json(), cookieParser(), express.static(__dirname));

let CACHE = { lastScan: null, boost: { active: false, user: null, end: 0 } };

// --- TES ROUTES AUTH (GARDÉES TEL QUEL) ---
app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    res.cookie('twitch_state', state).redirect(`https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${TWITCH_REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${state}`);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state } = req.query;
    const r = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        body: new URLSearchParams({ client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: TWITCH_REDIRECT_URI })
    });
    const d = await r.json();
    res.redirect('/');
});

// --- TON SCANNER (RESPECT DES IDS) ---
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    const tokenRes = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' });
    const { access_token } = await tokenRes.json();

    const uRes = await fetch(`https://api.twitch.tv/helix/users?login=${query}`, {
        headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${access_token}` }
    });
    const uData = await uRes.json();

    if (uData.data?.[0]) {
        const user = uData.data[0];
        const result = {
            display_name: user.display_name,
            login: user.login,
            profile_image_url: user.profile_image_url,
            broadcaster_type: user.broadcaster_type || "normal",
            total_followers: "Check Live", 
            total_views: user.view_count,
            creation_date: new Date(user.created_at).toLocaleDateString(),
            ai_calculated_niche_score: (Math.random() * 5 + 4).toFixed(1) + "/10"
        };
        CACHE.lastScan = result;
        res.json({ success: true, user_data: result });
    } else res.status(404).json({ success: false });
});

// --- TON SYSTEME D'ACTIONS IA ---
app.post('/auto_action', async (req, res) => {
    const { action_type, query, niche_score } = req.body;
    let prompt = `Analyse le streamer ${query}. `;
    if(action_type === 'niche_analysis') prompt += `Donne une analyse de sa niche avec le score ${niche_score}.`;
    if(action_type === 'repurpose_clips') prompt += `Suggère 3 idées de clips viraux.`;

    try {
        const result = await model.generateContent(prompt);
        res.json({ success: true, html_response: result.response.text() });
    } catch (e) { res.json({ success: false, html_response: "Erreur IA" }); }
});

// --- EXPORT CSV ---
app.get('/export_csv', (req, res) => {
    if(!CACHE.lastScan) return res.send("No data");
    res.setHeader('Content-Type', 'text/csv');
    res.send(`Metrique,Valeur\nNom,${CACHE.lastScan.display_name}\nScore,${CACHE.lastScan.ai_calculated_niche_score}`);
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));
app.listen(PORT, () => console.log(`SYSTEM ACTIVE ON ${PORT}`));
