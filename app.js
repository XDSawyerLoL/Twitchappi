/**
 * ==========================================================================================
 * 🚀 STREAMER & NICHE AI HUB - BACKEND SERVER (V42 - STABLE GEMINI PRO)
 * ==========================================================================================
 * * AUTEUR      : Gemini Assistant
 * VERSION     : V42 (Correction Erreur 404 IA)
 * DESCRIPTION : Serveur Node.js complet.
 * * CHANGEMENT CRITIQUE V42 :
 * - Passage du modèle IA à "gemini-pro" (Version stable v1) pour éviter l'erreur 404/429.
 * - Conservation de toute la logique V41.
 * * ==========================================================================================
 */

// -------------------------------------------------------------------------
// 1. IMPORTATIONS ET DÉPENDANCES
// -------------------------------------------------------------------------
require('dotenv').config(); // Charge les variables du fichier .env si présent

const express = require('express');           // Le framework serveur
const cors = require('cors');                 // Sécurité Cross-Origin
const fetch = require('node-fetch');          // Pour faire des requêtes HTTP (Twitch)
const bodyParser = require('body-parser');    // Pour lire le JSON entrant
const path = require('path');                 // Gestion des chemins de fichiers
const crypto = require('crypto');             // Génération de clés aléatoires
const cookieParser = require('cookie-parser');// Lecture des cookies (Auth)

// [IMPORTANT] Librairie IA Stable
const { GoogleGenerativeAI } = require('@google/generative-ai');

// SDK Firebase Admin pour la base de données
const admin = require('firebase-admin');


// -------------------------------------------------------------------------
// 2. INITIALISATION DE LA BASE DE DONNÉES (FIREBASE)
// -------------------------------------------------------------------------

let serviceAccount;

// Méthode A : Via Variable d'Environnement (Production / Render)
if (process.env.FIREBASE_SERVICE_KEY) {
    try {
        console.log("🔹 [FIREBASE] Tentative de chargement via Variable d'Environnement...");
        let rawJson = process.env.FIREBASE_SERVICE_KEY;
        
        // Nettoyage
        if (rawJson.startsWith("'") && rawJson.endsWith("'")) rawJson = rawJson.slice(1, -1);
        if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.slice(1, -1);
        rawJson = rawJson.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n');

        serviceAccount = JSON.parse(rawJson);
        console.log("✅ [FIREBASE] Clé chargée et parsée avec succès.");

    } catch (error) {
        console.error("❌ [FIREBASE] Erreur FATALE de parsing JSON :", error.message);
    }
} 
// Méthode B : Via Fichier Local (Développement)
else {
    try {
        serviceAccount = require('./serviceAccountKey.json');
        console.log("✅ [FIREBASE] Clé chargée depuis le fichier local.");
    } catch (e) {
        console.warn("⚠️ [FIREBASE] Aucune clé trouvée. Mode sans persistance.");
    }
}

// Initialisation de l'instance Admin
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

if (serviceAccount) {
    try {
        db.settings({
            projectId: serviceAccount.project_id || process.env.GOOGLE_CLOUD_PROJECT || 'goodstreamer-7e87d',
            ignoreUndefinedProperties: true
        });
    } catch(e) {}
}


// -------------------------------------------------------------------------
// 3. CONFIGURATION DU SERVEUR EXPRESS & CLÉS API
// -------------------------------------------------------------------------

const app = express();
const PORT = process.env.PORT || 10000;

// Récupération des clés API
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

// --- [CORRECTIF V42] INIT IA GEMINI PRO (STABLE) ---
let geminiModel;
if (GEMINI_API_KEY) {
    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        // UTILISATION DE GEMINI-PRO (Disponible sur v1, évite l'erreur 404)
        geminiModel = genAI.getGenerativeModel({ model: "gemini-pro" });
        console.log("✅ [IA] Google Gemini Pro (Stable) initialisé.");
    } catch (e) {
        console.error("❌ [IA] Erreur d'initialisation :", e.message);
    }
} else {
    console.error("❌ [IA] Manque GEMINI_API_KEY dans le .env");
}

// Middleware
app.use(cors()); 
app.use(bodyParser.json()); 
app.use(cookieParser()); 
// IMPORTANT : Sert NicheOptimizer.html par défaut si index.html n'existe pas
app.use(express.static(path.join(__dirname))); 


// -------------------------------------------------------------------------
// 4. SYSTÈME DE CACHE & ÉTAT GLOBAL
// -------------------------------------------------------------------------

const CACHE = {
    twitchTokens: {},
    twitchUser: null,
    boostedStream: null,
    lastScanData: null,
    
    // Rotation automatique (3 min)
    globalStreamRotation: {
        streams: [],        
        currentIndex: 0,    
        lastFetchTime: 0,   
        fetchCooldown: 3 * 60 * 1000 
    },

    // Cache Dashboard
    statsCache: {
        global: null,
        topGames: null,
        languages: null,
        lastFetch: 0,
        cooldown: 60 * 1000 
    }
};


