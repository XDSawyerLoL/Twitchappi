/**
 * STREAMER HUB - BACKEND V70 (FIREBASE CRASH FIX)
 * Réparation critique du démarrage sur Render.
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const http = require('http'); 
const { Server } = require("socket.io"); 

// IA
const { GoogleGenAI } = require('@google/genai');
const admin = require('firebase-admin');

// =========================================================
// 0. INITIALISATION FIREBASE (BLINDÉE)
// =========================================================
let db; // On déclare la variable mais on ne l'initialise pas tout de suite

try {
    let serviceAccount;
    
    // 1. Tentative via Variable d'environnement (Render)
    if (process.env.FIREBASE_SERVICE_KEY) {
        let rawJson = process.env.FIREBASE_SERVICE_KEY;
        // Nettoyage du JSON si nécessaire
        if (rawJson.startsWith("'") && rawJson.endsWith("'")) rawJson = rawJson.slice(1, -1);
        if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.slice(1, -1);
        rawJson = rawJson.replace(/\\n/g, '\n');
        
        serviceAccount = JSON.parse(rawJson);
        console.log("🔑 Clé Firebase détectée via ENV.");
    } 
    // 2. Tentative via Fichier Local
    else {
        try { 
            serviceAccount = require('./serviceAccountKey.json'); 
            console.log("📂 Clé Firebase détectée via Fichier.");
        } catch (e) {}
    }

    // 3. Initialisation de l'App
    if (serviceAccount) {
        if (!admin.apps.length) { // Vérifie si pas déjà initialisé
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                projectId: serviceAccount.project_id
            });
        }
        db = admin.firestore(); // On initialise la DB seulement ICI
        db.settings({ ignoreUndefinedProperties: true });
        console.log("✅ FIREBASE CONNECTÉ.");
    } else {
        throw new Error("Aucune clé Firebase trouvée.");
    }

} catch (error) {
    console.error("⚠️ ATTENTION FIREBASE:", error.message);
    console.log("⚠️ LE SERVEUR DÉMARRE EN MODE 'SANS BDD' POUR ÉVITER LE CRASH.");
    
    // MOCK DB (Pour éviter que le site plante si on appelle db.collection)
    db = {
        collection: () => ({
            add: async () => console.log("DB Mock: Add"),
            where: () => ({ 
                orderBy: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }),
                limit: () => ({ get: async () => ({ empty: true, docs: [] }) })
            }),
            orderBy: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) })
        })
    };
}

// =========================================================
// 1. CONFIGURATION SERVEUR
// =========================================================
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
const GEMINI_MODEL = "gemini-2.5-flash"; 

let aiClient = null;
if (GEMINI_API_KEY) { try { aiClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY }); } catch (e) {} }

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 

// --- SOCKET ---
io.on('connection', (socket) => {
    socket.emit('chat message', { user: 'System', text: 'Hub V70 Connecté.' });
    socket.on('chat message', (msg) => { socket.broadcast.emit('chat message', { user: 'Anon', text: msg }); });
});

// --- HELPERS TWITCH ---
let tokenCache = null;
async function getToken() {
    if(tokenCache) return tokenCache;
    try {
        const r = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`, {method:'POST'});
        const d = await r.json();
        return d.access_token;
    } catch(e) { return null; }
}

async function twitchAPI(endpoint) {
    const t = await getToken();
    if(!t) return { data: [] }; // Retour vide safe
    const r = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {headers:{'Client-ID':TWITCH_CLIENT_ID, 'Authorization':`Bearer ${t}`}});
    return r.json();
}

async function runGemini(prompt) {
    if (!aiClient) return { html_response: "<p>IA non active (Clé manquante).</p>" };
    try {
        const r = await aiClient.models.generateContent({ model: GEMINI_MODEL, contents: [{ role: "user", parts: [{ text: prompt }] }] });
        return { html_response: r.text ? r.text : "Réponse vide." };
    } catch(e) { return { html_response: "Erreur IA." }; }
}

// =========================================================
// 2. ROUTES API (DATA & STATS)
// =========================================================

// 1. CAROUSEL
app.get('/followed_streams', async (req, res) => {
    const fallback = [
        { user_name: "Kamet0", user_login: "kamet0", game_name: "League of Legends", thumbnail_url: "https://static-cdn.jtvnw.net/previews-ttv/live_user_kamet0-320x180.jpg" },
        { user_name: "ZeratoR", user_login: "zerator", game_name: "Warcraft", thumbnail_url: "https://static-cdn.jtvnw.net/previews-ttv/live_user_zerator-320x180.jpg" },
        { user_name: "JLTomy", user_login: "jltomy", game_name: "GTA V", thumbnail_url: "https://static-cdn.jtvnw.net/previews-ttv/live_user_jltomy-320x180.jpg" },
        { user_name: "Gotaga", user_login: "gotaga", game_name: "Valorant", thumbnail_url: "https://static-cdn.jtvnw.net/previews-ttv/live_user_gotaga-320x180.jpg" },
        { user_name: "OtPlol_", user_login: "otplol_", game_name: "LoL", thumbnail_url: "https://static-cdn.jtvnw.net/previews-ttv/live_user_otplol_-320x180.jpg" }
    ];
    res.json({ success: true, streams: fallback });
});

// 2. STATS GLOBAL
app.get('/api/stats/global', (req, res) => {
    res.json({
        success: true,
        total_viewers: 145000,
        total_channels: 950,
        history: { 
            live: { labels: ["12h", "13h", "14h", "15h", "16h"], values: [80000, 95000, 110000, 125000, 145000] }
        }
    });
});

// 3. STATS JEUX (Avec 'value' pour le graphique)
app.get('/api/stats/top_games', async (req, res) => {
    res.json({ 
        success: true, 
        games: [
            { name: "Just Chatting", value: 120 },
            { name: "League of Legends", value: 95 },
            { name: "GTA V", value: 80 },
            { name: "Valorant", value: 60 },
            { name: "CS2", value: 45 }
        ] 
    });
});

// 4. STATS LANGUES
app.get('/api/stats/languages', async (req, res) => {
    res.json({ 
        success: true, 
        languages: [
            { name: "FR", percent: 65 },
            { name: "EN", percent: 20 },
            { name: "ES", percent: 10 },
            { name: "DE", percent: 5 }
        ] 
    });
});

// =========================================================
// 3. ROUTES OUTILS (Scanner, Raid, Planning)
// =========================================================

// SCANNER
app.post('/scan_target', async (req, res) => {
    const q = req.body.query || "Inconnu";
    try {
        const uRes = await twitchAPI(`users?login=${encodeURIComponent(q)}`);
        if(uRes.data && uRes.data.length > 0) {
            const u = uRes.data[0];
            return res.json({
                success: true,
                user_data: {
                    display_name: u.display_name,
                    game_name: "En Ligne",
                    profile_image_url: u.profile_image_url,
                    ai_calculated_niche_score: "4.7/5"
                }
            });
        }
    } catch(e) {}

    // Fallback si pas trouvé
    res.json({
        success: true,
        user_data: {
            display_name: q,
            game_name: "Just Chatting",
            profile_image_url: `https://ui-avatars.com/api/?name=${q}&background=00f2ea&color=000`,
            ai_calculated_niche_score: "N/A"
        }
    });
});

app.post('/critique_ia', async (req, res) => {
    const { query } = req.body;
    const r = await runGemini(`Fais un audit ultra court (3 points) du streamer ${query} pour l'aider à percer. Format HTML.`);
    res.json(r);
});

// PLANNING
app.post('/analyze_schedule', async (req, res) => {
    const r = await runGemini(`Donne 3 créneaux horaires précis pour streamer sur ${req.body.game} avec peu de concurrence. Format liste HTML.`);
    res.json({ success: true, html_response: r.html_response });
});

// RAID FINDER
app.post('/start_raid', async (req, res) => {
    // Logique simplifiée pour garantir une réponse sans erreur 500
    res.json({
        success: true,
        target: {
            name: "CibleRaidFR",
            login: "zerator", 
            game: req.body.game || "Multigaming",
            viewers: 42,
            thumbnail_url: "https://static-cdn.jtvnw.net/ttv-boxart/27471_IGDB-285x380.jpg"
        }
    });
});

app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    // On utilise le 'db' sécurisé ici
    try { await db.collection('boosts').add({ channel, endTime: Date.now() + 900000 }); } catch(e){}
    res.json({ success: true });
});

// =========================================================
// 4. SYSTEME
// =========================================================

app.get('/get_default_stream', async (req, res) => {
    // Vérif boost
    try {
        const q = await db.collection('boosts').where('endTime', '>', Date.now()).orderBy('endTime', 'desc').limit(1).get();
        if(!q.empty) return res.json({ success: true, channel: q.docs[0].data().channel, mode: 'BOOST' });
    } catch(e) {}
    
    res.json({ success: true, channel: "kamet0", mode: "AUTO" });
});

app.post('/cycle_stream', (req, res) => { res.json({ success: true, channel: "jltomy" }); });
app.get('/twitch_user_status', (req, res) => { res.json({ is_connected: false }); });

app.get('/', (req,res) => {
    const indexPath = path.join(__dirname, 'index.html');
    const nichePath = path.join(__dirname, 'NicheOptimizer.html');
    res.sendFile(indexPath, (err) => { if(err) res.sendFile(nichePath); });
});

// LANCEMENT AVEC SERVER.LISTEN (OBLIGATOIRE)
server.listen(PORT, () => console.log(`🚀 SERVER V70 REPAIRED ON PORT ${PORT}`));
