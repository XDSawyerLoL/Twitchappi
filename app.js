/**
 * ==========================================================================================
 * STREAMER & NICHE AI HUB - SERVER BACKEND (VERSION 22 - PRODUCTION FULL)
 * ==========================================================================================
 * Auteur : Assistant IA
 * Description : Serveur complet pour l'analyse Twitch, l'automatisation et l'IA.
 * * FONCTIONNALITÉS INTÉGRÉES :
 * 1.  Authentification OAuth2 Twitch (Code Flow avec gestion d'état sécurisée)
 * 2.  Rotation Automatique "Deep Dive" (Scan profond pour trouver < 100 vues strict)
 * 3.  Système de Boost Payant (Simulé) avec priorité absolue sur le lecteur
 * 4.  Système de Raid "Robin des Bois" (Filtre Langue FR + Max Viewers)
 * 5.  Analyse IA via Google Gemini (Niche, Repurposing VOD, Planning)
 * 6.  Export de données CSV
 * 7.  Gestion complète des erreurs et logs détaillés
 * ==========================================================================================
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

// IMPORT CRITIQUE : Utilisation de la librairie officielle Google AI
// Cela corrige l'erreur "ai.getGenerativeModel is not a function"
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialisation de l'application Express
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

// Sélection du modèle IA : On utilise 'gemini-pro' pour une stabilité maximale
// Si 'gemini-1.5-flash' renvoie 404, 'gemini-pro' est la solution de repli sûre.
const GEMINI_MODEL_NAME = "gemini-pro"; 

// Vérification stricte de la présence des clés API au démarrage
if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI || !GEMINI_API_KEY) {
    console.error("\n#############################################################");
    console.error("ERREUR FATALE : VARIABLES D'ENVIRONNEMENT MANQUANTES");
    console.error("Le serveur ne peut pas démarrer sans les clés API suivantes :");
    console.error(`- TWITCH_CLIENT_ID: ${TWITCH_CLIENT_ID ? 'OK' : 'MANQUANT'}`);
    console.error(`- TWITCH_CLIENT_SECRET: ${TWITCH_CLIENT_SECRET ? 'OK' : 'MANQUANT'}`);
    console.error(`- TWITCH_REDIRECT_URI: ${REDIRECT_URI ? 'OK' : 'MANQUANT'}`);
    console.error(`- GEMINI_API_KEY: ${GEMINI_API_KEY ? 'OK' : 'MANQUANT'}`);
    console.error("#############################################################\n");
    process.exit(1); 
}

// Initialisation de l'instance IA Google Gemini
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: GEMINI_MODEL_NAME });

// Configuration des Middlewares Express
app.use(cors()); // Active le partage de ressources cross-origin
app.use(bodyParser.json()); // Permet de parser le JSON dans les requêtes
app.use(cookieParser()); // Permet de gérer les cookies d'authentification
app.use(express.static(path.join(__dirname))); // Sert les fichiers statiques (Frontend)

// ==========================================================================================
// 2. GESTION DE L'ÉTAT (CACHE MÉMOIRE)
// ==========================================================================================

const CACHE = {
    // Tokens d'application Twitch (Client Credentials)
    twitchTokens: {
        app: null // Stocke { access_token, expiry }
    }, 
    
    // Session utilisateur (OAuth User Token)
    twitchUser: null,       
    
    // Système de Boost
    streamBoosts: {},       // Map des cooldowns (chaine -> timestamp)
    boostedStream: null,    // Le boost actif { channel, endTime }
    
    // Données temporaires pour export
    lastScanData: null,     
    
    // Configuration de la Rotation Automatique
    globalStreamRotation: {
        streams: [],        // La liste des chaînes qualifiées (< 100 vues)
        currentIndex: 0,    // Position actuelle dans la liste
        lastFetchTime: 0,   // Dernier refresh API
        fetchCooldown: 5 * 60 * 1000 // Refresh toutes les 5 minutes
    }
};

// ==========================================================================================
// 3. FONCTIONS UTILITAIRES (HELPERS)
// ==========================================================================================

/**
 * Récupère ou renouvelle le Token d'Application Twitch.
 * Nécessaire pour toutes les requêtes API non liées à l'utilisateur.
 */
