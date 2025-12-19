/**
 * STREAMER & NICHE AI HUB - BACKEND (V22 - DEEP SEARCH INTEGRAL)
 * ==============================================================
 * Serveur Node.js/Express gérant :
 * 1. L'authentification Twitch (OAuth) avec fermeture propre.
 * 2. L'API Twitch (Helix) avec PAGINATION (Deep Search).
 * 3. L'IA Google Gemini (Analyses complètes).
 * 4. La rotation automatique (<100 vues) avec Fallback de sécurité.
 * 5. Le système de Boost et Raid.
 * 6. PERSISTANCE : Connexion Firebase Blindée pour Render.
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
// 0. INITIALISATION FIREBASE (V20/V22 FIX)
// =========================================================
let serviceAccount;

// Cas 1 : Environnement de Production (Render)
if (process.env.FIREBASE_SERVICE_KEY) {
    try {
        let rawJson = process.env.FIREBASE_SERVICE_KEY;
        
        // Nettoyage JSON pour Render
        if (rawJson.startsWith("'") && rawJson.endsWith("'")) rawJson = rawJson.slice(1, -1);
        if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.slice(1, -1);
        rawJson = rawJson.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n');

        serviceAccount = JSON.parse(rawJson);
        console.log("✅ [FIREBASE] Clé chargée et réparée automatiquement.");

    } catch (error) {
        console.error("❌ [FIREBASE] Erreur FATALE de parsing JSON :", error.message);
    }
} 
// Cas 2 : Local
else {
    try {
        serviceAccount = require('./serviceAccountKey.json');
        console.log("✅ [FIREBASE] Clé chargée depuis le fichier local.");
    } catch (e) {
        console.warn("⚠️ [FIREBASE] Aucune clé trouvée.");
    }
}

// Démarrage Firebase
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

// Forçage des settings Firestore (Fix Render "Project Id")
if (serviceAccount) {
    try {
        db.settings({
            projectId: serviceAccount.project_id || process.env.GOOGLE_CLOUD_PROJECT || 'goodstreamer-7e87d',
            ignoreUndefinedProperties: true
        });
        console.log("✅ [FIRESTORE] ID de projet forcé dans les settings.");
    } catch(e) {
        console.error("⚠️ [FIRESTORE] Erreur settings :", e.message);
    }
}

// =========================================================
// 1. CONFIGURATION SERVEUR
// =========================================================
const app = express();
const PORT = process.env.PORT || 10000;

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
const GEMINI_MODEL = "gemini-2.5-flash"; 

if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI || !GEMINI_API_KEY) {
    console.error("#############################################################");
    console.error("ERREUR FATALE : VARIABLES MANQUANTES");
    console.error("#############################################################");
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY }); 

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 

// =========================================================
// 2. CACHE & ETAT
// =========================================================
const CACHE = {
    twitchTokens: {},       
    twitchUser: null,       
    boostedStream: null,    
    lastScanData: null,     
    globalStreamRotation: {
        streams: [],        
        currentIndex: 0,    
        lastFetchTime: 0,   
        fetchCooldown: 10 * 60 * 1000 // 10 minutes
    }
};

// =========================================================
// 3. HELPERS
// =========================================================

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

async function twitchApiFetch(endpoint, token) {
    const accessToken = token || await getTwitchToken('app');
    if (!accessToken) throw new Error("Impossible d'obtenir un Token Twitch.");

    // Ajout nocache pour éviter les données périmées
    const separator = endpoint.includes('?') ? '&' : '?';
    const url = `https://api.twitch.tv/helix/${endpoint}${separator}nocache=${Date.now()}`;

    const res = await fetch(url, {
        headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (res.status === 401) {
        if (token === CACHE.twitchTokens['app']?.access_token) CACHE.twitchTokens['app'] = null; 
        if (token === CACHE.twitchUser?.access_token) CACHE.twitchUser = null; 
        throw new Error(`Erreur Auth Twitch (401). Token expiré.`);
    }
    
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Erreur API Twitch (${res.status}): ${txt}`);
    }

    return res.json();
}

async function runGeminiAnalysis(prompt) {
    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
                systemInstruction: "Tu es un expert en stratégie Twitch. Réponds UNIQUEMENT en HTML simple."
            }
        });
        return { success: true, html_response: response.text.trim() };
    } catch (e) {
        return { success: false, error: e.message, html_response: `<p>❌ Erreur IA: ${e.message}</p>` };
    }
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// =========================================================
// 4. AUTHENTIFICATION
// =========================================================

app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${state}`;
    res.cookie('twitch_state', state, { httpOnly: true, secure: true, maxAge: 600000 }); 
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state } = req.query;
    if (state !== req.cookies.twitch_state) return res.status(400).send("Erreur de sécurité.");

    try {
        const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET,
                code: code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI
            })
        });
        const tokenData = await tokenRes.json();
        
        if (tokenData.access_token) {
            const userRes = await twitchApiFetch('users', tokenData.access_token);
            const user = userRes.data[0];
            CACHE.twitchUser = {
                display_name: user.display_name, username: user.login, id: user.id,
                access_token: tokenData.access_token, expiry: Date.now() + (tokenData.expires_in * 1000)
            };
            res.send(`<script>window.opener? (window.opener.postMessage('auth_success', '*'), window.close()) : window.location.href='/';</script>`);
        } else res.status(500).send("Échec Token.");
    } catch (e) { res.status(500).send(`Erreur: ${e.message}`); }
});

app.post('/twitch_logout', (req, res) => {
    CACHE.twitchUser = null;
    res.json({ success: true, message: "Déconnecté" });
});

app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) {
        return res.json({ is_connected: true, display_name: CACHE.twitchUser.display_name, username: CACHE.twitchUser.username, id: CACHE.twitchUser.id });
    }
    CACHE.twitchUser = null; 
    res.json({ is_connected: false });
});

// =========================================================
// 5. DATA API
// =========================================================

app.get('/followed_streams', async (req, res) => {
    if (!CACHE.twitchUser) return res.status(401).json({ success: false, error: "Non connecté." });
    try {
        const data = await twitchApiFetch(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token);
        const streams = data.data.map(stream => ({
            user_name: stream.user_name, user_login: stream.user_login, title: stream.title,
            game_name: stream.game_name, viewer_count: stream.viewer_count, thumbnail_url: stream.thumbnail_url 
        }));
        return res.json({ success: true, streams });
    } catch (e) { return res.status(500).json({ success: false, error: e.message }); }
});

app.get('/get_latest_vod', async (req, res) => {
    const channel = req.query.channel;
    if (!channel) return res.status(400).json({ success: false });
    try {
        const userRes = await twitchApiFetch(`users?login=${channel}`);
        if (!userRes.data || !userRes.data.length) return res.status(404).json({ success: false });
        const vodRes = await twitchApiFetch(`videos?user_id=${userRes.data[0].id}&type=archive&first=1`);
        if (!vodRes.data || !vodRes.data.length) return res.status(404).json({ success: false });
        const vod = vodRes.data[0];
        return res.json({ success: true, vod: { id: vod.id, title: vod.title, url: vod.url, thumbnail_url: vod.thumbnail_url.replace('%{width}', '150').replace('%{height}', '84'), duration: vod.duration } });
    } catch (e) { return res.status(500).json({ success: false, error: e.message }); }
});

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ success: false, message: "Requête vide." });
    try {
        const userRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`); 
        if (userRes.data.length > 0) {
            const user = userRes.data[0];
            let stream = null;
            try { stream = (await twitchApiFetch(`streams?user_id=${user.id}`)).data[0]; } catch(e){}
            let followers = 'N/A';
            try { followers = (await twitchApiFetch(`users/follows?followed_id=${user.id}&first=1`)).total; } catch(e){}

            const userData = { 
                login: user.login, display_name: user.display_name, id: user.id, profile_image_url: user.profile_image_url,
                is_live: !!stream, viewer_count: stream ? stream.viewer_count : 0, game_name: stream ? stream.game_name : '',
                total_followers: followers, total_views: user.view_count || 'N/A', ai_calculated_niche_score: user.broadcaster_type === 'partner' ? '8.5/10' : '5.5/10'
            };
            CACHE.lastScanData = { type: 'user', ...userData };
            return res.json({ success: true, type: 'user', user_data: userData });
        }
        
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        if (gameRes.data.length > 0) {
            const game = gameRes.data[0];
            const streams = (await twitchApiFetch(`streams?game_id=${game.id}&first=100`)).data;
            const totalV = streams.reduce((s, c) => s + c.viewer_count, 0);
            const avg = streams.length > 0 ? Math.round(totalV / streams.length) : 0;
            const gameData = { 
                name: game.name, id: game.id, box_art_url: game.box_art_url,
                total_streamers: streams.length, total_viewers: totalV, ai_calculated_niche_score: avg < 100 ? '8.0/10' : '4.5/10'
            };
            CACHE.lastScanData = { type: 'game', ...gameData };
            return res.json({ success: true, type: 'game', game_data: gameData });
        }
        return res.status(404).json({ success: false, message: "Aucun résultat." });
    } catch (e) { return res.status(500).json({ success: false, error: e.message }); }
});

// =========================================================
// 6. ROTATION INTELLIGENTE & EMERGENCY FALLBACK (LE COEUR V22)
// =========================================================

/**
 * Fonction de secours : Trouve n'importe quel stream FR en live (même gros)
 * Cela évite d'avoir "Monstercat Hors Ligne" ou un écran noir.
 */
