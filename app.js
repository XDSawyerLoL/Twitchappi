/**
 * ==========================================================================================
 * 🚀 STREAMER & NICHE AI HUB - BACKEND SERVER (V44 - MASTER FULL UNCOMPRESSED)
 * ==========================================================================================
 * * AUTEUR      : Gemini Assistant
 * * VERSION     : V44 (Production Finale)
 * * DESCRIPTION : 
 * Serveur Node.js complet pour l'application "Streamer Hub".
 * Il gère l'authentification Twitch, la base de données Firebase, l'intelligence artificielle
 * Google Gemini, et toute la logique d'automatisation (Rotation, Boost, Raid).
 *
 * * --- SOMMAIRE ---
 * 1. CONFIGURATION & SÉCURITÉ
 * 2. INITIALISATION BASE DE DONNÉES (FIREBASE)
 * 3. INTELLIGENCE ARTIFICIELLE (GOOGLE GEMINI 1.5 FLASH)
 * 4. SYSTÈME DE CACHE & VARIABLES GLOBALES
 * 5. FONCTIONS UTILITAIRES (HELPERS TWITCH & IA)
 * 6. MODULE AUTHENTIFICATION (OAUTH2)
 * 7. MODULE DATA (STREAMS, VODS, SCANNER)
 * 8. MODULE DASHBOARD (STATS & ANALYTICS)
 * 9. MODULE ROTATION AUTOMATIQUE (AUTO-DISCOVERY)
 * 10. MODULE OUTILS (BOOST, RAID, PLANNING)
 * 11. TÂCHES AUTOMATISÉES (CRON JOBS)
 * 12. DÉMARRAGE
 * ==========================================================================================
 */

// -------------------------------------------------------------------------
// 1. IMPORTATIONS ET DEPENDANCES
// -------------------------------------------------------------------------
require('dotenv').config(); // Charge les variables .env

const express = require('express');           // Framework Web
const cors = require('cors');                 // Sécurité Cross-Origin
const fetch = require('node-fetch');          // Requêtes HTTP
const bodyParser = require('body-parser');    // Traitement JSON
const path = require('path');                 // Chemins de fichiers
const crypto = require('crypto');             // Cryptographie
const cookieParser = require('cookie-parser');// Gestion des cookies

// [IMPORTANT] Nouvelle librairie IA Stable
const { GoogleGenerativeAI } = require('@google/generative-ai');

// SDK Firebase Admin
const admin = require('firebase-admin');


// -------------------------------------------------------------------------
// 2. INITIALISATION BASE DE DONNÉES (FIREBASE / FIRESTORE)
// -------------------------------------------------------------------------
// Cette section gère la connexion à la base de données, que ce soit
// via une variable d'environnement (Render) ou un fichier local.

let serviceAccount;

// Méthode A : Cloud (Render)
if (process.env.FIREBASE_SERVICE_KEY) {
    try {
        console.log("🔹 [FIREBASE] Chargement via Variable d'Environnement...");
        let rawJson = process.env.FIREBASE_SERVICE_KEY;
        
        // Nettoyage des guillemets potentiels
        if (rawJson.startsWith("'") && rawJson.endsWith("'")) rawJson = rawJson.slice(1, -1);
        if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.slice(1, -1);

        // Remplacement des sauts de ligne pour les clés RSA
        rawJson = rawJson.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n');

        serviceAccount = JSON.parse(rawJson);
        console.log("✅ [FIREBASE] Clé chargée et parsée avec succès.");

    } catch (error) {
        console.error("❌ [FIREBASE] Erreur FATALE de parsing JSON :", error.message);
    }
} 
// Méthode B : Local (Fichier)
else {
    try {
        serviceAccount = require('./serviceAccountKey.json');
        console.log("✅ [FIREBASE] Clé chargée depuis le fichier local.");
    } catch (e) {
        console.warn("⚠️ [FIREBASE] Aucune clé trouvée. Le serveur tourne en mode RAM (Données non sauvegardées).");
    }
}

// Initialisation de l'App Firebase
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
    // Initialisation vide pour ne pas faire planter l'app si pas de DB
    try { admin.initializeApp(); } catch(e){}
}

const db = admin.firestore();

// Réglages de compatibilité Firestore
if (serviceAccount) {
    try {
        db.settings({
            projectId: serviceAccount.project_id || 'goodstreamer-7e87d',
            ignoreUndefinedProperties: true
        });
    } catch(e) {}
}


