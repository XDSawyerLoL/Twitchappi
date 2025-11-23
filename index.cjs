// =========================================================
// Configuration des Modules et Initialisation du Serveur
// =========================================================

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser'); // Requis pour traiter les requêtes POST (Boost)

const app = express();

// Middleware pour gérer CORS (autorise l'accès depuis n'importe quel domaine)
app.use(cors());

// Middleware pour parser le corps des requêtes en JSON
app.use(bodyParser.json());

// =========================================================
// Configuration des Clés Twitch (Lues de l'environnement Render)
// =========================================================

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
let TWITCH_ACCESS_TOKEN = null; // Stockage du token

if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
    console.error("ERREUR CRITIQUE: TWITCH_CLIENT_ID ou TWITCH_CLIENT_SECRET ne sont pas définis.");
}

// =========================================================
// Configuration des Clés Gemini (pour le Proxy IA)
// =========================================================
// Nous supposons que cette clé est définie sur le serveur Render
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025";

if (!GEMINI_API_KEY) {
    console.warn("ATTENTION: GEMINI_API_KEY n'est pas défini. La route /critique_ia sera désactivée.");
}

// --- Fonction pour obtenir ou renouveler le Token d'accès Twitch ---
async function getTwitchAccessToken() {
    if (TWITCH_ACCESS_TOKEN) return TWITCH_ACCESS_TOKEN;

    if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
        // Renvoie une erreur explicite si les clés manquent
        console.error("ERREUR D'AUTH: TWITCH_CLIENT_ID ou TWITCH_CLIENT_SECRET non définis.");
        return null;
    }
    
    console.log("Obtention d'un nouveau Token Twitch...");
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;

    try {
        const response = await fetch(url, { method: 'POST' });
        
        const responseText = await response.text();
        
        // Tentative de parsing JSON
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (e) {
            console.error("ERREUR DE PARSING JSON (Auth): La réponse de Twitch n'est pas un JSON valide. Corps de la réponse:", responseText);
            // Si le parsing échoue, on affiche le statut HTTP pour le diagnostic
            console.error(`Statut HTTP lors de l'obtention du token: ${response.status}`);
            return null;
        }


        if (response.ok && data.access_token) {
            TWITCH_ACCESS_TOKEN = data.access_token;
            // Réinitialiser le token juste avant son expiration (5 minutes de moins)
            setTimeout(() => TWITCH_ACCESS_TOKEN = null, (data.expires_in - 300) * 1000); 
            console.log("Token Twitch obtenu avec succès.");
            return TWITCH_ACCESS_TOKEN;
        } else {
            // Gère les erreurs renvoyées par Twitch (ex: Invalid client secret)
            console.error(`Erreur d'obtention du token (Statut: ${response.status}):`, data.message || data.error || "Réponse inattendue.");
            return null;
        }
    } catch (error) {
        // Gère les erreurs réseau (ex: DNS, Timeout)
        console.error("ERREUR RÉSEAU/CONNEXION (Auth): Impossible de contacter le serveur d'authentification Twitch:", error.message);
        return null;
    }
}

