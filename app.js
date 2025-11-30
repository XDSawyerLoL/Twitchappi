const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // Nécessite l'installation de node-fetch@2
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

// Assurez-vous que le package @google/genai est installé (npm install @google/genai)
const { GoogleGenAI } = require('@google/genai'); 

const app = express();

// =========================================================
// --- CONFIGURATION ET VARIABLES D'ENVIRONNEMENT ---
// =========================================================

const PORT = process.env.PORT || 10000;
// Remplacez les valeurs par défaut si vous n'utilisez pas de fichier .env
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || 'VOTRE_CLIENT_ID';
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || 'VOTRE_SECRET';
// Assurez-vous que cette REDIRECT_URI correspond exactement à celle configurée sur Twitch
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI || 'http://localhost:10000/twitch_auth_callback'; 

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash"; 

let ai = null;
if (GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY }); 
}

// =========================================================
// --- MIDDLEWARE ET CONFIGURATION GLOBALE ---
// =========================================================

app.use(cors({
    origin: '*', // À modifier pour un domaine spécifique en production
    credentials: true,
}));
app.use(bodyParser.json());
// Middleware essentiel pour lire les cookies, y compris le jeton 'state'
app.use(cookieParser()); 

// Cache pour stocker les jetons et les données (simple, pas persistant)
const CACHE = {
    // Clé: Twitch ID, Valeur: { accessToken, refreshToken, expiresAt, username, twitchId }
    sessions: {}, 
    // Clé: Channel Name, Valeur: Timestamp du dernier boost
    streamBoosts: {}, 
};

// =========================================================
// --- AUTHENTIFICATION TWITCH (FIX CSRF) ---
// =========================================================

// Étape 1: Démarrer le flux d'authentification
app.get('/twitch_auth_start', (req, res) => {
    // 1. Générer un jeton d'état unique pour la protection CSRF
    const state = crypto.randomBytes(16).toString('hex');
    
    // 2. Stocker le jeton 'state' dans un cookie HttpOnly et sécurisé
    // HttpOnly empêche l'accès via JavaScript, améliorant la sécurité.
    // Secure doit être true si vous êtes en HTTPS (recommandé pour Render/Prod).
    // Samesite est important pour les cookies modernes.
    const cookieOptions = {
        httpOnly: true,
        // En mode développement (localhost), vous pourriez devoir mettre Secure: false
        // En production (Render), Secure: true est indispensable
        secure: process.env.NODE_ENV === 'production' || REDIRECT_URI.startsWith('https'), 
        maxAge: 3600000, // 1 heure
        sameSite: 'Lax',
    };
    
    res.cookie('twitch_auth_state', state, cookieOptions);

    // 3. Rediriger l'utilisateur vers Twitch pour l'autorisation
    const scopes = [
        'user:read:follows',       // Lire les chaînes suivies
        'user:read:email',         // Lire l'email (pour l'identification)
        'channel:read:subscriptions', // Lire les abonnements (exemple)
    ];

    const authUrl = `https://id.twitch.tv/oauth2/authorize` +
        `?client_id=${TWITCH_CLIENT_ID}` +
        `&redirect_uri=${REDIRECT_URI}` +
        `&response_type=code` +
        `&scope=${scopes.join(' ')}` +
        `&state=${state}`;

    res.redirect(authUrl);
});