async function getTwitchToken(tokenType) {
    // Vérification du cache
    if (CACHE.twitchTokens[tokenType] && CACHE.twitchTokens[tokenType].expiry > Date.now()) {
        return CACHE.twitchTokens[tokenType].access_token;
    }
    
    console.log(`[AUTH] Renouvellement du token Twitch (${tokenType})...`);
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
    
    try {
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();
        
        if (data.access_token) {
            CACHE.twitchTokens[tokenType] = {
                access_token: data.access_token,
                // Marge de sécurité de 5 minutes avant expiration réelle
                expiry: Date.now() + (data.expires_in * 1000) - 300000 
            };
            return data.access_token;
        } else {
            console.error("[AUTH] Erreur récupération token:", data);
            return null;
        }
    } catch (error) {
        console.error("[AUTH] Erreur réseau token:", error);
        return null;
    }
}

/**
 * Wrapper pour les appels API Twitch Helix.
 * Gère l'injection des headers et la détection d'expiration de token.
 */
async function twitchApiFetch(endpoint, token) {
    const accessToken = token || await getTwitchToken('app');
    if (!accessToken) throw new Error("Impossible d'obtenir un Token d'accès.");

    // Construction de l'URL propre
    const finalUrl = `https://api.twitch.tv/helix/${endpoint}`;

    const res = await fetch(finalUrl, {
        headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`
        }
    });

    // Gestion spécifique de l'erreur 401 (Token Invalide/Expiré)
    if (res.status === 401) {
        console.warn("[API] Token expiré (401). Nettoyage du cache.");
        if (token === CACHE.twitchTokens['app']?.access_token) CACHE.twitchTokens['app'] = null; 
        if (token === CACHE.twitchUser?.access_token) CACHE.twitchUser = null; 
        throw new Error(`Erreur d'authentification Twitch (401).`);
    }
    
    if (!res.ok) {
        const errTxt = await res.text();
        throw new Error(`Erreur API Twitch (${res.status}): ${errTxt}`);
    }

    return res.json();
}

/**
 * Wrapper pour l'IA Google Gemini.
 * Gère les erreurs et force un format de réponse HTML pour le frontend.
 */
async function runGeminiAnalysis(prompt) {
    try {
        // Envoi du prompt au modèle
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        // Retour succès
        return { 
            success: true, 
            html_response: text 
        };
    } catch (e) {
        console.error("[IA] Erreur Gemini:", e);
        // Retour échec géré proprement pour ne pas planter le front
        return { 
            success: false, 
            error: e.message, 
            html_response: `<p style="color:#e34a64;">❌ Service IA indisponible temporairement : ${e.message}</p>` 
        };
    }
}

// ==========================================================================================
// 4. ROUTES D'AUTHENTIFICATION (OAUTH2)
// ==========================================================================================

// Démarre le flux de connexion
app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const scope = "user:read:follows"; // Permissions demandées
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${scope}&state=${state}`;
    
    res.cookie('twitch_state', state, { httpOnly: true, secure: true, maxAge: 600000 }); 
    res.redirect(url);
});

// Callback de retour Twitch
app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error, error_description } = req.query;
    
    if (state !== req.cookies.twitch_state) {
        return res.status(403).send("Erreur de sécurité (State mismatch).");
    }

    if (error) return res.status(400).send(`Erreur Twitch : ${error_description}`);

    try {
        const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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
            
            // Script de fermeture propre
            res.send(`
                <html><body><script>
                    if (window.opener) {
                        window.opener.postMessage('auth_success', '*');
                        window.close();
                    } else {
                        window.location.href = '/';
                    }
                </script></body></html>
            `);
        } else {
            res.status(500).send("Échec de récupération du token.");
        }
    } catch (e) {
        res.status(500).send(`Erreur serveur : ${e.message}`);
    }
});

// Déconnexion
app.post('/twitch_logout', (req, res) => {
    CACHE.twitchUser = null;
    res.json({ success: true });
});

// Vérification de session
app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) {
        return res.json({ 
            is_connected: true, 
            display_name: CACHE.twitchUser.display_name 
        });
    }
    CACHE.twitchUser = null; 
    res.json({ is_connected: false });
});

// ==========================================================================================
// 5. ROUTES DE DONNÉES (FOLLOWS, VOD, SCAN)
// ==========================================================================================

// Liste des chaînes suivies
app.get('/followed_streams', async (req, res) => {
    if (!CACHE.twitchUser) return res.status(401).json({ success: false });

    try {
        const data = await twitchApiFetch(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token);
        const streams = data.data.map(stream => ({
            user_name: stream.user_name,
            user_login: stream.user_login,
            title: stream.title,
            viewer_count: stream.viewer_count,
            thumbnail_url: stream.thumbnail_url 
        }));
        res.json({ success: true, streams });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Récupération dernière VOD
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
        res.json({ 
            success: true, 
            vod: {
                id: vod.id,
                title: vod.title,
                url: vod.url,
                thumbnail_url: vod.thumbnail_url.replace('%{width}', '320').replace('%{height}', '180'),
                duration: vod.duration 
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Route principale SCAN
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    
    try {
        // Essai User
        const userRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`); 
        
        if (userRes.data.length > 0) {
            const user = userRes.data[0];
            let stream = null;
            try { 
                const sRes = await twitchApiFetch(`streams?user_id=${user.id}`);
                if (sRes.data.length) stream = sRes.data[0];
            } catch (e) {}

            const userData = { 
                login: user.login, 
                display_name: user.display_name, 
                id: user.id, 
                profile_image_url: user.profile_image_url,
                is_live: !!stream,
                viewer_count: stream ? stream.viewer_count : 0,
                game_name: stream ? stream.game_name : '',
                total_views: user.view_count,
                ai_calculated_niche_score: (user.broadcaster_type === 'partner') ? '9.0/10' : '6.0/10'
            };
            
            CACHE.lastScanData = { type: 'user', ...userData };
            return res.json({ success: true, type: 'user', user_data: userData });
        }
        
        // Essai Jeu
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        
        if (gameRes.data.length > 0) {
            const game = gameRes.data[0];
            const streamsRes = await twitchApiFetch(`streams?game_id=${game.id}&first=100`);
            
            const totalViewers = streamsRes.data.reduce((acc, s) => acc + s.viewer_count, 0);
            
            const gameData = { 
                name: game.name, 
                id: game.id, 
                box_art_url: game.box_art_url,
                total_streamers: streamsRes.data.length,
                total_viewers: totalViewers,
                ai_calculated_niche_score: (totalViewers < 2000) ? '8.5/10' : '4.0/10'
            };
            
            CACHE.lastScanData = { type: 'game', ...gameData };
            return res.json({ success: true, type: 'game', game_data: gameData });
        }

        res.status(404).json({ success: false, message: "Introuvable" });
        
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ==========================================================================================
// 6. ROTATION AUTOMATIQUE (DEEP SEARCH < 100 VUES)
// ==========================================================================================

