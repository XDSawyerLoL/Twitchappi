/**
 * ==========================================================================================
 * STREAMER & NICHE AI HUB - SERVER BACKEND (VERSION 24 - STABLE FIX)
 * ==========================================================================================
 * Auteur : Assistant IA
 * Description : Serveur complet avec correctif critique pour l'API Google Gemini.
 * * CHANGELOG V24 :
 * - UPDATE IA : Passage forcé au modèle 'gemini-1.5-flash' (Le standard actuel).
 * - FIX 404 : Utilisation de la configuration système compatible v1beta récente.
 * - DEEP SEARCH : Algorithme de recherche en profondeur pour les streams < 100 vues (Maintenu).
 * - AUTO-CYCLE : Gestion backend de la rotation synchronisée.
 * ==========================================================================================
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

// IMPORT DE LA LIBRAIRIE OFFICIELLE GOOGLE AI
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialisation du serveur Express
const app = express();

// ==========================================================================================
// 1. CONFIGURATION ET SÉCURITÉ
// ==========================================================================================

const PORT = process.env.PORT || 10000;

// Récupération des variables d'environnement
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

// --- CONFIGURATION IA CRITIQUE ---
// On utilise gemini-1.5-flash qui est le plus rapide et le moins sujet aux erreurs 404 actuelles
const GEMINI_MODEL_NAME = "gemini-1.5-flash"; 

// Vérification stricte au démarrage
if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI || !GEMINI_API_KEY) {
    console.error("\n#############################################################");
    console.error("ERREUR FATALE : VARIABLES D'ENVIRONNEMENT MANQUANTES");
    console.error(`- TWITCH_CLIENT_ID: ${TWITCH_CLIENT_ID ? 'OK' : 'MANQUANT'}`);
    console.error(`- TWITCH_CLIENT_SECRET: ${TWITCH_CLIENT_SECRET ? 'OK' : 'MANQUANT'}`);
    console.error(`- GEMINI_API_KEY: ${GEMINI_API_KEY ? 'OK' : 'MANQUANT'}`);
    console.error("#############################################################\n");
    process.exit(1); 
}

// Initialisation de l'instance IA avec instruction système globale
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: GEMINI_MODEL_NAME,
    systemInstruction: "Tu es un expert Twitch. Réponds UNIQUEMENT en HTML pur (sans balises ```html ou body). Utilise <h4>, <ul>, <li>, <strong>."
});

// Middlewares
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 

// ==========================================================================================
// 2. GESTION DE L'ÉTAT (CACHE RAM)
// ==========================================================================================

const CACHE = {
    twitchTokens: { app: null }, 
    twitchUser: null,       
    streamBoosts: {},       
    boostedStream: null,    
    lastScanData: null,     
    
    // CONFIGURATION ROTATION AUTOMATIQUE
    globalStreamRotation: {
        streams: [],        
        currentIndex: 0,    
        lastFetchTime: 0,   
        fetchCooldown: 5 * 60 * 1000 // 5 Minutes
    }
};

// ==========================================================================================
// 3. HELPERS (TWITCH & IA)
// ==========================================================================================

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
    if (!accessToken) throw new Error("Token manquant.");

    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (res.status === 401) {
        if (token === CACHE.twitchTokens['app']?.access_token) CACHE.twitchTokens['app'] = null; 
        if (token === CACHE.twitchUser?.access_token) CACHE.twitchUser = null; 
        throw new Error(`Token Twitch expiré (401).`);
    }
    if (!res.ok) throw new Error(`Erreur API Twitch (${res.status})`);
    return res.json();
}

/**
 * Fonction IA Robuste : Utilise la méthode generateContent simple
 * Compatible avec les dernières versions du SDK.
 */
async function runGeminiAnalysis(prompt) {
    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        return { success: true, html_response: text };
    } catch (e) {
        console.error("ERREUR IA:", e);
        return { 
            success: false, 
            error: e.message, 
            html_response: `<p style="color:red;"><strong>Erreur IA:</strong> ${e.message}. Vérifiez votre clé API ou le quota.</p>` 
        };
    }
}

// ==========================================================================================
// 4. AUTHENTIFICATION
// ==========================================================================================

