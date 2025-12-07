const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const cookieParser = require('cookie-parser');
const { GoogleGenAI } = require('@google/genai');

const app = express();

// =========================================================
// --- CONFIGURATION ET VARIABLES D'ENVIRONNEMENT ---
// NOTE: REMPLACEZ CES VALEURS PAR VOS CLÉS D'API RÉELLES
// =========================================================

const PORT = process.env.PORT || 10000;
// Remplacer par vos vrais IDs/Secrets
const TWITCH_CLIENT_ID = "VOTRE_TWITCH_CLIENT_ID"; 
const TWITCH_CLIENT_SECRET = "VOTRE_TWITCH_CLIENT_SECRET"; 
const REDIRECT_URI = "http://localhost:10000/auth/callback"; // Mettez votre URL de redirection réelle

const GEMINI_API_KEY = "VOTRE_GEMINI_API_KEY"; // Clé Gemini

const GEMINI_MODEL = "gemini-2.5-flash"; 

let ai = null;
if (GEMINI_API_KEY && GEMINI_API_KEY !== "VOTRE_GEMINI_API_KEY") {
    ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    console.log("✅ L'IA est ACTIVE.");
} else {
    console.error("❌ GEMINI_API_KEY non trouvée ou non configurée. L'IA sera désactivée.");
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
    streamBoosts: {}, // { channelName: timestamp_du_dernier_boost }
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
// --- FONCTIONS UTILITAIRES TWITCH API ---
// =========================================================

async function getAppAccessToken() {
    // ... (Logique pour obtenir le token d'application Twitch - Omisses pour la concision) ...
    // Le code complet doit contenir cette fonction pour que les scans fonctionnent
    const now = Date.now();
    if (CACHE.appAccessToken.token && CACHE.appAccessToken.expiry > now) {
        return CACHE.appAccessToken.token;
    }
    
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
    
    try {
        const response = await fetch(url, { method: 'POST' });
        if (!response.ok) throw new Error(`Erreur HTTP: ${response.status}`);
        
        const data = await response.json();
        const newToken = data.access_token;
        
        CACHE.appAccessToken.token = newToken;
        CACHE.appAccessToken.expiry = now + (data.expires_in * 1000) - (5 * 60 * 1000); 
        console.log("✅ Nouveau Token Twitch généré.");
        return newToken;
        
    } catch (error) {
        console.error("❌ Échec de la récupération du token Twitch:", error.message);
        return null;
    }
}

async function fetchUserIdentity(userAccessToken) {
    // ... (Logique pour récupérer les données utilisateur Twitch - Omisses pour la concision) ...
     const url = 'https://api.twitch.tv/helix/users';
    try {
        const response = await fetch(url, {
            headers: {
                'Client-Id': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${userAccessToken}`
            }
        });
        if (!response.ok) return null;
        const data = await response.json();
        return data.data && data.data.length > 0 ? data.data[0] : null;
    } catch (error) {
        console.error("❌ Erreur lors de la récupération de l'identité utilisateur:", error.message);
        return null;
    }
}

// =========================================================
// --- NOUVELLE LOGIQUE STREAMPPOINTS ---
// =========================================================

function getTodayDateString() {
    // Obtenir la date au format YYYY-MM-DD
    return new Date().toISOString().slice(0, 10); 
}

// Endpoint pour vérifier le solde et accorder le bonus quotidien
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
            last_daily_bonus: null
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
    });
});

// Endpoint pour gagner des points via le temps de visionnage
app.post('/earn_streampoints_watchtime', (req, res) => {
    const userId = req.cookies.twitch_user_id;
    const { minutes_watched } = req.body; 
    
    if (!userId) {
        return res.status(401).json({ success: false, error: "Non connecté." });
    }
    
    if (!CACHE.streampoints[userId]) {
         // Assurer l'initialisation si l'utilisateur arrive directement ici
        CACHE.streampoints[userId] = { points: 100, last_activity: Date.now(), last_daily_bonus: null };
    }

    // Gain : 1 point par heure complète (60 minutes)
    const pointsToAdd = Math.floor(minutes_watched / 60); 
    
    if (pointsToAdd > 0) {
        CACHE.streampoints[userId].points += pointsToAdd;
        CACHE.streampoints[userId].last_activity = Date.now();
        console.log(`[Streampoints] +${pointsToAdd} points ajoutés à ${userId} pour ${minutes_watched} minutes de visionnage.`);
    }

    return res.json({ 
        success: true, 
        points_earned: pointsToAdd,
        new_points: CACHE.streampoints[userId].points,
    });
});

// Endpoint générique pour dépenser des points (Utilisé par /stream_boost)
app.post('/spend_streampoints', (req, res) => {
    const userId = req.cookies.twitch_user_id;
    const { cost, action } = req.body; 

    if (!userId) {
        return res.status(401).json({ success: false, error: "Non connecté." });
    }
    
    const userPoints = CACHE.streampoints[userId];
    const actualCost = action === 'STREAM_BOOST' ? STREAMPPOINTS_COST_BOOST : cost;

    if (!userPoints || userPoints.points < actualCost) {
        return res.status(402).json({ success: false, error: `Fonds insuffisants. Il vous faut ${actualCost} points pour effectuer cette action.` });
    }

    userPoints.points -= actualCost;
    userPoints.last_activity = Date.now();

    return res.json({ 
        success: true, 
        new_points: userPoints.points,
    });
});

// =========================================================
// --- ROUTES API (Authentification et IA) ---
// =========================================================

// Route d'authentification Twitch (Inchagée)
app.get('/auth/twitch', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    res.cookie('twitch_oauth_state', state, { httpOnly: true, secure: true });

    const authUrl = `https://id.twitch.tv/oauth2/authorize` +
        `?client_id=${TWITCH_CLIENT_ID}` +
        `&redirect_uri=${REDIRECT_URI}` +
        `&response_type=code` +
        `&scope=user:read:follows channel:read:subscriptions` + // Scopes requis
        `&state=${state}`;
    res.redirect(authUrl);
});

// Route de Callback Twitch (Inchagée)
app.get('/auth/callback', async (req, res) => {
    // ... (Logique de callback et de gestion des cookies - Omisses pour la concision) ...
    const { code, state } = req.query;

    if (state !== req.cookies.twitch_oauth_state) {
        return res.status(403).send('Erreur: État de requête invalide.');
    }

    try {
        const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: TWITCH_CLIENT_ID,
                client_secret: TWITCH_CLIENT_SECRET,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: REDIRECT_URI
            })
        });

        const tokenData = await tokenRes.json();
        const accessToken = tokenData.access_token;
        const refreshToken = tokenData.refresh_token;

        if (!accessToken) {
            console.error("Erreur d'obtention du token:", tokenData);
            return res.status(500).send('Échec de l\'authentification Twitch.');
        }

        const userData = await fetchUserIdentity(accessToken);
        const userId = userData.id;

        res.cookie('twitch_access_token', accessToken, { httpOnly: true, secure: true, maxAge: 7 * 24 * 60 * 60 * 1000 }); // 7 jours
        res.cookie('twitch_user_id', userId, { httpOnly: true, secure: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
        res.cookie('twitch_username', userData.display_name, { maxAge: 7 * 24 * 60 * 60 * 1000 });
        
        // Redirection vers l'application principale
        res.redirect('/'); 

    } catch (error) {
        console.error("Erreur lors de l'authentification:", error);
        res.status(500).send("Erreur serveur lors de l'authentification.");
    }
});

// Route pour vérifier le statut de l'utilisateur (Inchagée)
app.get('/twitch_user_status', async (req, res) => {
    // ... (Logique pour vérifier le statut de connexion) ...
    const accessToken = req.cookies.twitch_access_token;
    const userId = req.cookies.twitch_user_id;
    const username = req.cookies.twitch_username;
    
    if (accessToken && userId && username) {
        return res.json({ is_connected: true, username: username, id: userId });
    }
    res.json({ is_connected: false });
});

// Route de déconnexion (Inchagée)
app.post('/auth/logout', (req, res) => {
    // ... (Logique de déconnexion) ...
    res.clearCookie('twitch_access_token');
    res.clearCookie('twitch_user_id');
    res.clearCookie('twitch_username');
    res.clearCookie('twitch_oauth_state');
    res.json({ success: true, message: 'Déconnexion réussie.' });
});

// --- ROUTE STREAM BOOST (Intègre la dépense réelle de Streampoints) ---
app.post('/stream_boost', async (req, res) => {
    const userId = req.cookies.twitch_user_id;
    const { channel } = req.body;
    
    if (!userId) {
        return res.status(401).json({ error: "Authentification requise pour le Stream Boost." });
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
             <p style="color:#ffcc00; font-weight:bold;">
                ⏳ Cooldown actif.
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
        // Logique de dépense réelle
        const spendRes = await fetch(`http://localhost:${PORT}/spend_streampoints`, { // Utiliser l'URL complète
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
        
        // Activation du boost dans le cache (pour le cooldown)
        CACHE.streamBoosts[channel] = now;
        const updatedPoints = (await spendRes.json()).new_points; // Récupérer le nouveau solde

        const successMessage = `
            <p style="color:var(--color-primary-pink); font-weight:bold;">
                ✅ Boost de Stream Activé pour ${cost} Streampoints !
            </p>
            <p>
                La chaîne <strong>${channel}</strong> a été ajoutée à la rotation prioritaire. 
                Prochain boost dans 3 heures. Points restants : ${updatedPoints}.
            </p>
        `;

        return res.json({ 
            success: true, 
            html_response: successMessage,
            new_points: updatedPoints
        });

    } catch (e) {
         console.error("Erreur Boost:", e);
         return res.status(500).json({ error: "Erreur interne du serveur lors de l'activation du Boost." });
    }
});

// --- Toutes les routes IA (Scan, Titre, Critique, Repurposing) (Omisses pour la concision) ---
// Note: Le code complet doit contenir ces fonctions qui appellent l'API Gemini pour générer le contenu.
// ...

// =========================================================
// Configuration des Routes Statiques
// =========================================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

// Lancement du serveur
app.listen(PORT, () => {
    console.log(`Serveur Express démarré sur le port ${PORT}`);
    getAppAccessToken(); 
});