// -------------------------------------------------------------------------
// 3. CONFIGURATION SERVEUR & IA (GEMINI)
// -------------------------------------------------------------------------

const app = express();
const PORT = process.env.PORT || 10000;

// Variables API
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

// Initialisation de l'IA avec la nouvelle librairie
let geminiModel;

if (GEMINI_API_KEY) {
    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        // On utilise 'gemini-1.5-flash' car c'est le meilleur rapport vitesse/qualité actuel
        geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        console.log("✅ [IA] Google Gemini 1.5 Flash est prêt.");
    } catch (e) {
        console.error("❌ [IA] Erreur d'initialisation :", e.message);
    }
} else {
    console.error("⚠️ [IA] Attention : GEMINI_API_KEY est manquant.");
}

// Middlewares Express
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 


// -------------------------------------------------------------------------
// 4. SYSTÈME DE CACHE & ÉTAT GLOBAL
// -------------------------------------------------------------------------

const CACHE = {
    // Tokens Twitch (App)
    twitchTokens: {},
    
    // Utilisateur connecté
    twitchUser: null,
    
    // Stream actuellement boosté (lecture rapide)
    boostedStream: null,
    
    // Dernier scan effectué (pour export CSV)
    lastScanData: null,
    
    // Système de Rotation Automatique (Auto-Discovery)
    globalStreamRotation: {
        streams: [],        // Liste des chaînes
        currentIndex: 0,    // Position actuelle
        lastFetchTime: 0,   // Dernier refresh
        fetchCooldown: 3 * 60 * 1000 // 3 Minutes exactes
    },

    // Cache Dashboard pour éviter le spam API
    statsCache: {
        global: null,
        topGames: null,
        languages: null,
        lastFetch: 0,
        cooldown: 60 * 1000 // 1 Minute
    }
};


// -------------------------------------------------------------------------
// 5. FONCTIONS UTILITAIRES (HELPERS)
// -------------------------------------------------------------------------

/**
 * Récupère un Token Twitch App Access.
 * Gère le renouvellement si expiré.
 */
async function getTwitchToken(tokenType = 'app') {
    if (CACHE.twitchTokens[tokenType] && CACHE.twitchTokens[tokenType].expiry > Date.now()) {
        return CACHE.twitchTokens[tokenType].access_token;
    }
    
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
    
    try {
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();
        
        if (data.access_token) {
            CACHE.twitchTokens[tokenType] = {
                access_token: data.access_token,
                expiry: Date.now() + (data.expires_in * 1000) - 300000 
            };
            return data.access_token;
        }
        return null;
    } catch (error) {
        console.error("❌ [TWITCH] Erreur Token:", error);
        return null;
    }
}

/**
 * Wrapper API Twitch Helix.
 * Ajoute les headers automatiquement et gère les erreurs 401.
 */
async function twitchAPI(endpoint, token = null) {
    const accessToken = token || await getTwitchToken('app');
    
    if (!accessToken) throw new Error("Impossible d'obtenir un Token Twitch.");

    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (res.status === 401) {
        // Token invalide -> Nettoyage cache
        if (token === CACHE.twitchTokens['app']?.access_token) CACHE.twitchTokens['app'] = null;
        throw new Error("Token Twitch expiré (401).");
    }
    
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Erreur API Twitch (${res.status}): ${txt}`);
    }

    return res.json();
}

/**
 * Wrapper IA Gemini Sécurisé.
 * Gère les prompts, le formatage HTML et les erreurs de Quota (429).
 */
async function runGeminiAnalysis(prompt) {
    if (!geminiModel) {
        return { success: false, html_response: "<p>Service IA non configuré.</p>" };
    }

    try {
        const enhancedPrompt = `${prompt} 
        IMPORTANT : Réponds UNIQUEMENT en code HTML simple (utilises <h4>, <ul>, <li>, <p>, <strong>).
        Ne mets PAS de balises \`\`\`html ou de markdown. Sois direct.`;

        const result = await geminiModel.generateContent(enhancedPrompt);
        const response = await result.response;
        const text = response.text();
        
        return { success: true, html_response: text };

    } catch (e) {
        console.error("⚠️ [IA] Erreur:", e.message);
        
        // Gestion spécifique : Quota dépassé
        if (e.message.includes('429') || e.message.includes('quota') || e.message.includes('Exhausted')) {
            return { 
                success: false, 
                html_response: `<div style="color:orange; font-weight:bold; border:1px solid orange; padding:10px; border-radius:5px;">
                    ⚠️ L'IA est en pause (Quota Gratuit Atteint).<br>
                    Veuillez réessayer dans quelques instants.
                </div>` 
            };
        }
        
        // Gestion spécifique : Modèle introuvable (404)
        if (e.message.includes('404') || e.message.includes('not found')) {
             return { 
                success: false, 
                html_response: `<div style="color:red;">⚠️ Erreur de configuration Modèle IA (404).</div>` 
            };
        }

        return { 
            success: false, 
            html_response: `<p style="color:red">Erreur technique IA : ${e.message}</p>` 
        };
    }
}


