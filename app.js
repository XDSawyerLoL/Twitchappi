/**
 * ====================================================================================
 * STREAMER & NICHE AI HUB - BACKEND (V22 - WALL STREET EDITION / FULL EXTENDED)
 * ====================================================================================
 * * FONCTIONNALITÉS :
 * 1. Auth Twitch (OAuth2) & Firebase (Firestore).
 * 2. Data Warehouse : Historisation des stats pour calcul de tendances (Bourse).
 * 3. Deep Dive Rotation : Algorithme de pagination pour trouver les < 100 vues.
 * 4. IA Coach : Analyse Gemini orientée motivation et stratégie.
 * 5. Système de Raid Avancé : Récupération Avatar + Miniature.
 * 6. Système de Boost : Gestion de file d'attente prioritaire.
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
// 1. CONFIGURATION INITIALE & FIREBASE
// ====================================================================================

let serviceAccount;

// Tentative de chargement de la clé Firebase (Compatible Render & Local)
if (process.env.FIREBASE_SERVICE_KEY) {
    try {
        let rawJson = process.env.FIREBASE_SERVICE_KEY;
        // Nettoyage des guillemets parasites souvent ajoutés par les hébergeurs
        if (rawJson.startsWith("'") && rawJson.endsWith("'")) rawJson = rawJson.slice(1, -1);
        if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.slice(1, -1);
        // Correction des sauts de ligne échappés
        rawJson = rawJson.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n');
        
        serviceAccount = JSON.parse(rawJson);
        console.log("✅ [FIREBASE] Clé chargée depuis les variables d'environnement.");
    } catch (error) {
        console.error("❌ [FIREBASE] Erreur critique de parsing JSON :", error.message);
    }
} else {
    try {
        serviceAccount = require('./serviceAccountKey.json');
        console.log("✅ [FIREBASE] Clé chargée depuis le fichier local.");
    } catch (e) {
        console.warn("⚠️ [FIREBASE] Aucune clé trouvée. La base de données ne fonctionnera pas.");
    }
}

// Initialisation Admin SDK
if (serviceAccount) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id 
        });
    } catch (e) { console.error("❌ Erreur Init Admin:", e.message); }
} else {
    try { admin.initializeApp(); } catch(e){}
}

const db = admin.firestore();

// Forcer les paramètres Firestore pour éviter les bugs sur Render
if (serviceAccount) {
    try { 
        db.settings({ projectId: serviceAccount.project_id, ignoreUndefinedProperties: true }); 
    } catch(e) {}
}

const app = express();
const PORT = process.env.PORT || 10000;

// ====================================================================================
// 2. VARIABLES D'ENVIRONNEMENT & MIDDLEWARES
// ====================================================================================

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

// État Global de l'application (Cache RAM)
const CACHE = {
    twitchTokens: {},       
    twitchUser: null,       
    boostedStream: null,    
    lastScanData: null,     
    
    // Configuration de la rotation automatique
    globalStreamRotation: {
        streams: [],        
        currentIndex: 0,    
        lastFetchTime: 0,   
        fetchCooldown: 10 * 60 * 1000 // 10 Minutes
    }
};

// ====================================================================================
// 3. FONCTIONS UTILITAIRES (HELPERS)
// ====================================================================================

/**
 * Récupère un token d'application Twitch (Client Credentials)
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
        }
        return null;
    } catch (error) { return null; }
}

/**
 * Wrapper pour les appels API Twitch avec gestion d'erreur 401
 */
