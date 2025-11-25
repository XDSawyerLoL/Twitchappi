// =========================================================
// Configuration des Modules et Initialisation du Serveur
// =========================================================

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();

app.use(cors());
app.use(bodyParser.json());

// =========================================================
// Configuration des Routes Statiques
// =========================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

app.get('/NicheOptimizer.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

// Ajout des deux routes statiques manquantes pour la complétude
app.get('/lucky_streamer_picker.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'lucky_streamer_picker.html'));
});

app.get('/sniper_tool.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'sniper_tool.html'));
});


// =========================================================
// Configuration des Clés & Auth Twitch
// =========================================================

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

let TWITCH_ACCESS_TOKEN = null;
let TWITCH_TOKEN_EXPIRY = 0; // Timestamp d'expiration

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash";

if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
    console.error("ERREUR CRITIQUE: TWITCH_CLIENT_ID ou TWITCH_CLIENT_SECRET ne sont pas définis sur Render.");
}
if (!GEMINI_API_KEY) {
    console.warn("ATTENTION: GEMINI_API_KEY n'est pas défini. Les routes IA seront désactivées.");
}

// --- Fonction Robuste pour obtenir le Token (Fix TimeoutOverflow) ---
async function getTwitchAccessToken() {
    // Si on a un token et qu'il est encore valide (avec une marge de 5 min)
    if (TWITCH_ACCESS_TOKEN && Date.now() < TWITCH_TOKEN_EXPIRY) {
        return TWITCH_ACCESS_TOKEN;
    }

    if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
        console.error("Identifiants Twitch manquants.");
        return null;
    }
    
    console.log("Obtention d'un nouveau Token Twitch...");
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;

    try {
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();

        if (response.ok && data.access_token) {
            TWITCH_ACCESS_TOKEN = data.access_token;
            // Calcule la date d'expiration exacte (Actuel + Durée - 5 minutes de sécurité)
            // Cela évite d'utiliser setTimeout avec des nombres trop grands qui causent le warning
            TWITCH_TOKEN_EXPIRY = Date.now() + (data.expires_in * 1000) - 300000;
            console.log("Token Twitch obtenu et stocké avec succès.");
            return TWITCH_ACCESS_TOKEN;
        } else {
             // LOGGING AMELIORE POUR DIAGNOSTIC
            console.error(`Erreur Token Twitch (HTTP ${response.status}):`, data.message || "Réponse non OK de l'API d'authentification Twitch. Vérifiez Client ID/Secret.");
            return null;
        }
    } catch (error) {
        console.error("Erreur réseau Auth Twitch:", error.message);
        return null;
    }
}

// --- Fonctions Helper Twitch ---
async function getGameId(gameName, token) {
    if (!gameName || !token) return null;
    const searchUrl = `https://api.twitch.tv/helix/games?name=${encodeURIComponent(gameName)}`;
    try {
        const response = await fetch(searchUrl, {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });
        
        // --- NOUVEAU LOGGING POUR DEBUG API HELIX ---
        if (response.status !== 200) {
            console.error(`Erreur Twitch Helix dans getGameId (HTTP ${response.status}). Le token est peut-être périmé ou l'ID client est rejeté pour cette requête.`);
            const errorBody = await response.text();
            console.error("Corps de l'erreur Twitch:", errorBody.substring(0, 200)); 
            return null;
        }
        // --- FIN DU NOUVEAU LOGGING ---

        const data = await response.json();
        if (response.ok && data.data.length > 0) return data.data[0].id;
        return null;
    } catch (e) { 
        console.error("Erreur critique inattendue dans getGameId:", e.message);
        return null; 
    }
}

