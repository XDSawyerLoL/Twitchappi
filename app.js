/**
 * STREAMER HUB — BACKEND (FULL MERGE - STABLE ROUTES + INTRADAY REALTIME + SOCKET STABLE)
 * =====================================================================================
 * ✅ Fixes:
 * - Un seul server HTTP + un seul Socket.IO (plus de double listen / double io)
 * - Toutes les routes clés restaurées:
 *   /stream_info, /followed_streams, /scan_target, /start_raid, /analyze_schedule,
 *   /api/stats/global, /api/stats/top_games, /api/stats/languages,
 *   /api/stats/global_intraday (24-48h),
 *   /api/analytics/channel_by_login (daily_stats),
 *   /api/analytics/channel_intraday_by_login (hourly_stats intraday),
 *   /api/ai/reco, /api/costream/best, alerts, boost, rotation
 * ✅ Intraday “vivant”:
 * - global_intraday?live=1 -> ajoute un point "now" via Helix
 * - channel_intraday_by_login/:login?live=1 -> ajoute un point "now" via Helix
 * ✅ Socket stable:
 * - websocket only, allowUpgrades false (stop spam connect/disconnect)
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

// IA
const { GoogleGenAI } = require('@google/genai');

// Firebase
const admin = require('firebase-admin');

// =========================================================
// CONFIG
// =========================================================
const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash";

// Cron snapshots
const ENABLE_CRON = (process.env.ENABLE_CRON || 'true').toLowerCase() !== 'false';
const SNAPSHOT_EVERY_MIN = parseInt(process.env.SNAPSHOT_EVERY_MIN || '5', 10);

// =========================================================
// MIDDLEWARE
// =========================================================
app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

// =========================================================
// FIREBASE INIT
// =========================================================
let serviceAccount = null;

if (process.env.FIREBASE_SERVICE_KEY) {
  try {
    let rawJson = process.env.FIREBASE_SERVICE_KEY;
    if ((rawJson.startsWith("'") && rawJson.endsWith("'")) || (rawJson.startsWith('"') && rawJson.endsWith('"'))) {
      rawJson = rawJson.slice(1, -1);
    }
    rawJson = rawJson
      .replace(/\\r\\n/g, '\\n')
      .replace(/\\n/g, '\\n')
      .replace(/\\r/g, '\\n');
    serviceAccount = JSON.parse(rawJson);
  } catch (error) {
    console.error("❌ Erreur JSON Firebase:", error.message);
  }
} else {
  try { serviceAccount = require('./serviceAccountKey.json'); } catch (_) {}
}

try {
  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id
    });
    console.log("✅ [FIREBASE] connecté (service account).");
  } else {
    admin.initializeApp();
    console.log("✅ [FIREBASE] init default.");
  }
} catch (e) {
  console.error("❌ [FIREBASE] init:", e.message);
}

const db = admin.firestore();
try {
  if (serviceAccount) {
    db.settings({ projectId: serviceAccount.project_id, ignoreUndefinedProperties: true });
  }
} catch (_) {}

// =========================================================
// IA INIT
// =========================================================
let aiClient = null;
if (GEMINI_API_KEY) {
  try {
    aiClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    console.log("✅ [IA] Gemini prêt.");
  } catch (e) {
    console.error("❌ [IA] init:", e.message);
  }
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
        systemInstruction: "Tu réponds UNIQUEMENT en HTML simple (<p>, <h4>, <ul>, <li>, <strong>). Pas de markdown, pas de backticks."
      }
    });
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return { success: true, html_response: text };
  } catch (e) {
    console.error("❌ Erreur IA:", e.message);
    return { success: false, html_response: `<p style='color:red;'>❌ Erreur IA: ${e.message}</p>` };
  }
}

// =========================================================
// SOCKET.IO (websocket only -> stop spam connect/disconnect)
// =========================================================
const io = new Server(server, {
  cors: { origin: true, methods: ['GET', 'POST'] },
  transports: ['websocket'],
  allowUpgrades: false,
  pingInterval: 25000,
  pingTimeout: 20000
});

io.on('connection', (socket) => {
  console.log('🔌 [SOCKET] client connected', socket.id);

  socket.on('chat message', (msg) => {
    const safe = {
      user: String(msg?.user || 'Anon').slice(0, 40),
      text: String(msg?.text || '').slice(0, 500)
    };
    if (!safe.text) return;
    io.emit('chat message', safe);
  });

  socket.on('disconnect', (reason) => {
    console.log('🔌 [SOCKET] client disconnected', socket.id, reason);
  });
});

// =========================================================
// HELPERS + CACHE
// =========================================================
const CACHE = {
  twitchTokens: { app: null },
  twitchUser: null,
  boostedStream: null,
  globalStreamRotation: { streams: [], currentIndex: 0, lastFetchTime: 0, fetchCooldown: 3 * 60 * 1000 }
};

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function yyyy_mm_dd_from_ms(ms) {
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function hhmm(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

async function getTwitchToken() {
  if (CACHE.twitchTokens.app && CACHE.twitchTokens.app.expiry > Date.now()) {
    return CACHE.twitchTokens.app.access_token;
  }
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
    { method: 'POST' }
  );
  const data = await res.json();
  if (!data.access_token) return null;

  CACHE.twitchTokens.app = {
    access_token: data.access_token,
    expiry: Date.now() + (data.expires_in * 1000) - 300000
  };
  return data.access_token;
}

async function twitchAPI(endpoint, token = null) {
  const accessToken = token || await getTwitchToken();
  if (!accessToken) throw new Error("No Token.");

  const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
    headers: {
      'Client-ID': TWITCH_CLIENT_ID,
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (res.status === 401) {
    CACHE.twitchTokens.app = null;
    throw new Error("Token expiré.");
  }
  return res.json();
}

function computeGrowthScore({ avgViewers = 0, growthPct = 0, volatility = 0, hoursPerWeek = 0 }) {
  const logPart = Math.log10(avgViewers + 1) * 22;
  const growthPart = clamp(growthPct, -50, 200) * 0.22;
  const volPenalty = clamp(volatility, 0, 200) * 0.18;
  const hoursPart = clamp(hoursPerWeek, 0, 80) * 0.25;
  const raw = 15 + logPart + growthPart + hoursPart - volPenalty;
  return Math.round(clamp(raw, 0, 100));
}

// =========================================================
// UI ROUTE
// =========================================================
app.get('/', (req, res) => {
  const candidates = [process.env.UI_FILE, 'NicheOptimizer.html'].filter(Boolean);
  const found = candidates.find(f => fs.existsSync(path.join(__dirname, f)));
  if (!found) return res.status(500).send('UI introuvable sur le serveur.');
  return res.sendFile(path.join(__dirname, found));
});

// =========================================================
// STATUS
// =========================================================
app.get('/firebase_status', (req, res) => {
  try {
    res.json({
      connected: !!db && admin.apps.length > 0,
      hasServiceAccount: !!serviceAccount
    });
  } catch (e) {
    res.json({ connected: false, error: e.message });
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
    if (!tokenData.access_token) return res.send("Erreur Token.");

    const userRes = await twitchAPI('users', tokenData.access_token);
    const user = userRes.data?.[0];
    if (!user) return res.send("Erreur User.");

    CACHE.twitchUser = {
      display_name: user.display_name,
      id: user.id,
      profile_image_url: user.profile_image_url || null,
      access_token: tokenData.access_token,
      expiry: Date.now() + (tokenData.expires_in * 1000)
    };

    res.send("<script>window.close();</script>");
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
      profile_image_url: CACHE.twitchUser.profile_image_url || null
    });
  }
  res.json({ is_connected: false });
});

// =========================================================
// STREAMS
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

// Front attend POST /stream_info -> stream ou null (offline)
app.post('/stream_info', async (req, res) => {
  const channel = String(req.body?.channel || '').trim().toLowerCase();
  if (!channel || channel === 'twitch') return res.json({ success: false });

  try {
    const uRes = await twitchAPI(`users?login=${encodeURIComponent(channel)}`);
    if (!uRes.data?.length) return res.json({ success: false });

    const userId = uRes.data[0].id;
    const sRes = await twitchAPI(`streams?user_id=${encodeURIComponent(userId)}`);
    const stream = sRes.data?.[0] || null;
    return res.json({ success: true, stream });
  } catch (e) {
    return res.json({ success: false, error: e.message });
  }
});

// =========================================================
// ROTATION & BOOST
// =========================================================
async function refreshGlobalStreamList() {
  const now = Date.now();
  const rot = CACHE.globalStreamRotation;
  if (now - rot.lastFetchTime < rot.fetchCooldown && rot.streams.length > 0) return;

  try {
    const data = await twitchAPI(`streams?language=fr&first=100`);
    let suitable = (data.data || []).filter(s => (s.viewer_count || 0) <= 100);
    if (suitable.length === 0) suitable = (data.data || []).slice(-10);

    rot.streams = suitable.sort(() => 0.5 - Math.random()).map(s => ({
      channel: s.user_login,
      viewers: s.viewer_count
    }));
    rot.currentIndex = 0;
    rot.lastFetchTime = now;
  } catch (e) {
    console.error("Erreur refresh streams:", e.message);
  }
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
  } catch (_) {
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > now) boost = CACHE.boostedStream;
  }

  if (boost) {
    return res.json({ success: true, channel: boost.channel, mode: 'BOOST', message: '⚡ BOOST ACTIF' });
  }

  await refreshGlobalStreamList();
  const rot = CACHE.globalStreamRotation;
  if (!rot.streams.length) return res.json({ success: true, channel: 'twitch', mode: 'FALLBACK' });

  return res.json({ success: true, channel: rot.streams[rot.currentIndex].channel, mode: 'AUTO' });
});

app.post('/cycle_stream', async (req, res) => {
  const direction = String(req.body?.direction || 'next');

  if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
    return res.json({ success: false, error: 'boost_active' });
  }

  await refreshGlobalStreamList();
  const rot = CACHE.globalStreamRotation;
  if (!rot.streams.length) return res.json({ success: false });

  if (direction === 'next') rot.currentIndex = (rot.currentIndex + 1) % rot.streams.length;
  else rot.currentIndex = (rot.currentIndex - 1 + rot.streams.length) % rot.streams.length;

  return res.json({ success: true, channel: rot.streams[rot.currentIndex].channel });
});

app.post('/stream_boost', async (req, res) => {
  const channel = String(req.body?.channel || '').trim().toLowerCase();
  if (!channel) return res.status(400).json({ success: false });

  const now = Date.now();
  try {
    await db.collection('boosts').add({
      channel,
      startTime: now,
      endTime: now + 900000
    });

    CACHE.boostedStream = { channel, endTime: now + 900000 };
    res.json({ success: true, html_response: "<p style='color:green;'>✅ Boost activé pendant 15 minutes !</p>" });
  } catch (e) {
    res.status(500).json({ success: false, error: "Erreur DB" });
  }
});

// =========================================================
// STATS (global / top games / languages)
// =========================================================
app.get('/api/stats/global', async (req, res) => {
  try {
    const data = await twitchAPI('streams?first=100');
    let v = 0;
    (data.data || []).forEach(s => v += (s.viewer_count || 0));

    const est = Math.floor(v * 3.8);
    const topGame = data.data?.[0]?.game_name || "N/A";

    res.json({
      success: true,
      total_viewers: est,
      total_channels: "98k+",
      top_game_name: topGame
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
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
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/stats/languages', async (req, res) => {
  try {
    const d = await twitchAPI('streams?first=100');
    const l = {};
    (d.data || []).forEach(s => {
      const key = String(s.language || '??');
      l[key] = (l[key] || 0) + 1;
    });

    const sorted = Object.keys(l)
      .map(k => ({ name: k.toUpperCase(), percent: l[k] }))
      .sort((a, b) => b.percent - a.percent)
      .slice(0, 5);

    res.json({ languages: sorted });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ✅ GLOBAL INTRADAY (24-48h) from Firestore + (optional) live point via Helix
app.get('/api/stats/global_intraday', async (req, res) => {
  const hours = clamp(parseInt(req.query.hours || '24', 10), 1, 48);
  const since = Date.now() - hours * 60 * 60 * 1000;
  const wantLive = String(req.query.live || '0') === '1';

  try {
    const snaps = await db.collection('stats_history')
      .where('timestamp_ms', '>=', since)
      .orderBy('timestamp_ms', 'asc')
      .get();

    const labels = [];
    const values = [];

    let curViewers = 0;
    let curChannels = 0;

    if (!snaps.empty) {
      snaps.forEach(d => {
        const x = d.data();
        const ts = Number(x.timestamp_ms || 0);
        labels.push(hhmm(ts));
        values.push(Number(x.total_viewers || 0));
        curViewers = Number(x.total_viewers || 0);
        curChannels = Number(x.channels_live || 0);
      });
    }

    // Optional "live now" point to make curve feel realtime
    if (wantLive) {
      const live = await twitchAPI('streams?first=100');
      let v = 0; (live.data || []).forEach(s => v += (s.viewer_count || 0));
      const nowV = Math.floor(v * 3.8);
      const nowLabel = hhmm(Date.now());

      // avoid duplicates if last label is same minute
      if (!labels.length || labels[labels.length - 1] !== nowLabel) {
        labels.push(nowLabel);
        values.push(nowV);
      }

      curViewers = nowV;
      curChannels = (live.data || []).length;
    }

    if (!labels.length) {
      // fallback if Firestore empty + no live requested
      const live = await twitchAPI('streams?first=100');
      let v = 0; (live.data || []).forEach(s => v += (s.viewer_count || 0));
      const nowV = Math.floor(v * 3.8);
      return res.json({
        success: true,
        current_total_viewers: nowV,
        current_channels_live: (live.data || []).length,
        series: { labels: [hhmm(Date.now())], values: [nowV] }
      });
    }

    res.json({
      success: true,
      current_total_viewers: curViewers,
      current_channels_live: curChannels,
      series: { labels, values }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// =========================================================
// SCAN (user or game)
// =========================================================
app.post('/scan_target', async (req, res) => {
  const query = String(req.body?.query || '').trim().toLowerCase();
  if (!query) return res.status(400).json({ success: false });

  try {
    // user
    const uRes = await twitchAPI(`users?login=${encodeURIComponent(query)}`);
    if (uRes.data?.length) {
      const u = uRes.data[0];

      let channelInfo = {};
      try {
        const cRes = await twitchAPI(`channels?broadcaster_id=${u.id}`);
        if (cRes.data?.length) channelInfo = cRes.data[0];
      } catch (_) {}

      let streamInfo = null;
      try {
        const sRes = await twitchAPI(`streams?user_id=${u.id}`);
        if (sRes.data?.length) streamInfo = sRes.data[0];
      } catch (_) {}

      const isLive = !!streamInfo;

      const uData = {
        id: u.id,
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

      return res.json({ success: true, type: 'user', user_data: uData });
    }

    // game fallback
    const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(query)}&first=1`);
    if (gRes.data?.length) {
      const g = gRes.data[0];
      const sRes = await twitchAPI(`streams?game_id=${g.id}&first=20`);
      const total = (sRes.data || []).reduce((a, b) => a + (b.viewer_count || 0), 0);

      const gData = {
        name: g.name,
        box_art_url: g.box_art_url.replace('{width}', '60').replace('{height}', '80'),
        total_viewers: total,
        ai_calculated_niche_score: total < 5000 ? 4.0 : 2.0
      };

      return res.json({ success: true, type: 'game', game_data: gData });
    }

    res.json({ success: false });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// =========================================================
// RAID (pick FR stream under max viewers)
// =========================================================
app.post('/start_raid', async (req, res) => {
  const game = String(req.body?.game || '').trim();
  const maxViewers = parseInt(req.body?.max_viewers || '100', 10);
  if (!game) return res.status(400).json({ success: false });

  try {
    const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(game)}&first=1`);
    if (!gRes.data?.length) return res.json({ success: false });

    const sRes = await twitchAPI(`streams?game_id=${gRes.data[0].id}&first=100&language=fr`);
    const target = (sRes.data || [])
      .filter(s => (s.viewer_count || 0) <= maxViewers)
      .sort((a, b) => (b.viewer_count || 0) - (a.viewer_count || 0))[0];

    if (!target) return res.json({ success: false });

    return res.json({
      success: true,
      target: {
        name: target.user_name,
        login: target.user_login,
        viewers: target.viewer_count,
        thumbnail_url: target.thumbnail_url.replace('{width}', '320').replace('{height}', '180'),
        game: target.game_name
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// =========================================================
// BEST TIME (IA)
// =========================================================
app.post('/analyze_schedule', async (req, res) => {
  const game = String(req.body?.game || '').trim();
  if (!game) return res.status(400).json({ success: false, html_response: '<p style="color:red;">❌ Nom du jeu manquant</p>' });

  try {
    const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(game)}&first=1`);
    if (!gRes.data?.length) {
      return res.json({ success: false, html_response: `<p style="color:red;"><strong>❌ Jeu "${game}" non trouvé sur Twitch</strong></p>` });
    }

    const gameName = gRes.data[0].name;
    const gameId = gRes.data[0].id;

    const sRes = await twitchAPI(`streams?game_id=${gameId}&first=100&language=fr`);
    const totalViewers = (sRes.data || []).reduce((a, b) => a + (b.viewer_count || 0), 0);
    const channelCount = (sRes.data || []).length;
    const avgViewers = Math.round(totalViewers / (channelCount || 1));

    const prompt = `Tu es expert optimisation streaming Twitch pour "${gameName}".

📊 DONNÉES:
- Chaînes live: ${channelCount}
- Viewers totaux: ${totalViewers}
- Moyenne viewers/chaîne: ${avgViewers}

DONNE en HTML pur:
1) Saturation (Faible/Moyenne/Haute) + explication courte
2) 3 créneaux précis (jour + heures, ex: Mercredi 14h-16h) où concurrence faible + viewers nombreux
3) Score "niche profitability" 1 à 10
4) 1 conseil actionnable

HTML STRICT: <h4>, <ul>, <li>, <p>, <strong>.`;

    const aiResponse = await runGeminiAnalysis(prompt);
    return res.json({
      success: aiResponse.success !== false,
      html_response: aiResponse.html_response || '<p style="color:red;">❌ Erreur IA</p>'
    });
  } catch (e) {
    return res.json({ success: false, html_response: `<p style="color:red;">❌ Erreur: ${e.message}</p>` });
  }
});

// =========================================================
// ANALYTICS — DAILY (daily_stats)
// =========================================================
app.get('/api/analytics/channel_by_login/:login', async (req, res) => {
  const login = String(req.params.login || '').trim().toLowerCase();
  const days = clamp(parseInt(req.query.days || '30', 10), 1, 90);
  if (!login) return res.status(400).json({ success: false, message: 'login manquant' });

  try {
    const uRes = await twitchAPI(`users?login=${encodeURIComponent(login)}`);
    if (!uRes.data?.length) return res.json({ success: false, message: 'introuvable' });
    const channelId = String(uRes.data[0].id);

    const sinceKey = yyyy_mm_dd_from_ms(Date.now() - days * 24 * 60 * 60 * 1000);
    const snaps = await db.collection('channels').doc(channelId)
      .collection('daily_stats')
      .where('day', '>=', sinceKey)
      .orderBy('day', 'asc')
      .get();

    if (snaps.empty) return res.json({ success: false, message: 'pas_de_donnees', channel_id: channelId });

    const seriesDays = snaps.docs.map(d => d.data());
    const labels = seriesDays.map(x => x.day);
    const values = seriesDays.map(x => Number(x.avg_viewers || 0));

    const avg = Math.round(values.reduce((a,b)=>a+b,0) / (values.length || 1));
    const peak = Math.max(...seriesDays.map(x => Number(x.peak_viewers || 0)));

    const first = values[0] || 0;
    const last = values[values.length - 1] || 0;
    const growthPct = first > 0 ? Math.round(((last - first) / first) * 100) : (last > 0 ? 100 : 0);

    const mean = avg;
    const variance = values.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / (values.length || 1);
    const volatility = Math.round(Math.sqrt(variance));

    const totalMinutes = seriesDays.reduce((a, x) => a + Number(x.minutes_live_est || 0), 0);
    const hoursPerWeek = Math.round((totalMinutes / 60) / (days / 7));

    const growthScore = computeGrowthScore({ avgViewers: avg, growthPct, volatility, hoursPerWeek });

    return res.json({
      success: true,
      channel_id: channelId,
      login,
      kpis: {
        avg_viewers: avg,
        peak_viewers: peak,
        growth_percent: growthPct,
        volatility,
        hours_per_week_est: hoursPerWeek,
        growth_score: growthScore,
        days: labels.length
      },
      series: { labels, values }
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// =========================================================
// ANALYTICS — INTRADAY (hourly_stats snapshots) + optional LIVE point
// =========================================================
app.get('/api/analytics/channel_intraday_by_login/:login', async (req, res) => {
  const login = String(req.params.login || '').trim().toLowerCase();
  const hours = clamp(parseInt(req.query.hours || '24', 10), 1, 48);
  const wantLive = String(req.query.live || '0') === '1';
  if (!login) return res.status(400).json({ success: false, message: 'login manquant' });

  try {
    const uRes = await twitchAPI(`users?login=${encodeURIComponent(login)}`);
    if (!uRes.data?.length) return res.json({ success: false, message: 'introuvable' });
    const channelId = String(uRes.data[0].id);

    const since = Date.now() - hours * 60 * 60 * 1000;

    const q = await db.collection('channels').doc(channelId)
      .collection('hourly_stats')
      .where('timestamp', '>=', since)
      .orderBy('timestamp', 'asc')
      .get();

    const labels = [];
    const values = [];

    let sum = 0;
    let peak = 0;
    const viewersArr = [];

    let current_game_id = null;
    let current_game_name = null;

    if (!q.empty) {
      q.docs.forEach(doc => {
        const p = doc.data();
        const ts = Number(p.timestamp || 0);
        const v = Number(p.viewers || 0);
        labels.push(hhmm(ts));
        values.push(v);
        viewersArr.push(v);
        sum += v;
        if (v > peak) peak = v;
        if (p.game_id) { current_game_id = p.game_id; current_game_name = p.game_name || null; }
      });
    }

    // Optional "now" live point via Helix
    if (wantLive) {
      try {
        const sNow = await twitchAPI(`streams?user_id=${encodeURIComponent(channelId)}`);
        const liveStream = sNow.data?.[0] || null;
        const nowTs = Date.now();
        const nowLabel = hhmm(nowTs);
        const nowV = liveStream ? Number(liveStream.viewer_count || 0) : 0;

        if (!labels.length || labels[labels.length - 1] !== nowLabel) {
          labels.push(nowLabel);
          values.push(nowV);
          viewersArr.push(nowV);
          sum += nowV;
          if (nowV > peak) peak = nowV;
          if (liveStream?.game_id) { current_game_id = liveStream.game_id; current_game_name = liveStream.game_name || null; }
        }
      } catch (_) {}
    }

    if (!labels.length) {
      return res.json({ success: false, message: 'pas_de_donnees', channel_id: channelId });
    }

    const avg = Math.round(sum / (viewersArr.length || 1));
    const first = viewersArr[0] || 0;
    const last = viewersArr[viewersArr.length - 1] || 0;
    const growth = first > 0 ? Math.round(((last - first) / first) * 100) : (last > 0 ? 100 : 0);

    const mean = avg;
    const variance = viewersArr.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / (viewersArr.length || 1);
    const volatility = Math.round(Math.sqrt(variance));

    // hours_per_week_est from daily_stats (optional)
    let hoursPerWeek = null;
    try {
      const ds = await db.collection('channels').doc(channelId).collection('daily_stats')
        .orderBy('day', 'desc').limit(14).get();
      if (!ds.empty) {
        const series = ds.docs.map(d => d.data());
        const minutes = series.reduce((a,x)=>a+(x.minutes_live_est||0),0);
        const daysCount = series.length || 1;
        hoursPerWeek = Math.round((minutes/60) / (daysCount/7));
      }
    } catch (_) {}

    const growth_score = computeGrowthScore({ avgViewers: avg, growthPct: growth, volatility, hoursPerWeek: hoursPerWeek || 0 });

    return res.json({
      success: true,
      channel_id: channelId,
      login,
      current_game_id,
      current_game_name,
      kpis: {
        avg_viewers: avg,
        peak_viewers: peak,
        growth_percent: growth,
        volatility,
        hours_per_week_est: hoursPerWeek,
        growth_score,
        samples: viewersArr.length
      },
      series: { labels, values }
    });

  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// =========================================================
// ALERTS (read + generate)
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

function computeGrowthScoreSimple({ avg_viewers=0, peak_viewers=0, growth_percent=0, minutes_live_est=0 } = {}) {
  const base = Math.log10(avg_viewers + 1) * 25;
  const peakBoost = Math.log10(peak_viewers + 1) * 10;
  const growthBoost = clamp(growth_percent, -50, 200) * 0.15;
  const cadence = Math.min(20, (minutes_live_est / 60) * 1.2);
  const raw = base + peakBoost + growthBoost + cadence;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

async function generateAlertsForLogin(login, days=30) {
  const uRes = await twitchAPI(`users?login=${encodeURIComponent(login)}`);
  if (!uRes.data?.length) return { success:false, message:"introuvable" };
  const user = uRes.data[0];
  const channelId = String(user.id);

  const snaps = await db.collection('channels').doc(channelId)
    .collection('daily_stats').orderBy('day', 'desc').limit(days).get();
  if (snaps.empty) return { success:false, message:"pas de daily_stats" };

  const series = snaps.docs.map(d => d.data()).reverse();
  const first = series[0]?.avg_viewers || 0;
  const last = series[series.length-1]?.avg_viewers || 0;
  const growth_percent = first > 0 ? Math.round(((last-first)/first)*100) : (last>0?100:0);

  const avg = Math.round(series.reduce((a,x)=>a+(x.avg_viewers||0),0)/series.length);
  const peak = Math.max(...series.map(x=>x.peak_viewers||0));
  const minutes_live_est = Math.round(series.reduce((a,x)=>a+(x.minutes_live_est||0),0)/series.length);

  const growth_score = computeGrowthScoreSimple({ avg_viewers: avg, peak_viewers: peak, growth_percent, minutes_live_est });
  const dayKey = yyyy_mm_dd_from_ms(Date.now());

  if (growth_percent >= 25 && growth_score >= 60) {
    await saveAlert(channelId, dayKey, "acceleration", {
      title: "🚀 Accélération détectée",
      message: `Ta moyenne grimpe (+${growth_percent}%). Renforce les formats qui performent (clips + rediff).`,
      score: growth_score
    });
  }
  if (avg < 10 && minutes_live_est >= 180) {
    await saveAlert(channelId, dayKey, "format", {
      title: "🧪 Ajuste ton format",
      message: "Tu streams beaucoup mais la moyenne reste basse. Teste: titres plus clairs, catégories moins saturées, intro plus courte.",
      score: growth_score
    });
  }

  if (aiClient) {
    const prompt = `Tu es un coach Twitch. Pour ${user.display_name} (${login}), propose 1 alerte courte et actionnable pour aujourd'hui basée sur: moyenne=${avg}, pic=${peak}, croissance=${growth_percent}%, score=${growth_score}/100. Réponds en HTML simple.`;
    const out = await runGeminiAnalysis(prompt);
    await saveAlert(channelId, dayKey, "ia", {
      title: "💡 Suggestion IA",
      message: (out.html_response || '').replace(/<\/?[^>]+(>|$)/g, '').slice(0, 320),
      score: growth_score
    });
  }

  return { success:true, channel_id: channelId, growth_score, growth_percent, avg_viewers: avg, peak_viewers: peak };
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
  try {
    const r = await generateAlertsForLogin(login, days);
    return res.json(r);
  } catch (e) {
    return res.status(500).json({ success:false, error:e.message });
  }
});

// =========================================================
// GAME HOURS
// =========================================================
app.get('/api/games/hours', async (req, res) => {
  const gameId = String(req.query.game_id || '').trim();
  const days = clamp(parseInt(req.query.days || '7', 10), 1, 30);
  if (!gameId) return res.status(400).json({ success:false, error:"game_id requis" });

  try {
    const since = Date.now() - days*24*60*60*1000;
    const snaps = await db.collection('games').doc(gameId)
      .collection('hourly_stats').where('timestamp','>=', since).get();

    const hoursArr = Array.from({length:24},(_,h)=>({ hour:h, total_viewers:0, channels: new Set(), samples:0 }));
    snaps.forEach(d => {
      const x = d.data();
      const ts = x.timestamp || 0;
      const h = new Date(ts).getUTCHours();
      const viewers = Number(x.viewers || 0);
      hoursArr[h].total_viewers += viewers;
      if (x.channel_id) hoursArr[h].channels.add(String(x.channel_id));
      hoursArr[h].samples += 1;
    });

    const out = hoursArr.map(o => {
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

    const best = [...out].sort((a,b)=>(b.discoverability_score - a.discoverability_score) || (b.total_viewers - a.total_viewers))[0];
    return res.json({ success:true, game_id: gameId, days, hours: out, best_hour_utc: best?.hour ?? null });
  } catch (e) {
    return res.status(500).json({ success:false, error:e.message });
  }
});

// =========================================================
// IA RECO
// =========================================================
app.get('/api/ai/reco', async (req, res) => {
  const login = String(req.query.login || '').trim().toLowerCase();
  const days = clamp(parseInt(req.query.days || '30', 10), 7, 90);
  if (!login) return res.status(400).json({ success:false, html_response:"<p style='color:red;'>login requis</p>" });

  try {
    const uRes = await twitchAPI(`users?login=${encodeURIComponent(login)}`);
    if (!uRes.data?.length) return res.json({ success:false, html_response:"<p style='color:red;'>introuvable</p>" });
    const channelId = String(uRes.data[0].id);

    const sinceKey = yyyy_mm_dd_from_ms(Date.now() - days * 24 * 60 * 60 * 1000);
    const snaps = await db.collection('channels').doc(channelId)
      .collection('daily_stats').where('day','>=', sinceKey).orderBy('day','asc').get();

    if (snaps.empty) return res.json({ success:false, html_response:"<p style='color:red;'>Pas assez de données daily_stats.</p>" });

    const series = snaps.docs.map(d => d.data());
    const values = series.map(x=>Number(x.avg_viewers||0));
    const avg = Math.round(values.reduce((a,b)=>a+b,0)/(values.length||1));
    const peak = Math.max(...series.map(x=>Number(x.peak_viewers||0)));

    const first = values[0]||0;
    const last = values[values.length-1]||0;
    const growthPct = first>0 ? Math.round(((last-first)/first)*100) : (last>0?100:0);

    const mean = avg;
    const variance = values.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / (values.length || 1);
    const volatility = Math.round(Math.sqrt(variance));

    const totalMinutes = series.reduce((a,x)=>a+Number(x.minutes_live_est||0),0);
    const hoursPerWeek = Math.round((totalMinutes/60)/(days/7));
    const growthScore = computeGrowthScore({ avgViewers: avg, growthPct, volatility, hoursPerWeek });

    const prompt = `Tu es un coach Twitch DATA-DRIVEN. Réponds UNIQUEMENT en HTML (<h4>, <ul>, <li>, <p>, <strong>).

DONNÉES:
- avg_viewers: ${avg}
- peak_viewers: ${peak}
- growth_percent: ${growthPct}%
- volatility: ${volatility}
- hours_per_week_est: ${hoursPerWeek}
- growth_score: ${growthScore}/100

OBJECTIF:
- 5 recommandations concrètes
- 3 expériences à tester semaine prochaine
- 1 phrase motivante réaliste.`;

    const ai = await runGeminiAnalysis(prompt);
    return res.json(ai);
  } catch (e) {
    return res.status(500).json({ success:false, html_response:`<p style='color:red;'>${e.message}</p>` });
  }
});

// =========================================================
// CO-STREAM
// =========================================================
app.get('/api/costream/best', async (req, res) => {
  const login = String(req.query.login || '').trim().toLowerCase();
  if (!login) return res.status(400).json({ success:false, message:'login manquant' });

  try {
    const uRes = await twitchAPI(`users?login=${encodeURIComponent(login)}`);
    if (!uRes.data?.length) return res.json({ success:false, message:'Chaîne introuvable' });
    const me = uRes.data[0];

    const sMe = await twitchAPI(`streams?user_id=${me.id}`);
    const myStream = sMe.data?.[0] || null;

    const gameId = myStream?.game_id || null;
    const gameName = myStream?.game_name || null;
    const myViewers = Number(myStream?.viewer_count || 50);

    if (!gameId) return res.json({ success:false, message:'Chaîne offline (jeu inconnu). Lance un live.' });

    const sGame = await twitchAPI(`streams?game_id=${encodeURIComponent(gameId)}&first=100&language=fr`);
    const candidatesRaw = (sGame.data || []).filter(s => s.user_login && s.user_login.toLowerCase() !== login);

    if (!candidatesRaw.length) return res.json({ success:false, message:'Aucun co-streamer FR live sur ce jeu.' });

    const target = Math.max(5, myViewers);
    const scored = candidatesRaw.map(s=>{
      const v = Number(s.viewer_count || 0);
      const diff = Math.abs(v - target);
      const score = Math.max(1, 100 - diff);
      return { s, score };
    }).sort((a,b)=>b.score-a.score);

    const bestS = scored[0].s;

    let prof = null;
    try {
      const bestProfile = await twitchAPI(`users?login=${encodeURIComponent(bestS.user_login)}`);
      prof = bestProfile.data?.[0] || null;
    } catch (_) {}

    const candidates = scored.slice(0, 8).map(x=>({
      login: x.s.user_login,
      display_name: x.s.user_name,
      score: x.score
    }));

    return res.json({
      success:true,
      best: {
        login: bestS.user_login,
        display_name: bestS.user_name,
        profile_image_url: prof?.profile_image_url || null,
        score: scored[0].score,
        why: `Même jeu (${gameName || bestS.game_name}) + audience proche (${bestS.viewer_count} vs ~${target}).`
      },
      candidates
    });
  } catch (e) {
    return res.status(500).json({ success:false, message:e.message });
  }
});

// =========================================================
// CRON SNAPSHOTS (Firestore) — optional but recommended
// =========================================================
async function upsertChannelMetaFromStream(stream, nowMs) {
  const ref = db.collection('channels').doc(String(stream.user_id));
  try {
    const snap = await ref.get();
    const payload = {
      login: stream.user_login || null,
      display_name: stream.user_name || null,
      language: stream.language || null,
      current_game_id: stream.game_id || null,
      current_game_name: stream.game_name || null,
      last_seen_live: admin.firestore.Timestamp.fromMillis(nowMs)
    };
    if (!snap.exists) payload.first_seen = admin.firestore.Timestamp.fromMillis(nowMs);
    await ref.set(payload, { merge: true });
  } catch (e) {
    console.error("❌ [FIRESTORE] upsertChannelMetaFromStream:", e.message);
  }
}

async function upsertGameMeta(gameId, gameName) {
  if (!gameId) return;
  try {
    await db.collection('games').doc(String(gameId)).set({
      name: gameName || null,
      last_seen: admin.firestore.Timestamp.fromMillis(Date.now())
    }, { merge: true });
  } catch (_) {}
}

async function collectAnalyticsSnapshot() {
  const now = Date.now();
  try {
    const data = await twitchAPI('streams?first=100&language=fr');
    const streams = data?.data || [];
    let totalViewers = 0;

    let batch = db.batch();
    let ops = 0;

    const commitIfNeeded = async () => {
      if (ops >= 450) { await batch.commit(); batch = db.batch(); ops = 0; }
    };

    for (const s of streams) {
      totalViewers += (s.viewer_count || 0);

      await upsertChannelMetaFromStream(s, now);
      await upsertGameMeta(s.game_id, s.game_name);

      const chRef = db.collection('channels').doc(String(s.user_id))
        .collection('hourly_stats').doc(String(now));

      batch.set(chRef, {
        timestamp: now, // ms
        timestamp_ts: admin.firestore.Timestamp.fromMillis(now),
        viewers: s.viewer_count || 0,
        game_id: s.game_id || null,
        game_name: s.game_name || null,
        title: s.title || null,
        language: s.language || null
      }, { merge: false });

      ops++; await commitIfNeeded();
    }

    const globalRef = db.collection('stats_history').doc(String(now));
    batch.set(globalRef, {
      timestamp: admin.firestore.Timestamp.fromMillis(now),
      timestamp_ms: now,
      total_viewers: totalViewers,
      channels_live: streams.length,
      top_game: streams[0]?.game_name || null
    }, { merge: false });

    ops++; await commitIfNeeded();
    await batch.commit();

    console.log(`📊 [CRON] Snapshot saved: viewers=${totalViewers}, live=${streams.length}`);
  } catch (e) {
    console.error("❌ [CRON] Snapshot error:", e.message);
  }
}

if (ENABLE_CRON) {
  console.log(`✅ CRON ENABLED = true (every ${SNAPSHOT_EVERY_MIN} min)`);
  setInterval(collectAnalyticsSnapshot, SNAPSHOT_EVERY_MIN * 60 * 1000);
  collectAnalyticsSnapshot().catch(() => {});
} else {
  console.log(`ℹ️ CRON ENABLED = false`);
}

// =========================================================
// START SERVER
// =========================================================
server.listen(PORT, () => {
  console.log(`\n🚀 [SERVER] http://localhost:${PORT}`);
  console.log("✅ Routes prêtes");
});
