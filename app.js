/**
 * STREAMER & NICHE AI HUB - BACKEND (V20 - ULTIMATE JS FIX)
 * ===============================================================
 * Syntaxe : CommonJS (require) pour éviter les bugs de déploiement.
 * Système IA : Gemini 2.5 Flash avec Grounding (Google Search).
 * Base de données : Firebase Firestore pour la persistance.
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// --- INITIALISATION FIREBASE ---
const admin = require('firebase-admin');
let serviceAccount;

if (process.env.FIREBASE_SERVICE_KEY) {
    try {
        let rawJson = process.env.FIREBASE_SERVICE_KEY;
        if (rawJson.startsWith("'") && rawJson.endsWith("'")) rawJson = rawJson.slice(1, -1);
        if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.slice(1, -1);
        rawJson = rawJson.replace(/\\n/g, '\n'); // Correction des sauts de ligne
        serviceAccount = JSON.parse(rawJson);
    } catch (error) {
        console.error("❌ [FIREBASE] Erreur de parsing JSON :", error.message);
    }
}

if (serviceAccount) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id 
        });
        console.log(`✅ [FIREBASE] Connecté au projet : ${serviceAccount.project_id}`);
    } catch (e) {
        console.error("❌ [FIREBASE] Erreur d'initialisation :", e.message);
    }
} else {
    try { admin.initializeApp(); } catch(e){}
}

const db = admin.firestore();

// --- CONFIGURATION ---
const app = express();
const PORT = process.env.PORT || 10000;

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025"; // Modèle supportant le Grounding

// Middlewares
app.use(cors({ origin: '*', credentials: true }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

// =========================================================
// SYSTÈME IA ROBUSTE (AVEC RECHERCHE GOOGLE)
// =========================================================

async function callGeminiApi(systemPrompt, userQuery) {
    if (!GEMINI_API_KEY) {
        return "Erreur: La clé API Gemini est absente.";
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    
    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        tools: [{ "google_search": {} }], // Activation de la recherche Google
    };

    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            // Utilisation du fetch natif de Node 22
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const result = await response.json();
                return result.candidates?.[0]?.content?.parts?.[0]?.text || "Réponse vide.";
            } else {
                const errData = await response.json();
                lastError = errData.error?.message || response.statusText;
            }
        } catch (e) {
            lastError = e.message;
        }
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
    return `Erreur IA : ${lastError}`;
}

// =========================================================
// ROUTES TWITCH & AUTH
// =========================================================

app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const scope = "user:read:follows";
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${scope}&state=${state}`;
    res.cookie('twitch_auth_state', state, { httpOnly: true, secure: true });
    res.redirect(url);
});

app.get('/twitch_callback', async (req, res) => {
    const { code, state } = req.query;
    if (state !== req.cookies.twitch_auth_state) return res.status(400).send("Erreur de sécurité.");

    try {
        const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: TWITCH_CLIENT_ID,
                client_secret: TWITCH_CLIENT_SECRET,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: REDIRECT_URI
            })
        });
        
        const data = await tokenRes.json();
        if (data.access_token) {
            res.cookie('twitch_access_token', data.access_token, { httpOnly: true, secure: true, maxAge: data.expires_in * 1000 });
            res.redirect('/?auth_status=success');
        } else {
            res.redirect('/?auth_status=error');
        }
    } catch (e) {
        res.status(500).send("Erreur serveur.");
    }
});

app.get('/followed_streams', async (req, res) => {
    const token = req.cookies.twitch_access_token;
    if (!token) return res.status(401).json({ error: "NOT_AUTHENTICATED" });

    try {
        const userRes = await fetch('https://api.twitch.tv/helix/users', {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });
        const userData = await userRes.json();
        const userId = userData.data[0].id;

        const streamRes = await fetch(`https://api.twitch.tv/helix/streams/followed?user_id=${userId}`, {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });
        const streams = await streamRes.json();
        
        res.json({ username: userData.data[0].display_name, streams: streams.data });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// =========================================================
// ROUTE CRITIQUE IA
// =========================================================

app.post('/critique_ia', async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Prompt manquant." });

    const systemPrompt = "Tu es un expert Twitch et analyste de données. Réponds en HTML simple (<h2>, <p>, <ul>, <li>, <strong>). Utilise la couleur ROSE (#FF0099) pour l'important.";
    const result = await callGeminiApi(systemPrompt, prompt);
    
    res.json({ result: result });
});

// =========================================================
// ROUTES STATIQUES & FALLBACK
// =========================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 SERVEUR HUB V6.5 DÉMARRÉ SUR LE PORT ${PORT}`);
});
