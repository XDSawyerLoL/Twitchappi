// --- app.js (Côté Serveur - Node.js/Express) ---

const express = require('express');
const session = require('express-session');
const path = require('path');
const axios = require('axios');
const querystring = require('querystring');

const app = express();
const PORT = 3000; // Assurez-vous que ce port correspond à votre configuration

// --- Configuration et Clés (À remplacer par vos valeurs réelles) ---
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || 'VOTRE_CLIENT_ID';
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || 'VOTRE_SECRET';
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/twitch_auth_callback';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'VOTRE_CLE_OPENAI';

// Variables de Session
app.use(session({
    secret: 'SuperSecretKeyForSession', 
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === 'production' } // secure: true en prod (HTTPS)
}));

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Sert le fichier HTML et les assets statiques
app.use(express.static(path.join(__dirname, 'public'))); 

// --- Variables d'État pour l'Authentification ---
let accessToken = null;
let refreshToken = null;
let twitchUser = null; // { id, login, display_name }


// =================================================================
// 🚀 NOUVELLE LOGIQUE BOOST
// =================================================================

// --- Constantes et Variables Globales Boost ---
const BOOST_DURATION_SECONDS = 6 * 60 * 60; // 6 heures de cooldown
const BOOST_UPDATE_INTERVAL_MS = 10000; // Vérification toutes les 10 secondes

// Structure de la file d'attente
let boostQueue = []; 
let currentBoost = null; // { channel: '...', startTime: <timestamp>, endTime: <timestamp>, avatar_url: '...' }

/**
 * Fonctions Mock pour la partie Twitch (À remplacer par l'implémentation réelle)
 */