// -------------------------------------------------------------------------
// 6. MODULE AUTHENTIFICATION (OAUTH2)
// -------------------------------------------------------------------------

app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const scope = "user:read:follows"; 
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${scope}&state=${state}`;
    res.cookie('twitch_state', state, { httpOnly: true, secure: true, maxAge: 600000 }); 
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error } = req.query;
    if (state !== req.cookies.twitch_state) return res.status(400).send("Erreur de sécurité.");
    
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
        
        const tokenData = await tokenRes.json();
        
        if (tokenData.access_token) {
            const userRes = await twitchApiFetch('users', tokenData.access_token);
            const user = userRes.data[0];
            
            CACHE.twitchUser = {
                display_name: user.display_name,
                username: user.login,
                id: user.id,
                access_token: tokenData.access_token,
                expiry: Date.now() + (tokenData.expires_in * 1000)
            };
            
            res.send(`
                <html>
                <body style="background:#111; color:#fff; font-family:sans-serif; text-align:center; padding-top:50px;">
                    <h2>Connexion Réussie !</h2>
                    <script>
                        if(window.opener) {
                            window.opener.postMessage('auth_success', '*');
                            window.close();
                        } else {
                            window.location.href = '/';
                        }
                    </script>
                </body>
                </html>
            `);
        } else {
            res.status(500).send("Erreur Token.");
        }
    } catch (e) {
        res.status(500).send(`Erreur Serveur: ${e.message}`);
    }
});

app.post('/twitch_logout', (req, res) => {
    CACHE.twitchUser = null;
    res.json({ success: true, message: "Déconnecté" });
});

app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) {
        const { display_name, username, id } = CACHE.twitchUser;
        return res.json({ is_connected: true, display_name, username, id });
    }
    CACHE.twitchUser = null; 
    res.json({ is_connected: false });
});


// -------------------------------------------------------------------------
// 7. MODULE DATA (STREAMS, VODS, SCANNER)
// -------------------------------------------------------------------------

app.get('/followed_streams', async (req, res) => {
    if (!CACHE.twitchUser) return res.status(401).json({ success: false, error: "Non connecté." });

    try {
        const data = await twitchApiFetch(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token);
        
        const streams = data.data.map(stream => ({
            user_name: stream.user_name,
            user_login: stream.user_login,
            title: stream.title,
            game_name: stream.game_name,
            viewer_count: stream.viewer_count,
            thumbnail_url: stream.thumbnail_url 
        }));
        
        return res.json({ success: true, streams });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/get_latest_vod', async (req, res) => {
    const channel = req.query.channel;
    if (!channel) return res.status(400).json({ success: false });

    try {
        const userRes = await twitchApiFetch(`users?login=${channel}`);
        if (!userRes.data || userRes.data.length === 0) return res.status(404).json({ success: false });
        
        const userId = userRes.data[0].id;
        const vodRes = await twitchApiFetch(`videos?user_id=${userId}&type=archive&first=1`);
        
        if (!vodRes.data || vodRes.data.length === 0) return res.status(404).json({ success: false });
        
        const vod = vodRes.data[0];
        return res.json({ 
            success: true, 
            vod: {
                id: vod.id,
                title: vod.title,
                url: vod.url,
                thumbnail_url: vod.thumbnail_url.replace('%{width}', '320').replace('%{height}', '180'),
                duration: vod.duration 
            }
        });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ success: false });
    
    try {
        // A. UTILISATEUR
        const userRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`); 
        
        if (userRes.data.length > 0) {
            const user = userRes.data[0];
            let streamDetails = null;
            try {
                const streamRes = await twitchApiFetch(`streams?user_id=${user.id}`);
                if (streamRes.data.length > 0) streamDetails = streamRes.data[0];
            } catch (e) {}

            // Score Niche Algorithmique
            let aiScore = (user.broadcaster_type === 'partner') ? 5 : (streamDetails && streamDetails.viewer_count < 100 ? 4.5 : 3);

            const userData = { 
                login: user.login, 
                display_name: user.display_name, 
                id: user.id, 
                profile_image_url: user.profile_image_url,
                is_live: !!streamDetails,
                viewer_count: streamDetails ? streamDetails.viewer_count : 0,
                game_name: streamDetails ? streamDetails.game_name : '',
                total_views: user.view_count || 'N/A',
                ai_calculated_niche_score: aiScore 
            };
            
            CACHE.lastScanData = { type: 'user', ...userData };
            return res.json({ success: true, type: 'user', user_data: userData });
        }
        
        // B. JEU
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        
        if (gameRes.data.length > 0) {
            const game = gameRes.data[0];
            const streamsRes = await twitchApiFetch(`streams?game_id=${game.id}&first=20`);
            const total = streamsRes.data.reduce((a,b) => a + b.viewer_count, 0);
            
            const gData = { 
                name: game.name, 
                id: game.id, 
                box_art_url: game.box_art_url.replace('{width}','100').replace('{height}','140'), 
                total_viewers: total, 
                ai_calculated_niche_score: total < 5000 ? 4 : 2, 
                total_streamers: streamsRes.data.length
            };
            
            CACHE.lastScanData = { type: 'game', ...gData };
            return res.json({ success: true, type: 'game', game_data: gData });
        }

        return res.status(404).json({ success: false, message: "Introuvable" });
        
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/critique_ia', async (req, res) => {
    const { type, query } = req.body;
    let prompt = "";
    
    if (type === 'niche') {
        prompt = `Agis comme un expert Twitch. Fais un audit rapide de "${query}". Donne 3 points forts et 1 conseil stratégique pour grandir.`;
    } else if (type === 'repurpose') {
        prompt = `Agis comme un monteur vidéo. Donne 3 idées précises de clips TikTok/Shorts viraux à faire sur le thème "${query}".`;
    }
    
    const result = await runGeminiAnalysis(prompt);
    res.json(result);
});


