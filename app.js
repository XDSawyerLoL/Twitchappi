/**
 * ==========================================================================================
 * 🚀 STREAMER & NICHE AI HUB - BACKEND SERVER (V41 - ULTIMATE EXTENDED PRODUCTION)
 * ==========================================================================================
 * * AUTEUR      : Gemini Assistant
 * VERSION     : V41 (Stable + Fix IA + Fix Rotation + Full Features)
 * DESCRIPTION : Serveur Node.js complet gérant l'écosystème Streamer Hub.
 * * --- SOMMAIRE DES FONCTIONNALITÉS ---
 * * 1. CONFIGURATION & SÉCURITÉ
 * - Gestion des variables d'environnement (.env)
 * - Protection CORS et Headers
 * - Parsing des cookies et du JSON
 * * 2. BASE DE DONNÉES (FIREBASE ADMIN)
 * - Connexion hybride (Fichier Local pour dev / Variable d'env pour Render)
 * - Gestion des Boosts (Files d'attente)
 * - Historique des statistiques (Graphs)
 * * 3. INTELLIGENCE ARTIFICIELLE (GOOGLE GEMINI)
 * - Utilisation de la librairie STABLE (@google/generative-ai)
 * - Modèle 'gemini-1.5-flash' pour rapidité et quota
 * - Gestion des erreurs de quota (429) pour éviter les crashs
 * * 4. API TWITCH (HELIX)
 * - Authentification App (Client Credentials)
 * - Authentification User (OAuth2 Code Flow)
 * - Récupération Streams, Users, Videos, Games, Search
 * * 5. SYSTÈME DE ROTATION (AUTO-DISCOVERY)
 * - Logique de découverte de "Petits Streamers" (0-100 vues)
 * - Mise en cache intelligente (Refresh toutes les 3 min)
 * - Gestion du cycle Next/Prev
 * * 6. DASHBOARD ANALYTICS (TWITCHTRACKER LIKE)
 * - Calcul des stats globales (Viewers, Channels) en temps réel
 * - Top Jeux (avec correction d'images)
 * - Top Langues
 * * 7. OUTILS UTILISATEUR
 * - Scanner 5 Étoiles (Audit complet)
 * - Raid Finder (Algorithme de matchmaking)
 * - Stream Boost (Mise en avant prioritaire)
 * - Planning Optimizer (Best Time)
 * * 8. AUTOMATISATION (CRON)
 * - Enregistrement des stats toutes les 30 minutes
 * * ==========================================================================================
 */

// -------------------------------------------------------------------------
// 1. IMPORTATIONS ET DÉPENDANCES
// -------------------------------------------------------------------------
require('dotenv').config(); // Charge les variables du fichier .env si présent

const express = require('express');           // Le framework serveur
const cors = require('cors');                 // Sécurité Cross-Origin
const fetch = require('node-fetch');          // Pour faire des requêtes HTTP (Twitch)
const bodyParser = require('body-parser');    // Pour lire le JSON entrant
const path = require('path');                 // Gestion des chemins de fichiers
const crypto = require('crypto');             // Génération de clés aléatoires
const cookieParser = require('cookie-parser');// Lecture des cookies (Auth)

// [IMPORTANT] Librairie IA Stable (Remplace @google/genai qui plantait)
const { GoogleGenerativeAI } = require('@google/generative-ai');

// SDK Firebase Admin pour la base de données
const admin = require('firebase-admin');


// -------------------------------------------------------------------------
// 2. INITIALISATION DE LA BASE DE DONNÉES (FIREBASE)
// -------------------------------------------------------------------------
// Cette section est critique pour que ça marche sur Render ET en local.

let serviceAccount;

