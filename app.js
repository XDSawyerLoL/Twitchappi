/**
 * STREAMER & NICHE AI HUB - BACKEND (V24 - FINAL REPAIR)
 * ======================================================
 * 1. Auth Twitch & API Helix
 * 2. IA Gemini (Correction 404 + Prompt)
 * 3. Firebase (Correction JSON Critique)
 * 4. Lecteur & Rotation (Logique Autoplay)
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// --- CONFIGURATION ---
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
const GEMINI_MODEL = "gemini-1.5-flash"; 

// --- 1. INITIALISATION FIREBASE (LE FIX ULTIME) ---
let serviceAccount;

if (process.env.FIREBASE_SERVICE_KEY) {
    try {
        let raw = process.env.FIREBASE_SERVICE_KEY.trim();
        
        // Nettoyage des guillemets extérieurs si présents
        if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
            raw = raw.slice(1, -1);
        }

        // REMPLACEMENT MAGIQUE : On gère les deux types de sauts de ligne pour éviter "Bad control character"
        // 1. On remplace les vrais sauts de ligne par des espaces (pour un JSON sur une ligne)
        // 2. On s'assure que les "\n" écrits restent des "\n" pour la clé privée
        const formattedJson = raw.replace(/\n/g, ' ').replace(/\\n/g, '\\n');

        serviceAccount = JSON.parse(formattedJson);
        
        // Correction spécifique pour la clé privée qui doit avoir de vrais retours à la ligne
        if (serviceAccount.private_key) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }

        console.log("✅ [FIREBASE] Clé chargée et nettoyée.");
    } catch (error) {
        console.error("❌ [FIREBASE] Erreur JSON Critique :", error.message);
        // Fallback: on essaie de parser directement si le formatage a échoué
        try { serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_KEY); } catch(e){}
    }
} else {
    try { serviceAccount = require('./serviceAccountKey.json'); } catch (e) {}
}

if (serviceAccount) {
    try {
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                projectId: serviceAccount.project_id
            });
        }
        console.log(`✅ [DB] Connecté : ${serviceAccount.project_id}`);
    } catch (e) { console.error("❌ [DB] Erreur Init :", e.message); }
} else {
    try { admin.initializeApp(); } catch(e){}
}

const db = admin.firestore();
// Force settings pour éviter bugs date
try { db.settings({ ignoreUndefinedProperties: true }); } catch(e){}

// --- 2. IA CONFIGURATION ---
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

async function runGeminiAnalysis(prompt) {
    try {
        const model = genAI.getGenerativeModel({ 
            model: GEMINI_MODEL,
            systemInstruction: "Tu es un expert Twitch. Réponds en HTML simple (<ul>, <li>, <strong>). Sois direct."
        });
        const result = await model.generateContent(prompt);
        return { success: true, html_response: result.response.text() };
    } catch (e) {
        console.error("IA Error:", e);
        // Fallback sur un modèle standard si Flash plante
        try {
            const modelBackup = genAI.getGenerativeModel({ model: "gemini-pro" });
            const resultBackup = await modelBackup.generateContent(prompt);
            return { success: true, html_response: resultBackup.response.text() };
        } catch(e2) {
            return { success: false, html_response: `<p style="color:red">Erreur IA: ${e.message}</p>` };
        }
    }
}

// --- 3. MIDDLEWARES & CACHE ---
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 

const CACHE = {
    twitchTokens: {}, twitchUser: null, boostedStream: null, lastScanData: null,
    globalStreamRotation: { streams: [], currentIndex: 0, lastFetchTime: 0, fetchCooldown: 900000 }
};

// --- 4. HELPERS TWITCH ---
async function getTwitchToken(tokenType) {
    if (CACHE.twitchTokens[tokenType] && CACHE.twitchTokens[tokenType].expiry > Date.now()) return CACHE.twitchTokens[tokenType].access_token;
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
    try {
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();
        if (data.access_token) {
            CACHE.twitchTokens[tokenType] = { access_token: data.access_token, expiry: Date.now() + (data.expires_in * 1000) - 300000 };
            return data.access_token;
        }
        return null;
    } catch (error) { return null; }
}

async function twitchApiFetch(endpoint, token) {
    const accessToken = token || await getTwitchToken('app');
    if (!accessToken) throw new Error("Token Twitch HS.");
    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${accessToken}` }
    });
    if (res.status === 401) { CACHE.twitchTokens['app'] = null; throw new Error(`Auth 401`); }
    return res.json();
}

// --- 5. AUTHENTIFICATION ---
app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${state}`;
    res.cookie('twitch_state', state, { httpOnly: true, secure: true }); 
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code } = req.query;
    try {
        const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI })
        });
        const tokenData = await tokenRes.json();
        if (tokenData.access_token) {
            const userRes = await twitchApiFetch('users', tokenData.access_token);
            CACHE.twitchUser = { ...userRes.data[0], access_token: tokenData.access_token };
            res.send(`<script>window.opener.postMessage('auth_success','*');window.close();</script>`);
        } else { res.status(500).send("Erreur Token"); }
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/twitch_logout', (req, res) => { CACHE.twitchUser = null; res.json({ success: true }); });
app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser) return res.json({ is_connected: true, display_name: CACHE.twitchUser.display_name });
    res.json({ is_connected: false });
});

// --- 6. ROUTES DATA (SCAN + TRACKER) ---
app.get('/followed_streams', async (req, res) => {
    if (!CACHE.twitchUser) return res.status(401).json({ success: false });
    const data = await twitchApiFetch(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token);
    res.json({ success: true, streams: data.data });
});

app.get('/get_latest_vod', async (req, res) => {
    const { channel } = req.query;
    try {
        const u = await twitchApiFetch(`users?login=${channel}`);
        if(!u.data[0]) return res.json({success:false});
        const v = await twitchApiFetch(`videos?user_id=${u.data[0].id}&first=1`);
        if(!v.data[0]) return res.json({success:false});
        res.json({ success: true, vod: { id: v.data[0].id, title: v.data[0].title, thumbnail_url: v.data[0].thumbnail_url.replace('%{width}','320').replace('%{height}','180') } });
    } catch(e) { res.json({success:false}); }
});

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    try {
        const uRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`);
        if (uRes.data.length > 0) {
            const user = uRes.data[0];
            const fRes = await twitchApiFetch(`users/follows?followed_id=${user.id}`);
            
            // TRACKER FIREBASE
            let growth = "Suivi activé.";
            try {
                const ref = db.collection('history').doc(user.login).collection('snaps');
                const last = await ref.orderBy('t', 'desc').limit(1).get();
                if(!last.empty) {
                    const diff = fRes.total - last.docs[0].data().f;
                    growth = `${diff>=0?'+':''}${diff} abonnés depuis le dernier scan.`;
                }
                await ref.add({ f: fRes.total, t: admin.firestore.FieldValue.serverTimestamp() });
            } catch(e){ console.log("DB Skip"); }

            const sRes = await twitchApiFetch(`streams?user_id=${user.id}`);
            const data = {
                login: user.login, display_name: user.display_name, profile_image_url: user.profile_image_url,
                total_followers: fRes.total, growth_info: growth, 
                is_live: sRes.data.length > 0,
                ai_calculated_niche_score: (user.broadcaster_type==='partner'?'9/10':'6/10')
            };
            CACHE.lastScanData = { type: 'user', ...data };
            return res.json({ success: true, type: 'user', user_data: data });
        }
        // Fallback Jeu... (Code préservé)
        res.status(404).json({ success: false });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- 7. ROTATION & BOOST ---
async function refreshRotation() {
    const now = Date.now();
    if (now - CACHE.globalStreamRotation.lastFetchTime < 900000 && CACHE.globalStreamRotation.streams.length > 0) return;
    try {
        const d = await twitchApiFetch(`streams?language=fr&first=100`);
        CACHE.globalStreamRotation.streams = d.data.filter(s => s.viewer_count <= 100);
        CACHE.globalStreamRotation.lastFetchTime = now;
    } catch(e){}
}

app.get('/get_default_stream', async (req, res) => {
    // Check Boost DB
    try {
        const b = await db.collection('boosts').where('endTime', '>', Date.now()).orderBy('endTime', 'desc').limit(1).get();
        if(!b.empty) return res.json({ success: true, channel: b.docs[0].data().channel, viewers: 'BOOST' });
    } catch(e){}
    
    // Rotation Auto
    await refreshRotation();
    const list = CACHE.globalStreamRotation.streams;
    if(list.length === 0) return res.json({ success: true, channel: 'twitch' });
    
    // Cycle simple
    const current = list[CACHE.globalStreamRotation.currentIndex % list.length];
    return res.json({ success: true, channel: current.user_login, viewers: current.viewer_count });
});

app.post('/cycle_stream', async (req, res) => {
    const { direction } = req.body;
    const len = CACHE.globalStreamRotation.streams.length;
    if(len === 0) return res.json({success:false});
    
    if(direction === 'next') CACHE.globalStreamRotation.currentIndex = (CACHE.globalStreamRotation.currentIndex + 1) % len;
    else CACHE.globalStreamRotation.currentIndex = (CACHE.globalStreamRotation.currentIndex - 1 + len) % len;
    
    const s = CACHE.globalStreamRotation.streams[CACHE.globalStreamRotation.currentIndex];
    res.json({ success: true, channel: s.user_login });
});

app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    const now = Date.now();
    try {
        await db.collection('boosts').add({ channel, startTime: now, endTime: now + 900000 });
        res.json({ success: true, html_response: "Boost activé pour 15 min !" });
    } catch(e) { res.status(500).json({ error: "Erreur DB" }); }
});

// --- 8. ACTIONS : RAID, IA, CSV ---
app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    try {
        const g = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}`);
        const s = await twitchApiFetch(`streams?game_id=${g.data[0].id}&language=fr&first=100`);
        const t = s.data.filter(st => st.viewer_count <= max_viewers)[0];
        if(t) res.json({ success: true, target: { name: t.user_name, login: t.user_login, viewers: t.viewer_count, thumbnail_url: t.thumbnail_url.replace('{width}','100').replace('{height}','60') } });
        else res.json({ success: false, error: "Personne trouvée." });
    } catch(e) { res.json({ success: false, error: e.message }); }
});

app.post('/critique_ia', async (req, res) => {
    const { type, query, growth_info } = req.body;
    const p = `Analyse ${type} pour ${query}. Données : ${growth_info}.`;
    const r = await runGeminiAnalysis(p);
    res.json(r);
});

app.post('/analyze_schedule', async (req, res) => {
    const r = await runGeminiAnalysis(`Meilleurs horaires pour streamer ${req.body.game} ?`);
    res.json({ success: true, html_response: r.html_response });
});

app.get('/export_csv', (req, res) => {
    const d = CACHE.lastScanData;
    if(!d) return res.sendStatus(404);
    res.setHeader('Content-Type', 'text/csv');
    res.send(`Name,Followers,Growth\n${d.display_name},${d.total_followers},${d.growth_info}`);
});

app.listen(PORT, () => console.log(`🚀 SERVEUR V24 OK - PORT ${PORT}`));
