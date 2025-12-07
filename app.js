/* =====================================================
  Twitch Niche Optimizer – app.js V8.0
  ✔ Routes OAuth réintégrées
  ✔ Cache pour le Boost restauré
  ✔ Logique complète pour l'analyse des streams suivis
  ===================================================== */

// ================== INIT ==================
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const crypto = require('crypto');

const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 10000;

// ================== ENV ==================
const {
  TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET,
  TWITCH_REDIRECT_URI, // Assurez-vous que cette variable est bien définie sur Render
  GEMINI_API_KEY
} = process.env;

// ================== MIDDLEWARES ==================
app.use(cors());
app.use(bodyParser.json({ limit: '200kb' }));
app.use(cookieParser());
// Assurez-vous que 'NicheOptimizer.html' et les autres fichiers sont à la racine (dirname)
app.use(express.static(path.join(__dirname))); 

// ================== IA ==================
const GEMINI_MODEL = 'gemini-2.5-flash';
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

// ================== CACHE (simple & volontaire) ==================
const CACHE = {
  twitchAppToken: null,
  twitchAppExpiry: 0,
  twitchUser: null,
  streamBoosts: {} // Ajouté pour l'outil Boost de Stream
};

// ================== UTILS ==================
function now() {
  return Date.now();
}

// ================== TWITCH AUTH ==================
async function getAppToken() {
  if (CACHE.twitchAppToken && CACHE.twitchAppExpiry > now()) {
    return CACHE.twitchAppToken;
  }

  const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
  const res = await fetch(url, { method: 'POST' });
  const data = await res.json();
  
  // Expiration à 5 minutes (300 000ms) avant l'heure réelle pour la sécurité
  CACHE.twitchAppToken = data.access_token;
  CACHE.twitchAppExpiry = now() + (data.expires_in * 1000) - 300000;
  console.log("DEBUG: Nouveau Token Twitch App généré et mis en cache.");
  return data.access_token;
}

async function twitchFetch(endpoint, userToken = null, method = 'GET', body = null) {
  const token = userToken || await getAppToken();
  const headers = {
    'Client-ID': TWITCH_CLIENT_ID,
    'Authorization': `Bearer ${token}`
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
    method: method,
    headers: headers,
    body: body ? JSON.stringify(body) : null
  });

  if (!res.ok) {
    const t = await res.text();
    // Limiter la taille du message d'erreur pour éviter des logs massifs
    throw new Error(`Twitch API error ${res.status}: ${t.slice(0, 150)}`);
  }

  return res.json();
}

// ================== GEMINI ==================
async function runIA(prompt, systemInstruction = 'Tu es un expert Twitch. Réponds en HTML simple (<h4>, <p>, <ul>, <li>, <strong>).') {
  if (!ai) {
    return { html_response: '<p style="color:red">IA non configurée. Clé GEMINI_API_KEY manquante.</p>' };
  }

  try {
    const r = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: systemInstruction
      }
    });

    return { html_response: r.text.trim() };
  } catch (e) {
    console.error("Erreur Gemini:", e);
    return { html_response: `<p style="color:red">Erreur IA : ${e.message}</p>` };
  }
}

// ================== ROUTES SYSTEM ==================

// Route racine - sert le NicheOptimizer
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

// ================== ROUTES TWITCH (OAuth & Session) ==================

// 1. Démarrage du flux OAuth (CORRIGE L'ERREUR Cannot GET)
app.get('/twitch_auth_start', (req, res) => {
    if (!TWITCH_CLIENT_ID || !TWITCH_REDIRECT_URI) {
        return res.status(500).send("Erreur de configuration (CLIENT_ID ou REDIRECT_URI manquant).");
    }
    const state = crypto.randomBytes(16).toString('hex');
    res.cookie('twitch_auth_state', state, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600000 });
    
    // Le scope est nécessaire pour lire les données utilisateur (streams suivis, etc.)
    const scope = 'user:read:follows'; 
    const authUrl = `https://id.twitch.tv/oauth2/authorize` +
        `?client_id=${TWITCH_CLIENT_ID}` +
        `&redirect_uri=${TWITCH_REDIRECT_URI}` +
        `&response_type=code` +
        `&scope=${scope}` +
        `&state=${state}`;
        
    res.redirect(authUrl);
});

