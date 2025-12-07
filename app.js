const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

// Assurez-vous d'avoir installé : npm install @google/genai express cors node-fetch body-parser cookie-parser
const { GoogleGenAI } = require('@google/genai');

const app = express();

// =========================================================
// --- CONFIGURATION ET VARIABLES D'ENVIRONNEMENT ---
// =========================================================

const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || 'VOTRE_CLIENT_ID_TWITCH';
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || 'VOTRE_SECRET_TWITCH';

// ✅ CORRECTION 1 : Domaine public Render utilisé comme base
const RENDER_DOMAIN = 'https://justplayerstreamhubpro.onrender.com';
// La variable REDIRECT_URI est déjà correcte dans votre fichier (pointant vers Render)
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI || `${RENDER_DOMAIN}/twitch_auth_callback`; 

// CLÉ API GEMINI
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'VOTRE_CLE_API_GEMINI'; 
const GEMINI_MODEL = "gemini-2.0-flash"; 

let ai = null;
if (GEMINI_API_KEY && GEMINI_API_KEY !== 'VOTRE_CLE_API_GEMINI') {
    ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY }); 
} else {
    console.error("ATTENTION: Clé Gemini manquante ou invalide. L'IA ne fonctionnera pas.");
}

// =========================================================
// MIDDLEWARES & STOCKAGE SESSION SIMULÉ
// =========================================================

app.use(cors({
    origin: RENDER_DOMAIN, // Assurez-vous que l'origine est autorisée
    credentials: true // Crucial pour l'envoi des cookies
}));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 

// Remplacez le cache par une Map pour la gestion des sessions
const userSessions = new Map();

// Helper pour vérifier si l'utilisateur est connecté
async function checkTwitchAuth(req, res, next) {
    const sessionId = req.cookies.session_id;
    const session = userSessions.get(sessionId);
    if (session && session.accessToken && session.expiresAt > Date.now()) {
        req.session = session;
        next();
    } else {
        // Supprime le cookie invalide
        res.clearCookie('session_id'); 
        res.status(401).json({ success: false, error: "Non authentifié", html_response: "<p style='color:red;'>❌ Connexion Twitch requise pour cette action.</p>" });
    }
}

// =========================================================
// ROUTES AUTHENTIFICATION TWITCH (OAUTH 2.0)
// =========================================================

app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    // Portée des droits inchangée
    const scope = "user:read:email user:read:follows channel:read:subscriptions user:read:broadcast"; 
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${scope}&state=${state}`;
    
    // ✅ CORRECTION 2 : Paramètres de cookie sécurisés pour Render (HTTPS)
    res.cookie('twitch_state', state, { 
        httpOnly: true, 
        secure: true, 
        sameSite: 'None', // Autorise le cookie cross-site
        maxAge: 600000 
    }); 
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error } = req.query;
    const expectedState = req.cookies.twitch_state;

    // Supprime le cookie d'état immédiatement
    res.clearCookie('twitch_state'); 
    
    if (!state || state !== expectedState) {
        return res.redirect(`${RENDER_DOMAIN}/?error=oauth_state_invalid`);
    }
    if (error) {
        return res.redirect(`${RENDER_DOMAIN}/?error=twitch_auth_failed&message=${encodeURIComponent(error)}`);
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
        if (tokenData.error) {
            return res.redirect(`${RENDER_DOMAIN}/?error=token_exchange_failed&message=${encodeURIComponent(tokenData.message)}`);
        }

        const { access_token, refresh_token, expires_in } = tokenData;
        
        // Récupération des données utilisateur (similaire à la logique de votre fichier)
        const userRes = await fetch('https://api.twitch.tv/helix/users', {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${access_token}`
            }
        });
        const userData = await userRes.json();
        const user = userData.data[0];
        const sessionId = crypto.randomBytes(16).toString('hex');
        
        userSessions.set(sessionId, {
            id: user.id,
            username: user.login,
            displayName: user.display_name,
            accessToken: access_token,
            refreshToken: refresh_token,
            expiresAt: Date.now() + (expires_in * 1000)
        });

        // ✅ CORRECTION 3 : Paramètres de cookie de session sécurisés pour Render (HTTPS)
        res.cookie('session_id', sessionId, { 
            httpOnly: true, 
            secure: true, 
            sameSite: 'None', 
            maxAge: 90 * 24 * 60 * 60 * 1000 // 90 jours
        });
        
        res.redirect(RENDER_DOMAIN); // Redirige vers la racine Render

    } catch (error) {
        res.redirect(`${RENDER_DOMAIN}/?error=internal_auth_error`);
    }
});


// ... (Toutes les autres routes /twitch_user_status, /followed_streams, /scan_target, etc. restent inchangées)

// --- Exemples de routes pour assurer la continuité ---
app.get('/twitch_user_status', checkTwitchAuth, (req, res) => {
    // ... (Logique pour renvoyer le statut de l'utilisateur)
    res.json({ 
        success: true, 
        is_connected: true, 
        display_name: req.session.displayName, 
        profile_image_url: req.session.profile_image_url 
    });
});

app.post('/twitch_logout', (req, res) => {
    // ... (Logique de déconnexion)
    const sessionId = req.cookies.session_id;
    userSessions.delete(sessionId);
    res.clearCookie('session_id', { httpOnly: true, secure: true, sameSite: 'None' });
    res.json({ success: true, message: "Déconnexion réussie." });
});

// ... (Ajoutez toutes vos autres routes ici pour que le fichier soit complet) ...

// =========================================================
// ROUTE RACINE & DÉMARRAGE SERVEUR (CORRIGÉE)
// =========================================================

// ✅ CORRECTION 4 : Sert le fichier HTML à la racine
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html')); 
});

app.listen(PORT, () => {
    console.log(`Serveur Back-end démarré sur le port ${PORT}`);
    console.log(`Adresse de redirection Twitch configurée: ${REDIRECT_URI}`);
    console.log("------------------------------------------");
});