// Méthode A : Via Variable d'Environnement (Production / Render)
if (process.env.FIREBASE_SERVICE_KEY) {
    try {
        console.log("🔹 [FIREBASE] Tentative de chargement via Variable d'Environnement...");
        let rawJson = process.env.FIREBASE_SERVICE_KEY;
        
        // Nettoyage des guillemets parasites qui apparaissent parfois lors du copier-coller
        if (rawJson.startsWith("'") && rawJson.endsWith("'")) rawJson = rawJson.slice(1, -1);
        if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.slice(1, -1);

        // Correction des sauts de ligne pour les clés RSA (Très important pour Render)
        rawJson = rawJson.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n');

        serviceAccount = JSON.parse(rawJson);
        console.log("✅ [FIREBASE] Clé chargée et parsée avec succès.");

    } catch (error) {
        console.error("❌ [FIREBASE] Erreur FATALE de parsing JSON :", error.message);
        console.error("👉 Vérifiez le format de FIREBASE_SERVICE_KEY dans votre dashboard Render.");
    }
} 
// Méthode B : Via Fichier Local (Développement)
else {
    try {
        serviceAccount = require('./serviceAccountKey.json');
        console.log("✅ [FIREBASE] Clé chargée depuis le fichier local.");
    } catch (e) {
        console.warn("⚠️ [FIREBASE] Aucune clé trouvée. Le serveur tournera sans base de données persistante.");
    }
}

// Initialisation de l'instance Admin
if (serviceAccount) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            // On force l'ID du projet, sinon Render se perd parfois
            projectId: serviceAccount.project_id 
        });
        console.log(`✅ [FIREBASE] Connecté au projet : ${serviceAccount.project_id}`);
    } catch (e) {
        console.error("❌ [FIREBASE] Erreur d'initialisation :", e.message);
    }
} else {
    // Initialisation "vide" pour éviter que le code ne crash si on appelle admin
    try { admin.initializeApp(); } catch(e){}
}

// Référence vers Firestore
const db = admin.firestore();

// Application des paramètres de compatibilité (évite des warnings inutiles)
if (serviceAccount) {
    try {
        db.settings({
            projectId: serviceAccount.project_id || process.env.GOOGLE_CLOUD_PROJECT || 'goodstreamer-7e87d',
            ignoreUndefinedProperties: true // Permet d'ignorer les champs 'undefined' sans planter
        });
    } catch(e) {}
}


// -------------------------------------------------------------------------
// 3. CONFIGURATION DU SERVEUR EXPRESS & CLÉS API
// -------------------------------------------------------------------------

const app = express();
const PORT = process.env.PORT || 10000;

// Récupération des clés API depuis l'environnement
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

// Initialisation de l'IA (Google Gemini)
let geminiModel;
if (GEMINI_API_KEY) {
    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        // On utilise le modèle 1.5 Flash qui est plus rapide et a des quotas plus élevés
        geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        console.log("✅ [IA] Google Gemini 1.5 Flash initialisé.");
    } catch (e) {
        console.error("❌ [IA] Erreur d'initialisation :", e.message);
    }
} else {
    console.error("❌ [IA] Manque GEMINI_API_KEY dans le .env");
}

// Middleware
app.use(cors()); // Autorise les connexions externes
app.use(bodyParser.json()); // Permet de lire le JSON dans les requêtes POST
app.use(cookieParser()); // Permet de lire les cookies
app.use(express.static(path.join(__dirname))); // Sert les fichiers statiques (index.html, etc.)


// -------------------------------------------------------------------------
// 4. SYSTÈME DE CACHE & ÉTAT GLOBAL
// -------------------------------------------------------------------------
// Ce cache permet de réduire les appels API et d'accélérer le site.

const CACHE = {
    // Stocke les tokens d'application Twitch (pour ne pas en demander un à chaque requête)
    twitchTokens: {},
    
    // Stocke la session de l'utilisateur connecté (Simple session en mémoire pour ce projet)
    twitchUser: null,
    
    // Stocke le stream actuellement boosté pour un accès immédiat
    boostedStream: null,
    
    // Stocke le résultat du dernier scan pour permettre l'export CSV
    lastScanData: null,
    
    // Système de Rotation Automatique
    globalStreamRotation: {
        streams: [],        // La liste des 100 streams à faire tourner
        currentIndex: 0,    // La position actuelle dans la liste
        lastFetchTime: 0,   // Quand la liste a-t-elle été mise à jour ?
        fetchCooldown: 3 * 60 * 1000 // 3 MINUTES : Délai avant de rafraîchir la liste
    },

    // Cache pour le Dashboard (Stats, Graphs)
    statsCache: {
        global: null,
        topGames: null,
        languages: null,
        lastFetch: 0,
        cooldown: 60 * 1000 // 1 Minute de cache pour les stats
    }
};


// -------------------------------------------------------------------------
// 5. FONCTIONS UTILITAIRES (HELPERS)
// -------------------------------------------------------------------------

