// Assurez-vous d'avoir 'axios' installé pour les requêtes HTTP
const axios = require('axios');
const express = require('express');
const router = express.Router(); // Si vous utilisez un système de router
// Si vous n'utilisez pas de router, intégrez la logique dans votre fichier app.js

// --- CONFIGURATION TWITCH (À REMPLACER PAR VOS VRAIES VALEURS D'ENVIRONNEMENT) ---
const CLIENT_ID = process.env.TWITCH_CLIENT_ID || 'VOTRE_CLIENT_ID_TWITCH';
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || 'VOTRE_CLIENT_SECRET_TWITCH';
const TWITCH_API_URL = 'https://api.twitch.tv/helix';

// NOTE: Vous devez avoir une fonction pour obtenir un token d'accès valide. 
// Par simplicité, nous allons utiliser un token statique ici, mais vous devriez
// le générer dynamiquement ou le stocker/rafraîchir.
const getTwitchAccessToken = async () => {
    // Si vous stockez le token globalement, retournez-le ici.
    // Sinon, effectuez la requête d'obtention de token (Client Credentials Flow)
    // C'est CRITIQUE pour que la route fonctionne.
    // Pour l'exemple, supposons que vous avez une variable globale ou un cache:
    
    // Exemple de token bidon - REMPLACEZ PAR VOTRE LOGIQUE RÉELLE
    const ACCESS_TOKEN = process.env.TWITCH_ACCESS_TOKEN_CACHED || 'VOTRE_TOKEN_ACTUEL_VALIDE';
    return ACCESS_TOKEN; 
};


// --- ROUTE DE DÉCOUVERTE MICRO-NICHE ---
router.get('/get_micro_niche_stream_cycle', async (req, res) => {
    
    const minViewers = parseInt(req.query.min_viewers) || 0;
    const maxViewers = parseInt(req.query.max_viewers) || 50;

    if (maxViewers < minViewers) {
        return res.status(400).json({ success: false, error: "max_viewers doit être supérieur ou égal à min_viewers." });
    }

    try {
        const accessToken = await getTwitchAccessToken();
        if (!accessToken) {
            console.error("Erreur: Token d'accès Twitch non disponible.");
            return res.status(500).json({ success: false, message: "Échec de l'authentification Twitch." });
        }

        const headers = {
            'Client-ID': CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`,
        };
        
        // 1. Appel à l'API Twitch Helix pour récupérer les streams. 
        // L'API ne permet pas de filtrer par viewers, donc nous prenons un grand échantillon (100)
        // et filtrons manuellement.
        const streamsResponse = await axios.get(`${TWITCH_API_URL}/streams`, {
            headers: headers,
            params: {
                first: 100, // On prend les 100 premiers streams
                // Vous pouvez ajouter le tri si nécessaire: 'sort': 'viewers'
            }
        });

        const streams = streamsResponse.data.data;

        // 2. Filtrage des streams dans la micro-niche (0-50 viewers)
        const microNicheStreams = streams.filter(stream => {
            return stream.viewer_count >= minViewers && stream.viewer_count <= maxViewers;
        });

        if (microNicheStreams.length === 0) {
            // 3. Cas où aucun streamer n'est trouvé dans l'échantillon
            return res.json({ 
                success: false, 
                message: "Aucun streamer en direct trouvé dans cette niche (0-50 vues) dans l'échantillon analysé." 
            });
        }

        // 4. Sélection aléatoire d'un streamer
        const randomIndex = Math.floor(Math.random() * microNicheStreams.length);
        const targetStream = microNicheStreams[randomIndex];
        const channelName = targetStream.user_login;

        // 5. Succès
        return res.json({
            success: true,
            channel: channelName,
            viewers: targetStream.viewer_count,
            message: `Streamer trouvé: ${targetStream.user_name} (${targetStream.viewer_count} vues)`
        });

    } catch (error) {
        // Gestion des erreurs HTTP/Réseau ou erreurs d'API Twitch
        const status = error.response ? error.response.status : 500;
        const errorMessage = error.response ? error.response.data : error.message;

        console.error("Erreur lors de l'appel Twitch /streams:", errorMessage);
        
        return res.status(status).json({
            success: false,
            error: `Échec de la recherche de micro-niche. Erreur API Twitch: ${status} - ${JSON.stringify(errorMessage)}`
        });
    }
});

module.exports = router;
// (Si vous utilisez un système de router)