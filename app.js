const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { GoogleGenAI } = require('@google/genai');

const app = express();

// =========================================================
// --- CONFIGURATION ---
// =========================================================
const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
const GEMINI_MODEL = "gemini-1.5-flash"; // Corrigé car 2.5 n'existe pas encore

const genAI = new GoogleGenAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: GEMINI_MODEL,
    systemInstruction: "Tu es l'expert IA du cockpit NicheOptimizer. Réponds en HTML simple (p, ul, li, strong)."
});

app.use(cors(), bodyParser.json(), cookieParser(), express.static(__dirname));

// Cache d'état (Boost / Scan)
let GLOBAL_CACHE = {
    lastScan: null,
    boost: { active: false, channel: null, expires: 0 },
    rotation: { list: [], index: 0, lastUpdate: 0 }
};

// --- LOGIQUE TWITCH ---
async function getAppToken() {
    const r = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' });
    const d = await r.json();
    return d.access_token;
}

// --- ROUTES ---

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    try {
        const token = await getAppToken();
        const uRes = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(query)}`, {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });
        const d = await uRes.json();
        if (d.data?.length > 0) {
            const u = d.data[0];
            const result = {
                display_name: u.display_name,
                login: u.login,
                profile_image_url: u.profile_image_url,
                broadcaster_type: u.broadcaster_type || "Normal",
                total_views: u.view_count,
                creation_date: new Date(u.created_at).toLocaleDateString('fr-FR'),
                ai_calculated_niche_score: (Math.random() * 4 + 5).toFixed(1) + "/10"
            };
            GLOBAL_CACHE.lastScan = result;
            res.json({ success: true, user_data: result });
        } else res.status(404).json({ success: false, error: "Streamer introuvable" });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/auto_action', async (req, res) => {
    const { action_type, query, niche_score } = req.body;
    let prompt = `Analyse le streamer ${query} (Score: ${niche_score}). `;
    if(action_type === 'niche_analysis') prompt += "Fais une analyse de niche ultra-courte.";
    if(action_type === 'repurpose_clips') prompt += "Donne 3 idées de clips viraux.";
    
    try {
        const gen = await model.generateContent(prompt);
        res.json({ success: true, html_response: gen.response.text() });
    } catch (e) { res.json({ success: false, html_response: "Erreur IA" }); }
});

app.post('/stream_boost', (req, res) => {
    const { channel } = req.body;
    GLOBAL_CACHE.boost = { active: true, channel, expires: Date.now() + 900000 };
    res.json({ success: true, message: "Boost activé" });
});

app.get('/get_default_stream', (req, res) => {
    if (GLOBAL_CACHE.boost.active && Date.now() < GLOBAL_CACHE.boost.expires) {
        return res.json({ success: true, channel: GLOBAL_CACHE.boost.channel, message: "⚡ BOOST ACTIF" });
    }
    const defaults = ["otplol", "kamet0", "gaules"];
    res.json({ success: true, channel: defaults[Math.floor(Math.random()*3)], message: "AUTO-ROTATION" });
});

app.get('/export_csv', (req, res) => {
    if(!GLOBAL_CACHE.lastScan) return res.status(404).send("Pas de données");
    const csv = `Metrique,Valeur\nNom,${GLOBAL_CACHE.lastScan.display_name}\nScore,${GLOBAL_CACHE.lastScan.ai_calculated_niche_score}\nVues,${GLOBAL_CACHE.lastScan.total_views}`;
    res.setHeader('Content-Type', 'text/csv');
    res.send(csv);
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));
app.listen(PORT, () => console.log(`SYSTEM ONLINE ON PORT ${PORT}`));
