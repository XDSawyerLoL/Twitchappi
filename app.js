// --- app.js (Côté Serveur - Node.js/Express) ---

const express = require('express');
const session = require('express-session');
const path = require('path');
const axios = require('axios');
const querystring = require('querystring');
const crypto = require('crypto'); 
const { GoogleGenAI } = require('@google/genai'); // <-- NOUVELLE LIBRAIRIE REQUISE

const app = express();
// --- Configuration des Variables d'Environnement ---
const PORT = process.env.PORT || 3000; 
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || 'VOTRE_CLIENT_ID';
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || 'VOTRE_SECRET';
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI || 'http://localhost:3000/twitch_auth_callback';

// Configuration Gemini
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'VOTRE_CLE_GEMINI'; 
const GEMINI_MODEL = "gemini-2.5-flash"; 


// =================================================================
// 🤖 INITIALISATION DU CLIENT IA RÉEL
// =================================================================

let ai;
if (GEMINI_API_KEY && GEMINI_API_KEY !== 'VOTRE_CLE_GEMINI') {
    ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    console.log("INFO: Client GoogleGenAI initialisé avec succès. L'IA est ACTIVE.");
} else {
    // Si la clé manque, le mode MOCK sera utilisé
    console.error("ATTENTION: Clé GEMINI_API_KEY manquante ou non valide. L'IA utilisera le mode MOCK pour les réponses.");
}


// =================================================================
// 🚨 CONFIGURATION SESSIONS (Inchangée)
// =================================================================

const sessionConfig = {
    secret: 'SuperSecretKeyForSession', 
    resave: false,
    saveUninitialized: true,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 * 24 
    } 
};

if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1) 
}

app.use(session(sessionConfig));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// --- Variables d'État pour l'Authentification ---
let accessToken = null;
let refreshToken = null;
let twitchUser = null; 


// =================================================================
// 🚀 LOGIQUE BOOST & TWITCH CLIENT MOCK (Inchangées)
// =================================================================
const BOOST_DURATION_SECONDS = 6 * 60 * 60; 
const BOOST_UPDATE_INTERVAL_MS = 10000; 
let boostQueue = []; 
let currentBoost = null; 