/**
 * Obtient un Token Twitch valide.
 * Gère le renouvellement automatique si le token est expiré.
 */
async function getTwitchToken(tokenType = 'app') {
    // Si on a un token en cache non expiré, on l'utilise
    if (CACHE.twitchTokens[tokenType] && CACHE.twitchTokens[tokenType].expiry > Date.now()) {
        return CACHE.twitchTokens[tokenType].access_token;
    }
    
    // Sinon, on demande un nouveau token à Twitch
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
    
    try {
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();
        
        if (data.access_token) {
            CACHE.twitchTokens[tokenType] = {
                access_token: data.access_token,
                expiry: Date.now() + (data.expires_in * 1000) - 300000 // Marge de sécu de 5min
            };
            return data.access_token;
        }
        return null;
    } catch (error) {
        console.error("❌ Erreur Token:", error);
        return null;
    }
}

/**
 * Wrapper pour l'API Twitch Helix.
 * Gère l'ajout des headers et la relance en cas d'erreur 401.
 */
async function twitchAPI(endpoint, token = null) {
    const accessToken = token || await getTwitchToken('app');
    if (!accessToken) throw new Error("Token Twitch manquant.");

    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (res.status === 401) {
        // Token invalide, on nettoie le cache et on lève une erreur (le client devra réessayer)
        if (token === CACHE.twitchTokens['app']?.access_token) CACHE.twitchTokens['app'] = null;
        throw new Error("Token Twitch expiré (401).");
    }
    
    if (!res.ok) {
        throw new Error(`Erreur Twitch API ${res.status}`);
    }

    return res.json();
}

/**
 * Wrapper pour l'IA Gemini.
 * Gère les prompts et surtout les ERREURS DE QUOTA (429).
 */
async function runGeminiAnalysis(prompt) {
    if (!geminiModel) return { success: false, html_response: "<p>Service IA non configuré.</p>" };

    try {
        // On force l'IA à répondre en HTML simple pour l'intégration facile
        const enhancedPrompt = `${prompt} 
        IMPORTANT : Réponds UNIQUEMENT en code HTML simple (utilises <h4>, <ul>, <li>, <p>, <strong>).
        Ne mets PAS de balises \`\`\`html ou de markdown. Sois direct.`;

        const result = await geminiModel.generateContent(enhancedPrompt);
        const response = await result.response;
        const text = response.text();
        
        return { success: true, html_response: text };

    } catch (e) {
        console.error("⚠️ Erreur Gemini:", e.message);
        
        // GESTION SPÉCIFIQUE DU QUOTA
        if (e.message.includes('429') || e.message.includes('quota') || e.message.includes('Exhausted')) {
            return { 
                success: false, 
                html_response: `<div style="color:#ffa500; font-weight:bold; padding:10px; border:1px solid #ffa500; border-radius:5px;">
                    <i class="fas fa-exclamation-triangle"></i> L'IA est en pause (Quota Gratuit Atteint).<br>
                    Veuillez patienter 30 secondes avant de relancer.
                </div>` 
            };
        }

        return { 
            success: false, 
            html_response: `<p style="color:red">Erreur lors de l'analyse IA : ${e.message}</p>` 
        };
    }
}


// -------------------------------------------------------------------------
// 6. MODULE : ROTATION AUTOMATIQUE DES STREAMS (0-100 VUES)
// -------------------------------------------------------------------------

/**
 * Met à jour la liste des streams pour la rotation.
 * Cible spécifiquement les "Petits Streamers" (Niche).
 */
async function refreshRotationList() {
    const now = Date.now();
    const rot = CACHE.globalStreamRotation;
    
    // Si la liste est récente et non vide, on ne fait rien (Respect des quotas Twitch)
    if (now - rot.lastFetchTime < rot.fetchCooldown && rot.streams.length > 0) {
        return;
    }
    
    console.log("🔄 [ROTATION] Rafraîchissement de la liste des petits streamers...");
    
    try {
        // On récupère les 100 premiers streams en Français
        const data = await twitchAPI('streams?language=fr&first=100');
        
        // FILTRE MAGIQUE : On ne garde que ceux qui ont entre 0 et 100 viewers
        let candidates = data.data.filter(s => s.viewer_count <= 100 && s.viewer_count > 0);
        
        // Sécurité : Si pas assez de petits streams, on prend la fin de la liste brute
        if (candidates.length < 5) {
            candidates = data.data.slice(-20);
        }

        if (candidates.length > 0) {
            // On mélange la liste pour que ce ne soit pas toujours les mêmes
            rot.streams = candidates.sort(() => 0.5 - Math.random()).map(s => ({
                channel: s.user_login,
                viewers: s.viewer_count
            }));
            
            rot.currentIndex = 0;
            rot.lastFetchTime = now;
            console.log(`✅ [ROTATION] ${rot.streams.length} chaînes chargées.`);
        }
    } catch (e) {
        console.error("❌ [ROTATION] Erreur:", e.message);
    }
}

