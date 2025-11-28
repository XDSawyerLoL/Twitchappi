import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import 'dotenv/config'; // Charge immédiatement les variables .env
import crypto from 'crypto';
import path from 'path'; // Ajouté: Nécessaire pour les chemins de fichiers
import { fileURLToPath } from 'url'; // Ajouté: Nécessaire pour __dirname en ES Modules

// Configuration pour __dirname en environnement ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// =========================================================
// Configuration des Variables d'Environnement
// =========================================================

const app = express();
const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI; // L'URI exact enregistré sur Twitch
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025";
const COOKIE_SECRET = process.env.COOKIE_SECRET || crypto.randomBytes(16).toString('hex');

// --- DEBUG : Vérification des clés ---
if (GEMINI_API_KEY) {
    console.log("DEBUG: GEMINI_API_KEY est chargée. L'IA est ACTIVE.");
} else {
    console.warn("ATTENTION: GEMINI_API_KEY est absente. Le service IA ne fonctionnera pas.");
}
if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI) {
    console.error("FATAL DEBUG: Les clés TWITCH (ID/SECRET/URI) sont absentes. L'AUTH Twitch est désactivée.");
}

// =========================================================
// Middleware
// =========================================================

// CORS doit être configuré pour autoriser votre frontend
app.use(cors({
    origin: '*', // Permettre toutes les origines pour le déploiement sur Render
    methods: ['GET', 'POST'],
    credentials: true,
}));
app.use(bodyParser.json());
// Utiliser le secret pour les cookies signés (pour plus de sécurité)
app.use(cookieParser(COOKIE_SECRET));

// =========================================================
// Fonctions d'Aide (Twitch & Gemini)
// =========================================================

/**
 * Fonction générique pour appeler l'API Twitch Helix.
 */
async function callTwitchApi(endpoint, token, method = 'GET', body = null) {
    if (!TWITCH_CLIENT_ID) {
        throw new Error("Clé client Twitch manquante.");
    }
    const url = `https://api.twitch.tv/helix/${endpoint}`;
    
    const options = {
        method: method,
        headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
    };
    if (body && method !== 'GET') {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (response.status === 401) {
        throw new Error("Jeton Twitch non valide ou expiré.");
    }

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erreur API Twitch (${response.status}): ${errorText}`);
    }

    return response.json();
}

/**
 * Récupère l'ID et le nom de l'utilisateur associé au jeton.
 */
async function fetchUserFromToken(token) {
    const data = await callTwitchApi('users', token);
    if (data.data && data.data.length > 0) {
        return { 
            id: data.data[0].id, 
            display_name: data.data[0].display_name 
        };
    }
    throw new Error("Impossible d'obtenir les données utilisateur à partir du jeton.");
}


/**
 * Appelle l'API Gemini avec la recherche Google (grounding)
 */
async function callGeminiApi(systemPrompt, userQuery) {
    if (!GEMINI_API_KEY) {
        return "Erreur: La clé API Gemini est absente. Le service IA est désactivé.";
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    
    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        tools: [{ "google_search": {} }],
    };

    let lastError = null;
    const maxRetries = 3;
    let delay = 1000;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (response.status === 429) {
                // Rate limit
                lastError = "Rate limit atteint.";
            } else if (!response.ok) {
                 lastError = `Erreur API Google (${response.status}): ${result.error?.message || response.statusText}`;
            } else {
                // Succès ou réponse vide
                const candidate = result.candidates?.[0];
                if (candidate && candidate.content?.parts?.[0]?.text) {
                    return candidate.content.parts[0].text; // Succès
                }
                lastError = "Réponse IA vide ou mal formée.";
            }
        } catch (e) {
            lastError = `Erreur réseau/fetch: ${e.message}`;
        }

        if (attempt < maxRetries - 1) {
            console.log(`Tentative ${attempt + 1} échouée. Nouvelle tentative dans ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
        }
    }
    console.error(`Échec critique de l'API Gemini: ${lastError}`);
    return `Erreur critique après ${maxRetries} tentatives: ${lastError}`;
}


// --- Fonctions de Scan (Utilisation simplifiée de l'IA pour le Scan) ---

