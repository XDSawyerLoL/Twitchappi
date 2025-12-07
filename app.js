const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI; 
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash"; 

let ai = null;
if (GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    console.log("DEBUG: GEMINI_API_KEY est chargée. L'IA est ACTIVE.");
} else {
    console.error("FATAL DEBUG: GEMINI_API_KEY non trouvée. L'IA sera désactivée.");
}

// 💡 MODIFICATION MAJEURE: Ajout de l'état global du canal boosté
const CACHE = {
    appAccessToken: { token: null, expiry: 0 },
    streamBoosts: {}, // Cooldown par canal
    activeBoostChannel: { channel: 'twitch', expiry: 0 } // Canal actuellement Boosté Globalement
};

app.use(cors({ origin: '*', credentials: true })); 
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 

// --- Fonctions utilitaires Twitch API (Similaires à avant) ---

async function getAppAccessToken() {
    if (CACHE.appAccessToken.token && CACHE.appAccessToken.expiry > Date.now()) return CACHE.appAccessToken.token;
    try {
        const r = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' });
        const d = await r.json();
        CACHE.appAccessToken.token = d.access_token;
        CACHE.appAccessToken.expiry = Date.now() + (d.expires_in * 1000) - 300000;
        return d.access_token;
    } catch (e) { return null; }
}

async function fetchGameDetails(query, token) {
    try {
        const r = await fetch(`https://api.twitch.tv/helix/games?name=${encodeURIComponent(query)}`, { headers: { 'Client-Id': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` } });
        const d = await r.json();
        return d.data?.[0];
    } catch { return null; }
}

async function fetchStreamsForGame(gameId, token) {
    try {
        const r = await fetch(`https://api.twitch.tv/helix/streams?game_id=${gameId}&first=10`, { headers: { 'Client-Id': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` } });
        const d = await r.json();
        return d.data || [];
    } catch { return []; }
}

async function fetchUserDetailsForScan(query, token) {
    try {
        const r = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(query)}`, { headers: { 'Client-Id': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` } });
        const d = await r.json();
        if (d.data?.length > 0) {
            const user = d.data[0];
            const sR = await fetch(`https://api.twitch.tv/helix/streams?user_id=${user.id}`, { headers: { 'Client-Id': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` } });
            const sD = await sR.json();
            return {
                id: user.id, display_name: user.display_name, login: user.login, profile_image_url: user.profile_image_url, description: user.description,
                is_live: sD.data.length > 0, stream_details: sD.data[0] || null
            };
        }
        return null;
    } catch { return null; }
}

async function fetchLatestVodDetails(channelName, token) {
    try {
        const uR = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(channelName)}`, {
            headers: { 'Client-Id': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });
        const uD = await uR.json();
        if (!uD.data || uD.data.length === 0) return null;

        const userId = uD.data[0].id;
        
        const vR = await fetch(`https://api.twitch.tv/helix/videos?user_id=${userId}&type=archive&first=1`, {
            headers: { 'Client-Id': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });
        const vD = await vR.json();

        if (vD.data && vD.data.length > 0) {
            const vod = vD.data[0];
            return {
                title: vod.title,
                thumbnail_url: vod.thumbnail_url.replace('%{width}', '640').replace('%{height}', '360'), 
                url: vod.url 
            };
        }
        return null;

    } catch(e) { 
        console.error("Erreur fetchLatestVodDetails:", e);
        return null; 
    }
}


// --- Routes Twitch (inchangées) ---

app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    res.cookie('twitch_auth_state', state, { httpOnly: true });
    res.redirect(`https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${state}`);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, error, error_description } = req.query;
    if (error) {
        console.error(`Twitch Auth Error: ${error_description}`);
        return res.send(`Erreur d'Autorisation: ${error_description || 'Accès refusé par l\'utilisateur.'}`);
    }
    try {
        const r = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&code=${code}&grant_type=authorization_code&redirect_uri=${REDIRECT_URI}`, { method: 'POST' });
        const d = await r.json();
        if(!d.access_token) {
            console.error("Erreur Token Exchange:", d);
            return res.send(`Erreur Token (vérifiez les clés): ${d.error_description || d.message || JSON.stringify(d)}`);
        }
        const accessToken = d.access_token;
        const uR = await fetch('https://api.twitch.tv/helix/users', { headers: { 'Client-Id': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${accessToken}` } });
        const uD = await uR.json();
        if (uD.data && uD.data.length > 0) {
            res.cookie('twitch_access_token', accessToken, { httpOnly: true });
            res.cookie('twitch_user_id', uD.data[0].id, { httpOnly: true });
            res.redirect('/NicheOptimizer.html');
        } else {
            return res.send('Erreur: Impossible de récupérer les détails de l\'utilisateur Twitch.');
        }
    } catch(e) { 
        console.error("Erreur fatale dans twitch_auth_callback:", e);
        res.send(`Erreur technique lors du callback: ${e.message}`); 
    }
});