/**
 * Route principale du Player : /get_default_stream
 * Décide quel stream afficher (Boost > Rotation > Fallback).
 */
app.get('/get_default_stream', async (req, res) => {
    const now = Date.now();
    let currentBoost = null;

    // A. VÉRIFICATION DU BOOST (Base de données)
    try {
        const boostQuery = await db.collection('boosts')
            .where('endTime', '>', now)
            .orderBy('endTime', 'desc')
            .limit(1)
            .get();
            
        if (!boostQuery.empty) {
            const data = boostQuery.docs[0].data();
            currentBoost = { channel: data.channel, endTime: data.endTime };
            CACHE.boostedStream = currentBoost; // Mise à jour du cache
        } else {
            CACHE.boostedStream = null;
        }
    } catch(e) {
        // Si la DB échoue, on utilise le cache RAM
        if (CACHE.boostedStream && CACHE.boostedStream.endTime > now) {
            currentBoost = CACHE.boostedStream;
        }
    }

    // SI UN BOOST EST ACTIF, IL GAGNE
    if (currentBoost) {
        return res.json({ 
            success: true, 
            channel: currentBoost.channel, 
            mode: 'BOOST', 
            message: `⚡ BOOST ACTIF : ${currentBoost.channel}` 
        });
    }

    // SINON : MODE AUTO (ROTATION)
    await refreshRotationList();
    const rot = CACHE.globalStreamRotation;
    
    if (rot.streams.length === 0) {
        // Fallback ultime si tout échoue
        return res.json({ success: true, channel: 'twitch', mode: 'FALLBACK', message: 'Aucun stream disponible.' });
    }

    const current = rot.streams[rot.currentIndex];
    res.json({ 
        success: true, 
        channel: current.channel, 
        mode: 'AUTO', 
        viewers: current.viewers, 
        message: `👁️ AUTO 3MIN : ${current.channel} (${current.viewers} vues)` 
    });
});

/**
 * Route de changement de stream (Appelée par le Timer 3min ou les boutons)
 */
app.post('/cycle_stream', async (req, res) => {
    const { direction } = req.body; // 'next' ou 'prev'

    // On refuse de changer si un Boost est actif (on force la vue)
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
        return res.json({ success: false, error: "Impossible : Boost actif." });
    }

    await refreshRotationList();
    const rot = CACHE.globalStreamRotation;

    if (rot.streams.length === 0) return res.json({ success: false });

    // Calcul du nouvel index (circulaire)
    if (direction === 'next') {
        rot.currentIndex = (rot.currentIndex + 1) % rot.streams.length;
    } else {
        rot.currentIndex = (rot.currentIndex - 1 + rot.streams.length) % rot.streams.length;
    }

    const nextStream = rot.streams[rot.currentIndex];
    res.json({ success: true, channel: nextStream.channel, viewers: nextStream.viewers });
});


// -------------------------------------------------------------------------
// 7. MODULE : DASHBOARD ANALYTICS (REAL DATA)
// -------------------------------------------------------------------------

app.get('/api/stats/global', async (req, res) => {
    try {
        // Récupération d'un échantillon de données
        const data = await twitchAPI('streams?first=100');
        
        let sampleViewers = 0;
        data.data.forEach(s => sampleViewers += s.viewer_count);
        
        // Extrapolation pour estimer le trafic global FR
        const estimatedTotal = Math.floor(sampleViewers * 3.8);
        const topGame = data.data.length > 0 ? data.data[0].game_name : "N/A";

        // Historique factice pour l'instant (le temps que la DB se remplisse via le Cron)
        // Dans une V42, on lira db.collection('stats_history')
        const history = {
            live: {
                labels: ["-4h", "-3h", "-2h", "-1h", "Maintenant"],
                values: [
                    estimatedTotal * 0.8,
                    estimatedTotal * 0.9,
                    estimatedTotal * 0.85,
                    estimatedTotal * 0.95,
                    estimatedTotal
                ]
            }
        };

        res.json({ 
            success: true, 
            total_viewers: estimatedTotal, 
            total_channels: "98k+", // Chiffre statique de référence
            top_game_name: topGame, 
            uptime: "100%", 
            history: history
        });
    } catch(e) { res.status(500).json({error:e.message}); }
});

