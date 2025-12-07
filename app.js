/* =====================================================
   Twitch Niche Optimizer – app.js FINAL (ultra clean)
   ✔ Stable
   ✔ Lisible
   ✔ Prêt prod / hébergement
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
  TWITCH_REDIRECT_URI,
  GEMINI_API_KEY
} = process.env;

// ================== MIDDLEWARES ==================
app.use(cors());
app.use(bodyParser.json({ limit: '200kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

// ================== IA ==================
const GEMINI_MODEL = 'gemini-2.5-flash';
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

// ================== CACHE (simple & volontaire) ==================
const CACHE = {
  twitchAppToken: null,
  twitchAppExpiry: 0,
  twitchUser: null
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

  CACHE.twitchAppToken = data.access_token;
  CACHE.twitchAppExpiry = now() + (data.expires_in * 1000) - 300000;

  return data.access_token;
}

async function twitchFetch(endpoint, userToken = null) {
  const token = userToken || await getAppToken();
  const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
    headers: {
      'Client-ID': TWITCH_CLIENT_ID,
      'Authorization': `Bearer ${token}`
    }
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Twitch API error ${res.status}: ${t.slice(0, 100)}`);
  }

  return res.json();
}

// ================== GEMINI ==================
async function runIA(prompt) {
  if (!ai) {
    return { html_response: '<p style="color:red">IA non configurée.</p>' };
  }

  try {
    const r = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction:
          'Tu es un expert Twitch. Réponds en HTML simple (<h4>, <p>, <ul>, <li>, <strong>).'
      }
    });

    return { html_response: r.text.trim() };
  } catch (e) {
    return { html_response: `<p style="color:red">Erreur IA : ${e.message}</p>` };
  }
}

// ================== ROUTES SYSTEM ==================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

// ================== ROUTES TWITCH ==================
app.get('/trending_games', async (req, res) => {
  try {
    const d = await twitchFetch('games/top?first=12');
    res.json({ success: true, games: d.data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ================== ROUTES IA ==================
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

app.post('/mini_assistant', async (req, res) => {
  const { q } = req.body;
  if (!q) return res.json({ html_response: '' });

  const r = await runIA(`Question rapide Twitch : ${q}`);
  res.json(r);
});

// ================== START ==================
app.listen(PORT, () => {
  console.log(`✅ Twitch Niche Optimizer prêt sur http://localhost:${PORT}`);
});
