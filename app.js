const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // NOTE: Ceci doit être présent pour Node < 18
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const admin = require("firebase-admin");

const app = express();

// --- Configuration des Variables d'Environnement ---
const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash"; // Modèle rapide pour l'analyse

// --- DEBUG : Vérification des clés ---
if (GEMINI_API_KEY) {
    console.log("DEBUG: GEMINI_API_KEY est chargée. L'IA est ACTIVE.");
} else {
    // Avertissement critique si la clé IA manque
    console.error("FATAL DEBUG: GEMINI_API_KEY est manquante. Les fonctionnalités IA ne fonctionneront PAS.");
}

// --- Configuration Firebase Admin SDK (RAPPEL: Assurez-vous que FIREBASE_ADMIN_CREDENTIALS est défini) ---
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_CREDENTIALS);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin SDK initialisé avec succès.");
} catch (error) {
    console.error("Erreur lors de l'initialisation de Firebase Admin SDK. Vérifiez la variable FIREBASE_ADMIN_CREDENTIALS:", error.message);
}

// =========================================================
// MIDDLEWARES
// =========================================================
app.use(cors({
    origin: '*', // Permettre toutes les origines pour le développement/Render
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static('public'));


// =========================================================
// GESTION DU TOKEN TWITCH (À MAINTENIR)
// =========================================================

let appAccessToken = null;
let tokenRefreshTimeout = null;

/**
 * Récupère le token d'application Twitch.
 * @returns {Promise<string>} Le token d'accès.
 */
async function getAppAccessToken() {
    if (appAccessToken) return appAccessToken;
    await refreshAppAccessToken();
    return appAccessToken;
}

/**
 * Rafraîchit le token d'application Twitch et planifie le prochain rafraîchissement.
 */
async function refreshAppAccessToken() {
    console.log("Rafraîchissement du Token d'Application Twitch...");
    if (tokenRefreshTimeout) {
        clearTimeout(tokenRefreshTimeout);
        tokenRefreshTimeout = null;
    }

    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;

    try {
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();

        if (data.access_token) {
            appAccessToken = data.access_token;
            console.log("Nouveau Token d'Application Twitch récupéré avec succès.");

            // Planifier le prochain rafraîchissement un peu avant l'expiration (data.expires_in est en secondes)
            const expiresInMs = data.expires_in * 1000;
            const refreshBeforeExpirationMs = expiresInMs - (60 * 60 * 1000); // 1 heure avant l'expiration

            if (refreshBeforeExpirationMs > 0) {
                tokenRefreshTimeout = setTimeout(refreshAppAccessToken, refreshBeforeExpirationMs);
            }

        } else {
            console.error("Erreur lors de la récupération du Token d'Application Twitch:", data);
            // Tentative de re-rafraîchissement après un délai plus court en cas d'échec
            tokenRefreshTimeout = setTimeout(refreshAppAccessToken, 5 * 60 * 1000); // 5 minutes
        }
    } catch (error) {
        console.error("Erreur de connexion lors du rafraîchissement du Token d'Application Twitch:", error);
        // Tentative de re-rafraîchissement après 1 minute en cas d'erreur réseau
        tokenRefreshTimeout = setTimeout(refreshAppAccessToken, 60 * 1000);
    }
}

// Initialisation au démarrage
refreshAppAccessToken();


// =========================================================
// FONCTIONS DE RECHERCHE TWITCH (À MAINTENIR)
// =========================================================

/**
 * Recherche un jeu sur Twitch.
 */
async function fetchGameDetailsForScan(query, token) {
    // Implémentation du fetchGameDetailsForScan (Doit être complet dans le fichier original)
    const url = `https://api.twitch.tv/helix/search/categories?query=${encodeURIComponent(query)}`;
    try {
        const response = await fetch(url, {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await response.json();
        return data.data?.[0]; // Retourne le premier résultat de jeu trouvé
    } catch (e) {
        console.error('Erreur Twitch API (Game Search):', e);
        return null;
    }
}

/**
 * Recherche un utilisateur sur Twitch.
 */
async function fetchUserDetailsForScan(query, token) {
    // Implémentation du fetchUserDetailsForScan (Doit être complet dans le fichier original)
    const url = `https://api.twitch.tv/helix/users?login=${encodeURIComponent(query)}`;
    try {
        const response = await fetch(url, {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await response.json();
        return data.data?.[0]; // Retourne le premier utilisateur trouvé
    } catch (e) {
        console.error('Erreur Twitch API (User Search):', e);
        return null;
    }
}


// =========================================================
// FONCTION D'APPEL DE L'API GEMINI (NOUVEAU)
// =========================================================

/**
 * Appelle l'API Gemini pour générer du contenu avec Grounding.
 * @param {string} prompt Le prompt utilisateur.
 * @param {string} systemInstruction L'instruction système pour guider le modèle.
 * @param {boolean} useGrounding Utiliser l'outil de recherche Google.
 * @returns {Promise<{text: string, sources: Array<{uri: string, title: string}>}>} Le texte généré et les sources.
 */
async function callGeminiApi(prompt, systemInstruction, useGrounding = true) {
    if (!GEMINI_API_KEY) {
        return { text: "Erreur: La clé GEMINI_API_KEY n'est pas configurée. Le service IA est désactivé.", sources: [] };
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
        // Utiliser l'outil de recherche uniquement si useGrounding est vrai
        ...(useGrounding && { tools: [{ "google_search": {} }] }),
    };

    const headers = { 'Content-Type': 'application/json' };

    // Implémentation de la fonction d'appel avec Backoff (pour la robustesse)
    const MAX_RETRIES = 5;
    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            const candidate = result.candidates?.[0];

            if (candidate && candidate.content?.parts?.[0]?.text) {
                const text = candidate.content.parts[0].text;
                let sources = [];
                const groundingMetadata = candidate.groundingMetadata;
                
                if (groundingMetadata && groundingMetadata.groundingAttributions) {
                    sources = groundingMetadata.groundingAttributions
                        .map(attribution => ({
                            uri: attribution.web?.uri,
                            title: attribution.web?.title,
                        }))
                        .filter(source => source.uri && source.title);
                }
                
                return { text, sources };
            } else if (result.error) {
                console.error(`Erreur Gemini API (${i + 1}/${MAX_RETRIES}):`, result.error);
                throw new Error(`Gemini API Error: ${result.error.message}`);
            } else {
                console.error(`Réponse inattendue de Gemini API (${i + 1}/${MAX_RETRIES}):`, JSON.stringify(result));
                throw new Error("Réponse Gemini API inattendue.");
            }

        } catch (error) {
            if (i < MAX_RETRIES - 1) {
                const delay = Math.pow(2, i) * 1000; // Délai exponentiel (1s, 2s, 4s, ...)
                // Note: Nous ne loguons pas les retries ici pour garder la console propre, comme demandé par les instructions
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.error("Échec de l'appel Gemini API après plusieurs tentatives:", error);
                return { text: `Erreur critique lors de la génération IA: ${error.message}`, sources: [] };
            }
        }
    }
}


// =========================================================
// ROUTES TWITCH (À MAINTENIR)
// =========================================================

/**
 * Route pour scanner un jeu ou un utilisateur.
 * Exemple: POST /scan_game_or_user { "query": "League of Legends" }
 */
app.post('/scan_game_or_user', async (req, res) => {
    const { query } = req.body;
    const token = await getAppAccessToken();

    if (!query) {
        return res.status(400).json({ error: "La requête 'query' est manquante." });
    }
    if (!token) {
        return res.status(503).json({ error: "Service Twitch non disponible (Token d'accès manquant)." });
    }

    // --- ÉTAPE 1: Tenter un scan de JEU ---
    const gameData = await fetchGameDetailsForScan(query, token);

    if (gameData) {
        // Si le jeu est trouvé
        return res.json({
            type: "game",
            game_data: gameData
        });
    } else {
        // --- ÉTAPE 2: Si aucun jeu trouvé, tenter un scan d'UTILISATEUR ---
        const userData = await fetchUserDetailsForScan(query, token);
        
        if (userData) {
            // Si l'utilisateur est trouvé
            return res.json({
                type: "user",
                user_data: userData
            });
        } else {
            // Aucun résultat trouvé ni comme jeu, ni comme utilisateur
            return res.json({ 
                type: "none", 
                message: `Aucun résultat trouvé pour la requête '${query}' comme jeu ou utilisateur.` 
            });
        }
    }
});


// =========================================================
// ROUTES IA (NOUVEAU)
// =========================================================

/**
 * Route pour obtenir une critique IA basée sur un type spécifique (ex: 'trend', 'niche', 'repurpose').
 * Exemple: POST /critique_ia { "type": "trend" }
 */
app.post('/critique_ia', async (req, res) => {
    const { type, data } = req.body;
    
    // Définir le prompt et l'instruction système en fonction du type de critique
    let prompt = "";
    let systemInstruction = "Vous êtes un expert en analyse de contenu et en stratégie de croissance Twitch. Fournissez votre analyse et vos recommandations de manière concise, percutante et professionnelle. La réponse doit être formatée en HTML pour un affichage direct dans un div, en utilisant des classes Tailwind CSS (ou des styles si nécessaire) pour une apparence moderne et propre. Utilisez des couleurs d'accentuation pour mettre en évidence les points clés.";
    
    let aiColorClass = "bg-green-600"; // Couleur par défaut

    if (type === 'trend') {
        prompt = "Trouvez les 5 tendances de streaming (jeux, types de contenu, défis, etc.) les plus en vogue et qui explosent en ce moment sur Twitch pour un petit streamer. Concentrez-vous sur les jeux et niches avec une forte demande mais une offre relativement faible (potentiel de niche). Classez-les par potentiel de croissance.";
        aiColorClass = "bg-yellow-600";
        systemInstruction = "Vous êtes un Détecteur de Tendances AI. Votre tâche est d'analyser les données de recherche en temps réel pour identifier des jeux ou niches Twitch émergentes (haute demande, faible offre). Fournissez une liste concise des 5 meilleures opportunités de niche pour un petit streamer qui veut exploser. Chaque tendance doit avoir un titre, une courte description, et un indicateur de potentiel de croissance (ex: 🔥🔥🔥). Formatez le tout en HTML stylisé avec Tailwind CSS.";
    } 
    // Ajoutez d'autres types de critiques (niche, repurpose) ici si nécessaire
    else {
        return res.status(400).json({ error: "Type de critique IA non supporté. Types supportés: 'trend'." });
    }

    try {
        const { text: critiqueHtml, sources } = await callGeminiApi(prompt, systemInstruction, true); // Utilise Grounding pour les tendances
        
        let finalHtml = `<div class="p-4 rounded-lg shadow-xl ${aiColorClass} bg-opacity-10 border border-gray-700/50">`;
        finalHtml += `<div class="flex items-center mb-4"><span class="mr-2 text-2xl" style="color:var(--color-ai-growth);">💡</span><h3 class="font-orbitron text-lg font-bold text-white">Analyse des Tendances IA</h3></div>`;
        finalHtml += critiqueHtml;
        
        // Ajouter les sources de l'API (pour la crédibilité)
        if (sources.length > 0) {
            finalHtml += `<div class="mt-4 pt-4 border-t border-gray-700"><p class="text-sm font-semibold text-gray-400 mb-2">Sources vérifiées (Google Search):</p><ul class="list-disc list-inside space-y-1 text-xs text-gray-500">`;
            sources.forEach(source => {
                finalHtml += `<li><a href="${source.uri}" target="_blank" class="hover:text-white transition duration-200">${source.title || source.uri}</a></li>`;
            });
            finalHtml += `</ul></div>`;
        }

        finalHtml += `</div>`;

        return res.json({ html_critique: finalHtml });

    } catch (e) {
        console.error("Erreur critique dans la route /critique_ia:", e);
        return res.status(500).json({ 
            error: "Erreur serveur lors de la génération de la critique IA.",
            message: e.message 
        });
    }
});


// =========================================================
// Configuration des Routes Statiques
// =========================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

app.get('/NicheOptimizer.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

app.get('/lucky_streamer_picker.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'lucky_streamer_picker.html'));
});

app.get('/sniper_tool.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'sniper_tool.html'));
});


// =========================================================
// DÉMARRAGE DU SERVEUR
// =========================================================

app.listen(PORT, () => {
    console.log(`Serveur Express démarré sur le port ${PORT}`);
    
    // Vérification des variables d'environnement au démarrage (pour les logs Render)
    console.log("\n--- Statut des Variables d'Environnement (Vérifiez les valeurs NON-VIDES) ---");
    console.log(`PORT: ${PORT}`);
    console.log(`TWITCH_CLIENT_ID: ${TWITCH_CLIENT_ID ? 'OK - Chargée' : 'ERREUR - Manquante'}`);
    console.log(`TWITCH_CLIENT_SECRET: ${TWITCH_CLIENT_SECRET ? 'OK - Chargée' : 'ERREUR - Manquante'}`);
    console.log(`TWITCH_REDIRECT_URI: ${REDIRECT_URI ? 'OK - Chargée' : 'ERREUR - Manquante'}`);
    console.log(`GEMINI_API_KEY: ${GEMINI_API_KEY ? 'OK - Chargée' : 'ERREUR - Manquante'}`);
    console.log("-------------------------------------------------------------------------");
});







