// server.js (ou index.js) - Fichier principal de votre API sur Render.com

// 🛑 MODIFICATION NÉCESSAIRE SI VOUS UTILISEZ LA SYNTAXE IMPORT :
// Remplacez 'const express = require('express');'
// par la ligne suivante :
import express from 'express'; 
// Assurez-vous que tous les autres 'require' sont aussi transformés en 'import' si vous utilisez ES Modules.


const app = express();
const PORT = process.env.PORT || 3000; 

// Middleware pour parser le JSON (nécessaire pour le Boost)
app.use(express.json());


/* =================================================================
    🛑 BLOC CRUCIAL : CORRECTION CORS
================================================================== */
app.use((req, res, next) => {
    // Ceci autorise votre widget sur justplayer.fr à communiquer avec l'API.
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Gère la requête de vérification (preflight)
    if (req.method === 'OPTIONS') {
        return res.status(200).send();
    }
    
    next(); 
});


/* =================================================================
    LOGIQUE DES ROUTES API
================================================================== */

// ⚡ ROUTE BOOST (POST /boost)
app.post('/boost', (req, res) => {
    const { channelName, userId } = req.body;
    
    if (!channelName) {
        return res.status(400).json({ message: "Le nom de la chaîne est requis." });
    }

    console.log(`Boost reçu pour : ${channelName} par utilisateur : ${userId}`);
    
    // Ajoutez ici votre logique réelle de Boost
    
    res.json({ 
        message: `✅ Boost appliqué à la chaîne ${channelName} !`,
        status: 'success' 
    });
});


// 🔍 ROUTE SCANNER (GET /random)
app.get('/random', (req, res) => {
    const maxViewers = parseInt(req.query.max_viewers) || 30;

    // Simulation de la recherche de streamer
    const mockStreams = [
        { username: 'smallstreamer_1', title: 'Test de jeu indé', viewer_count: 12, avg_score: '4.5' },
        { username: 'cyber_tester', title: 'Démonstration de code', viewer_count: 28, avg_score: '3.8' },
        { username: 'lucky_find', title: 'Nouvelle pépite !', viewer_count: 5, avg_score: '4.9' },
        { username: 'twitch_test_channel', title: 'Simulations et Tests', viewer_count: 15, avg_score: '4.0' }
    ];
    
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

