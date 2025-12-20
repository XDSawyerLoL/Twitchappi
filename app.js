/**
 * STREAMER & NICHE AI HUB - BACKEND (V27 - STRICT FILTER & COMPARATOR)
 * ====================================================================
 * 1. Authentification Twitch & API Helix
 * 2. IA Google Gemini (REST API)
 * 3. Rotation Stream : ALGORITHME "DEEP DIVE" pour trouver les < 100 vues.
 * 4. Supporte le nouvel onglet Comparateur.
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
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
        rawJson = rawJson.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
        serviceAccount = JSON.parse(rawJson);
        if (serviceAccount.private_key && serviceAccount.private_key.includes("\\n")) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
    } catch (error) {
        console.error("❌ [FIREBASE] Erreur JSON Env Var :", error.message);
    }
} else {
    try {
        serviceAccount = require('./serviceAccountKey.json');
    } catch (e) {
        console.warn("⚠️ [FIREBASE] Pas de clé. Mode lecture seule.");
    }
}

if (serviceAccount) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id 
        });
        console.log(`✅ [FIREBASE] Connecté : ${serviceAccount.project_id}`);
    } catch (e) {
        if (!/already exists/.test(e.message)) console.error("❌ [FIREBASE] Init :", e.message);
    }
} else {
    try { admin.initializeApp(); } catch(e){}
}

const db = admin.firestore();
if (serviceAccount) { try { db.settings({ ignoreUndefinedProperties: true }); } catch(e) {} }

const app = express();

// =========================================================
// 1. CONFIG
// =========================================================

const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI || !GEMINI_API_KEY) {
    console.error("⚠️ ATTENTION : Variables manquantes !");
}

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
        fetchCooldown: 5 * 60 * 1000 // Réduit à 5 min pour être plus réactif
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
    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${accessToken}` }
    });
    if (res.status === 401) {
        CACHE.twitchTokens['app'] = null; 
        throw new Error(`Auth 401`);
    }
    return res.json();
}

async function runGeminiAnalysis(prompt) {
    if (!GEMINI_API_KEY) return { success: false, error: "No API Key" };
    try {
        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 800 }
        };
        const response = await fetch(GEMINI_API_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        const data = await response.json();
        let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        text = text.replace(/```html/g, '').replace(/```/g, '').trim();
        return { success: true, html_response: text };
    } catch (e) {
        return { success: false, html_response: `<p>Erreur IA: ${e.message}</p>` };
    }
}

// =========================================================
// 4. ROTATION INTELLIGENTE (STRICT < 100 VIEWS)
// =========================================================

async function refreshGlobalStreamList() {
    const now = Date.now();
    const rot = CACHE.globalStreamRotation;
    if (now - rot.lastFetchTime < rot.fetchCooldown && rot.streams.length > 0) return;
    
    console.log("🔄 Recherche de streams < 100 vues...");
    
    try {
        // Stratégie 1 : Scan Global FR
        const data = await twitchApiFetch(`streams?language=fr&first=100`);
        let allStreams = data.data || [];
        
        // Filtre STRICT
        let suitable = allStreams.filter(s => s.viewer_count > 0 && s.viewer_count <= 100);

        // Stratégie 2 : Si le Top 100 ne contient que des gros (Ex: Squeezie, etc.), on cherche ailleurs.
        // On va chercher dans des catégories "Niche" spécifiques si la liste est vide ou trop petite.
        if (suitable.length < 5) {
            console.log("⚠️ Trop de gros streamers. Passage en mode 'Deep Dive'...");
            const nicheGameIds = [
                '509658', // Just Chatting (Risqué mais gros volume)
                '509660', // Art
                '1469308723', // Software and Game Development
                '27471', // Minecraft (Souvent des petits serveurs)
                '21779', // League of Legends (Idem, beaucoup de petits en bas de page)
                '32982', // GTA V
                '516575', // Valorant
            ];
            
            // On prend un jeu au hasard pour varier
            const randomGame = nicheGameIds[Math.floor(Math.random() * nicheGameIds.length)];
            
            // On essaie de récupérer une liste plus large ou aléatoire si possible, 
            // mais l'API Helix ne permet pas facilement de "sauter" les pages sans curseur.
            // Astuce : On ne demande PAS la langue FR pour élargir, puis on filtre, 
            // OU on demande FR sur un jeu spécifique qui a moins de traffic.
            
            const deepData = await twitchApiFetch(`streams?game_id=${randomGame}&language=fr&first=100`);
            const deepStreams = deepData.data || [];
            
            const deepSuitable = deepStreams.filter(s => s.viewer_count <= 100);
            suitable = suitable.concat(deepSuitable);
        }

        // Dédoublonnage
        suitable = [...new Map(suitable.map(item => [item.user_id, item])).values()];

        // Fallback ULTIME : Si VRAIMENT personne < 100 vues (très rare), on prend les 5 plus petits qu'on a trouvés, même si > 100.
        // Mais on trie par viewer ASCENDANT pour prendre les plus petits.
        if (suitable.length === 0 && allStreams.length > 0) {
            allStreams.sort((a, b) => a.viewer_count - b.viewer_count); // Du plus petit au plus grand
            suitable = allStreams.slice(0, 5);
        } else {
            // Mélanger pour ne pas toujours montrer les mêmes
            suitable.sort(() => Math.random() - 0.5);
        }
        
        if (suitable.length > 0) {
            rot.streams = suitable.map(s => ({ channel: s.user_login, viewers: s.viewer_count }));
            rot.currentIndex = 0;
            rot.lastFetchTime = now;
            console.log(`✅ Trouvé ${suitable.length} streams "Niche".`);
        }
    } catch (e) { console.error("Err Rotation:", e.message); }
}

// =========================================================
// 5. ROUTES API
// =========================================================

app.get('/get_default_stream', async (req, res) => {
    const now = Date.now();
    let currentBoost = null;

    // Check Firebase Boost
    try {
        const boostQuery = await db.collection('boosts')
            .where('endTime', '>', now).orderBy('endTime', 'desc').limit(1).get();
        if (!boostQuery.empty) {
            const d = boostQuery.docs[0].data();
            currentBoost = { channel: d.channel, endTime: d.endTime };
            CACHE.boostedStream = currentBoost;
        }
    } catch(e) {
        if (CACHE.boostedStream && CACHE.boostedStream.endTime > now) currentBoost = CACHE.boostedStream;
    }

    if (currentBoost && currentBoost.endTime > now) {
        const rem = Math.ceil((currentBoost.endTime - now) / 60000);
        return res.json({ success: true, channel: currentBoost.channel, viewers: 'BOOST', message: `⚡ BOOST ACTIF (${rem} min)` });
    }

    // Auto-Cycle
    await refreshGlobalStreamList();
    const rot = CACHE.globalStreamRotation;
    if (rot.streams.length === 0) return res.json({ success: true, channel: 'twitch', message: 'Aucun stream trouvé.' });

    const s = rot.streams[rot.currentIndex];
    return res.json({ success: true, channel: s.channel, viewers: s.viewers, message: `✅ Découverte : ${s.channel} (${s.viewers} vues)` });
});

app.post('/cycle_stream', async (req, res) => {
    const { direction } = req.body;
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) return res.status(403).json({});

    await refreshGlobalStreamList();
    const rot = CACHE.globalStreamRotation;
    if (rot.streams.length === 0) return res.status(404).json({});

    if (direction === 'next') rot.currentIndex = (rot.currentIndex + 1) % rot.streams.length;
    else rot.currentIndex = (rot.currentIndex - 1 + rot.streams.length) % rot.streams.length;

    const ns = rot.streams[rot.currentIndex];
    return res.json({ success: true, channel: ns.channel, viewers: ns.viewers });
});

// Auth Routes
app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${state}`;
    res.cookie('twitch_state', state, { httpOnly: true, secure: true, maxAge: 600000 }); 
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, error } = req.query;
    if (error) return res.status(400).send(`Erreur : ${error}`);
    try {
        const tr = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI })
        });
        const td = await tr.json();
        if (td.access_token) {
            const ur = await twitchApiFetch('users', td.access_token);
            const u = ur.data[0];
            CACHE.twitchUser = { display_name: u.display_name, username: u.login, id: u.id, access_token: td.access_token, expiry: Date.now() + (td.expires_in * 1000) };
            res.send(`<html><body style="background:#111;color:#fff;text-align:center;padding-top:50px;"><h2>Connecté !</h2><script>window.opener.postMessage('auth_success', '*');window.close();</script></body></html>`);
        } else res.status(500).send("Erreur Token");
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/twitch_logout', (req, res) => { CACHE.twitchUser = null; res.json({success:true}); });
app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) return res.json({ is_connected: true, ...CACHE.twitchUser });
    res.json({ is_connected: false });
});

// Features
app.get('/followed_streams', async (req, res) => {
    if (!CACHE.twitchUser) return res.status(401).json({success:false});
    try {
        const d = await twitchApiFetch(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token);
        res.json({success:true, streams: d.data});
    } catch(e) { res.status(500).json({success:false}); }
});

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({success:false});
    try {
        const uRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`);
        if (uRes.data.length > 0) {
            const u = uRes.data[0];
            let sDetails = null, fCount = 'N/A';
            try {
                const s = await twitchApiFetch(`streams?user_id=${u.id}`);
                if(s.data.length) sDetails = s.data[0];
                const f = await twitchApiFetch(`users/follows?followed_id=${u.id}&first=1`);
                fCount = f.total;
            } catch(e){}
            
            // Calculs pour le comparateur
            const isPartner = u.broadcaster_type === 'partner';
            const views = u.view_count || 0;
            const subsEst = Math.round(views * 0.005); // Estimation basique

            const d = { 
                type:'user', login:u.login, display_name:u.display_name, id:u.id, profile_image_url:u.profile_image_url,
                is_live: !!sDetails, viewer_count: sDetails?sDetails.viewer_count:0, game_name: sDetails?sDetails.game_name:'Hors Ligne',
                total_followers: fCount, total_views: views,
                ai_calculated_niche_score: isPartner?'8.5/10':'5.5/10',
                estimated_subs: subsEst, // Pour le comparateur
                account_type: u.broadcaster_type || 'Affiliate/Standard',
                created_at: u.created_at
            };
            CACHE.lastScanData = d;
            return res.json({success:true, type:'user', user_data: d});
        }
        
        const gRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        if (gRes.data.length > 0) {
            const g = gRes.data[0];
            const sRes = await twitchApiFetch(`streams?game_id=${g.id}&first=100`);
            const totV = sRes.data.reduce((a,b)=>a+b.viewer_count,0);
            const d = { type:'game', name:g.name, id:g.id, box_art_url:g.box_art_url, total_streamers: sRes.data.length, total_viewers: totV, ai_calculated_niche_score: (totV/sRes.data.length<10)?'8.0/10':'4.5/10' };
            CACHE.lastScanData = d;
            return res.json({success:true, type:'game', game_data:d});
        }
        res.status(404).json({success:false});
    } catch(e){ res.status(500).json({success:false, error:e.message}); }
});

app.get('/get_latest_vod', async(req,res)=>{
    const c = req.query.channel;
    try {
        const u = await twitchApiFetch(`users?login=${c}`);
        if(!u.data.length) return res.status(404).json({});
        const v = await twitchApiFetch(`videos?user_id=${u.data[0].id}&type=archive&first=1`);
        if(!v.data.length) return res.status(404).json({});
        res.json({success:true, vod: v.data[0]});
    } catch(e){ res.status(500).json({}); }
});

app.get('/check_boost_status', async(req,res)=>{
    const now = Date.now();
    try {
        const q = await db.collection('boosts').where('endTime','>',now).limit(1).get();
        if(!q.empty) { const d=q.docs[0].data(); return res.json({is_boosted:true, channel:d.channel, remaining_seconds:Math.ceil((d.endTime-now)/1000)}); }
    } catch(e){}
    res.json({is_boosted:false});
});

app.post('/stream_boost', async(req,res)=>{
    const {channel}=req.body;
    if(!channel) return res.status(400).json({});
    const now = Date.now();
    try {
        const act = await db.collection('boosts').where('endTime','>',now).limit(1).get();
        if(!act.empty) return res.status(429).json({error:"Slot occupé"});
        await db.collection('boosts').add({channel, startTime:now, endTime:now+900000}); // 15 min
        CACHE.boostedStream = {channel, endTime:now+900000};
        res.json({success:true, html_response:"<p>Boost Activé !</p>"});
    } catch(e){ res.status(500).json({error:"Erreur DB"}); }
});

app.post('/start_raid', async(req,res)=>{
    const {game, max_viewers} = req.body;
    try {
        const g = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(!g.data.length) return res.status(404).json({error:"Jeu introuvable"});
        const s = await twitchApiFetch(`streams?game_id=${g.data[0].id}&first=100&language=fr`);
        const target = s.data.find(st => st.viewer_count <= max_viewers) || s.data[s.data.length-1]; // Prend le plus petit si pas de match exact
        if(target) res.json({success:true, target:{name:target.user_name, login:target.user_login, viewers:target.viewer_count, game:target.game_name, thumbnail_url:target.thumbnail_url}});
        else res.json({success:false, error:"Personne trouvée."});
    } catch(e){ res.status(500).json({error:e.message}); }
});

app.post('/critique_ia', async(req,res)=>{
    const {type,query,niche_score}=req.body;
    let p = `Expert Twitch. `;
    if(type==='niche') p+=`Analyse "${query}" (Score Niche: ${niche_score}). Format HTML: <h4>Analyse</h4> <ul>3 points forts</ul> <ul>3 conseils</ul>.`;
    else p+=`Analyse VOD "${query}". Format HTML: <h4>Clips</h4> <ul>3 timestamps et titres</ul>.`;
    const r = await runGeminiAnalysis(p);
    res.json(r);
});

app.post('/analyze_schedule', async(req,res)=>{
    const {game}=req.body;
    try {
        const g = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(!g.data.length) return res.json({success:false});
        const r = await runGeminiAnalysis(`Meilleurs horaires pour streamer "${g.data[0].name}". HTML: <h4>Créneaux</h4> <ul>3 jours/heures</ul>.`);
        res.json({success:true, game_name:g.data[0].name, box_art:g.data[0].box_art_url, html_response:r.html_response});
    } catch(e){ res.status(500).json({}); }
});

app.get('/export_csv', (req, res) => {
    const d = CACHE.lastScanData;
    if (!d) return res.status(404).send("Rien à exporter.");
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=data.csv');
    res.send(`Type,Nom,Vues\n${d.type},${d.display_name||d.name},${d.total_views||d.total_viewers}`);
});

app.listen(PORT, () => console.log(`🚀 PORT ${PORT}`));