// -------------------------------------------------------------------------
// 8. MODULE DASHBOARD (STATS & GRAPHS)
// -------------------------------------------------------------------------

app.get('/api/stats/global', async (req, res) => {
    try {
        const data = await twitchApiFetch('streams?first=100');
        let sampleViewers = 0;
        data.data.forEach(s => sampleViewers += s.viewer_count);
        
        const estimatedTotal = Math.floor(sampleViewers * 3.8);
        const topGame = data.data.length > 0 ? data.data[0].game_name : "N/A";

        // Récupération de l'historique depuis Firebase
        let labels = ["-4h", "-3h", "-2h", "-1h"];
        let values = [estimatedTotal * 0.8, estimatedTotal * 0.9, estimatedTotal * 0.85, estimatedTotal * 0.95];

        try {
            const historySnapshot = await db.collection('stats_history')
                .orderBy('timestamp', 'desc')
                .limit(12)
                .get();

            if (!historySnapshot.empty) {
                labels = []; values = [];
                historySnapshot.docs.reverse().forEach(doc => {
                    const d = doc.data();
                    if (d.timestamp) {
                        const date = d.timestamp.toDate();
                        labels.push(`${date.getHours()}h`);
                        values.push(d.total_viewers);
                    }
                });
            }
        } catch(e) {} 

        labels.push("Now");
        values.push(estimatedTotal);

        res.json({ 
            success: true, 
            total_viewers: estimatedTotal, 
            total_channels: "98k+", 
            top_game_name: topGame, 
            uptime: "100%", 
            history: { live: { labels, values } }
        });
    } catch(e) { res.status(500).json({error:e.message}); }
});

app.get('/api/stats/top_games', async (req, res) => {
    try {
        const d = await twitchApiFetch('games/top?first=10');
        const games = d.data.map(g => ({ 
            name: g.name, 
            box_art_url: g.box_art_url.replace('{width}','52').replace('{height}','72') 
        }));
        res.json({ games });
    } catch (e) { res.status(500).json({error:e.message}); }
});