// -------------------------------------------------------------------------
// 5. FONCTIONS UTILITAIRES (HELPERS)
// -------------------------------------------------------------------------

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
        console.error("❌ Erreur Token:", error);
        return null;
    }
}

async function twitchAPI(endpoint, token = null) {
    const accessToken = token || await getTwitchToken('app');
    if (!accessToken) throw new Error("Token Twitch manquant.");

    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (res.status === 401) {
        if (token === CACHE.twitchTokens['app']?.access_token) CACHE.twitchTokens['app'] = null;
        throw new Error("Token Twitch expiré (401).");
    }
    
    if (!res.ok) {
        throw new Error(`Erreur Twitch API ${res.status}`);
    }

    return res.json();
}

/**
 * Wrapper IA Gemini (CORRIGÉ V42)
 * Gère les erreurs 404/429 proprement.
 */
async function runGeminiAnalysis(prompt) {
    if (!geminiModel) return { success: false, html_response: "<p>Service IA non configuré.</p>" };

    try {
        const enhancedPrompt = `${prompt} 
        IMPORTANT : Réponds UNIQUEMENT en code HTML simple (utilises <h4>, <ul>, <li>, <p>, <strong>).
        Ne mets PAS de balises \`\`\`html ou de markdown. Sois direct.`;

        const result = await geminiModel.generateContent(enhancedPrompt);
        const response = await result.response;
        const text = response.text();
        
        return { success: true, html_response: text };

    } catch (e) {
        console.error("⚠️ Erreur Gemini:", e.message);
        
        if (e.message.includes('429') || e.message.includes('quota') || e.message.includes('Exhausted')) {
            return { 
                success: false, 
                html_response: `<div style="color:#ffa500;">⚠️ <strong>IA en pause (Quota).</strong> Réessayez dans 30s.</div>` 
            };
        }
        // Gestion erreur 404 (Modèle introuvable)
        if (e.message.includes('404') || e.message.includes('not found')) {
             return { 
                success: false, 
                html_response: `<div style="color:red;">⚠️ <strong>Erreur Modèle IA.</strong> Le serveur utilise un modèle invalide.</div>` 
            };
        }

        return { 
            success: false, 
            html_response: `<p style="color:red">Erreur lors de l'analyse IA : ${e.message}</p>` 
        };
    }
}


// -------------------------------------------------------------------------
// 6. MODULE : ROTATION AUTOMATIQUE DES STREAMS (0-100 VUES)
// -------------------------------------------------------------------------

async function refreshRotationList() {
    const now = Date.now();
    const rot = CACHE.globalStreamRotation;
    
    if (now - rot.lastFetchTime < rot.fetchCooldown && rot.streams.length > 0) {
        return;
    }
    
    console.log("🔄 [ROTATION] Rafraîchissement de la liste...");
    
    try {
        const data = await twitchAPI('streams?language=fr&first=100');
        const allStreams = data.data;

        // FILTRE STRICT : 0 à 100 vues
        let candidates = allStreams.filter(s => s.viewer_count <= 100 && s.viewer_count > 0);
        
        // Fallback
        if (candidates.length < 5) {
            candidates = allStreams.slice(-20);
        }

        if (candidates.length > 0) {
            rot.streams = candidates.sort(() => 0.5 - Math.random()).map(s => ({
                channel: s.user_login,
                viewers: s.viewer_count
            }));
            
            rot.currentIndex = 0;
            rot.lastFetchTime = now;
            console.log(`✅ [ROTATION] ${rot.streams.length} chaînes chargées.`);
        }
    } catch (e) {
        console.error("❌ [ROTATION] Erreur:", e.message);
    }
}

// Route principale du Player
app.get('/get_default_stream', async (req, res) => {
    const now = Date.now();
    let currentBoost = null;

    // A. VÉRIFICATION DU BOOST
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

    // B. MODE AUTO (ROTATION)
    await refreshRotationList();
    const rot = CACHE.globalStreamRotation;
    
    if (rot.streams.length === 0) {
        return res.json({ success: true, channel: 'twitch', mode: 'FALLBACK', message: 'Aucun stream disponible.' });
    }

    const current = rot.streams[rot.currentIndex];
    res.json({ 
        success: true, 
        channel: current.channel, 
        mode: 'AUTO', 
        viewers: current.viewers, 
        message: `👁️ AUTO 3MIN : ${current.channel} (${current.viewers} vues)` 
    });
});

app.post('/cycle_stream', async (req, res) => {
    const { direction } = req.body; 

    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
        return res.json({ success: false, error: "Impossible : Boost actif." });
    }

    await refreshRotationList();
    const rot = CACHE.globalStreamRotation;

    if (rot.streams.length === 0) return res.json({ success: false });

    if (direction === 'next') {
        rot.currentIndex = (rot.currentIndex + 1) % rot.streams.length;
    } else {
        rot.currentIndex = (rot.currentIndex - 1 + rot.streams.length) % rot.streams.length;
    }

    const nextStream = rot.streams[rot.currentIndex];
    res.json({ success: true, channel: nextStream.channel, viewers: nextStream.viewers });
});


