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

const CACHE = {
    appAccessToken: { token: null, expiry: 0 },
    streamBoosts: {}
};

app.use(cors({ origin: '*', credentials: true })); 
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 

// --- Fonctions utilitaires Twitch API (non modifiées) ---
async function getAppAccessToken() { /* ... */ }
async function fetchGameDetails(query, token) { /* ... */ }
async function fetchStreamsForGame(gameId, token) { /* ... */ }
async function fetchUserDetailsForScan(query, token) { /* ... */ }

// --- Routes Twitch (inchangées) ---
app.get('/twitch_auth_start', (req, res) => { /* ... */ });
app.get('/twitch_auth_callback', async (req, res) => { /* ... */ });
app.get('/twitch_user_status', async (req, res) => { /* ... */ });
app.post('/twitch_logout', (req, res) => { /* ... */ });
app.get('/followed_streams', async (req, res) => { /* ... */ });
app.post('/scan_target', async (req, res) => { /* ... */ });


// --- Routes IA (Critique inchangée, Mini-Assistant corrigé) ---

app.post('/critique_ia', async (req, res) => {
    if(!ai) return res.status(503).json({ error: "Service IA indisponible (Clé manquante)." });
    const { type, query } = req.body;
    
    let prompt = "";
    const formattingRules = "Réponds en HTML pur (sans balises ```html). Utilise des <ul> et <li> pour les listes. Utilise <strong> pour le gras. Sois concis et percutant. NE RÉPONDS PAS SI LE CONTENU EST CONTROVERSÉ.";

    if (type === 'niche') {
        prompt = `Tu es expert Twitch. Analyse la niche du jeu "${query}". ${formattingRules}. Donne 3 conseils pour percer.`;
    } else if (type === 'repurpose') {
        prompt = `Tu es expert TikTok/Youtube. Donne une stratégie de repurposing pour le streamer "${query}". ${formattingRules}. Donne 3 idées de clips viraux.`;
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

// 💡 MODIFICATION: Ajout de 'context' dans la requête et le prompt (Section D)
app.post('/mini_assistant', async (req, res) => {
    if(!ai) return res.status(503).json({ answer: "<p style='color:red;'>IA indisponible.</p>" });
    
    // Récupération de la question (q) ET du contexte (context)
    const { q, context } = req.body; 
    if (!q) return res.status(400).json({ answer: "<p style='color:red;'>Question manquante.</p>" });

    let contextPrompt = "";
    if (context && context !== 'Twitch') {
        // Ajoute le contexte au prompt, rendant l'IA plus pertinente
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

app.post('/stream_boost', (req, res) => {
    const { channel } = req.body;
    const now = Date.now();
    const BOOST_COOLDOWN_MS = 3 * 3600000; // 3 heures
    if (CACHE.streamBoosts[channel] && (now - CACHE.streamBoosts[channel] < BOOST_COOLDOWN_MS)) {
        const minutesRemaining = Math.ceil((BOOST_COOLDOWN_MS - (now - CACHE.streamBoosts[channel])) / 60000);
        return res.status(429).json({ html_response: `<p style="color:#e34a64">⏳ Cooldown actif. Réessayez dans ${minutesRemaining} min.</p>` });
    }
    CACHE.streamBoosts[channel] = now;
    res.json({ success: true, html_response: `<p style="color:#59d682">✅ <strong>${channel}</strong> est boosté sur le réseau ! (Priorité max pendant 15 min)</p>` });
});

// --- Routes Statiques (inchangées) ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));
app.get('/NicheOptimizer.html', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));

app.listen(PORT, () => console.log(`Serveur démarré sur le port ${PORT}`));



