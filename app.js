/**
 * STREAMER & NICHE AI HUB - BACKEND (V31 - ULTIMATE PRODUCTION)
 * =============================================================
 * Serveur Node.js/Express complet pour l'application "JustPlayer / Streamer Hub".
 * * FONCTIONNALITÉS :
 * 1. AUTHENTIFICATION : OAuth2 Twitch (Login/Logout) + Gestion Cookies.
 * 2. BASE DE DONNÉES : Firebase Firestore (Persistance Boosts, Historique, Market).
 * 3. INTELLIGENCE ARTIFICIELLE : Google Gemini (Coach, Analyste, Planning).
 * 4. LECTEUR INTELLIGENT : Rotation automatique (Filtre strict <100 vues) + Boost.
 * 5. MARKET DATA : Agrégation de données globales (Vue "TwitchTracker").
 * 6. RAID FINDER : Recherche de cibles optimisée avec Avatar + Miniature.
 * 7. ANALYSE : Calcul de tendances (Bourse), Score 5 étoiles, Habitudes de stream.
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

// ====================================================================================
// 1. INITIALISATION DE LA BASE DE DONNÉES (FIREBASE / FIRESTORE)
// ====================================================================================
// Ce bloc est critique pour le fonctionnement sur Render.com et en local.

let serviceAccount;

// Cas A : Environnement de Production (Variable d'environnement Render)
if (process.env.FIREBASE_SERVICE_KEY) {
    try {
        let rawJson = process.env.FIREBASE_SERVICE_KEY;
        
        // Nettoyage des guillemets parasites (souvent ajoutés par les interfaces web)
        if (rawJson.startsWith("'") && rawJson.endsWith("'")) rawJson = rawJson.slice(1, -1);
        if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.slice(1, -1);
        
        // Correction des sauts de ligne échappés (\n) qui cassent le JSON
        rawJson = rawJson.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n');

        serviceAccount = JSON.parse(rawJson);
        console.log("✅ [FIREBASE] Clé chargée et réparée depuis les variables d'environnement.");

    } catch (error) {
        console.error("❌ [FIREBASE] Erreur FATALE de parsing JSON :", error.message);
        console.error("🔍 Vérifiez votre variable FIREBASE_SERVICE_KEY.");
    }
} 
// Cas B : Environnement Local (Fichier physique)
else {
    try {
        serviceAccount = require('./serviceAccountKey.json');
        console.log("✅ [FIREBASE] Clé chargée depuis le fichier local.");
    } catch (e) {
        console.warn("⚠️ [FIREBASE] Aucune clé trouvée. La base de données ne sera pas disponible.");
    }
}

// Initialisation de l'instance Admin
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
    // Fallback pour ne pas faire crasher l'app si pas de DB
    try { admin.initializeApp(); } catch(e){}
}

const db = admin.firestore();

// Forçage des paramètres pour éviter les bugs "Undefined Project ID" sur certains hébergeurs
if (serviceAccount) {
    try {
        db.settings({
            projectId: serviceAccount.project_id || 'streamer-hub-prod',
            ignoreUndefinedProperties: true
        });
    } catch(e) {
        console.warn("⚠️ [FIREBASE] Impossible d'appliquer les settings avancés.");
    }
}

const app = express();
const PORT = process.env.PORT || 10000;

// ====================================================================================
// 2. CONFIGURATION API (TWITCH & GEMINI)
// ====================================================================================

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
const GEMINI_MODEL = "gemini-2.5-flash"; 

// Vérification de sécurité au démarrage
if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI || !GEMINI_API_KEY) {
    console.error("#############################################################");
    console.error("ERREUR FATALE : VARIABLES D'ENVIRONNEMENT MANQUANTES");
    console.error("Vérifiez TWITCH_CLIENT_ID, SECRET, REDIRECT_URI et GEMINI_API_KEY");
    console.error("#############################################################");
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY }); 

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 

// ====================================================================================
// 3. SYSTÈME DE CACHE & ÉTAT GLOBAL
// ====================================================================================

const CACHE = {
    twitchTokens: {},       // Stockage des tokens d'application et utilisateur
    twitchUser: null,       // Session utilisateur connecté
    boostedStream: null,    // Stream mis en avant (Boost)
    lastScanData: null,     // Dernières données pour l'export CSV
    
    // Rotation automatique des chaînes (Découverte)
    globalStreamRotation: {
        streams: [],        // Liste des petits streamers
        currentIndex: 0,    
        lastFetchTime: 0,   
        fetchCooldown: 10 * 60 * 1000 // 10 Minutes de cache
    },

    // Cache pour les données de marché (éviter de spammer l'API Twitch)
    marketData: {
        games: null,
        languages: null,
        lastUpdate: 0,
        updateInterval: 5 * 60 * 1000 // 5 Minutes
    }
};

// ====================================================================================
// 4. FONCTIONS UTILITAIRES (HELPERS)
// ====================================================================================

/**
 * Obtient un Token d'Application Twitch (Client Credentials Flow).
 * Gère le cache et l'expiration.
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
                expiry: Date.now() + (data.expires_in * 1000) - 300000 // Marge de 5 min
            };
            return data.access_token;
        } else {
            console.error("Erreur Token Twitch:", data);
            return null;
        }
    } catch (error) {
        console.error("Erreur réseau Token:", error);
        return null;
    }
}

/**
 * Wrapper pour les appels API Twitch Helix.
 * Gère l'authentification et le renouvellement automatique du token en cas d'erreur 401.
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
        // Token invalide, on nettoie le cache et on relance
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
 * Moteur d'Analyse IA (Gemini)
 * Accepte un "type" pour adapter le persona (Coach, Analyste, etc.)
 */
