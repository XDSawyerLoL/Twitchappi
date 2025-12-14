// ===================================================================
// 1. DÉPENDANCES ET INITIALISATION D'EXPRESS
// ===================================================================
const express = require('express');
const axios = require('axios');
const path = require('path'); // Nécessaire pour gérer les chemins de fichiers statiques

const app = express(); // Initialisation de l'application Express
const TWITCH_API_URL = 'https://api.twitch.tv/helix';

// ===================================================================
// 2. MIDDLEWARE : SERVIR LES FICHIERS STATIQUES (LCD.html et LCD.js)
// CECI DOIT ÊTRE PLACÉ AVANT TOUTE DÉFINITION DE ROUTE SPÉCIFIQUE
// ===================================================================

// Rend accessible le contenu du dossier 'public' sous la racine '/'
app.use(express.static(path.join(__dirname, 'public'))); 
console.log(`Fichiers statiques servis depuis: ${path.join(__dirname, 'public')}`);

// ===================================================================
// 3. LOGIQUE D'AUTHENTIFICATION ET ROUTE D'API (LE BACKEND)
// ===================================================================

const CLIENT_ID = process.env.TWITCH_CLIENT_ID || 'VOTRE_CLIENT_ID_TWITCH';

const getTwitchAccessToken = async () => {
    try {
        const tokenResponse = await axios.post('https://id.twitch.tv/oauth2/token', null, {
            params: {
                client_id: CLIENT_ID,
                client_secret: process.env.TWITCH_CLIENT_SECRET || 'VOTRE_CLIENT_SECRET_TWITCH',
                grant_type: 'client_credentials'
            }
        });
        // Renvoie le nouveau token d'accès
        return tokenResponse.data.access_token;
    } catch (error) {
        console.error("Échec de l'obtention du token Twitch:", error.response?.data || error.message);
        return null;
    }
};

// Route pour la découverte de la micro-niche
app.get('/get_micro_niche_stream_cycle', async (req, res) => {
    
    const minViewers = 0;
    const maxViewers = 50;

    try {
        const accessToken = await getTwitchAccessToken();
        if (!accessToken) {
            return res.status(503).json({ success: false, message: "Service Twitch non disponible (Token manquant ou échec d'authentification)." });
        }

        const headers = {
            'Client-ID': CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`,
        };
        
        // Appel à l'API Twitch
        const streamsResponse = await axios.get(`${TWITCH_API_URL}/streams`, {
            headers: headers,
            params: { first: 100 }
        });

        const streams = streamsResponse.data.data;
        
        // Filtrage
        const microNicheStreams = streams.filter(stream => {
            return stream.viewer_count >= minViewers && stream.viewer_count <= maxViewers;
        });

        if (microNicheStreams.length === 0) {
            return res.json({ success: false, message: "Aucun streamer trouvé dans l'échantillon 0-50." });
        }

        // Sélection aléatoire
        const randomIndex = Math.floor(Math.random() * microNicheStreams.length);
        const targetStream = microNicheStreams[randomIndex];
        
        return res.json({
            success: true,
            channel: targetStream.user_login,
            viewers: targetStream.viewer_count
        });

    } catch (error) {
        const status = error.response ? error.response.status : 500;
        console.error("Erreur dans /get_micro_niche_stream_cycle:", error.response?.data || error.message);
        
        return res.status(status).json({
            success: false,
            error: `Erreur API/Serveur. Statut: ${status}`
        });
    }
});

// ===================================================================
// 4. LANCEMENT DU SERVEUR
// ===================================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Serveur Node.js démarré sur le port ${PORT}`);
});
