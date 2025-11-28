const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); 
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { GoogleGenAI } = require('@google/genai');

// NOTE: Le code initial utilise 'firebase-admin', on le garde pour compatibilité même s'il n'est pas utilisé dans cette nouvelle logique de niche.
const admin = require("firebase-admin"); 

const app = express();

// =========================================================
// --- CONFIGURATION ET VARIABLES D'ENVIRONNEMENT ---
// =========================================================

const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;

// Clé IA et modèle optimisé pour la vitesse et le coût
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash"; // Rapide et efficace pour les tâches d'analyse

// Initialisation de l'IA
let ai = null;
if (GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    console.log("DEBUG: GEMINI_API_KEY est chargée. L'IA est ACTIVE.");
} else {
    console.error("FATAL DEBUG: GEMINI_API_KEY non trouvée. L'IA sera désactivée.");
}

// =========================================================
// --- CACHING STRATÉGIQUE (Zéro Coût & Ultra-Performance) ---
// =========================================================

const CACHE = {
    appAccessToken: {
        token: null,
        expiry: 0
    },
    nicheOpportunities: {
        data: null,
        timestamp: 0,
        // On garde le cache pendant 20 minutes (1200000 ms)
        lifetime: 1000 * 60 * 20 
    }
};

// =========================================================
// --- MIDDLEWARES & CONFIG EXPRESS ---
// =========================================================

app.use(cors({ origin: '*' })); // Attention à l'origine en production
app.use(bodyParser.json());
app.use(cookieParser());

// =========================================================
// --- FONCTION UTILITAIRE : GESTION DU TOKEN TWITCH ---
// =========================================================

async function getAppAccessToken() {
    const now = Date.now();
    // 1. Vérifier le cache
    if (CACHE.appAccessToken.token && CACHE.appAccessToken.expiry > now) {
        return CACHE.appAccessToken.token;
    }
    
    // 2. Si non valide, demander un nouveau token
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
    
    try {
        const response = await fetch(url, { method: 'POST' });
        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        const newToken = data.access_token;
        
        // 3. Mettre à jour le cache
        CACHE.appAccessToken.token = newToken;
        // On met l'expiration à 5 minutes de moins que la durée réelle pour être sûr
        CACHE.appAccessToken.expiry = now + (data.expires_in * 1000) - (5 * 60 * 1000); 
        
        console.log("✅ Nouveau Token Twitch généré et mis en cache.");
        return newToken;
        
    } catch (error) {
        console.error("❌ Échec de la récupération du token Twitch:", error.message);
        return null;
    }
}

// =========================================================
// --- FONCTION CLÉ : CALCUL DU RATIO V/S & OPPORTUNITÉS ---
// =========================================================

const MAX_PAGES = 20; // 20 pages * 100 streams/page = 2000 streams analysés max.
const MAX_VIEWERS_LIMIT = 500; // Seuil pour filtrer les "petits" ou moyens streamers

