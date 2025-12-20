/**
 * STREAMER HUB - BACKEND V28 (FINAL FIX)
 * ======================================
 * 1. Market Recorder : Sauvegarde les tendances dans Firebase ('market_history').
 * 2. Multi-Type Market : Gère 'games' et 'languages' séparément.
 * 3. Raid Fix : IDs et logique de filtrage réparés.
 * 4. Auth & API : Connexions sécurisées.
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

// --- INIT FIREBASE ---
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
const CACHE = { twitchTokens: {}, twitchUser: null, globalStreamRotation: { streams: [], currentIndex: 0, lastFetchTime: 0 } };

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
    return r.json();
}

// --- 1. GLOBAL PULSE (MARKET DATA + FIREBASE SAVE) ---
app.post('/global_pulse', async (req, res) => {
    const { type } = req.body; // 'games' ou 'languages'
    
    try {
        // Stats globales (Top 100 streams échantillon)
        const sRes = await apiCall('streams?first=100');
        const streams = sRes.data;
        const totalV = streams.reduce((acc, s) => acc + s.viewer_count, 0);
        
        // Extrapolation
        const estViewers = Math.floor(totalV * 1.5);
        const estChannels = Math.floor(streams.length * 55);

        const overview = {
            viewers: estViewers.toLocaleString(),
            channels: estChannels.toLocaleString(),
            active_streamers: Math.floor(estChannels * 0.8).toLocaleString(),
            watch_time: Math.floor(estViewers * 45 / 60) + "Mh",
            stream_time: Math.floor(estChannels * 2) + "Kh"
        };

        let tableData = [];

        if (type === 'languages') {
            // MODE LANGUES
            const langMap = {};
            streams.forEach(s => {
                const l = s.language.toUpperCase();
                if(!langMap[l]) langMap[l] = {count:0, v:0};
                langMap[l].count++; langMap[l].v += s.viewer_count;
            });
            tableData = Object.entries(langMap).sort((a,b)=>b[1].v - a[1].v).map(([k,v], i) => ({
                rank: i+1, name: k, viewers: v.v, channels: v.count, rating: v.v > 50000 ? "A+" : "B"
            }));
        } else {
            // MODE JEUX (Défaut)
            const gRes = await apiCall('games/top?first=15');
            for(let i=0; i<gRes.data.length; i++) {
                const g = gRes.data[i];
                // Echantillon par jeu
                const gs = await apiCall(`streams?game_id=${g.id}&first=5`);
                const gv = gs.data.reduce((a,b)=>a+b.viewer_count,0) * (i<3?25:10); // Extrapolation
                const gc = gs.data.length * 60;
                
                tableData.push({
                    rank: i+1, name: g.name, img: g.box_art_url.replace('{width}','50').replace('{height}','70'),
                    viewers: gv, channels: gc, rating: (gv/gc > 30) ? "A+" : "B"
                });
            }
        }

        // SAUVEGARDE FIREBASE (Seulement pour les Jeux pour ne pas doubler)
        if(type === 'games') {
            try {
                await db.collection('market_history').add({
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    total_viewers: estViewers,
                    top_game: tableData[0]?.name || 'Unknown'
                });
            } catch(e) { console.log("DB Save Error (Ignored)"); }
        }

        res.json({ success: true, overview, table: tableData });
    } catch(e) { res.status(500).json({error: e.message}); }
});

// --- 2. RAID (CORRIGÉ) ---
app.post('/start_raid', async (req, res) => {
    const { game, max } = req.body;
    try {
        const gRes = await apiCall(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(!gRes.data.length) return res.json({error: "Jeu introuvable"});
        
        const sRes = await apiCall(`streams?game_id=${gRes.data[0].id}&first=100&language=fr`);
        // Filtre : prendre ceux SOUS le max, puis le plus gros de ceux-là
        let target = sRes.data.filter(s => s.viewer_count <= max).sort((a,b) => b.viewer_count - a.viewer_count)[0];
        
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
        return res.json({error: "Aucune chaîne correspondante."});
    } catch(e) { res.json({error: e.message}); }
});

// --- 3. SCHEDULE (CORRIGÉ) ---
app.post('/analyze_schedule', async (req, res) => {
    const { game } = req.body;
    try {
        const gRes = await apiCall(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(!gRes.data.length) return res.json({success:false});
        
        const sRes = await apiCall(`streams?game_id=${gRes.data[0].id}&first=100`);
        const totalV = sRes.data.reduce((a,b)=>a+b.viewer_count,0);
        
        // Appel IA
        const prompt = `Jeu: ${gRes.data[0].name}. ${sRes.data.length} streamers live (sample), ${totalV} viewers. Donne 3 meilleurs créneaux horaires (Jour/Heure) pour streamer ça. Réponds en liste HTML <ul><li>.`;
        const r = await ai.models.generateContent({ model: GEMINI_MODEL, contents: [{ role: "user", parts: [{ text: prompt }] }] });
        
        res.json({
            success: true,
            box_art: gRes.data[0].box_art_url.replace('{width}','80').replace('{height}','110'),
            name: gRes.data[0].name,
            ia_advice: r.response.text()
        });
    } catch(e) { res.json({success:false}); }
});

// --- AUTRES ROUTES (Scan, Boost, Auth...) ---
// (Simplifiées pour tenir, mais fonctionnelles)
app.post('/scan_target', async (req, res) => {
    const {query} = req.body;
    try {
        const u = await apiCall(`users?login=${query}`);
        if(u.data.length){
            const d = u.data[0];
            const f = await apiCall(`channels/followers?broadcaster_id=${d.id}&first=1`);
            
            // Jours de stream via VOD
            const v = await apiCall(`videos?user_id=${d.id}&first=5&type=archive`);
            let days = "Aucune VOD";
            if(v.data.length) {
                const map = {}; v.data.forEach(x => map[new Date(x.created_at).getDay()] = (map[new Date(x.created_at).getDay()]||0)+1);
                days = Object.keys(map).map(k=>['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'][k]).join(', ');
            }

            // Historique Firebase
            const ref = db.collection('history').doc(d.id);
            const old = await ref.get();
            let diff = 0; let trend = "stable";
            if(old.exists) { diff = f.total - old.data().followers; trend = diff > 0 ? "up" : (diff < 0 ? "down" : "stable"); }
            await ref.set({followers: f.total, time: new Date()}, {merge:true});

            // IA Coach
            const p = `Streamer ${d.display_name}. ${f.total} followers. Tendance ${trend} (${diff}). Donne 3 conseils courts.`;
            const r = await ai.models.generateContent({ model: GEMINI_MODEL, contents: [{ role: "user", parts: [{ text: p }] }] });

            res.json({success:true, data: {...d, followers: f.total, days}, diff, trend, ia: r.response.text()});
        } else { res.json({success:false}); }
    } catch(e){ res.json({success:false}); }
});

app.get('/get_default_stream', async (req, res) => {
    try {
        const b = await db.collection('boosts').where('endTime', '>', Date.now()).get();
        if(!b.empty) return res.json({success:true, channel: b.docs[0].data().channel, viewers:'BOOST'});
    } catch(e){}
    // Rotation basic
    const s = await apiCall('streams?language=fr&first=20');
    const pick = s.data.filter(x=>x.viewer_count<100)[0] || s.data[0];
    res.json({success:true, channel: pick ? pick.user_login : 'twitch', viewers: pick ? pick.viewer_count : 0});
});

app.post('/stream_boost', async(req,res)=>{
    const {channel}=req.body;
    try { await db.collection('boosts').add({channel, endTime: Date.now()+900000}); res.json({success:true}); } catch(e){res.json({error:"DB Error"});}
});

// AUTH
app.get('/twitch_auth_start', (req, res) => res.redirect(`https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows`));
app.get('/twitch_auth_callback', async (req, res) => {
    const r = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&code=${req.query.code}&grant_type=authorization_code&redirect_uri=${REDIRECT_URI}`, {method:'POST'});
    const d = await r.json();
    if(d.access_token) { CACHE.twitchUser = d.access_token; res.send("<script>window.opener.postMessage('auth','*');window.close();</script>"); }
});
app.get('/followed_streams', async (req, res) => {
    if(!CACHE.twitchUser) return res.json({success:false});
    const u = await apiCall('users', CACHE.twitchUser); // Get self ID first
    const f = await fetch(`https://api.twitch.tv/helix/streams/followed?user_id=${u.data[0].id}`, {headers:{'Client-ID':TWITCH_CLIENT_ID, 'Authorization':`Bearer ${CACHE.twitchUser}`}});
    const d = await f.json();
    res.json({success:true, streams: d.data});
});

app.listen(PORT, () => console.log(`SERVER V28 FIX ON PORT ${PORT}`));