app.get('/twitch_user_status', async (req, res) => {
    const t = req.cookies.twitch_access_token;
    if(!t) return res.json({ is_connected: false });
    const r = await fetch('https://api.twitch.tv/helix/users', { headers: { 'Client-Id': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${t}` } });
    const d = await r.json();
    if(d.data && d.data.length > 0) return res.json({ is_connected: true, username: d.data[0].display_name });
    return res.json({ is_connected: false });
});

app.post('/twitch_logout', (req, res) => {
    res.clearCookie('twitch_access_token'); res.clearCookie('twitch_user_id'); res.json({success:true});
});

app.get('/followed_streams', async (req, res) => {
    const t = req.cookies.twitch_access_token;
    const u = req.cookies.twitch_user_id;
    if(!t || !u) return res.status(401).json({error:"Non connecté"});
    const r = await fetch(`https://api.twitch.tv/helix/streams/followed?user_id=${u}`, { headers: { 'Client-Id': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${t}` } });
    const d = await r.json();
    
    let streams = d.data || [];
    if(streams.length === 0) {
        streams = [
            { user_name: 'StreamerDemo', viewer_count: 100, game_name: 'Demo Game', thumbnail_url: 'https://placehold.co/320x180/444/fff.png?text=Demo', profile_image_url: 'https://placehold.co/50' }
        ];
    }
    res.json({ data: streams });
});

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    const token = await getAppAccessToken();
    const game = await fetchGameDetails(query, token);
    if(game) {
        const streams = await fetchStreamsForGame(game.id, token);
        const total = streams.reduce((acc, s) => acc + s.viewer_count, 0);
        res.json({ type: 'game', game_data: { name: game.name, box_art_url: game.box_art_url.replace('-{width}x{height}', '-285x380'), total_viewers: total, total_streamers: streams.length, avg_viewers_per_streamer: (total/streams.length||1).toFixed(1), streams: streams } });
    } else {
        const user = await fetchUserDetailsForScan(query, token);
        if(user) res.json({ type: 'user', user_data: user });
        else res.json({ type: 'none' });
    }
});

app.post('/get_vod_details', async (req, res) => {
    const { channel } = req.body;
    if (!channel) return res.status(400).json({ error: "Chaîne manquante." });
    
    const token = await getAppAccessToken();
    if (!token) return res.status(503).json({ error: "Token d'application Twitch manquant." });

    const vodDetails = await fetchLatestVodDetails(channel, token);
    if (vodDetails) {
        return res.json({ success: true, details: vodDetails });
    } else {
        return res.status(404).json({ error: `VOD non trouvée pour ${channel}.` });
    }
});

// --- Routes IA (inchangées) ---

app.post('/critique_ia', async (req, res) => {
    if(!ai) return res.status(503).json({ error: "Service IA indisponible (Clé manquante)." });
    const { type, query } = req.body;
    
    let prompt = "";
    const formattingRules = "Réponds en HTML pur (sans balises ```html). Utilise des <ul> et <li> pour les listes. Utilise <strong> pour le gras. Sois concis et percutant. NE RÉPONDS PAS SI LE CONTENU EST CONTROVERSÉ.";

    if (type === 'niche') {
        prompt = `Tu es expert Twitch. Analyse la niche du jeu "${query}". ${formattingRules}. Donne 3 conseils pour percer.`;
    } else if (type === 'repurpose') {
        prompt = `Tu es expert TikTok/Youtube. Donne une stratégie de repurposing pour le streamer "${query}". ${formattingRules}. Donne 3 idées de clips viraux, chacune doit inclure un timestamp d'exemple dans le format **[HH:MM:SS]** (même si fictif).`;
    } else if (type === 'trend') {
        prompt = `Tu es analyste de marché. Quelles sont les 3 prochaines tendances gaming Twitch ? ${formattingRules}. Justifie avec le potentiel de croissance.`;
    } else {
        return res.status(400).json({ error: "Type de critique IA invalide." });
    }

    try {
        const result = await ai.models.generateContent({ 
            model: GEMINI_MODEL, 
            contents: [{ role: "user", parts: [{ text: prompt }] }],
        });

        const candidate = result.candidates?.[0];
        const generatedText = candidate?.content?.parts?.[0]?.text;
        
        if (generatedText) {
            res.json({ html_critique: generatedText });
        } else {
            const finishReason = candidate?.finishReason || 'UNKNOWN';
            let errorMessage = "L'IA n'a pas pu générer de réponse. ";
            if (finishReason === 'SAFETY') { errorMessage += `La réponse a été bloquée par les filtres de sécurité de l'IA. Essayez une requête moins sensible.`; } 
            else { errorMessage += `Raison d'échec: ${finishReason}. La clé API est-elle valide ?`; }
            
            console.error("Gemini a échoué à générer le contenu:", result); 
            res.status(500).json({ error: errorMessage });
        }
    } catch(e) { 
        console.error("Erreur Gemini/Critique:", e);
        res.status(500).json({ error: `Erreur interne de l'IA: ${e.message}. (API Key?)` });
    }
});

app.post('/mini_assistant', async (req, res) => {
    if(!ai) return res.status(503).json({ answer: "<p style='color:red;'>IA indisponible.</p>" });
    
    const { q, context } = req.body; 
    if (!q) return res.status(400).json({ answer: "<p style='color:red;'>Question manquante.</p>" });

    let contextPrompt = "";
    if (context && context !== 'Twitch') {
        contextPrompt = ` (Tu es actuellement concentré sur le streamer/jeu : ${context}).`;
    }

    try {
        const prompt = `Tu es un assistant personnel pour streamer Twitch. ${contextPrompt} Réponds à cette question de manière courte, motivante et stratégique : "${q}". Réponds en français. Utilise du HTML simple (p, strong, ul, li) pour la mise en forme.`;
        
        const result = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
        });

        const candidate = result.candidates?.[0];
        const generatedText = candidate?.content?.parts?.[0]?.text;

        if (generatedText) {
            res.json({ answer: generatedText });
        } else {
            const finishReason = candidate?.finishReason || 'UNKNOWN';
            let errorMessage = "Désolé, l'Assistant a rencontré une erreur. ";
            if (finishReason === 'SAFETY') { errorMessage = "Le message a été bloqué par les filtres de sécurité."; }
            
            console.error("Erreur Assistant:", result);
            res.status(500).json({ answer: `<p style='color:red;'>${errorMessage}</p>` });
        }
    } catch(e) {
        console.error("Erreur Assistant:", e);
        res.status(500).json({ answer: `<p style='color:red;'>Erreur interne: ${e.message}</p>` });
    }
});