async function twitchApiFetch(endpoint, token) {
    const accessToken = token || await getTwitchToken('app');
    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${accessToken}` }
    });
    
    if (res.status === 401) { 
        CACHE.twitchTokens['app'] = null; 
        throw new Error(`Token expiré.`); 
    }
    if (!res.ok) throw new Error(`Erreur API Twitch: ${res.statusText}`);
    return res.json();
}

/**
 * Analyse IA Gemini (Mode Coach)
 */
async function runGeminiAnalysis(prompt) {
    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { 
                systemInstruction: "Tu es un Coach Twitch Expert et Bienveillant. Tu analyses les chiffres comme un expert financier mais tu parles comme un coach sportif. Tu donnes des conseils clairs, structurés et motivants. Réponds UNIQUEMENT en HTML simple (<ul>, <li>, <strong>, <p>)." 
            }
        });
        return { success: true, html_response: response.text.trim() };
    } catch (e) { 
        return { success: false, html_response: `<p>Le coach IA est momentanément indisponible.</p>` }; 
    }
}

/**
 * Gestion de l'historique (Logique Boursière)
 * Calcule la différence (Delta) entre le scan actuel et le précédent scan.
 */
async function handleHistoryAndStats(type, id, newData) {
    const docRef = db.collection('history_stats').doc(String(id));
    let doc; 
    try { doc = await docRef.get(); } catch(e) { return { trend: 'stable', diff: 0 }; }

    let analysis = { trend: 'stable', diff: 0, previous: 0 };
    
    if (doc.exists) {
        const old = doc.data();
        if (type === 'user') {
            const currentFollowers = newData.total_followers || 0;
            const oldFollowers = old.total_followers || 0;
            const diff = currentFollowers - oldFollowers;
            
            analysis.diff = diff;
            analysis.previous = oldFollowers;
            
            if (diff > 0) analysis.trend = 'up';
            else if (diff < 0) analysis.trend = 'down';
            else analysis.trend = 'stable';
        }
        // Mise à jour de la DB avec la date actuelle
        await docRef.update({ ...newData, last_updated: admin.firestore.FieldValue.serverTimestamp() });
    } else {
        // Premier scan de ce streamer
        analysis.trend = 'new';
        await docRef.set({ ...newData, first_seen: admin.firestore.FieldValue.serverTimestamp() });
    }
    return analysis;
}

// ====================================================================================
// 4. MOTEUR DE ROTATION "DEEP DIVE" (ANTI-8K VIEWERS)
// ====================================================================================

async function refreshGlobalStreamList() {
    const now = Date.now();
    const rot = CACHE.globalStreamRotation;
    
    // Cooldown pour éviter le spam API
    if (now - rot.lastFetchTime < rot.fetchCooldown && rot.streams.length > 0) return;
    
    console.log("🔄 Lancement du Deep Dive Scan...");
    
    let allFoundStreams = [];
    let cursor = ""; 
    
    try {
        // Boucle de pagination : On va chercher jusqu'à 5 pages de résultats (500 streamers)
        for (let i = 0; i < 5; i++) {
            let url = `streams?language=fr&first=100`;
            if (cursor) url += `&after=${cursor}`;
            
            const res = await twitchApiFetch(url);
            
            if (!res.data || res.data.length === 0) break;

            // FILTRE CRITIQUE : Uniquement les streamers entre 0 et 100 vues
            const smallOnes = res.data.filter(s => s.viewer_count > 0 && s.viewer_count <= 100);
            
            allFoundStreams = allFoundStreams.concat(smallOnes);
            
            // Si on a trouvé assez de candidats (50), on s'arrête
            if (allFoundStreams.length >= 50) break;
            
            cursor = res.pagination.cursor;
            if (!cursor) break;
        }

        if (allFoundStreams.length > 0) {
            // Mélange aléatoire pour l'équité
            allFoundStreams.sort(() => Math.random() - 0.5);
            
            rot.streams = allFoundStreams.map(s => ({ channel: s.user_login, viewers: s.viewer_count }));
            rot.currentIndex = 0;
            rot.lastFetchTime = now;
            console.log(`✅ Deep Dive Terminé : ${allFoundStreams.length} streamers trouvés.`);
        } else {
            console.log("⚠️ Aucun petit streamer trouvé. Utilisation fallback.");
            rot.streams = [{channel: 'twitch', viewers: 0}]; 
        }

    } catch (e) { console.error("Erreur Deep Dive:", e); }
}

// ====================================================================================
// 5. ROUTES API PRINCIPALES
// ====================================================================================

// --- SCAN TARGET (Le cœur de l'appli) ---
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    try {
        // 1. Recherche Utilisateur
        const uRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`);
        
        if (uRes.data.length > 0) {
            const u = uRes.data[0];
            
            // Récupération des followers (appel séparé nécessaire)
            let followers = 0;
            try { 
                const f = await twitchApiFetch(`users/follows?followed_id=${u.id}&first=1`); 
                followers = f.total; 
            } catch(e){}
            
            const uData = { 
                login: u.login, 
                display_name: u.display_name, 
                id: u.id, 
                profile_image_url: u.profile_image_url, 
                total_followers: followers, 
                total_views: u.view_count,
                broadcaster_type: u.broadcaster_type
            };
            
            // 2. Calcul Historique & Tendance
            const h = await handleHistoryAndStats('user', u.id, uData);
            
            // 3. Calcul de la Note sur 5 Étoiles (Algorithme "Wall Street")
            let stars = 3; // Base moyenne
            
            // Bonus Croissance
            if (h.trend === 'up') stars += 1;
            if (h.diff > 50) stars += 1; // Forte croissance
            
            // Malus Décroissance
            if (h.trend === 'down') stars -= 1;
            
            // Bonus Partenaire / Activité
            if (u.broadcaster_type === 'partner') stars = 5; // Les partenaires sont top tier
            else if (u.broadcaster_type === 'affiliate' && stars < 4) stars += 0.5;

            // Bornage strict entre 1 et 5
            stars = Math.min(Math.max(stars, 1), 5);

            CACHE.lastScanData = { type: 'user', ...uData, history: h, stars };
            return res.json({ success: true, type: 'user', user_data: uData, history: h, stars });
        }
        
        // 1b. Recherche Jeu (si User non trouvé)
        const gRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        if(gRes.data.length > 0) {
            const g = gRes.data[0];
            const sRes = await twitchApiFetch(`streams?game_id=${g.id}&first=100`);
            const totalV = sRes.data.reduce((a,b)=>a+b.viewer_count,0);
            
            const gData = { 
                name: g.name, 
                id: g.id, 
                box_art_url: g.box_art_url, 
                total_streamers: sRes.data.length, 
                total_viewers: totalV 
            };
            CACHE.lastScanData = { type: 'game', ...gData };
            return res.json({ success: true, type: 'game', game_data: gData });
        }

        return res.status(404).json({success:false, message:"Aucun résultat trouvé"});
        
    } catch(e) { 
        console.error(e);
        return res.status(500).json({success:false, error: e.message}); 
    }
});

