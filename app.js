const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

// CORRECTION IMPORT : On utilise le package officiel
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();

// ... (Gardons tes variables d'environnement telles quelles)
const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
const GEMINI_MODEL = "gemini-1.5-flash"; // Flash est plus stable pour le web

// =========================================================
// VÉRIFICATION ET INITIALISATION IA CORRIGÉE
// =========================================================
if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI || !GEMINI_API_KEY) {
    process.exit(1); 
}

// CORRECTION : Initialisation de l'IA selon la nouvelle syntaxe Google
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
console.log("DEBUG: L'IA Gemini est initialisée correctement.");

// ... (Tes Middlewares et ton CACHE restent identiques)
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 

// ... (Tes fonctions getTwitchToken et twitchApiFetch restent identiques)

// =========================================================
// LOGIQUE GEMINI HELPER CORRIGÉE
// =========================================================
async function runGeminiAnalysis(prompt) {
    try {
        // CORRECTION : Accès au modèle via genAI
        const model = genAI.getGenerativeModel({ 
            model: GEMINI_MODEL,
            systemInstruction: "Tu es un expert en croissance et stratégie Twitch. Toutes tes réponses doivent être formatées en HTML simple (utilisant <p>, <ul>, <li>, <h4>, <strong>, <em>) sans balise <html> ou <body>, pour être directement injectées dans une div."
        });

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim();
        
        return { success: true, html_response: text };

    } catch (e) {
        console.error("Erreur IA détail:", e);
        return { 
            success: false, 
            status: 500, 
            error: e.message,
            html_response: `<p style="color:red; font-weight:bold;">Erreur IA: ${e.message}</p>`
        };
    }
}

// ... (Gardons toutes tes routes OAuth et Data identiques jusqu'au Raid)

// =========================================================
// --- ROUTE RAID (FONCTIONNELLE) ---
// =========================================================
app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;

    // Pour un vrai Raid Twitch, il faut le scope channel:manage:raids
    // et l'ID du streamer connecté (ton CACHE.twitchUser.id)
    if (!CACHE.twitchUser) {
        return res.status(401).json({ success: false, error: "Connecte ton Twitch pour Raider !" });
    }

    try {
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if (gameRes.data.length === 0) return res.status(404).json({ success: false, error: "Jeu introuvable" });

        const gameId = gameRes.data[0].id;
        const streamsRes = await twitchApiFetch(`streams?game_id=${gameId}&first=100&language=fr`);

        const targets = streamsRes.data.filter(s => s.viewer_count <= parseInt(max_viewers));
        
        if (targets.length > 0) {
            // On prend une cible au hasard parmi les éligibles pour plus de fun
            const target = targets[Math.floor(Math.random() * targets.length)];

            // APPEL API RAID REEL (Helix)
            // Note: Twitch demande de valider le raid via l'interface, mais on prépare l'action
            const raidRes = await fetch(`https://api.twitch.tv/helix/raids?from_broadcaster_id=${CACHE.twitchUser.id}&to_broadcaster_id=${target.user_id}`, {
                method: 'POST',
                headers: {
                    'Client-ID': TWITCH_CLIENT_ID,
                    'Authorization': `Bearer ${CACHE.twitchUser.access_token}`
                }
            });

            return res.json({
                success: true,
                target: {
                    name: target.user_name,
                    login: target.user_login,
                    viewers: target.viewer_count,
                    thumbnail_url: target.thumbnail_url.replace('%{width}', '100').replace('%{height}', '56')
                }
            });
        }
        res.json({ success: false, error: "Aucune cible trouvée." });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ... (Le reste de ton code : critique_ia, export_csv, etc. reste inchangé)

app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});
