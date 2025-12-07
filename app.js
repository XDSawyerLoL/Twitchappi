const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

const { GoogleGenAI } = require('@google/genai');

const app = express();

// =========================================================
// --- CONFIGURATION ET VARIABLES D'ENVIRONNEMENT ---
// =========================================================

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

// =========================================================
// --- CACHING STRATÉGIQUE & STREAMPPOINTS ---
// =========================================================

const BOOST_COOLDOWN_MS = 3 * 60 * 60 * 1000; // 3 heures
const DAILY_BONUS_POINTS = 5;
const STREAMPPOINTS_COST_BOOST = 20;

const CACHE = {
    appAccessToken: {
        token: null,
        expiry: 0
    },
    nicheOpportunities: {
        data: null,
        timestamp: 0,
        lifetime: 1000 * 60 * 20 // 20 minutes
    },
    streamBoosts: {},
    streampoints: {} // { userId: { points: 100, last_activity: timestamp, last_daily_bonus: YYYY-MM-DD } }
};

// =========================================================
// --- MIDDLEWARES & CONFIG EXPRESS ---
// =========================================================

app.use(cors({ 
    origin: '*',
    credentials: true
})); 
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 

// =========================================================
// --- FONCTIONS UTILITAIRES TWITCH API (Inchagé) ---
// =========================================================

// ... (Les fonctions getAppAccessToken, fetchUserIdentity, fetchFollowedStreams, etc. restent inchangées) ...
async function getAppAccessToken() {
    const now = Date.now();
    if (CACHE.appAccessToken.token && CACHE.appAccessToken.expiry > now) {
        return CACHE.appAccessToken.token;
    }
    
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
    
    try {
        const response = await fetch(url, { method: 'POST' });
        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        const newToken = data.access_token;
        
        CACHE.appAccessToken.token = newToken;
        CACHE.appAccessToken.expiry = now + (data.expires_in * 1000) - (5 * 60 * 1000); 
        
        console.log("✅ Nouveau Token Twitch généré et mis en cache.");
        return newToken;
        
    } catch (error) {
        console.error("❌ Échec de la récupération du token Twitch:", error.message);
        return null;
    }
}

