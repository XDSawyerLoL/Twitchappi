/**
 * STREAMER HUB – SAAS ANALYTICS PRO (V52+)
 * ---------------------------------------
 * - Twitch Helix
 * - Firestore Time Series
 * - Gemini IA
 * - CRON snapshot (stats_history + channels/{id}/hourly_stats)
 * - Analytics pro (avg/peak/volatility/growth)
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
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

// =========================================================
// 0) FIREBASE INIT (robuste Render)
// =========================================================
let serviceAccount = null;

if (process.env.FIREBASE_SERVICE_KEY) {
  try {
    let rawJson = process.env.FIREBASE_SERVICE_KEY;

    // Nettoyage de quotes éventuelles
    if (rawJson.startsWith("'") && rawJson.endsWith("'")) rawJson = rawJson.slice(1, -1);
    if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.slice(1, -1);

    // Normalisation \n
    rawJson = rawJson
      .replace(/\\r\\n/g, '\\n')
      .replace(/\\n/g, '\\n')
      .replace(/\\r/g, '\\n');

    serviceAccount = JSON.parse(rawJson);
  } catch (error) {
    console.error("❌ Erreur JSON Firebase:", error.message);
  }
} else {
  // fallback local éventuel
  try {
    serviceAccount = require('./serviceAccountKey.json');
  } catch (e) {}
}

try {
  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id
    });
    console.log("✅ [FIREBASE] Base de données connectée.");
  } else {
    admin.initializeApp(); // applicationDefault si dispo
    console.log("✅ [FIREBASE] Init applicationDefault.");
  }
} catch (e) {
  console.error("❌ [FIREBASE] Erreur Init:", e.message);
}

const db = admin.firestore();
try {
  db.settings({ ignoreUndefinedProperties: true });
} catch (e) {}

// =========================================================
// 1) CONFIG
// =========================================================
const PORT = process.env.PORT || 10000;

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash";

const ENABLE_CRON = String(process.env.ENABLE_CRON || 'false') === 'true';

// =========================================================
// 2) IA
// =========================================================
let aiClient = null;
if (GEMINI_API_KEY) {
  try {
    aiClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    console.log("✅ [IA] Moteur Gemini prêt.");
  } catch (e) {
    console.error("❌ [IA] Erreur Init:", e.message);
  }
}

async function runGeminiAnalysis(prompt) {
  if (!aiClient) {
    return {
      success: false,
      html_response: `<p style="color:#ff6666;">❌ IA non initialisée.</p>`
    };
  }

  try {
    const response = await aiClient.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction:
          "Tu es un expert Data Twitch. Réponds UNIQUEMENT en HTML simple (<p>, <h4>, <ul>, <li>, <strong>). Pas de markdown."
      }
    });

    const htmlContent = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return { success: true, html_response: htmlContent };
  } catch (e) {
    return {
      success: false,
      html_response: `<p style="color:#ff6666;">❌ Erreur IA: ${e.message}</p>`
    };
  }
}

// =========================================================
// 3) CACHE & TWITCH HELPERS
// =========================================================
const CACHE = {
  twitchTokens: {},
  twitchUser: null,
  boostedStream: null,
  lastScanData: null,
  globalStreamRotation: {
    streams: [],
    currentIndex: 0,
    lastFetchTime: 0,
    fetchCooldown: 3 * 60 * 1000
  }
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
  } catch (e) {
    console.error("❌ getTwitchToken:", e.message);
  }

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
    // invalide le token app
    if (!token) CACHE.twitchTokens['app'] = null;
    throw new Error("Token expiré (401).");
  }

  return res.json();
}

// =========================================================
// 4) FIREBASE STATUS (ton UI l'utilise)
// =========================================================
app.get('/firebase_status', (req, res) => {
  try {
    if (db && admin.apps.length > 0) {
      res.json({
        connected: true,
        message: 'Firebase connected',
        hasServiceAccount: !!serviceAccount
      });
    } else {
      res.json({ connected: false, message: 'Firebase not initialized' });
    }
  } catch (error) {
    res.json({ connected: false, error: error.message });
  }
});

// =========================================================
// 5) AUTH TWITCH
// =========================================================
app.get('/twitch_auth_start', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  const url =
    `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}` +
    `&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${state}`;

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

    CACHE.twitchUser = {
      display_name: user.display_name,
      id: user.id,
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
// 6) STREAMS / VOD / INFO
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
        user_name: s.user_name,
        user_login: s.user_login,
        viewer_count: s.viewer_count,
        thumbnail_url: s.thumbnail_url
      }))
    });
  } catch (e) {
    return res.status(500).json({ success: false });
  }
});

app.get('/get_latest_vod', async (req, res) => {
  try {
    const u = await twitchAPI(`users?login=${encodeURIComponent(req.query.channel || '')}`);
    if (!u.data?.length) return res.json({ success: false });

    const v = await twitchAPI(`videos?user_id=${u.data[0].id}&type=archive&first=1`);
    if (!v.data?.length) return res.json({ success: false });

    res.json({
      success: true,
      vod: {
        title: v.data[0].title,
        thumbnail_url: v.data[0].thumbnail_url.replace('{width}', '320').replace('{height}', '180'),
        id: v.data[0].id
      }
    });
  } catch (e) {
    res.json({ success: false });
  }
});

app.post('/stream_info', async (req, res) => {
  const { channel } = req.body;
  try {
    const data = await twitchAPI(`streams?user_login=${encodeURIComponent(channel)}`);
    if (data.data?.length > 0) return res.json({ success: true, stream: data.data[0] });
    res.json({ success: false });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =========================================================
// 7) ROTATION & BOOST
// =========================================================
async function refreshGlobalStreamList() {
  const now = Date.now();
  const rot = CACHE.globalStreamRotation;

  if (now - rot.lastFetchTime < rot.fetchCooldown && rot.streams.length > 0) return;

  try {
    const data = await twitchAPI(`streams?language=fr&first=100`);
    let suitable = (data.data || []).filter(s => s.viewer_count <= 100);
    if (suitable.length === 0) suitable = (data.data || []).slice(-10);

    if (suitable.length > 0) {
      rot.streams = suitable
        .sort(() => 0.5 - Math.random())
        .map(s => ({ channel: s.user_login, viewers: s.viewer_count }));

      rot.currentIndex = 0;
      rot.lastFetchTime = now;
    }
  } catch (e) {
    console.error("Erreur refresh streams:", e.message);
  }
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

    if (!q.empty) {
      boost = q.docs[0].data();
      CACHE.boostedStream = boost;
    }
  } catch (e) {
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > now) boost = CACHE.boostedStream;
  }

  if (boost) {
    return res.json({
      success: true,
      channel: boost.channel,
      mode: 'BOOST',
      message: `⚡ BOOST ACTIF`
    });
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
    viewers: rot.streams[rot.currentIndex].viewers,
    message: `👁️ AUTO 3MIN`
  });
});

app.post('/cycle_stream', async (req, res) => {
  const { direction } = req.body;

  if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
    return res.json({ success: false });
  }

  await refreshGlobalStreamList();
  const rot = CACHE.globalStreamRotation;
  if (rot.streams.length === 0) return res.json({ success: false });

  if (direction === 'next') rot.currentIndex = (rot.currentIndex + 1) % rot.streams.length;
  else rot.currentIndex = (rot.currentIndex - 1 + rot.streams.length) % rot.streams.length;

  return res.json({ success: true, channel: rot.streams[rot.currentIndex].channel });
});

app.post('/stream_boost', async (req, res) => {
  const { channel } = req.body;
  const now = Date.now();

  try {
    // doc = channel pour éviter d'empiler 100 boosts
    await db.collection('boosts').doc(String(channel).toLowerCase()).set({
      channel: String(channel).toLowerCase(),
      startTime: now,
      endTime: now + 15 * 60 * 1000
    }, { merge: true });

    res.json({
      success: true,
      message: `✅ Boost activé pendant 15 minutes!`
    });
  } catch (e) {
    res.status(500).json({ error: "Erreur DB" });
  }
});

// =========================================================
// 8) CRON ANALYTICS (LE POINT IMPORTANT)
// - écrit stats_history AVEC ID=timestamp (pas random)
// - écrit channels/{id}/hourly_stats/{timestamp}
// - écrit channels/{id} meta automatiquement (pas à la main)
// =========================================================
async function upsertChannelMetaFromStream(stream) {
  try {
    const ref = db.collection('channels').doc(stream.user_id);
    const snap = await ref.get();

    const payload = {
      login: stream.user_login || null,
      display_name: stream.user_name || null,
      language: stream.language || null,
      profile_image_url: null, // pas dans /streams, optionnel
      current_game_id: stream.game_id || null,
      current_game_name: stream.game_name || null,
      last_seen_live: admin.firestore.Timestamp.fromMillis(Date.now()),
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
    let totalViewers = 0;

    // log utile Render
    console.log(`[CRON] streams récupérés: ${streams.length}`);

    for (const s of streams) {
      totalViewers += s.viewer_count;

      // crée/merge le doc parent (pas manuel)
      await upsertChannelMetaFromStream(s);

      // TIME SERIES PAR CHAÎNE
      await db
        .collection('channels')
        .doc(s.user_id)
        .collection('hourly_stats')
        .doc(String(now))
        .set({
          timestamp: now,            // number (ms)
          viewers: s.viewer_count,   // number
          game_id: s.game_id || null,
          game_name: s.game_name || null,
          title: s.title || "",
          language: s.language || "fr"
        });

      // TIME SERIES PAR JEU (optionnel mais utile)
      if (s.game_id) {
        await db
          .collection('games')
          .doc(String(s.game_id))
          .collection('hourly_stats')
          .doc(`${s.user_id}_${now}`)
          .set({
            timestamp: now,
            channel_id: s.user_id,
            viewers: s.viewer_count
          });
      }
    }

    // ✅ IMPORTANT: stats_history avec ID = timestamp (PAS random)
    await db.collection('stats_history').doc(String(now)).set({
      timestamp: admin.firestore.Timestamp.fromMillis(now), // timestamp Firestore
      timestamp_ms: now,                                   // number utile
      total_viewers: totalViewers,
      channels_live: streams.length,
      top_game: streams[0]?.game_name || null
    });

    console.log(`📊 [CRON] Snapshot saved: viewers=${totalViewers}, live=${streams.length}`);
  } catch (e) {
    console.error('❌ [CRON] Snapshot error:', e.message);
  }
}

// cron ON/OFF par variable Render (pas besoin de .env)
if (ENABLE_CRON) {
  setInterval(collectAnalyticsSnapshot, 5 * 60 * 1000);
  // un run immédiat au boot pour remplir tout de suite
  collectAnalyticsSnapshot().catch(() => {});
}

// =========================================================
// 9) STATS (UI)
// =========================================================
app.get('/api/stats/global', async (req, res) => {
  try {
    const data = await twitchAPI('streams?first=100');
    let v = 0;
    (data.data || []).forEach(s => v += s.viewer_count);

    // estimation UI (tu avais ça)
    const est = Math.floor(v * 3.8);
    const topGame = data.data?.[0]?.game_name || "N/A";

    const history = { live: { labels: [], values: [] } };

    // lit 12 derniers points de stats_history
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
            const timeStr = `${date.getHours()}h${date.getMinutes() < 10 ? '0' + date.getMinutes() : date.getMinutes()}`;
            history.live.labels.push(timeStr);
            history.live.values.push(stats.total_viewers || 0);
          }
        });
      } else {
        history.live.labels = ["-1h", "Now"];
        history.live.values = [est * 0.9, est];
      }
    } catch (e) {
      console.error("Erreur stats_history read:", e.message);
    }

    res.json({
      success: true,
      total_viewers: est,
      total_channels: "98k+",
      top_game_name: topGame,
      history
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
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
// 10) ANALYTICS PRO (IMPORTANT: tri chronologique)
// =========================================================
app.get('/api/analytics/channel/:id', async (req, res) => {
  const channelId = req.params.id;
  const since = Date.now() - (30 * 24 * 60 * 60 * 1000);

  try {
    const snaps = await db
      .collection('channels')
      .doc(channelId)
      .collection('hourly_stats')
      .where('timestamp', '>', since)
      .get();

    if (snaps.empty) {
      return res.json({ success: false, message: 'Pas assez de données' });
    }

    // ✅ TRI OBLIGATOIRE (Firestore ne garantit pas l'ordre)
    const sorted = snaps.docs
      .map(d => d.data())
      .sort((a, b) => a.timestamp - b.timestamp);

    const viewers = sorted.map(x => Number(x.viewers || 0));

    const avg = Math.round(viewers.reduce((a, b) => a + b, 0) / viewers.length);
    const peak = Math.max(...viewers);

    const volatility = Math.round(
      Math.sqrt(viewers.reduce((a, v) => a + Math.pow(v - avg, 2), 0) / viewers.length)
    );

    const first = viewers[0];
    const last = viewers[viewers.length - 1];
    const growth = first > 0 ? Math.round(((last - first) / first) * 100) : 0;

    res.json({
      success: true,
      avg_viewers: avg,
      peak_viewers: peak,
      volatility,
      growth_percent: growth,
      samples: viewers.length
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// =========================================================
// 11) SCAN + IA
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
      let viewDisplay = u.view_count;
      if (viewDisplay === 0) viewDisplay = "Non public/0";

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
        view_count: viewDisplay,
        is_live: isLive,
        viewer_count: isLive ? streamInfo.viewer_count : 0
      };

      CACHE.lastScanData = { type: 'user', ...uData };
      return res.json({ success: true, type: 'user', user_data: uData });
    }

    const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(query)}&first=1`);
    if (gRes.data?.length) {
      const g = gRes.data[0];
      const sRes = await twitchAPI(`streams?game_id=${g.id}&first=20`);
      const total = (sRes.data || []).reduce((a, b) => a + b.viewer_count, 0);

      const gData = {
        name: g.name,
        box_art_url: g.box_art_url.replace('{width}', '60').replace('{height}', '80'),
        total_viewers: total
      };

      CACHE.lastScanData = { type: 'game', ...gData };
      return res.json({ success: true, type: 'game', game_data: gData });
    }

    res.json({ success: false });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/critique_ia', async (req, res) => {
  const { type, query } = req.body;
  const prompt = type === 'niche'
    ? `Analyse critique du niche "${query}" sur Twitch en 2025. Saturation? Opportunités? Recommandations? Format HTML.`
    : `Donne-moi 5 idées de clips viraux pour "${query}". Format HTML uniquement.`;

  const result = await runGeminiAnalysis(prompt);
  res.json(result);
});

// =========================================================
// 12) RAID
// =========================================================
app.post('/start_raid', async (req, res) => {
  const { game, max_viewers } = req.body;

  try {
    const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(game)}&first=1`);
    if (!gRes.data?.length) return res.json({ success: false });

    const sRes = await twitchAPI(`streams?game_id=${gRes.data[0].id}&first=100&language=fr`);
    const target = (sRes.data || [])
      .filter(s => s.viewer_count <= parseInt(max_viewers))
      .sort((a, b) => b.viewer_count - a.viewer_count)[0];

    if (target) {
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
    }

    res.json({ success: false });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =========================================================
// 13) BEST TIME TOOL
// =========================================================
app.post('/analyze_schedule', async (req, res) => {
  const { game } = req.body;
  if (!game) {
    return res.status(400).json({
      success: false,
      html_response: '<p style="color:#ff6666;">❌ Nom du jeu manquant</p>'
    });
  }

  try {
    const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(game)}&first=1`);
    if (!gRes.data?.length) {
      return res.json({
        success: false,
        html_response: `<p style="color:#ff6666;">❌ Jeu "${game}" non trouvé sur Twitch</p>`
      });
    }

    const gameName = gRes.data[0].name;
    const gameId = gRes.data[0].id;

    const sRes = await twitchAPI(`streams?game_id=${gameId}&first=100&language=fr`);
    const totalViewers = (sRes.data || []).reduce((a, b) => a + b.viewer_count, 0);
    const channelCount = (sRes.data || []).length;
    const avgViewers = Math.round(totalViewers / (channelCount || 1));

    const prompt = `Tu es expert en optimisation streaming Twitch pour le jeu "${gameName}". 

DONNÉES:
- Chaînes live: ${channelCount}
- Viewers totaux: ${totalViewers}
- Moyenne viewers/chaîne: ${avgViewers}

Réponds EXACTEMENT en HTML:
1) Saturation (Faible/Moyenne/Haute) + 1 phrase
2) 3 créneaux précis (Jour + Heure exacte)
3) Score profitability 1-10
4) 1 conseil actionnable

HTML strict: <p>, <h4>, <ul>, <li>, <strong>.`;

    const aiResponse = await runGeminiAnalysis(prompt);
    return res.json({
      success: aiResponse.success !== false,
      html_response: aiResponse.html_response || '❌ Erreur IA'
    });
  } catch (error) {
    return res.json({
      success: false,
      html_response: `<p style="color:#ff6666;">❌ Erreur: ${error.message}</p>`
    });
  }
});

// =========================================================
// 14) START
// =========================================================
app.listen(PORT, () => {
  console.log(`\n🚀 [SERVER] Démarré sur http://localhost:${PORT}`);
  console.log("✅ Routes prêtes");
  console.log(" - /firebase_status");
  console.log(" - /analyze_schedule");
  console.log(" - /scan_target, /start_raid, /stream_boost");
  console.log(" - /api/analytics/channel/:id");
  console.log(` - CRON ENABLED = ${ENABLE_CRON}`);
  console.log(" - Et d'autres endpoints\n");
});