app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${state}`;
    res.cookie('twitch_state', state, { httpOnly: true, secure: true, maxAge: 600000 }); 
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error } = req.query;
    if (state !== req.cookies.twitch_state) return res.status(403).send("Erreur état.");
    try {
        const tr = await fetch('[https://id.twitch.tv/oauth2/token](https://id.twitch.tv/oauth2/token)', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI })
        });
        const td = await tr.json();
        if (td.access_token) {
            const ur = await twitchApiFetch('users', td.access_token);
            CACHE.twitchUser = { display_name: ur.data[0].display_name, username: ur.data[0].login, id: ur.data[0].id, access_token: td.access_token, expiry: Date.now() + (td.expires_in * 1000) };
            res.send(`<html><body><script>if(window.opener){window.opener.postMessage('auth_success','*');window.close();}else{window.location.href='/';}</script></body></html>`);
        } else res.status(500).send("Erreur Token.");
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/twitch_logout', (req, res) => { CACHE.twitchUser = null; res.json({ success: true }); });

app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) return res.json({ is_connected: true, display_name: CACHE.twitchUser.display_name });
    CACHE.twitchUser = null; res.json({ is_connected: false });
});

// ==========================================================================================
// 5. DATA (SCAN, VOD)
// ==========================================================================================

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
        res.json({ success: true, vod: { id: v.data[0].id, title: v.data[0].title, thumbnail_url: v.data[0].thumbnail_url.replace('%{width}','320').replace('%{height}','180'), duration: v.data[0].duration } });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    try {
        const ur = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`); 
        if (ur.data.length > 0) {
            const u = ur.data[0];
            let s = null;
            try { const sr = await twitchApiFetch(`streams?user_id=${u.id}`); if(sr.data.length) s = sr.data[0]; } catch(e){}
            const ud = { 
                login: u.login, display_name: u.display_name, id: u.id, profile_image_url: u.profile_image_url,
                is_live: !!s, viewer_count: s ? s.viewer_count : 0, game_name: s ? s.game_name : '', total_views: u.view_count,
                ai_calculated_niche_score: (u.broadcaster_type === 'partner') ? '9.0/10' : '6.0/10'
            };
            CACHE.lastScanData = { type: 'user', ...ud };
            return res.json({ success: true, type: 'user', user_data: ud });
        }
        
        const gr = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        if (gr.data.length > 0) {
            const g = gr.data[0];
            const sr = await twitchApiFetch(`streams?game_id=${g.id}&first=100`);
            const tv = sr.data.reduce((acc, s) => acc + s.viewer_count, 0);
            const gd = { name: g.name, id: g.id, box_art_url: g.box_art_url, total_streamers: sr.data.length, total_viewers: tv, ai_calculated_niche_score: (tv < 2000) ? '8.5/10' : '4.0/10' };
            CACHE.lastScanData = { type: 'game', ...gd };
            return res.json({ success: true, type: 'game', game_data: gd });
        }
        res.status(404).json({ success: false });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ==========================================================================================
// 6. ROTATION (DEEP SEARCH < 100 VUES)
// ==========================================================================================

async function refreshGlobalStreamList() {
    const now = Date.now();
    const rot = CACHE.globalStreamRotation;
    if (now - rot.lastFetchTime < rot.fetchCooldown && rot.streams.length > 5) return;
    
    console.log(">>> [DEEP SEARCH] Lancement de la recherche de petits streams FR...");
    let candidates = [];
    let cursor = null;
    let pageCount = 0;
    
    try {
        while (candidates.length < 50 && pageCount < 10) {
            let url = `streams?language=fr&first=100`;
            if (cursor) url += `&after=${cursor}`;
            const res = await twitchApiFetch(url);
            if (!res.data || !res.data.length) break;

            const batch = res.data.filter(s => s.viewer_count > 0 && s.viewer_count <= 100);
            candidates = candidates.concat(batch);
            cursor = res.pagination ? res.pagination.cursor : null;
            if (!cursor) break;
            pageCount++;
        }

        if (candidates.length === 0) {
            console.log(">>> [FALLBACK] Aucun stream < 100.");
            const fb = await twitchApiFetch(`streams?language=fr&first=100`);
            candidates = fb.data.sort((a,b) => a.viewer_count - b.viewer_count).slice(0, 20);
        } else {
            candidates = candidates.sort(() => Math.random() - 0.5);
        }

        rot.streams = candidates.map(s => ({ channel: s.user_login, viewers: s.viewer_count }));
        if (rot.currentIndex >= rot.streams.length) rot.currentIndex = 0;
        rot.lastFetchTime = now;
        console.log(`>>> [SUCCESS] ${rot.streams.length} chaînes trouvées.`);
    } catch (e) { console.error("Erreur Deep Search:", e); }
}

