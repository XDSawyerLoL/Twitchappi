/**
 * STREAMER & NICHE AI HUB - BACKEND (V21 - GOD MODE / DATA WAREHOUSE)
 * ===================================================================
 * Ce serveur est la fusion finale. Il gère :
 * 1. SECURITÉ : Connexion Firebase compatible Render & Local (V20).
 * 2. AUTH : OAuth Twitch avec fermeture propre des popups.
 * 3. DATA WAREHOUSE : Historisation des stats (SullyGnome-like) dans Firestore.
 * 4. IA ANALYSTE : Gemini configuré pour donner des verdicts "BRUTAUX".
 * 5. LECTEUR : Gestion de la rotation (Auto-Discovery) et des Boosts.
 * 6. OUTILS : Raid Finder, Export CSV, Best Time Calculator.
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { GoogleGenAI } = require('@google/genai');

// --- AJOUT FIREBASE (COMPATIBLE RENDER & LOCAL) ---
const admin = require('firebase-admin');

// =========================================================
// 0. INITIALISATION FIREBASE (LE CORRECTIF BLINDÉ V20)
// =========================================================
let serviceAccount;

// Cas 1 : Environnement de Production (Render)
if (process.env.FIREBASE_SERVICE_KEY) {
    try {
        let rawJson = process.env.FIREBASE_SERVICE_KEY;
        
        // 1. Nettoyage des guillemets parasites au début/fin
        if (rawJson.startsWith("'") && rawJson.endsWith("'")) rawJson = rawJson.slice(1, -1);
        if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.slice(1, -1);

        // 2. CORRECTION CRITIQUE RENDER : Remplacement des sauts de ligne littéraux
        rawJson = rawJson.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n');

        serviceAccount = JSON.parse(rawJson);
        console.log("✅ [FIREBASE] Clé chargée et réparée automatiquement (Source: Env Var).");

    } catch (error) {
        console.error("❌ [FIREBASE] Erreur FATALE de parsing JSON :", error.message);
        console.error("🔍 Vérifiez votre variable FIREBASE_SERVICE_KEY dans Render.");
    }
} 
// Cas 2 : Environnement Local (Fichier physique pour le dev)
else {
    try {
        serviceAccount = require('./serviceAccountKey.json');
        console.log("✅ [FIREBASE] Clé chargée depuis le fichier local.");
    } catch (e) {
        console.warn("⚠️ [FIREBASE] Aucune clé trouvée (Ni Env Var, Ni Fichier). La DB ne marchera pas.");
    }
}

// Démarrage de Firebase Admin
if (serviceAccount) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id 
        });
        console.log(`✅ [FIREBASE] Connecté au projet : ${serviceAccount.project_id}`);
    } catch (e) {
        console.error("❌ [FIREBASE] Erreur d'initialisation Admin :", e.message);
    }
} else {
    try { admin.initializeApp(); } catch(e){}
}

// Initialisation de Firestore
const db = admin.firestore();

// --- FORÇAGE SETTINGS (Contournement Bug Render) ---
if (serviceAccount) {
    try {
        db.settings({
            projectId: serviceAccount.project_id || process.env.GOOGLE_CLOUD_PROJECT || 'goodstreamer-7e87d',
            ignoreUndefinedProperties: true
        });
        console.log("✅ [FIRESTORE] ID de projet forcé dans les settings.");
    } catch(e) {
        console.error("⚠️ [FIRESTORE] Impossible d'appliquer les settings :", e.message);
    }
}

const app = express();

// =========================================================
// 1. CONFIGURATION ET VARIABLES D'ENVIRONNEMENT
// =========================================================

const PORT = process.env.PORT || 10000;

// Récupération des clés
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
const GEMINI_MODEL = "gemini-2.5-flash"; 

// Vérification de sécurité au démarrage
if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI || !GEMINI_API_KEY) {
    console.error("#############################################################");
    console.error("ERREUR FATALE : VARIABLES D'ENVIRONNEMENT MANQUANTES");
    console.error("#############################################################");
}

// Initialisation de l'IA
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY }); 

// Middlewares Express
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 

// =========================================================
// 2. SYSTÈME DE CACHE HYBRIDE & STRUCTURE DE DONNÉES
// =========================================================
const CACHE = {
    twitchTokens: {},       
    twitchUser: null,       
    boostedStream: null,    
    lastScanData: null,     
    
    // Rotation automatique des chaînes (Auto-Discovery)
    globalStreamRotation: {
        streams: [],        
        currentIndex: 0,    
        lastFetchTime: 0,   
        fetchCooldown: 15 * 60 * 1000 
    }
};

// =========================================================
// 3. FONCTIONS UTILITAIRES (HELPERS)
// =========================================================

/**
 * Récupère un Token Twitch "App Access"
 */
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
        } else {
            console.error("Erreur Token Twitch:", data);
            return null;
        }
    } catch (error) { return null; }
}