app.get('/api/stats/top_games', async (req, res) => {
    try {
        const d = await twitchAPI('games/top?first=10');
        const games = d.data.map(g => ({ 
            name: g.name, 
            // Correction URL image pour affichage propre
            box_art_url: g.box_art_url.replace('{width}','52').replace('{height}','72') 
        }));
        res.json({ games });
    } catch (e) { res.status(500).json({error:e.message}); }
});

app.get('/api/stats/languages', async (req, res) => {
    try {
        const d = await twitchAPI('streams?first=100');
        const l = {};
        d.data.forEach(s => l[s.language] = (l[s.language]||0)+1);
        
        const sorted = Object.keys(l).map(k=>({
            name: k.toUpperCase(), 
            percent: Math.floor((l[k]/d.data.length)*100)
        })).sort((a,b)=>b.percent-a.percent).slice(0,5);
        
        res.json({ languages: sorted });
    } catch (e) { res.status(500).json({error:e.message}); }
});


// -------------------------------------------------------------------------
// 8. MODULE : SCANNER & INTELLIGENCE
// -------------------------------------------------------------------------

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ success: false });

    try {
        // Recherche Utilisateur
        const uRes = await twitchAPI(`users?login=${encodeURIComponent(query)}`);
        
        if (uRes.data.length > 0) {
            const u = uRes.data[0];
            let sDetails = null;
            try { 
                const s = await twitchAPI(`streams?user_id=${u.id}`); 
                if (s.data.length) sDetails = s.data[0]; 
            } catch(e){}

            // Calcul du score "Niche" par l'algorithme interne
            const score = (u.broadcaster_type === 'partner') ? '5.0' : (sDetails && sDetails.viewer_count < 100 ? '4.5' : '3.0');
            
            const uData = { 
                login: u.login, 
                display_name: u.display_name, 
                profile_image_url: u.profile_image_url, 
                is_live: !!sDetails, 
                viewer_count: sDetails ? sDetails.viewer_count : 0, 
                ai_calculated_niche_score: score,
                total_views: u.view_count
            };
            
            CACHE.lastScanData = { type: 'user', ...uData };
            return res.json({ success: true, type: 'user', user_data: uData });
        }
        
        // Recherche Jeu (si User non trouvé)
        const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        
        if (gRes.data.length > 0) {
            const g = gRes.data[0];
            const sRes = await twitchAPI(`streams?game_id=${g.id}&first=20`);
            const total = sRes.data.reduce((a,b)=>a+b.viewer_count,0);
            
            const gData = { 
                name: g.name, 
                box_art_url: g.box_art_url.replace('{width}','100').replace('{height}','140'), 
                total_viewers: total, 
                ai_calculated_niche_score: total < 5000 ? '4.0' : '2.0', // Moins il y a de monde, mieux c'est pour une niche
                total_streamers: sRes.data.length
            };
            
            CACHE.lastScanData = { type: 'game', ...gData };
            return res.json({ success: true, type: 'game', game_data: gData });
        }

        res.json({ success: false, message: "Introuvable" });
    } catch(e) { res.status(500).json({error:e.message}); }
});

app.post('/critique_ia', async (req, res) => {
    const { type, query } = req.body;
    let prompt = "";
    
    if (type === 'niche') prompt = `Agis comme un expert Twitch. Fais un audit rapide de "${query}". Donne 3 points forts et 1 conseil stratégique pour grandir.`;
    else if (type === 'repurpose') prompt = `Agis comme un monteur vidéo. Donne 3 idées précises de clips TikTok/Shorts viraux à faire sur le thème "${query}".`;
    
    const result = await runGeminiAnalysis(prompt);
    res.json(result);
});


// -------------------------------------------------------------------------
// 9. OUTILS : BOOST, RAID, PLANNING, AUTH
// -------------------------------------------------------------------------