// 2. Callback (Réception du Code)
app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
         return res.status(400).send(`Erreur d'authentification Twitch: ${error}.`);
    }

    const storedState = req.cookies.twitch_auth_state;
    
    if (!state || state !== storedState) {
        return res.status(403).send('Erreur: État invalide. Attaque CSRF potentielle.');
    }
    
    res.clearCookie('twitch_auth_state');

    const url = `https://id.twitch.tv/oauth2/token` +
        `?client_id=${TWITCH_CLIENT_ID}` +
        `&client_secret=${TWITCH_CLIENT_SECRET}` +
        `&code=${code}` +
        `&grant_type=authorization_code` +
        `&redirect_uri=${TWITCH_REDIRECT_URI}`;
        
    try {
        const response = await fetch(url, { method: 'POST' });
        const tokenData = await response.json();

        if (tokenData.access_token) {
            const userAccessToken = tokenData.access_token;
            
            // Récupérer l'identité de l'utilisateur pour l'ID et le nom
            const identityData = await twitchFetch('users', userAccessToken); 
            const identity = identityData.data && identityData.data.length > 0 ? identityData.data[0] : null;

            if (identity) {
                const cookieOptions = { httpOnly: true, secure: true, sameSite: 'lax', maxAge: tokenData.expires_in * 1000 };
                // Sauvegarder les tokens et infos dans les cookies
                res.cookie('twitch_access_token', userAccessToken, cookieOptions);
                res.cookie('twitch_user_id', identity.id, cookieOptions);
                res.cookie('twitch_username', identity.display_name, { maxAge: tokenData.expires_in * 1000 }); // Username peut être lu par le client

                res.redirect('/'); // Redirection vers la page principale après succès
            } else {
                return res.status(500).send("Erreur: Échec de la récupération de l'identité utilisateur après l'authentification.");
            }
        } else {
            return res.status(500).send("Erreur: Échec de l'échange de code pour le jeton d'accès.");
        }
    } catch (e) {
        return res.status(500).send(`Erreur lors de l'authentification: ${e.message}`);
    }
});

// 3. Vérifie l'état de la connexion (pour le client)
app.get('/twitch_user_status', async (req, res) => {
    const userAccessToken = req.cookies.twitch_access_token;
    const username = req.cookies.twitch_username;
    
    if (!userAccessToken || !username) {
        return res.json({ is_connected: false });
    }

    try {
        // Teste si le token est encore valide en faisant une requête simple
        await twitchFetch('users', userAccessToken); 
        
        return res.json({ 
            is_connected: true, 
            username: username
        });
    } catch (e) {
        // Le token a expiré ou est invalide
        res.clearCookie('twitch_access_token');
        res.clearCookie('twitch_user_id');
        res.clearCookie('twitch_username');
        return res.json({ is_connected: false });
    }
});

// 4. Déconnexion
app.post('/twitch_logout', (req, res) => {
    res.clearCookie('twitch_access_token');
    res.clearCookie('twitch_user_id');
    res.clearCookie('twitch_username');
    res.json({ success: true, message: "Déconnexion réussie" });
});