async function getStreamerDetails(userLogin, token) {
    if (!userLogin || !token) return null;
    try {
        // User Info
        const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(userLogin)}`, {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });
        
        if (userRes.status !== 200) {
            console.error(`Erreur Twitch Helix dans getStreamerDetails/User (HTTP ${userRes.status}).`);
            return null;
        }

        const userData = await userRes.json();
        if (!userData.data || userData.data.length === 0) return null;
        const user = userData.data[0];

        // Stream Info
        const streamRes = await fetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(userLogin)}`, {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });
        
        if (streamRes.status !== 200) {
            console.warn(`Erreur Twitch Helix dans getStreamerDetails/Stream (HTTP ${streamRes.status}).`);
            // Continuer car le streamer peut être hors ligne, mais le 400/500 est une alerte
        }

        const streamData = await streamRes.json();
        const stream = streamData.data && streamData.data.length > 0 ? streamData.data[0] : null;

        // Channel Info (Followers)
        const followRes = await fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${user.id}`, {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });
        
        if (followRes.status !== 200) {
            console.error(`Erreur Twitch Helix dans getStreamerDetails/Followers (HTTP ${followRes.status}).`);
        }
        
        const followData = await followRes.json();

        // Tags
        let tags = [];
        if(stream && stream.tags) tags = stream.tags;

        return {
            username: user.login,
            user_id: user.id,
            is_live: !!stream,
            title: stream ? stream.title : 'Hors ligne',
            game_name: stream ? stream.game_name : 'Non spécifié',
            viewer_count: stream ? stream.viewer_count : 0,
            follower_count: followData.total || 0,
            tags: tags,
            avg_score: (Math.random() * (5.0 - 3.5) + 3.5).toFixed(1)
        };
    } catch (e) {
        console.error("Erreur details streamer:", e);
        return null;
    }
}

// =========================================================
// ROUTES API
// =========================================================

// 1. GAME ID
app.get('/gameid', async (req, res) => {
    // Si le log a dit "succès", ce bloc doit réussir
    const token = await getTwitchAccessToken();
    if (!token) {
        // Ce cas ne devrait JAMAIS se produire si le log de démarrage était correct
        return res.status(500).json({ message: "Erreur Auth Twitch (Token introuvable après l'obtention)." });
    }

    try {
        const id = await getGameId(req.query.name, token);
        if (id) res.json({ game_id: id, name: req.query.name });
        else res.status(404).json({ message: "Jeu non trouvé" });
    } catch (e) {
        // Ce catch est le plus probable d'être la cause du 500
        console.error("Erreur critique et inattendue dans /gameid:", e);
        res.status(500).json({ message: "Erreur serveur interne dans la recherche de jeu. Vérifiez le log Render." });
    }
});

// 2. RANDOM SCAN
app.get('/random', async (req, res) => {
    const token = await getTwitchAccessToken();
    if (!token) return res.status(500).json({ message: "Erreur Auth Twitch" });

    let url = `https://api.twitch.tv/helix/streams?first=100&language=fr`;
    if (req.query.game_id) url += `&game_id=${req.query.game_id}`;

    try {
        const response = await fetch(url, { headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        
        if (!data.data || data.data.length === 0) return res.status(404).json({ message: "Aucun stream trouvé" });

        // Filtre: live + >0 viewers
        const streams = data.data.filter(s => s.type === 'live' && s.viewer_count > 0);
        if (streams.length === 0) return res.status(404).json({ message: "Aucun stream actif trouvé" });

        const randomStream = streams[Math.floor(Math.random() * streams.length)];
        const details = await getStreamerDetails(randomStream.user_login, token);
        
        if(details) res.json({ streamer: details });
        else res.status(404).json({ message: "Erreur détails streamer" });

    } catch (e) {
        res.status(500).json({ message: "Erreur serveur scan" });
    }
});

// 3. DETAILS
app.get('/details', async (req, res) => {
    const token = await getTwitchAccessToken();
    if (!token) return res.status(500).json({ message: "Erreur Auth Twitch" });
    try {
        const details = await getStreamerDetails(req.query.login, token);
        if (details) res.json({ streamer: details });
        else res.status(404).json({ message: "Streamer introuvable" });
    } catch (e) {
        console.error("Erreur non gérée dans /details:", e);
        res.status(500).json({ message: "Erreur serveur interne dans la recherche de streamer." });
    }
});

// 4. BOOST
app.post('/boost', (req, res) => {
    console.log(`BOOST: ${req.body.channelName}`);
    res.json({ message: `Boost activé pour ${req.body.channelName}`, status: 'ok' });
});

// 5. CRITIQUE IA
app.post('/critique_ia', async (req, res) => {
    if (!GEMINI_API_KEY) return res.status(503).json({ critique: "IA Désactivée (Clé manquante)" });
    
    const { username, game_name, title, viewer_count, follower_count } = req.body;
    const prompt = `Agis comme un expert Twitch. Critique ce stream en 3 phrases (Français): 
    Streamer: ${username}, Jeu: ${game_name}, Titre: "${title}", Viewers: ${viewer_count}, Follows: ${follower_count}.
    Donne un conseil concret sur le titre ou le choix du jeu.`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "Erreur IA";
        res.json({ critique: text });
    } catch (e) {
        res.status(500).json({ critique: "Erreur connexion IA" });
    }
});

// 6. DIAGNOSTIC TITRE
app.post('/diagnostic_titre', async (req, res) => {
    if (!GEMINI_API_KEY) return res.status(503).json({ diagnostic: "IA Désactivée (Clé manquante)" });
    
    const { title, game_name } = req.body;
    const prompt = `Expert SEO Twitch. Analyse ce titre: "${title}" pour le jeu ${game_name}. Est-il accrocheur ? Donne une version améliorée. (Réponse courte en Français).`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "Erreur IA";
        res.json({ diagnostic: text });
    } catch (e) {
        res.status(500).json({ diagnostic: "Erreur connexion IA" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Serveur API actif sur le port ${PORT}`);
    // On lance la récupération du token au démarrage
    getTwitchAccessToken();
});