const twitchClient = {
    async scanTarget(target) {
        // Logique de scan réelle (Appel à l'API Twitch ou à une base de données)
        console.log(`[TwitchClient] Scanning target: ${target}`);
        // Renvoyer un objet structuré, pas du HTML directement
        return {
            type: target.includes(' ') ? 'Game' : 'Streamer',
            target: target,
            stats: { viewers: 5000, streams: 15, avg_rank: 5 },
            top_streamers: ['StreamerA', 'StreamerB']
        };
    },
    async getUserData(login) {
        // Appelez l'API Twitch pour obtenir les infos utilisateur et l'avatar
        // Exemple mocké:
        if (login === 'gotaga') {
             return { profile_image_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/49c5e714-e51c-43f6-9f81-54605963b53c-profile_image-70x70.png' };
        }
        try {
            const url = `https://api.twitch.tv/helix/users?login=${login}`;
            const res = await axios.get(url, {
                headers: {
                    'Client-ID': TWITCH_CLIENT_ID,
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            if (res.data.data && res.data.data.length > 0) {
                return res.data.data[0];
            }
        } catch (error) {
            console.error(`Erreur lors de la récupération des données utilisateur pour ${login}:`, error.response ? error.response.data : error.message);
        }
        return { profile_image_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/default_profile.png' };
    }
};

/**
 * Gère l'avancement de la file d'attente de Boost.
 */
function processBoostQueue() {
    const now = Date.now();
    
    // 1. Si un boost est en cours et n'est pas terminé, ne rien faire
    if (currentBoost && currentBoost.endTime > now) {
        return; 
    }

    // 2. Si un boost est terminé (ou si 'currentBoost' est la fin d'un précédent cycle), le supprimer
    if (currentBoost && currentBoost.endTime <= now) {
        currentBoost = null;
    }

    // 3. Si la file d'attente n'est pas vide et qu'aucun boost n'est actif, prendre le prochain
    if (!currentBoost && boostQueue.length > 0) {
        const nextBoost = boostQueue.shift(); // Prend le premier de la file
        currentBoost = {
            channel: nextBoost.channel,
            startTime: now,
            endTime: now + BOOST_DURATION_SECONDS * 1000,
            avatar_url: nextBoost.avatar_url
        };
        console.log(`[BOOST] Nouveau boost actif: ${currentBoost.channel}`);
    }
}

// Lancement du processus de file d'attente au démarrage du serveur
setInterval(processBoostQueue, BOOST_UPDATE_INTERVAL_MS);


// =================================================================
// 🔒 ROUTES D'AUTHENTIFICATION TWITCH
// =================================================================

// 1. Démarrer l'Authentification
app.get('/twitch_auth_start', (req, res) => {
    const scope = 'user:read:follows'; 
    const authUrl = `https://id.twitch.tv/oauth2/authorize?${querystring.stringify({
        client_id: TWITCH_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: scope,
        force_verify: true // Force l'utilisateur à re-confirmer
    })}`;
    res.redirect(authUrl);
});

// 2. Callback de Twitch
app.get('/twitch_auth_callback', async (req, res) => {
    const { code } = req.query;
    if (!code) {
        return res.redirect('/?auth_error=no_code');
    }

    try {
        // Échange du code contre un jeton d'accès
        const tokenRes = await axios.post('https://id.twitch.tv/oauth2/token', querystring.stringify({
            client_id: TWITCH_CLIENT_ID,
            client_secret: TWITCH_CLIENT_SECRET,
            code: code,
            grant_type: 'authorization_code',
            redirect_uri: REDIRECT_URI
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        accessToken = tokenRes.data.access_token;
        refreshToken = tokenRes.data.refresh_token;

        // Récupérer les informations de l'utilisateur
        const userRes = await axios.get('https://api.twitch.tv/helix/users', {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (userRes.data.data.length > 0) {
            twitchUser = userRes.data.data[0];
            console.log(`Utilisateur connecté: ${twitchUser.display_name}`);
            res.redirect('/?auth_success=true');
        } else {
            res.redirect('/?auth_error=no_user_data');
        }

    } catch (error) {
        console.error("Erreur lors de l'échange de jeton ou de la récupération des données utilisateur:", error.response ? error.response.data : error.message);
        res.redirect('/?auth_error=token_exchange_failed');
    }
});

// 3. Statut de Connexion
app.get('/twitch_user_status', (req, res) => {
    if (twitchUser && accessToken) {
        res.json({ is_connected: true, username: twitchUser.display_name, id: twitchUser.id });
    } else {
        res.json({ is_connected: false });
    }
});

// 4. Déconnexion
app.get('/twitch_logout', (req, res) => {
    // Dans un vrai scénario, il faudrait invalider le jeton (revoke)
    accessToken = null;
    refreshToken = null;
    twitchUser = null;
    res.redirect('/?logout_success=true');
});


// =================================================================
// 📈 ROUTES DE DONNÉES TWITCH
// =================================================================

// 1. Fil Suivi
app.get('/followed_streams', async (req, res) => {
    if (!twitchUser || !accessToken) {
        return res.status(401).json({ error: "Non connecté à Twitch." });
    }

    try {
        const url = `https://api.twitch.tv/helix/streams/followed?user_id=${twitchUser.id}`;
        const streamsRes = await axios.get(url, {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${accessToken}`
            }
        });
        res.json(streamsRes.data);
    } catch (error) {
        console.error("Erreur API followed_streams:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: "Erreur lors de la récupération des streams suivis." });
    }
});

// =================================================================
// 🎯 ROUTE SCAN (CORRIGÉE)
// =================================================================

/**
 * Fonction pour formater les résultats du scan en HTML (Doit être implémentée)
 */
function formatScanResultsAsHtml(results) {
    if (!results || !results.stats) {
        return `<p style="color:red;">Aucune donnée valide reçue pour ${results.target || 'la cible'}.</p>`;
    }
    return `
        <h4 style="color:var(--color-secondary-blue);">Résultats du Scan: ${results.target}</h4>
        <p>Type: <strong>${results.type}</strong></p>
        <ul>
            <li>Spectateurs Moyens Actifs: <strong>${results.stats.viewers.toLocaleString()}</strong></li>
            <li>Nombre de Streams: <strong>${results.stats.streams}</strong></li>
            <li>Classement Moyen des Chaînes: <strong>${results.stats.avg_rank}</strong></li>
        </ul>
        <p>Top Streamers Ciblés: ${results.top_streamers.join(', ')}</p>
        <p><em>Ceci est un résultat mocké. L'implémentation réelle doit être dans twitchClient.scanTarget.</em></p>
    `;
}

// 2. Scan Cible
app.post('/scan_target', async (req, res) => {
    const { target } = req.body;
    if (!target) {
        return res.status(400).json({ error: "Target (Jeu ou Pseudo) manquant." });
    }

    try {
        const results = await twitchClient.scanTarget(target); // Votre logique de scan
        // Le frontend s'attend à "html_results"
        const html_results = formatScanResultsAsHtml(results); 
        res.json({ html_results: html_results });
    } catch (error) {
        console.error("Erreur lors du scan:", error);
        res.status(500).json({ error: `Erreur serveur lors du scan : ${error.message}` });
    }
});


// =================================================================
// ✨ ROUTE IA (CORRIGÉE AVEC PROMPT FRANÇAIS)
// =================================================================

/**
 * Mock du client OpenAI pour la démonstration (À remplacer par votre implémentation)
 */
const openAiClient = {
    async generateHtmlResponse(prompt) {
        console.log(`[AICLIENT] Envoi du prompt à l'IA: ${prompt}`);

        // Simulation de la réponse IA structurée en HTML
        const critique = {
            'niche': `<h4>Stratégie de Niche pour le jeu</h4><p>Le jeu Starfield est un <strong>AAA très saturé</strong>. Évitez les heures de pointe. Les opportunités se trouvent dans les <strong>builds de vaisseaux spécifiques</strong> ou le contenu 'New Game+' tardif. Votre angle devrait être sur les '<strong>règles cachées</strong>' du jeu. Le chat aime les débats sur les factions.</p><ul><li><strong>Angle 1:</strong> Le speedrun 'pacifiste' des quêtes.</li><li><strong>Angle 2:</strong> Build de vaisseau orienté 'marchandise illégale'.</li></ul>`,
            'repurpose': `<h4>Idées de Repurposing VOD</h4><p>Basé sur une analyse de VOD (mockée ici), le streamer est fort sur les <strong>moments de rage ou d'exploit</strong>. Concentrez-vous sur des clips courts. Répondez en français.</p><ul><li><strong>Clip 1 (TikTok) :</strong> "Quand le boss prend 10 secondes pour charger un PNG - (Nom du streamer) ne peut pas le supporter"</li><li><strong>Clip 2 (Shorts) :</strong> "1v5 Clutch in Warzone: le dernier kill est INSANE"</li><li><strong>Titre Suggestion :</strong> "MES NERFS LÂCHENT SUR CE JEU"</li></ul>`,
            'trend': `<h4>Top 3 Tendances Émergentes</h4><p>Ces jeux montrent une croissance rapide avec un faible nombre de streamers francophones:</p><ul><li><strong>1. Palworld :</strong> Fort intérêt global. Positionnez-vous sur les guides de "late game".</li><li><strong>2. Hell Divers 2 :</strong> Excellent pour le contenu coopératif. Misez sur le côté 'cinématique' des explosions.</li><li><strong>3. Lethal Company (Update) :</strong> Toujours populaire, créez des moments de peur extrêmes pour TikTok.</li></ul>`
        };

        const type = prompt.includes("Analyse de Niche") ? 'niche' : (prompt.includes("Repurposing de VOD") ? 'repurpose' : 'trend');

        if (critique[type]) {
            return `<div class="ai-content">${critique[type]}</div>`;
        }

        throw new Error("Erreur de simulation IA."); 
    }
};


// 3. Critique IA (Niche, Repurpose, Trend)
app.post('/critique_ia', async (req, res) => {
    const { game, channel, type } = req.body;
    
    // --- NOUVEAU: Exigence de Langue ---
    const lang_prompt = "Répondez uniquement en français. Utilisez des titres (h4) et des listes (ul) pour structurer votre réponse pour l'affichage HTML, en utilisant les tags forts (<strong>) pour mettre en évidence les points clés.";

    let prompt = "";
    if (type === 'niche' && game) {
        prompt = `${lang_prompt} Analyse de Niche: Fournissez une analyse détaillée de la saturation, des opportunités, et des angles de contenu pour le jeu '${game}' sur Twitch.`;
    } else if (type === 'repurpose' && channel) {
        prompt = `${lang_prompt} Repurposing de VOD: Donnez des idées de courts clips (TikTok, Shorts) et de titres accrocheurs basés sur le style de stream de l'utilisateur '${channel}'.`;
    } else if (type === 'trend') {
        prompt = `${lang_prompt} Détection de Tendance: Proposez 3 jeux ou catégories émergents sur Twitch avec un faible nombre de streamers mais un fort potentiel de croissance d'audience.`;
    } else {
        return res.status(400).json({ error: "Paramètres manquants ou type IA inconnu." });
    }

    try {
        const html_critique = await openAiClient.generateHtmlResponse(prompt); 
        res.json({ html_critique: html_critique });
    } catch (error) {
        console.error(`Erreur IA (${type}):`, error);
        res.status(500).json({ error: `Erreur interne de l'IA: ${error.message}` });
    }
});


// =================================================================
// ⚡ NOUVELLES ROUTES BOOST
// =================================================================

// 4. Demander un Boost (Ajouter à la file d'attente)
app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    if (!channel) {
        return res.status(400).json({ error: "Nom de la chaîne manquant." });
    }
    const normalizedChannel = channel.toLowerCase();

    // Vérifie si déjà dans la file d'attente
    const alreadyInQueue = boostQueue.some(b => b.channel === normalizedChannel);
    if (alreadyInQueue) {
        return res.status(409).json({ error: "Cette chaîne est déjà en file d'attente." });
    }

    // Vérifie si déjà en cours de boost
    const currentlyActive = currentBoost && currentBoost.channel === normalizedChannel;
    if (currentlyActive) {
        return res.status(409).json({ error: "Cette chaîne est déjà en cours de Boost." });
    }

    try {
        // Récupérer l'avatar pour l'affichage (Utilise le Mock ou l'implémentation réelle)
        const userData = await twitchClient.getUserData(normalizedChannel); 
        const avatar_url = userData ? userData.profile_image_url : 'https://static-cdn.jtvnw.net/jtv_user_pictures/default_profile.png'; 

        // Ajout à la file
        boostQueue.push({ channel: normalizedChannel, timestamp: Date.now(), avatar_url: avatar_url });
        
        // Tentative de traitement immédiat si la place est libre
        processBoostQueue(); 

        const position = boostQueue.findIndex(b => b.channel === normalizedChannel) + 1; // 1-based index
        
        let msg;
        if (currentBoost && currentBoost.channel === normalizedChannel) {
            msg = `Boost de ${normalizedChannel} lancé ! Durée: ${BOOST_DURATION_SECONDS / 3600} heures.`;
        } else if (currentBoost) {
             msg = `Chaîne ajoutée à la file d'attente. Position: ${position}. Durée d'attente estimée: ${(position * (BOOST_DURATION_SECONDS / 3600)).toFixed(1)} heures.`;
        } else {
             msg = `Boost de ${normalizedChannel} lancé ! Durée: ${BOOST_DURATION_SECONDS / 3600} heures.`;
        }
        
        res.json({ success: true, message: msg, position: position, current_active: currentBoost ? currentBoost.channel : null });

    } catch (error) {
        console.error("Erreur Boost:", error);
        res.status(500).json({ error: `Erreur serveur lors de la demande de boost: ${error.message}` });
    }
});

// 5. Obtenir le Statut du Boost Actif
app.get('/get_current_boost', (req, res) => {
    // Vérifie l'état de la file et met à jour currentBoost si nécessaire
    processBoostQueue(); 
    
    if (currentBoost) {
        const timeLeftMs = currentBoost.endTime - Date.now();
        const timeLeftSeconds = Math.max(0, Math.floor(timeLeftMs / 1000));
        
        if (timeLeftSeconds > 0) {
            return res.json({
                is_active: true,
                channel: currentBoost.channel,
                time_left_seconds: timeLeftSeconds,
                avatar_url: currentBoost.avatar_url,
                queue_size: boostQueue.length
            });
        }
    }
    
    // Si pas de boost actif ou si le temps est écoulé
    res.json({ is_active: false, queue_size: boostQueue.length });
});

// =================================================================
// ⚙️ DÉMARRAGE DU SERVEUR
// =================================================================

app.listen(PORT, () => {
    console.log(`Serveur Streamer Hub démarré sur http://localhost:${PORT}`);
    console.log('--- Statut de Configuration ---');
    console.log(`Client ID: ${TWITCH_CLIENT_ID !== 'VOTRE_CLIENT_ID' ? 'OK' : 'MANQUANT'}`);
    console.log(`OpenAI Key: ${OPENAI_API_KEY !== 'VOTRE_CLE_OPENAI' ? 'OK' : 'MANQUANT'}`);
});