// Étape 2: Gestion du rappel (Callback) après autorisation
app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error, error_description } = req.query;

    // 1. **FIX CSRF:** Récupérer le jeton 'state' du cookie
    const storedState = req.cookies.twitch_auth_state;

    // Supprimer le cookie 'state' immédiatement après l'avoir lu, qu'il corresponde ou non
    res.clearCookie('twitch_auth_state'); 
    
    // 2. **FIX CSRF:** Vérifier si les jetons 'state' correspondent
    if (!storedState || storedState !== state) {
        // En cas de mismatch, refuser l'accès.
        const errorMessage = 'Erreur CSRF: Les états ne correspondent pas ou le cookie est manquant. Cela peut indiquer une tentative d\'attaque ou un problème de configuration des cookies.';
        console.error('CSRF State Mismatch:', { stored: storedState, received: state, error: error_description });
        return res.status(403).send(`
            <script>
                // Affiche l'erreur dans la console du parent et ferme la fenêtre
                window.opener.console.error("Erreur d'Authentification Twitch:", "${errorMessage}");
                window.opener.alert("Erreur d'Authentification : Les états ne correspondent pas. Veuillez réessayer.");
                window.close();
            </script>
        `);
    }

    if (error) {
        return res.send(`
            <script>
                window.opener.console.error("Erreur d'Authentification Twitch:", "${error_description}");
                window.opener.alert("Erreur d'Authentification Twitch: ${error_description}");
                window.close();
            </script>
        `);
    }

    if (!code) {
        return res.send(`
            <script>
                window.opener.console.error("Erreur d'Authentification Twitch: Code manquant.");
                window.opener.alert("Erreur d'Authentification Twitch: Code manquant.");
                window.close();
            </script>
        `);
    }

    // 3. Échanger le code contre un jeton d'accès
    try {
        const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: TWITCH_CLIENT_ID,
                client_secret: TWITCH_CLIENT_SECRET,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: REDIRECT_URI,
            }),
        });

        const tokenData = await tokenRes.json();

        if (tokenData.access_token) {
            // 4. Valider et stocker la session
            const user = await getTwitchUserInfo(tokenData.access_token, TWITCH_CLIENT_ID);
            
            if (user) {
                // Créer une session dans le cache
                CACHE.sessions[user.id] = {
                    accessToken: tokenData.access_token,
                    refreshToken: tokenData.refresh_token,
                    expiresAt: Date.now() + (tokenData.expires_in * 1000),
                    username: user.display_name,
                    twitchId: user.id
                };

                // Établir le cookie de session (le vrai)
                // Le cookie de session est NON-HttpOnly pour que le frontend puisse vérifier la présence (même si l'ID est obscurci ou chiffré)
                // Pour la simplicité ici, on utilise juste un drapeau pour indiquer l'état
                res.cookie('twitch_session_id', user.id, {
                    secure: process.env.NODE_ENV === 'production' || REDIRECT_URI.startsWith('https'), 
                    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 jours
                    sameSite: 'Lax',
                    // Note: httpOnly: false pour permettre au frontend de savoir qu'une session existe
                });


                // 5. Fermer la fenêtre pop-up et demander au parent de rafraîchir
                res.send(`
                    <script>
                        window.opener.checkAuth();
                        window.close();
                    </script>
                `);
            } else {
                 res.send(`
                    <script>
                        window.opener.alert("Erreur d'Authentification: Impossible de récupérer les informations utilisateur de Twitch.");
                        window.close();
                    </script>
                `);
            }
        } else {
            res.send(`
                <script>
                    window.opener.console.error("Erreur d'Authentification Twitch:", ${JSON.stringify(tokenData)});
                    window.opener.alert("Erreur d'Authentification Twitch: ${tokenData.message || 'Échange de code échoué.'}");
                    window.close();
                </script>
            `);
        }

    } catch (e) {
        console.error("Erreur lors de l'échange du jeton:", e);
        res.status(500).send(`
            <script>
                window.opener.alert("Erreur serveur lors de l'authentification. Veuillez consulter la console du backend.");
                window.close();
            </script>
        `);
    }
});

// Helper pour obtenir les infos utilisateur
async function getTwitchUserInfo(accessToken, clientId) {
    try {
        const userRes = await fetch('https://api.twitch.tv/helix/users', {
            headers: {
                'Client-ID': clientId,
                'Authorization': `Bearer ${accessToken}`
            }
        });
        const userData = await userRes.json();
        if (userData.data && userData.data.length > 0) {
            return userData.data[0];
        }
        return null;
    } catch (e) {
        console.error("Erreur lors de la récupération des informations utilisateur:", e);
        return null;
    }
}

// Fonction utilitaire pour récupérer la session de l'utilisateur actuel
function getSession(req) {
    const userId = req.cookies.twitch_session_id;
    if (userId && CACHE.sessions[userId]) {
        // Logique de rafraîchissement du jeton peut être ajoutée ici
        return CACHE.sessions[userId];
    }
    return null;
}

// =========================================================
// --- ROUTES API EXISTANTES (AJOUT DE LA VÉRIFICATION DE SESSION) ---
// =========================================================

// Statut de connexion
app.get('/twitch_user_status', (req, res) => {
    const session = getSession(req);
    if (session) {
        res.json({ 
            is_connected: true, 
            username: session.username 
        });
    } else {
        res.json({ is_connected: false });
    }
});

// Déconnexion
app.get('/twitch_logout', (req, res) => {
    const userId = req.cookies.twitch_session_id;
    if (userId) {
        // Supprimer du cache
        delete CACHE.sessions[userId];
        // Supprimer le cookie de session
        res.clearCookie('twitch_session_id');
    }
    res.json({ success: true, message: "Déconnexion réussie." });
});