async function fetchScanCritique(query, type) {
    const systemPrompt = `Vous êtes un expert en analyse de niche Twitch. L'utilisateur souhaite analyser un(e) ${type}. Fournissez une analyse concise de la concurrence, des opportunités d'audience et des suggestions d'optimisation (titres, tags) spécifiques à cette requête. Formattez votre réponse en HTML, en utilisant des balises pour structurer l'information, en gras pour les titres et en utilisant des couleurs vives (comme #ffcc00 ou #59d682) pour les points clés. N'utilisez PAS de Markdown ni de balise <html>/<body>.`;
    
    const userQuery = `Analyse du ${type}: ${query}.`;

    const critique = await callGeminiApi(systemPrompt, userQuery);
    return critique.includes("Erreur critique") ? `<p style="color:red;">${critique}</p>` : critique;
}


// =========================================================
// Routes d'Authentification Twitch
// =========================================================

// 1. Démarrer le processus d'authentification
app.get('/twitch_auth_start', (req, res) => {
    if (!TWITCH_CLIENT_ID || !REDIRECT_URI) {
        return res.status(500).send("Erreur: Configuration Twitch manquante.");
    }

    const state = crypto.randomBytes(16).toString('hex');
    // Le cookie est signé pour plus de sécurité
    res.cookie('twitch_auth_state', state, { 
        httpOnly: true, 
        secure: process.env.NODE_ENV === 'production', 
        signed: true // Utilisation du COOKIE_SECRET
    });

    const scope = 'user:read:follows user:read:email';

    const authUrl = `https://id.twitch.tv/oauth2/authorize?` + new URLSearchParams({
        response_type: 'code',
        client_id: TWITCH_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: scope,
        state: state
    }).toString();

    res.redirect(authUrl);
});

// 2. Route de retour de Twitch (Callback)
app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error } = req.query;
    // Récupérer le cookie signé
    const storedState = req.signedCookies.twitch_auth_state;

    res.clearCookie('twitch_auth_state'); // Nettoyer immédiatement le cookie

    if (error || !code) {
        console.error("Erreur de connexion Twitch:", error || "Code manquant");
        // Rediriger vers la racine pour que le frontend gère l'état
        return res.redirect('/?auth_status=error&message=' + encodeURIComponent(error || 'Connexion refusée.'));
    }

    if (!state || state !== storedState) {
        console.error("Erreur CSRF: L'état de la requête ne correspond pas au cookie signé.");
        return res.redirect('/?auth_status=error&message=Erreur de sécurité (CSRF).');
    }

    const tokenPayload = {
        client_id: TWITCH_CLIENT_ID,
        client_secret: TWITCH_CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI
    };

    try {
        const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            body: new URLSearchParams(tokenPayload),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            throw new Error(`Échec de l'échange de jeton: ${tokenResponse.status} - ${errorText}`);
        }

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        // Stocker le jeton d'accès dans un cookie sécurisé (httpOnly pour éviter l'accès JS direct)
        res.cookie('twitch_access_token', accessToken, { 
            httpOnly: true, 
            secure: process.env.NODE_ENV === 'production', 
            maxAge: tokenData.expires_in * 1000, 
            signed: true // Jeton également signé
        });

        // Succès : rediriger vers la racine avec un statut de succès
        return res.redirect('/?auth_status=success');

    } catch (e) {
        console.error("Erreur réseau/serveur lors de l'échange de jeton:", e.message);
        return res.redirect('/?auth_status=error&message=' + encodeURIComponent(`Échec de l'échange de jeton: ${e.message}`));
    }
});


// =========================================================
// Route Critique : Fil Suivi (Mon Fil Suivi)
// =========================================================
app.get('/followed_streams', async (req, res) => {
    // Le jeton est stocké dans un cookie signé côté serveur
    const token = req.signedCookies.twitch_access_token;
    
    if (!token) {
        return res.status(401).json({ error: "Jeton d'accès utilisateur Twitch manquant. Veuillez vous connecter." });
    }

    try {
        // 1. Obtenir l'ID et le nom de l'utilisateur
        const user = await fetchUserFromToken(token);
        
        // 2. Obtenir les streams suivis (limite 100 par défaut si non spécifié)
        const streamsData = await callTwitchApi(`streams/followed?user_id=${user.id}`, token);
        
        // 3. Traiter les données
        const simplifiedStreams = streamsData.data.map(stream => ({
            id: stream.id,
            user_name: stream.user_name,
            title: stream.title,
            game_name: stream.game_name,
            viewer_count: stream.viewer_count,
            // Remplacer les placeholders de l'URL de miniature par des dimensions fixes
            thumbnail_url: stream.thumbnail_url.replace('{width}', '320').replace('{height}', '180')
        }));
        
        return res.json({ 
            user_name: user.display_name,
            streams: simplifiedStreams 
        });

    } catch (e) {
        console.error("Erreur lors de la récupération du fil suivi:", e.message);
        
        if (e.message.includes("401") || e.message.includes("expiré")) {
            // Jeton invalide -> Effacer le cookie et demander une nouvelle connexion
            res.clearCookie('twitch_access_token');
            return res.status(401).json({ error: "Jeton Twitch expiré ou non valide. Veuillez vous reconnecter." });
        }
        return res.status(500).json({ error: `Erreur interne du serveur lors de l'appel Twitch: ${e.message}` });
    }
});


