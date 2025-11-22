import path from 'path'; 
import { fileURLToPath } from 'url'; 
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors'; 

const app = express();
// Nous allons aussi lire le PORT depuis l'environnement pour une meilleure compatibilité Render
// Render fournit un port via process.env.PORT, s'il n'est pas là, nous utilisons 3000 par défaut.
const PORT = process.env.PORT || 3000;

app.use(cors()); 

// --- CONFIGURATION TWITCH SÉCURISÉE ---
// ✅ MODIFICATION CLÉ : Les identifiants sont lus depuis les variables d'environnement de Render
const CLIENT_ID = process.env.TWITCH_CLIENT_ID; 
const ACCESS_TOKEN = process.env.TWITCH_ACCESS_TOKEN; 

const API_BASE_URL = 'https://api.twitch.tv/helix/streams';

const MIN_VIEWERS = 0;
const MAX_VIEWERS = 150;
const MAX_PAGES = 20;

const HEADERS = {
    'Client-Id': CLIENT_ID,
    'Authorization': `Bearer ${ACCESS_TOKEN}`
};

// Logique de recherche
async function findRandomSmallStreamer() {
    // Vérification de sécurité rapide : si les identifiants ne sont pas chargés, on arrête ici.
    if (!CLIENT_ID || !ACCESS_TOKEN) {
        console.error("ERREUR DE SÉCURITÉ : CLIENT_ID ou ACCESS_TOKEN manquant. Vérifiez les variables d'environnement.");
        return { user_login: 'twitch' }; 
    }

    let streamersPool = [];
    let paginationCursor = null;
    let requestsCount = 0;

    while (requestsCount < MAX_PAGES) {
        let url = API_BASE_URL + `?first=100`; 
        url += `&language=fr`; 

        if (paginationCursor) {
            url += `&after=${paginationCursor}`;
        }
        
        try {
            const response = await fetch(url, { headers: HEADERS });
            const data = await response.json();

            if (data.error) {
                console.error("ERREUR API TWITCH:", data.message);
                return null;
            }

            const filteredStreams = data.data.filter(stream => {
                const viewerCount = stream.viewer_count;
                return viewerCount >= MIN_VIEWERS && viewerCount <= MAX_VIEWERS;
            });

            streamersPool.push(...filteredStreams);

            paginationCursor = data.pagination.cursor;
            requestsCount++;

            if (!paginationCursor || requestsCount >= MAX_PAGES) {
                break;
            }

        } catch (error) {
            console.error("Erreur lors de la requête API :", error.message);
            break;
        }
    }

    if (streamersPool.length === 0) {
        // En cas d'échec de recherche, retourne un streamer par défaut
        return { user_login: 'twitch' }; 
    }

    // Sélection aléatoire
    const randomIndex = Math.floor(Math.random() * streamersPool.length);
    return streamersPool[randomIndex];
}

// ----------------------------------------------------
// DÉFINITION DE L'ENDPOINT API
// ----------------------------------------------------
app.get('/random-streamer', async (req, res) => {
    const streamer = await findRandomSmallStreamer();
    
    if (streamer) {
        // Renvoie l'ID du streamer que le frontend utilisera
        res.json({ streamer_id: streamer.user_login });
    } else {
        res.status(500).json({ error: "Impossible de trouver un streamer." });
    }
});

// Démarrage du serveur
app.listen(PORT, () => {
    console.log(`Serveur API démarré sur le port : ${PORT}`);
    console.log(`Endpoint de test : http://localhost:${PORT}/random-streamer`);
});