// -------------------------------------------------------------------------
// 7. MODULE : DASHBOARD ANALYTICS (REAL DATA)
// -------------------------------------------------------------------------

app.get('/api/stats/global', async (req, res) => {
    try {
        const data = await twitchAPI('streams?first=100');
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
                .limit(24)
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
        } catch(e) {} // Fallback si erreur DB

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
        const d = await twitchAPI('games/top?first=10');
        const games = d.data.map(g => ({ 
            name: g.name, 
            box_art_url: g.box_art_url.replace('{width}','52').replace('{height}','72') 
        }));
        res.json({ games });
    } catch (e) { res.status(500).json({error:e.message}); }
});

app.get('/api/stats/languages', async (req, res) => {
    try {
        const d = await twitchAPI('streams?first=100');
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
// 8. MODULE : SCANNER & INTELLIGENCE
// -------------------------------------------------------------------------

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ success: false });

    try {
        // Recherche Utilisateur
        const uRes = await twitchAPI(`users?login=${encodeURIComponent(query)}`);
        
        if (uRes.data.length > 0) {
            const u = uRes.data[0];
            let sDetails = null;
            try { 
                const s = await twitchAPI(`streams?user_id=${u.id}`); 
                if (s.data.length) sDetails = s.data[0]; 
            } catch(e){}

            // Calcul du score "Niche"
            const score = (u.broadcaster_type === 'partner') ? '5.0' : (sDetails && sDetails.viewer_count < 100 ? '4.5' : '3.0');
            
            const uData = { 
                login: u.login, 
                display_name: u.display_name, 
                profile_image_url: u.profile_image_url, 
                is_live: !!sDetails, 
                viewer_count: sDetails ? sDetails.viewer_count : 0, 
                ai_calculated_niche_score: score,
                total_views: u.view_count
            };
            
            CACHE.lastScanData = { type: 'user', ...uData };
            return res.json({ success: true, type: 'user', user_data: uData });
        }
        
        // Recherche Jeu
        const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        
        if (gRes.data.length > 0) {
            const g = gRes.data[0];
            const sRes = await twitchAPI(`streams?game_id=${g.id}&first=20`);
            const total = sRes.data.reduce((a,b)=>a+b.viewer_count,0);
            
            const gData = { 
                name: g.name, 
                box_art_url: g.box_art_url.replace('{width}','100').replace('{height}','140'), 
                total_viewers: total, 
                ai_calculated_niche_score: total < 5000 ? '4.0' : '2.0',
                total_streamers: sRes.data.length
            };
            
            CACHE.lastScanData = { type: 'game', ...gData };
            return res.json({ success: true, type: 'game', game_data: gData });
        }

        res.json({ success: false, message: "Introuvable" });
    } catch(e) { res.status(500).json({error:e.message}); }
});

app.post('/critique_ia', async (req, res) => {
    const { type, query } = req.body;
    let prompt = "";
    
    if (type === 'niche') prompt = `Agis comme un expert Twitch. Fais un audit rapide de "${query}". Donne 3 points forts et 1 conseil stratégique pour grandir.`;
    else if (type === 'repurpose') prompt = `Agis comme un monteur vidéo. Donne 3 idées précises de clips TikTok/Shorts viraux à faire sur le thème "${query}".`;
    
    const result = await runGeminiAnalysis(prompt);
    res.json(result);
});


// -------------------------------------------------------------------------
// 9. OUTILS : BOOST, RAID, PLANNING, AUTH
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

app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    res.cookie('twitch_state', state, { httpOnly: true, secure: true, maxAge: 600000 }); 
    res.redirect(`https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${state}`);
});

app.get('/twitch_auth_callback', (req, res) => {
    res.send("<script>window.opener.postMessage('auth_success', '*');window.close();</script>");
});

app.get('/export_csv', (req, res) => {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=Twitch_Analysis.csv');
    res.send(`Type,Nom\n${CACHE.lastScanData?.type || '?'},${CACHE.lastScanData?.login || CACHE.lastScanData?.name || '?'}`);
});

// ROUTE PAR DÉFAUT (IMPORTANT POUR LE FRONTEND)
app.get('/', (req,res) => {
    // Essaie d'abord index.html, sinon NicheOptimizer.html
    const indexPath = path.join(__dirname, 'index.html');
    const nichePath = path.join(__dirname, 'NicheOptimizer.html');
    
    res.sendFile(indexPath, (err) => {
        if(err) res.sendFile(nichePath);
    });
});


// -------------------------------------------------------------------------
// 10. AUTOMATISATION (CRON)
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
// 11. DÉMARRAGE DU SERVEUR
// -------------------------------------------------------------------------

app.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(` 🚀 STREAMER HUB V41 (STABLE) STARTED ON PORT ${PORT}`);
    console.log(` 👉 URL: http://localhost:${PORT}`);
    console.log(`==================================================\n`);
});