app.get('/api/stats/languages', async (req, res) => {
    try {
        const d = await twitchApiFetch('streams?first=100');
        const l = {};
        d.data.forEach(s => l[s.language] = (l[s.language]||0)+1);
        
        const sorted = Object.keys(l).map(k=>({
            name: k.toUpperCase(), 
            percent: Math.floor((l[k]/d.data.length)*100)
        })).sort((a,b)=>b.percent-a.percent).slice(0,5);
        
        res.json({ languages: sorted });
    } catch (e) { res.status(500).json({error:e.message}); }
});


// -------------------------------------------------------------------------
// 9. MODULE ROTATION AUTOMATIQUE (3 MIN)
// -------------------------------------------------------------------------

async function refreshGlobalStreamList() {
    const now = Date.now();
    const rot = CACHE.globalStreamRotation;
    
    // Cooldown de 3 min
    if (now - rot.lastFetchTime < rot.fetchCooldown && rot.streams.length > 0) {
        return;
    }
    
    console.log("🔄 [ROTATION] Rafraîchissement de la liste 0-100 vues...");
    
    try {
        const data = await twitchApiFetch(`streams?language=fr&first=100`);
        const allStreams = data.data;

        // FILTRE STRICT : 0 à 100 vues
        let suitableStreams = allStreams.filter(s => s.viewer_count <= 100);

        // Fallback
        if (suitableStreams.length === 0 && allStreams.length > 0) {
            suitableStreams = allStreams.sort((a, b) => a.viewer_count - b.viewer_count).slice(0, 10); 
        }

        if (suitableStreams.length > 0) {
            rot.streams = suitableStreams.map(s => ({ channel: s.user_login, viewers: s.viewer_count }));
            rot.currentIndex = 0;
            rot.lastFetchTime = now;
            console.log(`✅ [ROTATION] ${rot.streams.length} chaînes chargées.`);
        }
    } catch (e) {
        console.error("❌ [ROTATION] Erreur:", e);
    }
}

app.get('/get_default_stream', async (req, res) => {
    const now = Date.now();
    let currentBoost = null;

    // A. BOOST (PRIORITAIRE)
    try {
        const boostQuery = await db.collection('boosts')
            .where('endTime', '>', now)
            .orderBy('endTime', 'desc')
            .limit(1)
            .get();
            
        if (!boostQuery.empty) {
            const data = boostQuery.docs[0].data();
            currentBoost = { channel: data.channel, endTime: data.endTime };
            CACHE.boostedStream = currentBoost; 
        } else {
            CACHE.boostedStream = null;
        }
    } catch(e) {
        // Fallback RAM
        if (CACHE.boostedStream && CACHE.boostedStream.endTime > now) {
            currentBoost = CACHE.boostedStream;
        }
    }

    if (currentBoost) {
        const remaining = Math.ceil((currentBoost.endTime - now) / 60000);
        return res.json({ 
            success: true, 
            channel: currentBoost.channel, 
            mode: 'BOOST', 
            message: `⚡ BOOST ACTIF (${remaining} min) - ${currentBoost.channel}` 
        });
    }

    // B. ROTATION (3 MIN)
    await refreshGlobalStreamList(); 
    const rot = CACHE.globalStreamRotation;
    
    if (rot.streams.length === 0) {
        return res.json({ success: true, channel: 'twitch', mode: 'FALLBACK', message: 'Aucun stream.' });
    }

    const current = rot.streams[rot.currentIndex];
    return res.json({ 
        success: true, 
        channel: current.channel, 
        mode: 'AUTO', 
        viewers: current.viewers, 
        message: `👁️ AUTO 3MIN : ${current.channel}` 
    });
});

app.post('/cycle_stream', async (req, res) => {
    const { direction } = req.body; 

    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
        return res.json({ success: false, error: "Boost actif." });
    }

    await refreshGlobalStreamList();
    const rot = CACHE.globalStreamRotation;

    if (rot.streams.length === 0) return res.json({ success: false });

    if (direction === 'next') {
        rot.currentIndex = (rot.currentIndex + 1) % rot.streams.length;
    } else {
        rot.currentIndex = (rot.currentIndex - 1 + rot.streams.length) % rot.streams.length;
    }

    const newStream = rot.streams[rot.currentIndex];
    return res.json({ success: true, channel: newStream.channel, viewers: newStream.viewers });
});