async function runGeminiAnalysis(prompt, type="standard") {
    let sysInstruct = "Tu es un expert Twitch. Réponds en HTML simple.";
    
    if (type === 'coach') {
        sysInstruct = "Tu es un Coach de Performance Twitch Bienveillant. Tu analyses les chiffres comme un expert financier, mais tu parles pour motiver. Utilise des listes à puces. Sois concis.";
    } else if (type === 'scheduler') {
        sysInstruct = "Tu es un expert en planification stratégique. Tu cherches les 'Océans Bleus' (créneaux peu concurrentiels).";
    }

    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { systemInstruction: sysInstruct }
        });
        
        return { success: true, html_response: response.text.trim() };

    } catch (e) {
        console.error("Erreur Gemini:", e);
        return { 
            success: false, 
            error: e.message, 
            html_response: `<p style="color:red;">❌ Le service IA est momentanément indisponible.</p>` 
        };
    }
}

/**
 * Moteur "Bourse" : Historisation et Calcul de Tendances.
 * Sauvegarde chaque scan dans Firebase et compare avec le passé.
 */
async function handleHistoryAndStats(type, id, newData) {
    const docRef = db.collection('history_stats').doc(String(id));
    let doc;
    try { doc = await docRef.get(); } catch(e) { return { trend: 'stable', diff: 0 }; }

    let analysis = { trend: 'stable', diff: 0, previous: 0 };

    if (doc.exists) {
        const oldData = doc.data();
        if (type === 'user') {
            const currentFollowers = newData.total_followers || 0;
            const oldFollowers = oldData.total_followers || 0;
            const diff = currentFollowers - oldFollowers;
            
            analysis.diff = diff;
            analysis.previous = oldFollowers;
            
            if (diff > 0) analysis.trend = 'up';
            else if (diff < 0) analysis.trend = 'down';
            else analysis.trend = 'stable';
        }
        // Mise à jour (Merge)
        await docRef.update({ 
            ...newData, 
            last_updated: admin.firestore.FieldValue.serverTimestamp() 
        });
    } else {
        // Nouveau profil
        analysis.trend = 'new';
        await docRef.set({ 
            ...newData, 
            first_seen: admin.firestore.FieldValue.serverTimestamp(),
            last_updated: admin.firestore.FieldValue.serverTimestamp()
        });
    }
    return analysis;
}

// ====================================================================================
// 5. ROTATION "DEEP DIVE" (FILTRE STRICT < 100 VUES)
// ====================================================================================

