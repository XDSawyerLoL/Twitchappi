// --- app.js (Côté Serveur - Node.js/Express) ---

const express = require('express');
const session = require('express-session');
const path = require('path');
const axios = require('axios');
const querystring = require('querystring');
const crypto = require('crypto'); 
const admin = require("firebase-admin"); 

const app = express();
// --- Configuration des Variables d'Environnement ---
const PORT = process.env.PORT || 3000; 
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || 'VOTRE_CLIENT_ID';
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || 'VOTRE_SECRET';
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI || 'http://localhost:3000/twitch_auth_callback';

// ✅ CORRECTION IA : Utilisation de GEMINI
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'VOTRE_CLE_GEMINI'; 
const GEMINI_MODEL = "gemini-2.5-flash"; 


// =================================================================
// 🚨 CORRECTION SESSIONS 
// =================================================================

const sessionConfig = {
    secret: 'SuperSecretKeyForSession', 
    resave: false,
    saveUninitialized: true,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 * 24 // 1 jour
    } 
};

if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1) 
}

app.use(session(sessionConfig));

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// --- Variables d'État pour l'Authentification ---
let accessToken = null;
let refreshToken = null;
let twitchUser = null; 


// =================================================================
// 🚀 LOGIQUE BOOST
// =================================================================

const BOOST_DURATION_SECONDS = 6 * 60 * 60; // 6 heures
const BOOST_UPDATE_INTERVAL_MS = 10000; 

let boostQueue = []; 
let currentBoost = null; 

/**
 * Fonctions Mock/Client pour la partie Twitch (AMÉLIORÉ)
 */
