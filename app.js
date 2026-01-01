
---

# 📋 CODE COMPLET `app.js` (Backend Node.js/Express)

Remplace ton `app.js` entier par ceci :

```javascript
/**
 * STREAMER & NICHE AI HUB - BACKEND (CLEAN + FIX ROUTES CONTRACT)
 * =========================================================
 * Fixes:
 * - /stream_info ajouté (front l'appelait)
 * - /api/analytics/channel_by_login/:login renvoie {kpis, series:{labels,values}}
 * - /api/costream/best renvoie {best, candidates} (contrat front)
 * - computeGrowthScore dédoublonné
 * - /api/streams/small ✅ NOUVEAU
 * - /api/stats/global_intraday ✅ NOUVEAU
 * - /start_raid ✅ NOUVEAU
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
    console.log("✅ [FIREBASE] Base connectée (serviceAccount).");
  } else {
    admin.initializeApp();
    console.log("✅ [FIREBASE] init default.");
  }
} catch (e) {
  console.error("❌ [FIREBASE] init error:", e.message);
}

const db = admin.firestore();
try {
  if (serviceAccount) {
    db.settings({
      projectId: serviceAccount.project_id,
      ignoreUndefinedProperties: true
    });
  } else {
    db.settings({ ignoreUndefinedProperties: true });
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
    console.log("✅ [IA] Gemini prêt.");
  } catch (e) {
    console.error("❌ [IA] init error:", e.message);
  }
}

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

// Page principale (UI)
app.get('/', (req, res) => {
  const candidates = [
    process.env.UI_FILE,
    'NicheOptimizer.html',
    'NicheOptimizer_v56.html',
    'NicheOptimizer_v55.html',
    'NicheOptimizer_v53.html',
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
  lastScanData: null,
  globalStreamRotation: {
    streams: [],
    currentIndex: 0,
    lastFetchTime: 0,
    fetchCooldown: 3 * 60 * 1000
  }
};

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

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
  } catch (e) {
    return null;
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
      config: { systemInstruction: "Tu es un expert Data Twitch. Réponds UNIQUEMENT en HTML simple (<p>, <div>, <ul>, <strong>, etc). PAS de markdown." }
    });
    const text = response.candidates?.?.content?.parts?.?.text || "";
    return { success: true, html_response: text };
  } catch (e) {
    return { success: false, html_response: `<p style='color:red;'>❌ Erreur IA: ${e.message}</p>` };
  }
}

// =========================================================
// 2B. ANALYTICS SCORE (unique)
// =========================================================
function computeGrowthScore({ avgViewers = 0, growthPct = 0, volatility = 0, hoursPerWeek = 0 }) {
  const logPart = Math.log10(avgViewers + 1) * 22;
  const growthPart = clamp(growthPct, -50, 200) * 0.22;
  const volPenalty = clamp(volatility, 0, 200) * 0.18;
  const hoursPart = clamp(hoursPerWeek, 0, 80) * 0.25;
  const raw = 15 + logPart + growthPart + hoursPart - volPenalty;
  return Math.round(clamp(raw, 0, 100));
}

// =========================================================
// 2C. CRON SNAPSHOTS -> Firestore
// =========================================================
const ENABLE_CRON = (process.env.ENABLE_CRON || 'true').toLowerCase() !== 'false';
const SNAPSHOT_EVERY_MIN = parseInt(process.env.SNAPSHOT_EVERY_MIN || '5', 10);

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
  } catch (e) {}
}

async function updateDailyRollupsForStream(stream, nowMs) {
  const viewers = Number(stream.viewer_count || 0);
  const dayKey = yyyy_mm_dd_from_ms(nowMs);
  const chDailyRef = db.collection('channels').doc(String(stream.user_id))
    .collection('daily_stats').doc(dayKey);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(chDailyRef);
      const prev = snap.exists ? snap.data() : {};
      const prevPeak = Number(prev.peak_viewers || 0);
      const prevSamples = Number(prev.samples || 0);
      const prevSum = Number(prev.total_viewers_sum || 0);
      const nextSamples = prevSamples + 1;
      const nextSum = prevSum + viewers;
      const nextPeak = viewers > prevPeak ? viewers : prevPeak;
      tx.set(chDailyRef, {
        day: dayKey,
        samples: nextSamples,
        total_viewers_sum: nextSum,
        avg_viewers: Math.round(nextSum / nextSamples),
        peak_viewers: nextPeak,
        minutes_live_est: nextSamples * SNAPSHOT_EVERY_MIN,
        top_game_id: stream.game_id || null,
        top_game_name: stream.game_name || null,
        updated_at: admin.firestore.Timestamp.fromMillis(nowMs)
      }, { merge: true });
    });
  } catch (e) {
    console.error("❌ [DAILY] channel rollup:", e.message);
  }
}

async function collectAnalyticsSnapshot() {
  const now = Date.now();
  try {
    const data = await twitchAPI('streams?first=100&language=fr');
    const streams = data?.data || [];
    console.log(`[CRON] streams récupérés: ${streams.length}`);

    let totalViewers = 0;
    const rollupPromises = [];
    let batch = db.batch();
    let ops = 0;

    const commitIfNeeded = async () => {
      if (ops >= 450) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    };

    for (const s of streams) {
      totalViewers += (s.viewer_count || 0);
      await upsertChannelMetaFromStream(s, now);
      await upsertGameMeta(s.game_id, s.game_name);
      rollupPromises.push(updateDailyRollupsForStream(s, now));

      const chRef = db.collection('channels').doc(String(s.user_id))
        .collection('hourly_stats').doc(String(now));
      batch.set(chRef, {
        timestamp: now,
        viewers: s.viewer_count || 0,
        game_id: s.game_id || null,
        game_name: s.game_name || null,
        title: s.title || null,
        language: s.language || null
      }, { merge: false });
      ops++;
      await commitIfNeeded();

      if (s.game_id) {
        const gRef = db.collection('games').doc(String(s.game_id))
          .collection('hourly_stats').doc(`${s.user_id}_${now}`);
        batch.set(gRef, {
          timestamp: now,
          channel_id: String(s.user_id),
          viewers: s.viewer_count || 0
        }, { merge: false });
        ops++;
        await commitIfNeeded();
      }
    }

    const globalRef = db.collection('stats_history').doc(String(now));
    batch.set(globalRef, {
      timestamp: admin.firestore.Timestamp.fromMillis(now),
      timestamp_ms: now,
      total_viewers: totalViewers,
      channels_live: streams.length,
      top_game: streams?.game_name || null
    }, { merge: false });
    ops++;
    await commitIfNeeded();
    await batch.commit();
    await Promise.allSettled(rollupPromises);
    console.log(`📊 [CRON] Snapshot saved: viewers=${totalViewers}, live=${streams.length}`);
  } catch (e) {
    console.error("❌ [CRON] Snapshot error:", e.message);
  }
}

if (ENABLE_CRON) {
  console.log(` - CRON ENABLED = true`);
  setInterval(collectAnalyticsSnapshot, SNAPSHOT_EVERY_MIN * 60 * 1000);
  collectAnalyticsSnapshot().catch(() => {});
} else {
  console.log(` - CRON ENABLED = false`);
}

// =========================================================
// 3. AUTH
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
      const user = userRes.data;
      CACHE.twitchUser = {
        display_name: user.display_name,
        id: user.id,
        access_token: tokenData.access_token,
        expiry: Date.now() + (tokenData.expires_in * 1000),
        profile_image_url: user.profile_image_url
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
  res.json