/**
 * Effectue un appel à l'API Twitch Helix
 */
async function twitchApiFetch(endpoint, token) {
    const accessToken = token || await getTwitchToken('app');
    if (!accessToken) throw new Error("Impossible d'obtenir un Token Twitch.");

    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (res.status === 401) {
        if (token === CACHE.twitchTokens['app']?.access_token) CACHE.twitchTokens['app'] = null; 
        throw new Error(`Erreur Auth Twitch (401). Token expiré.`);
    }
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Erreur API Twitch (${res.status}): ${txt}`);
    }
    return res.json();
}

/**
 * Appelle Google Gemini (IA) - MODE ANALYSTE BRUTAL
 */
async function runGeminiAnalysis(prompt) {
    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
                // Instruction système mise à jour pour le V21
                systemInstruction: "Tu es un expert Data Analyst Twitch. Tes analyses sont basées sur les chiffres. Tu es direct, parfois brutal, mais toujours juste. Réponds UNIQUEMENT en HTML simple (<h4>, <ul>, <li>, <strong>, <p>). Pas de blabla inutile."
            }
        });
        
        const text = response.text.trim();
        return { success: true, html_response: text };

    } catch (e) {
        console.error("Erreur Gemini:", e);
        return { 
            success: false, 
            error: e.message, 
            html_response: `<p style="color:red;">❌ Erreur IA: ${e.message}</p>` 
        };
    }
}

// =========================================================
// 4. LE COEUR DU V21 : DATA WAREHOUSE & HISTORIQUE
// =========================================================

/**
 * Cette fonction transforme votre app en "Mini SullyGnome".
 * Elle enregistre chaque scan dans Firebase et compare avec le passé.
 */
async function handleHistoryAndStats(type, id, newData) {
    const docRef = db.collection('history_stats').doc(String(id));
    
    let doc;
    try {
        doc = await docRef.get();
    } catch (e) {
        console.error("Erreur lecture Firebase:", e);
        return { trend: 'unknown', growth: 0 }; // Fallback si erreur DB
    }

    let analysis = { 
        trend: 'stable', 
        growth: 0, 
        prev_data: null,
        known_since: 'Aujourd\'hui'
    };

    if (doc.exists) {
        const oldData = doc.data();
        
        // Calcul de croissance (Followers)
        if (type === 'user') {
            const currentFollowers = newData.total_followers || 0;
            const oldFollowers = oldData.total_followers || 0;
            const growth = currentFollowers - oldFollowers;
            
            analysis.growth = growth;
            
            if (growth > 0) analysis.trend = 'up';
            else if (growth < 0) analysis.trend = 'down';
            else analysis.trend = 'stable';
            
            analysis.prev_data = oldData;
            
            // Calcul ancienneté dans votre base
            if(oldData.first_seen && oldData.first_seen.toDate) {
                const days = Math.floor((new Date() - oldData.first_seen.toDate()) / (1000*60*60*24));
                analysis.known_since = `${days} jours`;
            }
        }

        // Mise à jour des données (On écrase les vieilles stats par les nouvelles)
        // Mais on garde "first_seen"
        await docRef.update({ 
            ...newData, 
            last_updated: admin.firestore.FieldValue.serverTimestamp() 
        });

    } else {
        // PREMIÈRE FOIS QU'ON VOIT CE SUJET
        analysis.trend = 'new';
        
        await docRef.set({ 
            ...newData, 
            first_seen: admin.firestore.FieldValue.serverTimestamp(),
            last_updated: admin.firestore.FieldValue.serverTimestamp()
        });
    }

    return analysis;
}

// =========================================================
// 5. ROUTES D'AUTHENTIFICATION
// =========================================================

app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const scope = "user:read:follows"; 
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${scope}&state=${state}`;
    res.cookie('twitch_state', state, { httpOnly: true, secure: true, maxAge: 600000 }); 
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error } = req.query;
    if (state !== req.cookies.twitch_state) return res.status(400).send("Erreur state.");
    if (error) return res.status(400).send(`Erreur Twitch.`);

    try {
        const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            body: new URLSearchParams({
                client_id: TWITCH_CLIENT_ID,
                client_secret: TWITCH_CLIENT_SECRET,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: REDIRECT_URI
            })
        });
        
        const tokenData = await tokenRes.json();
        
        if (tokenData.access_token) {
            const userRes = await twitchApiFetch('users', tokenData.access_token);
            const user = userRes.data[0];
            
            CACHE.twitchUser = {
                display_name: user.display_name,
                username: user.login,
                id: user.id,
                access_token: tokenData.access_token,
                expiry: Date.now() + (tokenData.expires_in * 1000)
            };
            
            res.send(`
                <html>
                <body style="background:#111; color:#fff; font-family:sans-serif; text-align:center; padding-top:50px;">
                    <h2>Connexion OK</h2>
                    <script>
                        if (window.opener) { window.opener.postMessage('auth_success', '*'); window.close(); }
                        else { window.location.href = '/'; }
                    </script>
                </body>
                </html>
            `);
        } else {
            res.status(500).send("Erreur Token.");
        }
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/twitch_logout', (req, res) => {
    CACHE.twitchUser = null;
    res.json({ success: true });
});