async function getEmergencyStream() {
    try {
        // On prend le Top 5 FR en live. On est sûr qu'ils sont connectés.
        const res = await twitchApiFetch(`streams?language=fr&first=5&type=live`);
        if (res.data && res.data.length > 0) {
            // On en prend un au hasard dans le top 5 pour varier
            const randomStream = res.data[Math.floor(Math.random() * res.data.length)];
            return randomStream;
        }
    } catch (e) {
        console.error("⚠️ Emergency Stream Failed:", e.message);
    }
    return null;
}

async function refreshGlobalStreamList() {
    const now = Date.now();
    const rotation = CACHE.globalStreamRotation;
    
    // Si cooldown pas passé et liste pleine, on ne fait rien
    if (now - rotation.lastFetchTime < rotation.fetchCooldown && rotation.streams.length > 0) return;
    
    console.log("🔄 Lancement DEEP SEARCH (0-100 vues)...");
    
    try {
        let allCandidates = [];
        let cursor = "";
        const MAX_PAGES = 5; // Scan 500 streams

        for (let i = 0; i < MAX_PAGES; i++) {
            // PARAMETRE CRUCIAL : type=live pour éviter les offline
            let url = `streams?language=fr&first=100&type=live`;
            if (cursor) url += `&after=${cursor}`;

            const res = await twitchApiFetch(url);
            
            if (res.data && res.data.length > 0) {
                allCandidates = allCandidates.concat(res.data);
                cursor = res.pagination.cursor;
                if (!cursor) break; 
            } else break;
        }

        console.log(`📊 Streams analysés : ${allCandidates.length}`);

        // FILTRAGE STRICT : Entre 1 et 100 vues
        let suitableStreams = allCandidates.filter(stream => 
            stream.viewer_count > 0 && 
            stream.viewer_count <= 100
        );

        console.log(`✅ Streams retenus (<100 vues) : ${suitableStreams.length}`);

        // FALLBACK 1 : Si liste vide, on prend les 20 plus petits de la liste totale
        if (suitableStreams.length === 0 && allCandidates.length > 0) {
            console.log("⚠️ Fallback 1: Aucun <100 vues. Utilisation des plus petits trouvés.");
            suitableStreams = allCandidates.sort((a, b) => a.viewer_count - b.viewer_count).slice(0, 20);
        }

        if (suitableStreams.length > 0) {
            suitableStreams = shuffleArray(suitableStreams);
            rotation.streams = suitableStreams.map(s => ({ channel: s.user_login, viewers: s.viewer_count }));
            rotation.currentIndex = 0;
            rotation.lastFetchTime = now;
            console.log("✅ Rotation mise à jour.");
        } else {
            console.log("❌ ECHEC TOTAL: Aucun stream trouvé.");
            rotation.streams = []; // On vide pour déclencher l'Emergency
        }

    } catch (e) {
        console.error("❌ Erreur Deep Search:", e.message);
    }
}

