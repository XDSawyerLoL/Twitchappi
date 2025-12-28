/**
 * STREAMER & NICHE AI HUB - V51 (SANS @google/genai)
 * =====================================================
 * ✅ Gemini via HTTP REST API (aucun SDK problématique)
 * ✅ package.json nettoyé
 * ✅ Render compatible 100%
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const admin = require('firebase-admin');

// =========================================================
// 0. INITIALISATION FIREBASE
// =========================================================
let serviceAccount;

if (process.env.FIREBASE_SERVICE_KEY) {
  try {
    let rawJson = process.env.FIREBASE_SERVICE_KEY;
    if (rawJson.startsWith("'") && rawJson.endsWith("'")) rawJson = rawJson.slice(1, -1);
    if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.slice(1, -1);
    rawJson = rawJson.replace(/\\r\\n/g, '\\n').replace(/\\n/g, '\\n').replace(/\\r/g, '\\n');
    serviceAccount = JSON.parse(rawJson);
  } catch (error) {
    console.error("❌ [FIREBASE] Erreur JSON:", error.message);
  }
}

if (serviceAccount) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id
    });
    console.log("✅ [FIREBASE] Initialisé avec succès");
  } catch (e) {
    console.error("❌ [FIREBASE] Erreur Init:", e.message);
  }
}

const db = admin.firestore();

const app = express();

// =========================================================
// 1. CONFIGURATION
// =========================================================
const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

console.log('✅ [IA] Gemini HTTP API prêt');

app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'https://justplayer.fr'],
  credentials: true
}));
app.use(bodyParser.json({ limit: '10kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

// =========================================================
// 2. CACHE & HELPERS
// =========================================================
const CACHE = {
  twitchTokens: {},
  twitchUser: null,
  boostedStream: null,
  lastScanData: null,
  globalStreamRotation: { streams: [], currentIndex: 0, lastFetchTime: 0, fetchCooldown: 3 * 60 * 1000 }
};

async function getTwitchToken(tokenType = 'app') {
  if (CACHE.twitchTokens[tokenType] && CACHE.twitchTokens[tokenType].expiry > Date.now()) {
    return CACHE.twitchTokens[tokenType].access_token;
  }

  try {
    const res = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
      { method: 'POST' }
    );
    const data = await res.json();
    if (data.access_token) {
      CACHE.twitchTokens[tokenType] = {
        access_token: data.access_token,
        expiry: Date.now() + (data.expires_in * 1000) - 300000
      };
      return data.access_token;
    }
  } catch (e) {}
  return null;
}

async function twitchAPI(endpoint, token = null) {
  const accessToken = token || await getTwitchToken('app');
  if (!accessToken) throw new Error("No Token");
  
  const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
    headers: {
      'Client-ID': TWITCH_CLIENT_ID,
      'Authorization': `Bearer ${accessToken}`
    }
  });
  
  if (res.status === 401) {
    if (token === CACHE.twitchTokens['app']?.access_token) CACHE.twitchTokens['app'] = null;
    throw new Error("Token expiré");
  }
  
  return res.json();
}

// ✅ GEMINI VIA HTTP REST (AUCUN SDK)
async function runGeminiAnalysis(prompt) {
  if (!GEMINI_API_KEY) {
    return { success: false, html_response: "<p>❌ Clé Gemini manquante.</p>" };
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024
          }
        })
      }
    );

    const data = await response.json();
    
    if (data.candidates && data.candidates[0]) {
      const text = data.candidates[0].content.parts[0].text || 'Réponse vide.';
      return { success: true, html_response: text.trim() };
    }
    
    return { success: false, html_response: "<p>❌ Réponse IA invalide.</p>" };
  } catch (e) {
    console.error('🔥 [IA HTTP] Error:', e.message);
    return { success: false, html_response: "<p>⚠️ Erreur IA temporaire.</p>" };
  }
}

// =========================================================
// 3. ROUTES AUTH
// =========================================================
app.get('/twitch_auth_start', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=user:read:follows&state=${state}`;
  
  res.cookie('twitch_state', state, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 600000 });
  res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state || state !== req.cookies.twitch_state) return res.status(401).send("❌ Auth failed");

  try {
    const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: TWITCH_CLIENT_ID,
        client_secret: TWITCH_CLIENT_SECRET,
        code, grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI
      })
    });

    const tokenData = await tokenRes.json();
    if (tokenData.access_token) {
      const userRes = await twitchAPI('users', tokenData.access_token);
      const user = userRes.data[0];
      
      CACHE.twitchUser = {
        display_name: user.display_name,
        id: user.id,
        profile_image_url: user.profile_image_url,
        access_token: tokenData.access_token,
        expiry: Date.now() + (tokenData.expires_in * 1000)
      };
      
      res.send("<script>window.close();</script>");
    } else {
      res.status(401).send("❌ Token error");
    }
  } catch (e) {
    res.status(500).send("❌ Erreur serveur");
  }
});

app.post('/twitch_logout', (req, res) => {
  CACHE.twitchUser = null;
  res.json({ success: true });
});

app.get('/twitch_user_status', (req, res) => {
  if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) {
    return res.json({
      is_connected: true,
      display_name: CACHE.twitchUser.display_name,
      profile_image_url: CACHE.twitchUser.profile_image_url
    });
  }
  res.json({ is_connected: false });
});

// =========================================================
// 4. STREAMS & ROTATION
// =========================================================
app.get('/followed_streams', async (req, res) => {
  if (!CACHE.twitchUser) return res.status(401).json({ success: false });
  try {
    const data = await twitchAPI(`streams/followed?user_id=${CACHE.twitchUser.id}&first=20`, CACHE.twitchUser.access_token);
    res.json({
      success: true,
      streams: data.data.map(s => ({
        user_name: s.user_name,
        user_login: s.user_login,
        viewer_count: s.viewer_count,
        thumbnail_url: s.thumbnail_url?.replace('{width}', '400').replace('{height}', '225') || null,
        game_name: s.game_name
      }))
    });
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

async function refreshGlobalStreamList() {
  const rot = CACHE.globalStreamRotation;
  const now = Date.now();
  if (now - rot.lastFetchTime < rot.fetchCooldown && rot.streams.length > 0) return;

  try {
    const data = await twitchAPI(`streams?language=fr&first=100`);
    let suitable = data.data.filter(s => s.viewer_count <= 100);
    if (suitable.length === 0) suitable = data.data.slice(-10);
    
    if (suitable.length > 0) {
      rot.streams = suitable.sort(() => 0.5 - Math.random()).map(s => ({
        channel: s.user_login,
        viewers: s.viewer_count
      }));
      rot.currentIndex = 0;
      rot.lastFetchTime = now;
    }
  } catch (e) {}
}

app.get('/get_default_stream', async (req, res) => {
  try {
    const now = Date.now();
    let boost = null;

    if (db) {
      try {
        const q = await db.collection('boosts').where('endTime', '>', now).orderBy('endTime', 'desc').limit(1).get();
        if (!q.empty) {
          boost = q.docs[0].data();
          CACHE.boostedStream = boost;
        }
      } catch (e) {
        if (CACHE.boostedStream?.endTime > now) boost = CACHE.boostedStream;
      }
    }

    if (boost) {
      return res.json({ success: true, channel: boost.channel, mode: 'BOOST' });
    }

    await refreshGlobalStreamList();
    const rot = CACHE.globalStreamRotation;
    
    if (rot.streams.length === 0) {
      return res.json({ success: true, channel: 'twitch', mode: 'FALLBACK' });
    }

    return res.json({
      success: true,
      channel: rot.streams[rot.currentIndex].channel,
      mode: 'AUTO',
      viewers: rot.streams[rot.currentIndex].viewers
    });
  } catch (e) {
    res.json({ success: true, channel: 'twitch', mode: 'ERROR_FALLBACK' });
  }
});

app.post('/cycle_stream', async (req, res) => {
  const { direction } = req.body;
  if (CACHE.boostedStream?.endTime > Date.now()) {
    return res.json({ success: false });
  }
  
  await refreshGlobalStreamList();
  const rot = CACHE.globalStreamRotation;
  if (rot.streams.length === 0) return res.json({ success: false });
  
  if (direction === 'next') {
    rot.currentIndex = (rot.currentIndex + 1) % rot.streams.length;
  } else {
    rot.currentIndex = (rot.currentIndex - 1 + rot.streams.length) % rot.streams.length;
  }
  
  res.json({ success: true, channel: rot.streams[rot.currentIndex].channel });
});

// =========================================================
// 5. STATS
// =========================================================
app.get('/api/stats/global', async (req, res) => {
  try {
    const data = await twitchAPI('streams?language=fr&first=100');
    let v = 0;
    data.data.forEach(s => v += s.viewer_count);
    const est = Math.floor(v * 3.8);
    
    const history = { live: { labels: ['Est.'], values: [est] } };
    
    res.json({
      success: true,
      total_viewers: est,
      total_channels: "98k+",
      history: history
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/stats/top_games', async (req, res) => {
  try {
    const d = await twitchAPI('games/top?first=10');
    res.json({
      games: d.data.map(g => ({
        name: g.name,
        box_art_url: g.box_art_url?.replace('{width}', '52').replace('{height}', '72') || null
      }))
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/stats/languages', async (req, res) => {
  try {
    const d = await twitchAPI('streams?language=fr&first=100');
    const l = {};
    d.data.forEach(s => l[s.language] = (l[s.language] || 0) + 1);
    
    const sorted = Object.keys(l)
      .map(k => ({ name: k.toUpperCase(), percent: l[k] }))
      .sort((a, b) => b.percent - a.percent)
      .slice(0, 5);
    
    res.json({ languages: sorted });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =========================================================
// 6. SCAN & TOOLS
// =========================================================
app.post('/scan_target', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || query.length > 100) return res.status(400).json({ success: false });

    const uRes = await twitchAPI(`users?login=${encodeURIComponent(query)}`);
    if (uRes.data?.length) {
      const u = uRes.data[0];
      let channelInfo = {};
      try {
        const cRes = await twitchAPI(`channels?broadcaster_id=${u.id}`);
        if (cRes.data?.length > 0) channelInfo = cRes.data[0];
      } catch (e) {}
      
      let streamInfo = null;
      try {
        const sRes = await twitchAPI(`streams?user_id=${u.id}`);
        if (sRes.data?.length > 0) streamInfo = sRes.data[0];
      } catch (e) {}
      
      const isLive = !!streamInfo;
      const uData = {
        login: u.login,
        display_name: u.display_name,
        profile_image_url: u.profile_image_url,
        description: u.description || "Aucune bio.",
        created_at: new Date(u.created_at).toLocaleDateString('fr-FR'),
        game_name: channelInfo.game_name || "Aucun jeu défini",
        title: channelInfo.title || "Aucun titre",
        tags: channelInfo.tags ? channelInfo.tags.slice(0, 3).join(', ') : "Aucun",
        language: channelInfo.broadcaster_language || "fr",
        view_count: u.view_count || 0,
        is_live: isLive,
        viewer_count: isLive ? streamInfo.viewer_count : 0,
        ai_calculated_niche_score: isLive && streamInfo.viewer_count < 100 ? "4.8/5" : "3.0/5"
      };
      
      CACHE.lastScanData = { type: 'user', ...uData };
      return res.json({ success: true, type: 'user', user_data: uData });
    }
    
    res.json({ success: false });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/critique_ia', async (req, res) => {
  const { type, query } = req.body;
  const prompt = type === 'niche' ? `Audit "${query}" Twitch.` : `Idées clips "${query}".`;
  res.json(await runGeminiAnalysis(prompt));
});

app.post('/stream_boost', async (req, res) => {
  const { channel } = req.body;
  if (!channel || !db) return res.status(503).json({ success: false });
  
  const now = Date.now();
  try {
    await db.collection('boosts').add({
      channel: channel.toLowerCase(),
      startTime: now,
      endTime: now + 900000
    });
    CACHE.boostedStream = { channel, endTime: now + 900000 };
    res.json({ success: true, message: "Boost activé!" });
  } catch (e) {
    res.status(500).json({ error: "Erreur DB" });
  }
});

app.post('/start_raid', async (req, res) => {
  const { game, max_viewers } = req.body;
  try {
    const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(game)}&first=1`);
    if (!gRes.data?.length) return res.json({ success: false });
    
    const sRes = await twitchAPI(`streams?game_id=${gRes.data[0].id}&first=100&language=fr`);
    const target = sRes.data
      .filter(s => s.viewer_count <= max_viewers)
      .sort((a, b) => b.viewer_count - a.viewer_count)[0];
    
    if (target) {
      const thumb = target.thumbnail_url?.replace('{width}', '320').replace('{height}', '180') || null;
      return res.json({
        success: true,
        target: {
          name: target.user_name,
          login: target.user_login,
          viewers: target.viewer_count,
          thumbnail_url: thumb,
          game: target.game_name
        }
      });
    }
    
    res.json({ success: false });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =========================================================
// 7. STATIC & HEALTH
// =========================================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    firebase: !!db,
    gemini: !!GEMINI_API_KEY,
    uptime: process.uptime()
  });
});

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   🎮 STREAMER NICHE AI HUB - V51    ║
║   ✅ SANS SDK | HTTP GEMINI | OK     ║
║   Serveur ACTIF sur port ${PORT}     ║
╚════════════════════════════════════════╝
  `);
});
