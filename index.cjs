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
        return null;
    }
    
    console.log("Obtention d'un nouveau Token Twitch...");
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;

    try {
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();
        
        if (data.access_token) {
            TWITCH_ACCESS_TOKEN = data.access_token;
            // Réinitialiser le token juste avant son expiration (5 minutes de moins)
            setTimeout(() => TWITCH_ACCESS_TOKEN = null, (data.expires_in - 300) * 1000); 
            console.log("Token Twitch obtenu avec succès.");
            return TWITCH_ACCESS_TOKEN;
        } else {
            console.error("Erreur lors de l'obtention du token:", data);
            return null;
        }
    } catch (error) {
        console.error("Erreur réseau lors de la requête du token:", error);
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
        return res.status(500).json({ message: "Erreur: Impossible d'obtenir le token d'accès Twitch." });
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
            const errorBody = await streamsResponse.json();
            console.error("Erreur API Twitch (Status " + streamsResponse.status + "):", errorBody);
            return res.status(500).json({ message: "Échec de l'appel à l'API Twitch ou mauvaise clé." });
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
        console.error("Erreur lors du processus de scan:", error);
        res.status(500).json({ message: "Erreur interne du serveur lors du scan." });
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
    // (ex: enregistrement dans une base de données, notification d'un autre service, etc.)
    
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