app.get('/get_default_stream', async (req, res) => {
    
    const now = Date.now();
    let currentBoost = null;

    // --- 1. VERIFICATION BOOST ---
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
        if (CACHE.boostedStream && CACHE.boostedStream.endTime > now) currentBoost = CACHE.boostedStream;
    }

    if (currentBoost && currentBoost.endTime > now) {
        const remaining = Math.ceil((currentBoost.endTime - now) / 60000);
        return res.json({ 
            success: true, 
            channel: currentBoost.channel, 
            viewers: 'BOOST',
            message: `⚡ BOOST ACTIF (${remaining} min restantes) - ${currentBoost.channel}`
        });
    }

    // --- 2. ROTATION AUTOMATIQUE ---
    await refreshGlobalStreamList(); 
    const rotation = CACHE.globalStreamRotation;
    
    if (rotation.streams.length > 0) {
        const currentStream = rotation.streams[rotation.currentIndex];
        return res.json({ 
            success: true, 
            channel: currentStream.channel,
            viewers: currentStream.viewers,
            message: `✅ Auto-Discovery : ${currentStream.channel} (${currentStream.viewers} vues)`
        });
    }

    // --- 3. EMERGENCY FALLBACK (ANTI-ECRAN NOIR) ---
    // Si la liste est vide, on prend un gros streamer en live
    console.log("🚑 Appel du stream d'urgence...");
    const emergency = await getEmergencyStream();
    
    if (emergency) {
        return res.json({
            success: true,
            channel: emergency.user_login,
            viewers: emergency.viewer_count,
            message: `⚠️ Mode Secours (${emergency.viewer_count} vues) : ${emergency.user_name}`
        });
    }

    // --- 4. ULTIMATE FAILSAFE ---
    // Si même Twitch API est down
    return res.json({ 
        success: true, 
        channel: 'lofigirl', 
        message: 'Offline Mode - Lofi Girl' 
    });
});