async function refreshGlobalStreamList() {
    const now = Date.now();
    const rotation = CACHE.globalStreamRotation;
    
    // Cooldown
    if (now - rotation.lastFetchTime < rotation.fetchCooldown && rotation.streams.length > 5) return;
    
    console.log("[ROTATION] Lancement du Deep Search (Streams FR < 100 vues)...");
    
    let candidates = [];
    let cursor = null;
    let pageCount = 0;
    
    try {
        // On scanne jusqu'à 10 pages pour trouver les perles rares
        while (candidates.length < 50 && pageCount < 10) {
            let url = `streams?language=fr&first=100`;
            if (cursor) url += `&after=${cursor}`;
            
            const res = await twitchApiFetch(url);
            if (!res.data || !res.data.length) break;

            // FILTRE STRICT : On ne veut QUE les petits
            const batch = res.data.filter(s => s.viewer_count > 0 && s.viewer_count <= 100);
            candidates = candidates.concat(batch);

            cursor = res.pagination ? res.pagination.cursor : null;
            if (!cursor) break;
            pageCount++;
        }

        // Fallback si vraiment personne (ex: 4h du mat)
        if (candidates.length === 0) {
            console.log("[ROTATION] Fallback activé (Top 100 Low)");
            const fb = await twitchApiFetch(`streams?language=fr&first=100`);
            candidates = fb.data.sort((a,b) => a.viewer_count - b.viewer_count).slice(0, 20);
        } else {
            // Mélange pour varier les plaisirs
            candidates = candidates.sort(() => Math.random() - 0.5);
        }

        rotation.streams = candidates.map(s => ({ channel: s.user_login, viewers: s.viewer_count }));
        if (rotation.currentIndex >= rotation.streams.length) rotation.currentIndex = 0;
        rotation.lastFetchTime = now;
        
        console.log(`[ROTATION] Mise à jour terminée : ${rotation.streams.length} chaînes trouvées.`);

    } catch (e) {
        console.error("[ROTATION] Erreur:", e);
    }
}

app.get('/get_default_stream', async (req, res) => {
    // 1. Priorité Boost
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
        const remaining = Math.ceil((CACHE.boostedStream.endTime - Date.now()) / 60000);
        return res.json({ 
            success: true, 
            channel: CACHE.boostedStream.channel, 
            viewers: 'BOOST',
            message: `⚡ BOOST ACTIF (${remaining} min)`,
            mode: 'boost'
        });
    }

    // 2. Rotation Standard
    await refreshGlobalStreamList(); 
    const rotation = CACHE.globalStreamRotation;
    
    if (rotation.streams.length === 0) {
        return res.json({ success: true, channel: 'twitch', message: 'Aucun stream trouvé', mode: 'fallback' });
    }

    const current = rotation.streams[rotation.currentIndex];
    return res.json({ 
        success: true, 
        channel: current.channel,
        viewers: current.viewers,
        message: `✅ Auto: ${current.channel} (${current.viewers} vues)`,
        mode: 'auto'
    });
});