const twitchClient = {
    // ... (Logique de scanTarget et getUserData inchangée) ...
    async scanTarget(target) {
        const isGame = target.toLowerCase().includes('game') || target.includes(' ');
        
        if (isGame) {
            return {
                type: 'Game',
                target: target,
                stats: { viewers: 5000, streams: 15, avg_rank: 5 },
                top_streamers: ['StreamerA', 'StreamerB', 'StreamerC']
            };
        } else {
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

function processBoostQueue() {
    const now = Date.now();
    if (currentBoost && currentBoost.endTime > now) { return; }
    if (currentBoost && currentBoost.endTime <= now) { currentBoost = null; }
    if (!currentBoost && boostQueue.length > 0) {
        const nextBoost = boostQueue.shift(); 
        currentBoost = { channel: nextBoost.channel, startTime: now, endTime: now + BOOST_DURATION_SECONDS * 1000, avatar_url: nextBoost.avatar_url };
        console.log(`[BOOST] Nouveau boost actif: ${currentBoost.channel}`);
    }
}
setInterval(processBoostQueue, BOOST_UPDATE_INTERVAL_MS);

// ... (Routes d'authentification inchangées) ...

// =================================================================
// 📈 ROUTES DE DONNÉES TWITCH (Inchangées)
// =================================================================

app.get('/followed_streams', async (req, res) => {
    if (!twitchUser || !accessToken) {
        return res.status(401).json({ error: "Non connecté à Twitch." });
    }
    
    // Mock de données de streams suivis avec URLs de miniatures valides (placeholders)
    const mockStreams = [
        {
            id: '1', user_name: 'AlphastreamerTV', viewer_count: 850, game_name: 'Elden Ring', 
            title: "RUN 100% SANS MOURIR - Nouvelle stratégie !",
            thumbnail_url: 'https://placehold.co/320x180/ff0099/white.png?text=Elden+Ring',
            profile_image_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/default_profile.png'
        },
        {
            id: '2', user_name: 'BetaGamingFR', viewer_count: 210, game_name: 'Valorant', 
            title: "RANKED IMMORTEL: On tryhard le dernier palier !",
            thumbnail_url: 'https://placehold.co/320x180/22c7ef/black.png?text=Valorant',
            profile_image_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/default_profile.png'
        },
        {
            id: '3', user_name: 'StreamerXYZ', viewer_count: 55, game_name: 'Just Chatting', 
            title: "DEBRIEF SEMAINE : Vos clips préférés et Q&A",
            thumbnail_url: 'https://placehold.co/320x180/9aa3a8/black.png?text=Just+Chatting',
            profile_image_url: 'https://placehold.co/60x60/9aa3a8/black.png?text=SC'
        }
    ];

    res.json({ data: mockStreams });
});

// ... (Route /scan_target inchangée) ...
function formatScanResultsAsHtml(results) {
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

    if (results.type === 'none') {
        return `<p style="color:var(--color-text-dimmed);">${results.message || 'Aucun résultat trouvé pour votre recherche.'}</p>`;
    }

    return `<p style="color:red;">Format de réponse de scan inattendu.</p>`;
}

app.post('/scan_target', async (req, res) => {
    const { target } = req.body;
    if (!target) {
        return res.status(400).json({ error: "Target (Jeu ou Pseudo) manquant." });
    }

    try {
        const results = await twitchClient.scanTarget(target); 
        const html_results = formatScanResultsAsHtml(results); 
        res.json({ html_results: html_results });
    } catch (error) {
        console.error("Erreur lors du scan:", error);
        res.status(500).json({ error: `Erreur serveur lors du scan : ${error.message}` });
    }
});


// =================================================================
// 🧠 CLIENT IA (MOCK AVEC FALLBACK)
// =================================================================

const geminiClient = {
    // Fonction qui appelle réellement Gemini ou utilise le mock
    async generateHtmlResponse(type, target, prompt) {
        // --- VRAI APPEL ---
        if (ai) {
            console.log(`[GEMINI RÉEL] Appel IA pour type: ${type}, cible: ${target}...`);
            try {
                const response = await ai.models.generateContent({
                    model: GEMINI_MODEL,
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                });
                // On suppose que le prompt demande du HTML structuré
                return response.text; 

            } catch (error) {
                console.error(`Erreur RÉEELLE lors de l'appel à Gemini (${type}):`, error);
                // Fallback au Mock en cas d'erreur API
                return this.generateMockResponse(type, target, '(Erreur API - Affichage du Mock)');
            }
        } 
        
        // --- APPEL MOCK ---
        console.log(`[GEMINI MOCK] Utilisation du mock pour type: ${type}, cible: ${target}...`);
        return this.generateMockResponse(type, target);
    },
    
    // Contenu des Mocks Enrichis (Utilisé comme Fallback)
    generateMockResponse(type, target = 'N/A', suffix = '(MOCK)') {
        // Le contenu des Mocks Enrichis que j'ai fourni dans la réponse précédente
        const critique = {
            'niche': `
                      <h4>💎 Analyse Niche Avancée pour ${target} ${suffix}</h4>
                      <p>L'IA a identifié une **saturation forte** sur les créneaux horaires habituels. Pour percer, vous devez viser le **micro-marché des 'builds spécifiques' ou les défis auto-imposés**.</p>
                      
                      <div style="margin-top:15px; border-top: 1px dashed #333; padding-top: 10px;">
                        <h5 style="color:var(--color-ai-niche); margin-top:0; font-family:'Inter',sans-serif;">Stratégie Recommandée : "L'Expert Obscur"</h5>
                        <ul>
                            <li><strong>Focus Niche (Titre) :</strong> « ${target} : Le Guide des Donjons Oubliés (100% de Taux de Drop) »</li>
                            <li><strong>Moment clé (Clip) :</strong> Les **"Théories folles"** sur l'histoire du jeu. Le chat adore débattre des mystères.</li>
                            <li><strong>Horaire d'Or :</strong> Entre 23h et 1h du matin. La concurrence est 40% plus faible.</li>
                        </ul>
                      </div>
                      <p class="small-muted" style="margin-top:15px;">Évitez de streamer les quêtes principales, le public est déjà saturé par les gros streamers.</p>
                      `,
            'repurpose': `
                          <h4>✂️ Plan de Repurposing VOD pour ${target} ${suffix}</h4>
                          <p>L'IA a analysé le style de votre chaîne (Mock) : **humour absurde et réactions extrêmes**. Votre avantage est votre capacité à rendre l'échec divertissant. Chaque "fail" est une opportunité de clip.</p>
                          
                          <div style="margin-top:15px; border-top: 1px dashed #333; padding-top: 10px;">
                            <h5 style="color:var(--color-ai-repurpose); margin-top:0; font-family:'Inter',sans-serif;">Top 3 Idées de Contenu Court (TikTok/Shorts)</h5>
                            <ul>
                                <li><strong>Clip #1 (Format 30s) :</strong> **Le Moment WTF.** Trouvez le segment où l'IA détecte la plus forte augmentation de mots en majuscules ou d'emojis de rage. **Titre :** "J'AI JETÉ MON CLAVIER APRÈS ÇA (Clip Brut)"</li>
                                <li><strong>Clip #2 (Format 60s) :</strong> **Le Fait Éducatif Trompeur.** Prenez 5 secondes de gameplay intense, puis 55 secondes d'explication totalement fausse mais sérieuse du bug/mécanique. **Titre :** "LA VRAIE RAISON pour laquelle ce boss est pété"</li>
                                <li><strong>Titre YouTube Long :</strong> « ${target} - J'ai suivi les règles du CHAT pendant 1 heure et c'est le BORDEL » (Mots clés: challenge, fail, réaction).</li>
                            </ul>
                          </div>
                          `,
            'trend': `
                      <h4>💰 Les 3 Tendances "Gold" : Forte Croissance / Faible Concurrence ${suffix}</h4>
                      <p>L'IA a scanné le marché francophone pour les signaux faibles, mais porteurs. Positionnez-vous sur ces jeux <strong>avant qu'ils n'atteignent le pic de hype</strong>.</p>
                      
                      <ul>
                          <li><strong>1. Deep Rock Galactic: Survivor (Niche "Lofi") :</strong> 
                            <span style="font-size:12px; color:var(--color-text-dimmed);">Faible concurrence (< 5 FR streams). Forte rétention.</span>
                            <strong>Angle :</strong> Stream en fond sonore relaxant, style "mineur spatial lofi".
                          </li>
                          <li><strong>2. V Rising (Post-Update, Hype de Retour) :</strong> 
                            <span style="font-size:12px; color:var(--color-text-dimmed);">Concurrence modérée mais en baisse.</span>
                            <strong>Angle :</strong> Le Guide Ultime du Château Souterrain : construction anti-raid.
                          </li>
                          <li><strong>3. Les jeux de type "Social Deduction" Inconnus :</strong> 
                            <span style="font-size:12px; color:var(--color-text-dimmed);">Le public cherche une alternative à Among Us/Goose Goose Duck.</span>
                            <strong>Angle :</strong> Découverte et tutoriel des règles simples pour un jeu obscur comme "Treachery in Beatdown City".
                          </li>
                      </ul>
                      `
        };
        if (critique[type]) { return critique[type]; }
        // Fallback pour le mini-assistant si on est en mode mock
        return `🤖 Analyse Rapide (Gemini Mock) : Votre question : "${target.substring(0, 70).trim()}...". Conseil : Interagissez avec votre chat.`;
    }
};

// =================================================================
// ✨ ROUTE CRITIQUE IA (Mise à jour pour l'appel réel)
// =================================================================

app.post('/critique_ia', async (req, res) => {
    const { game, channel, type } = req.body;
    
    const lang_prompt = "Répondez uniquement en français. Utilisez des titres (h4) et des listes (ul) pour structurer votre réponse pour l'affichage HTML, en utilisant les tags forts (<strong>) pour mettre en évidence les points clés.";

    let target = game || channel || 'Global';
    let prompt = '';

    if (type === 'niche' && game) {
        prompt = `${lang_prompt} Analyse de Niche: Fournissez une analyse détaillée de la saturation, des opportunités, et des angles de contenu originaux pour le jeu '${game}' sur Twitch.`;
    } else if (type === 'repurpose' && channel) {
        prompt = `${lang_prompt} Repurposing de VOD: Donnez 3 idées de courts clips (TikTok, Shorts) et de titres accrocheurs basés sur le style de stream de l'utilisateur '${channel}'. Concentrez-vous sur l'humour, l'exploit ou l'échec.`;
    } else if (type === 'trend') {
        prompt = `${lang_prompt} Détection de Tendance: Proposez 3 jeux ou catégories émergents sur Twitch avec un faible nombre de streamers francophones mais un fort potentiel de croissance d'audience. Justifiez l'angle de contenu pour chacun.`;
    } else {
        return res.status(400).json({ error: "Paramètres manquants ou type IA inconnu pour l'analyse." });
    }

    try {
        // Appel au client réel/mock
        const html_critique = await geminiClient.generateHtmlResponse(type, target, prompt); 
        res.json({ html_critique: html_critique });
    } catch (error) {
        console.error(`Erreur IA (${type}):`, error);
        res.status(500).json({ error: `Erreur interne du serveur lors de l'appel IA: ${error.message}` });
    }
});


// =================================================================
// 🤖 ROUTE MINI ASSISTANT IA (Mise à jour pour l'appel réel)
// =================================================================

app.post('/mini_assistant', async (req, res) => {
    const { q } = req.body;
    if (!q) {
        return res.status(400).json({ error: "Question manquante." });
    }

    const assistantPrompt = `Répondez uniquement en français. Vous êtes un assistant d'optimisation de streaming. Répondez de manière concise, professionnelle, et avec des conseils pratiques à la question suivante : ${q}. Utilisez des balises HTML (<strong>, <p>, <ul>) pour structurer votre réponse.`;

    try {
        // Appel au client réel/mock (le target est la question pour le mock fallback)
        const answer = await geminiClient.generateHtmlResponse('assistant', q, assistantPrompt); 
        res.json({ answer: answer });
    } catch (error) {
        console.error(`Erreur Mini Assistant:`, error);
        // Le mock est géré par generateHtmlResponse, donc on renvoie l'erreur du serveur
        res.status(500).json({ error: `Erreur interne du serveur pour l'assistant.` });
    }
});


// ... (Routes Boost et Root inchangées) ...

app.listen(PORT, () => {
    console.log(`Serveur Streamer Hub démarré sur http://localhost:${PORT}`);
    console.log('--- Statut de Configuration ---');
    console.log(`Client ID: ${TWITCH_CLIENT_ID !== 'VOTRE_CLIENT_ID' ? 'OK' : 'MANQUANT'}`);
    console.log(`Gemini Key: ${GEMINI_API_KEY !== 'VOTRE_CLE_GEMINI' ? 'OK' : 'MANQUANT'}`);
});