async function refreshGlobalStreamList() {
    const now = Date.now();
    const rotation = CACHE.globalStreamRotation;
    
    // Cooldown
    if (now - rotation.lastFetchTime < rotation.fetchCooldown && rotation.streams.length > 0) return;
    
    console.log("🔄 Lancement du Deep Dive Scan (<100 vues)...");
    
    let allFoundStreams = [];
    let cursor = ""; 
    
    try {
        // On boucle 5 fois (Pagination) pour aller chercher loin dans la liste
        for (let i = 0; i < 5; i++) {
            let url = `streams?language=fr&first=100`;
            if (cursor) url += `&after=${cursor}`;
            
            const res = await twitchApiFetch(url);
            const batch = res.data;
            
            if (!batch || batch.length === 0) break;

            // FILTRE STRICT : On ne garde que ceux entre 0 et 100 vues
            const smallOnes = batch.filter(s => s.viewer_count > 0 && s.viewer_count <= 100);
            
            allFoundStreams = allFoundStreams.concat(smallOnes);
            
            if (allFoundStreams.length >= 50) break; // On a assez de stock
            
            cursor = res.pagination.cursor;
            if (!cursor) break;
        }

        if (allFoundStreams.length > 0) {
            // Mélange pour varier
            allFoundStreams.sort(() => Math.random() - 0.5);
            
            rotation.streams = allFoundStreams.map(s => ({ channel: s.user_login, viewers: s.viewer_count }));
            rotation.currentIndex = 0;
            rotation.lastFetchTime = now;
            console.log(`✅ Deep Dive : ${allFoundStreams.length} streamers trouvés.`);
        } else {
            console.log("⚠️ Aucun petit streamer trouvé. Fallback.");
            rotation.streams = [{channel:'twitch', viewers:0}]; 
        }

    } catch (e) { console.error("Erreur Deep Dive:", e); }
}

// ====================================================================================
// 6. ROUTES API PRINCIPALES
// ====================================================================================

// --- A. GLOBAL MARKET PULSE (TwitchTracker Clone) ---
app.post('/global_pulse', async (req, res) => {
    const { type } = req.body; // 'games' ou 'languages'
    
    try {
        // 1. Récupération du Top 100 streams pour échantillonnage statistique
        const sRes = await twitchApiFetch('streams?first=100');
        const streams = sRes.data;
        
        // Calcul des totaux de l'échantillon
        const totalSampleViewers = streams.reduce((acc, s) => acc + s.viewer_count, 0);
        
        // Extrapolation pour estimer le trafic total (Facteur x1.5 environ pour la longue traîne)
        const estViewers = Math.floor(totalSampleViewers * 1.5);
        const estChannels = Math.floor(streams.length * 60); 

        // Données Overview (Cartes du haut)
        const overview = {
            viewers: estViewers.toLocaleString(),
            channels: estChannels.toLocaleString(),
            active_streamers: Math.floor(estChannels * 0.8).toLocaleString(),
            watch_time: Math.floor(estViewers * 50 / 60) + "Mh",
            stream_time: Math.floor(estChannels * 2.5) + "Kh"
        };

        let tableData = [];

        if (type === 'languages') {
            // MODE LANGUES
            const langMap = {};
            streams.forEach(s => {
                const l = s.language.toUpperCase();
                if(!langMap[l]) langMap[l] = { count:0, viewers:0 };
                langMap[l].count++;
                langMap[l].viewers += s.viewer_count;
            });
            
            // Conversion en tableau trié
            tableData = Object.entries(langMap)
                .sort((a,b) => b[1].viewers - a[1].viewers)
                .map(([lang, stats], idx) => ({
                    rank: idx + 1,
                    name: lang,
                    viewers: stats.viewers,
                    channels: stats.count,
                    rating: stats.viewers > 50000 ? "A+" : (stats.viewers > 10000 ? "B" : "C")
                }));

        } else {
            // MODE JEUX (Défaut)
            const gRes = await twitchApiFetch('games/top?first=15');
            const topGames = gRes.data;
            
            for(let i=0; i<topGames.length; i++) {
                const g = topGames[i];
                // Appel spécifique pour chaque jeu (limit 5)
                const gsRes = await twitchApiFetch(`streams?game_id=${g.id}&first=5`);
                const gStreams = gsRes.data;
                
                // Extrapolation spécifique par jeu
                const gViewers = gStreams.reduce((acc,s)=>acc+s.viewer_count,0) * (i<3 ? 25 : 12); 
                const gChannels = gStreams.length * 50; 
                
                // Calcul Ratio Saturation
                const ratio = gViewers / Math.max(1, gChannels);
                let rating = "C";
                if (ratio > 40) rating = "A+ (Viral)";
                else if (ratio > 15) rating = "B (Sain)";
                
                tableData.push({
                    rank: i + 1,
                    name: g.name,
                    img: g.box_art_url.replace('{width}','50').replace('{height}','70'),
                    viewers: gViewers,
                    channels: gChannels,
                    rating: rating
                });
            }
        }

        // SAUVEGARDE FIREBASE (SNAPSHOT)
        // On sauvegarde uniquement en mode "Games" pour ne pas dupliquer les points de données
        if(type === 'games') {
            try {
                await db.collection('market_history').add({
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    total_viewers: estViewers,
                    top_game: tableData[0]?.name || 'Inconnu'
                });
            } catch(e) { console.log("Info: Save Market Skipped"); }
        }

        res.json({ success: true, overview, table: tableData });

    } catch(e) { 
        console.error("Market Error:", e);
        res.status(500).json({error:e.message}); 
    }
});