// ================== ROUTES TWITCH (General) ==================
app.get('/trending_games', async (req, res) => {
  try {
    const d = await twitchFetch('games/top?first=12');
    res.json({ success: true, games: d.data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Récupération des streams suivis (requiert token utilisateur)
app.get('/followed_streams', async (req, res) => {
    const userAccessToken = req.cookies.twitch_access_token;
    const userId = req.cookies.twitch_user_id;

    if (!userAccessToken || !userId) {
        return res.status(401).json({ success: false, error: "Non connecté." });
    }

    try {
        const d = await twitchFetch(`streams/followed?user_id=${userId}&first=50`, userAccessToken);
        
        // Enrichir les données avec le statut de boost
        const streams = d.data.map(stream => {
            const isBoosted = CACHE.streamBoosts[stream.user_login] && (now() - CACHE.streamBoosts[stream.user_login] < 600000); // 10 minutes (600000 ms)
            return {
                ...stream,
                is_boosted: isBoosted
            };
        });

        res.json({ success: true, streams: streams });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ================== ROUTES IA ==================

// Critique de niche / conseils généraux
app.post('/critique_ia', async (req, res) => {
  const { query, type } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'query manquante' });
  }

  let prompt = '';

  if (type === 'niche') {
    prompt = `Analyse la niche Twitch du jeu "${query}" :\n- forces\n- faiblesses\n- types de contenu efficaces`;
  } else {
    prompt = `Donne des conseils Twitch utiles pour : ${query}`;
  }

  const r = await runIA(prompt);
  res.json(r);
});

// Outil Sniper (analyse de streamer ou de jeu)
app.post('/scan_target', async (req, res) => {
    const { target_type, target_value } = req.body;

    if (!target_value) {
        return res.status(400).json({ html_response: '<p style="color:red">Valeur cible manquante.</p>' });
    }

    let prompt = '';
    
    if (target_type === 'game') {
        prompt = `Fais une analyse détaillée et stratégique de la niche du jeu '${target_value}' sur Twitch. Fournis une structure claire :\n\n- Taille et Compétition (Nombre de streamers)\n- Potentiel de Croissance (Tendance)\n- Conseils de Contenu Uniques (Streamer plus petit)\n- Recommandation finale (À faire ou à éviter)`;
    } else if (target_type === 'streamer') {
        // Logique spécifique au streamer
        const userAccessToken = req.cookies.twitch_access_token;
        if (!userAccessToken) {
            return res.status(401).json({ html_response: '<p style="color:red">Connectez-vous pour analyser des streamers.</p>' });
        }
        
        try {
            // 1. Chercher l'ID du streamer
            const userData = await twitchFetch(`users?login=${target_value}`, userAccessToken);
            const streamerId = userData.data[0]?.id;
            
            if (!streamerId) {
                return res.status(404).json({ html_response: `<p style="color:red">Streamer '${target_value}' non trouvé.</p>` });
            }

            // 2. Chercher les 5 derniers clips (pour l'analyse de contenu)
            const clipData = await twitchFetch(`clips?broadcaster_id=${streamerId}&first=5`, userAccessToken);
            const clips = clipData.data.map(c => `Titre: ${c.title} - Vues: ${c.view_count}`).join('\n');
            
            // 3. Chercher le statut du stream actuel (si en ligne)
            const streamData = await twitchFetch(`streams?user_id=${streamerId}`, userAccessToken);
            const isLive = streamData.data.length > 0;
            const liveInfo = isLive ? `EN LIVE sur ${streamData.data[0].game_name} avec ${streamData.data[0].viewer_count} viewers. Titre: ${streamData.data[0].title}` : "OFFLINE.";

            prompt = `Fais une critique stratégique du streamer Twitch '${target_value}' :\n\n- Statut Actuel: ${liveInfo}\n- Analyse des 5 Derniers Clips (Volume/Titre): ${clips}\n- Conseils de Branding (Amélioration du nom/niche)\n- Recommandation de Contenu (Basée sur les clips/le jeu actuel).`;

        } catch (e) {
            return res.status(500).json({ html_response: `<p style="color:red">Erreur API Twitch lors du scan: ${e.message}</p>` });
        }
    } else {
        return res.status(400).json({ html_response: '<p style="color:red">Type de cible invalide.</p>' });
    }

    const r = await runIA(prompt);
    res.json(r);
});

// Mini Assistant
app.post('/mini_assistant', async (req, res) => {
  const { q } = req.body;
  if (!q) return res.json({ html_response: '' });

  const r = await runIA(`Question rapide Twitch : ${q}`);
  res.json(r);
});

// Outil Stream Boost
app.post('/stream_boost', (req, res) => {
    const channel = req.cookies.twitch_username;
    if (!channel) {
        return res.status(401).json({ success: false, html_response: '<p style="color:red">Non connecté.</p>' });
    }

    const nowTime = now();
    const threeHours = 3 * 60 * 60 * 1000;
    const lastBoost = CACHE.streamBoosts[channel] || 0;

    if (nowTime - lastBoost < threeHours) {
        const remainingTimeMs = threeHours - (nowTime - lastBoost);
        const remainingMinutes = Math.ceil(remainingTimeMs / (60 * 1000));
        const errorMessage = `
            <p style="color:red; font-weight:bold;">
                ❌ Temps d'attente
            </p>
            <p>
                Le Boost de Stream n'est disponible que toutes les 3 heures. 
                Veuillez patienter encore ${remainingMinutes} minutes.
            </p>
        `;
        return res.json({ 
            success: false, 
            html_response: errorMessage
        });
    }

    CACHE.streamBoosts[channel] = nowTime;

    const successMessage = `
        <p style="color:var(--color-primary-pink); font-weight:bold;">
            ✅ Boost de Stream Activé !
        </p>
        <p>
            La chaîne <strong>${channel}</strong> a été ajoutée à la rotation prioritaire pour une période de 10 minutes. 
            Le prochain boost sera disponible dans 3 heures. Bonne chance !
        </p>
    `;

    return res.json({ 
        success: true, 
        html_response: successMessage 
    });
});


// ================== START ==================
app.listen(PORT, () => {
  console.log(`✅ Twitch Niche Optimizer prêt sur http://localhost:${PORT}`);
});
