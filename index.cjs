// =========================================================
// Configuration des Modules et Initialisation du Serveur
// =========================================================

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();

app.use(cors());
app.use(bodyParser.json());

// =========================================================
// Firebase Admin SDK — Correction de l'Initialisation Sécurisée
// =========================================================

const admin = require("firebase-admin");

let firebaseCredentials;

try {
    // Tente de lire les credentials JSON à partir de la variable d'environnement (méthode Render)
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (serviceAccountJson) {
        // Le contenu JSON complet est parsé depuis la variable d'environnement
        firebaseCredentials = JSON.parse(serviceAccountJson);
        console.log("Credentials Firebase chargées depuis la variable d'environnement.");
    } else {
        // Tente de lire le fichier local (méthode de développement local)
        console.log("Variable d'environnement FIREBASE_SERVICE_ACCOUNT non trouvée. Tentative de lecture locale...");
        // ATTENTION : Cette ligne échouera si le fichier n'est pas présent (ce qui est le cas sur Render)
        firebaseCredentials = require('./serviceAccountKey.json');
    }
} catch (e) {
    console.error("Échec du chargement des identifiants Firebase. Assurez-vous que 'FIREBASE_SERVICE_ACCOUNT' est configurée sur Render OU que 'serviceAccountKey.json' est présent localement.");
    console.error("Détails de l'erreur:", e.message);
    // Le serveur doit s'arrêter si Firebase ne peut pas être initialisé
    process.exit(1); 
}

// Utilisation des credentials chargées
admin.initializeApp({
    credential: admin.credential.cert(firebaseCredentials),
    // 👉 REMPLACEZ LA LIGNE CI-DESSOUS par l'URL de votre base de données :
    databaseURL: "https://TON_PROJET.firebaseio.com" 
});

// Accès DB Firebase
const rtdb = admin.database();
const firestore = admin.firestore();

// =========================================================
// Configuration des Routes Statiques
// =========================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

app.get('/NicheOptimizer.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

app.get('/lucky_streamer_picker.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'lucky_streamer_picker.html'));
});

app.get('/sniper_tool.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'sniper_tool.html'));
});

// =========================================================
// Configuration des Clés & Auth Twitch
// =========================================================

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

let TWITCH_ACCESS_TOKEN = null;
let TWITCH_TOKEN_EXPIRY = 0;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash";

// --- Fonction pour obtenir un token Twitch ---
async function getTwitchAccessToken() {
    if (TWITCH_ACCESS_TOKEN && Date.now() < TWITCH_TOKEN_EXPIRY) {
        return TWITCH_ACCESS_TOKEN;
    }

    console.log("Obtention d'un nouveau Token Twitch...");
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;

    try {
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();

        if (response.ok && data.access_token) {
            TWITCH_ACCESS_TOKEN = data.access_token;
            TWITCH_TOKEN_EXPIRY = Date.now() + (data.expires_in * 1000) - 300000;
            return TWITCH_ACCESS_TOKEN;
        } else {
            console.error("Erreur Token Twitch:", data);
            return null;
        }
    } catch (error) {
        console.error("Erreur réseau Auth Twitch:", error.message);
        return null;
    }
}

// --- Fonctions Helper Twitch ---
async function getGameId(gameName, token) {
    if (!gameName || !token) return null;
    const searchUrl = `https://api.twitch.tv/helix/games?name=${encodeURIComponent(gameName)}`;
    const response = await fetch(searchUrl, {
        headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
    });

    if (response.status !== 200) {
        console.error(`Erreur Twitch Helix getGameId (HTTP ${response.status})`);
        return null;
    }
    const data = await response.json();
    return data.data.length > 0 ? data.data[0].id : null;
}