// =========================================================
// Route Critique IA (Scan & Tendances)
// =========================================================

app.post('/critique_ia', async (req, res) => {
    const { query, type } = req.body;

    if (type === 'trend') {
        // --- Gérer la Détection de Tendances (Critique Générale) ---
        const systemPrompt = `
            Vous êtes un analyste expert des tendances de streaming et du "Meta-Jeu" de Twitch. 
            Votre objectif est de fournir une analyse percutante et exploitable pour un streamer.
            
            1. Utilisez OBLIGATOIREMENT la recherche Google (grounding) pour obtenir les données les plus récentes.
            2. Identifiez 3 niches ou jeux émergents (en forte croissance mais avec une concurrence gérable).
            3. Proposez une stratégie de contenu concrète pour un streamer pour exploiter l'une de ces tendances.
            4. Formattez la réponse EN FRANÇAIS en HTML, en utilisant des balises pour structurer l'information, en gras pour les titres et en utilisant des listes (ul/li) pour les points clés. N'utilisez PAS de Markdown ni de balise <html>/<body>. Utilisez des couleurs sombres pour le fond et #ffcc00 ou #59d682 pour l'accentuation.
        `;
        
        const userQuery = "Quelles sont les trois tendances actuelles sur Twitch (jeux ou catégories) qui montrent une forte croissance et une opportunité pour les petits streamers, et donnez une stratégie d'exploitation concrète.";

        const htmlCritique = await callGeminiApi(systemPrompt, userQuery);

        return res.json({
            type: "trend_analysis",
            html_critique: htmlCritique
        });
        
    } else if (type === 'scan' && query) {
        // --- Gérer le Scan de Niche/Streamer ---
        
        // Simuler la détection (cette partie devrait être faite par des API Twitch réelles)
        const isGame = ['valorant', 'minecraft', 'league of legends'].includes(query.toLowerCase());
        const isUser = ['zerator', 'gotaga', 'squeezie'].includes(query.toLowerCase());

        let critique = null;
        
        if (isGame) {
            critique = await fetchScanCritique(query, 'Jeu');
            return res.json({ type: "game", query: query, html_critique: critique });
        } else if (isUser) {
            critique = await fetchScanCritique(query, 'Streamer');
            return res.json({ type: "user", query: query, html_critique: critique });
        } else {
            // Fallback: Analyse générale du terme comme niche
            critique = await fetchScanCritique(query, 'Niche Thématique');
            return res.json({ type: "niche", query: query, html_critique: critique });
        }

    } else {
         return res.status(400).json({ error: "Paramètres de requête (query ou type) manquants ou incorrects." });
    }
});


// =========================================================
// Configuration des Routes Statiques
// =========================================================

// Servir tous les fichiers statiques de la racine (JS, CSS, autres HTML si besoin)
app.use(express.static(__dirname));

// Servir NicheOptimizer.html lorsque l'utilisateur accède à la racine /
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});


// =========================================================
// Dernier Middleware : Gestion des 404
// =========================================================

app.use((req, res, next) => {
    // Si la requête arrive ici, aucune route (API ou Statique) ne l'a gérée.
    res.status(404).send({
        error: "404 Not Found",
        message: "L'URL demandée n'a pas pu être trouvée. Veuillez vérifier l'orthographe de la route API ou l'existence du fichier statique.",
        path: req.originalUrl
    });
});


// =========================================================
// Démarrage du Serveur
// =========================================================

app.listen(PORT, () => {
    console.log(`Serveur Express démarré sur le port ${PORT}`);
    console.log(`Endpoint de connexion Twitch: /twitch_auth_start`);
});