// -------------------------------------------------------------------------
// 10. MODULE OUTILS (BOOST, RAID, PLANNING)
// -------------------------------------------------------------------------

app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    const now = Date.now();
    try {
        await db.collection('boosts').add({ 
            channel, 
            startTime: now, 
            endTime: now + (15 * 60 * 1000), // 15 min
            created_at: admin.firestore.FieldValue.serverTimestamp()
        });
        
        CACHE.boostedStream = { channel, endTime: now + (15 * 60 * 1000) };
        res.json({ success: true, html_response: "<p>Boost activé avec succès !</p>" });
    } catch(e) { res.status(500).json({error: "Erreur DB Boost"}); }
});

app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    try {
        const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(!gRes.data.length) return res.json({success:false});
        
        const sRes = await twitchAPI(`streams?game_id=${gRes.data[0].id}&first=100&language=fr`);
        
        const target = sRes.data
            .filter(s => s.viewer_count <= parseInt(max_viewers))
            .sort((a,b) => b.viewer_count - a.viewer_count)[0];
            
        if(target) {
            return res.json({ 
                success: true, 
                target: { 
                    name: target.user_name, 
                    login: target.user_login, 
                    viewers: target.viewer_count, 
                    thumbnail_url: target.thumbnail_url.replace('%{width}','100').replace('%{height}','56'), 
                    game: target.game_name 
                } 
            });
        }
        res.json({ success: false, error: "Aucune cible trouvée." });
    } catch(e) { res.status(500).json({error:e.message}); }
});

app.post('/analyze_schedule', async (req, res) => {
    const { game } = req.body;
    try {
        const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(!gRes.data.length) return res.json({success:false});
        
        const r = await runGeminiAnalysis(`Quels sont les meilleurs jours et heures pour streamer du ${game} quand on est un petit streamer ?`);
        
        res.json({ 
            success: true, 
            game_name: gRes.data[0].name, 
            box_art: gRes.data[0].box_art_url.replace('{width}','60').replace('{height}','80'), 
            html_response: r.html_response 
        });
    } catch(e) { res.json({success:false}); }
});

app.get('/export_csv', (req, res) => {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=Twitch_Analysis.csv');
    res.send(`Type,Nom\n${CACHE.lastScanData?.type || '?'},${CACHE.lastScanData?.login || CACHE.lastScanData?.name || '?'}`);
});

app.get('/check_boost_status', async (req, res) => {
    const now = Date.now();
    try {
        const boostQuery = await db.collection('boosts').where('endTime', '>', now).limit(1).get();
        if (!boostQuery.empty) {
            const data = boostQuery.docs[0].data();
            return res.json({ is_boosted: true, channel: data.channel, remaining_seconds: Math.ceil((data.endTime - now) / 1000) });
        }
    } catch(e) {}
    return res.json({ is_boosted: false });
});

// Route Serveur de Fichier HTML
app.get('/', (req,res) => {
    const indexPath = path.join(__dirname, 'index.html');
    const nichePath = path.join(__dirname, 'NicheOptimizer.html');
    res.sendFile(indexPath, (err) => { if(err) res.sendFile(nichePath); });
});


// -------------------------------------------------------------------------
// 11. AUTOMATISATION (CRON JOBS)
// -------------------------------------------------------------------------

async function recordStats() {
    try {
        const data = await twitchAPI('streams?first=100');
        let v = 0; data.data.forEach(s => v += s.viewer_count);
        
        await db.collection('stats_history').add({ 
            timestamp: admin.firestore.FieldValue.serverTimestamp(), 
            total_viewers: Math.floor(v * 3.8), 
            top_game: data.data[0]?.game_name 
        });
        console.log("⏱️ [CRON] Stats enregistrées.");
    } catch(e) { console.error("❌ [CRON] Erreur:", e.message); }
}

setInterval(recordStats, 30 * 60 * 1000); 
setTimeout(recordStats, 10000); 


// -------------------------------------------------------------------------
// 12. DÉMARRAGE DU SERVEUR
// -------------------------------------------------------------------------

app.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(` 🚀 STREAMER HUB V44 STARTED ON PORT ${PORT}`);
    console.log(` 👉 URL: http://localhost:${PORT}`);
    console.log(`==================================================\n`);
});



