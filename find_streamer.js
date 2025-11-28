import fetch from 'node-fetch'; // Importation du module fetch moderne

// --- CONFIGURATION ---
const CLIENT_ID = '3cxzcj23fcrczbe5n37ajzcb4y7u9q'; // Votre Client ID
const ACCESS_TOKEN = 'ifypidjkytqzoktdyljgktqsczrv4j'; // Votre Jeton d'Accès (valide 60 jours)
const API_BASE_URL = 'https://api.twitch.tv/helix/streams';

// Plage de spectateurs ciblée (Élargie à 150 pour garantir un résultat)
const MIN_VIEWERS = 0;
const MAX_VIEWERS = 150;
const MAX_PAGES = 20; // On augmente à 20 pages pour trouver plus de petits streamers (2000 streams max)

// Headers nécessaires pour toutes les requêtes Twitch API
const HEADERS = {
    'Client-Id': CLIENT_ID,
    'Authorization': `Bearer ${ACCESS_TOKEN}`
};

// Fonction principale pour récupérer, filtrer et choisir un streamer
async function findRandomSmallStreamer() {
    let streamersPool = [];
    let paginationCursor = null;
    let requestsCount = 0;

    console.log(`🚀 Démarrage de la recherche de streamers avec ${MIN_VIEWERS}-${MAX_VIEWERS} spectateurs, sur ${MAX_PAGES} pages...`);

    // Boucle pour paginer les résultats
    while (requestsCount < MAX_PAGES) {
        let url = API_BASE_URL + `?first=100`; // On demande 100 streams par requête

        if (paginationCursor) {
            url += `&after=${paginationCursor}`;
        }
        
        try {
            const response = await fetch(url, { headers: HEADERS });
            
            // Affichage des limites de requêtes restantes
            const remainingRequests = response.headers.get('ratelimit-remaining');
            console.log(`Pages parcourues: ${requestsCount + 1}. Requêtes restantes: ${remainingRequests}`);

            const data = await response.json();

            if (data.error) {
                console.error("❌ ERREUR API TWITCH:", data.message);
                return;
            }

            // Filtrage des streams
            const filteredStreams = data.data.filter(stream => {
                const viewerCount = stream.viewer_count;
                return viewerCount >= MIN_VIEWERS && viewerCount <= MAX_VIEWERS;
            });

            streamersPool.push(...filteredStreams);

            // Préparation pour la page suivante
            paginationCursor = data.pagination.cursor;
            requestsCount++;

            // Si on a atteint la fin des streams ou la limite de pages, on arrête
            if (!paginationCursor || requestsCount >= MAX_PAGES) {
                break;
            }

        } catch (error) {
            console.error("❌ Erreur lors de la requête API :", error.message);
            break;
        }
    }

    console.log(`\n✅ Recherche terminée. ${streamersPool.length} streamers trouvés dans la plage ${MIN_VIEWERS}-${MAX_VIEWERS}.`);

    if (streamersPool.length === 0) {
        console.log("🥺 Aucun streamer trouvé pour le moment avec ces critères. Réessayez plus tard.");
        return null;
    }

    // Sélection aléatoire d'un streamer
    const randomIndex = Math.floor(Math.random() * streamersPool.length);
    const selectedStreamer = streamersPool[randomIndex];

    return selectedStreamer;
}

// Exécution et affichage du résultat
findRandomSmallStreamer().then(streamer => {
    if (streamer) {
        console.log("--- 🎉 STREAMER SÉLECTIONNÉ ALÉATOIREMENT 🎉 ---");
        console.log(`Nom du Streamer: ${streamer.user_name}`);
        console.log(`Titre du Live: ${streamer.title}`);
        console.log(`Jeu: ${streamer.game_name}`);
        console.log(`Spectateurs: ${streamer.viewer_count}`);
        console.log(`Lien: https://twitch.tv/${streamer.user_login}`);
        console.log("------------------------------------------");
    }
});