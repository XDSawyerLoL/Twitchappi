import path from 'path'; // <-- NOUVELLE LIGNE
import { fileURLToPath } from 'url'; // <-- NOUVELLE LIGNE
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors'; // <-- Ajout de l'importation CORS

const app = express();
const PORT = 3000;

app.use(cors()); // <-- Activation de CORS : Autorise les requêtes depuis la page web

// --- CONFIGURATION TWITCH ---
const CLIENT_ID = '3cxzcj23fcrczbe5n37ajzcb4y7u9q'; 
const ACCESS_TOKEN = 'ifypidjkytqzoktdyljgktqsczrv4j'; 
const API_BASE_URL = 'https://api.twitch.tv/helix/streams';

const MIN_VIEWERS = 0;
const MAX_VIEWERS = 150;
const MAX_PAGES = 20;

const HEADERS = {
    'Client-Id': CLIENT_ID,
    'Authorization': `Bearer ${ACCESS_TOKEN}`
};

// Logique de recherche (tirée de find_streamer.js)
async function findRandomSmallStreamer() {
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
        // En cas d'échec, retourne un streamer par défaut
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
    console.log(`Serveur API démarré sur http://localhost:${PORT}`);
    console.log(`Endpoint de test : http://localhost:${PORT}/random-streamer`);
});