/**
 * ====================================================================================
 * STREAMER & NICHE AI HUB - BACKEND (V32 - ULTIMATE PRODUCTION)
 * ====================================================================================
 * * DESCRIPTION :
 * Serveur Node.js/Express complet gérant l'agrégation de données Twitch, 
 * l'analyse par l'IA Gemini et la persistance des données via Firebase Firestore.
 * * * MODULES INCLUS :
 * 1. AUTHENTIFICATION : OAuth2 Twitch complet avec gestion de session.
 * 2. MARKET DATA : Système "TwitchTracker" (Viewers, Channels, Watch Time, etc.).
 * 3. DATA WAREHOUSE : Historique des scans pour calcul de tendances (Bourse).
 * 4. IA COACH : Analyse stratégique concise (Notation 5 étoiles, Verdict).
 * 5. SMART PLANNING : Analyse de saturation pour optimiser les horaires.
 * 6. RAID FINDER : Recherche de cibles avec récupération Avatar + Miniature.
 * 7. LECTEUR : Rotation cyclique (Filtre strict < 100 vues) et Boost prioritaire.
 * ====================================================================================
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { GoogleGenAI } = require('@google/genai');
const admin = require('firebase-admin');

// =========================================================
// 1. INITIALISATION FIREBASE (COMPATIBLE RENDER & LOCAL)
// =========================================================
let serviceAccount;

if (process.env.FIREBASE_SERVICE_KEY) {
    try {
        let rawJson = process.env.FIREBASE_SERVICE_KEY;
        // Nettoyage des guillemets parasites au début/fin
        if (rawJson.startsWith("'") && rawJson.endsWith("'")) rawJson = rawJson.slice(1, -1);
        if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.slice(1, -1);

        // Correction des sauts de ligne littéraux pour le JSON
        rawJson = rawJson.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n');

        serviceAccount = JSON.parse(rawJson);
        console.log("✅ [FIREBASE] Clé chargée depuis les variables d'environnement.");
    } catch (error) {
        console.error("❌ [FIREBASE] Erreur FATALE de parsing JSON :", error.message);
    }
} else {
    try {
        serviceAccount = require('./serviceAccountKey.json');
        console.log("✅ [FIREBASE] Clé chargée depuis le fichier local.");
    } catch (e) {
        console.warn("⚠️ [FIREBASE] Aucune clé trouvée. La persistence ne sera pas disponible.");
    }
}

// Initialisation de Firebase Admin
if (serviceAccount) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id 
        });
    } catch (e) {
        console.error("❌ [FIREBASE] Erreur d'initialisation Admin :", e.message);
    }
} else {
    try { admin.initializeApp(); } catch(e){}
}

const db = admin.firestore();

// Forçage de l'ID projet pour Firestore (Évite le bug Render)
if (serviceAccount) {
    try {
        db.settings({
            projectId: serviceAccount.project_id,
            ignoreUndefinedProperties: true
        });
    } catch(e) {}
}

const app = express();
const PORT = process.env.PORT || 10000;

// =========================================================
// 2. CONFIGURATION DES CLÉS ET IA
// =========================================================

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
const GEMINI_MODEL = "gemini-2.5-flash"; 

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY }); 

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 

// État de l'application (Cache RAM)
const CACHE = {
    twitchTokens: {}, 
    twitchUser: null, 
    boostedStream: null, 
    lastScanData: null,
    globalStreamRotation: {
        streams: [], 
        currentIndex: 0, 
        lastFetchTime: 0,
        fetchCooldown: 10 * 60 * 1000 // 10 Minutes
    }
};

// =========================================================
// 3. FONCTIONS UTILITAIRES (HELPERS)
// =========================================================

/**
 * Récupère un Token d'Application Twitch
 */
async function getTwitchToken(tokenType) {
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
    } catch (error) { return null; }
}

/**
 * Appel API Twitch Helix avec gestion d'erreurs
 */