app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) {
        const { display_name, username, id } = CACHE.twitchUser;
        return res.json({ is_connected: true, display_name, username, id });
    }
    CACHE.twitchUser = null; 
    res.json({ is_connected: false });
});

// =========================================================
// 6. API DE DONNÉES ET SCAN INTELLIGENT
// =========================================================

app.get('/followed_streams', async (req, res) => {
    if (!CACHE.twitchUser) return res.status(401).json({ success: false, error: "Non connecté." });
    try {
        const data = await twitchApiFetch(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token);
        const streams = data.data.map(stream => ({
            user_name: stream.user_name,
            user_login: stream.user_login,
            viewer_count: stream.viewer_count,
            thumbnail_url: stream.thumbnail_url 
        }));
        return res.json({ success: true, streams });
    } catch (e) { return res.status(500).json({ success: false }); }
});

app.get('/get_latest_vod', async (req, res) => {
    const channel = req.query.channel;
    if (!channel) return res.status(400).json({ success: false });
    try {
        const userRes = await twitchApiFetch(`users?login=${channel}`);
        if (!userRes.data.length) return res.status(404).json({ success: false });
        const userId = userRes.data[0].id;

        const vodRes = await twitchApiFetch(`videos?user_id=${userId}&type=archive&first=1`);
        if (!vodRes.data.length) return res.status(404).json({ success: false });
        
        const vod = vodRes.data[0];
        return res.json({ 
            success: true, 
            vod: {
                id: vod.id,
                title: vod.title,
                url: vod.url,
                thumbnail_url: vod.thumbnail_url.replace('%{width}', '150').replace('%{height}', '84')
            }
        });
    } catch (e) { return res.status(500).json({ success: false }); }
});

