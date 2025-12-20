/**
 * ====================================================================================
 * STREAMER & NICHE AI HUB - BACKEND (V23 - ANALYST PRO EDITION)
 * ====================================================================================
 * CORRECTIFS MAJEURS :
 * 1. Followers : Utilisation du nouvel endpoint Helix 'channels/followers'.
 * 2. VOD : Récupération robuste de la dernière archive.
 * 3. Schedule : Analyse de saturation pour prédire les meilleurs créneaux (Style TwitchTracker).
 * 4. IA : Coach de performance + Expert Planning.
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

// --- 1. CONFIGURATION FIREBASE (ROBUSTE) ---
let serviceAccount;
if (process.env.FIREBASE_SERVICE_KEY) {
    try {
        let rawJson = process.env.FIREBASE_SERVICE_KEY;
        if (rawJson.startsWith("'") && rawJson.endsWith("'")) rawJson = rawJson.slice(1, -1);
        if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.slice(1, -1);
        rawJson = rawJson.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n');
        serviceAccount = JSON.parse(rawJson);
    } catch (error) { console.error("❌ Erreur Firebase Env:", error.message); }
} else {
    try { serviceAccount = require('./serviceAccountKey.json'); } catch (e) {}
}

if (serviceAccount) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id 
        });
    } catch (e) { console.error("❌ Erreur Init Admin:", e.message); }
} else { try { admin.initializeApp(); } catch(e){} }

const db = admin.firestore();
if (serviceAccount) { try { db.settings({ projectId: serviceAccount.project_id, ignoreUndefinedProperties: true }); } catch(e) {} }

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

// CACHE
const CACHE = {
    twitchTokens: {}, twitchUser: null, boostedStream: null, lastScanData: null,     
    globalStreamRotation: { streams: [], currentIndex: 0, lastFetchTime: 0, fetchCooldown: 10 * 60 * 1000 }
};

// --- HELPERS ---
async function getTwitchToken(tokenType) {
    if (CACHE.twitchTokens[tokenType] && CACHE.twitchTokens[tokenType].expiry > Date.now()) return CACHE.twitchTokens[tokenType].access_token;
    try {
        const r = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' });
        const d = await r.json();
        if (d.access_token) {
            CACHE.twitchTokens[tokenType] = { access_token: d.access_token, expiry: Date.now() + (d.expires_in * 1000) - 300000 };
            return d.access_token;
        }
        return null;
    } catch (e) { return null; }
}

async function twitchApiFetch(endpoint, token) {
    const t = token || await getTwitchToken('app');
    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, { headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${t}` } });
    if (res.status === 401) { CACHE.twitchTokens['app'] = null; throw new Error(`Token expiré.`); }
    if (!res.ok) throw new Error(`Erreur API: ${res.status}`);
    return res.json();
}

async function runGeminiAnalysis(prompt, type="standard") {
    let sysInstruct = "Tu es un expert Twitch. Réponds en HTML simple.";
    if (type === 'coach') sysInstruct = "Tu es un Coach Data Analyst bienveillant. Tu expliques les chiffres simplement. Tu donnes des conseils motivants.";
    if (type === 'scheduler') sysInstruct = "Tu es un expert en planification stratégique. Tu analyses la saturation (ratio viewers/streamers) pour trouver les opportunités (Océan Bleu).";

    try {
        const r = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { systemInstruction: sysInstruct }
        });
        return { success: true, html_response: r.text.trim() };
    } catch (e) { return { success: false, html_response: `<p>IA non disponible.</p>` }; }
}

async function handleHistoryAndStats(type, id, newData) {
    const docRef = db.collection('history_stats').doc(String(id));
    let doc; try { doc = await docRef.get(); } catch(e) { return { trend: 'stable', diff: 0 }; }
    let analysis = { trend: 'stable', diff: 0, previous: 0 };
    
    if (doc.exists) {
        const old = doc.data();
        if (type === 'user') {
            const diff = (newData.total_followers || 0) - (old.total_followers || 0);
            analysis.diff = diff;
            analysis.previous = old.total_followers;
            analysis.trend = diff > 0 ? 'up' : (diff < 0 ? 'down' : 'stable');
        }
        await docRef.update({ ...newData, last_updated: admin.firestore.FieldValue.serverTimestamp() });
    } else {
        analysis.trend = 'new';
        await docRef.set({ ...newData, first_seen: admin.firestore.FieldValue.serverTimestamp() });
    }
    return analysis;
}

// --- ROTATION DEEP DIVE ---
async function refreshGlobalStreamList() {
    const now = Date.now();
    const rot = CACHE.globalStreamRotation;
    if (now - rot.lastFetchTime < rot.fetchCooldown && rot.streams.length > 0) return;
    
    let allStreams = [];
    let cursor = "";
    try {
        for (let i = 0; i < 5; i++) {
            let url = `streams?language=fr&first=100` + (cursor ? `&after=${cursor}` : ``);
            const res = await twitchApiFetch(url);
            if (!res.data || res.data.length === 0) break;
            const small = res.data.filter(s => s.viewer_count > 0 && s.viewer_count <= 100);
            allStreams = allStreams.concat(small);
            if (allStreams.length >= 50) break;
            cursor = res.pagination.cursor; if (!cursor) break;
        }
        if (allStreams.length > 0) {
            allStreams.sort(() => Math.random() - 0.5);
            rot.streams = allStreams.map(s => ({ channel: s.user_login, viewers: s.viewer_count }));
            rot.currentIndex = 0;
            rot.lastFetchTime = now;
        } else { rot.streams = [{channel:'twitch', viewers:0}]; }
    } catch (e) {}
}

// --- ROUTES API ---

// 1. SCAN ANALYTICS (FIX FOLLOWERS & VOD)
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    try {
        // User Scan
        const uRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`);
        if (uRes.data.length > 0) {
            const u = uRes.data[0];
            
            // FIX FOLLOWERS: Utilisation de 'channels/followers'
            let followers = 0;
            try { 
                const f = await twitchApiFetch(`channels/followers?broadcaster_id=${u.id}&first=1`); 
                followers = f.total; 
            } catch(e){ console.log("Err Followers", e.message); }
            
            const uData = { 
                login: u.login, display_name: u.display_name, id: u.id, 
                profile_image_url: u.profile_image_url, total_followers: followers, total_views: u.view_count, broadcaster_type: u.broadcaster_type
            };
            
            // Historique
            const h = await handleHistoryAndStats('user', u.id, uData);
            
            // Notation
            let stars = 3;
            if (h.trend === 'up') stars += 1;
            if (h.diff > 20) stars += 1;
            if (h.trend === 'down') stars -= 1;
            if (u.broadcaster_type === 'partner') stars = 5;
            stars = Math.min(Math.max(stars, 1), 5);

            CACHE.lastScanData = { type: 'user', ...uData, history: h, stars };
            return res.json({ success: true, type: 'user', user_data: uData, history: h, stars });
        }
        
        // Game Scan (Fallback)
        const gRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        if(gRes.data.length > 0) {
            const g = gRes.data[0];
            const sRes = await twitchApiFetch(`streams?game_id=${g.id}&first=100`);
            const totalV = sRes.data.reduce((a,b)=>a+b.viewer_count,0);
            const gData = { name: g.name, id: g.id, box_art_url: g.box_art_url, total_streamers: sRes.data.length, total_viewers: totalV };
            return res.json({ success: true, type: 'game', game_data: gData });
        }
        return res.status(404).json({success:false, message:"Inconnu"});
    } catch(e) { return res.status(500).json({success:false, error: e.message}); }
});

// 2. VOD REPURPOSING (FIX)
app.get('/get_latest_vod', async (req, res) => {
    const channel = req.query.channel;
    if(!channel) return res.status(400).json({error:"Manque channel"});
    
    try {
        const uRes = await twitchApiFetch(`users?login=${channel}`);
        if(uRes.data.length === 0) return res.status(404).json({error:"User inconnu"});
        const userId = uRes.data[0].id;
        
        const vRes = await twitchApiFetch(`videos?user_id=${userId}&type=archive&first=1`);
        if(vRes.data.length === 0) return res.json({success:false, message:"Pas de VOD"});
        
        const vod = vRes.data[0];
        // On renvoie les infos pour l'IA
        return res.json({
            success: true,
            vod: {
                id: vod.id,
                title: vod.title,
                url: vod.url,
                thumbnail_url: vod.thumbnail_url.replace('%{width}','320').replace('%{height}','180'),
                duration: vod.duration,
                created_at: vod.created_at
            }
        });
    } catch(e) { return res.status(500).json({error:e.message}); }
});

// 3. IA COACH & REPURPOSE
app.post('/critique_ia', async (req, res) => {
    const { type, query, history_data, stars, vod_data, game_data } = req.body;
    let prompt = "";
    let persona = "coach";

    if (type === 'niche') {
        const growth = history_data?.diff || 0;
        prompt = `
        STREAMER: "${query}". NOTE: ${stars}/5.
        STATS: ${growth >= 0 ? '+' : ''}${growth} abonnés récents.
        
        En tant que Coach Twitch, donne 3 conseils ultra-concrets pour améliorer cette chaîne.
        Ne sois pas générique. Parle de rétention, de titre, ou d'interaction.
        Termine par une phrase de motivation type "Loup de Wall Street".
        `;
    } else if (type === 'repurpose') {
        prompt = `
        VOD: "${vod_data.title}". Durée: ${vod_data.duration}.
        En tant qu'expert TikTok/Shorts, propose 3 idées de clips viraux basés sur ce titre et cette durée.
        Donne des titres "Pute-à-clic" pour ces clips.
        `;
    } else if (type === 'schedule') {
        persona = "scheduler";
        prompt = `
        JEU: ${game_data.name}.
        CONCURRENCE: ${game_data.total_streamers} streamers pour ${game_data.total_viewers} viewers.
        RATIO: ${(game_data.total_viewers/Math.max(1,game_data.total_streamers)).toFixed(1)} viewers/streamer.
        
        Analyse ce marché. 
        1. Est-ce saturé ? (Oui/Non/Opportunité).
        2. Quels sont les "Jours en Or" théoriques pour ce type de jeu (Week-end vs Semaine) ?
        3. Quelle plage horaire viser pour éviter les gros streamers ?
        `;
    }
    
    const r = await runGeminiAnalysis(prompt, persona);
    res.json(r);
});

// 4. SMART SCHEDULE (Nouveau Module)
app.post('/analyze_schedule', async (req, res) => {
    const { game } = req.body;
    try {
        const gRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(gRes.data.length === 0) return res.json({success:false, error:"Jeu introuvable"});
        
        const g = gRes.data[0];
        const sRes = await twitchApiFetch(`streams?game_id=${g.id}&first=100`); // Échantillon top 100
        
        const totalV = sRes.data.reduce((a,b)=>a+b.viewer_count,0);
        const totalS = sRes.data.length;
        
        // On prépare les données pour l'IA
        const gameData = { name: g.name, total_viewers: totalV, total_streamers: totalS };
        
        return res.json({
            success: true,
            game_data: gameData,
            box_art: g.box_art_url.replace('{width}','120').replace('{height}','160')
        });
    } catch(e) { return res.status(500).json({error:e.message}); }
});

// 5. RAID & BOOST & LECTEUR (Standards V22)
app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    try {
        const gRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(gRes.data.length===0) return res.json({error:"Jeu introuvable"});
        const sRes = await twitchApiFetch(`streams?game_id=${gRes.data[0].id}&first=100&language=fr`);
        const target = sRes.data.filter(s=>s.viewer_count<=max_viewers).sort((a,b)=>b.viewer_count-a.viewer_count)[0];
        if(target) {
            const uRes = await twitchApiFetch(`users?id=${target.user_id}`);
            const avatar = (uRes.data.length>0) ? uRes.data[0].profile_image_url : "";
            return res.json({success:true, target: { name: target.user_name, login: target.user_login, viewers: target.viewer_count, thumbnail_url: target.thumbnail_url.replace('{width}','320').replace('{height}','180'), avatar_url: avatar }});
        }
        return res.json({error:"Aucune cible."});
    } catch(e){ return res.status(500).json({error:"Erreur"}); }
});

app.get('/get_default_stream', async (req, res) => {
    try {
        const q = await db.collection('boosts').where('endTime', '>', Date.now()).limit(1).get();
        if(!q.empty) { const b = q.docs[0].data(); return res.json({ success: true, channel: b.channel, viewers: 'BOOST', message: '🔥 BOOST' }); }
    } catch(e){}
    await refreshGlobalStreamList();
    const r = CACHE.globalStreamRotation;
    if(r.streams.length === 0) return res.json({success:true, channel:'twitch'});
    const s = r.streams[r.currentIndex];
    return res.json({ success: true, channel: s.channel, viewers: s.viewers, message: `Découverte (${s.viewers})` });
});

app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    try {
        const q = await db.collection('boosts').where('endTime', '>', Date.now()).get();
        if(!q.empty) return res.json({error: "Slot occupé."});
        await db.collection('boosts').add({ channel, startTime: Date.now(), endTime: Date.now()+(15*60000) });
        return res.json({ success: true, html_response: "<p style='color:#0f0'>Boost activé !</p>" });
    } catch(e) { return res.json({error: "Erreur DB"}); }
});

app.post('/cycle_stream', async (req, res) => {
    const r = CACHE.globalStreamRotation;
    if(r.streams.length === 0) await refreshGlobalStreamList();
    if(req.body.direction === 'next') r.currentIndex = (r.currentIndex + 1) % r.streams.length;
    else r.currentIndex = (r.currentIndex - 1 + r.streams.length) % r.streams.length;
    return res.json({ success: true, channel: r.streams[r.currentIndex]?.channel || 'twitch' });
});

// AUTH
app.get('/twitch_auth_start', (req, res) => {
    const s = crypto.randomBytes(16).toString('hex');
    res.cookie('twitch_state', s, {httpOnly:true, secure:true});
    res.redirect(`https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${s}`);
});
app.get('/twitch_auth_callback', async (req, res) => {
    const {code} = req.query;
    try {
        const r = await fetch('https://id.twitch.tv/oauth2/token', { method:'POST', body: new URLSearchParams({client_id:TWITCH_CLIENT_ID, client_secret:TWITCH_CLIENT_SECRET, code, grant_type:'authorization_code', redirect_uri:REDIRECT_URI})});
        const d = await r.json();
        if(d.access_token) {
             const u = await twitchApiFetch('users', d.access_token);
             CACHE.twitchUser = {...u.data[0], access_token:d.access_token, expiry:Date.now()+3600000};
             res.send("<script>window.opener.postMessage('auth_success','*');window.close();</script>");
        }
    } catch(e){res.send("Erreur Auth");}
});
app.get('/twitch_user_status', (req,res) => res.json({is_connected:!!CACHE.twitchUser, display_name:CACHE.twitchUser?.display_name}));
app.post('/twitch_logout', (req,res)=>{CACHE.twitchUser=null;res.json({success:true});});
app.get('/followed_streams', async(req,res)=>{
    if(!CACHE.twitchUser) return res.json({success:false});
    try { const d = await twitchApiFetch(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token); res.json({success:true, streams:d.data}); } catch(e){res.json({success:false});}
});
app.get('/export_csv', (req,res) => res.send("CSV OK"));

app.listen(PORT, () => console.log(`SERVER V23 ANALYST PRO ON PORT ${PORT}`));