async function fetchNicheOpportunities(token) {
    const now = Date.now();
    // 1. Vérifier le cache des niches
    if (CACHE.nicheOpportunities.data && CACHE.nicheOpportunities.timestamp + CACHE.nicheOpportunities.lifetime > now) {
        console.log("✅ Données de niche récupérées du cache.");
        return CACHE.nicheOpportunities.data;
    }

    console.log("🚀 Lancement du nouveau scan V/S...");
    
    const API_BASE_URL = 'https://api.twitch.tv/helix/streams';
    let paginationCursor = null;
    let requestsCount = 0;
    const gameStats = {};

    while (requestsCount < MAX_PAGES) {
        let url = API_BASE_URL + `?first=100`; 
        if (paginationCursor) {
            url += `&after=${paginationCursor}`;
        }

        const HEADERS = {
            'Client-Id': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${token}`
        };

        try {
            const response = await fetch(url, { headers: HEADERS });
            if (!response.ok) {
                // Si l'API renvoie un 429 (Rate Limit), on arrête la recherche
                if (response.status === 429) {
                    console.warn("⚠️ Rate Limit Twitch atteint. Arrêt du scan.");
                    break;
                }
                throw new Error(`Erreur API Twitch: ${response.status}`);
            }

            const data = await response.json();

            // 2. Traitement des données et calcul du V/S Ratio
            data.data.forEach(stream => {
                const viewers = stream.viewer_count;
                
                // On ne prend que les streams avec une audience limitée
                if (viewers <= MAX_VIEWERS_LIMIT) { 
                    const gameId = stream.game_id;
                    const gameName = stream.game_name;
    
                    if (!gameStats[gameId]) {
                        gameStats[gameId] = { 
                            game_name: gameName,
                            totalViewers: 0,
                            totalStreamers: 0,
                        };
                    }
    
                    gameStats[gameId].totalViewers += viewers;
                    gameStats[gameId].totalStreamers += 1;
                }
            });

            paginationCursor = data.pagination.cursor;
            requestsCount++;

            if (!paginationCursor || requestsCount >= MAX_PAGES) {
                break;
            }

        } catch (error) {
            console.error("❌ Erreur lors de la requête de scan V/S :", error.message);
            break;
        }
    }

    // 3. Finalisation : Calcul des ratios et tri
    const nicheOpportunities = [];
    for (const gameId in gameStats) {
        const stats = gameStats[gameId];
        
        // On veut au moins 5 streamers pour que la statistique soit fiable
        if (stats.totalStreamers >= 5) {
            const ratio = stats.totalViewers / stats.totalStreamers;

            nicheOpportunities.push({
                game_name: stats.game_name,
                // Le ratio est l'indicateur clé de la niche
                ratio_v_s: parseFloat(ratio.toFixed(2)), 
                total_streamers: stats.totalStreamers,
                total_viewers: stats.totalViewers,
            });
        }
    }

    // Trier par le meilleur ratio (du plus grand au plus petit)
    nicheOpportunities.sort((a, b) => b.ratio_v_s - a.ratio_v_s);
    
    const topNiches = nicheOpportunities.slice(0, 10);

    // 4. Mettre à jour le cache
    CACHE.nicheOpportunities.data = topNiches;
    CACHE.nicheOpportunities.timestamp = now;

    return topNiches;
}

// =========================================================
// --- ROUTES DE L'APPLICATION (API) ---
// =========================================================

// CORRIGÉ: Ajout de la dépendance à node-fetch pour la compatibilité avec certains environnements Node/Express
app.use((req, res, next) => {
    if (req.originalUrl === '/critique_ia' && !ai) {
        return res.status(503).json({ error: "Service d'IA non disponible : Clé Gemini manquante." });
    }
    next();
});

// Route principale pour l'analyse IA des niches
app.post('/critique_ia', async (req, res) => {
    // Si 'type: trend' est demandé (comme dans NicheOptimizer.html)
    if (req.body.type !== 'trend') {
        return res.status(400).json({ error: "Type de critique IA non supporté." });
    }

    try {
        const token = await getAppAccessToken();
        if (!token) {
            return res.status(500).json({ error: "Impossible d'obtenir le jeton d'accès Twitch." });
        }

        // 1. Récupérer les données V/S (utilisera le cache si disponible)
        const nicheOpportunities = await fetchNicheOpportunities(token);

        if (!nicheOpportunities || nicheOpportunities.length === 0) {
            return res.json({ 
                html_critique: `<p style="color:red;">❌ L'analyse n'a trouvé aucune niche fiable (moins de 5 streamers par jeu analysé).</p>` 
            });
        }

        // 2. Préparer le prompt ultra-intelligent pour Gemini 2.5 Flash
        const promptData = JSON.stringify(nicheOpportunities, null, 2);
        
        const iaPrompt = `
            Tu es le 'Streamer AI Hub', un conseiller en croissance expert.
            Ton analyse est basée sur le ratio V/S (Spectateurs par Streamer), l'indicateur clé pour trouver des niches sur Twitch. Un ratio V/S élevé signifie que la concurrence est faible par rapport à la demande.
            
            Voici le TOP 10 des meilleures opportunités de niches (classées par Ratio V/S) que nous avons trouvées :
            ${promptData}

            Ta réponse doit être en français et formatée en HTML pour un affichage web. Utilise des balises <h1>, <p>, <ul>, <li> et des sauts de ligne (<br/>) pour aérer.
            
            Réponds en trois parties distinctes :

            PARTIE 1: CONCLUSION et Recommandation (Titre: "🌟 Niche Recommandée par l'IA")
            - Identifie la meilleure opportunité (le top du classement V/S) en justifiant pourquoi c'est la meilleure pour un nouveau streamer.

            PARTIE 2: Stratégie de Titre et Description (Titre: "✍️ Optimisation du Contenu (SEO Twitch)")
            - Propose un titre de live percutant, accrocheur et non-générique pour le jeu recommandé.
            - Explique comment le streamer doit utiliser les tags et la description pour cibler précisément cette niche.

            PARTIE 3: Plan d'Action sur 7 Jours (Titre: "📅 Plan d'Action 7 Jours (Croissance Instantanée)")
            - Donne un plan d'action concret en 3 étapes (un objectif par étape) pour les 7 premiers jours de streaming sur cette niche.
        `;

        // 3. Appel à l'IA
        const result = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: iaPrompt,
        });

        const iaResponse = result.text;

        // 4. Renvoi du résultat au frontend
        return res.json({
            html_critique: iaResponse 
        });

    } catch (e) {
        console.error("❌ Erreur critique dans /critique_ia:", e.message);
        return res.status(500).json({ 
            html_critique: `<p style="color:red;">Erreur IA: ${e.message}. Vérifiez la clé GEMINI_API_KEY ou la connexion Twitch.</p>`
        });
    }
});

// Route /api/scan_query (Laisser telle quelle pour le scan de jeu/utilisateur)
// ... (Le reste de votre logique /api/scan_query dans l'app.js original doit rester ici) ...

// =========================================================
// Configuration des Routes Statiques
// =========================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

app.get('/NicheOptimizer.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

// ... (Autres routes statiques, si elles existent) ...

// =imalement, Lancement du serveur
app.listen(PORT, () => {
    console.log(`Serveur Express démarré sur le port ${PORT}`);
    // Tenter de générer un token au démarrage pour pré-charger le cache
    getAppAccessToken(); 
});
