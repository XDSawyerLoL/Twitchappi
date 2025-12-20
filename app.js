/**
 * STREAMER HUB - BACKEND V32 (FINAL DEBUG)
 * ========================================
 * 1. Filtre Strict : Le lecteur refuse tout stream > 100 vues.
 * 2. Scan Réparé : Followers et VODs récupérés avec les bons endpoints.
 * 3. Market Data : Gestion des sous-onglets (Jeux/Langues/Compare).
 * 4. Planning & Raid : Routes testées et valides.
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

// --- INITIALISATION FIREBASE ---
let serviceAccount;
if (process.env.FIREBASE_SERVICE_KEY) {
    try {
        let rawJson = process.env.FIREBASE_SERVICE_KEY;
        if (rawJson.startsWith("'") && rawJson.endsWith("'")) rawJson = rawJson.slice(1, -1);
        if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.slice(1, -1);
        rawJson = rawJson.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n');
        serviceAccount = JSON.parse(rawJson);
    } catch (e) { console.error("Firebase Key Error"); }
} else { try { serviceAccount = require('./serviceAccountKey.json'); } catch (e) {} }

if (serviceAccount) {
    try { admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id }); } 
    catch (e) {}
} else { try { admin.initializeApp(); } catch(e){} }

const db = admin.firestore();
if (serviceAccount) { try { db.settings({ projectId: serviceAccount.project_id, ignoreUndefinedProperties: true }); } catch(e) {} }

const app = express();
const PORT = process.env.PORT || 10000;

// KEYS
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
    twitchTokens: {}, 
    smallStreamPool: [], 
    lastPoolUpdate: 0 
};

// HELPERS
async function getTwitchToken() {
    if (CACHE.twitchTokens.app && CACHE.twitchTokens.app.expiry > Date.now()) return CACHE.twitchTokens.app.token;
    try {
        const r = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' });
        const d = await r.json();
        CACHE.twitchTokens.app = { token: d.access_token, expiry: Date.now() + d.expires_in * 1000 };
        return d.access_token;
    } catch (e) { return null; }
}

async function apiCall(endpoint) {
    const t = await getTwitchToken();
    const r = await fetch(`https://api.twitch.tv/helix/${endpoint}`, { headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${t}` } });
    if(r.status === 401) CACHE.twitchTokens.app = null;
    return r.json();
}

async function runGemini(prompt) {
    try {
        const r = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { systemInstruction: "Tu es un expert Twitch concis. Réponds UNIQUEMENT avec des listes HTML (<ul><li>). Pas de texte inutile." }
        });
        return { html: r.text.trim() };
    } catch (e) { return { html: "IA Indisponible." }; }
}

// --- FILTRE STRICT < 100 VUES ---
async function updateSmallStreamPool() {
    // Si pool récent, on garde
    if (Date.now() - CACHE.lastPoolUpdate < 300000 && CACHE.smallStreamPool.length > 0) return;
    
    let cursor = "";
    let found = [];
    
    // On scanne jusqu'à 10 pages (1000 streams) pour trouver les petits
    for (let i = 0; i < 10; i++) {
        let url = `streams?language=fr&first=100` + (cursor ? `&after=${cursor}` : ``);
        const res = await apiCall(url);
        if (!res.data || res.data.length === 0) break;
        
        // LE FILTRE EST ICI : STRICTEMENT <= 100
        const small = res.data.filter(s => s.viewer_count <= 100 && s.viewer_count > 0);
        found = found.concat(small);
        
        if (found.length >= 50) break; // On a assez de stock
        cursor = res.pagination.cursor;
        if (!cursor) break;
    }
    
    CACHE.smallStreamPool = found.length > 0 ? found : [];
    CACHE.lastPoolUpdate = Date.now();
}

// --- 1. SCAN TARGET (CORRIGÉ) ---
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    try {
        // 1. User
        const uRes = await apiCall(`users?login=${encodeURIComponent(query)}`);
        if (uRes.data && uRes.data.length > 0) {
            const u = uRes.data[0];
            
            // 2. Followers (Correct endpoint)
            let followers = 0;
            try { 
                const f = await apiCall(`channels/followers?broadcaster_id=${u.id}&first=1`); 
                followers = f.total; 
            } catch(e){}

            // 3. VOD & Jours
            let days = "Inconnu";
            try {
                const vRes = await apiCall(`videos?user_id=${u.id}&first=10&type=archive`);
                if(vRes.data && vRes.data.length > 0) {
                    const map = {}; 
                    vRes.data.forEach(v => {
                        const d = new Date(v.created_at).toLocaleDateString('fr-FR', { weekday: 'short' });
                        map[d] = (map[d] || 0) + 1;
                    });
                    days = Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,3).map(e=>e[0].toUpperCase()).join(", ");
                }
            } catch(e){}

            // 4. Historique
            const docRef = db.collection('history_stats').doc(String(u.id));
            const old = await docRef.get();
            let diff=0, trend="stable";
            
            if(old.exists) { 
                diff = followers - (old.data().total_followers || 0); 
                trend = diff > 0 ? "up" : (diff < 0 ? "down" : "stable"); 
            }
            await docRef.set({total_followers: followers, last_scan: new Date()}, {merge:true});

            // 5. IA
            const prompt = `Streamer: ${u.display_name}. Followers: ${followers}. Trend: ${trend}. Donne 3 conseils stratégiques courts en HTML.`;
            const ia = await runGemini(prompt);

            const uData = { 
                login: u.login, display_name: u.display_name, id: u.id, 
                profile_image_url: u.profile_image_url, total_followers: followers, active_days: days 
            };

            return res.json({ success: true, type: 'user', data: uData, diff, trend, ia: ia.html });
        }
        return res.json({success:false, error:"Streamer introuvable."});
    } catch(e) { return res.json({success:false, error:e.message}); }
});

// --- 2. GLOBAL PULSE (MARKET) ---
app.post('/global_pulse', async (req, res) => {
    const { type } = req.body; 
    try {
        const sRes = await apiCall('streams?first=100');
        const streams = sRes.data;
        const totalV = streams.reduce((acc, s) => acc + s.viewer_count, 0);
        
        // Extrapolation
        const estViewers = Math.floor(totalV * 1.5);
        const estChannels = Math.floor(streams.length * 65);

        const overview = {
            viewers: estViewers.toLocaleString(),
            channels: estChannels.toLocaleString(),
            active_streamers: Math.floor(estChannels * 0.8).toLocaleString(),
            watch_time: Math.floor(estViewers * 45 / 60) + "Mh",
            stream_time: Math.floor(estChannels * 2) + "Kh"
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
                rank: i+1, name: k, viewers: v.v, channels: v.c, 
                rating: v.v > 50000 ? "A+" : "B"
            }));
        } else {
            // Games (ou Compare)
            const gRes = await apiCall('games/top?first=10');
            for(let i=0; i<gRes.data.length; i++) {
                const g = gRes.data[i];
                const gs = await apiCall(`streams?game_id=${g.id}&first=5`);
                const gv = gs.data.reduce((a,b)=>a+b.viewer_count,0) * (i<3?25:10); 
                const gc = gs.data.length * 60;
                tableData.push({
                    rank: i+1, name: g.name, img: g.box_art_url.replace('{width}','50').replace('{height}','70'),
                    viewers: gv, channels: gc, rating: (gv/gc > 30) ? "A+" : "B"
                });
            }
        }

        // Sauvegarde Firebase
        if(type === 'games') {
            try {
                await db.collection('market_history').add({
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    total_viewers: estViewers,
                    top_game: tableData[0]?.name || 'Inconnu'
                });
            } catch(e) {}
        }

        res.json({ success: true, overview, table: tableData });
    } catch(e) { res.status(500).json({error: e.message}); }
});

// --- 3. LECTEUR (STRICT) ---
app.get('/get_default_stream', async (req, res) => {
    try {
        const b = await db.collection('boosts').where('endTime', '>', Date.now()).limit(1).get();
        if(!b.empty) return res.json({success:true, channel: b.docs[0].data().channel, viewers:'BOOST'});
    } catch(e){}

    await updateSmallStreamPool();
    const pick = CACHE.smallStreamPool[Math.floor(Math.random() * CACHE.smallStreamPool.length)];
    
    // Protection ultime contre les gros streamers
    if(!pick || pick.viewer_count > 100) return res.json({success:true, channel:'twitch', viewers:0});
    
    res.json({success:true, channel: pick.user_login, viewers: pick.viewer_count});
});

app.post('/cycle_stream', async (req, res) => {
    await updateSmallStreamPool();
    const pick = CACHE.smallStreamPool[Math.floor(Math.random() * CACHE.smallStreamPool.length)];
    res.json({success:true, channel: pick ? pick.user_login : 'twitch'});
});

// --- 4. RAID & PLANNING & BOOST ---
app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    try {
        const gRes = await apiCall(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(!gRes.data.length) return res.json({error:"Jeu introuvable"});
        
        const sRes = await apiCall(`streams?game_id=${gRes.data[0].id}&first=100&language=fr`);
        // On cherche le plus gros des "petits"
        const target = sRes.data.filter(s => s.viewer_count <= parseInt(max_viewers))
            .sort((a,b) => b.viewer_count - a.viewer_count)[0];
        
        if(target) {
            const uRes = await apiCall(`users?id=${target.user_id}`);
            return res.json({
                success: true,
                target: {
                    name: target.user_name, login: target.user_login, viewers: target.viewer_count,
                    thumb: target.thumbnail_url.replace('{width}','320').replace('{height}','180'),
                    avatar: uRes.data[0]?.profile_image_url || ""
                }
            });
        }
        return res.json({error:"Aucune cible trouvée."});
    } catch(e) { res.json({error: e.message}); }
});

app.post('/analyze_schedule', async (req, res) => {
    const { game } = req.body;
    try {
        const gRes = await apiCall(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(!gRes.data.length) return res.json({success:false, error:"Jeu inconnu"});
        
        const sRes = await apiCall(`streams?game_id=${gRes.data[0].id}&first=100`);
        const totalV = sRes.data.reduce((a,b)=>a+b.viewer_count,0);
        
        const prompt = `Jeu: ${gRes.data[0].name}. ${sRes.data.length} streamers live (sample), ${totalV} viewers. Donne 3 meilleurs créneaux horaires (Jour + Heure). Réponds en liste HTML <ul>.`;
        const r = await runGemini(prompt);
        
        res.json({
            success: true,
            box_art: gRes.data[0].box_art_url.replace('{width}','100'),
            name: gRes.data[0].name,
            ia_advice: r.html
        });
    } catch(e) { res.json({success:false, error: "Erreur Analyse"}); }
});

app.post('/stream_boost', async(req,res)=>{
    const {channel}=req.body;
    try { await db.collection('boosts').add({channel, endTime: Date.now()+900000}); res.json({success:true}); } catch(e){res.json({error:"Erreur DB"});}
});

// --- AUTH & UTILS ---
app.get('/twitch_auth_start', (req, res) => res.redirect(`https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows`));
app.get('/twitch_auth_callback', async (req, res) => {
    const r = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&code=${req.query.code}&grant_type=authorization_code&redirect_uri=${REDIRECT_URI}`, {method:'POST'});
    const d = await r.json();
    if(d.access_token) { CACHE.twitchUser = d.access_token; res.send("<script>window.opener.postMessage('auth','*');window.close();</script>"); }
});
app.get('/twitch_user_status', (req,res) => res.json({is_connected:!!CACHE.twitchUser}));
app.post('/twitch_logout', (req,res)=>{CACHE.twitchUser=null;res.json({success:true});});
app.get('/followed_streams', async (req, res) => {
    if(!CACHE.twitchUser) return res.json({success:false});
    // On doit d'abord avoir l'ID user
    const u = await fetch(`https://api.twitch.tv/helix/users`, {headers:{'Client-ID':TWITCH_CLIENT_ID, 'Authorization':`Bearer ${CACHE.twitchUser}`}});
    const ud = await u.json();
    if(!ud.data) return res.json({success:false});
    
    const f = await fetch(`https://api.twitch.tv/helix/streams/followed?user_id=${ud.data[0].id}`, {headers:{'Client-ID':TWITCH_CLIENT_ID, 'Authorization':`Bearer ${CACHE.twitchUser}`}});
    const d = await f.json();
    res.json({success:true, streams: d.data});
});
app.get('/get_latest_vod', async (req, res) => {
    const channel = req.query.channel;
    try {
        const u = await apiCall(`users?login=${channel}`);
        const v = await apiCall(`videos?user_id=${u.data[0].id}&first=1&type=archive`);
        if(v.data.length) return res.json({success:true, vod: { title: v.data[0].title, thumbnail_url: v.data[0].thumbnail_url.replace('%{width}','320').replace('%{height}','180') }});
    } catch(e){}
    res.json({success:false});
});

app.listen(PORT, () => console.log(`SERVER V32 FINAL READY ON PORT ${PORT}`));
