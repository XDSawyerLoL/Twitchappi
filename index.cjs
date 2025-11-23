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

// =========================================================
// ROUTE 1: Scanner (GET /random) - LOGIQUE RÉELLE TWITCH
// =========================================================

app.get('/random', async (req, res) => {
    const maxViewers = parseInt(req.query.max_viewers) || 30;

    const token = await getTwitchAccessToken();
    if (!token) {
        // Le message le plus probable en cas d'échec d'authentification
        return res.status(500).json({ message: "Échec de l'authentification (Token Twitch non obtenu). Vérifiez TWITCH_CLIENT_ID/SECRET sur Render." });
    }

    try {
        // 1. Appel à l'API Twitch pour obtenir les streams (max 100 streams)
        const streamsResponse = await fetch(`https://api.twitch.tv/helix/streams?first=100`, {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${token}`
            }
        });

        if (!streamsResponse.ok) {
            const errorText = await streamsResponse.text();

            // 🚨 S'il y a un problème de token (même si initialement il a marché, il a pu expirer)
            if (streamsResponse.status === 401 || streamsResponse.status === 400) {
                 return res.status(500).json({ message: `Erreur Twitch ${streamsResponse.status}. Token invalide ou expiré (re-déploiement nécessaire).` });
            }

            console.error(`Erreur API Twitch (Status ${streamsResponse.status}):`, errorText);
            return res.status(500).json({ message: `Erreur interne (${streamsResponse.status}) lors du scan Twitch. Détails dans les logs Render.` });
        }

        const streamsData = await streamsResponse.json();
        
        // 2. Filtrer les streamers selon les critères (live et <= maxViewers)
        const smallStreams = streamsData.data.filter(s => 
            s.type === 'live' && 
            s.viewer_count > 0 && 
            s.viewer_count <= maxViewers
        );

        if (smallStreams.length === 0) {
            return res.status(404).json({ message: "🔍 Aucun streamer trouvé correspondant aux critères actuels." });
        }
        
        // 3. Sélectionner un streamer aléatoire
        const randomStream = smallStreams[Math.floor(Math.random() * smallStreams.length)];
        
        // 4. Formater la réponse pour le client
        res.json({ 
            message: 'Streamer trouvé',
            streamer: {
                username: randomStream.user_login,
                title: randomStream.title,
                viewer_count: randomStream.viewer_count,
                // Score généré aléatoirement pour le client (l'API Twitch ne fournit pas de score)
                avg_score: (Math.random() * (5.0 - 3.5) + 3.5).toFixed(1) 
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
// Démarrage du Serveur
// =========================================================

// Utilise le port fourni par Render (process.env.PORT) ou un port par défaut
const PORT = process.env.PORT || 10000; 

app.listen(PORT, () => {
    console.log(`Serveur API en cours d'exécution sur le port ${PORT}`);
});