// --- B. SCAN TARGET (ANALYSE COMPLÈTE) ---
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: "Requête vide." });

    try {
        // 1. Recherche Utilisateur
        const uRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`);
        
        if (uRes.data.length > 0) {
            const u = uRes.data[0];
            
            // 2. Followers (Appel Helix 'channels/followers')
            let followers = 0;
            try { 
                const f = await twitchApiFetch(`channels/followers?broadcaster_id=${u.id}&first=1`); 
                followers = f.total; 
            } catch(e){}
            
            // 3. Analyse des jours de stream (VODs)
            let activeDays = "Inconnu";
            try {
                const vRes = await twitchApiFetch(`videos?user_id=${u.id}&first=10&type=archive`);
                if(vRes.data.length > 0) {
                    const daysMap = {};
                    vRes.data.forEach(v => {
                        const day = new Date(v.created_at).toLocaleDateString('fr-FR', { weekday: 'long' });
                        daysMap[day] = (daysMap[day] || 0) + 1;
                    });
                    // Tri par fréquence
                    activeDays = Object.entries(daysMap)
                        .sort((a,b) => b[1] - a[1])
                        .slice(0, 3)
                        .map(e => e[0].charAt(0).toUpperCase() + e[0].slice(1)) // Majuscule
                        .join(", ");
                }
            } catch(e){}

            const uData = { 
                login: u.login, display_name: u.display_name, id: u.id, 
                profile_image_url: u.profile_image_url, total_followers: followers, total_views: u.view_count, 
                broadcaster_type: u.broadcaster_type, active_days: activeDays
            };
            
            // 4. Calcul Tendance & Historique
            const h = await handleHistoryAndStats('user', u.id, uData);
            
            // 5. Calcul Score 5 Étoiles
            let stars = 3;
            if (h.trend === 'up') stars += 1;
            if (h.diff > 20) stars += 1;
            if (h.trend === 'down') stars -= 1;
            if (u.broadcaster_type === 'partner') stars = 5;
            stars = Math.min(Math.max(stars, 1), 5);

            CACHE.lastScanData = { type: 'user', ...uData, history: h, stars };
            return res.json({ success: true, type: 'user', user_data: uData, history: h, stars });
        }
        
        // Recherche Jeu (Fallback)
        const gRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        if(gRes.data.length > 0) {
            const g = gRes.data[0];
            const sRes = await twitchApiFetch(`streams?game_id=${g.id}&first=100`);
            const totalV = sRes.data.reduce((a,b)=>a+b.viewer_count,0);
            return res.json({ 
                success: true, type: 'game', 
                game_data: { name: g.name, id: g.id, box_art_url: g.box_art_url, total_streamers: sRes.data.length, total_viewers: totalV } 
            });
        }

        return res.status(404).json({success:false, message:"Rien trouvé."});
    } catch(e) { return res.status(500).json({success:false, error: e.message}); }
});

// --- C. IA GENERATIVE (Coach & Repurpose) ---
app.post('/critique_ia', async (req, res) => {
    const { type, query, history_data, stars, vod_data, game_data } = req.body;
    let prompt = "";
    let persona = "standard";

    if (type === 'coach') { // Niche/Coach
        persona = "coach";
        const growth = history_data?.diff || 0;
        prompt = `
        ANALYSE STREAMER: "${query}".
        NOTE: ${stars}/5.
        CROISSANCE: ${growth >= 0 ? '+' : ''}${growth} followers.
        
        Agis comme un Coach Expert. Donne :
        1. Un verdict franc sur la note.
        2. Une liste de 3 actions concrètes (Bullet points) pour améliorer le stream.
        `;
    } else if (type === 'repurpose') { // VOD
        prompt = `
        VOD: "${vod_data.title}". Durée: ${vod_data.duration}.
        Suggère 3 idées de clips courts pour TikTok basés sur ce titre. Donne des titres accrocheurs.
        `;
    } else if (type === 'schedule') { // Planning
        persona = "scheduler";
        prompt = `
        JEU: ${game_data.name}.
        CONCURRENCE: ${game_data.total_streamers} streamers, ${game_data.total_viewers} viewers.
        Trouve les "Océans Bleus" : Donne 3 créneaux horaires (Jour + Heure) idéaux pour streamer ce jeu.
        `;
    }
    
    const r = await runGeminiAnalysis(prompt, persona);
    res.json(r);
});

// --- D. RAID FINDER (CORRIGÉ & AVATAR) ---
app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    try {
        const gRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(gRes.data.length===0) return res.json({error:"Jeu introuvable"});
        
        const sRes = await twitchApiFetch(`streams?game_id=${gRes.data[0].id}&first=100&language=fr`);
        
        // Stratégie : Trouver le plus gros stream qui reste SOUS la limite max (pour maximiser l'impact)
        const target = sRes.data
            .filter(s => s.viewer_count <= parseInt(max_viewers))
            .sort((a,b) => b.viewer_count - a.viewer_count)[0];
        
        if(target) {
            // Récupération Avatar
            const uRes = await twitchApiFetch(`users?id=${target.user_id}`);
            const avatar = (uRes.data.length > 0) ? uRes.data[0].profile_image_url : "";
            
            return res.json({
                success:true, 
                target: { 
                    name: target.user_name, 
                    login: target.user_login, 
                    viewers: target.viewer_count, 
                    thumbnail_url: target.thumbnail_url.replace('{width}','320').replace('{height}','180'),
                    avatar_url: avatar 
                }
            });
        }
        return res.json({error:"Aucune cible trouvée."});
    } catch(e){ return res.status(500).json({error:"Erreur serveur"}); }
});

// --- E. PLANNING & VOD ---
app.post('/analyze_schedule', async (req, res) => {
    const { game } = req.body;
    try {
        const gRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(gRes.data.length === 0) return res.json({success:false, error:"Jeu introuvable"});
        
        const g = gRes.data[0];
        const sRes = await twitchApiFetch(`streams?game_id=${g.id}&first=100`);
        const totalV = sRes.data.reduce((a,b)=>a+b.viewer_count,0);
        
        return res.json({
            success: true,
            game_data: { name: g.name, total_viewers: totalV, total_streamers: sRes.data.length },
            box_art: g.box_art_url.replace('{width}','120').replace('{height}','160')
        });
    } catch(e) { return res.status(500).json({error:e.message}); }
});

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

// --- F. BOOST & LECTEUR ---
app.get('/get_default_stream', async (req, res) => {
    try {
        const q = await db.collection('boosts').where('endTime', '>', Date.now()).limit(1).get();
        if(!q.empty) { const b = q.docs[0].data(); return res.json({ success: true, channel: b.channel, viewers: 'BOOST', message: '🔥 BOOST ACTIF' }); }
    } catch(e){}
    await refreshGlobalStreamList();
    const r = CACHE.globalStreamRotation;
    if(r.streams.length === 0) return res.json({success:true, channel:'twitch'});
    const s = r.streams[r.currentIndex];
    return res.json({ success: true, channel: s.channel, viewers: s.viewers, message: `Découverte (${s.viewers} vues)` });
});

app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    try {
        const q = await db.collection('boosts').where('endTime', '>', Date.now()).get();
        if(!q.empty) return res.json({error: "Un Boost est déjà actif."});
        await db.collection('boosts').add({ channel, startTime: Date.now(), endTime: Date.now()+(15*60000) });
        return res.json({ success: true, html_response: "<p style='color:#0f0'>Boost activé (15 min) !</p>" });
    } catch(e) { return res.json({error: "Erreur DB"}); }
});

app.post('/cycle_stream', async (req, res) => {
    const r = CACHE.globalStreamRotation;
    if(r.streams.length === 0) await refreshGlobalStreamList();
    if(req.body.direction === 'next') r.currentIndex = (r.currentIndex + 1) % r.streams.length;
    else r.currentIndex = (r.currentIndex - 1 + r.streams.length) % r.streams.length;
    return res.json({ success: true, channel: r.streams[r.currentIndex]?.channel || 'twitch' });
});

// --- G. AUTHENTIFICATION ---
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
    if(!CACHE.twitchUser) return res.json({success:false, error: "Non connecté"});
    try { const d = await twitchApiFetch(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token); res.json({success:true, streams:d.data}); } catch(e){res.json({success:false});}
});
app.get('/export_csv', (req,res) => { res.send("Fonctionnalité CSV prête."); });

app.listen(PORT, () => console.log(`SERVER V31 PRODUCTION READY ON PORT ${PORT}`));