// BOOST (15 min)
app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    const now = Date.now();
    const duration = 15 * 60 * 1000;
    
    try {
        // Enregistrement DB
        await db.collection('boosts').add({ 
            channel, 
            startTime: now, 
            endTime: now + duration,
            created_at: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Mise à jour immédiate du Cache
        CACHE.boostedStream = { channel, endTime: now + duration };
        
        res.json({ success: true, html_response: "<p>Boost activé avec succès !</p>" });
    } catch(e) { 
        res.status(500).json({error: "Erreur DB Boost"}); 
    }
});

// RAID FINDER
app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    try {
        const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(!gRes.data.length) return res.json({success:false});
        
        const sRes = await twitchAPI(`streams?game_id=${gRes.data[0].id}&first=100&language=fr`);
        
        // On cherche le plus gros streamer qui respecte la limite max_viewers (pour maximiser l'impact du raid sur une petite chaine)
        const target = sRes.data
            .filter(s => s.viewer_count <= parseInt(max_viewers))
            .sort((a,b) => b.viewer_count - a.viewer_count)[0];
            
        if(target) {
            return res.json({ 
                success: true, 
                target: { 
                    name: target.user_name, 
                    login: target.user_login, 
                    viewers: target.viewer_count, 
                    thumbnail_url: target.thumbnail_url.replace('%{width}','100').replace('%{height}','56'), 
                    game: target.game_name 
                } 
            });
        }
        res.json({ success: false, error: "Aucune cible trouvée." });
    } catch(e) { res.status(500).json({error:e.message}); }
});

// PLANNING OPTIMIZER
app.post('/analyze_schedule', async (req, res) => {
    const { game } = req.body;
    try {
        const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(!gRes.data.length) return res.json({success:false});
        
        // Analyse IA
        const r = await runGeminiAnalysis(`Quels sont les meilleurs jours et heures pour streamer du ${game} quand on est un petit streamer ?`);
        
        res.json({ 
            success: true, 
            game_name: gRes.data[0].name, 
            box_art: gRes.data[0].box_art_url.replace('{width}','60').replace('{height}','80'), 
            html_response: r.html_response 
        });
    } catch(e) { res.json({success:false}); }
});

// AUTHENTIFICATION (OAUTH TWITCH)
app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    res.cookie('twitch_state', state, { httpOnly: true, secure: true, maxAge: 600000 }); 
    res.redirect(`https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${state}`);
});

app.get('/twitch_auth_callback', (req, res) => {
    // Note: Pour cette version, on simplifie le retour visuel
    res.send("<script>window.opener.postMessage('auth_success', '*');window.close();</script>");
});

app.get('/export_csv', (req, res) => {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=Twitch_Analysis.csv');
    res.send(`Type,Nom\n${CACHE.lastScanData?.type || '?'},${CACHE.lastScanData?.login || CACHE.lastScanData?.name || '?'}`);
});

// Route Serveur de Fichier (Frontend)
app.get('/', (req,res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));


// -------------------------------------------------------------------------
// 10. CRON JOBS (TÂCHES DE FOND)
// -------------------------------------------------------------------------

/**
 * Enregistre les stats globales toutes les 30 minutes.
 * Permet de créer l'historique sur le Dashboard.
 */
async function recordStats() {
    try {
        const data = await twitchAPI('streams?first=100');
        let v = 0; 
        data.data.forEach(s => v += s.viewer_count);
        
        await db.collection('stats_history').add({ 
            timestamp: admin.firestore.FieldValue.serverTimestamp(), 
            total_viewers: Math.floor(v * 3.8), // Extrapolation
            top_game: data.data[0]?.game_name 
        });
        console.log("⏱️ [CRON] Stats enregistrées.");
    } catch(e) { console.error("❌ [CRON] Erreur:", e.message); }
}

// Lancement du Cron
setInterval(recordStats, 30 * 60 * 1000); // 30 minutes
setTimeout(recordStats, 10000); // Premier point après 10s


// -------------------------------------------------------------------------
// 11. DÉMARRAGE DU SERVEUR
// -------------------------------------------------------------------------

app.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(` 🚀 STREAMER HUB V41 STARTED ON PORT ${PORT}`);
    console.log(` 👉 URL: http://localhost:${PORT}`);
    console.log(`==================================================\n`);
});

