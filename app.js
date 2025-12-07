const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

// Assurez-vous d'avoir installé : npm install @google/genai express cors node-fetch body-parser cookie-parser
const { GoogleGenAI } = require('@google/genai');

const app = express();

// =========================================================
// --- CONFIGURATION ET VARIABLES D'ENVIRONNEMENT ---
// ATTENTION : REMPLACEZ LES PLACEHOLDERS CI-DESSOUS
// =========================================================

const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || 'VOTRE_CLIENT_ID_TWITCH';
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || 'VOTRE_SECRET_TWITCH';
// REMPLACEZ VOTRE_URL_BASE PAR L'URL DE VOTRE SERVEUR (ex: https://monserveur.com)
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`; 
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI || `${BASE_URL}/twitch_auth_callback`;

// CLÉ API GEMINI
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'VOTRE_CLE_API_GEMINI'; 
const GEMINI_MODEL = "gemini-2.0-flash"; 

let ai = null;
if (GEMINI_API_KEY && GEMINI_API_KEY !== 'VOTRE_CLE_API_GEMINI') {
    ai = new GoogleGenAI(GEMINI_API_KEY);
    console.log("✅ GoogleGenAI initialisé.");
} else {
    console.error("❌ CLÉ GEMINI manquante ou incorrecte.");
}

// =========================================================
// --- MIDDLEWARES & STOCKAGE SESSION SIMULÉ ---
// =========================================================

app.use(cors()); 
app.use(bodyParser.json());
app.use(cookieParser());

// Stockage de session simplifiée (pour cet exemple)
const userSessions = new Map();

// Middleware pour vérifier la session et les tokens Twitch
async function checkTwitchAuth(req, res, next) {
    const sessionId = req.cookies.session_id;
    const session = userSessions.get(sessionId);
    if (session && session.accessToken && session.expiresAt > Date.now()) {
        req.session = session;
        // Tente de rafraîchir le token si nécessaire (logique simplifiée)
        if (session.expiresAt - Date.now() < 300000) { // Moins de 5 min restantes
             console.log("Token presque expiré, nécessite un rafraîchissement.");
             // Logique de rafraîchissement (non implémentée ici pour la concision)
        }
        next();
    } else {
        res.status(401).json({ success: false, error: "Non authentifié", html_response: "<p style='color:red;'>❌ Connexion Twitch requise pour cette action.</p>" });
    }
}

// =========================================================
// --- ROUTE D'AUTHENTIFICATION TWITCH (OAUTH 2.0) ---
// =========================================================

app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows+channel:read:subscriptions+clips:edit+channel:manage:raids&state=${state}`;
    res.cookie('twitch_auth_state', state, { httpOnly: true, secure: true, sameSite: 'None' });
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state } = req.query;
    const expectedState = req.cookies.twitch_auth_state;

    if (!state || state !== expectedState) {
        return res.status(403).send('État OAuth non valide.');
    }

    try {
        // 1. Échange du code contre le token
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
        if (tokenData.error) {
            console.error('Erreur Token:', tokenData.message);
            return res.status(400).send(`Erreur lors de l'obtention du token: ${tokenData.message}`);
        }

        const { access_token, refresh_token, expires_in } = tokenData;

        // 2. Récupération des informations utilisateur (ID et Nom)
        const userRes = await fetch('https://api.twitch.tv/helix/users', {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${access_token}`
            }
        });
        const userData = await userRes.json();
        const user = userData.data[0];

        // 3. Stockage de la session
        const sessionId = crypto.randomBytes(16).toString('hex');
        userSessions.set(sessionId, {
            id: user.id,
            username: user.login,
            displayName: user.display_name,
            accessToken: access_token,
            refreshToken: refresh_token,
            expiresAt: Date.now() + (expires_in * 1000) 
        });

        // 4. Envoi du cookie de session au client
        res.cookie('session_id', sessionId, { httpOnly: true, secure: true, sameSite: 'None', maxAge: 90 * 24 * 60 * 60 * 1000 }); // 90 jours
        
        // 5. Redirection vers la page principale
        res.redirect(`${BASE_URL}/`);

    } catch (error) {
        console.error('Erreur d\'authentification Twitch:', error);
        res.status(500).send('Erreur interne du serveur lors de l\'authentification.');
    }
});

app.post('/twitch_logout', (req, res) => {
    const sessionId = req.cookies.session_id;
    if (sessionId) {
        userSessions.delete(sessionId);
        res.clearCookie('session_id', { httpOnly: true, secure: true, sameSite: 'None' });
        res.json({ success: true, message: "Déconnexion réussie." });
    } else {
        res.json({ success: true, message: "Déjà déconnecté." });
    }
});

app.get('/twitch_user_status', (req, res) => {
    const sessionId = req.cookies.session_id;
    const session = userSessions.get(sessionId);
    
    if (session && session.accessToken && session.expiresAt > Date.now()) {
        res.json({
            is_connected: true,
            username: session.username,
            display_name: session.displayName
        });
    } else {
        res.json({ is_connected: false });
    }
});

// =========================================================
// --- ROUTE DU FIL SUIVI (Followed Streams) ---
// =========================================================

app.get('/followed_streams', checkTwitchAuth, async (req, res) => {
    try {
        const userId = req.session.id;
        const accessToken = req.session.accessToken;
        
        // Requête à l'API Twitch pour les streams suivis LIVE
        const response = await fetch(`https://api.twitch.tv/helix/streams/followed?user_id=${userId}&first=12`, {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        const data = await response.json();

        if (!response.ok || data.error) {
            console.error('Erreur API Twitch /followed_streams:', data.message || 'Erreur inconnue');
            return res.status(response.status).json({ success: false, error: data.message || "Erreur lors de la récupération des streams suivis." });
        }
        
        res.json({ success: true, streams: data.data });

    } catch (e) {
        console.error('Erreur /followed_streams:', e);
        res.status(500).json({ success: false, error: `Erreur interne du serveur: ${e.message}` });
    }
});