// --- IA COACH (Prompt Motivation) ---
app.post('/critique_ia', async (req, res) => {
    const { type, query, history_data, stars } = req.body;
    
    let prompt = "";
    if (type === 'niche') {
        const growth = history_data?.diff || 0;
        const trendSymbol = history_data?.trend === 'up' ? '🟢' : (history_data?.trend === 'down' ? '🔴' : '⚪');
        
        prompt = `
        CONTEXTE: Tu es le Coach Personnel du streamer "${query}".
        DONNÉES:
        - Note Performance: ${stars}/5 étoiles.
        - Tendance Actuelle: ${trendSymbol} (${growth > 0 ? '+' : ''}${growth} followers depuis le dernier scan).
        
        OBJECTIF:
        Agis comme un analyste financier de Wall Street mais avec la bienveillance d'un coach sportif.
        1. Commente la note de 1 à 5 étoiles (sois honnête mais constructif).
        2. Analyse la tendance (Si c'est vert, dis bravo. Si c'est rouge, dis "On ne lâche rien").
        3. Donne 3 actions concrètes (Bullet points) pour faire exploser le "cours de l'action" (la chaîne).
        4. Termine par une phrase choc de motivation.
        
        FORMAT: Réponds uniquement en HTML (<ul>, <li>, <strong>, <p>, <h4>). Pas de texte brut.
        `;
    }
    
    const r = await runGeminiAnalysis(prompt);
    res.json(r);
});