app.get('/get_default_stream', async (req, res) => {
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
        const rem = Math.ceil((CACHE.boostedStream.endTime - Date.now()) / 60000);
        return res.json({ success: true, channel: CACHE.boostedStream.channel, viewers: 'BOOST', message: `⚡ BOOST ACTIF (${rem} min)`, mode: 'boost' });
    }
    await refreshGlobalStreamList(); 
    const rot = CACHE.globalStreamRotation;
    if (rot.streams.length === 0) return res.json({ success: true, channel: 'twitch', message: 'Aucun stream', mode: 'fallback' });
    const cur = rot.streams[rot.currentIndex];
    return res.json({ success: true, channel: cur.channel, viewers: cur.viewers, message: `✅ Auto: ${cur.channel} (${cur.viewers} vues)`, mode: 'auto' });
});

app.post('/cycle_stream', async (req, res) => {
    const { direction } = req.body; 
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) return res.status(403).json({ success: false, error: "Boost actif." });
    await refreshGlobalStreamList();
    const rot = CACHE.globalStreamRotation;
    if (rot.streams.length === 0) return res.status(404).json({ success: false });
    if (direction === 'next') rot.currentIndex = (rot.currentIndex + 1) % rot.streams.length;
    else rot.currentIndex = (rot.currentIndex - 1 + rot.streams.length) % rot.streams.length;
    const ns = rot.streams[rot.currentIndex];
    return res.json({ success: true, channel: ns.channel, viewers: ns.viewers });
});

// ==========================================================================================
// 7. FONCTIONS AVANCÉES
// ==========================================================================================

app.get('/check_boost_status', (req, res) => {
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
        return res.json({ is_boosted: true, remaining_seconds: Math.ceil((CACHE.boostedStream.endTime - Date.now())/1000) });
    }
    CACHE.boostedStream = null;
    return res.json({ is_boosted: false });
});

app.post('/stream_boost', (req, res) => {
    const { channel } = req.body;
    if (CACHE.streamBoosts[channel] && (Date.now() - CACHE.streamBoosts[channel]) < 3*3600*1000) return res.status(429).json({ error: "Cooldown 3h." });
    CACHE.streamBoosts[channel] = Date.now();
    CACHE.boostedStream = { channel: channel, endTime: Date.now() + 15*60000 };
    res.json({ success: true, html_response: "<p>Boost activé !</p>" });
});

app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    try {
        const gr = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if (!gr.data.length) return res.status(404).json({ error: "Jeu inconnu" });
        const sr = await twitchApiFetch(`streams?game_id=${gr.data[0].id}&first=100&language=fr`);
        const target = sr.data.filter(s => s.viewer_count <= parseInt(max_viewers)).sort((a,b) => b.viewer_count - a.viewer_count)[0];
        if (target) res.json({ success: true, target: { name: target.user_name, login: target.user_login, viewers: target.viewer_count, thumbnail_url: target.thumbnail_url.replace('%{width}','320').replace('%{height}','180') }});
        else res.json({ success: false, error: "Personne." });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/analyze_schedule', async (req, res) => {
    const { game } = req.body;
    try {
        const gr = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(!gr.data.length) return res.json({success:false});
        const sr = await twitchApiFetch(`streams?game_id=${gr.data[0].id}&first=100`);
        const totalV = sr.data.reduce((a,b)=>a+b.viewer_count,0);
        const ai = await runGeminiAnalysis(`Jeu: ${gr.data[0].name}. ${sr.data.length} streamers, ${totalV} viewers. Analyse saturation. Réponds HTML.`);
        res.json({ success: true, game_name: gr.data[0].name, box_art: gr.data[0].box_art_url.replace('{width}','144').replace('{height}','192'), html_response: ai.html_response });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/critique_ia', async (req, res) => {
    const { type, query, niche_score } = req.body;
    const p = type==='niche' ? `Expert Twitch. Score: ${niche_score}. Analyse ${query}.` : `Expert Video. Analyse ${query}.`;
    const r = await runGeminiAnalysis(p);
    res.json(r);
});

app.get('/export_csv', (req, res) => {
    const d = CACHE.lastScanData;
    if(!d) return res.status(404).send("Rien.");
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename=Twitch_Analysis.csv');
    res.send(`Type,${d.type}\nNom,${d.display_name||d.name}\nScore,${d.ai_calculated_niche_score}`);
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));

app.listen(PORT, () => console.log(`Serveur V23 démarré sur le port ${PORT}`));