async function twitchApiFetch(endpoint, token) {
    const accessToken = token || await getTwitchToken('app');
    if (!accessToken) throw new Error("Token Twitch manquant.");

    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${accessToken}` }
    });

    if (res.status === 401) {
        CACHE.twitchTokens['app'] = null; 
        throw new Error(`Auth Twitch 401.`);
    }
    return res.json();
}

/**
 * Moteur IA Gemini (Persona Coach/Analyste)
 */
async function runGeminiAnalysis(prompt, type="standard") {
    let sysInstruct = "Tu es un expert en stratégie Twitch. Réponds UNIQUEMENT en HTML simple.";
    if (type === 'coach') sysInstruct = "Tu es un Coach Twitch Stratège. Tu analyses les chiffres comme à la bourse (Wall Street) mais tu es bienveillant et motivant. Utilise des listes à puces HTML. Pas de texte long.";

    try {
        const model = ai.getGenerativeModel({ model: GEMINI_MODEL });
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 1000 },
            systemInstruction: sysInstruct
        });
        return { success: true, html_response: result.response.text() };
    } catch (e) {
        return { success: false, html_response: "<p>IA indisponible.</p>" };
    }
}

/**
 * Gestion Historique & Tendances
 */
async function handleHistoryAndStats(type, id, newData) {
    const docRef = db.collection('history_stats').doc(String(id));
    let doc; 
    try { doc = await docRef.get(); } catch(e) { return { trend: 'stable', diff: 0 }; }

    let analysis = { trend: 'stable', diff: 0, previous: 0 };

    if (doc.exists) {
        const old = doc.data();
        if (type === 'user') {
            const currentFollowers = newData.total_followers || 0;
            const oldFollowers = old.total_followers || 0;
            const diff = currentFollowers - oldFollowers;
            analysis.diff = diff;
            analysis.trend = diff > 0 ? 'up' : (diff < 0 ? 'down' : 'stable');
        }
        await docRef.update({ ...newData, last_updated: admin.firestore.FieldValue.serverTimestamp() });
    } else {
        analysis.trend = 'new';
        await docRef.set({ ...newData, first_seen: admin.firestore.FieldValue.serverTimestamp() });
    }
    return analysis;
}

// =========================================================
// 4. MOTEUR DE ROTATION "DEEP DIVE" (STRICT < 100 VUES)
// =========================================================

async function refreshGlobalStreamList() {
    const now = Date.now();
    const rot = CACHE.globalStreamRotation;
    if (now - rot.lastFetchTime < rot.fetchCooldown && rot.streams.length > 0) return;
    
    let allStreams = [];
    let cursor = "";
    console.log("🔄 Lancement du Deep Dive Twitch (Cible < 100 viewers)...");

    try {
        for (let i = 0; i < 8; i++) { // On scanne jusqu'à 800 streams pour trouver les petits
            let url = `streams?language=fr&first=100` + (cursor ? `&after=${cursor}` : ``);
            const res = await twitchApiFetch(url);
            if (!res.data || res.data.length === 0) break;

            // FILTRE STRICT IMPITOYABLE : Uniquement entre 1 et 100 vues
            const smallOnes = res.data.filter(s => s.viewer_count > 0 && s.viewer_count <= 100);
            allStreams = allStreams.concat(smallOnes);

            if (allStreams.length >= 50) break;
            cursor = res.pagination.cursor;
            if (!cursor) break;
        }

        if (allStreams.length > 0) {
            allStreams.sort(() => Math.random() - 0.5); // Mélange
            rot.streams = allStreams.map(s => ({ channel: s.user_login, viewers: s.viewer_count }));
            rot.currentIndex = 0;
            rot.lastFetchTime = now;
            console.log(`✅ Deep Dive Terminé : ${allStreams.length} streamers trouvés.`);
        } else {
            rot.streams = [{channel: 'twitch', viewers: 0}]; 
        }
    } catch (e) { console.error("Erreur Deep Dive:", e); }
}

// =========================================================
// 5. ROUTES API (MARKET, SCAN, RAID, PLANNING)
// =========================================================

// --- A. MARKET DATA (TwitchTracker Clone) ---
app.post('/global_pulse', async (req, res) => {
    const { type } = req.body; // 'games', 'languages', 'compare'
    try {
        const sRes = await twitchApiFetch('streams?first=100');
        const streams = sRes.data;
        const totalSampleV = streams.reduce((acc, s) => acc + s.viewer_count, 0);
        
        // Extrapolation statistique
        const estViewers = Math.floor(totalSampleV * 1.6);
        const estChannels = Math.floor(streams.length * 60);

        const overview = {
            viewers: estViewers.toLocaleString(),
            channels: estChannels.toLocaleString(),
            active: Math.floor(estChannels * 0.85).toLocaleString(),
            watch_time: Math.floor(estViewers * 45 / 60).toLocaleString() + "h",
            stream_time: Math.floor(estChannels * 2.5).toLocaleString() + "h"
        };

        let tableData = [];
        if (type === 'languages') {
            const map = {};
            streams.forEach(s => {
                const l = s.language.toUpperCase();
                if(!map[l]) map[l] = {c:0, v:0};
                map[l].c++; map[l].v += s.viewer_count;
            });
            tableData = Object.entries(map).sort((a,b)=>b[1].v - a[1].v).map(([k,v], i) => ({
                rank: i+1, name: k, viewers: v.v, channels: v.c, rating: v.v > 50000 ? "A+" : "B"
            }));
        } else if (type === 'compare') {
            // Logique de comparaison (Mockup pour l'UI)
            tableData = [{rank:1, name:"Action vs Chatting", viewers: estViewers, channels: estChannels, rating: "COMPARE MODE"}];
        } else {
            // MODE GAMES
            const gRes = await twitchApiFetch('games/top?first=15');
            for(let i=0; i<gRes.data.length; i++) {
                const g = gRes.data[i];
                const gs = await twitchApiFetch(`streams?game_id=${g.id}&first=5`);
                const gv = gs.data.reduce((a,b)=>a+b.viewer_count,0) * (i<3 ? 25 : 12);
                const gc = gs.data.length * 60;
                tableData.push({
                    rank: i+1, name: g.name, viewers: gv, channels: gc, 
                    rating: (gv/gc > 30) ? "A+" : "B",
                    img: g.box_art_url.replace('{width}','50').replace('{height}','70')
                });
            }
        }

        // PERSISTANCE FIREBASE
        if(type === 'games') {
            try {
                await db.collection('market_history').add({
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    viewers: estViewers,
                    channels: estChannels,
                    top_game: tableData[0]?.name || 'Inconnu'
                });
            } catch(e){}
        }

        res.json({ success: true, overview, table: tableData });
    } catch(e) { res.status(500).json({error: e.message}); }
});

// --- B. DASHBOARD SCAN (Notation & Bourse) ---
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    try {
        const uRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`);
        if (uRes.data.length > 0) {
            const u = uRes.data[0];
            let followers = 0;
            try { 
                const f = await twitchApiFetch(`channels/followers?broadcaster_id=${u.id}&first=1`); 
                followers = f.total; 
            } catch(e){}
            
            // Habitudes de stream (VODs)
            let activeDays = "Inconnu";
            try {
                const vRes = await twitchApiFetch(`videos?user_id=${u.id}&first=10&type=archive`);
                if(vRes.data.length > 0) {
                    const daysMap = {};
                    vRes.data.forEach(v => {
                        const day = new Date(v.created_at).toLocaleDateString('fr-FR', { weekday: 'long' });
                        daysMap[day] = (daysMap[day] || 0) + 1;
                    });
                    activeDays = Object.entries(daysMap).sort((a,b)=>b[1]-a[1]).slice(0,3).map(e=>e[0]).join(", ");
                }
            } catch(e){}

            const uData = { login: u.login, display_name: u.display_name, id: u.id, profile_image_url: u.profile_image_url, total_followers: followers, active_days: activeDays };
            
            const h = await handleHistoryAndStats('user', u.id, uData);
            
            // Notation 5 Etoiles
            let stars = 3;
            if (h.trend === 'up') stars += 1;
            if (h.diff > 30) stars += 1;
            if (h.trend === 'down') stars -= 1;
            stars = Math.min(Math.max(stars, 1), 5);

            // IA Coach
            const prompt = `Analyse Streamer: ${u.display_name}. Note: ${stars}/5. Tendance: ${h.trend}. Donne 3 conseils.`;
            const ia = await runGeminiAnalysis(prompt, 'coach');

            res.json({ success: true, data: uData, history: h, stars, ia: ia.html_response });
        } else {
            res.json({success:false, error:"Introuvable."});
        }
    } catch(e) { res.status(500).json({success:false, error: e.message}); }
});