app.post('/cycle_stream', async (req, res) => {
    const { direction } = req.body; 

    // Interdit si boost actif
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
        return res.status(403).json({ success: false, error: "Boost actif." });
    }

    // Si liste vide, force refresh
    if (CACHE.globalStreamRotation.streams.length === 0) {
        await refreshGlobalStreamList();
    }

    const rotation = CACHE.globalStreamRotation;

    // Si liste valide
    if (rotation.streams.length > 0) {
        if (direction === 'next') {
            rotation.currentIndex = (rotation.currentIndex + 1) % rotation.streams.length;
        } else {
            rotation.currentIndex = (rotation.currentIndex - 1 + rotation.streams.length) % rotation.streams.length;
        }
        const newStream = rotation.streams[rotation.currentIndex];
        return res.json({ success: true, channel: newStream.channel, viewers: newStream.viewers });
    }

    // Sinon Emergency
    const emergency = await getEmergencyStream();
    if(emergency) {
        return res.json({ success: true, channel: emergency.user_login, viewers: emergency.viewer_count });
    }

    return res.status(404).json({ success: false });
});

// =========================================================
// 7. ACTIONS (BOOST & RAID)
// =========================================================

app.get('/check_boost_status', async (req, res) => {
    const now = Date.now();
    try {
        const q = await db.collection('boosts').where('endTime', '>', now).limit(1).get();
        if (!q.empty) {
            const data = q.docs[0].data();
            return res.json({ is_boosted: true, channel: data.channel, remaining_seconds: Math.ceil((data.endTime - now) / 1000) });
        }
    } catch(e) {}
    return res.json({ is_boosted: false });
});

app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    if (!channel) return res.status(400).json({ error: "Chaîne requise." });

    const now = Date.now();
    const DURATION = 15 * 60 * 1000;

    try {
        const active = await db.collection('boosts').where('endTime', '>', now).limit(1).get();
        if (!active.empty) return res.status(429).json({ error: "Slot occupé", html_response: "<p>❌ Boost déjà en cours.</p>" });

        await db.collection('boosts').add({
            channel: channel, startTime: now, endTime: now + DURATION, created_at: admin.firestore.FieldValue.serverTimestamp()
        });
        CACHE.boostedStream = { channel: channel, endTime: now + DURATION }; 
        return res.json({ success: true, html_response: `<p style="color:#ff0099;">🚀 Boost activé pour ${channel} !</p>` });
    } catch (e) {
        return res.status(500).json({ error: "Erreur DB", html_response: "<p>Erreur serveur.</p>" });
    }
});