// 💡 MODIFICATION MAJEURE: Mise à jour des routes Boost et Global State

// 1. Route pour lire l'état global (Chaîne boostée)
app.get('/get_global_state', (req, res) => {
    const now = Date.now();
    
    // Vérifier si le boost actif a expiré
    if (CACHE.activeBoostChannel.channel && CACHE.activeBoostChannel.expiry > now) {
        return res.json({ 
            channel: CACHE.activeBoostChannel.channel,
            message: `Boost Actif: ${CACHE.activeBoostChannel.channel} pour tous.`
        });
    }

    // Si le boost est expiré, le réinitialiser et retourner la chaîne par défaut
    CACHE.activeBoostChannel.channel = 'twitch'; 
    CACHE.activeBoostChannel.expiry = 0; 

    return res.json({ 
        channel: CACHE.activeBoostChannel.channel,
        message: "Chaîne par défaut."
    });
});


// 2. Route pour gérer l'envoi du boost
app.post('/stream_boost', (req, res) => {
    const { channel } = req.body;
    const now = Date.now();
    const BOOST_COOLDOWN_MS = 3 * 3600000; // 3 heures
    const BOOST_DURATION_MS = 10 * 60000; // 10 minutes de boost global

    // Vérification du cooldown personnel
    if (CACHE.streamBoosts[channel] && (now - CACHE.streamBoosts[channel] < BOOST_COOLDOWN_MS)) {
        const minutesRemaining = Math.ceil((BOOST_COOLDOWN_MS - (now - CACHE.streamBoosts[channel])) / 60000);
        const errorMessage = `<p style="color:#e34a64">⏳ Cooldown actif pour ${channel}. Réessayez dans ${minutesRemaining} min.</p>`;
        return res.status(429).json({ html_response: errorMessage, error: "Cooldown actif" });
    }

    // Mise à jour de l'état global et du cooldown personnel
    CACHE.streamBoosts[channel] = now;
    CACHE.activeBoostChannel.channel = channel;
    CACHE.activeBoostChannel.expiry = now + BOOST_DURATION_MS;

    const successMessage = `
        <p style="color:var(--color-primary-pink); font-weight:bold;">
            ✅ Boost de Stream Activé !
        </p>
        <p>
            La chaîne <strong>${channel}</strong> est maintenant la <strong style="color:var(--color-secondary-blue);">chaîne par défaut pour TOUS les utilisateurs</strong> pendant 10 minutes !
            Le prochain boost sera disponible dans 3 heures.
        </p>
    `;

    return res.json({ 
        success: true, 
        html_response: successMessage 
    });
});


// --- Routes Statiques (inchangées) ---

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));
app.get('/NicheOptimizer.html', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));

app.listen(PORT, () => console.log(`Serveur démarré sur le port ${PORT}`));