// --- C. RAID FINDER (CORRIGÉ) ---
app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    try {
        const gRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(!gRes.data.length) return res.json({error: "Jeu introuvable."});
        
        const sRes = await twitchApiFetch(`streams?game_id=${gRes.data[0].id}&first=100&language=fr`);
        const target = sRes.data.filter(s => s.viewer_count <= parseInt(max_viewers)).sort((a,b) => b.viewer_count - a.viewer_count)[0];
        
        if(target) {
            const uRes = await twitchApiFetch(`users?id=${target.user_id}`);
            return res.json({
                success: true,
                target: {
                    name: target.user_name, login: target.user_login, viewers: target.viewer_count,
                    avatar: uRes.data[0]?.profile_image_url || "",
                    thumb: target.thumbnail_url.replace('{width}','320').replace('{height}','180')
                }
            });
        }
        return res.json({error: "Aucune cible."});
    } catch(e) { res.json({error: e.message}); }
});

// --- D. SMART PLANNING ---
app.post('/analyze_schedule', async (req, res) => {
    const { game } = req.body;
    try {
        const gRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(!gRes.data.length) return res.json({success:false});
        
        const sRes = await twitchApiFetch(`streams?game_id=${gRes.data[0].id}&first=100`);
        const totalV = sRes.data.reduce((a,b)=>a+b.viewer_count,0);
        
        const prompt = `Jeu: ${gRes.data[0].name}. Streamers: ${sRes.data.length}. Viewers: ${totalV}. Donne 3 créneaux horaires idéaux.`;
        const ia = await runGeminiAnalysis(prompt, 'scheduler');
        
        res.json({
            success: true,
            name: gRes.data[0].name,
            box_art: gRes.data[0].box_art_url.replace('{width}','100'),
            ia_advice: ia.html_response
        });
    } catch(e) { res.json({success:false}); }
});