async function getStreamerDetails(userLogin, token) {
    if (!userLogin || !token) return null;

    try {
        const userRes = await fetch(
            `https://api.twitch.tv/helix/users?login=${encodeURIComponent(userLogin)}`,
            { headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` } }
        );

        if (userRes.status !== 200) return null;

        const userData = await userRes.json();
        if (!userData.data || userData.data.length === 0) return null;

        const user = userData.data[0];

        const streamRes = await fetch(
            `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(userLogin)}`,
            { headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` } }
        );
        const streamData = await streamRes.json();
        const stream = streamData.data && streamData.data.length > 0 ? streamData.data[0] : null;

        const followRes = await fetch(
            `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${user.id}`,
            { headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` } }
        );
        const followData = await followRes.json();

        return {
            username: user.login,
            user_id: user.id,
            is_live: !!stream,
            title: stream ? stream.title : 'Hors ligne',
            game_name: stream ? stream.game_name : 'Non spécifié',
            viewer_count: stream ? stream.viewer_count : 0,
            follower_count: followData.total || 0,
            tags: stream?.tags || [],
            avg_score: (Math.random() * (5.0 - 3.5) + 3.5).toFixed(1)
        };
    } catch (e) {
        console.error("Erreur details streamer:", e);
        return null;
    }
}

// =========================================================
// ROUTES API
// =========================================================

// Exemple Firebase : écriture simple dans RTDB
app.get('/firebase_test', async (req, res) => {
    try {
        await rtdb.ref("server_status").set({
            online: true,
            timestamp: Date.now()
        });
        res.json({ message: "Firebase fonctionne ✔" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 1. GAME ID
app.get('/gameid', async (req, res) => {
    const token = await getTwitchAccessToken();
    if (!token) return res.status(500).json({ message: "Erreur Auth Twitch" });

    const id = await getGameId(req.query.name, token);
    if (id) res.json({ game_id: id, name: req.query.name });
    else res.status(404).json({ message: "Jeu non trouvé" });
});

// 2. RANDOM SCAN
app.get('/random', async (req, res) => {
    const token = await getTwitchAccessToken();
    if (!token) return res.status(500).json({ message: "Erreur Auth Twitch" });

    let url = `https://api.twitch.tv/helix/streams?first=100&language=fr`;
    if (req.query.game_id) url += `&game_id=${req.query.game_id}`;

    try {
        const response = await fetch(url, {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        const streams = data.data.filter(s => s.type === 'live' && s.viewer_count > 0);
        if (streams.length === 0) return res.status(404).json({ message: "Aucun stream trouvé" });

        const randomStream = streams[Math.floor(Math.random() * streams.length)];
        const details = await getStreamerDetails(randomStream.user_login, token);
        if (details) res.json({ streamer: details });
        else res.status(404).json({ message: "Erreur détails streamer" });

    } catch {
        res.status(500).json({ message: "Erreur serveur scan" });
    }
});

// 3. DETAILS
app.get('/details', async (req, res) => {
    const token = await getTwitchAccessToken();
    if (!token) return res.status(500).json({ message: "Erreur Auth Twitch" });

    const details = await getStreamerDetails(req.query.login, token);
    if (details) res.json({ streamer: details });
    else res.status(404).json({ message: "Streamer introuvable" });
});

// 4. BOOST
app.post('/boost', (req, res) => {
    console.log(`BOOST: ${req.body.channelName}`);
    res.json({ message: `Boost activé pour ${req.body.channelName}`, status: 'ok' });
});

// 5. IA : critique stream
app.post('/critique_ia', async (req, res) => {
    if (!GEMINI_API_KEY) return res.status(503).json({ critique: "IA désactivée" });
    
    const { username, game_name, title, viewer_count, follower_count } = req.body;
    const prompt = `Agis comme un expert Twitch...`; // Le prompt doit être complété ici avec toutes les infos

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            }
        );

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "Erreur IA";
        res.json({ critique: text });
    } catch {
        res.status(500).json({ critique: "Erreur connexion IA" });
    }
});

// 6. IA : diagnostic titre
app.post('/diagnostic_titre', async (req, res) => {
    if (!GEMINI_API_KEY) return res.status(503).json({ diagnostic: "IA désactivée" });

    const { title, game_name } = req.body;
    const prompt = `Analyse ce titre...`; // Le prompt doit être complété ici avec toutes les infos

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            }
        );

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "Erreur IA";
        res.json({ diagnostic: text });
    } catch {
        res.status(500).json({ diagnostic: "Erreur connexion IA" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Serveur API actif sur le port ${PORT}`);
    getTwitchAccessToken();
});