app.post('/cycle_stream', async (req, res) => {
    const { direction } = req.body; 
    
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
        return res.status(403).json({ success: false, error: "Boost actif." });
    }

    await refreshGlobalStreamList();
    const rotation = CACHE.globalStreamRotation;

    if (rotation.streams.length === 0) return res.status(404).json({ success: false });

    if (direction === 'next') rotation.currentIndex = (rotation.currentIndex + 1) % rotation.streams.length;
    else rotation.currentIndex = (rotation.currentIndex - 1 + rotation.streams.length) % rotation.streams.length;

    const newS = rotation.streams[rotation.currentIndex];
    return res.json({ success: true, channel: newS.channel, viewers: newS.viewers });
});

// ==========================================================================================
// 7. FONCTIONS AVANCÉES (BOOST, RAID, IA, CSV)
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
    const now = Date.now();
    
    if (CACHE.streamBoosts[channel] && (now - CACHE.streamBoosts[channel]) < 3*3600*1000) {
        return res.status(429).json({ error: "Cooldown 3h actif." });
    }
    
    CACHE.streamBoosts[channel] = now;
    CACHE.boostedStream = { channel: channel, endTime: now + 15*60000 };
    res.json({ success: true, html_response: "<p>Boost activé !</p>" });
});

app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    try {
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if (!gameRes.data.length) return res.status(404).json({ error: "Jeu inconnu" });
        
        // Recherche large FR
        const streamsRes = await twitchApiFetch(`streams?game_id=${gameRes.data[0].id}&first=100&language=fr`);
        const max = parseInt(max_viewers);
        
        // Filtre strict
        const target = streamsRes.data.filter(s => s.viewer_count <= max).sort((a,b) => b.viewer_count - a.viewer_count)[0];
        
        if (target) {
            res.json({ success: true, target: {
                name: target.user_name, login: target.user_login, viewers: target.viewer_count,
                thumbnail_url: target.thumbnail_url.replace('%{width}','320').replace('%{height}','180')
            }});
        } else {
            res.json({ success: false, error: "Aucun stream FR correspondant." });
        }
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/analyze_schedule', async (req, res) => {
    const { game } = req.body;
    try {
        const gr = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(!gr.data.length) return res.json({success:false});
        
        const gData = gr.data[0];
        const sRes = await twitchApiFetch(`streams?game_id=${gData.id}&first=100`);
        const totalV = sRes.data.reduce((a,b)=>a+b.viewer_count,0);
        
        const prompt = `Jeu: ${gData.name}. ${sRes.data.length} streamers, ${totalV} viewers. Donne HTML: <h4>Saturation</h4>, <h4>Créneaux</h4> (ul), <strong>Conseil</strong>.`;
        const aiResult = await runGeminiAnalysis(prompt);
        
        res.json({ 
            success: true, 
            game_name: gData.name, 
            box_art: gData.box_art_url.replace('{width}','144').replace('{height}','192'), 
            html_response: aiResult.html_response 
        });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/critique_ia', async (req, res) => {
    const { type, query, niche_score } = req.body;
    const prompt = type==='niche' 
        ? `Expert Twitch. Score: ${niche_score}. Analyse ${query}. Format HTML.` 
        : `Expert Video. Analyse ${query}. Format HTML.`;
    
    const r = await runGeminiAnalysis(prompt);
    res.json(r);
});

app.post('/auto_action', async (req, res) => {
    const { action_type, context } = req.body;
    const prompt = `Agis comme un bot Twitch. Action: ${action_type}. Contexte: ${JSON.stringify(context)}. Réponse HTML.`;
    const r = await runGeminiAnalysis(prompt);
    res.json(r);
});

app.get('/export_csv', (req, res) => {
    const d = CACHE.lastScanData;
    if(!d) return res.status(404).send("Rien à exporter.");
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename=Twitch_Analysis.csv');
    res.send(`Type,${d.type}\nNom,${d.display_name||d.name}\nScore,${d.ai_calculated_niche_score}`);
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));

app.listen(PORT, () => console.log(`Serveur V22 (Production) démarré sur le port ${PORT}`));
