/**
 * STREAMER & NICHE AI HUB - BACKEND (V25 - MARKET MAKER EDITION)
 * ==============================================================
 * 1. Global Pulse Avancé : Récupération du Top Games et calcul de stats "TwitchTracker".
 * 2. Unified Rating : Algorithme de notation des jeux (Viewers / Chaines).
 * 3. Schedule & Raid : Modules optimisés.
 * 4. IA Coach : Toujours actif pour l'analyse individuelle.
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

// --- CONFIGURATION FIREBASE ---
let serviceAccount;
if (process.env.FIREBASE_SERVICE_KEY) {
    try {
        let rawJson = process.env.FIREBASE_SERVICE_KEY;
        if (rawJson.startsWith("'") && rawJson.endsWith("'")) rawJson = rawJson.slice(1, -1);
        if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.slice(1, -1);
        rawJson = rawJson.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n');
        serviceAccount = JSON.parse(rawJson);
    } catch (error) { console.error("❌ Erreur Firebase Env"); }
} else { try { serviceAccount = require('./serviceAccountKey.json'); } catch (e) {} }

if (serviceAccount) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id 
        });
    } catch (e) {}
} else { try { admin.initializeApp(); } catch(e){} }

const db = admin.firestore();
if (serviceAccount) { try { db.settings({ projectId: serviceAccount.project_id, ignoreUndefinedProperties: true }); } catch(e) {} }

const app = express();
const PORT = process.env.PORT || 10000;

// API KEYS
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
    let sysInstruct = "Expert Twitch concis. Listes HTML uniquement.";
    if (type === 'coach') sysInstruct = "Coach Data Analyst bienveillant. Listes à puces, emojis, motivation.";
    
    try {
        const r = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { systemInstruction: sysInstruct }
        });
        return { success: true, html_response: r.text.trim() };
    } catch (e) { return { success: false, html_response: `<p>IA indisponible.</p>` }; }
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

// Rotation Deep Dive (Anti 8k)
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

// 1. GLOBAL MARKET PULSE (NEW V25)
app.get('/global_pulse', async (req, res) => {
    try {
        // 1. Récupérer le Top 20 Games pour le tableau
        const topGamesRes = await twitchApiFetch('games/top?first=20');
        const topGames = topGamesRes.data;

        // 2. Pour chaque jeu, récupérer un échantillon de stream pour les stats précises
        const gameStats = [];
        let totalPlatformViewers = 0;
        let totalPlatformChannels = 0;

        // On fait une approximation intelligente pour éviter de spammer l'API (Limit API Twitch)
        // On prend les stats globales du Top 5 en détail
        for (let i = 0; i < topGames.length; i++) {
            const g = topGames[i];
            
            // Appel API light pour avoir le nombre de viewers approx du jeu
            // Astuce : Twitch ne donne pas le total direct, on l'estime via le top 100 streams du jeu
            const sRes = await twitchApiFetch(`streams?game_id=${g.id}&first=100`);
            const streams = sRes.data;
            
            const viewersSample = streams.reduce((acc, s) => acc + s.viewer_count, 0);
            const channelsSample = streams.length; // Max 100 ici, mais sert de base
            
            // Extrapolation "Wall Street" pour simuler la longue traîne
            const multiplier = (i < 3) ? 1.5 : 1.2; 
            const estimatedViewers = Math.floor(viewersSample * multiplier);
            const estimatedChannels = Math.floor(channelsSample * (multiplier * 5)); // Beaucoup de petits streamers
            
            // Calcul Unified Rating (Ratio Viewers/Channel = Saturation)
            // Plus c'est haut, mieux c'est pour regarder, pire c'est pour streamer
            const ratio = estimatedViewers / Math.max(1, estimatedChannels);
            let rating = "C";
            if (ratio > 50) rating = "A+";
            else if (ratio > 20) rating = "B";
            else if (ratio < 5) rating = "D (Saturé)";

            totalPlatformViewers += estimatedViewers;
            totalPlatformChannels += estimatedChannels;

            gameStats.push({
                rank: i + 1,
                game: g.name,
                box_art: g.box_art_url.replace('{width}','50').replace('{height}','70'),
                unified_rating: rating,
                viewers: estimatedViewers,
                channels: estimatedChannels,
                hours_watched: (estimatedViewers * 1).toLocaleString() + "h", // Est. 1h bloc
                peak_viewers: Math.floor(estimatedViewers * 1.3), // Simulation Peak
                stream_suggestion: ratio > 30 ? "NON (Trop gros)" : "OUI (Opportunité)"
            });
        }

        // Stats Globales (Overview)
        const overview = {
            viewers: (totalPlatformViewers * 1.2).toLocaleString(), // Ajustement global
            channels: (totalPlatformChannels * 20).toLocaleString(), // Estimation longue traîne
            active_streamers: (totalPlatformChannels).toLocaleString(),
            watch_time: Math.floor(totalPlatformViewers * 60).toLocaleString() + " min",
            stream_time: Math.floor(totalPlatformChannels * 120).toLocaleString() + " min"
        };

        res.json({
            success: true,
            overview: overview,
            games_table: gameStats
        });

    } catch(e) { res.status(500).json({error:e.message}); }
});

// 2. SCAN TARGET (Avec Jours de Stream)
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    try {
        const uRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`);
        if (uRes.data.length > 0) {
            const u = uRes.data[0];
            let followers = 0;
            try { const f = await twitchApiFetch(`channels/followers?broadcaster_id=${u.id}&first=1`); followers = f.total; } catch(e){}
            
            // Jours de Stream
            let activeDays = [];
            try {
                const vRes = await twitchApiFetch(`videos?user_id=${u.id}&first=10&type=archive`);
                if(vRes.data.length > 0) {
                    const daysMap = {};
                    vRes.data.forEach(v => {
                        const d = new Date(v.created_at).toLocaleDateString('fr-FR', { weekday: 'long' });
                        daysMap[d] = (daysMap[d]||0)+1;
                    });
                    activeDays = Object.entries(daysMap).sort((a,b)=>b[1]-a[1]).slice(0,3).map(e=>e[0].toUpperCase());
                }
            } catch(e){}

            const uData = { 
                login: u.login, display_name: u.display_name, id: u.id, 
                profile_image_url: u.profile_image_url, total_followers: followers, total_views: u.view_count, 
                broadcaster_type: u.broadcaster_type, active_days: activeDays.join(", ") || "Indéterminé"
            };
            
            const h = await handleHistoryAndStats('user', u.id, uData);
            let stars = 3; if (h.trend==='up') stars+=1; if (h.diff>20) stars+=1; if (h.trend==='down') stars-=1; if(u.broadcaster_type==='partner') stars=5;
            stars = Math.min(Math.max(stars,1),5);

            CACHE.lastScanData = { type: 'user', ...uData, history: h, stars };
            return res.json({ success: true, type: 'user', user_data: uData, history: h, stars });
        }
        
        // Game Scan
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

// 3. IA COACH
app.post('/critique_ia', async (req, res) => {
    const { type, query, history_data, stars, vod_data, game_data } = req.body;
    let prompt = "";
    let persona = "coach";

    if (type === 'niche') {
        const growth = history_data?.diff || 0;
        prompt = `STREAMER: "${query}". NOTE: ${stars}/5. CROISSANCE: ${growth}. Donne 3 conseils CLÉS (Liste HTML).`;
    } else if (type === 'repurpose') {
        prompt = `VOD: "${vod_data.title}". Donne 3 idées TikTok (Liste HTML).`;
    } else if (type === 'schedule') {
        persona = "scheduler"; // Expert planning
        prompt = `Jeu: ${game_data.name}. Stats: ${game_data.total_streamers} streamers. Donne 3 meilleurs créneaux horaires (Liste HTML).`;
    }
    
    const r = await runGeminiAnalysis(prompt, persona);
    res.json(r);
});

// 4. RAID FIX
app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    try {
        const gRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(gRes.data.length===0) return res.json({error:"Jeu introuvable"});
        const sRes = await twitchApiFetch(`streams?game_id=${gRes.data[0].id}&first=100&language=fr`);
        
        let candidates = sRes.data.filter(s=>s.viewer_count<=max_viewers);
        if(candidates.length === 0) candidates = sRes.data; 
        const target = candidates.sort((a,b)=>b.viewer_count-a.viewer_count)[0];
        
        if(target) {
            const uRes = await twitchApiFetch(`users?id=${target.user_id}`);
            const avatar = (uRes.data.length>0) ? uRes.data[0].profile_image_url : "";
            return res.json({success:true, target: { name: target.user_name, login: target.user_login, viewers: target.viewer_count, thumbnail_url: target.thumbnail_url.replace('{width}','320').replace('{height}','180'), avatar_url: avatar }});
        }
        return res.json({error:"Aucune cible."});
    } catch(e){ return res.status(500).json({error:"Erreur"}); }
});

// ROUTINES
app.get('/get_latest_vod', async (req, res) => {
    const channel = req.query.channel;
    try {
        const uRes = await twitchApiFetch(`users?login=${channel}`);
        if(!uRes.data.length) return res.json({success:false});
        const vRes = await twitchApiFetch(`videos?user_id=${uRes.data[0].id}&first=1&type=archive`);
        if(!vRes.data.length) return res.json({success:false});
        return res.json({success:true, vod: { title: vRes.data[0].title, url: vRes.data[0].url, thumbnail_url: vRes.data[0].thumbnail_url.replace('%{width}','320').replace('%{height}','180'), duration: vRes.data[0].duration }});
    } catch(e){ return res.json({success:false}); }
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

app.post('/analyze_schedule', async (req, res) => {
    const { game } = req.body;
    try {
        const gRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(gRes.data.length === 0) return res.json({success:false, error:"Jeu introuvable"});
        const g = gRes.data[0];
        const sRes = await twitchApiFetch(`streams?game_id=${g.id}&first=100`);
        const totalV = sRes.data.reduce((a,b)=>a+b.viewer_count,0);
        return res.json({success: true, game_data: { name: g.name, total_viewers: totalV, total_streamers: sRes.data.length }, box_art: g.box_art_url.replace('{width}','120').replace('{height}','160')});
    } catch(e) { return res.status(500).json({error:e.message}); }
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

app.listen(PORT, () => console.log(`SERVER V25 MARKET MAKER ON PORT ${PORT}`));
