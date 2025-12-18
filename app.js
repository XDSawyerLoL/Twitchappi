/**
 * STREAMER & NICHE AI HUB - BACKEND (V20 - STABLE FIX)
 * ====================================================
 * Correctifs :
 * 1. IA : Passage à @google/generative-ai pour corriger "getGenerativeModel is not a function".
 * 2. Deep Search : Boucle de pagination stricte pour trouver les streams < 100 vues.
 * 3. Raid : Filtre Langue FR + Max Viewers corrigé.
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

// CORRECTION IMPORT IA (Standard Library)
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();

// =========================================================
// 1. CONFIGURATION
// =========================================================

const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI || !GEMINI_API_KEY) {
    console.error("FATAL ERROR: Variables d'environnement manquantes.");
    process.exit(1); 
}

// Initialisation IA (Nouvelle Syntaxe Correcte)
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 

// =========================================================
// 2. CACHE & ETAT
// =========================================================
const CACHE = {
    twitchTokens: {},       
    twitchUser: null,       
    streamBoosts: {},       
    boostedStream: null,    
    lastScanData: null,     
    
    globalStreamRotation: {
        streams: [],        
        currentIndex: 0,    
        lastFetchTime: 0,   
        fetchCooldown: 10 * 60 * 1000 
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
    
    // Gestion propre des paramètres URL
    const separator = endpoint.includes('?') ? '&' : '?';
    const finalUrl = `https://api.twitch.tv/helix/${endpoint}`;

    const res = await fetch(finalUrl, {
        headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${accessToken}` }
    });

    if (res.status === 401) {
        if (token === CACHE.twitchTokens['app']?.access_token) CACHE.twitchTokens['app'] = null; 
        if (token === CACHE.twitchUser?.access_token) CACHE.twitchUser = null; 
        throw new Error(`Auth 401`);
    }
    if (!res.ok) throw new Error(`API Error ${res.status}`);
    return res.json();
}

// CORRECTION FONCTION IA
async function runGeminiAnalysis(prompt) {
    try {
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            // Pas de systemInstruction dans l'objet top-level pour Flash 1.5 sur cette version de lib, on l'intègre au prompt ou config
        });
        const response = await result.response;
        const text = response.text();
        return { success: true, html_response: text };
    } catch (e) {
        console.error("Erreur IA:", e);
        return { success: false, error: e.message, html_response: `<p style="color:red;">Erreur IA: ${e.message}</p>` };
    }
}

// =========================================================
// 4. AUTH
// =========================================================
app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${state}`;
    res.cookie('twitch_state', state, { httpOnly: true, secure: true, maxAge: 600000 }); 
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state } = req.query;
    if (state !== req.cookies.twitch_state) return res.status(400).send("State Invalid");
    try {
        const tr = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI })
        });
        const td = await tr.json();
        if (td.access_token) {
            const ur = await twitchApiFetch('users', td.access_token);
            const u = ur.data[0];
            CACHE.twitchUser = { display_name: u.display_name, username: u.login, id: u.id, access_token: td.access_token, expiry: Date.now()+(td.expires_in*1000) };
            res.send(`<html><body><script>if(window.opener){window.opener.postMessage('auth_success','*');window.close();}else{window.location.href='/';}</script></body></html>`);
        } else res.status(500).send("Auth Failed");
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/twitch_logout', (req, res) => { CACHE.twitchUser = null; res.json({success:true}); });

app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) return res.json({ is_connected: true, display_name: CACHE.twitchUser.display_name });
    CACHE.twitchUser = null; res.json({ is_connected: false });
});

// =========================================================
// 5. DATA ROUTES
// =========================================================
app.get('/followed_streams', async (req, res) => {
    if (!CACHE.twitchUser) return res.status(401).json({ success: false });
    try {
        const d = await twitchApiFetch(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token);
        const s = d.data.map(x => ({ user_name: x.user_name, user_login: x.user_login, viewer_count: x.viewer_count, thumbnail_url: x.thumbnail_url }));
        res.json({ success: true, streams: s });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/get_latest_vod', async (req, res) => {
    const c = req.query.channel;
    if (!c) return res.status(400).json({ success: false });
    try {
        const u = await twitchApiFetch(`users?login=${c}`);
        if (!u.data.length) return res.status(404).json({ success: false });
        const v = await twitchApiFetch(`videos?user_id=${u.data[0].id}&type=archive&first=1`);
        if (!v.data.length) return res.status(404).json({ success: false });
        res.json({ success: true, vod: { id: v.data[0].id, title: v.data[0].title, thumbnail_url: v.data[0].thumbnail_url.replace('%{width}','320').replace('%{height}','180') } });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    try {
        const ur = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`);
        if (ur.data.length > 0) {
            const u = ur.data[0];
            let s = null;
            try { const sr = await twitchApiFetch(`streams?user_id=${u.id}`); if(sr.data.length) s=sr.data[0]; } catch(e){}
            let fc = 0; // Followers count deprecated on helix user endpoint but keep field
            const ud = { 
                login: u.login, display_name: u.display_name, id: u.id, profile_image_url: u.profile_image_url,
                is_live: !!s, viewer_count: s?s.viewer_count:0, game_name: s?s.game_name:'', total_views: u.view_count,
                ai_calculated_niche_score: (u.broadcaster_type==='partner')?'9/10':'6/10'
            };
            CACHE.lastScanData = { type: 'user', ...ud };
            return res.json({ success: true, type: 'user', user_data: ud });
        }
        
        const gr = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        if (gr.data.length > 0) {
            const g = gr.data[0];
            const sr = await twitchApiFetch(`streams?game_id=${g.id}&first=100`);
            const tv = sr.data.reduce((a,b)=>a+b.viewer_count,0);
            const gd = { name: g.name, id: g.id, box_art_url: g.box_art_url, total_streamers: sr.data.length, total_viewers: tv, ai_calculated_niche_score: (tv<2000)?'8/10':'4/10' };
            CACHE.lastScanData = { type: 'game', ...gd };
            return res.json({ success: true, type: 'game', game_data: gd });
        }
        res.status(404).json({ success: false });
    } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// =========================================================
// 6. ROTATION LOGIQUE (DEEP SEARCH < 100 VUES)
// =========================================================

async function refreshGlobalStreamList() {
    const now = Date.now();
    const rot = CACHE.globalStreamRotation;
    if (now - rot.lastFetchTime < rot.fetchCooldown && rot.streams.length > 5) return;

    console.log("REFRESH: Deep Search streams FR < 100 vues...");
    let candidates = [];
    let cursor = null;
    let pages = 0;
    
    try {
        // On scanne jusqu'à 10 pages pour trouver des petits streamers
        while (candidates.length < 50 && pages < 10) {
            let url = `streams?language=fr&first=100`;
            if (cursor) url += `&after=${cursor}`;
            
            const r = await twitchApiFetch(url);
            if (!r.data || !r.data.length) break;

            // FILTRE STRICT
            const batch = r.data.filter(s => s.viewer_count > 0 && s.viewer_count <= 100);
            candidates = candidates.concat(batch);

            cursor = r.pagination ? r.pagination.cursor : null;
            if (!cursor) break;
            pages++;
        }

        // Fallback ultime si 0 résultats
        if (candidates.length === 0) {
            console.log("Fallback Top 100 Low");
            const fb = await twitchApiFetch(`streams?language=fr&first=100`);
            candidates = fb.data.sort((a,b)=>a.viewer_count - b.viewer_count).slice(0,20);
        } else {
            // Shuffle
            candidates = candidates.sort(() => Math.random() - 0.5);
        }

        rot.streams = candidates.map(s => ({ channel: s.user_login, viewers: s.viewer_count }));
        if (rot.currentIndex >= rot.streams.length) rot.currentIndex = 0;
        rot.lastFetchTime = now;
        console.log(`REFRESH OK: ${rot.streams.length} chaînes.`);

    } catch (e) { console.error("Err Refresh:", e); }
}

app.get('/get_default_stream', async (req, res) => {
    // 1. Boost
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
        const rem = Math.ceil((CACHE.boostedStream.endTime - Date.now())/60000);
        return res.json({ success: true, channel: CACHE.boostedStream.channel, viewers: 'BOOST', message: `⚡ BOOST ACTIF (${rem}m)`, mode: 'boost' });
    }
    
    // 2. Rotation
    await refreshGlobalStreamList();
    const rot = CACHE.globalStreamRotation;
    
    if (!rot.streams.length) return res.json({ success: true, channel: 'twitch', message: 'Aucun stream trouvé.', mode: 'fallback' });
    
    const cur = rot.streams[rot.currentIndex];
    return res.json({ success: true, channel: cur.channel, viewers: cur.viewers, message: `✅ Auto: ${cur.channel} (${cur.viewers} vues)`, mode: 'auto' });
});

app.post('/cycle_stream', async (req, res) => {
    const { direction } = req.body;
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) return res.status(403).json({ error: "Boost actif" });
    
    await refreshGlobalStreamList();
    const rot = CACHE.globalStreamRotation;
    if (!rot.streams.length) return res.status(404).json({ error: "Vide" });

    if (direction === 'next') rot.currentIndex = (rot.currentIndex + 1) % rot.streams.length;
    else rot.currentIndex = (rot.currentIndex - 1 + rot.streams.length) % rot.streams.length;

    const ns = rot.streams[rot.currentIndex];
    res.json({ success: true, channel: ns.channel, viewers: ns.viewers });
});

// =========================================================
// 7. ACTIONS (Boost, Raid, IA)
// =========================================================

app.get('/check_boost_status', (req, res) => {
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
        return res.json({ is_boosted: true, remaining_seconds: Math.ceil((CACHE.boostedStream.endTime-Date.now())/1000) });
    }
    CACHE.boostedStream = null; res.json({ is_boosted: false });
});

app.post('/stream_boost', (req, res) => {
    const { channel } = req.body;
    if (CACHE.streamBoosts[channel] && (Date.now()-CACHE.streamBoosts[channel]) < 3*3600*1000) return res.status(429).json({ error: "Cooldown 3h." });
    CACHE.streamBoosts[channel] = Date.now();
    CACHE.boostedStream = { channel, endTime: Date.now() + 15*60000 };
    res.json({ success: true, html_response: "<p>Boost activé !</p>" });
});

app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    try {
        const gr = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if (!gr.data.length) return res.status(404).json({ error: "Jeu inconnu" });
        
        // On récupère bcp de streams pour filtrer
        const sr = await twitchApiFetch(`streams?game_id=${gr.data[0].id}&first=100&language=fr`);
        const max = parseInt(max_viewers);
        
        // Filtre strict
        const target = sr.data.filter(s => s.viewer_count <= max).sort((a,b)=>b.viewer_count - a.viewer_count)[0];
        
        if (target) {
            res.json({ success: true, target: { name: target.user_name, login: target.user_login, viewers: target.viewer_count, thumbnail_url: target.thumbnail_url.replace('%{width}','320').replace('%{height}','180') } });
        } else res.json({ success: false, error: "Aucun stream FR sous ce seuil." });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/analyze_schedule', async (req, res) => {
    const { game } = req.body;
    try {
        const gr = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if (!gr.data.length) return res.json({ success: false });
        const sr = await twitchApiFetch(`streams?game_id=${gr.data[0].id}&first=100`);
        const total = sr.data.reduce((a,b)=>a+b.viewer_count,0);
        
        const p = `Jeu: ${game}. ${sr.data.length} streamers, ${total} viewers. HTML only: <h4>Saturation</h4>, <h4>Créneaux</h4> (ul), <strong>Conseil</strong>.`;
        const ai = await runGeminiAnalysis(p);
        res.json({ success: true, game_name: gr.data[0].name, box_art: gr.data[0].box_art_url.replace('{width}','144').replace('{height}','192'), html_response: ai.html_response });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/critique_ia', async (req, res) => {
    const { type, query, niche_score } = req.body;
    const p = type==='niche' ? `Expert Twitch. Score ${niche_score}. Analyse ${query}. HTML only.` : `Expert Video. Analyse ${query}. HTML only.`;
    const r = await runGeminiAnalysis(p);
    res.json(r);
});

app.get('/export_csv', (req, res) => {
    const d = CACHE.lastScanData;
    if(!d) return res.status(404).send("Rien");
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename=Twitch_Analysis.csv');
    res.send(`Type,${d.type}\nNom,${d.display_name||d.name}\nScore,${d.ai_calculated_niche_score}`);
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));

app.listen(PORT, () => console.log(`Serveur V20 (Correctif IA & AutoPlay) sur port ${PORT}`));