async function fetchUserIdentity(userAccessToken) {
    const url = 'https://api.twitch.tv/helix/users';
    try {
        const response = await fetch(url, {
            headers: {
                'Client-Id': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${userAccessToken}`
            }
        });
        if (!response.ok) {
            return null;
        }
        const data = await response.json();
        return data.data && data.data.length > 0 ? data.data[0] : null;
    } catch (error) {
        console.error("❌ Erreur lors de la récupération de l'identité utilisateur:", error.message);
        return null;
    }
}

// ... (Autres fonctions Twitch API) ...


// =========================================================
// --- NOUVELLE LOGIQUE STREAMPPOINTS ---
// =========================================================

function getTodayDateString() {
    return new Date().toISOString().slice(0, 10); // Format YYYY-MM-DD
}

app.get('/user_streampoints', (req, res) => {
    const userId = req.cookies.twitch_user_id;
    const now = Date.now();
    const today = getTodayDateString();

    if (!userId) {
        return res.json({ points: 0, is_connected: false });
    }

    if (!CACHE.streampoints[userId]) {
        // Initialisation de l'utilisateur (100 points de bienvenue)
        CACHE.streampoints[userId] = { 
            points: 100, 
            last_activity: now,
            last_daily_bonus: null // Force le bonus quotidien à être donné lors du premier check
        }; 
    }

    let user = CACHE.streampoints[userId];
    let dailyBonusClaimed = false;

    // 1. Vérification du Bonus Quotidien
    if (user.last_daily_bonus !== today) {
        user.points += DAILY_BONUS_POINTS;
        user.last_daily_bonus = today;
        dailyBonusClaimed = true;
        console.log(`[Streampoints] Bonus quotidien de +${DAILY_BONUS_POINTS} accordé à ${userId}.`);
    }

    user.last_activity = now;

    return res.json({ 
        points: user.points, 
        is_connected: true,
        daily_bonus_claimed: dailyBonusClaimed,
        last_daily_bonus: user.last_daily_bonus
    });
});

app.post('/earn_streampoints_watchtime', (req, res) => {
    const userId = req.cookies.twitch_user_id;
    const { minutes_watched } = req.body; // minutes_watched sera envoyé depuis le frontend (typique 60 min)
    
    if (!userId) {
        return res.status(401).json({ success: false, error: "Non connecté." });
    }

    if (!CACHE.streampoints[userId]) {
        // Devrait être initialisé par le GET, mais sécurité
        CACHE.streampoints[userId] = { points: 100, last_activity: Date.now(), last_daily_bonus: null };
    }
    
    const pointsToAdd = Math.floor(minutes_watched / 60); // 1 point par heure
    
    if (pointsToAdd > 0) {
        CACHE.streampoints[userId].points += pointsToAdd;
        CACHE.streampoints[userId].last_activity = Date.now();
        console.log(`[Streampoints] +${pointsToAdd} points ajoutés à ${userId} pour visionnage.`);
    }

    return res.json({ 
        success: true, 
        points_earned: pointsToAdd,
        new_points: CACHE.streampoints[userId].points,
    });
});

app.post('/spend_streampoints', (req, res) => {
    const userId = req.cookies.twitch_user_id;
    const { cost, action } = req.body; // Le coût (cost) est maintenant envoyé par le frontend

    if (!userId) {
        return res.status(401).json({ success: false, error: "Non connecté. Veuillez vous connecter pour utiliser les Streampoints." });
    }
    
    const userPoints = CACHE.streampoints[userId];
    const actualCost = action === 'STREAM_BOOST' ? STREAMPPOINTS_COST_BOOST : cost; // Le boost a un coût fixe connu

    if (!userPoints || userPoints.points < actualCost) {
        return res.status(402).json({ success: false, error: `Fonds insuffisants. Il vous faut ${actualCost} points pour effectuer cette action.` });
    }

    userPoints.points -= actualCost;
    userPoints.last_activity = Date.now();

    return res.json({ 
        success: true, 
        new_points: userPoints.points,
        message: `Vous avez dépensé ${actualCost} Streampoints pour l'action : ${action}. Points restants : ${userPoints.points}`
    });
});


// =========================================================
// --- MIDDLEWARE GÉNÉRAL ET ROUTES API ---
// =========================================================

// ... (Routes OAuth, Scan, Critique IA, Chat IA, Titre IA inchangées) ...

// --- ROUTE STREAM BOOST (Mise à jour pour intégrer le coût en points) ---
app.post('/stream_boost', async (req, res) => {
    const userId = req.cookies.twitch_user_id;
    const { channel } = req.body;
    
    if (!userId) {
        return res.status(401).json({ error: "Authentification requise pour le Stream Boost." });
    }
    
    if (!channel || channel.trim() === "") {
        return res.status(400).json({ error: "Le nom de la chaîne est requis pour le Boost." });
    }

    // 1. Vérification du Coût en Streampoints
    const userPoints = CACHE.streampoints[userId];
    const cost = STREAMPPOINTS_COST_BOOST;

    if (!userPoints || userPoints.points < cost) {
        return res.status(402).json({ 
            error: `Fonds insuffisants. Il vous faut ${cost} Streampoints.`,
            html_response: `<p style="color:#e34a64; font-weight:bold;">❌ Coût du Boost: ${cost} Streampoints. Solde insuffisant.</p><p>Gagnez des points en regardant des streams ou revenez demain pour le bonus quotidien.</p>`
        });
    }

    // 2. Vérification du Cooldown
    const now = Date.now();
    const lastBoost = CACHE.streamBoosts[channel];

    if (lastBoost && (now - lastBoost) < BOOST_COOLDOWN_MS) {
        const timeRemaining = BOOST_COOLDOWN_MS - (now - lastBoost);
        const minutesRemaining = Math.ceil(timeRemaining / (1000 * 60));
        
        const errorMessage = `
             <p style="color:#e34a64; font-weight:bold;">
                ❌ Cooldown actif.
             </p>
             <p>
                Le Boost de <strong>${channel}</strong> sera disponible dans <strong>${minutesRemaining} minutes</strong>.
             </p>
        `;

        return res.status(429).json({ 
            error: `Cooldown de 3 heures actif.`,
            html_response: errorMessage
        });
    }

    // 3. Dépense des Points et Activation du Boost
    try {
        const spendRes = await fetch(`${API_BASE}/spend_streampoints`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ cost: cost, action: 'STREAM_BOOST' }) 
        });
        
        if (!spendRes.ok) {
             const errorData = await spendRes.json();
             return res.status(400).json({ 
                error: errorData.error || "Erreur interne lors de la dépense des points.",
                html_response: `<p style="color:#e34a64; font-weight:bold;">❌ Erreur lors de la dépense de Streampoints.</p>`
            });
        }
        
        CACHE.streamBoosts[channel] = now;
        
        const successMessage = `
            <p style="color:var(--color-primary-pink); font-weight:bold;">
                ✅ Boost de Stream Activé pour ${cost} Streampoints !
            </p>
            <p>
                La chaîne <strong>${channel}</strong> a été ajoutée à la rotation prioritaire pour une période de 10 minutes. 
                Le prochain boost sera disponible dans 3 heures. Points restants : ${userPoints.points - cost}.
            </p>
        `;

        return res.json({ 
            success: true, 
            html_response: successMessage 
        });

    } catch (e) {
         console.error("Erreur Boost:", e);
         return res.status(500).json({ error: "Erreur interne du serveur lors de l'activation du Boost." });
    }
});


// =========================================================
// Configuration des Routes Statiques (Inchagées)
// =========================================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

app.get('/NicheOptimizer.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

// Lancement du serveur
app.listen(PORT, () => {
    console.log(`Serveur Express démarré sur le port ${PORT}`);
    getAppAccessToken(); 
});