// --- SCAN TARGET "GOD MODE" ---
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ success: false, message: "Requête vide." });
    
    try {
        // A. SCANNER UN UTILISATEUR
        const userRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`); 
        
        if (userRes.data.length > 0) {
            const user = userRes.data[0];
            
            // Infos Stream Live
            let streamDetails = null;
            try {
                const streamRes = await twitchApiFetch(`streams?user_id=${user.id}`);
                if (streamRes.data.length > 0) streamDetails = streamRes.data[0];
            } catch (e) {}

            // Infos Followers (Indispensable pour la croissance)
            let followerCount = 0;
            try {
                const fRes = await twitchApiFetch(`users/follows?followed_id=${user.id}&first=1`);
                followerCount = fRes.total;
            } catch (e) {}

            // Objet Data complet
            const userData = { 
                login: user.login, 
                display_name: user.display_name, 
                id: user.id, 
                profile_image_url: user.profile_image_url,
                is_live: !!streamDetails,
                viewer_count: streamDetails ? streamDetails.viewer_count : 0,
                game_name: streamDetails ? streamDetails.game_name : '',
                total_followers: followerCount,
                total_views: user.view_count || 0,
                broadcaster_type: user.broadcaster_type,
                created_at: user.created_at // Utile pour savoir si la chaîne est vieille
            };

            // APPEL AU MOTEUR D'HISTORIQUE (La grande nouveauté V21)
            // On enregistre et on compare
            const historyAnalysis = await handleHistoryAndStats('user', user.id, userData);

            // Calcul du score Niche amélioré avec l'historique
            let baseScore = 5.0;
            if (historyAnalysis.trend === 'up') baseScore += 2.0; // Bonus Croissance
            if (historyAnalysis.trend === 'down') baseScore -= 1.0; // Malus Chute
            if (userData.is_live && userData.viewer_count > 50) baseScore += 1.0;
            if (userData.broadcaster_type === 'partner') baseScore += 1.0;
            
            const finalScore = Math.min(Math.max(baseScore, 1), 10).toFixed(1) + '/10';
            userData.ai_calculated_niche_score = finalScore;
            
            // On renvoie tout au front, y compris l'analyse historique
            CACHE.lastScanData = { type: 'user', ...userData, history: historyAnalysis };
            return res.json({ success: true, type: 'user', user_data: userData, history: historyAnalysis });
        }
        
        // B. SCANNER UN JEU (Catégorie)
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        
        if (gameRes.data.length > 0) {
            const game = gameRes.data[0];
            const streamsRes = await twitchApiFetch(`streams?game_id=${game.id}&first=100`);
            const streams = streamsRes.data;
            
            const totalStreams = streams.length;
            const totalViewers = streams.reduce((sum, s) => sum + s.viewer_count, 0);
            
            // Pas d'historique complexe pour les jeux dans cette version (pour garder la rapidité)
            // Mais on pourrait l'ajouter dans handleHistoryAndStats facilement
            const gameData = { 
                name: game.name, 
                id: game.id, 
                box_art_url: game.box_art_url,
                total_streamers: totalStreams,
                total_viewers: totalViewers,
                ai_calculated_niche_score: (totalViewers/totalStreams > 50) ? '9/10' : '4/10'
            };
            
            CACHE.lastScanData = { type: 'game', ...gameData };
            return res.json({ success: true, type: 'game', game_data: gameData });
        }

        return res.status(404).json({ success: false, message: "Aucun résultat trouvé." });
        
    } catch (e) {
        console.error("Erreur Scan:", e);
        return res.status(500).json({ success: false, error: e.message });
    }
});

// =========================================================
// 7. ROTATION, LECTEUR & BOOST (CORRIGÉ V21)
// =========================================================

async function refreshGlobalStreamList() {
    const now = Date.now();
    const rotation = CACHE.globalStreamRotation;
    
    // Cooldown 15 min
    if (now - rotation.lastFetchTime < rotation.fetchCooldown && rotation.streams.length > 0) return;
    
    try {
        // On cherche des petits streamers FR
        const data = await twitchApiFetch(`streams?language=fr&first=100`);
        let suitableStreams = data.data.filter(stream => stream.viewer_count > 0 && stream.viewer_count <= 100);

        // Fallback
        if (suitableStreams.length === 0 && data.data.length > 0) {
            suitableStreams = data.data.slice(0, 10); 
        }

        if (suitableStreams.length > 0) {
            rotation.streams = suitableStreams.map(s => ({ channel: s.user_login, viewers: s.viewer_count }));
            rotation.currentIndex = 0;
            rotation.lastFetchTime = now;
        }
    } catch (e) { console.error("Erreur Rotation:", e); }
}

// Endpoint appelé par le lecteur
app.get('/get_default_stream', async (req, res) => {
    const now = Date.now();
    let currentBoost = null;

    // 1. Priorité Database Boost
    try {
        const boostQuery = await db.collection('boosts')
            .where('endTime', '>', now)
            .orderBy('endTime', 'desc')
            .limit(1)
            .get();
            
        if (!boostQuery.empty) {
            currentBoost = boostQuery.docs[0].data();
            CACHE.boostedStream = currentBoost; 
        }
    } catch(e) { /* Fail silent */ }

    // 2. Si Boost Actif
    if (currentBoost && currentBoost.endTime > now) {
        const remaining = Math.ceil((currentBoost.endTime - now) / 60000);
        return res.json({ 
            success: true, 
            channel: currentBoost.channel, 
            viewers: 'BOOST',
            message: `⚡ BOOST ACTIF (${remaining} min)`
        });
    }

    // 3. Sinon Rotation
    await refreshGlobalStreamList(); 
    const rotation = CACHE.globalStreamRotation;
    
    if (rotation.streams.length === 0) return res.json({ success: true, channel: 'twitch' });

    const currentStream = rotation.streams[rotation.currentIndex];
    return res.json({ 
        success: true, 
        channel: currentStream.channel,
        viewers: currentStream.viewers,
        message: `✅ Auto-Discovery : ${currentStream.channel}`
    });
});

app.post('/cycle_stream', async (req, res) => {
    const { direction } = req.body; 

    // Interdit si boost actif
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
        return res.status(403).json({ success: false });
    }

    await refreshGlobalStreamList();
    const rotation = CACHE.globalStreamRotation;
    if (rotation.streams.length === 0) return res.status(404).json({ success: false });

    if (direction === 'next') {
        rotation.currentIndex = (rotation.currentIndex + 1) % rotation.streams.length;
    } else {
        rotation.currentIndex = (rotation.currentIndex - 1 + rotation.streams.length) % rotation.streams.length;
    }

    const newStream = rotation.streams[rotation.currentIndex];
    return res.json({ success: true, channel: newStream.channel });
});

app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    if (!channel) return res.status(400).json({ error: "Manque le nom" });

    const now = Date.now();
    const DURATION = 15 * 60 * 1000;

    try {
        // Vérif si boost déjà actif globalement
        const activeBoost = await db.collection('boosts').where('endTime', '>', now).limit(1).get();
        if (!activeBoost.empty) {
            return res.status(429).json({ error: "Slot occupé", html_response: "<p style='color:red'>Un boost est déjà actif.</p>" });
        }

        await db.collection('boosts').add({
            channel: channel,
            startTime: now,
            endTime: now + DURATION,
            created_at: admin.firestore.FieldValue.serverTimestamp()
        });

        CACHE.boostedStream = { channel: channel, endTime: now + DURATION }; 
        return res.json({ success: true, html_response: "<p style='color:#0f0'>✅ Boost Activé !</p>" });

    } catch (e) {
        return res.status(500).json({ error: "Erreur DB" });
    }
});

// =========================================================
// 8. INTELLIGENCE ARTIFICIELLE & OUTILS AVANCÉS
// =========================================================

app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    if (!game) return res.status(400).json({ success: false });

    try {
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if (gameRes.data.length === 0) return res.status(404).json({ success: false, error: "Jeu introuvable" });

        const streamsRes = await twitchApiFetch(`streams?game_id=${gameRes.data[0].id}&first=100&language=fr`);
        
        // Logique de tri simple
        const target = streamsRes.data
            .filter(s => s.viewer_count <= (max_viewers || 100))
            .sort((a, b) => b.viewer_count - a.viewer_count)[0];

        if (target) {
            return res.json({
                success: true,
                target: {
                    name: target.user_name,
                    login: target.user_login,
                    viewers: target.viewer_count,
                    thumbnail_url: target.thumbnail_url.replace('%{width}', '100').replace('%{height}', '56')
                }
            });
        }
        return res.json({ success: false, error: "Personne trouvé." });
    } catch (e) { return res.status(500).json({ success: false }); }
});

// IA : Critique & Verdict (Prompt V21 mis à jour)
app.post('/critique_ia', async (req, res) => {
    const { type, query, history_data } = req.body;
    let prompt = "";

    if (type === 'niche') {
        // Injection des données historiques dans le prompt
        const growth = history_data?.growth || 0;
        const trend = history_data?.trend || 'stable';
        const trendText = trend === 'up' ? "EN FORTE CROISSANCE" : (trend === 'down' ? "EN PERTE DE VITESSE" : "STABLE");

        prompt = `
            ANALYSE CIBLE : "${query}".
            DONNÉES HISTORIQUES : Le sujet est actuellement ${trendText} (${growth > 0 ? '+' : ''}${growth} followers depuis la dernière analyse).
            
            Agis comme un Investisseur Venture Capital. 
            Je veux une réponse structurée HTML :
            1. <h4>VERDICT FINAL</h4> (Un mot : "FONCE", "ATTENTION", "ABANDON").
            2. <ul> avec 3 arguments chiffrés basés sur la tendance actuelle.
            3. <p><strong>CONSEIL EN OR :</strong> Une action immédiate à prendre.</p>
        `;
    } else if (type === 'repurpose') {
        prompt = `Expert Montage. Analyse VOD "${query}". HTML: <h4>Meilleurs Moments</h4>, <ul> avec 3 timestamps pour TikTok.`;
    }

    const result = await runGeminiAnalysis(prompt);
    res.json(result);
});

app.post('/analyze_schedule', async (req, res) => {
    const { game } = req.body;
    if(!game) return res.status(400).json({error:"Jeu manquant"});
    
    try {
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(!gameRes.data.length) return res.json({success:false, error:"Jeu introuvable"});
        
        const g = gameRes.data[0];
        const sRes = await twitchApiFetch(`streams?game_id=${g.id}&first=100`);
        const totalV = sRes.data.reduce((acc,s)=>acc+s.viewer_count,0);
        
        const prompt = `Jeu: ${g.name}. ${sRes.data.length} streamers pour ${totalV} viewers. HTML: <h4>Saturation</h4>, <ul> créneaux horaires libres.`;
        
        const aiRes = await runGeminiAnalysis(prompt);
        return res.json({ success: true, game_name: g.name, box_art: g.box_art_url.replace('{width}','144').replace('{height}','192'), html_response: aiRes.html_response });
    } catch(e) { return res.status(500).json({success:false}); }
});

app.get('/export_csv', (req, res) => {
    const data = CACHE.lastScanData;
    if (!data) return res.status(404).send("Pas de données.");
    
    let csv = "Metrique,Valeur\n";
    if (data.type === 'user') {
        csv += `Streamer,${data.display_name}\nFollowers,${data.total_followers}\nTendance,${data.history?.trend || 'N/A'}`;
    } else {
        csv += `Jeu,${data.name}\nViewers,${data.total_viewers}`;
    }
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=Twitch_Analysis_V21.csv');
    res.send(csv);
});

// =========================================================
// 9. DÉMARRAGE DU SERVEUR
// =========================================================

app.listen(PORT, () => {
    console.log(`===========================================`);
    console.log(` STREAMER HUB V21 GOD MODE ACTIVATED ON PORT ${PORT}`);
    console.log(`===========================================`);
});

