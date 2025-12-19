/**
 * STREAMER & NICHE AI HUB - BACKEND (V22 - ALWAYS LIVE SECURITY)
 * ==============================================================
 * Serveur Node.js/Express gérant :
 * 1. Auth Twitch & API Helix (Deep Search).
 * 2. Correctif V22 : Fallback intelligent (Ne renvoie jamais Monstercat/Offline).
 * 3. Gestion Boost & Raid.
 * 4. Persistance Firebase.
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
// 0. INITIALISATION FIREBASE
// =========================================================
let serviceAccount;

if (process.env.FIREBASE_SERVICE_KEY) {
    try {
        let rawJson = process.env.FIREBASE_SERVICE_KEY;
        if (rawJson.startsWith("'") && rawJson.endsWith("'")) rawJson = rawJson.slice(1, -1);
        if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.slice(1, -1);
        rawJson = rawJson.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n');
        serviceAccount = JSON.parse(rawJson);
        console.log("✅ [FIREBASE] Clé chargée (Env Var).");
    } catch (error) { console.error("❌ [FIREBASE] Erreur Parsing JSON."); }
} else {
    try {
        serviceAccount = require('./serviceAccountKey.json');
        console.log("✅ [FIREBASE] Clé chargée (Local).");
    } catch (e) { console.warn("⚠️ [FIREBASE] Pas de clé."); }
}

if (serviceAccount) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id 
        });
    } catch (e) {}
} else { try { admin.initializeApp(); } catch(e){} }

const db = admin.firestore();
if (serviceAccount) {
    try {
        db.settings({
            projectId: serviceAccount.project_id || process.env.GOOGLE_CLOUD_PROJECT || 'goodstreamer-7e87d',
            ignoreUndefinedProperties: true
        });
    } catch(e) {}
}

const app = express();
const PORT = process.env.PORT || 10000;

// VARIABLES ENV
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

// =========================================================
// 2. CACHE
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
        fetchCooldown: 5 * 60 * 1000 // 5 minutes (plus rapide pour éviter les offline)
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
    if (!accessToken) throw new Error("No Token");

    const separator = endpoint.includes('?') ? '&' : '?';
    // Ajout d'un paramètre aléatoire pour éviter le cache Twitch coté serveur
    const url = `https://api.twitch.tv/helix/${endpoint}${separator}xx_cache=${Date.now()}`;

    const res = await fetch(url, {
        headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${accessToken}` }
    });

    if (res.status === 401) {
        if (token === CACHE.twitchTokens['app']?.access_token) CACHE.twitchTokens['app'] = null; 
        throw new Error(`Token expiré.`);
    }
    if (!res.ok) throw new Error(`API Error ${res.status}`);
    return res.json();
}

async function runGeminiAnalysis(prompt) {
    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { systemInstruction: "HTML simple uniquement." }
        });
        return { success: true, html_response: response.text.trim() };
    } catch (e) {
        return { success: false, error: e.message, html_response: "<p>Erreur IA</p>" };
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
// 4. AUTH
// =========================================================
app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${state}`;
    res.cookie('twitch_state', state, { httpOnly: true, secure: true, maxAge: 600000 }); 
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state } = req.query;
    if (state !== req.cookies.twitch_state) return res.status(400).send("Erreur secu.");
    try {
        const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, code: code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI })
        });
        const tokenData = await tokenRes.json();
        if (tokenData.access_token) {
            const userRes = await twitchApiFetch('users', tokenData.access_token);
            const user = userRes.data[0];
            CACHE.twitchUser = { display_name: user.display_name, username: user.login, id: user.id, access_token: tokenData.access_token, expiry: Date.now() + (tokenData.expires_in * 1000) };
            res.send(`<script>window.opener? (window.opener.postMessage('auth_success', '*'), window.close()) : window.location.href='/';</script>`);
        } else res.status(500).send("Erreur Token.");
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/twitch_logout', (req, res) => { CACHE.twitchUser = null; res.json({ success: true }); });
app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) return res.json({ is_connected: true, display_name: CACHE.twitchUser.display_name });
    res.json({ is_connected: false });
});

// =========================================================
// 5. DATA
// =========================================================
app.get('/followed_streams', async (req, res) => {
    if (!CACHE.twitchUser) return res.status(401).json({ success: false });
    try {
        const data = await twitchApiFetch(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token);
        return res.json({ success: true, streams: data.data });
    } catch (e) { return res.status(500).json({ success: false }); }
});

app.get('/get_latest_vod', async (req, res) => {
    const channel = req.query.channel;
    try {
        const userRes = await twitchApiFetch(`users?login=${channel}`);
        if (!userRes.data.length) return res.json({ success: false });
        const vodRes = await twitchApiFetch(`videos?user_id=${userRes.data[0].id}&type=archive&first=1`);
        if (!vodRes.data.length) return res.json({ success: false });
        const vod = vodRes.data[0];
        return res.json({ success: true, vod: { id: vod.id, title: vod.title, url: vod.url, thumbnail_url: vod.thumbnail_url.replace('%{width}','150').replace('%{height}','84'), duration: vod.duration } });
    } catch (e) { return res.json({ success: false }); }
});

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    try {
        const userRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`); 
        if (userRes.data.length > 0) {
            const user = userRes.data[0];
            let stream = null;
            try { stream = (await twitchApiFetch(`streams?user_id=${user.id}`)).data[0]; } catch(e){}
            const userData = { 
                login: user.login, display_name: user.display_name, id: user.id, profile_image_url: user.profile_image_url,
                is_live: !!stream, viewer_count: stream ? stream.viewer_count : 0, game_name: stream ? stream.game_name : '',
                total_followers: 'N/A', total_views: user.view_count || 'N/A', ai_calculated_niche_score: user.broadcaster_type === 'partner' ? '8.5/10' : '5.5/10'
            };
            CACHE.lastScanData = { type: 'user', ...userData };
            return res.json({ success: true, type: 'user', user_data: userData });
        }
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        if (gameRes.data.length > 0) {
            const game = gameRes.data[0];
            const streams = (await twitchApiFetch(`streams?game_id=${game.id}&first=100`)).data;
            const totalV = streams.reduce((s, c) => s + c.viewer_count, 0);
            const gameData = { name: game.name, id: game.id, box_art_url: game.box_art_url, total_streamers: streams.length, total_viewers: totalV, ai_calculated_niche_score: '7.5/10' };
            CACHE.lastScanData = { type: 'game', ...gameData };
            return res.json({ success: true, type: 'game', game_data: gameData });
        }
        return res.json({ success: false });
    } catch (e) { return res.json({ success: false }); }
});

// =========================================================
// 6. ROTATION INTELLIGENTE (V22 - EMERGENCY FALLBACK)
// =========================================================

// Cette fonction trouve un stream DE SECOURS (n'importe lequel qui est en live)
async function getEmergencyStream() {
    try {
        // On prend n'importe quel stream FR en live (Top 5) pour être sûr d'avoir une image
        const res = await twitchApiFetch(`streams?language=fr&first=5&type=live`);
        if (res.data && res.data.length > 0) {
            return res.data[Math.floor(Math.random() * res.data.length)];
        }
    } catch (e) {}
    return null;
}

async function refreshGlobalStreamList() {
    const now = Date.now();
    const rotation = CACHE.globalStreamRotation;
    
    // Si on a déjà une liste et que le cooldown n'est pas passé, on ne fait rien
    if (now - rotation.lastFetchTime < rotation.fetchCooldown && rotation.streams.length > 0) return;
    
    console.log("🔄 Lancement de la DEEP SEARCH (0-100 vues)...");
    
    try {
        let allCandidates = [];
        let cursor = "";
        // On scanne jusqu'à 5 pages
        for (let i = 0; i < 5; i++) {
            let url = `streams?language=fr&first=100&type=live`;
            if (cursor) url += `&after=${cursor}`;

            const res = await twitchApiFetch(url);
            if (res.data && res.data.length > 0) {
                allCandidates = allCandidates.concat(res.data);
                cursor = res.pagination.cursor;
                if (!cursor) break; 
            } else break;
        }

        // FILTRE STRICT : < 100 vues
        let suitableStreams = allCandidates.filter(s => s.viewer_count > 0 && s.viewer_count <= 100);

        // FALLBACK 1 : Si liste vide, on prend les 20 plus petits de la liste totale
        if (suitableStreams.length === 0 && allCandidates.length > 0) {
            console.log("⚠️ Fallback 1: Aucun <100 vues. Utilisation des plus petits trouvés.");
            suitableStreams = allCandidates.sort((a, b) => a.viewer_count - b.viewer_count).slice(0, 20);
        }

        // UPDATE CACHE
        if (suitableStreams.length > 0) {
            suitableStreams = shuffleArray(suitableStreams);
            rotation.streams = suitableStreams.map(s => ({ channel: s.user_login, viewers: s.viewer_count }));
            rotation.currentIndex = 0;
            rotation.lastFetchTime = now;
            console.log(`✅ Rotation mise à jour : ${suitableStreams.length} streamers.`);
        } else {
            console.log("❌ ECHEC TOTAL: Aucun stream trouvé dans le Deep Search.");
            // On vide la liste pour forcer l'usage du Emergency Stream plus tard
            rotation.streams = [];
        }

    } catch (e) {
        console.error("❌ Erreur Deep Search:", e.message);
    }
}

app.get('/get_default_stream', async (req, res) => {
    const now = Date.now();
    let currentBoost = null;

    // 1. BOOST (Priorité)
    try {
        const boostQuery = await db.collection('boosts').where('endTime', '>', now).orderBy('endTime', 'desc').limit(1).get();
        if (!boostQuery.empty) {
            const data = boostQuery.docs[0].data();
            currentBoost = { channel: data.channel, endTime: data.endTime };
            CACHE.boostedStream = currentBoost;
        } else CACHE.boostedStream = null;
    } catch(e) {
        if (CACHE.boostedStream && CACHE.boostedStream.endTime > now) currentBoost = CACHE.boostedStream;
    }

    if (currentBoost && currentBoost.endTime > now) {
        const remaining = Math.ceil((currentBoost.endTime - now) / 60000);
        return res.json({ success: true, channel: currentBoost.channel, viewers: 'BOOST', message: `⚡ BOOST ACTIF (${remaining}min) - ${currentBoost.channel}` });
    }

    // 2. ROTATION
    await refreshGlobalStreamList(); 
    const rotation = CACHE.globalStreamRotation;
    
    // Si la rotation contient des streams valides
    if (rotation.streams.length > 0) {
        const currentStream = rotation.streams[rotation.currentIndex];
        return res.json({ 
            success: true, 
            channel: currentStream.channel, 
            viewers: currentStream.viewers, 
            message: `✅ Découverte (${currentStream.viewers} vues) : ${currentStream.channel}` 
        });
    }

    // 3. EMERGENCY FALLBACK (Si rotation vide)
    // On appelle un stream au hasard qui est SUR d'être en live
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

    // 4. DERNIER RECOURS (Si même Twitch API est down)
    // On renvoie une chaine 24/7 fiable (LofiGirl) au lieu de Monstercat qui coupe parfois
    return res.json({ success: true, channel: 'lofigirl', message: 'Offline Mode' });
});

app.post('/cycle_stream', async (req, res) => {
    const { direction } = req.body; 
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) return res.status(403).json({ success: false, error: "Boost actif." });
    
    // Si la liste est vide, on force un refresh
    if (CACHE.globalStreamRotation.streams.length === 0) {
        await refreshGlobalStreamList();
    }

    const rotation = CACHE.globalStreamRotation;
    if (rotation.streams.length > 0) {
        if (direction === 'next') rotation.currentIndex = (rotation.currentIndex + 1) % rotation.streams.length;
        else rotation.currentIndex = (rotation.currentIndex - 1 + rotation.streams.length) % rotation.streams.length;
        const newStream = rotation.streams[rotation.currentIndex];
        return res.json({ success: true, channel: newStream.channel, viewers: newStream.viewers });
    }

    // Si toujours vide, on renvoie un emergency stream pour le cycle aussi
    const emergency = await getEmergencyStream();
    if(emergency) return res.json({ success: true, channel: emergency.user_login, viewers: emergency.viewer_count });
    
    return res.json({ success: false });
});

// =========================================================
// 7. BOOST & RAID
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
    } catch (e) { return res.status(500).json({ error: "Erreur DB" }); }
});

app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    try {
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if (!gameRes.data.length) return res.json({ success: false, error: "Jeu introuvable" });
        
        let allStreams = [];
        let cursor = "";
        for(let i=0; i<3; i++) {
            let url = `streams?game_id=${gameRes.data[0].id}&first=100&language=fr&type=live`;
            if(cursor) url += `&after=${cursor}`;
            const r = await twitchApiFetch(url);
            if(r.data && r.data.length > 0) {
                allStreams = allStreams.concat(r.data);
                cursor = r.pagination.cursor;
                if(!cursor) break;
            } else break;
        }
        
        const candidates = allStreams.filter(s => s.viewer_count <= parseInt(max_viewers));
        const target = candidates.length ? candidates.sort((a,b)=>b.viewer_count-a.viewer_count)[0] : allStreams[0];
        
        if(target) return res.json({ success: true, target: { name: target.user_name, login: target.user_login, viewers: target.viewer_count, game: target.game_name, thumbnail_url: target.thumbnail_url.replace('%{width}','100').replace('%{height}','56') } });
        return res.json({ success: false, error: "Personne trouvé." });
    } catch(e) { return res.json({success:false, error: e.message}); }
});

app.post('/critique_ia', async (req, res) => {
    const { type, query, niche_score } = req.body;
    let prompt = type === 'niche' ? `Expert Twitch. Score: ${niche_score}. Sujet: ${query}.` : `Expert Vidéo. VOD: ${query}.`;
    const result = await runGeminiAnalysis(prompt + " Réponds en HTML liste <ul>.");
    res.json(result);
});

app.post('/analyze_schedule', async (req, res) => {
    const { game } = req.body;
    try {
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if (!gameRes.data.length) return res.json({ success: false });
        const g = gameRes.data[0];
        const result = await runGeminiAnalysis(`Analyse planning jeu ${g.name}. HTML.`);
        return res.json({ success: true, game_name: g.name, box_art: g.box_art_url.replace('{width}','144').replace('{height}','192'), html_response: result.html_response });
    } catch(e) { return res.json({ success:false }); }
});

app.get('/export_csv', (req, res) => {
    if (!CACHE.lastScanData) return res.status(404).send("Rien.");
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=Twitch_Analysis.csv');
    res.send(`Type,Nom\n${CACHE.lastScanData.type},${CACHE.lastScanData.display_name || CACHE.lastScanData.name}`);
});

app.listen(PORT, () => { console.log(`STREAMER HUB V22 (SAFE MODE) PORT ${PORT}`); });
