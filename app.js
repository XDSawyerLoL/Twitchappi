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
// --- CONFIGURATION ET VARIABLES D'ENVIRONNEMENT ---
// =========================================================

const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
const GEMINI_MODEL = "gemini-2.0-flash"; 

if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI || !GEMINI_API_KEY) {
    console.error("FATAL ERROR: VARIABLES D'ENVIRONNEMENT MANQUANTES.");
}

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

const genAI = new GoogleGenAI(GEMINI_API_KEY);

// --- FONCTIONS AUXILIAIRES ---
async function getAppAccessToken() {
    const params = new URLSearchParams();
    params.append('client_id', TWITCH_CLIENT_ID);
    params.append('client_secret', TWITCH_CLIENT_SECRET);
    params.append('grant_type', 'client_credentials');

    const response = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', body: params });
    const data = await response.json();
    return data.access_token;
}

async function runGeminiAnalysis(prompt) {
    try {
        const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return { success: true, html_response: response.text() };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// =========================================================
// --- ROUTES ---
// =========================================================

app.get('/auth/twitch', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    res.cookie('twitch_auth_state', state, { httpOnly: true, secure: true, sameSite: 'lax' });
    const scope = 'user:read:follows user:read:email';
    const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${state}`;
    res.redirect(authUrl);
});

app.get('/auth/callback', async (req, res) => {
    const { code, state } = req.query;
    const storedState = req.cookies['twitch_auth_state'];
    if (!state || state !== storedState) return res.status(403).send("Erreur de validation d'état.");

    const params = new URLSearchParams();
    params.append('client_id', TWITCH_CLIENT_ID);
    params.append('client_secret', TWITCH_CLIENT_SECRET);
    params.append('code', code);
    params.append('grant_type', 'authorization_code');
    params.append('redirect_uri', REDIRECT_URI);

    const resp = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', body: params });
    const data = await resp.json();
    res.redirect(`/?access_token=${data.access_token}`);
});

app.post('/auto_action', async (req, res) => {
    const { action_type, target_name, data_context } = req.body;
    let prompt = "";

    switch (action_type) {
        case 'niche_analysis':
            prompt = `Analyse la niche Twitch : ${target_name}. Contexte : ${JSON.stringify(data_context)}. Donne un score 0-100 et stratégie en HTML.`;
            break;
        case 'golden_hour':
            prompt = `Expert Twitch : Analyse le fuseau ${data_context.timezone}. Trouve les 3 meilleurs créneaux (Heure d'Or) où les gros streamers s'arrêtent mais l'audience reste. Réponse en HTML avec <h4> et <ul>.`;
            break;
        case 'repurpose_strategy':
            prompt = `Stratégie de découpage VOD pour : ${target_name}. Réponse en HTML.`;
            break;
        default:
            return res.status(400).json({ success: false, error: "Action non supportée" });
    }

    const result = await runGeminiAnalysis(prompt);
    res.json(result);
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));

app.listen(PORT, () => console.log(`Serveur prêt sur port ${PORT}`));