// --- RAID FINDER (Correctif Avatar) ---
app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    try {
        // 1. Trouver le jeu
        const gRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(gRes.data.length === 0) return res.json({error:"Jeu introuvable"});
        
        // 2. Trouver les streams
        const sRes = await twitchApiFetch(`streams?game_id=${gRes.data[0].id}&first=100&language=fr`);
        
        // 3. Filtrer et Trier
        const target = sRes.data
            .filter(s => s.viewer_count <= parseInt(max_viewers))
            .sort((a,b) => b.viewer_count - a.viewer_count)[0];
        
        if(target) {
            // 4. RÉCUPÉRER L'AVATAR (Appel supplémentaire indispensable)
            const uRes = await twitchApiFetch(`users?id=${target.user_id}`);
            const avatar = (uRes.data.length > 0) ? uRes.data[0].profile_image_url : "";
            
            return res.json({
                success:true, 
                target: { 
                    name: target.user_name, 
                    login: target.user_login, 
                    viewers: target.viewer_count, 
                    thumbnail_url: target.thumbnail_url.replace('{width}','320').replace('{height}','180'),
                    avatar_url: avatar // La clé du correctif
                }
            });
        }
        return res.json({error:"Aucune cible correspondante trouvée."});
    } catch(e){ return res.status(500).json({error:"Erreur Serveur"}); }
});

// --- SYSTÈME DE BOOST & LECTEUR ---
app.get('/get_default_stream', async (req, res) => {
    // 1. Priorité Boost
    try {
        const q = await db.collection('boosts').where('endTime', '>', Date.now()).limit(1).get();
        if(!q.empty) {
            const b = q.docs[0].data();
            return res.json({ success: true, channel: b.channel, viewers: 'BOOST', message: '🔥 BOOST ACTIF' });
        }
    } catch(e){}

    // 2. Rotation Standard
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
        if(!q.empty) return res.json({error: "Un Boost est déjà en cours d'exécution."});
        
        await db.collection('boosts').add({ channel, startTime: Date.now(), endTime: Date.now()+(15*60000) });
        return res.json({ success: true, html_response: "<p style='color:#0f0'>Boost activé avec succès !</p>" });
    } catch(e) { return res.json({error: "Erreur Base de Données"}); }
});

app.post('/cycle_stream', async (req, res) => {
    const r = CACHE.globalStreamRotation;
    // Si la liste est vide, on force un refresh
    if(r.streams.length === 0) await refreshGlobalStreamList();
    
    if(r.streams.length > 0) {
        if(req.body.direction === 'next') r.currentIndex = (r.currentIndex + 1) % r.streams.length;
        else r.currentIndex = (r.currentIndex - 1 + r.streams.length) % r.streams.length;
        return res.json({ success: true, channel: r.streams[r.currentIndex].channel });
    }
    return res.json({ success: true, channel: 'twitch' });
});

// --- AUTHENTIFICATION ---
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

// --- FONCTIONS SECONDAIRES ---
app.get('/followed_streams', async(req,res)=>{
    if(!CACHE.twitchUser) return res.json({success:false});
    try { const d = await twitchApiFetch(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token); res.json({success:true, streams:d.data}); } catch(e){res.json({success:false});}
});
app.get('/export_csv', (req,res) => { res.send("CSV Export Not Implemented"); }); // Placeholder
app.post('/analyze_schedule', async(req,res) => { res.json({success:false}); }); // Placeholder

app.listen(PORT, () => console.log(`SERVER WALL STREET V22 STARTED ON PORT ${PORT}`));