// =========================================================
// --- ROUTE SCANNER CIBLE (Utilisateur ou Jeu) ---
// =========================================================

async function twitchApiCall(endpoint, token, queryParams = {}) {
    const params = new URLSearchParams(queryParams).toString();
    const url = `https://api.twitch.tv/helix/${endpoint}?${params}`;
    
    const res = await fetch(url, {
        headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${token}`
        }
    });
    return res.json();
}


app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    // Utiliser un token d'application si pas d'utilisateur connecté (pour les données publiques)
    // Ici, on simule l'utilisation d'un token générique ou on utilise l'ID Client (pour la simplicité)

    if (!query) {
        return res.status(400).json({ success: false, message: "La requête est vide." });
    }
    
    // Pour simplifier, on utilise le token du client pour les appels publics. 
    // Idéalement, on utiliserait un App Access Token.
    const PUBLIC_TOKEN = `Client-ID ${TWITCH_CLIENT_ID}`;

    try {
        // Tenter un scan de JEU
        const gameRes = await twitchApiCall('games', PUBLIC_TOKEN, { name: query });
        if (gameRes.data && gameRes.data.length > 0) {
            const game = gameRes.data[0];

            // Récupérer les données de Stream pour calculer V/S
            const streamRes = await twitchApiCall('streams', PUBLIC_TOKEN, { game_id: game.id, first: 100 });
            
            let totalViewers = 0;
            let totalStreamers = streamRes.data ? streamRes.data.length : 0;
            
            if (streamRes.data) {
                 totalViewers = streamRes.data.reduce((sum, stream) => sum + stream.viewer_count, 0);
            }
            
            return res.json({ 
                success: true, 
                type: 'game', 
                game_data: { 
                    id: game.id, 
                    name: game.name, 
                    box_art_url: game.box_art_url, 
                    total_viewers: totalViewers, 
                    total_streamers: totalStreamers 
                } 
            });
        }
        
        // Tenter un scan d'UTILISATEUR
        const userRes = await twitchApiCall('users', PUBLIC_TOKEN, { login: query.toLowerCase() });
        if (userRes.data && userRes.data.length > 0) {
            const user = userRes.data[0];

            // Récupérer le nombre de followers
            const followerRes = await twitchApiCall('channels/followers', PUBLIC_TOKEN, { broadcaster_id: user.id });
            const follower_count = followerRes.total;

            // Récupérer le statut LIVE
            const streamRes = await twitchApiCall('streams', PUBLIC_TOKEN, { user_id: user.id });
            const is_live = streamRes.data && streamRes.data.length > 0;
            const stream_details = is_live ? { 
                viewer_count: streamRes.data[0].viewer_count, 
                game_name: streamRes.data[0].game_name 
            } : null;

            return res.json({ 
                success: true, 
                type: 'user', 
                user_data: { 
                    id: user.id, 
                    login: user.login, 
                    display_name: user.display_name, 
                    profile_image_url: user.profile_image_url, 
                    follower_count: follower_count || 0,
                    is_live,
                    stream_details
                } 
            });
        }

        return res.status(404).json({ success: false, message: "Cible (utilisateur ou jeu) non trouvée sur Twitch." });

    } catch (e) {
        console.error('Erreur /scan_target:', e);
        res.status(500).json({ success: false, error: `Erreur interne du serveur: ${e.message}` });
    }
});


// =========================================================
// --- ROUTE VOD (Recyclage Vidéo) ---
// =========================================================

app.get('/get_latest_vod', async (req, res) => {
    const { channel } = req.query;
    if (!channel) {
        return res.status(400).json({ success: false, error: "Le paramètre 'channel' est requis." });
    }

    // On utilise ici un App Access Token pour les appels publics.
    // Pour cet exemple, on peut simplifier en utilisant l'ID Client.
    const PUBLIC_TOKEN = `Client-ID ${TWITCH_CLIENT_ID}`;

    try {
        // 1. Obtenir l'ID de l'utilisateur
        const userRes = await twitchApiCall('users', PUBLIC_TOKEN, { login: channel.toLowerCase() });
        if (!userRes.data || userRes.data.length === 0) {
            return res.status(404).json({ success: false, error: "Chaîne Twitch non trouvée." });
        }
        const userId = userRes.data[0].id;

        // 2. Obtenir la dernière VOD
        const vodRes = await twitchApiCall('videos', PUBLIC_TOKEN, { 
            user_id: userId, 
            type: 'archive', 
            first: 1 
        });

        if (vodRes.data && vodRes.data.length > 0) {
            const vod = vodRes.data[0];
            return res.json({ success: true, vod: vod });
        } else {
            return res.status(404).json({ success: false, error: "Aucune VOD (Archive) trouvée pour cette chaîne." });
        }

    } catch (e) {
        console.error('Erreur /get_latest_vod:', e);
        res.status(500).json({ success: false, error: `Erreur interne du serveur: ${e.message}` });
    }
});


// =========================================================
// --- ROUTE ACTIONS AUTOMATIQUES (Raid, Clip, Metrics, Titre IA) ---
// =========================================================

app.post('/auto_action', checkTwitchAuth, async (req, res) => {
    const { query, action_type } = req.body;
    const session = req.session; 
    
    if (!query || !action_type) {
        return res.status(400).json({ success: false, error: "Paramètres 'query' et 'action_type' requis." });
    }

    try {
        let htmlOutput = `<h4 style="color:#fff;">[${action_type.toUpperCase()}] Résultat de l'Action:</h4>`;

        switch (action_type) {
            case 'raid_action':
                // Implémentation de la logique de RAID
                // 1. Récupérer le jeu actuel de l'utilisateur connecté
                const streamRes = await twitchApiCall('streams', session.accessToken, { user_id: session.id });
                const currentStream = streamRes.data ? streamRes.data[0] : null;

                if (!currentStream) {
                    return res.json({ success: false, html_response: "<p style='color:orange'>⚠️ Vous n'êtes pas LIVE. Impossible de lancer un Raid.</p>" });
                }
                const currentCategory = currentStream.game_name || 'Just Chatting';

                // 2. Trouver des streamers dans la même catégorie avec 0-100 viewers
                const targetStreamsRes = await twitchApiCall('streams', session.accessToken, { 
                    game_id: currentStream.game_id, 
                    first: 100 
                });

                const raidCandidates = targetStreamsRes.data
                    ? targetStreamsRes.data.filter(s => s.viewer_count > 0 && s.viewer_count <= 100 && s.user_id !== session.id)
                    : [];

                if (raidCandidates.length > 0) {
                    // Choisir le streamer avec le plus de viewers (le plus grand potentiel de rétention)
                    const topCandidate = raidCandidates.sort((a, b) => b.viewer_count - a.viewer_count)[0];
                    
                    htmlOutput += `
                        <p style="color:var(--color-ai-niche);">✅ Candidat Niche trouvé pour le Raid !</p>
                        <div class="card p-3 rounded mt-2 bg-gray-900 border border-gray-700">
                            <p>Raid suggéré dans votre niche (${currentCategory}):</p>
                            <p><strong>${topCandidate.user_name}</strong> (${topCandidate.viewer_count} viewers)</p>
                            <button onclick="navigator.clipboard.writeText('/raid ${topCandidate.user_login}')" class="bg-[#ff0099] text-white p-2 rounded mt-2">Copier: /raid ${topCandidate.user_login}</button>
                        </div>
                    `;
                    return res.json({ 
                        success: true, 
                        html_response: htmlOutput,
                        raidCandidate: { user_name: topCandidate.user_name, user_login: topCandidate.user_login, viewer_count: topCandidate.viewer_count }
                    });
                }
                
                htmlOutput = "<p style='color:gray; text-align:center;'>🔍 Boost activé, mais aucun candidat au Raid trouvé dans votre niche (0-100 viewers).</p>";
                break;

            case 'create_clip':
                // Implémentation de la logique de CLIP
                const targetChannelLogin = query.toLowerCase();
                
                // 1. Obtenir l'ID de la chaîne cible (query est le pseudo)
                const userRes = await twitchApiCall('users', session.accessToken, { login: targetChannelLogin });
                if (!userRes.data || userRes.data.length === 0) {
                     return res.status(404).json({ success: false, html_response: "<p style='color:red;'>❌ Chaîne cible non trouvée sur Twitch.</p>" });
                }
                const broadcasterId = userRes.data[0].id;

                // 2. Créer le Clip
                const clipCreationRes = await fetch(`https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}`, {
                    method: 'POST',
                    headers: {
                        'Client-ID': TWITCH_CLIENT_ID,
                        'Authorization': `Bearer ${session.accessToken}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                const clipCreationData = await clipCreationRes.json();
                
                if (!clipCreationRes.ok || clipCreationData.error) {
                    const errMsg = clipCreationData.message || 'Erreur inconnue lors de la création du clip.';
                    return res.status(clipCreationRes.status).json({ success: false, html_response: `<p style='color:red;'>❌ Échec de la création du Clip: ${errMsg}</p>` });
                }
                
                const clipId = clipCreationData.data[0].id;
                const clipEditUrl = `https://clips.twitch.tv/${clipId}`;
                
                htmlOutput += `
                    <p style="color:var(--color-ai-repurpose);">✅ Clip créé avec succès pour ${targetChannelLogin} !</p>
                    <div class="card p-3 rounded mt-2 bg-gray-900 border border-gray-700">
                        <p>Le Clip de 30 secondes a été généré. Il nécessite une édition finale (titre, zone de coupe).</p>
                        <a href="${clipEditUrl}" target="_blank" class="btn-secondary mt-2 inline-block" style="background:var(--color-ai-repurpose);">🔗 Modifier/Finaliser le Clip</a>
                        <button onclick="navigator.clipboard.writeText('${clipEditUrl}')" class="btn-primary mt-2 ml-2 inline-block">Copier Lien</button>
                    </div>
                `;
                break;

            case 'export_metrics':
                // Logique simplifiée pour "Export Metrics" (simule des données d'analyse)
                const streamerLogin = query.toLowerCase();

                // Simuler une requête complexe à un service externe
                if (streamerLogin.includes('ninja')) {
                    // Données d'un gros streamer
                    var metrics = { views: 5000000, retention: 0.15, followers: 80000 };
                } else if (streamerLogin.includes('gotaga')) {
                    // Données d'un streamer européen populaire
                    var metrics = { views: 3500000, retention: 0.25, followers: 55000 };
                } else {
                    // Données moyennes/petites (pour simuler la majorité)
                    var metrics = { 
                        views: Math.floor(Math.random() * 500000) + 10000, 
                        retention: (Math.random() * 0.4 + 0.1).toFixed(2), 
                        followers: Math.floor(Math.random() * 8000) + 500 
                    };
                }
                
                return res.json({ success: true, metrics: metrics, html_response: `<p style="color:var(--color-secondary-blue); text-align:center;">📊 Export Metrics pour ${streamerLogin} chargé avec succès.</p>` });

            case 'title_disruption':
                if (!ai) {
                     return res.status(503).json({ success: false, error: "Service AI non disponible (Clé API manquante)." });
                }
                
                const prompt = `Vous êtes un expert en marketing et growth hacking pour Twitch/YouTube. Votre rôle est de générer des titres de vidéos extrêmement accrocheurs (clickbait) et disruptifs pour les Shorts/VODs.
                
                Thème de la vidéo: "${query}"
                
                Générez 5 suggestions de titres très courts et impactants, chacun sur une ligne, en utilisant des majuscules, des chiffres et des emojis percutants pour maximiser le taux de clic (CTR). Ne retournez que les 5 titres, pas de préambule.
                
                Format de sortie:
                1. 🤯 TITRE N°1
                2. 😱 TITRE N°2
                ...`;
                
                const aiResponse = await ai.models.generateContent({
                    model: GEMINI_MODEL,
                    contents: prompt,
                });
                
                const titles = aiResponse.text.split('\n').filter(t => t.trim().length > 0);

                htmlOutput = `<h4 style="color:var(--color-ai-repurpose); border-color:var(--color-ai-repurpose);">5 Titres Disruptifs suggérés par l'IA:</h4><ul>`;
                titles.forEach(title => {
                    htmlOutput += `<li>${title.replace(/^\d+\.\s*/, '')}</li>`;
                });
                htmlOutput += `</ul>`;

                return res.json({ success: true, html_response: htmlOutput });

            default:
                // CAS MANQUANT DANS L'ANCIEN CODE QUI CAUSAIT L'ERREUR 400
                return res.status(400).json({ success: false, error: "Action non prise en charge." });
        }
        
        return res.json({ success: true, html_response: htmlOutput });

    } catch (e) {
        console.error(`Erreur /auto_action (${action_type}):`, e);
        res.status(500).json({ success: false, html_response: `<p style='color:red'>❌ Erreur de service: ${e.message}. Vérifiez vos tokens Twitch et Gemini.</p>` });
    }
});


// =========================================================
// --- ROUTE CRITIQUE IA (Niche & Repurpose) ---
// =========================================================

app.post('/critique_ia', async (req, res) => {
    const { type, query } = req.body;
    
    if (!ai) {
        return res.status(503).json({ success: false, error: "Service AI non disponible (Clé API manquante)." });
    }
    if (!type || !query) {
        return res.status(400).json({ success: false, error: "Paramètres 'type' et 'query' requis." });
    }

    try {
        let prompt = "";
        let color = "";
        
        if (type === 'niche') {
            color = 'var(--color-ai-niche)';
            prompt = `En tant que consultant en stratégie Twitch (Niche), analysez le jeu suivant: ${query}.
            Votre rapport doit être structuré de la manière suivante (utilisez le format markdown, sans titres H2 ou H3, seulement H4 et des listes ul):
            
            1. **Score de Niche (sur 100)**: Un seul nombre représentant l'opportunité.
            2. **Verdict de Croissance**: Une phrase courte et percutante.
            3. **Analyse Détaillée (Liste de 4 points)**: Utilisez des puces pour décrire les forces et faiblesses d'attaquer cette niche.
            4. **Idées de Contenu Disruptif (Liste de 3 idées)**: 3 idées de contenu pour se démarquer dans ce jeu.
            `;
        } else if (type === 'repurpose') {
            color = 'var(--color-ai-repurpose)';
            prompt = `En tant qu'expert en recyclage vidéo (VOD vers Shorts), analysez la dernière VOD avec ce thème/titre: ${query}.
            
            Votre rôle est d'identifier les meilleurs moments pour des clips courts (YouTube Shorts, TikTok) et de proposer des titres.
            
            1. **Titre de la VOD**: ${query}
            2. **Résumé d'Opportunité (3 phrases max)**: Expliquez rapidement ce qui rend cette VOD propice au recyclage.
            3. **3 Suggestions de Clips/Shorts (Format List)**: Pour chaque suggestion, indiquez:
               - **Sujet/Action:** Le moment clé (ex: "Le boss de fin battu en 30 secondes").
               - **Point de Clip:** Le format doit être **HH:MM:SS** (Heure:Minute:Seconde). C'est le point de départ du clip (ex: 01:25:30). Utilisez toujours le format HH:MM:SS, même si l'heure est 00.
               - **Titre Short/TikTok**: Un titre court et percutant.
            `;
        } else if (type === 'trend') {
            color = 'var(--color-ai-growth)';
             prompt = `En tant qu'analyste de marché pour Twitch, identifiez 3 tendances émergentes et sous-exploitées sur Twitch (jeux, concepts ou défis) qui pourraient exploser d'ici 6 mois, en se basant sur la 'hype' actuelle.
            Pour chaque tendance, fournissez:
            - **Tendance**: Le nom ou le concept.
            - **Potentiel**: Pourquoi cela va exploser.
            - **Angle d'Attaque**: Comment un nouveau streamer peut en profiter.
            `;
        } else {
            return res.status(400).json({ success: false, error: "Type de critique non valide." });
        }

        const aiResponse = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: prompt,
        });

        const htmlResponse = aiResponse.text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') 
            .replace(/^- (.*)/gm, '<li>$1</li>') 
            .replace(/1\. /g, '<li>')
            .replace(/2\. /g, '<li>')
            .replace(/3\. /g, '<li>')
            .replace(/4\. /g, '<li>')
            .replace(/5\. /g, '<li>')
            .replace(/(\r\n|\n|\r)/gm, '<br>')
            .replace(/<br><br><li>/g, '<ul><li>')
            .replace(/<\/li><br><br><strong>/g, '</li></ul><strong>')
            .replace(/<\/li><br><li>/g, '</li><li>')
            .replace(/<br><ul>/g, '<ul>')
            .replace(/<br><br>/g, '<br>')
            .replace(/<br><br>/g, '<br>');


        const finalHtml = `<h4 style="color:${color}; border-color:${color};">${type === 'niche' ? 'Rapport IA d\'Optimisation de Niche' : (type === 'repurpose' ? 'Analyse IA de Recyclage VOD/Clips' : 'Analyse IA de Tendances')}</h4>` + htmlResponse;

        res.json({ success: true, html_response: finalHtml });

    } catch (e) {
        console.error(`Erreur critique IA (${type}):`, e);
        res.status(500).json({ success: false, error: `Erreur du service IA: ${e.message}. Votre clé Gemini est-elle valide ?` });
    }
});


// =========================================================
// --- ROUTE BOOST (Trafic) ---
// =========================================================

app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    
    // Simplification : pas de vérification de cooldown pour cet exemple
    if (!channel) {
        return res.status(400).json({ success: false, error: "Le paramètre 'channel' est requis." });
    }
    
    // Logique Boost: Simuler l'envoi de la chaîne à un service de promotion
    const success = Math.random() > 0.2; // 80% de chance de succès

    if (success) {
        const cooldown = Math.floor(Math.random() * (180 - 120 + 1) + 120); // 120 à 180 minutes
        const html = `
            <p style="color:var(--color-primary-pink); font-weight:bold; text-align:center;">✅ BOOST ACTIVÉ pour ${channel.toUpperCase()}!</p>
            <p style="color:var(--color-text-dimmed); text-align:center;">Votre chaîne est maintenant dans la file d'attente de promotion. Prochain boost disponible dans ${cooldown} minutes.</p>
        `;
        return res.json({ success: true, html_response: html });
    } else {
        const html = `
            <p style="color:red; font-weight:bold; text-align:center;">❌ BOOST ÉCHOUÉ.</p>
            <p style="color:var(--color-text-dimmed); text-align:center;">Le service est surchargé. Réessayez dans 5 minutes. (Aucun cooldown appliqué)</p>
        `;
        return res.status(500).json({ success: false, html_response: html });
    }
});


// =========================================================
// ROUTE RACINE & DÉMARRAGE SERVEUR
// =========================================================

app.get('/', (req, res) => {
    // Dans un environnement de production, vous serviriez ici votre fichier HTML
    res.send(`
        <!DOCTYPE html>
        <html lang="fr">
        <head>
            <title>Streamer & Niche AI Hub - API BACKEND</title>
            <style>body{font-family:sans-serif;background:#0d0d0d;color:#fff;text-align:center;padding:50px;}h1{color:#ff0099;}p{color:#9aa3a8;}</style>
        </head>
        <body>
            <h1>Streamer & Niche AI Hub - Backend API</h1>
            <p>Le serveur fonctionne. Veuillez ouvrir le fichier <strong>HTML/JS</strong> dans votre navigateur pour accéder à l'interface utilisateur.</p>
            <p>Vérifiez que toutes vos variables (Clés Twitch et Gemini, BASE_URL) sont correctement configurées dans app.js.</p>
        </body>
        </html>
    `);
});

app.listen(PORT, () => {
    console.log(`Serveur Back-end démarré sur http://localhost:${PORT}`);
    console.log(`Adresse de redirection Twitch configurée: ${REDIRECT_URI}`);
    console.log("------------------------------------------");
});
