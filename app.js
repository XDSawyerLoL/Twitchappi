/**
 * STREAMER HUB – SAAS ANALYTICS PRO (V52+)
 * ---------------------------------------
 * - Twitch Helix
 * - Firestore time-series (channels + games + stats_history)
 * - Gemini AI (optional)
 * - Cron analytics (every 5 minutes)
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

const { GoogleGenAI } = require('@google/genai');
const admin = require('firebase-admin');

const app = express();

// =========================================================
// 0. FIREBASE INIT
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
    console.log("✅ [FIREBASE] Init default.");
  }
} catch (e) {
  console.error("❌ [FIREBASE] Erreur Init:", e.message);
}

const db = admin.firestore();
try {
  db.settings({ ignoreUndefinedProperties: true });
} catch (e) {}

// =========================================================
// 1. CONFIG
// =========================================================
const PORT = process.env.PORT || 10000;

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const ENABLE_CRON = (process.env.ENABLE_CRON || "true").toLowerCase() === "true";

let aiClient = null;
if (GEMINI_API_KEY) {
  try {
    aiClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    console.log("✅ [IA] Moteur Gemini prêt.");
  } catch (e) {
    console.error("❌ [IA] Erreur Init:", e.message);
  }
}

// =========================================================
// 2. MIDDLEWARE
// =========================================================
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

// =========================================================
// 3. CACHE + HELPERS
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
  if (!accessToken) throw new Error("No Twitch token.");

  const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
    headers: {
      'Client-ID': TWITCH_CLIENT_ID,
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (res.status === 401) {
    CACHE.twitchTokens.app = null;
    throw new Error("Token Twitch expiré.");
  }

  return res.json();
}

async function runGeminiAnalysis(prompt) {
  if (!aiClient) {
    return { success: false, html_response: `<p style="color:#ff6666;">❌ IA non initialisée.</p>` };
  }
  try {
    const response = await aiClient.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { systemInstruction: "Tu es un expert Data Twitch. Réponds UNIQUEMENT en HTML simple (<p>, <h4>, <ul>, <li>, <strong>). Pas de markdown." }
    });
    const html = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return { success: true, html_response: html };
  } catch (e) {
    return { success: false, html_response: `<p style="color:#ff6666;">❌ Erreur IA: ${e.message}</p>` };
  }
}

// =========================================================
// 4. FIREBASE STATUS
// =========================================================
app.get('/firebase_status', (req, res) => {
  try {
    res.json({
      connected: !!db && admin.apps.length > 0,
      message: (!!db && admin.apps.length > 0) ? "Firebase connected" : "Firebase not initialized"
    });
  } catch (e) {
    res.json({ connected: false, error: e.message });
  }
});

// =========================================================
// 5. AUTH TWITCH (OAuth user)
// =========================================================
app.get('/twitch_auth_start', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  const url =
    `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code&scope=user:read:follows&state=${state}`;

  // sur Render => HTTPS, mais en local secure peut gêner, donc on adapte
  const secureCookie = (process.env.NODE_ENV === 'production');
  res.cookie('twitch_state', state, { httpOnly: true, secure: secureCookie, maxAge: 600000 });
  res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state || state !== req.cookies.twitch_state) return res.send("Erreur Auth.");

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
      id: user.id,
      login: user.login,
      display_name: user.display_name,
      profile_image_url: user.profile_image_url,
      access_token: tokenData.access_token,
      expiry: Date.now() + (tokenData.expires_in * 1000)
    };

    res.send("<script>window.opener.location.reload(); window.close();</script>");
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
// 6. STREAM INFO (used by your UI)
// =========================================================
app.post('/stream_info', async (req, res) => {
  const { channel } = req.body;
  try {
    const data = await twitchAPI(`streams?user_login=${encodeURIComponent(channel)}`);
    if (data.data && data.data.length > 0) return res.json({ success: true, stream: data.data[0] });
    res.json({ success: false });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

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
        user_name: s.user_name,
        user_login: s.user_login,
        viewer_count: s.viewer_count,
        thumbnail_url: s.thumbnail_url
      }))
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// =========================================================
// 7. ROTATION + BOOST (used by your UI)
// =========================================================
async function refreshGlobalStreamList() {
  const now = Date.now();
  const rot = CACHE.globalStreamRotation;

  if (now - rot.lastFetchTime < rot.fetchCooldown && rot.streams.length > 0) return;

  const data = await twitchAPI(`streams?language=fr&first=100`);
  let suitable = (data.data || []).filter(s => s.viewer_count <= 100);
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

  // boost actif ?
  try {
    const q = await db.collection('boosts')
      .where('endTime', '>', now)
      .orderBy('endTime', 'desc')
      .limit(1)
      .get();
    if (!q.empty) boost = q.docs[0].data();
  } catch (e) {}

  if (boost) {
    return res.json({ success: true, channel: boost.channel, mode: 'BOOST', message: '⚡ BOOST ACTIF' });
  }

  await refreshGlobalStreamList();
  const rot = CACHE.globalStreamRotation;
  if (!rot.streams.length) return res.json({ success: true, channel: 'twitch', mode: 'FALLBACK' });

  return res.json({
    success: true,
    channel: rot.streams[rot.currentIndex].channel,
    mode: 'AUTO',
    viewers: rot.streams[rot.currentIndex].viewers,
    message: '👁️ AUTO 3MIN'
  });
});

app.post('/cycle_stream', async (req, res) => {
  const { direction } = req.body;

  await refreshGlobalStreamList();
  const rot = CACHE.globalStreamRotation;
  if (!rot.streams.length) return res.json({ success: false });

  if (direction === 'next') rot.currentIndex = (rot.currentIndex + 1) % rot.streams.length;
  else rot.currentIndex = (rot.currentIndex - 1 + rot.streams.length) % rot.streams.length;

  res.json({ success: true, channel: rot.streams[rot.currentIndex].channel });
});

app.post('/stream_boost', async (req, res) => {
  const { channel } = req.body;
  try {
    const now = Date.now();
    const endTime = now + 15 * 60 * 1000;

    // ✅ doc id stable = channel (pas .add())
    await db.collection('boosts').doc(String(channel).toLowerCase()).set({
      channel: String(channel).toLowerCase(),
      startTime: now,
      endTime
    });

    res.json({ success: true, message: "✅ Boost activé 15 min" });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// =========================================================
// 8. STATS (global dashboard)
// =========================================================
app.get('/api/stats/global', async (req, res) => {
  try {
    const data = await twitchAPI('streams?first=100');
    let v = 0;
    (data.data || []).forEach(s => v += (s.viewer_count || 0));

    const est = Math.floor(v * 3.8);
    const topGame = data.data?.[0]?.game_name || "N/A";

    const history = { live: { labels: [], values: [] } };

    // on lit stats_history (12 derniers)
    const snaps = await db.collection('stats_history')
      .orderBy('timestamp', 'desc')
      .limit(12)
      .get();

    if (!snaps.empty) {
      snaps.docs.reverse().forEach(d => {
        const stats = d.data();
        if (stats.timestamp && stats.total_viewers != null) {
          const date = stats.timestamp.toDate();
          const timeStr = `${date.getHours()}h${String(date.getMinutes()).padStart(2, '0')}`;
          history.live.labels.push(timeStr);
          history.live.values.push(stats.total_viewers);
        }
      });
    } else {
      history.live.labels = ["-1h", "Now"];
      history.live.values = [Math.floor(est * 0.9), est];
    }

    res.json({
      success: true,
      total_viewers: est,
      total_channels: "98k+",
      top_game_name: topGame,
      history
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
        box_art_url: (g.box_art_url || '').replace('{width}', '52').replace('{height}', '72')
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
    (d.data || []).forEach(s => {
      const key = (s.language || '??').toLowerCase();
      l[key] = (l[key] || 0) + 1;
    });

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
// 9. SCAN + RAID + BEST TIME TOOL
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
      const createdDate = new Date(u.created_at).toLocaleDateString('fr-FR');

      const uData = {
        login: u.login,
        display_name: u.display_name,
        profile_image_url: u.profile_image_url,
        description: u.description || "Aucune bio.",
        created_at: createdDate,
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
          box_art_url: (g.box_art_url || '').replace('{width}', '60').replace('{height}', '80'),
          total_viewers: total,
          ai_calculated_niche_score: total < 5000 ? 4.0 : 2.0
        }
      });
    }

    res.json({ success: false });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/critique_ia', async (req, res) => {
  const { type, query } = req.body;
  const prompt = (type === 'niche')
    ? `Analyse critique du niche "${query}" sur Twitch. Saturation? Opportunités? Recommandations? Format HTML.`
    : `Donne-moi 5 idées de clips viraux pour "${query}". Format HTML uniquement.`;
  res.json(await runGeminiAnalysis(prompt));
});

app.post('/start_raid', async (req, res) => {
  const { game, max_viewers } = req.body;
  try {
    const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(game)}&first=1`);
    if (!gRes.data?.length) return res.json({ success: false });

    const sRes = await twitchAPI(`streams?game_id=${gRes.data[0].id}&first=100&language=fr`);
    const target = (sRes.data || [])
      .filter(s => (s.viewer_count || 0) <= parseInt(max_viewers || "100", 10))
      .sort((a, b) => (b.viewer_count || 0) - (a.viewer_count || 0))[0];

    if (!target) return res.json({ success: false });

    const thumb = (target.thumbnail_url || '').replace('{width}', '320').replace('{height}', '180');
    res.json({
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
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/analyze_schedule', async (req, res) => {
  const { game } = req.body;
  if (!game) {
    return res.status(400).json({ success: false, html_response: '<p style="color:#ff6666;">❌ Nom du jeu manquant</p>' });
  }

  try {
    const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(game)}&first=1`);
    if (!gRes.data?.length) {
      return res.json({ success: false, html_response: `<p style="color:#ff6666;">❌ Jeu "${game}" non trouvé</p>` });
    }

    const gameName = gRes.data[0].name;
    const gameId = gRes.data[0].id;

    const sRes = await twitchAPI(`streams?game_id=${gameId}&first=100&language=fr`);
    const totalViewers = (sRes.data || []).reduce((a, b) => a + (b.viewer_count || 0), 0);
    const channelCount = (sRes.data || []).length;
    const avgViewers = Math.round(totalViewers / (channelCount || 1));

    const prompt = `Tu es expert Twitch pour le jeu "${gameName}". Donne UNIQUEMENT du HTML simple (<p>, <h4>, <ul>, <li>, <strong>).

DONNÉES:
- Chaînes live: ${channelCount}
- Viewers totaux: ${totalViewers}
- Moyenne: ${avgViewers}

RENDS:
1) Saturation (Faible/Moyenne/Haute)
2) 3 créneaux précis (Jour + heures)
3) Score niche 1 à 10
4) 1 conseil actionnable`;

    const ai = await runGeminiAnalysis(prompt);
    res.json({ success: ai.success !== false, html_response: ai.html_response || '<p style="color:#ff6666;">❌ Erreur IA</p>' });
  } catch (e) {
    res.json({ success: false, html_response: `<p style="color:#ff6666;">❌ Erreur: ${e.message}</p>` });
  }
});

// =========================================================
// 10. CRON ANALYTICS (AUTO FIRESTORE)
// =========================================================
async function upsertChannelMetaFromStream(stream) {
  try {
    const ref = db.collection('channels').doc(stream.user_id);
    const snap = await ref.get();

    const payload = {
      login: stream.user_login || null,
      display_name: stream.user_name || null,
      language: stream.language || null,
      current_game_id: stream.game_id || null,
      current_game_name: stream.game_name || null,
      last_seen_live: admin.firestore.Timestamp.fromMillis(Date.now()),
      profile_image_url: null // on pourrait l'enrichir via /users si tu veux
    };

    if (!snap.exists) {
      payload.first_seen = admin.firestore.Timestamp.fromMillis(Date.now());
    }

    await ref.set(payload, { merge: true });
  } catch (e) {
    console.error("❌ upsertChannelMetaFromStream:", e.message);
  }
}

async function collectAnalyticsSnapshot() {
  const now = Date.now();
  try {
    const data = await twitchAPI('streams?first=100&language=fr');
    const streams = data.data || [];

    console.log(`[CRON] streams récupérés: ${streams.length}`);

    let totalViewers = 0;

    // batch write (limite 500 opérations)
    let batch = db.batch();
    let ops = 0;

    for (const s of streams) {
      totalViewers += (s.viewer_count || 0);

      // 1) fiche channel (meta)
      await upsertChannelMetaFromStream(s);

      // 2) time-series channel
      const chRef = db.collection('channels').doc(s.user_id).collection('hourly_stats').doc(String(now));
      batch.set(chRef, {
        timestamp: now,
        viewers: s.viewer_count || 0,
        game_id: s.game_id || null,
        game_name: s.game_name || null,
        title: s.title || null,
        language: s.language || null
      }, { merge: false });
      ops++;

      // 3) time-series game (optionnel)
      if (s.game_id) {
        const gRef = db.collection('games').doc(String(s.game_id))
          .collection('hourly_stats')
          .doc(`${s.user_id}_${now}`);

        batch.set(gRef, {
          timestamp: now,
          channel_id: s.user_id,
          viewers: s.viewer_count || 0
        }, { merge: false });
        ops++;
      }

      // commit si trop d'opérations
      if (ops >= 450) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }

    if (ops > 0) await batch.commit();

    // ✅ FIX IMPORTANT : stats_history ID = timestamp (pas .add)
    await db.collection('stats_history').doc(String(now)).set({
      timestamp: admin.firestore.Timestamp.fromMillis(now),
      total_viewers: totalViewers,
      channels_live: streams.length,
      top_game: streams[0]?.game_name || null
    });

    console.log("📊 [CRON] Snapshot saved:", now);
  } catch (e) {
    console.error("❌ [CRON] Snapshot error:", e.message);
  }
}

if (ENABLE_CRON) {
  console.log(" - CRON ENABLED = true");
  collectAnalyticsSnapshot(); // run once at boot
  setInterval(collectAnalyticsSnapshot, 5 * 60 * 1000);
} else {
  console.log(" - CRON ENABLED = false");
}

// =========================================================
// 11. SERVER START
// =========================================================
app.listen(PORT, () => {
  console.log(`\n🚀 [SERVER] Démarré sur http://localhost:${PORT}`);
  console.log("✅ Routes prêtes");
  console.log(" - /firebase_status");
  console.log(" - /twitch_auth_start, /twitch_auth_callback");
  console.log(" - /twitch_user_status, /twitch_logout");
  console.log(" - /followed_streams, /stream_info");
  console.log(" - /get_default_stream, /cycle_stream, /stream_boost");
  console.log(" - /api/stats/global, /api/stats/top_games, /api/stats/languages");
  console.log(" - /scan_target, /start_raid, /analyze_schedule");
});
