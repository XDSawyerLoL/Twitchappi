const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();

// --- CONFIGURATION ---
const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
const GEMINI_MODEL = "gemini-1.5-flash"; // Plus stable que le 2.5 pour le moment

// Initialisation IA
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 

const CACHE = {
    twitchTokens: {}, twitchUser: null, streamBoosts: {}, boostedStream: null,
    globalStreamRotation: { streams: [], currentIndex: 0, lastFetchTime: 0, fetchCooldown: 900000 }
};

// --- HELPERS TWITCH ---
async function getTwitchToken() {
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
    const res = await fetch(url, { method: 'POST' });
    const data = await res.json();
    return data.access_token;
}

async function twitchApiFetch(endpoint, token) {
    const accessToken = token || await getTwitchToken();
    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${accessToken}` }
    });
    return res.json();
}

// --- LOGIQUE IA CORRIGÉE (LE COEUR DU PROBLÈME) ---
async function runGeminiAnalysis(prompt) {
    try {
        const model = genAI.getGenerativeModel({ 
            model: GEMINI_MODEL,
            systemInstruction: "Tu es un expert en croissance Twitch. Réponds en HTML simple (p, ul, li, h4, strong)."
        });
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        return { success: true, html_response: text };
    } catch (e) {
        return { success: false, html_response: `<p style="color:red">Erreur IA: ${e.message}</p>` };
    }
}

// --- ROUTES (AUTHENTIFICATION & DATA) ---
// [Ici tes routes habituelles : /twitch_auth_start, /twitch_auth_callback, /followed_streams, /scan_target...]
// Elles restent identiques à ton code d'origine pour ne pas casser ton visuel.

// --- ROUTE RAID AMÉLIORÉE ---
app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    if (!CACHE.twitchUser) return res.status(401).json({ success: false, error: "Twitch non connecté" });

    try {
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        const gameId = gameRes.data[0].id;
        const streamsRes = await twitchApiFetch(`streams?game_id=${gameId}&language=fr&first=100`);
        
        const targets = streamsRes.data.filter(s => s.viewer_count <= parseInt(max_viewers));
        if (targets.length > 0) {
            const target = targets[Math.floor(Math.random() * targets.length)];
            // On renvoie la cible, le raid doit être validé côté client avec le token utilisateur
            res.json({ success: true, target: { name: target.user_name, login: target.user_login, viewers: target.viewer_count } });
        } else {
            res.json({ success: false, error: "Aucune cible" });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- ROUTE CRITIQUE IA ---
app.post('/critique_ia', async (req, res) => {
    const { type, query, niche_score } = req.body;
    let prompt = `Analyse Twitch pour ${query}. Score: ${niche_score}. Type: ${type}.`;
    const result = await runGeminiAnalysis(prompt);
    res.json(result);
});

// Route LCD (Micro-Niche) intégrée pour ton lecteur
app.get('/get_micro_niche_stream_cycle', async (req, res) => {
    const data = await twitchApiFetch('streams?language=fr&first=100');
    const niche = data.data.filter(s => s.viewer_count <= 50);
    const target = niche[Math.floor(Math.random() * niche.length)];
    res.json({ success: true, channel: target ? target.user_login : 'twitch' });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));

app.listen(PORT, () => console.log(`Serveur prêt sur port ${PORT}`));