// Récupération des streams suivis
app.get('/followed_streams', async (req, res) => {
    const session = getSession(req);
    if (!session) {
        return res.status(401).json({ error: "Non authentifié." });
    }

    try {
        const followRes = await fetch(`https://api.twitch.tv/helix/streams/followed?user_id=${session.twitchId}`, {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${session.accessToken}`
            }
        });

        const followData = await followRes.json();
        
        if (followData.data) {
            return res.json(followData);
        } else {
            console.error("Erreur Twitch API pour streams/followed:", followData);
            return res.status(500).json({ error: "Erreur lors de la récupération des streams.", details: followData.message });
        }

    } catch (e) {
        console.error("Erreur réseau/générique lors de la récupération des streams:", e);
        res.status(500).json({ error: "Erreur serveur interne." });
    }
});

// Route factice pour le scan de cible (Streamer/Jeu)
app.post('/scan_target', async (req, res) => {
    // Le code de cette route est une simulation ou nécessite la connexion à la base de données Twitch Helix
    // Pour l'exemple, nous allons simuler une réponse
    const { query } = req.body;
    
    // Simulation simple pour la démonstration
    if (query.toLowerCase() === 'zerator') {
        const userData = {
             type: 'user',
             user_data: {
                display_name: 'ZeratoR',
                profile_image_url: 'https://placehold.co/100x100/9933ff/white?text=Z',
                is_live: true,
                followers: 1700000,
                anciennete: '12 ans',
                description: 'Le streamer le plus suivi en France.',
                stream_details: { title: 'Zevent 2025: préparation de l\'événement', game_name: 'Just Chatting', viewer_count: 55000 },
                last_games: ['Just Chatting', 'Elden Ring', 'Trackmania'],
                last_vods: [
                    { title: 'Rediffusion Zevent Day 1', url: '#', thumbnail_url: 'https://placehold.co/150x85/9933ff/white?text=VOD1' },
                    { title: 'Trackmania World Record Tentative', url: '#', thumbnail_url: 'https://placehold.co/150x85/9933ff/white?text=VOD2' }
                ],
                suggested_channels: [
                    { name: 'Squeezie', viewers: 40000, title: 'Live de fin de semaine' },
                    { name: 'Kameto', viewers: 30000, title: 'League of Legends Pro' }
                ]
            }
        };
        return res.json(userData);
    } else if (query.toLowerCase() === 'elden ring') {
         const gameData = {
            type: 'game',
            game_data: {
                name: 'Elden Ring',
                box_art_url: 'https://placehold.co/64x85/ffcc00/gray?text=ER',
                total_streamers: 450,
                total_viewers: 90000,
                streams: [
                    { user_name: 'StreamerA', title: 'Speedrun sous les 5h !', user_login: 'streamera', viewer_count: 15000 },
                    { user_name: 'StreamerB', title: 'Nouveau joueur, découverte', user_login: 'streamerb', viewer_count: 5000 }
                ]
            }
        };
        return res.json(gameData);
    } else {
        return res.json({ type: 'none', message: `Aucun utilisateur ou jeu trouvé pour "${query}".` });
    }
});


// Route factice pour le Stream Boost
const BOOST_COOLDOWN = 3 * 60 * 60 * 1000; // 3 heures
app.post('/stream_boost', (req, res) => {
    const { channel } = req.body;
    const now = Date.now();
    const lastBoost = CACHE.streamBoosts[channel];

    // Vérifier le cooldown
    if (lastBoost && (now - lastBoost) < BOOST_COOLDOWN) {
        const remainingTime = lastBoost + BOOST_COOLDOWN - now;
        const remainingMinutes = Math.ceil(remainingTime / (60 * 1000));
        const errorMessage = `
            <p style="color:red; font-weight:bold;">
                ❌ Cooldown Actif
            </p>
            <p>
                Le dernier boost a été activé récemment. Vous devez attendre encore <strong>${remainingMinutes} minutes</strong> avant de booster à nouveau <strong>${channel}</strong>.
            </p>
        `;
        return res.json({ 
            success: false, 
            html_response: errorMessage 
        });
    }

    CACHE.streamBoosts[channel] = now;

    const successMessage = `
        <p style="color:var(--color-primary-pink); font-weight:bold;">
            ✅ Boost de Stream Activé !
        </p>
        <p>
            La chaîne <strong>${channel}</strong> a été ajoutée à la rotation prioritaire pour une période de 10 minutes. 
            Le prochain boost sera disponible dans 3 heures. Bonne chance !
        </p>
    `;

    return res.json({ 
        success: true, 
        html_response: successMessage 
    });
});


// Route d'analyse IA (Niche, Repurpose, Trend)
app.post('/critique_ia', async (req, res) => {
    // Si l'IA n'est pas initialisée (API Key manquante), simuler la réponse
    if (!ai) {
         const { type, query } = req.body;
         const title = type === 'niche' ? `Analyse Sim. pour ${query}` : (type === 'repurpose' ? `Strat. Sim. pour ${query}` : 'Tendances Sim.');
         const color = type === 'niche' ? '#59d682' : (type === 'repurpose' ? '#9933ff' : '#ffcc00');
         
         const htmlCritique = `
            <h4 style="border-bottom-color: ${color};">${title}</h4>
            <p class="text-yellow-500 font-semibold">
                ⚠️ Simulation : La clé API Gemini est manquante.
            </p>
            <p>
                <strong>Points clés:</strong>
                <ul>
                    <li>(Sim.) Potentiel: Élevé.</li>
                    <li>(Sim.) Mots-clés: Streamer, Niche, Gaming.</li>
                    <li>(Sim.) Suggestion: Créez plus de contenu court sur TikTok.</li>
                </ul>
            </p>
            <p>
                Pour obtenir une critique IA réelle et détaillée, veuillez configurer la variable d'environnement 
                <code>GEMINI_API_KEY</code> dans votre service Render.
            </p>
         `;
         return res.json({ html_critique: htmlCritique });
    }
    
    const { type, query } = req.body;
    let userPrompt = '';
    let systemPrompt = "Vous êtes un expert en marketing et en croissance de chaînes Twitch. Votre objectif est de fournir une critique constructive et actionnable en Français.";
    
    switch(type) {
        case 'niche':
            systemPrompt += " Vous analysez le potentiel d'un jeu/niche. Fournissez un résumé en 3 points et des mots-clés SEO pour la catégorie.";
            userPrompt = `Analyse de niche pour le jeu : ${query}. Évaluez la concurrence, le potentiel de croissance pour un nouveau streamer, et proposez 5 mots-clés SEO Twitch/YouTube pour le titre du stream/vidéo.`;
            break;
        case 'repurpose':
            systemPrompt += " Vous analysez la stratégie de réutilisation de contenu. Fournissez des conseils pour transformer les VODs en clips TikTok et shorts YouTube.";
            userPrompt = `Générez une stratégie de repurposing de contenu (TikTok/Shorts) pour un streamer qui joue au jeu/a un contenu sur: ${query}. Identifiez 3 angles de clips viraux et un titre d'appel pour chacun.`;
            break;
        case 'trend':
            systemPrompt += " Vous êtes un détecteur de tendances. Votre mission est de proposer des concepts de streaming sous-exploités ou en croissance. Fournissez 3 idées de contenu ou jeux émergents avec leur public cible.";
            // Utiliser Google Search Grounding ici pour obtenir des tendances réelles
            userPrompt = "Détectez les 3 tendances de jeu/contenu les plus prometteuses sur Twitch en ce moment pour un streamer débutant cherchant une niche peu saturée. Incluez l'audience cible pour chaque idée.";
            break;
        default:
            return res.status(400).json({ error: "Type de critique IA non valide." });
    }
    
    try {
        const result = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ parts: [{ text: userPrompt }] }],
            // Active le Google Search Grounding uniquement pour la détection de tendance
            tools: type === 'trend' ? [{ googleSearch: {} }] : undefined,
            systemInstruction: { parts: [{ text: systemPrompt }] },
        });

        const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "L'IA n'a pas pu générer de contenu. Veuillez réessayer.";
        
        // Convertir le texte en HTML stylisé (simple conversion pour garder le style)
        const htmlCritique = `
            <h4 style="border-bottom-color: ${type === 'niche' ? '#59d682' : (type === 'repurpose' ? '#9933ff' : '#ffcc00')};">${type === 'niche' ? 'Critique de Niche' : (type === 'repurpose' ? 'Stratégie Repurpose' : 'Tendances Émergentes')}</h4>
            ${text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')}
        `;

        res.json({ html_critique: htmlCritique });

    } catch (e) {
        console.error("Erreur Gemini API:", e.message);
        res.status(500).json({ error: `Erreur de communication avec Gemini: ${e.message}` });
    }
});


// =========================================================
// Configuration des Routes Statiques
// =========================================================

// Route racine - sert le NicheOptimizer
app.get('/', (req, res) => {
    // Note: Assurez-vous que le nom du fichier est correct dans le dossier du serveur
    res.sendFile(path.join(__dirname, 'NicheOptimizer (3).html'));
});

// Route explicite pour NicheOptimizer.html
app.get('/NicheOptimizer.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer (3).html'));
});

// Routes pour les autres fichiers HTML (si le projet les utilise)
app.get('/lucky_streamer_picker.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'lucky_streamer_picker.html'));
});

app.get('/sniper_tool.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'sniper_tool.html'));
});

// =========================================================
// Démarrage du Serveur
// =========================================================

app.listen(PORT, () => {
    console.log(`Serveur Streamer Hub démarré sur le port ${PORT}`);
    console.log(`URL de Redirection Twitch: ${REDIRECT_URI}`);
});
