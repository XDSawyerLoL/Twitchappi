// Assurez-vous que ces dépendances sont installées (npm install express axios)
const express = require('express');
const axios = require('axios');
// Si vous utilisez 'app' comme objet Express principal (app.js ou server.js)
// const app = express(); 

const TWITCH_API_URL = 'https://api.twitch.tv/helix';

// --- CONFIGURATION TWITCH (À REMPLACER par vos variables d'environnement) ---
const CLIENT_ID = process.env.TWITCH_CLIENT_ID || 'VOTRE_CLIENT_ID_TWITCH';

// Fonction CRUCIALE pour obtenir un jeton d'accès valide
// La manière la plus sûre de faire est d'utiliser le flux Client Credentials
const getTwitchAccessToken = async () => {
    // Si le token est déjà en cache et valide, retournez-le.
    // Sinon, effectuez une nouvelle requête pour obtenir le token:
    try {
        const tokenResponse = await axios.post('https://id.twitch.tv/oauth2/token', null, {
            params: {
                client_id: CLIENT_ID,
                client_secret: process.env.TWITCH_CLIENT_SECRET || 'VOTRE_CLIENT_SECRET_TWITCH',
                grant_type: 'client_credentials'
            }
        });
        // Pour une application réelle, vous devriez stocker ce token et sa date d'expiration.
        return tokenResponse.data.access_token;
    } catch (error) {
        console.error("Échec de l'obtention du token Twitch:", error.response?.data || error.message);
        return null;
    }
};

// --- ROUTE DE DÉCOUVERTE MICRO-NICHE ---
// Si vous avez un objet 'app' Express, utilisez app.get
app.get('/get_micro_niche_stream_cycle', async (req, res) => {
    
    const minViewers = 0;
    const maxViewers = 50;

    try {
        const accessToken = await getTwitchAccessToken();
        if (!accessToken) {
            return res.status(503).json({ success: false, message: "Service Twitch non disponible (Token manquant)." });
        }

        const headers = {
            'Client-ID': CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`,
        };
        
        // 1. Appel à l'API Twitch (prend les 100 premiers streams)
        const streamsResponse = await axios.get(`${TWITCH_API_URL}/streams`, {
            headers: headers,
            params: { first: 100 }
        });

        const streams = streamsResponse.data.data;
        
        // 2. Filtrage des streams 0-50
        const microNicheStreams = streams.filter(stream => {
            return stream.viewer_count >= minViewers && stream.viewer_count <= maxViewers;
        });

        if (microNicheStreams.length === 0) {
            // L'API répond OK, mais aucun streamer trouvé dans l'échantillon
            return res.json({ 
                success: false, 
                message: "Aucun streamer trouvé dans l'échantillon 0-50." 
            });
        }

        // 3. Sélection aléatoire
        const randomIndex = Math.floor(Math.random() * microNicheStreams.length);
        const targetStream = microNicheStreams[randomIndex];
        const channelName = targetStream.user_login;

        // 4. Succès: renvoie le nom de la chaîne
        return res.json({
            success: true,
            channel: channelName,
            viewers: targetStream.viewer_count
        });

    } catch (error) {
        // Erreur de communication HTTP (4xx ou 5xx) avec Twitch ou erreur interne
        const status = error.response ? error.response.status : 500;
        
        console.error("Erreur dans /get_micro_niche_stream_cycle:", error.response?.data || error.message);
        
        return res.status(status).json({
            success: false,
            error: `Erreur API/Serveur. Statut: ${status}`
        });
    }
});
