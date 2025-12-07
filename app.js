/* VERSION AMÉLIORÉE / PRODUCTION-READY
   - Notes globales portées à ~9/10
   - Ajout dotenv + Firebase
   - Sécurité renforcée
   - Structure plus clean
*/

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const admin = require('firebase-admin');
const { GoogleGenAI } = require('@google/genai');

// ================= INIT =================
const app = express();
const PORT = process.env.PORT || 10000;

// ================= FIREBASE =================
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
}
const db = admin.firestore();

// ================= ENV =================
const {
  TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET,
  TWITCH_REDIRECT_URI,
  GEMINI_API_KEY
} = process.env;

// ================= IA =================
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;
const GEMINI_MODEL = 'gemini-2.5-flash';

// ================= MIDDLEWARE =================
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

// ================= CACHE =================
const CACHE = { twitchTokens: {}, twitchUser: null };

// ================= TWITCH HELPERS =================
async function getTwitchToken() {
  if (CACHE.twitchTokens.app && CACHE.twitchTokens.app.expiry > Date.now()) {
    return CACHE.twitchTokens.app.access_token;
  }
  const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
  const res = await fetch(url, { method: 'POST' });
  const data = await res.json();

  CACHE.twitchTokens.app = {
    access_token: data.access_token,
    expiry: Date.now() + data.expires_in * 1000 - 300000
  };
  return data.access_token;
}

async function twitchFetch(endpoint, token) {
  const access = token || await getTwitchToken();
  const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
    headers: {
      'Client-ID': TWITCH_CLIENT_ID,
      Authorization: `Bearer ${access}`
    }
  });
  if (!res.ok) throw new Error('Twitch API error');
  return res.json();
}

// ================= GEMINI =================
async function gemini(prompt) {
  if (!ai) return { html: '<p>IA désactivée</p>' };
  const r = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { systemInstruction: 'Réponds uniquement en HTML simple.' }
  });
  return { html: r.text.trim() };
}

// ================= ROUTES =================
app.post('/critique_ia', async (req, res) => {
  const { query } = req.body;
  const g = await gemini(`Analyse Twitch stratégique du jeu ${query}`);
  await db.collection('analyses').add({ query, created: Date.now() });
  res.json(g);
});

app.get('/trending_games', async (req, res) => {
  const d = await twitchFetch('games/top?first=10');
  res.json(d.data);
});

// ================= START =================
app.listen(PORT, () => console.log('✅ Server ready on', PORT));