const twitchClient = {
    async scanTarget(target) {
        // Logique de scan mockée AMÉLIORÉE pour simuler un résultat utilisateur détaillé ou un jeu
        console.log(`[TwitchClient] Scanning target: ${target}`);
        // Teste si la requête est probablement un jeu (contient un espace, ou est 'game')
        const isGame = target.toLowerCase().includes('game') || target.includes(' ');
        
        if (isGame) {
            return {
                type: 'Game',
                target: target,
                stats: { viewers: 5000, streams: 15, avg_rank: 5 },
                top_streamers: ['StreamerA', 'StreamerB', 'StreamerC']
            };
        } else {
            // Simule le résultat de l'utilisateur
            const displayName = target.charAt(0).toUpperCase() + target.slice(1) + 'TV';
            return {
                type: "user",
                user_data: {
                    login: target.toLowerCase(),
                    display_name: displayName,
                    followers: "2.5K",
                    total_views: "150K",
                    description: "Bonjoiiiirrrr et Bienvenue dans la communauté de la Sainte Chèvre ! Votre angle unique et votre humour sont la clé !",
                    profile_image_url: "https://static-cdn.jtvnw.net/jtv_user_pictures/c1035a7e-6bd9-49d3-b338-af9f09aa31ed-profile_image-300x300.png"
                }
            };
        }
    },
    async getUserData(login) {
        // Logique pour récupérer l'avatar
        try {
            const url = `https://api.twitch.tv/helix/users?login=${login}`;
            const res = await axios.get(url, {
                headers: {
                    'Client-ID': TWITCH_CLIENT_ID,
                    'Authorization': `Bearer ${accessToken || 'TOKEN_APPLICATION_OU_MOCK'}` 
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
    
    if (currentBoost && currentBoost.endTime > now) {
        return; 
    }

    if (currentBoost && currentBoost.endTime <= now) {
        currentBoost = null;
    }

    if (!currentBoost && boostQueue.length > 0) {
        const nextBoost = boostQueue.shift(); 
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
// 🔒 ROUTES D'AUTHENTIFICATION TWITCH (Inchangées)
// =================================================================
// ... (Routes d'authentification ici) ...
app.get('/twitch_auth_start', (req, res) => {
    const scope = 'user:read:follows'; 
    const authUrl = `https://id.twitch.tv/oauth2/authorize?${querystring.stringify({
        client_id: TWITCH_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: scope,
        force_verify: true 
    })}`;
    res.redirect(authUrl);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code } = req.query;
    if (!code) {
        return res.redirect('/?auth_error=no_code');
    }

    try {
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

app.get('/twitch_user_status', (req, res) => {
    if (twitchUser && accessToken) {
        res.json({ is_connected: true, username: twitchUser.display_name, id: twitchUser.id });
    } else {
        res.json({ is_connected: false });
    }
});

app.get('/twitch_logout', (req, res) => {
    accessToken = null;
    refreshToken = null;
    twitchUser = null;
    res.redirect('/?logout_success=true');
});

// =================================================================
// 📈 ROUTES DE DONNÉES TWITCH (Inchangées)
// =================================================================
app.get('/followed_streams', async (req, res) => {
    if (!twitchUser || !accessToken) {
        return res.status(401).json({ error: "Non connecté à Twitch." });
    }
    res.json({ error: "Logique non implémentée, utilisez le mock ou décommentez l'appel axios réel." });
});


// =================================================================
// 🎯 ROUTE SCAN (CORRIGÉE : Fonction de formatage unifiée et robuste)
// =================================================================

function formatScanResultsAsHtml(results) {
    // --- Cas 1: Résultats de type JEU ---
    if (results.type === 'Game') {
        if (!results.stats) {
            return `<p style="color:red;">Aucune donnée de statistiques valide reçue pour le jeu ${results.target || 'la cible'}.</p>`;
        }
        return `
            <h4 style="color:var(--color-secondary-blue);">Résultats du Scan : Jeu '${results.target}'</h4>
            <p><strong>Analyse du Marché (Mock):</strong></p>
            <ul>
                <li>Spectateurs Moyens Actifs: <strong>${results.stats.viewers.toLocaleString()}</strong></li>
                <li>Nombre de Streams Simultanés: <strong>${results.stats.streams}</strong></li>
                <li>Classement Moyen des 50 Premiers: <strong>${results.stats.avg_rank}</strong></li>
            </ul>
            <p>Top Streamers à Observer: ${results.top_streamers.join(', ')}</p>
            <p><em>Utilisez l'onglet 'Optimisation Niche' pour une analyse IA plus poussée de ce jeu.</em></p>
        `;
    }

    // --- Cas 2: Résultats de type UTILISATEUR (CORRIGÉ) ---
    if (results.type === 'user' && results.user_data) {
        const data = results.user_data;
        const profileImageUrl = data.profile_image_url || 'https://static-cdn.jtvnw.net/jtv_user_pictures/default_profile.png';
        
        return `
            <div style="display:flex; gap:15px; align-items:flex-start;">
                <img src="${profileImageUrl}" alt="Avatar de ${data.display_name}" 
                     style="width:80px; height:80px; border-radius:50%; border:2px solid var(--color-primary-pink); object-fit: cover;">
                <div>
                    <h4 style="color:var(--color-secondary-blue); margin-top:0;">Scan de la Chaîne : ${data.display_name}</h4>
                    <p style="font-size:14px; margin-bottom:10px;">@${data.login}</p>
                </div>
            </div>
            <p style="margin-top:15px;"><strong>Description de la Chaîne :</strong> ${data.description || 'Non fournie.'}</p>
            <ul>
                <li>Nombre d'Abonnés/Followers: <strong>${data.followers}</strong></li>
                <li>Vues Totales (Approximation): <strong>${data.total_views}</strong></li>
            </ul>
            <p><em>Utilisez l'onglet 'Repurposing IA' pour analyser les VOD de cette chaîne.</em></p>
        `;
    }

    // --- Cas 3: Aucun résultat ---
    if (results.type === 'none') {
        return `<p style="color:var(--color-text-dimmed);">${results.message || 'Aucun résultat trouvé pour votre recherche.'}</p>`;
    }

    // --- Cas d'erreur / Format inconnu ---
    return `<p style="color:red;">Format de réponse de scan inattendu.</p><pre>${JSON.stringify(results, null, 2)}</pre>`;
}

app.post('/scan_target', async (req, res) => {
    const { target } = req.body;
    if (!target) {
        return res.status(400).json({ error: "Target (Jeu ou Pseudo) manquant." });
    }

    try {
        const results = await twitchClient.scanTarget(target); 
        const html_results = formatScanResultsAsHtml(results); 
        // Renvoie l'HTML dans la clé attendue par le front
        res.json({ html_results: html_results });
    } catch (error) {
        console.error("Erreur lors du scan:", error);
        res.status(500).json({ error: `Erreur serveur lors du scan : ${error.message}` });
    }
});


// =================================================================
// ✨ ROUTE IA (Reste inchangée depuis la dernière correction du 500)
// =================================================================

/**
 * Mock du client GEMINI pour la démonstration (plus robuste)
 * @param {string} type - Le type d'analyse ('niche', 'repurpose', 'trend').
 * @param {string} target - Le jeu ou le channel.
 */
const geminiClient = {
    async generateHtmlResponse(type, target = 'N/A') {
        console.log(`[GEMINICLIENT] Mock IA pour type: ${type}, cible: ${target}...`);

        // Utilisation des couleurs de l'analyse dans le contenu mocké pour l'esthétique côté client.
        const critique = {
            'niche': `<h4>Stratégie de Niche pour ${target} (Analyse GEMINI)</h4>
                      <p>Le jeu est saturé. Les opportunités se trouvent dans les <strong>builds de vaisseaux spécifiques</strong> ou le contenu 'New Game+' tardif. Votre angle devrait être sur les '<strong>règles cachées</strong>' du jeu. Le chat aime les débats sur les factions.</p>
                      <ul>
                          <li><strong>Angle 1:</strong> Le speedrun 'pacifiste' des quêtes.</li>
                          <li><strong>Angle 2:</strong> Build de vaisseau orienté 'marchandise illégale'.</li>
                      </ul>`,
            'repurpose': `<h4>Idées de Repurposing VOD pour ${target} (Analyse GEMINI)</h4>
                          <p>Basé sur une analyse de VOD (mockée ici), le streamer est fort sur les <strong>moments de rage ou d'exploit</strong>. Concentrez-vous sur des clips courts. **Réponse en français.**</p>
                          <ul>
                              <li><strong>Clip 1 (TikTok) :</strong> "Quand le boss prend 10 secondes pour charger un PNG - Mes nerfs lâchent !"</li>
                              <li><strong>Clip 2 (Shorts) :</strong> "1v5 Clutch in Warzone: le dernier kill est INSANE"</li>
                              <li><strong>Titre Suggestion :</strong> "MES NERFS LÂCHENT SUR CE JEU"</li>
                          </ul>`,
            'trend': `<h4>Top 3 Tendances Émergentes (Détection GEMINI)</h4>
                      <p>Ces jeux montrent une croissance rapide avec un faible nombre de streamers francophones :</p>
                      <ul>
                          <li><strong>1. Palworld :</strong> Fort intérêt global. Positionnez-vous sur les guides de "late game".</li>
                          <li><strong>2. Hell Divers 2 :</strong> Excellent pour le contenu coopératif. Misez sur le côté 'cinématique' des explosions.</li>
                          <li><strong>3. Lethal Company (Update) :</strong> Toujours populaire, créez des moments de peur extrêmes pour TikTok.</li>
                      </ul>`
        };

        if (critique[type]) {
            return critique[type]; 
        }

        throw new Error(`Erreur de simulation IA (Gemini). Le type d'analyse '${type}' est inconnu.`); 
    }
};


app.post('/critique_ia', async (req, res) => {
    const { game, channel, type } = req.body;
    
    // Langue requise par l'IA (pour référence future)
    const lang_prompt = "Répondez uniquement en français. Utilisez des titres (h4) et des listes (ul) pour structurer votre réponse pour l'affichage HTML, en utilisant les tags forts (<strong>) pour mettre en évidence les points clés.";

    let target = '';
    let prompt = '';

    if (type === 'niche' && game) {
        target = game;
        prompt = `${lang_prompt} Analyse de Niche: Fournissez une analyse détaillée de la saturation, des opportunités, et des angles de contenu pour le jeu '${game}' sur Twitch.`;
    } else if (type === 'repurpose' && channel) {
        target = channel;
        prompt = `${lang_prompt} Repurposing de VOD: Donnez des idées de courts clips (TikTok, Shorts) et de titres accrocheurs basés sur le style de stream de l'utilisateur '${channel}'.`;
    } else if (type === 'trend') {
        target = 'Global';
        prompt = `${lang_prompt} Détection de Tendance: Proposez 3 jeux ou catégories émergents sur Twitch avec un faible nombre de streamers mais un fort potentiel de croissance d'audience.`;
    } else {
        // Renvoie 400 si les paramètres sont manquants
        return res.status(400).json({ error: "Paramètres manquants ou type IA inconnu pour l'analyse." });
    }

    try {
        const html_critique = await geminiClient.generateHtmlResponse(type, target); 
        res.json({ html_critique: html_critique });
    } catch (error) {
        console.error(`Erreur IA (${type}):`, error);
        res.status(500).json({ error: `Erreur interne de l'IA (Gemini): ${error.message}` });
    }
});


// =================================================================
// ⚡ ROUTES BOOST (Inchangées)
// =================================================================
// ... (Routes Boost ici) ...
app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    if (!channel) {
        return res.status(400).json({ error: "Nom de la chaîne manquant." });
    }
    const normalizedChannel = channel.toLowerCase();

    const alreadyInQueue = boostQueue.some(b => b.channel === normalizedChannel);
    if (alreadyInQueue) {
        return res.status(409).json({ error: "Cette chaîne est déjà en file d'attente." });
    }

    const currentlyActive = currentBoost && currentBoost.channel === normalizedChannel;
    if (currentlyActive) {
        return res.status(409).json({ error: "Cette chaîne est déjà en cours de Boost." });
    }

    try {
        const userData = await twitchClient.getUserData(normalizedChannel); 
        const avatar_url = userData.profile_image_url; 

        boostQueue.push({ channel: normalizedChannel, timestamp: Date.now(), avatar_url: avatar_url });
        
        processBoostQueue(); 

        const position = boostQueue.findIndex(b => b.channel === normalizedChannel) + 1; 
        
        let msg;
        if (currentBoost && currentBoost.channel === normalizedChannel) {
            msg = `Boost de ${normalizedChannel} lancé ! Durée: ${BOOST_DURATION_SECONDS / 3600} heures.`;
        } else if (currentBoost) {
             msg = `Chaîne ajoutée à la file d'attente. Position: ${position}. Attendez la fin de ${currentBoost.channel}.`;
        } else {
             msg = `Boost de ${normalizedChannel} lancé ! Durée: ${BOOST_DURATION_SECONDS / 3600} heures.`;
        }
        
        res.json({ success: true, message: msg, position: position, current_active: currentBoost ? currentBoost.channel : null });

    } catch (error) {
        console.error("Erreur Boost:", error);
        res.status(500).json({ error: `Erreur serveur lors de la demande de boost: ${error.message}` });
    }
});

app.get('/get_current_boost', (req, res) => {
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
    
    res.json({ is_active: false, queue_size: boostQueue.length });
});

// =================================================================
// 🏡 ROUTE RACINE
// =================================================================

app.get('/', (req, res) => {
    const htmlFileName = 'NicheOptimizer.html';
    
    res.sendFile(path.join(__dirname, htmlFileName), (err) => {
        if (err) {
            console.error(`Erreur lors de l'envoi du fichier ${htmlFileName}:`, err);
            res.status(500).send(`Erreur serveur: Impossible de charger le fichier ${htmlFileName}.`);
        }
    });
});


// =================================================================
// ⚙️ DÉMARRAGE DU SERVEUR
// =================================================================

app.listen(PORT, () => {
    console.log(`Serveur Streamer Hub démarré sur http://localhost:${PORT}`);
    console.log('--- Statut de Configuration ---');
    console.log(`Client ID: ${TWITCH_CLIENT_ID !== 'VOTRE_CLIENT_ID' ? 'OK' : 'MANQUANT'}`);
    console.log(`Gemini Key: ${GEMINI_API_KEY !== 'VOTRE_CLE_GEMINI' ? 'OK' : 'MANQUANT'}`);
});






