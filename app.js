/**
 * STREAMER & NICHE AI HUB - BACKEND (V28 - FIX JSON & FEATURES)
 * =============================================================
 * 1. FIX CRITIQUE JSON : Nettoyage agressif des caractères de contrôle.
 * 2. IA Gemini REST : Sécurisée contre les réponses vides.
 * 3. Raid & Schedule : Logique API renforcée.
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const admin = require('firebase-admin');

// =========================================================
// 0. INITIALISATION FIREBASE (BLINDÉE V28)
// =========================================================
let serviceAccount;

try {
    if (process.env.FIREBASE_SERVICE_KEY) {
        let rawJson = process.env.FIREBASE_SERVICE_KEY.trim();
        
        // 1. Nettoyage des guillemets externes (fréquent sur Render)
        if ((rawJson.startsWith('"') && rawJson.endsWith('"')) || (rawJson.startsWith("'") && rawJson.endsWith("'"))) {
            rawJson = rawJson.slice(1, -1);
        }

        // 2. CORRECTION DES SAUTS DE LIGNE (Le point critique)
        // On remplace les "vrais" retours à la ligne par rien (si JSON minifié) ou par des espaces
        // Mais on préserve les "\n" littéraux qui sont dans la clé privée.
        // La stratégie la plus sûre : on parse d'abord. Si échec, on tente de fixer.
        
        try {
            serviceAccount = JSON.parse(rawJson);
        } catch (parseError) {
            console.log("⚠️ Parsing standard échoué, tentative de réparation des sauts de ligne...");
            // On remplace les vrais sauts de ligne par des espaces pour recoller le JSON
            const sanitized = rawJson.replace(/\n/g, " ").replace(/\r/g, " ");
            serviceAccount = JSON.parse(sanitized);
        }

        // 3. Post-Traitement de la Clé Privée
        // La clé privée DOIT avoir de vrais retours à la ligne pour que le SDK Firebase l'accepte
        if (serviceAccount.private_key) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }

        console.log("✅ [FIREBASE] JSON parsé avec succès.");
    } else {
        try { serviceAccount = require('./serviceAccountKey.json'); } catch (e) {}
    }

    if (serviceAccount) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id 
        });
        console.log(`✅ [FIREBASE] Connecté : ${serviceAccount.project_id}`);
    } else {
        console.warn("⚠️ [FIREBASE] Pas de clé. Mode sans BDD.");
        try { admin.initializeApp(); } catch(e){} // Dummy init pour éviter crash
    }

} catch (error) {
    console.error("❌ ERREUR FATALE FIREBASE :", error.message);
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

const CACHE = {
    twitchTokens: {},
    twitchUser: null,
    boostedStream: null,
    lastScanData: null,
    globalStreamRotation: { streams: [], currentIndex: 0, lastFetchTime: 0, fetchCooldown: 300000 }
};

// =========================================================
// 2. HELPERS
// =========================================================

async function getTwitchToken(tokenType) {
    if (CACHE.twitchTokens[tokenType] && CACHE.twitchTokens[tokenType].expiry > Date.now()) {
        return CACHE.twitchTokens[tokenType].access_token;
    }
    try {
        const response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' });
        const data = await response.json();
        if (data.access_token) {
            CACHE.twitchTokens[tokenType] = { access_token: data.access_token, expiry: Date.now() + (data.expires_in * 1000) - 300000 };
            return data.access_token;
        }
    } catch (e) { console.error("Token Error", e); }
    return null;
}

async function twitchApiFetch(endpoint, token) {
    const accessToken = token || await getTwitchToken('app');
    if (!accessToken) throw new Error("No Token");
    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${accessToken}` }
    });
    if (res.status === 401) { CACHE.twitchTokens['app'] = null; throw new Error("Auth 401"); }
    return res.json();
}

async function runGeminiAnalysis(prompt) {
    if (!GEMINI_API_KEY) return { success: false, html_response: "<p>Clé IA manquante</p>" };
    try {
        const payload = { contents: [{ parts: [{ text: prompt }] }] };
        const response = await fetch(GEMINI_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await response.json();
        
        if (data.error) throw new Error(data.error.message);
        
        let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "Pas de réponse IA.";
        text = text.replace(/```html/g, '').replace(/```/g, '').trim();
        return { success: true, html_response: text };
    } catch (e) {
        console.error("Gemini Error:", e.message);
        return { success: false, html_response: `<p style="color:red">L'IA est surchargée : ${e.message}</p>` };
    }
}

// =========================================================
// 3. LOGIQUE PRINCIPALE
// =========================================================

async function refreshGlobalStreamList() {
    const now = Date.now();
    if (now - CACHE.globalStreamRotation.lastFetchTime < CACHE.globalStreamRotation.fetchCooldown && CACHE.globalStreamRotation.streams.length > 0) return;
    
    try {
        // On cherche large d'abord
        const data = await twitchApiFetch(`streams?language=fr&first=100`);
        let suitable = (data.data || []).filter(s => s.viewer_count <= 100);

        if (suitable.length < 5) {
            // Backup : Catégorie 'Just Chatting' souvent pleine de petits streams
            const deep = await twitchApiFetch(`streams?game_id=509658&language=fr&first=100`);
            const deepSuitable = (deep.data || []).filter(s => s.viewer_count <= 100);
            suitable = suitable.concat(deepSuitable);
        }
        
        // Tri aléatoire pour la variété
        suitable.sort(() => Math.random() - 0.5);
        // Dédoublonnage
        suitable = [...new Map(suitable.map(item => [item.user_id, item])).values()];

        if (suitable.length > 0) {
            CACHE.globalStreamRotation.streams = suitable.map(s => ({ channel: s.user_login, viewers: s.viewer_count }));
            CACHE.globalStreamRotation.lastFetchTime = now;
        }
    } catch (e) { console.error("Rotation Error", e); }
}

// =========================================================
// 4. ROUTES API
// =========================================================

app.get('/get_default_stream', async (req, res) => {
    // 1. Boost Check
    try {
        const now = Date.now();
        const boostQ = await db.collection('boosts').where('endTime', '>', now).orderBy('endTime', 'desc').limit(1).get();
        if (!boostQ.empty) {
            const d = boostQ.docs[0].data();
            const rem = Math.ceil((d.endTime - now) / 60000);
            return res.json({ success: true, channel: d.channel, viewers: 'BOOST', message: `⚡ BOOST ACTIF (${rem} min)` });
        }
    } catch(e) {}

    // 2. Rotation
    await refreshGlobalStreamList();
    const rot = CACHE.globalStreamRotation;
    if (rot.streams.length === 0) return res.json({ success: true, channel: 'twitch', message: 'Aucun stream trouvé.' });
    
    const s = rot.streams[rot.currentIndex];
    return res.json({ success: true, channel: s.channel, viewers: s.viewers, message: `✅ Découverte : ${s.channel} (${s.viewers} vues)` });
});

app.post('/cycle_stream', async (req, res) => {
    const { direction } = req.body;
    const rot = CACHE.globalStreamRotation;
    if (rot.streams.length === 0) return res.status(404).json({});
    
    if (direction === 'next') rot.currentIndex = (rot.currentIndex + 1) % rot.streams.length;
    else rot.currentIndex = (rot.currentIndex - 1 + rot.streams.length) % rot.streams.length;
    
    const ns = rot.streams[rot.currentIndex];
    return res.json({ success: true, channel: ns.channel });
});

// AUTH
app.get('/twitch_auth_start', (req, res) => {
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows`;
    res.redirect(url);
});
app.get('/twitch_auth_callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.send("Erreur Code");
    try {
        const tr = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI })
        });
        const td = await tr.json();
        if (td.access_token) {
            const u = await twitchApiFetch('users', td.access_token);
            CACHE.twitchUser = { ...u.data[0], access_token: td.access_token, expiry: Date.now() + 3600000 };
            res.send("<script>window.opener.postMessage('auth_success','*');window.close();</script>");
        }
    } catch(e) { res.send("Erreur Auth"); }
});
app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) return res.json({ is_connected: true, display_name: CACHE.twitchUser.display_name });
    res.json({ is_connected: false });
});
app.post('/twitch_logout', (req, res) => { CACHE.twitchUser = null; res.json({ success: true }); });
app.get('/followed_streams', async (req, res) => {
    if (!CACHE.twitchUser) return res.status(401).json({});
    try {
        const d = await twitchApiFetch(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token);
        res.json({ success: true, streams: d.data });
    } catch(e) { res.status(500).json({}); }
});

// FEATURES IA & TOOLS
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    try {
        // User Search
        const uRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`);
        if (uRes.data && uRes.data.length > 0) {
            const u = uRes.data[0];
            let sDetails = null;
            try { const s = await twitchApiFetch(`streams?user_id=${u.id}`); sDetails = s.data[0]; } catch(e){}
            const d = { 
                type: 'user', login: u.login, display_name: u.display_name, profile_image_url: u.profile_image_url,
                is_live: !!sDetails, viewer_count: sDetails ? sDetails.viewer_count : 0,
                total_views: u.view_count, account_type: u.broadcaster_type,
                ai_calculated_niche_score: (u.broadcaster_type === 'partner') ? '8.5/10' : '5.5/10',
                estimated_subs: Math.round((u.view_count || 0) * 0.002) // Fake metric
            };
            CACHE.lastScanData = d;
            return res.json({ success: true, type: 'user', user_data: d });
        }
        
        // Game Search
        const gRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        if (gRes.data && gRes.data.length > 0) {
            const g = gRes.data[0];
            const sRes = await twitchApiFetch(`streams?game_id=${g.id}&first=100`);
            const totV = (sRes.data||[]).reduce((a,b)=>a+b.viewer_count,0);
            const d = { 
                type: 'game', name: g.name, box_art_url: g.box_art_url, 
                total_streamers: (sRes.data||[]).length, total_viewers: totV,
                ai_calculated_niche_score: totV < 5000 ? '8/10' : '4/10'
            };
            CACHE.lastScanData = d;
            return res.json({ success: true, type: 'game', game_data: d });
        }
        res.status(404).json({ success: false, message: "Introuvable" });
    } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/analyze_schedule', async (req, res) => {
    const { game } = req.body;
    try {
        // On récupère le vrai nom du jeu via API
        const gRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(!gRes.data || !gRes.data.length) throw new Error("Jeu introuvable");
        const realName = gRes.data[0].name;
        const boxArt = gRes.data[0].box_art_url.replace('{width}','144').replace('{height}','192');

        const prompt = `Analyse les meilleurs horaires pour streamer sur "${realName}" en France. Format HTML simple: <h4>Analyse</h4> <p>...</p> <h4>Créneaux</h4> <ul><li>Lundi...</li></ul>.`;
        const ai = await runGeminiAnalysis(prompt);
        
        res.json({ success: true, game_name: realName, box_art: boxArt, html_response: ai.html_response });
    } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    try {
        const gRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(!gRes.data.length) throw new Error("Jeu inconnu");
        
        const sRes = await twitchApiFetch(`streams?game_id=${gRes.data[0].id}&first=100&language=fr`);
        const max = parseInt(max_viewers) || 100;
        
        // Filtrage plus souple pour trouver quelqu'un
        let target = sRes.data.find(s => s.viewer_count <= max && s.viewer_count > 0);
        
        if (!target && sRes.data.length > 0) {
            // Si personne sous le seuil, on prend le plus petit dispo
            target = sRes.data.sort((a,b) => a.viewer_count - b.viewer_count)[0];
        }

        if(target) {
            res.json({ success: true, target: {
                name: target.user_name, login: target.user_login, viewers: target.viewer_count,
                game: target.game_name, thumbnail_url: target.thumbnail_url.replace('{width}','320').replace('{height}','180')
            }});
        } else {
            throw new Error("Personne en live sur ce jeu.");
        }
    } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/critique_ia', async (req, res) => {
    const { type, query } = req.body;
    const prompt = type === 'niche' 
        ? `Audit Twitch rapide pour "${query}". HTML: <h4>Forces</h4><ul>...</ul><h4>Faiblesses</h4><ul>...</ul>`
        : `Idées de clips TikTok pour une VOD de "${query}". HTML: <ul><li>00:10 - Intro</li>...</ul>`;
    const r = await runGeminiAnalysis(prompt);
    res.json(r);
});

app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    try {
        await db.collection('boosts').add({ channel, startTime: Date.now(), endTime: Date.now() + 900000 });
        res.json({ success: true, html_response: "<p>Boost OK!</p>" });
    } catch(e) { 
        // Mode dégradé si DB plante : on simule un succès
        CACHE.boostedStream = { channel, endTime: Date.now() + 900000 };
        res.json({ success: true, html_response: "<p>Boost OK (Mode Cache)!</p>" }); 
    }
});

app.get('/check_boost_status', async (req, res) => {
    try {
        const q = await db.collection('boosts').where('endTime','>',Date.now()).limit(1).get();
        if(!q.empty) { const d=q.docs[0].data(); return res.json({is_boosted:true, channel:d.channel}); }
    } catch(e) {}
    if(CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) return res.json({is_boosted:true, channel:CACHE.boostedStream.channel});
    res.json({is_boosted:false});
});

app.get('/export_csv', (req, res) => {
    const d = CACHE.lastScanData;
    if(!d) return res.status(404).send("Rien.");
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment;filename=data.csv');
    res.send(`Type,Nom\n${d.type},${d.display_name||d.name}`);
});

app.listen(PORT, () => console.log(`🚀 PORT ${PORT}`));
