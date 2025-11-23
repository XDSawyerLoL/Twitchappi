// server.js (ou index.js) - Fichier principal de votre API sur Render.com

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000; // Utilise le port fourni par Render

// Middleware pour parser le JSON du corps des requêtes (nécessaire pour le Boost)
app.use(express.json());


/* =================================================================
    🛑 BLOC CRUCIAL : CORRECTION CORS (Access-Control-Allow-Origin)
    
    Ce bloc autorise votre widget (sur justplayer.fr) à communiquer 
    avec cette API (sur render.com).
================================================================== */
app.use((req, res, next) => {
    // ⚠️ Configurez ceci pour autoriser votre domaine.
    // L'utilisation de '*' est la plus simple, mais 'https://justplayer.fr' est plus sécurisé.
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    
    // Autorise les méthodes GET et POST (et OPTIONS pour le 'preflight')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    
    // Autorise l'en-tête de contenu (Content-Type)
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Gère les requêtes 'preflight' (requêtes automatiques du navigateur)
    if (req.method === 'OPTIONS') {
        return res.status(200).send();
    }
    
    next(); // Passe à la route suivante
});


/* =================================================================
    LOGIQUE DES ROUTES API
    (Ceci est la logique simulée ou simplifiée de votre backend)
================================================================== */

// ⚡ ROUTE BOOST (POST /boost)
app.post('/boost', (req, res) => {
    const { channelName, userId } = req.body;
    
    if (!channelName) {
        return res.status(400).json({ message: "Le nom de la chaîne est requis." });
    }

    console.log(`Boost reçu pour : ${channelName} par utilisateur : ${userId}`);

    // --- Ajoutez ici votre VRAIE logique d'API (requête Twitch, BDD, etc.) ---
    
    res.json({ 
        message: `✅ Boost appliqué à la chaîne ${channelName} !`,
        status: 'success' 
    });
});


// 🔍 ROUTE SCANNER (GET /random)
app.get('/random', (req, res) => {
    // Le paramètre max_viewers vient du frontend (app.js)
    const maxViewers = parseInt(req.query.max_viewers) || 30;

    // --- Simulation de la recherche de streamer (à remplacer par votre logique réelle) ---
    const mockStreams = [
        { username: 'smallstreamer_1', title: 'Test de jeu indé', viewer_count: 12, avg_score: '4.5' },
        { username: 'cyber_tester', title: 'Démonstration de code', viewer_count: 28, avg_score: '3.8' },
        { username: 'lucky_find', title: 'Nouvelle pépite !', viewer_count: 5, avg_score: '4.9' },
        { username: 'twitch_test_channel', title: 'Simulations et Tests', viewer_count: 15, avg_score: '4.0' }
    ];
    
    // Filtrer ou simuler le filtre
    const filteredStreams = mockStreams.filter(s => s.viewer_count <= maxViewers);

    if (filteredStreams.length === 0) {
        return res.status(404).json({ message: "Aucun streamer trouvé correspondant aux critères." });
    }
    
    const randomStream = filteredStreams[Math.floor(Math.random() * filteredStreams.length)];

    res.json({ 
        message: 'Streamer trouvé',
        streamer: randomStream
    });
});


/* =================================================================
    DÉMARRAGE DU SERVEUR
================================================================== */
app.listen(PORT, () => {
    console.log(`Serveur API en cours d'exécution sur le port ${PORT}`);
});

