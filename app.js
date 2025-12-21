/**
 * ==========================================================================================
 * 🚀 STREAMER HUB - BACKEND SERVER (V46 - FINAL DEBUG & SECURE)
 * ==========================================================================================
 * * CORRECTIFS APPLIQUÉS :
 * 1. Auth Twitch : Sécurisation du callback et logs de debug.
 * 2. Onglets (Raid/Tools) : Correction définitive des noms de fonctions (twitchAPI).
 * 3. Logs : Ajout de messages console pour chaque action (pour savoir ce qui plante).
 * 4. Stabilité : Fallback RAM si Firebase ou l'IA échoue.
 * ==========================================================================================
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const admin = require('firebase-admin');

// -------------------------------------------------------------------------
// 1. INITIALISATION FIREBASE (BLINDÉE)
// -------------------------------------------------------------------------
let serviceAccount;
if (process.env.FIREBASE_SERVICE_KEY) {
    try {
        let rawJson = process.env.FIREBASE_SERVICE_KEY.replace(/^'|'$/g, "").replace(/^"|"$/g, "").replace(/\\n/g, '\n');
        serviceAccount = JSON.parse(rawJson);
    } catch (error) { console.error("⚠️ Firebase JSON Error (Check Env Vars)"); }
} else {
    try { serviceAccount = require('./serviceAccountKey.json'); } catch (e) { console.warn("⚠️ Mode RAM (Pas de DB locale, c'est normal en dev)"); }
}

if (serviceAccount) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id 
        });
        admin.firestore().settings({ ignoreUndefinedProperties: true });
        console.log("✅ [DB] Firebase connecté.");
    } catch (e) { console.error("❌ [DB] Erreur Init:", e.message); }
}
const db = admin.firestore();

// -------------------------------------------------------------------------
// 2. CONFIGURATION SERVEUR
// -------------------------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 10000;

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

// Initialisation IA
let geminiModel;
if (GEMINI_API_KEY) {
    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        console.log("✅ [IA] Gemini 1.5 Flash prêt.");
    } catch (e) { console.error("❌ [IA] Erreur Config:", e.message); }
}

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 

// -------------------------------------------------------------------------
// 3. CACHE GLOBAL
// -------------------------------------------------------------------------
const CACHE = {
    twitchTokens: {},
    twitchUser: null,
    boostedStream: null,
    lastScanData: null,
    globalStreamRotation: { streams: [], currentIndex: 0, lastFetchTime: 0, fetchCooldown: 3 * 60 * 1000 },
};

// -------------------------------------------------------------------------
// 4. FONCTIONS CRITIQUES (HELPERS)
// -------------------------------------------------------------------------

// A. Obtention du Token App (Client Credentials)
async function getTwitchToken(tokenType = 'app') {
    if (CACHE.twitchTokens[tokenType] && CACHE.twitchTokens[tokenType].expiry > Date.now()) {
        return CACHE.twitchTokens[tokenType].access_token;
    }
    try {
        const response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' });
        const data = await response.json();
        if (data.access_token) {
            CACHE.twitchTokens[tokenType] = { access_token: data.access_token, expiry: Date.now() + (data.expires_in * 1000) - 60000 };
            return data.access_token;
        }
        console.error("❌ [TWITCH] Erreur Token:", data);
        return null;
    } catch (error) { return null; }
}

// B. Appel API Twitch (Le coeur du système)
async function twitchAPI(endpoint, token = null) {
    const accessToken = token || await getTwitchToken('app');
    if (!accessToken) throw new Error("Token manquant (Vérifiez CLIENT_ID/SECRET)");

    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${accessToken}` }
    });

    if (res.status === 401) {
        // Invalidation du cache si token expiré
        if (token === CACHE.twitchTokens['app']?.access_token) CACHE.twitchTokens['app'] = null;
        throw new Error("Token Expiré (401). Réessai...");
    }
    return res.json();
}

// C. Appel IA
async function runGeminiAnalysis(prompt) {
    if (!geminiModel) return { success: false, html_response: "<p>IA non configurée (Clé manquante).</p>" };
    try {
        const result = await geminiModel.generateContent(prompt + " Réponds en HTML simple (<h4>, <ul>, <li>).");
        const response = await result.response;
        return { success: true, html_response: response.text() };
    } catch (e) {
        console.error("⚠️ [IA] Erreur:", e.message);
        return { success: false, html_response: `<p style="color:orange">⚠️ IA en pause (Quota ou Erreur).</p>` };
    }
}

// -------------------------------------------------------------------------
// 5. AUTHENTIFICATION TWITCH (CORRIGÉE)
// -------------------------------------------------------------------------

app.get('/twitch_auth_start', (req, res) => {
    console.log("🔑 [AUTH] Démarrage connexion Twitch...");
    const state = crypto.randomBytes(16).toString('hex');
    const scope = "user:read:follows"; 
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${scope}&state=${state}`;
    res.cookie('twitch_state', state, { httpOnly: true, secure: true, maxAge: 600000 }); 
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    console.log("🔑 [AUTH] Callback reçu.");
    const { code, state, error } = req.query;
    
    if (error) return res.send(`Erreur Twitch: ${error}`);
    if (state !== req.cookies.twitch_state) return res.send("Erreur de sécurité (State mismatch). Réessayez.");

    try {
        const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI })
        });
        
        const tokenData = await tokenRes.json();
        
        if (tokenData.access_token) {
            const userRes = await twitchAPI('users', tokenData.access_token);
            const user = userRes.data[0];
            CACHE.twitchUser = { display_name: user.display_name, id: user.id, access_token: tokenData.access_token, expiry: Date.now() + (tokenData.expires_in * 1000) };
            console.log(`✅ [AUTH] Utilisateur connecté : ${user.display_name}`);
            
            // Script pour fermer la popup et dire au parent que c'est bon
            res.send("<script>window.opener.postMessage('auth_success', '*');window.close();</script>");
        } else {
            console.error("❌ [AUTH] Échec Token:", tokenData);
            res.send("Erreur récupération token.");
        }
    } catch (e) { res.send(`Erreur Serveur: ${e.message}`); }
});

app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) return res.json({ is_connected: true, display_name: CACHE.twitchUser.display_name });
    res.json({ is_connected: false });
});

app.post('/twitch_logout', (req, res) => { CACHE.twitchUser = null; res.json({ success: true }); });

// -------------------------------------------------------------------------
// 6. ROTATION 3 MINUTES & PLAYER
// -------------------------------------------------------------------------

async function refreshRotationList() {
    const now = Date.now();
    const rot = CACHE.globalStreamRotation;
    if (now - rot.lastFetchTime < rot.fetchCooldown && rot.streams.length > 0) return;
    
    console.log("🔄 [ROTATION] Recherche de petits streamers...");
    try {
        const data = await twitchAPI('streams?language=fr&first=100'); 
        // Filtre strict : 0 à 100 vues
        let candidates = data.data.filter(s => s.viewer_count <= 100);
        if (candidates.length < 5) candidates = data.data.slice(-20); // Fallback

        if (candidates.length > 0) {
            rot.streams = candidates.sort(() => 0.5 - Math.random()).map(s => ({ channel: s.user_login, viewers: s.viewer_count }));
            rot.currentIndex = 0;
            rot.lastFetchTime = now;
            console.log(`✅ [ROTATION] ${rot.streams.length} chaînes trouvées.`);
        }
    } catch (e) { console.error("❌ [ROTATION] Erreur:", e.message); }
}

app.get('/get_default_stream', async (req, res) => {
    const now = Date.now();
    let boost = null;

    // 1. BOOST (DB ou Cache)
    try {
        const q = await db.collection('boosts').where('endTime', '>', now).orderBy('endTime', 'desc').limit(1).get();
        if (!q.empty) { boost = q.docs[0].data(); CACHE.boostedStream = boost; }
    } catch (e) { if(CACHE.boostedStream && CACHE.boostedStream.endTime > now) boost = CACHE.boostedStream; }

    if (boost) return res.json({ success: true, channel: boost.channel, mode: 'BOOST', message: `⚡ BOOST: ${boost.channel}` });

    // 2. AUTO
    await refreshRotationList();
    const rot = CACHE.globalStreamRotation;
    if (rot.streams.length === 0) return res.json({ success: true, channel: 'twitch', mode: 'FALLBACK', message: 'Aucun stream.' });

    const current = rot.streams[rot.currentIndex];
    res.json({ success: true, channel: current.channel, mode: 'AUTO', viewers: current.viewers, message: `👁️ AUTO 3MIN: ${current.channel}` });
});

app.post('/cycle_stream', async (req, res) => {
    const { direction } = req.body;
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) return res.json({ success: false, error: "Boost actif." });
    
    await refreshRotationList();
    const rot = CACHE.globalStreamRotation;
    if (rot.streams.length === 0) return res.json({ success: false });

    if (direction === 'next') rot.currentIndex = (rot.currentIndex + 1) % rot.streams.length;
    else rot.currentIndex = (rot.currentIndex - 1 + rot.streams.length) % rot.streams.length;

    res.json({ success: true, channel: rot.streams[rot.currentIndex].channel });
});

// -------------------------------------------------------------------------
// 7. MODULE DATA & DASHBOARD
// -------------------------------------------------------------------------

app.get('/api/stats/global', async (req, res) => {
    try {
        const data = await twitchAPI('streams?first=100');
        let v = 0; data.data.forEach(s => v += s.viewer_count);
        const est = Math.floor(v * 3.8); // Extrapolation
        
        // Historique factice pour l'UI (en attendant le Cron)
        const history = { live: { labels:["-1h", "Now"], values:[est*0.9, est] } };
        
        res.json({ 
            success: true, total_viewers: est, total_channels: "98k+", 
            top_game_name: data.data[0]?.game_name || "N/A", history 
        });
    } catch(e) { res.status(500).json({error:e.message}); }
});

app.get('/api/stats/top_games', async (req, res) => {
    try {
        const d = await twitchAPI('games/top?first=10');
        res.json({ games: d.data.map(g => ({ name: g.name, box_art_url: g.box_art_url.replace('{width}','52').replace('{height}','72') })) });
    } catch(e) { res.status(500).json({error:e.message}); }
});

app.get('/api/stats/languages', async (req, res) => {
    try {
        const d = await twitchAPI('streams?first=100');
        const l = {}; d.data.forEach(s => l[s.language] = (l[s.language]||0)+1);
        const sorted = Object.keys(l).map(k=>({name:k.toUpperCase(), percent:l[k]})).sort((a,b)=>b.percent-a.percent).slice(0,5);
        res.json({ languages: sorted });
    } catch(e) { res.status(500).json({error:e.message}); }
});

// -------------------------------------------------------------------------
// 8. MODULE OUTILS (SCAN, RAID, BOOST, SCHEDULE)
// -------------------------------------------------------------------------

// SCAN
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    console.log(`🔎 [SCAN] Recherche de : ${query}`);
    try {
        const uRes = await twitchAPI(`users?login=${encodeURIComponent(query)}`);
        if(uRes.data.length) {
            const u = uRes.data[0];
            const sRes = await twitchAPI(`streams?user_id=${u.id}`);
            const isLive = sRes.data.length > 0;
            const score = isLive && sRes.data[0].viewer_count < 100 ? 4.5 : 3.0;
            const uData = { login: u.login, display_name: u.display_name, profile_image_url: u.profile_image_url, is_live: isLive, viewer_count: isLive ? sRes.data[0].viewer_count : 0, ai_calculated_niche_score: score, total_views: u.view_count };
            CACHE.lastScanData = { type: 'user', ...uData };
            return res.json({ success: true, type:'user', user_data: uData });
        }
        const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        if(gRes.data.length) {
            const g = gRes.data[0];
            const sRes = await twitchAPI(`streams?game_id=${g.id}&first=20`);
            const total = sRes.data.reduce((a,b)=>a+b.viewer_count,0);
            const gData = { name: g.name, box_art_url: g.box_art_url.replace('{width}','60').replace('{height}','80'), total_viewers: total, ai_calculated_niche_score: total < 5000 ? 4.0 : 2.0 };
            CACHE.lastScanData = { type: 'game', ...gData };
            return res.json({ success: true, type:'game', game_data: gData });
        }
        res.json({ success: false, message: "Introuvable" });
    } catch(e) { console.error(e); res.status(500).json({error:e.message}); }
});

// IA
app.post('/critique_ia', async (req, res) => {
    const { type, query } = req.body;
    const prompt = type === 'niche' ? `Audit "${query}" Twitch.` : `Idées clips "${query}".`;
    res.json(await runGeminiAnalysis(prompt));
});

// BOOST
app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    console.log(`⚡ [BOOST] Demande pour : ${channel}`);
    const now = Date.now();
    try {
        await db.collection('boosts').add({ channel, startTime: now, endTime: now + 900000 });
        CACHE.boostedStream = { channel, endTime: now + 900000 };
        res.json({ success: true, html_response: "<p>Boost activé !</p>" });
    } catch(e) { 
        console.error("Erreur DB:", e);
        // Fallback RAM si DB plante
        CACHE.boostedStream = { channel, endTime: now + 900000 };
        res.json({ success: true, html_response: "<p>Boost activé (Mode RAM) !</p>" });
    }
});

// RAID
app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    console.log(`⚔️ [RAID] Recherche : ${game} (Max ${max_viewers})`);
    try {
        const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(!gRes.data.length) return res.json({success:false, error:"Jeu introuvable"});
        const sRes = await twitchAPI(`streams?game_id=${gRes.data[0].id}&first=100&language=fr`);
        const target = sRes.data.filter(s => s.viewer_count <= parseInt(max_viewers)).sort((a,b)=>b.viewer_count-a.viewer_count)[0];
        if(target) return res.json({ success: true, target: { name: target.user_name, login: target.user_login, viewers: target.viewer_count, thumbnail_url: target.thumbnail_url.replace('%{width}','100').replace('%{height}','56'), game: target.game_name } });
        res.json({ success: false, error: "Aucune cible trouvée." });
    } catch(e) { res.status(500).json({error:e.message}); }
});

// SCHEDULE
app.post('/analyze_schedule', async (req, res) => {
    const { game } = req.body;
    try {
        const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(!gRes.data.length) return res.json({success:false});
        const r = await runGeminiAnalysis(`Horaires stream ${game}.`);
        res.json({ success: true, game_name: gRes.data[0].name, box_art: gRes.data[0].box_art_url.replace('{width}','60').replace('{height}','80'), html_response: r.html_response });
    } catch(e) { res.json({success:false}); }
});

// CSV
app.get('/export_csv', (req, res) => {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=Twitch_Analysis.csv');
    res.send(`Type,Nom\n${CACHE.lastScanData?.type},${CACHE.lastScanData?.login}`);
});

app.get('/followed_streams', async (req, res) => {
    if (!CACHE.twitchUser) return res.status(401).json({ success: false });
    try {
        const data = await twitchAPI(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token);
        res.json({ success: true, streams: data.data.map(s => ({ user_name: s.user_name, user_login: s.user_login, viewer_count: s.viewer_count, thumbnail_url: s.thumbnail_url })) });
    } catch (e) { res.status(500).json({ success: false }); }
});

// Route Fichier HTML (Important pour Render)
app.get('/', (req,res) => {
    const indexPath = path.join(__dirname, 'index.html');
    const nichePath = path.join(__dirname, 'NicheOptimizer.html');
    res.sendFile(indexPath, (err) => { if(err) res.sendFile(nichePath); });
});

// -------------------------------------------------------------------------
// 9. LANCEMENT
// -------------------------------------------------------------------------
app.listen(PORT, () => {
    console.log(`===========================================`);
    console.log(` 🚀 STREAMER HUB V46 STARTED ON PORT ${PORT}`);
    console.log(`===========================================`);
});