// --- E. LECTEUR & BOOST ---
app.get('/get_default_stream', async (req, res) => {
    try {
        const b = await db.collection('boosts').where('endTime', '>', Date.now()).limit(1).get();
        if(!b.empty) { const d = b.docs[0].data(); return res.json({ success: true, channel: d.channel, viewers: 'BOOST' }); }
    } catch(e){}
    await refreshGlobalStreamList();
    const pick = CACHE.globalStreamRotation.streams[Math.floor(Math.random() * CACHE.globalStreamRotation.streams.length)];
    res.json({ success: true, channel: pick.channel, viewers: pick.viewers });
});

app.post('/stream_boost', async (req, res) => {
    try {
        await db.collection('boosts').add({ channel: req.body.channel, endTime: Date.now() + 900000 });
        res.json({ success: true });
    } catch(e) { res.json({error: "DB Error"}); }
});

app.post('/cycle_stream', async (req, res) => {
    await refreshGlobalStreamList();
    const pick = CACHE.globalStreamRotation.streams[Math.floor(Math.random() * CACHE.globalStreamRotation.streams.length)];
    res.json({ success: true, channel: pick.channel });
});

// --- F. AUTHENTIFICATION ---
app.get('/twitch_auth_start', (req, res) => res.redirect(`https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows`));
app.get('/twitch_auth_callback', async (req, res) => {
    const r = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&code=${req.query.code}&grant_type=authorization_code&redirect_uri=${REDIRECT_URI}`, {method:'POST'});
    const d = await r.json();
    if(d.access_token) { CACHE.twitchUser = d.access_token; res.send("<script>window.opener.postMessage('auth_success','*');window.close();</script>"); }
});
app.get('/twitch_user_status', (req,res) => res.json({is_connected:!!CACHE.twitchUser}));
app.post('/twitch_logout', (req,res)=>{CACHE.twitchUser=null;res.json({success:true});});
app.get('/followed_streams', async (req, res) => {
    if(!CACHE.twitchUser) return res.json({success:false});
    const u = await twitchApiFetch('users', CACHE.twitchUser);
    const f = await twitchApiFetch(`streams/followed?user_id=${u.data[0].id}`, CACHE.twitchUser);
    res.json({success:true, streams: f.data});
});

app.listen(PORT, () => console.log(`🚀 [JUSTPLAYER] V32 STARTED ON PORT ${PORT}`));
