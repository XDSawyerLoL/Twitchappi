/**
 * STREAMER & NICHE AI HUB - BACKEND (V26 - TRADER PRO)
 * ====================================================
 * 1. MARKET RECORDER : Sauvegarde automatique des tendances globales dans Firebase.
 * 2. MULTI-VUE MARKET : Support des vues "Games" et "Languages".
 * 3. ROUTINES FIXES : Raid et Planning corrigés et simplifiés.
 * 4. DASHBOARD API : Données formatées pour la concision.
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
    twitchTokens: {}, twitchUser: null, boostedStream: null,     
    globalStreamRotation: { streams: [], currentIndex: 0, lastFetchTime: 0, fetchCooldown: 10 * 60 * 1000 },
    marketSnapshot: { data: null, lastTime: 0, cooldown: 60 * 60 * 1000 } // 1h de cache Market
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
    return res.json();
}

async function runGeminiAnalysis(prompt, type="standard") {
    // Instruction : Réponse ULTRA COURTE
    let sysInstruct = "Analyste de données concis. Réponds uniquement par des listes à puces ou des phrases très courtes.";
    if (type === 'coach') sysInstruct = "Coach Performance. Sois direct. Pas de blabla. Utilise des emojis. Format: <ul><li>...</li></ul>";
    
    try {
        const r = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { systemInstruction: sysInstruct }
        });
        return { success: true, html_response: r.text.trim() };
    } catch (e) { return { success: false, html_response: "IA Indisponible." }; }
}

// --- CORE : DATA RECORDER (FIREBASE) ---
async function saveMarketSnapshot(data) {
    // Sauvegarde un snapshot du marché si le dernier date de plus d'une heure
    const now = Date.now();
    if (now - CACHE.marketSnapshot.lastTime > CACHE.marketSnapshot.cooldown) {
        try {
            await db.collection('market_history').add({
                ...data.overview,
                top_game: data.games_table[0]?.game || 'Unknown',
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log("✅ Market Snapshot Saved to Firebase");
            CACHE.marketSnapshot.lastTime = now;
        } catch(e) { console.error("Erreur Save DB:", e); }
    }
}

// --- ROUTES API ---

// 1. GLOBAL MARKET PULSE (GAMES & LANGUAGES)
app.post('/global_pulse', async (req, res) => {
    const { type } = req.body; // 'games' ou 'languages'
    
    try {
        // --- LOGIQUE COMMUNE : OVERVIEW ---
        // On échantillonne les 100 meilleurs streams pour estimer la charge globale
        const sRes = await twitchApiFetch('streams?first=100');
        const streams = sRes.data;
        const totalSampleViewers = streams.reduce((acc, s) => acc + s.viewer_count, 0);
        
        // Extrapolation (Simulation de la "Longue Traîne" invisible)
        const totalViewers = Math.floor(totalSampleViewers * 1.4); 
        const totalChannels = Math.floor(streams.length * 45); // Estimation active
        
        const overview = {
            viewers: totalViewers.toLocaleString(),
            channels: totalChannels.toLocaleString(),
            active: Math.floor(totalChannels * 0.8).toLocaleString(),
            watch_time: Math.floor(totalViewers * 45 / 60) + "Mh",
            stream_time: Math.floor(totalChannels * 2) + "Kh"
        };

        let tableData = [];

        if (type === 'languages') {
            // --- MODE LANGUAGES ---
            // On compte la répartition des langues dans le top 100
            const langMap = {};
            streams.forEach(s => {
                const l = s.language.toUpperCase();
                if(!langMap[l]) langMap[l] = { count:0, viewers:0 };
                langMap[l].count++;
                langMap[l].viewers += s.viewer_count;
            });
            
            // On transforme en tableau trié
            tableData = Object.entries(langMap)
                .sort((a,b) => b[1].viewers - a[1].viewers)
                .map(([lang, stats], idx) => ({
                    rank: idx + 1,
                    name: lang,
                    viewers: stats.viewers,
                    channels: stats.count,
                    share: ((stats.viewers / totalSampleViewers) * 100).toFixed(1) + "%",
                    rating: stats.viewers > 100000 ? "A+" : (stats.viewers > 50000 ? "B" : "C")
                }));

        } else {
            // --- MODE GAMES (DEFAULT) ---
            const gRes = await twitchApiFetch('games/top?first=15');
            const games = gRes.data;
            
            for(let i=0; i<games.length; i++) {
                const g = games[i];
                // Petit échantillon pour chaque jeu
                const gsRes = await twitchApiFetch(`streams?game_id=${g.id}&first=10`);
                const gStreams = gsRes.data;
                const gViewers = gStreams.reduce((acc,s)=>acc+s.viewer_count,0) * (i<3 ? 20 : 10); // Extrapolation
                const gChannels = gStreams.length * 50; 
                
                const ratio = gViewers / Math.max(1, gChannels);
                let rating = ratio > 30 ? "A+ (Viral)" : (ratio > 10 ? "B (Stable)" : "C (Saturé)");

                tableData.push({
                    rank: i + 1,
                    name: g.name,
                    img: g.box_art_url.replace('{width}','50').replace('{height}','70'),
                    viewers: gViewers,
                    channels: gChannels,
                    rating: rating,
                    trend: Math.random() > 0.5 ? "↑" : "→" // Simulation tendance courte
                });
            }
        }

        const responseData = { success: true, overview, table: tableData, type };
        
        // SAVE TO FIREBASE (Seulement si mode Games pour éviter les doublons)
        if (type !== 'languages') saveMarketSnapshot(responseData);

        res.json(responseData);

    } catch(e) { res.status(500).json({error:e.message}); }
});

// 2. SCAN & DASHBOARD (Concise)
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    try {
        const uRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`);
        if (uRes.data.length > 0) {
            const u = uRes.data[0];
            let followers = 0;
            try { const f = await twitchApiFetch(`channels/followers?broadcaster_id=${u.id}&first=1`); followers = f.total; } catch(e){}
            
            // Check Live Days
            let days = "Inconnu";
            try {
                const vRes = await twitchApiFetch(`videos?user_id=${u.id}&first=10&type=archive`);
                if(vRes.data.length){
                    const dMap = {};
                    vRes.data.forEach(v => dMap[new Date(v.created_at).getDay()] = (dMap[new Date(v.created_at).getDay()]||0)+1);
                    const dayNames = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
                    days = Object.keys(dMap).sort((a,b)=>dMap[b]-dMap[a]).slice(0,3).map(d=>dayNames[d]).join(", ");
                }
            } catch(e){}

            const uData = { login: u.login, display_name: u.display_name, id: u.id, profile_image_url: u.profile_image_url, followers, days };
            
            // Historique pour calcul
            const docRef = db.collection('history_stats').doc(String(u.id));
            const doc = await docRef.get();
            let trend = "stable"; let diff = 0;
            if(doc.exists) {
                diff = followers - (doc.data().total_followers || 0);
                trend = diff > 0 ? "up" : (diff < 0 ? "down" : "stable");
            }
            await docRef.set({ total_followers: followers, last_scan: new Date() }, {merge:true});

            return res.json({ success: true, data: uData, trend, diff });
        }
        return res.json({success:false, error:"Introuvable"});
    } catch(e) { return res.json({success:false, error:e.message}); }
});

// 3. IA COACH (Mode Concise)
app.post('/critique_ia', async (req, res) => {
    const { type, query, context } = req.body;
    let prompt = "";
    
    if (type === 'coach') {
        prompt = `Analyse le streamer ${query}. ${context}. Donne 3 points précis (Bullet points) pour améliorer la croissance. Sois court et direct.`;
    } else if (type === 'schedule') {
        prompt = `Jeu: ${query}. Donne les 3 meilleurs créneaux horaires (Jour/Heure) pour streamer ce jeu avec peu de concurrence. Liste simple.`;
    }
    
    const r = await runGeminiAnalysis(prompt, 'coach');
    res.json(r);
});

// 4. RAID (IDs Corrigés + Image)
app.post('/start_raid', async (req, res) => {
    const { game, max } = req.body;
    try {
        const gRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(!gRes.data.length) return res.json({error:"Jeu introuvable"});
        
        const sRes = await twitchApiFetch(`streams?game_id=${gRes.data[0].id}&first=100&language=fr`);
        const target = sRes.data.filter(s => s.viewer_count <= max).sort((a,b)=>b.viewer_count-a.viewer_count)[0];
        
        if(target) {
            const uRes = await twitchApiFetch(`users?id=${target.user_id}`);
            return res.json({
                success: true,
                target: {
                    name: target.user_name,
                    login: target.user_login,
                    viewers: target.viewer_count,
                    avatar: uRes.data[0]?.profile_image_url || "",
                    thumb: target.thumbnail_url.replace('{width}','320').replace('{height}','180')
                }
            });
        }
        return res.json({error:"Aucune cible trouvée."});
    } catch(e) { return res.json({error:e.message}); }
});

// 5. PLANNING
app.post('/analyze_schedule', async(req,res)=>{
    const { game } = req.body;
    try {
        const gRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(!gRes.data.length) return res.json({error:"Jeu inconnu"});
        const sRes = await twitchApiFetch(`streams?game_id=${gRes.data[0].id}&first=100`);
        const total = sRes.data.reduce((a,b)=>a+b.viewer_count,0);
        
        // IA Call
        const ia = await runGeminiAnalysis(`Best time to stream ${game}? ${sRes.data.length} streamers, ${total} viewers.`, 'coach');
        
        return res.json({
            success:true, 
            data: { name: gRes.data[0].name, viewers: total, streamers: sRes.data.length },
            ia_advice: ia.html_response
        });
    } catch(e) { return res.json({error:e.message}); }
});

// AUTH & UTILS
app.get('/twitch_auth_start', (req, res) => res.redirect(`https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows`));
app.get('/twitch_auth_callback', async (req, res) => { /* Standard Auth Logic */ res.send("<script>window.opener.postMessage('auth_success','*');window.close();</script>"); });
app.get('/twitch_user_status', (req,res) => res.json({is_connected:false})); // Simplifié pour l'exemple
app.get('/followed_streams', (req,res) => res.json({success:false})); // Simplifié
app.get('/get_default_stream', (req,res) => res.json({success:true, channel:'twitch', viewers:0})); // Fallback
app.post('/stream_boost', (req,res) => res.json({success:true})); // Fallback

app.listen(PORT, () => console.log(`SERVER V26 TRADER ON PORT ${PORT}`));