app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    if (!game || !max_viewers) return res.status(400).json({ success: false, error: "Données manquantes" });

    try {
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if (gameRes.data.length === 0) return res.status(404).json({ success: false, error: `Jeu introuvable.` });

        const gameId = gameRes.data[0].id;
        
        // Deep search pour le raid aussi (3 pages)
        let allStreams = [];
        let cursor = "";
        for(let i=0; i<3; i++) {
            let url = `streams?game_id=${gameId}&first=100&language=fr&type=live`;
            if(cursor) url += `&after=${cursor}`;
            const r = await twitchApiFetch(url);
            if(r.data && r.data.length > 0) {
                allStreams = allStreams.concat(r.data);
                cursor = r.pagination.cursor;
                if(!cursor) break;
            } else break;
        }

        const candidates = allStreams.filter(stream => stream.viewer_count <= parseInt(max_viewers));
        let target = candidates.length > 0 
            ? candidates.sort((a, b) => b.viewer_count - a.viewer_count)[0] 
            : allStreams[0];

        if (target) {
            return res.json({
                success: true,
                target: {
                    name: target.user_name, login: target.user_login, viewers: target.viewer_count,
                    game: target.game_name, thumbnail_url: target.thumbnail_url.replace('%{width}', '100').replace('%{height}', '56')
                }
            });
        } else {
            return res.json({ success: false, error: "Personne trouvé." });
        }
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/critique_ia', async (req, res) => {
    const { type, query, niche_score } = req.body;
    let prompt = "";
    if (type === 'niche') {
        prompt = `Expert Twitch. Score niche calculé: ${niche_score}. Analyse le sujet "${query}". Structure HTML requise: Titre <h4>, Liste <ul> de 3 forces, Liste <ul> de 3 idées contenus, Conclusion <p> avec <strong>.`;
    } else if (type === 'repurpose') {
        prompt = `Expert Montage Vidéo. Analyse la VOD "${query}". Structure HTML: Titre <h4>, Liste <ul> de 3 timestamps clips (HH:MM:SS) avec texte "**Point de Clip: HH:MM:SS**", Liste <ul> de 3 titres YouTube Shorts.`;
    }
    const result = await runGeminiAnalysis(prompt);
    res.json(result);
});

app.post('/analyze_schedule', async (req, res) => {
    const { game } = req.body;
    if (!game) return res.status(400).json({ success: false, error: "Jeu manquant." });

    try {
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if (gameRes.data.length === 0) return res.json({ success: false, error: "Jeu introuvable." });
        
        const gameData = gameRes.data[0];
        const streamsRes = await twitchApiFetch(`streams?game_id=${gameData.id}&first=100`);
        const totalViewers = streamsRes.data.reduce((acc, s) => acc + s.viewer_count, 0);
        const streamerCount = streamsRes.data.length;
        
        const prompt = `
            Analyse le jeu Twitch "${gameData.name}".
            Données temps réel (échantillon): ${streamerCount} streamers, ${totalViewers} viewers.
            Agis comme un expert data. Génère une réponse HTML (sans balises globales) :
            1. <h4>Indice de Saturation</h4> (Analyse ratio viewers/streamers).
            2. <h4>Meilleurs Créneaux (Prédiction)</h4>.
            3. <ul> avec 3 créneaux (Jour + Heure) recommandés pour percer.
            4. Conseil final <strong> sur la durée de session.
        `;

        const aiResult = await runGeminiAnalysis(prompt);
        return res.json({
            success: true,
            game_name: gameData.name,
            box_art: gameData.box_art_url.replace('{width}','144').replace('{height}','192'),
            html_response: aiResult.html_response
        });

    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/export_csv', (req, res) => {
    const data = CACHE.lastScanData;
    if (!data) return res.status(404).send("Aucune donnée disponible. Faites un scan d'abord.");

    let csv = "Metrique,Valeur\n";
    if (data.type === 'user') {
        csv += `Type,Streamer\nNom,${data.display_name}\nVues,${data.viewer_count}\nFollowers,${data.total_followers}\nScore Niche,${data.ai_calculated_niche_score}`;
    } else {
        csv += `Type,Jeu\nNom,${data.name}\nTotal Viewers,${data.total_viewers}\nTotal Streamers,${data.total_streamers}\nScore Niche,${data.ai_calculated_niche_score}`;
    }
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=Twitch_Analysis.csv');
    res.send(csv);
});

// =========================================================
// 8. DÉMARRAGE
// =========================================================

app.listen(PORT, () => {
    console.log(`===========================================`);
    console.log(` STREAMER HUB V22 (INTEGRAL+SAFE) PORT ${PORT}`);
    console.log(`===========================================`);
});
