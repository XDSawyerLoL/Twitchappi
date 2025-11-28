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
// Utilisation du modèle Flash pour les analyses, incluant la recherche (grounding)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// IMPORTANT : Utilisation du modèle précis pour garantir le Google Search Grounding
const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025"; 

// --- DEBUG : Vérification des clés ---
if (GEMINI_API_KEY) {
    console.log("DEBUG: GEMINI_API_KEY est chargée. L'IA est ACTIVE.");
} else {
    // Avertissement critique si la clé IA manque
    console.error("FATAL DEBUG: GEMINI_API_KEY est absente ou vide. L'IA ne fonctionnera PAS.");
}

// --- Middleware ---
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());

// =========================================================
// Fonctions d'Aide (Twitch & Gemini)
// =========================================================

// Placeholder: Cette fonction simule la recherche de détails de jeu sur Twitch
async function fetchGameDetailsForScan(query, token) {
    // Dans une vraie application, on ferait un appel à l'API Twitch
    // Ex: https://api.twitch.tv/helix/games?name=query
    if (query.toLowerCase() === 'valorant') {
        return {
            game_id: '516570',
            name: 'Valorant',
            viewer_count_rank: 5
        };
    }
    return null;
}

// Placeholder: Cette fonction simule la recherche de détails d'utilisateur sur Twitch
async function fetchUserDetailsForScan(query, token) {
    // Dans une vraie application, on ferait un appel à l'API Twitch
    // Ex: https://api.twitch.tv/helix/users?login=query
    if (query.toLowerCase() === 'zerator') {
        return {
            user_id: '123456',
            display_name: 'ZeratoR',
            followers: '3.5M',
            latest_game: 'Just Chatting'
        };
    }
    return null;
}

/**
 * Appelle l'API Gemini avec la recherche Google (grounding)
 * @param {string} systemPrompt - Instruction du système pour le rôle de l'IA.
 * @param {string} userQuery - La requête spécifique de l'utilisateur.
 * @returns {Promise<string>} - Le texte généré par l'IA ou un message d'erreur.
 */
async function callGeminiApi(systemPrompt, userQuery) {
    if (!GEMINI_API_KEY) {
        return "Erreur: La clé API Gemini est absente. Le service IA est désactivé.";
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    
    // Configuration pour le grounding (recherche Google)
    const tools = [{ "google_search": {} }];
    
    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        tools: tools,
    };

    let lastError = null;
    const maxRetries = 3;
    let delay = 1000; // 1 seconde de délai initial

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const result = await response.json();
                const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                    return text; // Succès
                }
                lastError = "Réponse IA vide ou mal formée.";
            } else {
                lastError = `Erreur API Google (${response.status}): ${response.statusText}`;
            }
        } catch (e) {
            lastError = `Erreur réseau/fetch: ${e.message}`;
        }

        if (attempt < maxRetries - 1) {
            console.log(`Tentative ${attempt + 1} échouée. Nouvelle tentative dans ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; // Délai exponentiel
        }
    }

    return `Erreur critique après ${maxRetries} tentatives: ${lastError}`;
}


// =========================================================
// Route Critique IA (API INTERNE)
// =========================================================

app.post('/critique_ia', async (req, res) => {
    // 1. Gérer la Détection de Tendances
    if (req.body.type === 'trend') {
        console.log("INFO: Lancement de l'analyse de détection de tendances IA...");
        
        const systemPrompt = `
            Vous êtes un analyste expert des tendances de streaming et du "Meta-Jeu" de Twitch. 
            Votre objectif est de fournir une analyse percutante et exploitable pour un streamer.
            
            1. Utilisez OBLIGATOIREMENT la recherche Google (grounding) pour obtenir les données les plus récentes.
            2. Identifiez 3 niches ou jeux émergents (en forte croissance mais avec une concurrence gérable).
            3. Proposez une stratégie de contenu concrète pour un streamer pour exploiter l'une de ces tendances.
            4. Formattez la réponse EN FRANÇAIS en HTML, en utilisant des balises pour structurer l'information, en gras pour les titres et en utilisant des listes (ul/li) pour les points clés. N'utilisez PAS de Markdown ni de balise <html>/<body>.
            5. Utilisez des couleurs sombres pour le fond et des couleurs vives (comme le jaune ou le vert) pour accentuer les informations importantes (Hex codes comme #ffcc00 ou #59d682).
        `;
        
        const userQuery = "Quelles sont les trois tendances actuelles sur Twitch (jeux ou catégories) qui montrent une forte croissance et une opportunité pour les petits streamers, et donnez une stratégie d'exploitation concrète.";

        try {
            const rawResponse = await callGeminiApi(systemPrompt, userQuery);
            
            // Le résultat est déjà formaté en HTML par l'IA
            const htmlCritique = rawResponse; 
            
            return res.json({
                type: "trend_analysis",
                html_critique: htmlCritique
            });

        } catch (error) {
            console.error("Erreur lors de l'appel Gemini pour les tendances:", error);
            return res.status(500).json({
                error: "Erreur interne du service IA lors de l'analyse des tendances."
            });
        }
    }
    
    // 2. Gérer le Scan de Niche/Streamer (Logique existante)
    const query = req.body.query;
    if (!query) {
        return res.status(400).json({ error: "Le paramètre 'query' est manquant." });
    }

    // Un jeton Twitch simulé ou réel serait nécessaire ici
    const token = "SIMULATED_TWITCH_TOKEN"; 

    // --- ÉTAPE 1: Tenter un scan de JEU ---
    const gameData = await fetchGameDetailsForScan(query, token);

    if (gameData) {
        // Si le jeu est trouvé
        return res.json({
            type: "game",
            game_data: gameData,
            html_critique: `<h4 style="color:#59d682;">Analyse de Jeu: ${gameData.name}</h4><p>Le jeu <b>${gameData.name}</b> a été identifié. Il se classe au <b>Top ${gameData.viewer_count_rank}</b> des jeux les plus regardés. L'IA analyserait la concurrence et le potentiel de niche ici. (TODO: Implémenter l'analyse IA détaillée du jeu.)</p>`
        });
    } else {
        // --- ÉTAPE 2: Si aucun jeu trouvé, tenter un scan d'UTILISATEUR ---
        const userData = await fetchUserDetailsForScan(query, token);
        
        if (userData) {
            // Si l'utilisateur est trouvé
            return res.json({
                type: "user",
                user_data: userData,
                html_critique: `<h4 style="color:#59d682;">Analyse de Streamer: ${userData.display_name}</h4><p>Le streamer <b>${userData.display_name}</b> (Suiveurs: ${userData.followers}) a été trouvé. Il streamait récemment sur <b>${userData.latest_game}</b>. L'IA analyserait les forces/faiblesses et le contenu optimal ici. (TODO: Implémenter l'analyse IA détaillée du streamer.)</p>`
            });
        } else {
            // Aucun résultat trouvé ni comme jeu, ni comme utilisateur
            return res.json({ 
                type: "none", 
                html_critique: `<h4 style="color:red;">Aucun Résultat</h4><p>Aucun résultat trouvé pour la requête '${query}' comme jeu ou utilisateur.</p>`
            });
        }
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
// Démarrage du Serveur
// =========================================================

app.listen(PORT, () => {
    console.log(`Serveur Express démarré sur le port ${PORT}`);
});
