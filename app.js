/**
 * STREAMER & NICHE AI HUB - BACKEND (V52 - ROUTES FIX + STREAM_INFO + ANALYTICS FORMAT)
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const http = require('http');
const { Server } = require('socket.io');

const { GoogleGenAI } = require('@google/genai');
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
    console.error("❌ Erreur JSON Firebase:", error.message);
  }
} else {
  try { serviceAccount = require('./serviceAccountKey.json'); } catch (e) {}
}

try {
  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id
    });
    console.log("✅ [FIREBASE] Base de données connectée.");
  } else {
    admin.initializeApp();
    console.log("⚠️ [FIREBASE] Init sans service account (env).");
  }
} catch (e) {
  console.error("❌ [FIREBASE] Init:", e.message);
}

const db = admin.firestore();
try {
  if (serviceAccount) {
    db.settings({ projectId: serviceAccount.project_id, ignoreUndefinedProperties: true });
  }
} catch (e) {}

// =========================================================
// 1. CONFIGURATION
// =========================================================
const app = express();
const PORT = process.env.PORT || 10000;

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash";

let aiClient = null;
if (GEMINI_API_KEY) {
  try {
    aiClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    console.log("✅ [IA] Moteur Gemini prêt.");
  } catch (e) {
    console.error("❌ [IA] Init:", e.message);
  }
}

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

// UI
app.get('/', (req, res) => {
  const candidates = [
    process.env.UI_FILE,
    'NicheOptimizer.html',
    'NicheOptimizer_v56.html',
    'NicheOptimizer_v55.html'
  ].filter(Boolean);

  const found = candidates.find(f => fs.existsSync(path.join(__dirname, f)));
  if (!found) return res.status(500).send('UI introuvable sur le serveur.');
  return res.sendFile(path.join(__dirname, found));
});

// =========================================================
// 2. CACHE & HELPERS
// =========================================================
const CACHE = {
  twitchTokens: {},
  twitchUser: null,
  boostedStream: null,
  globalStreamRotation: {
    streams: [],
    currentIndex: 0,
    lastFetchTime: 0,
    fetchCooldown: 3 * 60 * 1000
  }
};

const ENABLE_CRON = (process.env.ENABLE_CRON || 'true').toLowerCase() !== 'false';
const SNAPSHOT_EVERY_MIN = parseInt(process.env.SNAPSHOT_EVERY_MIN || '5', 10);

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function yyyy_mm_dd_from_ms(ms) {
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

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
  } catch (e) { return null; }
  return null;
}

async function twitchAPI(endpoint, token = null) {
  const accessToken = token || await getTwitchToken('app');
  if (!accessToken) throw new Error("No Token.");

  const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
    headers: {
      'Client-ID': TWITCH_CLIENT_ID,
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (res.status === 401) {
    CACHE.twitchTokens['app'] = null;
    throw new Error(`Token expiré.`);
  }
  return res.json();
}

async function runGeminiAnalysis(prompt) {
  if (!aiClient) {
    return { success: false, html_response: "<p style='color:red;'>❌ IA non initialisée.</p>" };
  }
  try {
    const response = await aiClient.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: "Tu es un expert Data Twitch. Réponds UNIQUEMENT en HTML simple (<p>, <h4>, <ul>, <li>, <strong>). Pas de markdown, pas de backticks."
      }
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return { success: true, html_response: text };
  } catch (e) {
    console.error("❌ Erreur IA:", e);
    return { success: false, html_response: `<p style='color:red;'>❌ Erreur IA: ${e.message}</p>` };
  }
}

function computeGrowthScoreLite({ avgViewers = 0, growthPct = 0, volatility = 0, hoursPerWeek = 0 }) {
  const logPart = Math.log10(avgViewers + 1) * 22;
  const growthPart = clamp(growthPct, -50, 200) * 0.22;
  const volPenalty = clamp(volatility, 0, 200) * 0.18;
  const hoursPart = clamp(hoursPerWeek, 0, 80) * 0.25;
  const raw = 15 + logPart + growthPart + hoursPart - volPenalty;
  return Math.round(clamp(raw, 0, 100));
}

// =========================================================
// FIREBASE STATUS
// =========================================================
app.get('/firebase_status', (req, res) => {
  try {
    if (db && admin.apps.length > 0) {
      res.json({ connected: true, message: 'Firebase connected', hasServiceAccount: !!serviceAccount });
    } else {
      res.json({ connected: false, message: 'Firebase not initialized' });
    }
  } catch (error) {
    res.json({ connected: false, error: error.message });
  }
});

// =========================================================
// AUTH
// =========================================================
app.get('/twitch_auth_start', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${state}`;
  res.cookie('twitch_state', state, { httpOnly: true, secure: true, maxAge: 600000 });
  res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
  const { code, state } = req.query;
  if (state !== req.cookies.twitch_state) return res.send("Erreur Auth.");

  try {
    const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: TWITCH_CLIENT_ID,
        client_secret: TWITCH_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI
      })
    });

    const tokenData = await tokenRes.json();
    if (tokenData.access_token) {
      const userRes = await twitchAPI('users', tokenData.access_token);
      const user = userRes.data[0];
      CACHE.twitchUser = {
        display_name: user.display_name,
        profile_image_url: user.profile_image_url,
        id: user.id,
        access_token: tokenData.access_token,
        expiry: Date.now() + (tokenData.expires_in * 1000)
      };
      res.send("<script>window.close();</script>");
    } else {
      res.send("Erreur Token.");
    }
  } catch (e) {
    res.send("Erreur Serveur.");
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
// STREAM INFO (✅ manquant dans ton code -> ajouté)
// =========================================================
app.post('/stream_info', async (req, res) => {
  const channel = String(req.body?.channel || '').trim().toLowerCase();
  if (!channel || channel === 'twitch') return res.json({ success:false });

  try {
    const u = await twitchAPI(`users?login=${encodeURIComponent(channel)}`);
    if (!u.data?.length) return res.json({ success:false });

    const user = u.data[0];
    const s = await twitchAPI(`streams?user_id=${user.id}`);
    const stream = s.data?.[0] || null;

    if (!stream) {
      return res.json({
        success: true,
        stream: {
          title: null,
          viewer_count: 0,
          game_id: null,
          game_name: null
        }
      });
    }

    return res.json({
      success: true,
      stream: {
        title: stream.title || null,
        viewer_count: stream.viewer_count || 0,
        game_id: stream.game_id || null,
        game_name: stream.game_name || null
      }
    });
  } catch (e) {
    return res.json({ success:false, error: e.message });
  }
});

// =========================================================
// FOLLOWED STREAMS
// =========================================================
app.get('/followed_streams', async (req, res) => {
  if (!CACHE.twitchUser) return res.status(401).json({ success: false });

  try {
    const data = await twitchAPI(
      `streams/followed?user_id=${CACHE.twitchUser.id}`,
      CACHE.twitchUser.access_token
    );
    return res.json({
      success: true,
      streams: (data.data || []).map(s => ({
        user_id: s.user_id,
        user_name: s.user_name,
        user_login: s.user_login,
        viewer_count: s.viewer_count,
        game_id: s.game_id || null,
        game_name: s.game_name || null,
        title: s.title || null,
        thumbnail_url: s.thumbnail_url
      }))
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// =========================================================
// ROTATION & BOOST
// =========================================================
async function refreshGlobalStreamList() {
  const now = Date.now();
  const rot = CACHE.globalStreamRotation;

  if (now - rot.lastFetchTime < rot.fetchCooldown && rot.streams.length > 0) return;

  const data = await twitchAPI(`streams?language=fr&first=100`);
  let suitable = (data.data || []).filter(s => (s.viewer_count || 0) <= 100);
  if (suitable.length === 0) suitable = (data.data || []).slice(-10);

  rot.streams = suitable.sort(() => 0.5 - Math.random()).map(s => ({
    channel: s.user_login,
    viewers: s.viewer_count
  }));
  rot.currentIndex = 0;
  rot.lastFetchTime = now;
}

app.get('/get_default_stream', async (req, res) => {
  const now = Date.now();
  let boost = null;

  try {
    const q = await db.collection('boosts')
      .where('endTime', '>', now)
      .orderBy('endTime', 'desc')
      .limit(1)
      .get();

    if (!q.empty) {
      boost = q.docs[0].data();
      CACHE.boostedStream = boost;
    }
  } catch (e) {
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > now) boost = CACHE.boostedStream;
  }

  if (boost) {
    return res.json({ success: true, channel: boost.channel, mode: 'BOOST', message: `⚡ BOOST ACTIF` });
  }

  await refreshGlobalStreamList();
  const rot = CACHE.globalStreamRotation;

  if (rot.streams.length === 0) return res.json({ success: true, channel: 'twitch', mode: 'FALLBACK' });

  return res.json({ success: true, channel: rot.streams[rot.currentIndex].channel, mode: 'AUTO' });
});

app.post('/cycle_stream', async (req, res) => {
  const { direction } = req.body;

  if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
    return res.json({ success: false, error:'boost_active' });
  }

  await refreshGlobalStreamList();
  const rot = CACHE.globalStreamRotation;
  if (rot.streams.length === 0) return res.json({ success: false });

  rot.currentIndex = direction === 'next'
    ? (rot.currentIndex + 1) % rot.streams.length
    : (rot.currentIndex - 1 + rot.streams.length) % rot.streams.length;

  return res.json({ success: true, channel: rot.streams[rot.currentIndex].channel });
});

app.post('/stream_boost', async (req, res) => {
  const { channel } = req.body;
  const now = Date.now();

  try {
    await db.collection('boosts').add({
      channel,
      startTime: now,
      endTime: now + 900000
    });

    CACHE.boostedStream = { channel, endTime: now + 900000 };

    res.json({ success: true, html_response: "<p style='color:green;'>✅ Boost activé pendant 15 minutes!</p>" });
  } catch (e) {
    res.status(500).json({ success: false, html_response: "<p style='color:red;'>❌ Erreur DB</p>" });
  }
});

// =========================================================
// STATS
// =========================================================
app.get('/api/stats/global', async (req, res) => {
  try {
    const data = await twitchAPI('streams?first=100');
    let v = 0;
    (data.data || []).forEach(s => v += (s.viewer_count || 0));
    const est = Math.floor(v * 3.8);
    const topGame = data.data?.[0]?.game_name || "N/A";

    const history = { live: { labels: [], values: [] } };

    try {
      const snaps = await db.collection('stats_history')
        .orderBy('timestamp', 'desc')
        .limit(12)
        .get();

      if (!snaps.empty) {
        snaps.docs.reverse().forEach(d => {
          const stats = d.data();
          if (stats.timestamp) {
            const date = stats.timestamp.toDate();
            const timeStr = `${date.getHours()}h${String(date.getMinutes()).padStart(2,'0')}`;
            history.live.labels.push(timeStr);
            history.live.values.push(stats.total_viewers || 0);
          }
        });
      } else {
        history.live.labels = ["-1h", "Now"];
        history.live.values = [Math.round(est * 0.9), est];
      }
    } catch (e) {}

    res.json({
      success: true,
      total_viewers: est,
      total_channels: "98k+",
      top_game_name: topGame,
      history
    });
  } catch (e) {
    res.status(500).json({ success:false, error: e.message });
  }
});

app.get('/api/stats/top_games', async (req, res) => {
  try {
    const d = await twitchAPI('games/top?first=10');
    res.json({
      games: (d.data || []).map(g => ({
        name: g.name,
        box_art_url: g.box_art_url.replace('{width}', '52').replace('{height}', '72')
      }))
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/stats/languages', async (req, res) => {
  try {
    const d = await twitchAPI('streams?first=100');
    const l = {};
    (d.data || []).forEach(s => l[s.language] = (l[s.language] || 0) + 1);

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
// SCAN + IA critique
// =========================================================
app.post('/scan_target', async (req, res) => {
  const { query } = req.body;
  try {
    const uRes = await twitchAPI(`users?login=${encodeURIComponent(query)}`);
    if (uRes.data?.length) {
      const u = uRes.data[0];

      let channelInfo = {};
      try {
        const cRes = await twitchAPI(`channels?broadcaster_id=${u.id}`);
        if (cRes.data?.length) channelInfo = cRes.data[0];
      } catch (e) {}

      let streamInfo = null;
      try {
        const sRes = await twitchAPI(`streams?user_id=${u.id}`);
        if (sRes.data?.length) streamInfo = sRes.data[0];
      } catch (e) {}

      const isLive = !!streamInfo;

      return res.json({
        success: true,
        type: 'user',
        user_data: {
          id: u.id,
          login: u.login,
          display_name: u.display_name,
          profile_image_url: u.profile_image_url,
          description: u.description || "Aucune bio.",
          game_name: channelInfo.game_name || "Aucun jeu défini",
          title: channelInfo.title || "Aucun titre",
          language: channelInfo.broadcaster_language || "fr",
          is_live: isLive,
          viewer_count: isLive ? (streamInfo.viewer_count || 0) : 0
        }
      });
    }

    const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(query)}&first=1`);
    if (gRes.data?.length) {
      const g = gRes.data[0];
      const sRes = await twitchAPI(`streams?game_id=${g.id}&first=20`);
      const total = (sRes.data || []).reduce((a, b) => a + (b.viewer_count || 0), 0);

      return res.json({
        success: true,
        type: 'game',
        game_data: {
          name: g.name,
          box_art_url: g.box_art_url.replace('{width}', '60').replace('{height}', '80'),
          total_viewers: total,
          ai_calculated_niche_score: total < 5000 ? 4.0 : 2.0
        }
      });
    }

    res.json({ success: false });
  } catch (e) {
    res.status(500).json({ success:false, error: e.message });
  }
});

app.post('/critique_ia', async (req, res) => {
  const { type, query } = req.body;
  const prompt = type === 'niche'
    ? `Analyse critique du niche "${query}" sur Twitch (FR). Saturation? Opportunités? Réponds en HTML.`
    : `Donne-moi 5 idées de clips viraux pour "${query}". Réponds en HTML avec <ul><li>.`;

  res.json(await runGeminiAnalysis(prompt));
});

// =========================================================
// RAID
// =========================================================
app.post('/start_raid', async (req, res) => {
  const { game, max_viewers } = req.body;

  try {
    const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(game)}&first=1`);
    if (!gRes.data?.length) return res.json({ success: false });

    const sRes = await twitchAPI(`streams?game_id=${gRes.data[0].id}&first=100&language=fr`);

    const target = (sRes.data || [])
      .filter(s => (s.viewer_count || 0) <= parseInt(max_viewers || 100, 10))
      .sort((a, b) => (b.viewer_count || 0) - (a.viewer_count || 0))[0];

    if (!target) return res.json({ success: false });

    const thumb = target.thumbnail_url.replace('{width}', '320').replace('{height}', '180');

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
  } catch (e) {
    res.status(500).json({ success:false, error: e.message });
  }
});

// =========================================================
// BEST TIME TOOL
// =========================================================
app.post('/analyze_schedule', async (req, res) => {
  const { game } = req.body;
  if (!game) return res.status(400).json({ success:false, html_response:'<p style="color:red;">❌ Nom du jeu manquant</p>' });

  try {
    const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(game)}&first=1`);
    if (!gRes.data?.length) {
      return res.json({ success:false, html_response:`<p style="color:red;"><strong>❌ Jeu "${game}" non trouvé</strong></p>` });
    }

    const gameName = gRes.data[0].name;
    const gameId = gRes.data[0].id;

    const sRes = await twitchAPI(`streams?game_id=${gameId}&first=100&language=fr`);
    const totalViewers = (sRes.data || []).reduce((a, b) => a + (b.viewer_count || 0), 0);
    const channelCount = (sRes.data || []).length;
    const avgViewers = Math.round(totalViewers / (channelCount || 1));

    const prompt = `Tu es expert en optimisation streaming Twitch pour le jeu "${gameName}".
DONNÉES:
- Chaînes FR live: ${channelCount}
- Viewers totaux: ${totalViewers}
- Moyenne viewers/chaîne: ${avgViewers}

Fournis en HTML strict:
1) saturation (Faible/Moyenne/Haute) + 1 phrase
2) 3 créneaux précis (jour + heure)
3) score niche 1..10
4) 1 conseil actionnable`;

    const aiResponse = await runGeminiAnalysis(prompt);
    return res.json({ success: aiResponse.success !== false, html_response: aiResponse.html_response || '<p style="color:red;">❌ Erreur IA</p>' });
  } catch (error) {
    return res.json({ success:false, html_response:`<p style="color:red;">❌ Erreur: ${error.message}</p>` });
  }
});

// =========================================================
// ALERTS + GAMES HOURS (tes routes existantes, compatibles front)
// =========================================================
async function saveAlert(channelId, dayKey, type, payload) {
  try {
    const ref = db.collection('alerts').doc(String(channelId))
      .collection('items').doc(`${dayKey}_${type}`);
    await ref.set({
      channel_id: String(channelId),
      day: dayKey,
      type,
      ...payload,
      created_at: admin.firestore.Timestamp.fromMillis(Date.now())
    }, { merge: true });
  } catch (e) {
    console.error("❌ [ALERT] saveAlert:", e.message);
  }
}

async function generateAlertsForLogin(login, days=30) {
  try {
    const uRes = await twitchAPI(`users?login=${encodeURIComponent(login)}`);
    if (!uRes.data?.length) return { success:false, message:"introuvable" };
    const channelId = String(uRes.data[0].id);

    const snaps = await db.collection('channels').doc(channelId)
      .collection('daily_stats').orderBy('day', 'desc').limit(days).get();
    if (snaps.empty) return { success:false, message:"pas de daily_stats" };

    const series = snaps.docs.map(d => d.data()).reverse();
    const first = series[0]?.avg_viewers || 0;
    const last = series[series.length-1]?.avg_viewers || 0;
    const growth_percent = first > 0 ? Math.round(((last-first)/first)*100) : (last>0?100:0);

    const avg = Math.round(series.reduce((a,x)=>a+(x.avg_viewers||0),0)/series.length);
    const peak = Math.max(...series.map(x => x.peak_viewers||0));
    const minutes_live_est = Math.round(series.reduce((a,x)=>a+(x.minutes_live_est||0),0)/series.length);

    const dayKey = yyyy_mm_dd_from_ms(Date.now());

    if (growth_percent >= 25) {
      await saveAlert(channelId, dayKey, "acceleration", {
        title: "🚀 Accélération détectée",
        message: `Ta moyenne grimpe (+${growth_percent}%). Renforce les formats qui performent (clips + rediff).`
      });
    }
    if (avg < 10 && minutes_live_est >= 180) {
      await saveAlert(channelId, dayKey, "format", {
        title: "🧪 Ajuste ton format",
        message: "Tu streams beaucoup mais la moyenne reste basse. Teste: titres plus clairs, catégories moins saturées, intro plus courte."
      });
    }

    return { success:true, channel_id: channelId };
  } catch (e) {
    return { success:false, error: e.message };
  }
}

app.get('/api/alerts/channel_by_login/:login', async (req, res) => {
  const login = String(req.params.login||'').trim().toLowerCase();
  const limit = clamp(parseInt(req.query.limit||'10',10), 1, 50);
  if (!login) return res.status(400).json({ success:false, error:"login manquant" });

  try {
    const uRes = await twitchAPI(`users?login=${encodeURIComponent(login)}`);
    if (!uRes.data?.length) return res.json({ success:false, error:"introuvable" });
    const channelId = String(uRes.data[0].id);

    const q = await db.collection('alerts').doc(channelId)
      .collection('items').orderBy('created_at','desc').limit(limit).get();

    const items = q.docs.map(d => d.data());
    return res.json({ success:true, channel_id: channelId, items });
  } catch (e) {
    return res.status(500).json({ success:false, error:e.message });
  }
});

app.post('/api/alerts/generate', async (req, res) => {
  const login = String(req.body?.login || '').trim().toLowerCase();
  const days = clamp(parseInt(req.body?.days || '30', 10), 1, 180);
  if (!login) return res.status(400).json({ success:false, error:"login manquant" });
  const r = await generateAlertsForLogin(login, days);
  return res.json(r);
});

app.get('/api/games/hours', async (req, res) => {
  const gameId = String(req.query.game_id || '').trim();
  const days = clamp(parseInt(req.query.days || '7', 10), 1, 30);
  if (!gameId) return res.status(400).json({ success:false, error:"game_id requis" });

  try {
    const since = Date.now() - days*24*60*60*1000;
    const snaps = await db.collection('games').doc(gameId)
      .collection('hourly_stats').where('timestamp','>=', since).get();

    const hours = Array.from({length:24},(_,h)=>({ hour:h, total_viewers:0, channels: new Set(), samples:0 }));
    snaps.forEach(d => {
      const x = d.data();
      const ts = x.timestamp || 0;
      const h = new Date(ts).getUTCHours();
      const viewers = x.viewers || 0;
      hours[h].total_viewers += viewers;
      if (x.channel_id) hours[h].channels.add(String(x.channel_id));
      hours[h].samples += 1;
    });

    const out = hours.map(o => {
      const ch = o.channels.size;
      const avgPerChan = ch ? Math.round(o.total_viewers / ch) : 0;
      const saturation = ch ? Math.min(100, Math.round((ch / Math.max(1, avgPerChan)) * 35)) : 0;
      const discoverability = avgPerChan ? Math.min(100, Math.round((avgPerChan / (avgPerChan + ch)) * 200)) : 0;
      return {
        hour: o.hour,
        channels: ch,
        total_viewers: o.total_viewers,
        avg_viewers_per_channel: avgPerChan,
        saturation_score: saturation,
        discoverability_score: discoverability
      };
    });

    const best = [...out].sort((a,b)=> (b.discoverability_score - a.discoverability_score) || (b.total_viewers - a.total_viewers))[0];
    return res.json({ success:true, game_id: gameId, days, hours: out, best_hour_utc: best?.hour ?? null });
  } catch (e) {
    return res.status(500).json({ success:false, error:e.message });
  }
});

// =========================================================
// ANALYTICS BY LOGIN (✅ format front-compatible)
// =========================================================
app.get('/api/analytics/channel_by_login/:login', async (req, res) => {
  const login = String(req.params.login || '').trim().toLowerCase();
  const days = clamp(parseInt(req.query.days || '30', 10), 1, 90);
  if (!login) return res.status(400).json({ success:false, error:'login manquant' });

  try {
    const uRes = await twitchAPI(`users?login=${encodeURIComponent(login)}`);
    if (!uRes.data?.length) return res.json({ success:false, error:'introuvable' });
    const channelId = String(uRes.data[0].id);

    const since = Date.now() - (days * 24 * 60 * 60 * 1000);
    const snaps = await db.collection('channels').doc(channelId)
      .collection('daily_stats')
      .where('day', '>=', yyyy_mm_dd_from_ms(since))
      .orderBy('day', 'asc')
      .get();

    if (snaps.empty) {
      return res.json({ success:false, error:'pas_de_donnees', message:'Pas assez de daily_stats (laisse tourner le cron).' });
    }

    const seriesDocs = snaps.docs.map(d => d.data());
    const labels = seriesDocs.map(x => x.day);
    const values = seriesDocs.map(x => Number(x.avg_viewers || 0));

    const avg = Math.round(values.reduce((a,b)=>a+b,0) / (values.length || 1));
    const peak = Math.max(...seriesDocs.map(x => Number(x.peak_viewers || 0)));

    const first = values[0] || 0;
    const last = values[values.length - 1] || 0;
    const growth = first > 0 ? Math.round(((last - first) / first) * 100) : (last>0 ? 100 : 0);

    const mean = avg;
    const variance = values.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / (values.length || 1);
    const volatility = Math.round(Math.sqrt(variance));

    const totalMinutes = seriesDocs.reduce((a,x)=> a + Number(x.minutes_live_est||0), 0);
    const hoursPerWeek = Math.round((totalMinutes / 60) / (days / 7));

    const growth_score = computeGrowthScoreLite({ avgViewers: avg, growthPct: growth, volatility, hoursPerWeek });

    return res.json({
      success: true,
      channel_id: channelId,
      login,
      days,
      kpis: {
        avg_viewers: avg,
        peak_viewers: peak,
        growth_percent: growth,
        volatility,
        hours_per_week_est: hoursPerWeek,
        days: values.length,
        growth_score
      },
      series: { labels, values }
    });
  } catch (e) {
    return res.status(500).json({ success:false, error:e.message });
  }
});

// =========================================================
// SIMULATION + AI RECO (ok)
// =========================================================
app.get('/api/simulate/growth', async (req, res) => {
  const channelId = String(req.query.channel_id || '').trim();
  const hoursPerWeek = clamp(parseFloat(req.query.hours_per_week || '0'), 0, 80);
  const days = clamp(parseInt(req.query.days || '30', 10), 7, 90);

  if (!channelId || !hoursPerWeek) return res.status(400).json({ success:false, error:'channel_id et hours_per_week requis' });

  try {
    const snaps = await db.collection('channels').doc(channelId)
      .collection('daily_stats')
      .orderBy('day', 'desc')
      .limit(days)
      .get();

    if (snaps.empty) return res.json({ success:false, message:'Pas assez de daily_stats.' });

    const series = snaps.docs.map(d => d.data()).reverse();
    const avg = Math.round(series.reduce((a, x) => a + (x.avg_viewers || 0), 0) / series.length);

    const totalMinutes = series.reduce((a, x) => a + (x.minutes_live_est || 0), 0);
    const curHoursPerWeek = Math.max(1, (totalMinutes / 60) / (series.length / 7));

    const ratio = hoursPerWeek / curHoursPerWeek;
    const k = 0.22;
    const expectedMultiplier = clamp(1 + k * Math.log(ratio), 0.6, 1.8);

    const expectedAvg = Math.round(avg * expectedMultiplier);

    return res.json({
      success: true,
      note: "Estimation basée sur ton historique (pas une garantie).",
      current: { avg_viewers: avg, hours_per_week_est: Math.round(curHoursPerWeek * 10) / 10 },
      target: {
        hours_per_week: hoursPerWeek,
        expected_avg_viewers: expectedAvg,
        expected_change_percent: Math.round((expectedMultiplier - 1) * 100)
      }
    });
  } catch (e) {
    return res.status(500).json({ success:false, error:e.message });
  }
});

app.get('/api/ai/reco', async (req, res) => {
  let channelId = String(req.query.channel_id || '').trim();
  const login = String(req.query.login || '').trim().toLowerCase();
  const days = clamp(parseInt(req.query.days || '30', 10), 7, 90);

  if (!channelId && login) {
    const uRes = await twitchAPI(`users?login=${encodeURIComponent(login)}`);
    if (uRes.data?.length) channelId = String(uRes.data[0].id);
  }

  if (!channelId) return res.status(400).json({ success:false, html_response:"<p style='color:red;'>channel_id (ou login) requis</p>" });

  try {
    const aRes = await db.collection('channels').doc(channelId).collection('daily_stats')
      .orderBy('day', 'desc').limit(days).get();

    if (aRes.empty) return res.json({ success:false, html_response:"<p style='color:red;'>Pas assez de daily_stats.</p>" });

    const series = aRes.docs.map(d => d.data()).reverse();
    const avg = Math.round(series.reduce((a, x) => a + (x.avg_viewers || 0), 0) / series.length);
    const peak = Math.max(...series.map(x => x.peak_viewers || 0));
    const totalMinutes = series.reduce((a, x) => a + (x.minutes_live_est || 0), 0);
    const hoursPerWeek = Math.round((totalMinutes / 60) / (series.length / 7));

    const first = series[0]?.avg_viewers || 0;
    const last = series[series.length - 1]?.avg_viewers || 0;
    const growthPct = first > 0 ? Math.round(((last - first) / first) * 100) : (last > 0 ? 100 : 0);

    const values = series.map(x => x.avg_viewers || 0);
    const mean = avg;
    const variance = values.reduce((a, p) => a + Math.pow(p - mean, 2), 0) / values.length;
    const volatility = Math.round(Math.sqrt(variance));

    const growthScore = computeGrowthScoreLite({ avgViewers: avg, growthPct, volatility, hoursPerWeek });

    const prompt = `Tu es un coach Twitch DATA-DRIVEN.
Réponds UNIQUEMENT en HTML (<h4>, <ul>, <li>, <p>, <strong>).

DONNÉES:
- avg_viewers: ${avg}
- peak_viewers: ${peak}
- growth_percent: ${growthPct}%
- volatility: ${volatility}
- hours_per_week_est: ${hoursPerWeek}
- growth_score: ${growthScore}/100

Objectif:
- 5 reco concrètes
- 3 expériences à tester semaine prochaine
- 1 phrase réaliste (sans promesse magique).`;

    const ai = await runGeminiAnalysis(prompt);
    return res.json(ai);
  } catch (e) {
    return res.status(500).json({ success:false, html_response:`<p style='color:red;'>${e.message}</p>` });
  }
});

// =========================================================
// CO-STREAM (✅ format front compatible: best + candidates)
// =========================================================
app.get('/api/costream/best', async (req, res) => {
  const login = String(req.query.login || '').trim().toLowerCase();
  if (!login) return res.status(400).json({ success:false, message:'login manquant' });

  try {
    const uRes = await twitchAPI(`users?login=${encodeURIComponent(login)}`);
    if (!uRes.data?.length) return res.json({ success:false, message:'Chaîne introuvable' });
    const me = uRes.data[0];

    const sRes = await twitchAPI(`streams?user_id=${me.id}`);
    const myStream = sRes.data?.[0] || null;
    if (!myStream?.game_id) return res.json({ success:false, message:"Chaîne offline ou jeu inconnu." });

    const gameId = myStream.game_id;
    const gameName = myStream.game_name || null;
    const target = Math.max(5, Number(myStream.viewer_count || 50));

    const sGame = await twitchAPI(`streams?game_id=${encodeURIComponent(gameId)}&first=100&language=fr`);
    const candidatesRaw = (sGame.data || []).filter(s => s.user_login && s.user_login.toLowerCase() !== login);

    if (!candidatesRaw.length) return res.json({ success:false, message:"Aucun co-streamer FR live trouvé sur ce jeu." });

    const scored = candidatesRaw
      .map(s => {
        const diff = Math.abs((s.viewer_count || 0) - target);
        const score = Math.max(1, 100 - Math.min(100, diff));
        return {
          login: s.user_login,
          display_name: s.user_name,
          viewer_count: s.viewer_count || 0,
          score
        };
      })
      .sort((a,b) => b.score - a.score);

    const best0 = scored[0];

    // profile best
    let prof = null;
    try {
      const uu = await twitchAPI(`users?login=${encodeURIComponent(best0.login)}`);
      if (uu.data?.length) prof = uu.data[0];
    } catch (e) {}

    return res.json({
      success: true,
      best: {
        login: best0.login,
        display_name: best0.display_name,
        profile_image_url: prof?.profile_image_url || null,
        score: best0.score,
        why: `Même jeu (${gameName || ''}), audience proche (${best0.viewer_count} vs ~${target}).`
      },
      candidates: scored.slice(0, 12)
    });
  } catch (e) {
    return res.status(500).json({ success:false, message:e.message });
  }
});

// =========================================================
// SOCKET.IO
// =========================================================
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, methods: ['GET','POST'] } });

io.on('connection', (socket) => {
  console.log('🔌 [SOCKET] client connected');

  socket.on('chat message', (msg) => {
    const safe = {
      user: String(msg?.user || 'Anon').slice(0, 40),
      text: String(msg?.text || '').slice(0, 500)
    };
    if (!safe.text) return;
    io.emit('chat message', safe);
  });

  socket.on('disconnect', () => console.log('🔌 [SOCKET] client disconnected'));
});

server.listen(PORT, () => {
  console.log(`\n🚀 [SERVER] Démarré sur http://localhost:${PORT}`);
  console.log("✅ Routes prêtes");
});
