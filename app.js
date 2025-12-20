/**
 * STREAMER HUB - BACKEND V30 (REDEMPTION)
 * =======================================
 * 1. FILTRE STRICT : Algorithme de pagination forcée pour trouver les < 100 vues.
 * 2. MARKET DATA : Route /global_pulse réparée pour les onglets Jeux/Langues.
 * 3. ROUTINES : Raid et Planning simplifiés pour éviter les erreurs.
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

// --- INIT FIREBASE (Sécurisé) ---
let serviceAccount;
if (process.env.FIREBASE_SERVICE_KEY) {
    try {
        let rawJson = process.env.FIREBASE_SERVICE_KEY;
        if (rawJson.startsWith("'") && rawJson.endsWith("'")) rawJson = rawJson.slice(1, -1);
        if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.slice(1, -1);
        rawJson = rawJson.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n');
        serviceAccount = JSON.parse(rawJson);
    } catch (e) {}
} else { try { serviceAccount = require('./serviceAccountKey.json'); } catch (e) {} }

if (serviceAccount) {
    try { admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }); } catch (e) {}
} else { try { admin.initializeApp(); } catch(e){} }

const db = admin.firestore();
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
    smallStreamPool: [], // Stockage dédié aux petits streamers
    lastPoolUpdate: 0 
};

// --- HELPERS ---
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
            config: { systemInstruction: "Tu es un expert concis. Réponds UNIQUEMENT avec des listes HTML (<ul><li>). Pas de phrases d'intro." }
        });
        return { html: r.text.trim() };
    } catch (e) { return { html: "IA Indisponible." }; }
}

// --- MOTEUR DE RECHERCHE STRICT (0-100 VUES) ---
async function updateSmallStreamPool() {
    // Si le pool est frais (moins de 5 min), on ne fait rien
    if (Date.now() - CACHE.lastPoolUpdate < 300000 && CACHE.smallStreamPool.length > 0) return;

    let cursor = "";
    let found = [];
    console.log("🔄 Recherche de PETITS streamers (<100 vues)...");

    // On boucle jusqu'à trouver 50 petits streamers ou scanner 10 pages
    for (let i = 0; i < 10; i++) {
        let url = `streams?language=fr&first=100`;
        if (cursor) url += `&after=${cursor}`;
        
        const res = await apiCall(url);
        if (!res.data || res.data.length === 0) break;

        // FILTRE STRICT IMPITOYABLE
        const smallOnes = res.data.filter(s => s.viewer_count <= 100 && s.viewer_count > 0);
        found = found.concat(smallOnes);

        if (found.length >= 50) break; // On en a assez
        cursor = res.pagination.cursor;
        if (!cursor) break;
    }

    if (found.length > 0) {
        CACHE.smallStreamPool = found;
        CACHE.lastPoolUpdate = Date.now();
        console.log(`✅ Pool mis à jour : ${found.length} petits streamers.`);
    } else {
        console.log("⚠️ Aucun petit streamer trouvé (Étrange).");
    }
}

// --- ROUTES ---

// 1. LECTEUR (GARANTI < 100 VUES)
app.get('/get_default_stream', async (req, res) => {
    // Boost check
    try {
        const b = await db.collection('boosts').where('endTime', '>', Date.now()).limit(1).get();
        if(!b.empty) {
            const data = b.docs[0].data();
            return res.json({ success: true, channel: data.channel, viewers: 'BOOST' });
        }
    } catch(e){}

    // Rotation Strict
    await updateSmallStreamPool();
    if (CACHE.smallStreamPool.length === 0) return res.json({ success: true, channel: 'twitch', viewers: 0 });

    // Prendre un streamer aléatoire dans le pool filtré
    const pick = CACHE.smallStreamPool[Math.floor(Math.random() * CACHE.smallStreamPool.length)];
    
    // Double vérification de sécurité
    if (pick.viewer_count > 100) {
        return res.json({ success: true, channel: 'twitch', viewers: 0 }); // Rejet si > 100
    }

    res.json({ success: true, channel: pick.user_login, viewers: pick.viewer_count });
});

app.post('/cycle_stream', async (req, res) => {
    await updateSmallStreamPool();
    const pick = CACHE.smallStreamPool[Math.floor(Math.random() * CACHE.smallStreamPool.length)];
    res.json({ success: true, channel: pick ? pick.user_login : 'twitch' });
});

// 2. MARKET DATA (Jeux/Langues)
app.post('/global_pulse', async (req, res) => {
    const { type } = req.body;
    try {
        const sRes = await apiCall('streams?first=100'); // Top 100 pour échantillon
        const streams = sRes.data;
        const totalV = streams.reduce((acc,s)=>acc+s.viewer_count,0);
        
        // Extrapolation
        const estViewers = Math.floor(totalV * 1.6);
        const estChannels = Math.floor(streams.length * 80);

        const overview = {
            viewers: estViewers.toLocaleString(),
            channels: estChannels.toLocaleString(),
            active: Math.floor(estChannels*0.9).toLocaleString(),
            wtime: Math.floor(estViewers/60)+"Mh",
            stime: Math.floor(estChannels*2)+"Kh"
        };

        let table = [];
        if (type === 'languages') {
            const map = {};
            streams.forEach(s => {
                const l = s.language.toUpperCase();
                if(!map[l]) map[l]={c:0,v:0};
                map[l].c++; map[l].v+=s.viewer_count;
            });
            table = Object.entries(map).sort((a,b)=>b[1].v-a[1].v).map(([k,v],i)=>({
                rank:i+1, name:k, v:v.v, c:v.c, r: v.v>50000?"A+":"B"
            }));
        } else {
            const gRes = await apiCall('games/top?first=10');
            for(let i=0; i<gRes.data.length; i++){
                const g = gRes.data[i];
                const gs = await apiCall(`streams?game_id=${g.id}&first=5`);
                const gv = gs.data.reduce((a,b)=>a+b.viewer_count,0)*(i<3?30:15);
                const gc = gs.data.length*50;
                table.push({
                    rank:i+1, name:g.name, v:gv, c:gc, r:(gv/gc>30?"A+":"B"),
                    img:g.box_art_url.replace('{width}','50').replace('{height}','70')
                });
            }
        }
        
        // Save history if Games
        if(type==='games') {
            try { await db.collection('market_history').add({timestamp: new Date(), viewers: estViewers}); } catch(e){}
        }

        res.json({ success: true, overview, table });
    } catch(e) { res.status(500).json({error:e.message}); }
});

// 3. SCAN & DASHBOARD
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    try {
        const u = await apiCall(`users?login=${encodeURIComponent(query)}`);
        if(u.data.length){
            const d = u.data[0];
            let followers = 0;
            try { const f = await apiCall(`channels/followers?broadcaster_id=${d.id}&first=1`); followers = f.total; } catch(e){}
            
            // Jours Stream (VOD Analysis)
            const v = await apiCall(`videos?user_id=${d.id}&first=5&type=archive`);
            let days = "Inconnu";
            if(v.data.length) {
                const map = {};
                v.data.forEach(x => {
                    const day = new Date(x.created_at).toLocaleDateString('fr-FR', {weekday:'long'});
                    map[day] = (map[day]||0)+1;
                });
                days = Object.keys(map).slice(0,3).join(', ').toUpperCase();
            }

            // Tendance DB
            let diff=0, trend="stable";
            const ref = db.collection('history').doc(d.id);
            const old = await ref.get();
            if(old.exists) { diff = followers - old.data().followers; trend = diff>0?"up":(diff<0?"down":"stable"); }
            await ref.set({followers, last: new Date()}, {merge:true});

            // IA Coach
            const prompt = `Streamer: ${d.display_name}. Followers: ${followers}. Tendance: ${trend}. Donne 3 conseils courts (HTML).`;
            const r = await runGemini(prompt);

            res.json({ success:true, data:{...d, followers, days}, diff, trend, ia: r.html });
        } else { res.json({success:false, error:"Introuvable"}); }
    } catch(e){ res.json({success:false, error:"Erreur API"}); }
});

// 4. RAID & PLANNING & BOOST
app.post('/start_raid', async (req, res) => {
    const { game, max } = req.body;
    try {
        const gRes = await apiCall(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(!gRes.data.length) return res.json({error:"Jeu introuvable"});
        const sRes = await apiCall(`streams?game_id=${gRes.data[0].id}&first=100&language=fr`);
        const target = sRes.data.filter(s=>s.viewer_count<=max).sort((a,b)=>b.viewer_count-a.viewer_count)[0];
        if(target){
            const u = await apiCall(`users?id=${target.user_id}`);
            res.json({success:true, target:{name:target.user_name, login:target.user_login, viewers:target.viewer_count, avatar:u.data[0]?.profile_image_url, thumb:target.thumbnail_url.replace('{width}','320').replace('{height}','180')}});
        } else res.json({error:"Aucune cible"});
    } catch(e){ res.json({error:e.message}); }
});

app.post('/analyze_schedule', async(req,res)=>{
    const {game}=req.body;
    try {
        const gRes = await apiCall(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(!gRes.data.length) return res.json({success:false});
        const sRes = await apiCall(`streams?game_id=${gRes.data[0].id}&first=100`);
        const total = sRes.data.reduce((a,b)=>a+b.viewer_count,0);
        const r = await runGemini(`Jeu: ${gRes.data[0].name}. ${sRes.data.length} streamers, ${total} viewers. Donne 3 créneaux horaires libres (HTML).`);
        res.json({success:true, name:gRes.data[0].name, img:gRes.data[0].box_art_url.replace('{width}','100').replace('{height}','140'), ia:r.html});
    } catch(e){ res.json({success:false}); }
});

app.post('/stream_boost', async(req,res)=>{
    try { await db.collection('boosts').add({channel:req.body.channel, endTime:Date.now()+900000}); res.json({success:true}); } catch(e){res.json({error:"Erreur DB"});}
});

// AUTH
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
    const u = await apiCall('users');
    const f = await fetch(`https://api.twitch.tv/helix/streams/followed?user_id=${u.data[0].id}`, {headers:{'Client-ID':TWITCH_CLIENT_ID, 'Authorization':`Bearer ${CACHE.twitchUser}`}});
    const d = await f.json();
    res.json({success:true, streams:d.data});
});

app.listen(PORT, () => console.log(`SERVER V30 REDEMPTION ON PORT ${PORT}`));