// --- Fonction pour obtenir l'ID d'un jeu (sera utilisée dans la prochaine étape) ---
async function getGameId(gameName, token) {
    if (!gameName || !token) return null;
    
    const searchUrl = `https://api.twitch.tv/helix/games?name=${encodeURIComponent(gameName)}`;
    
    try {
        const response = await fetch(searchUrl, {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await response.json();
        
        if (response.ok && data.data.length > 0) {
            console.log(`ID trouvé pour le jeu '${gameName}': ${data.data[0].id}`);
            return data.data[0].id;
        }
        console.log(`Aucun ID trouvé pour le jeu: ${gameName}`);
        return null;

    } catch (error) {
        console.error("Erreur lors de la recherche du Game ID:", error.message);
        return null;
    }
}

// --- Fonction pour obtenir le nombre de followers d'un utilisateur (MAINTENU pour l'IA) ---
async function getFollowerCount(userId, token) {
    if (!userId || !token) return null;
    
    const searchUrl = `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${userId}`;
    
    try {
        const response = await fetch(searchUrl, {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await response.json();
        
        if (response.ok && typeof data.total === 'number') {
            return data.total;
        }
        return null;
    } catch (error) {
        console.error(`Erreur lors de la recherche des followers pour l'ID ${userId}:`, error.message);
        return null;
    }
}


// =========================================================
// ROUTE 0: Accueil (GET /)
// =========================================================

app.get('/', (req, res) => {
    res.send({ status: "OK", message: "Twitch API Scanner est opérationnel. Utilisez les routes /random, /boost ou /critique_ia." });
});

// =========================================================
// ROUTE 1.1: Recherche de Game ID (pour le client)
// =========================================================
app.get('/gameid', async (req, res) => {
    const gameName = req.query.name;
    const token = await getTwitchAccessToken();

    if (!token) {
         return res.status(500).json({ message: "Échec de l'authentification Twitch." });
    }
    if (!gameName) {
        return res.status(400).json({ message: "Paramètre 'name' manquant." });
    }

    const gameId = await getGameId(gameName, token);

    if (gameId) {
        res.json({ game_id: gameId, name: gameName });
    } else {
        res.status(404).json({ message: `Jeu non trouvé pour le nom: ${gameName}` });
    }
});


// =========================================================
// ROUTE 1.2: Scanner (GET /random) - LOGIQUE TWITCH
// Le filtre sur le nombre de spectateurs est ENTIÈREMENT supprimé (Trouve TOUTES les tailles).
// =========================================================

app.get('/random', async (req, res) => {
    const gameId = req.query.game_id; 

    const token = await getTwitchAccessToken();
    if (!token) {
        return res.status(500).json({ message: "Échec de l'authentification (Token Twitch non obtenu). Vérifiez TWITCH_CLIENT_ID/SECRET sur Render." });
    }
    
    // Construction de l'URL de base pour les streams, fixée à la langue française
    // On demande 100 streams, qui sont triés par Twitch par nombre de viewers (du plus grand au plus petit)
    let twitchUrl = `https://api.twitch.tv/helix/streams?first=100&language=fr`;
    
    if (gameId) {
        twitchUrl += `&game_id=${gameId}`;
        console.log(`Scan ciblé par Game ID: ${gameId}`);
    } else {
        console.log("Scan général FR");
    }

    try {
        // 1. Appel à l'API Twitch pour obtenir les streams (max 100 streams)
        const streamsResponse = await fetch(twitchUrl, {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${token}`
            }
        });

        if (!streamsResponse.ok) {
            const errorText = await streamsResponse.text();

            if (streamsResponse.status === 401 || streamsResponse.status === 400) {
                 return res.status(500).json({ message: `Erreur Twitch ${streamsResponse.status}. Token invalide ou expiré (re-déploiement nécessaire).` });
            }

            console.error(`Erreur API Twitch (Status ${streamsResponse.status}):`, errorText);
            return res.status(500).json({ message: `Erreur interne (${streamsResponse.status}) lors du scan Twitch. Détails dans les logs Render.` });
        }

        const streamsData = await streamsResponse.json();
        
        // 2. Filtrer uniquement par l'état 'live' et au moins 1 spectateur
        // Puisque Twitch trie les 100 premiers par viewers, cette liste inclura les plus gros streamers.
        let activeStreams = streamsData.data.filter(s => 
            s.type === 'live' && 
            s.viewer_count > 0 
        );
        
        if (activeStreams.length === 0) {
            return res.status(404).json({ message: `🔍 Aucun streamer FR en direct trouvé. Veuillez réessayer ou ajuster le filtre de jeu.` });
        }
        
        // 3. Sélectionner un streamer aléatoire parmi les 100 trouvés
        const randomStream = activeStreams[Math.floor(Math.random() * activeStreams.length)];
        
        // 4. Obtenir le nombre de followers pour l'analyse IA
        const followerCount = await getFollowerCount(randomStream.user_id, token) || 'N/A';
        
        // 5. Formater la réponse pour le client
        res.json({ 
            message: 'Streamer trouvé',
            streamer: {
                username: randomStream.user_login,
                title: randomStream.title,
                game_name: randomStream.game_name, 
                viewer_count: randomStream.viewer_count,
                follower_count: followerCount,
                avg_score: (Math.random() * (5.0 - 3.5) + 3.5).toFixed(1) // Score d'exemple pour l'IA
            }
        });

    } catch (error) {
        console.error("Erreur lors du processus de scan (exception non gérée):", error);
        res.status(500).json({ message: "Erreur interne du serveur lors du scan (vérifiez les logs Render)." });
    }
});

// =========================================================
// ROUTE 2: Boost (POST /boost) - Simulation
// =========================================================

app.post('/boost', (req, res) => {
    const { channelName, userId } = req.body;
    
    if (!channelName) {
        return res.status(400).json({ message: "Nom de chaîne manquant." });
    }

    // --- C'est ici que vous inséreriez la VRAIE logique Boost ---
    
    console.log(`[BOOST LOG] Channel: ${channelName}, UserID: ${userId}`);

    // Réponse de succès
    res.json({ 
        message: `Boost enregistré pour la chaîne '${channelName}'. Merci.`,
        status: 'ok' 
    });
});

// =========================================================
// ROUTE 3: Critique IA (POST /critique_ia) - PROXY GEMINI
// =========================================================

app.post('/critique_ia', async (req, res) => {
    // La clé API est désormais un prérequis pour cette fonction
    if (!GEMINI_API_KEY) {
        return res.status(503).json({ critique: "Le service IA est désactivé (Clé API manquante sur le serveur)." });
    }

    // Les données du streamer contiennent maintenant les vrais comptes pour l'analyse IA
    const { username, game_name, title, viewer_count, follower_count } = req.body;

    if (!username || !game_name || !title) {
        return res.status(400).json({ critique: "Données du streamer incomplètes pour l'analyse IA." });
    }
    
    // URL de l'API Gemini
    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    // Instruction Système: Guide le modèle sur son rôle et le format de la réponse.
    const systemPrompt = "Agis comme un consultant en marketing Twitch expérimenté. Ta tâche est de fournir une critique constructive et professionnelle d'un seul paragraphe (environ 3-4 phrases) pour aider ce 'petit' streamer à progresser. Concentre-toi sur le titre, le choix du jeu (s'il est trop saturé ou non), et donne un conseil de croissance concret. Écris en français. N'utilise AUCUN formatage Markdown (pas de *, #, ou **), retourne juste du texte simple.";

    // Requête Utilisateur: Les données réelles à analyser.
    const userQuery = `Analyse ce profil de Streamer. Il a ${viewer_count} viewers et ${follower_count} followers.
- Nom d'utilisateur: ${username}
- Jeu: ${game_name}
- Titre du Stream: "${title}"`;

    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
    };

    let finalCritique = null;
    let lastError = null;
    const MAX_RETRIES = 4;
    
    // Implémentation de l'Exponential Backoff pour l'API Gemini
    for (let i = 0; i < MAX_RETRIES; i++) {
        const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s, 8s
        if (i > 0) {
            console.log(`Tentative ${i+1}/${MAX_RETRIES} pour Gemini après un délai de ${delay/1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        try {
            const response = await fetch(GEMINI_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const responseText = await response.text();
            
            if (!response.ok) {
                // Si Gemini renvoie 403, 429, 500 etc., on log et on essaie le retry.
                lastError = new Error(`Erreur API Gemini (Status: ${response.status}) - ${responseText.substring(0, 100)}...`);
                continue; 
            }

            const result = JSON.parse(responseText);
            const candidate = result.candidates?.[0];
            
            if (candidate && candidate.content?.parts?.[0]?.text) {
                finalCritique = candidate.content.parts[0].text.trim();
                lastError = null;
                break; // Succès, sort de la boucle
            } else {
                lastError = new Error("Réponse Gemini vide ou mal structurée.");
                continue;
            }

        } catch (error) {
            lastError = error;
            console.error("Erreur réseau/parsing lors de l'appel Gemini:", error.message);
            continue;
        }
    }

    if (finalCritique) {
        // Succès
        res.json({ critique: finalCritique });
    } else {
        // Échec après tous les retries
        console.error("Échec définitif de la génération IA après tentatives:", lastError ? lastError.message : "inconnue");
        // Retourne l'erreur au client
        res.status(500).json({ critique: `Échec définitif de la génération IA. Dern. erreur: ${lastError ? lastError.message : "inconnue"}.` });
    }
});


// =========================================================
// Démarrage du Serveur
// =========================================================

// Utilise le port fourni par Render (process.env.PORT) ou un port par défaut
const PORT = process.env.PORT || 10000; 

app.listen(PORT, () => {
    console.log(`Serveur API en cours d'exécution sur le port ${PORT}`);
    // Tente d'obtenir le token Twitch au démarrage
    getTwitchAccessToken(); 
});
