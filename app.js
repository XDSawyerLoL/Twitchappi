/**
 * STREAMER & NICHE AI HUB - BACKEND (V51 - FIREBASE STATUS + BEST TIME TOOL)
 * =========================================================
 * - Moteur IA : @google/genai (Gemini 2.5 Flash)
 * - Scan : Enrichi via endpoint /channels (Tags, Langue, Titre)
 * - Raid : Correction images (Taille 320x180)
 * - Planning : Prompt IA forcé pour donner des horaires précis
 * - NOUVEAU: Endpoint Firebase Status + Best Time Tool amélioré
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const http = require('http');
const { Server } = require('socket.io');

// ✅ MOTEUR IA
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
    rawJson = rawJson
      .replace(/\\r\\n/g, '\\n')
      .replace(/\\n/g, '\\n')
      .replace(/\\r/g, '\\n');
    serviceAccount = JSON.parse(rawJson);
  } catch (error) {
    console.error("❌ Erreur JSON Firebase:", error.message);
  }
} else {
  try {
    serviceAccount = require('./serviceAccountKey.json');
  } catch (e) {}
}

if (serviceAccount) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id
    });
    console.log("✅ [FIREBASE] Base de données connectée.");
  } catch (e) {
    console.error("❌ [FIREBASE] Erreur Init:", e.message);
  }
} else {
  try {
    admin.initializeApp();
  } catch (e) {}
}

const db = admin.firestore();

if (serviceAccount) {
  try {
    db.settings({
      projectId: serviceAccount.project_id,
      ignoreUndefinedProperties: true
    });
  } catch (e) {}
}

const app = express();

// =========================================================
// 1. CONFIGURATION
// =========================================================
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
    console.log("✅ [IA] Moteur Gemini 2.5 prêt.");
  } catch (e) {
    console.error("❌ [IA] Erreur Init:", e.message);
  }
}

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

// Page principale (ton UI)
app.get('/', (req, res) => {
  // IMPORTANT: le fichier UI s'appelle NicheOptimizer.html dans ton repo
  res.sendFile(path.join(__dirname, 'NicheOptimizer_v53.html'));
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
    if (token === CACHE.twitchTokens['app']?.access_token) CACHE.twitchTokens['app'] = null;
    throw new Error(`Token expiré.`);
  }

  return res.json();
}


async function fetchLocalJson(pathname) {
  const url = `http://localhost:${PORT}${pathname}`;
  const r = await fetch(url);
  return r.json();
}

async function runGeminiAnalysis(prompt) {
  if (!aiClient) {
    return {
      success: false,
      html_response: "<p style='color:red;'>❌ IA non initialisée.</p>"
    };
  }

  try {
    const response = await aiClient.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{
        role: "user",
        parts: [{ text: prompt }]
      }],
      config: {
        systemInstruction: "Tu es un expert Data Twitch. Réponds UNIQUEMENT en HTML simple (<p>, <h4>, <ul>, <li>, <strong>). Pas de markdown, pas de backticks."
      }
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return {
      success: true,
      html_response: text
    };
  } catch (e) {
    console.error("❌ Erreur IA:", e);
    return {
      success: false,
      html_response: `<p style='color:red;'>❌ Erreur IA: ${e.message}</p>`
    };
  }
}


// =========================================================
// 2B. FIRESTORE ANALYTICS – HELPERS + CRON (AUTO, NO MANUAL)
// =========================================================

// IMPORTANT: Sur Render et autres plateformes, plusieurs instances peuvent tourner.
// Par défaut on ACTIVE le cron sauf si ENABLE_CRON='false'
const ENABLE_CRON = (process.env.ENABLE_CRON || 'true').toLowerCase() !== 'false';
const SNAPSHOT_EVERY_MIN = parseInt(process.env.SNAPSHOT_EVERY_MIN || '5', 10); // 5 min par défaut

function yyyy_mm_dd_from_ms(ms) {
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`; // UTC day key
}

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function computeGrowthScore({ avgViewers = 0, growthPct = 0, volatility = 0, hoursPerWeek = 0 }) {
  // Score propriétaire simple et stable (0-100), pas de promesse "magique"
  // - croissance compte, mais une croissance instable est pénalisée
  // - avg viewers compte (log pour éviter de favoriser uniquement les gros)
  // - volume (heures) compte légèrement : régularité = meilleures chances
  const logPart = Math.log10(avgViewers + 1) * 22;             // ~0..66
  const growthPart = clamp(growthPct, -50, 200) * 0.22;       // ~-11..44
  const volPenalty = clamp(volatility, 0, 200) * 0.18;        // ~0..36
  const hoursPart = clamp(hoursPerWeek, 0, 80) * 0.25;        // ~0..20
  const raw = 15 + logPart + growthPart + hoursPart - volPenalty;
  return Math.round(clamp(raw, 0, 100));
}

function computeSaturationIndex({ channels = 0, totalViewers = 0 }) {
  // 0..100, plus haut = plus saturé (beaucoup de chaînes pour peu de viewers)
  // ratio = channels / (totalViewers+1) -> on le scale
  const ratio = channels / (totalViewers + 1);
  // ratio typique: 0.005..0.05 ; on normalise
  const score = clamp((ratio * 2000), 0, 100);
  return Math.round(score);
}

function computeDiscoverabilityScore({ yourViewers = 0, totalViewers = 0, channels = 0 }) {
  // 0..100, plus haut = plus "découvrable"
  // heuristique: peu de concurrence + assez de viewers dans la niche + toi pas trop petit vs median
  const sat = computeSaturationIndex({ channels, totalViewers }); // 0..100
  const market = clamp(Math.log10(totalViewers + 1) * 20, 0, 60); // 0..60
  const you = clamp(Math.log10(yourViewers + 1) * 18, 0, 40);     // 0..40
  const score = clamp((100 - sat) * 0.55 + market * 0.25 + you * 0.20, 0, 100);
  return Math.round(score);
}

async function upsertChannelMetaFromStream(stream, nowMs) {
  // stream vient de Helix streams
  // ⚠️ le doc parent est "métadonnées" (pas de time series)
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

async function collectAnalyticsSnapshot() {
  const now = Date.now();
  try {
    const data = await twitchAPI('streams?first=100&language=fr');
    const streams = data?.data || [];
    console.log(`[CRON] streams récupérés: ${streams.length}`);

    let totalViewers = 0;

    // batch pour limiter le coût
    let batch = db.batch();
    let ops = 0;
    const commitIfNeeded = async () => {
      if (ops >= 450) { // marge sous la limite 500
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    };

    for (const s of streams) {
      totalViewers += (s.viewer_count || 0);

      // doc parent + meta
      await upsertChannelMetaFromStream(s, now);
      await upsertGameMeta(s.game_id, s.game_name);

      // time-series channel
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
      ops++; await commitIfNeeded();

      // time-series game (pour saturation / niches)
      if (s.game_id) {
        const gRef = db.collection('games').doc(String(s.game_id))
          .collection('hourly_stats').doc(`${s.user_id}_${now}`);
        batch.set(gRef, {
          timestamp: now,
          channel_id: String(s.user_id),
          viewers: s.viewer_count || 0
        }, { merge: false });
        ops++; await commitIfNeeded();
      }
    }

    // global snapshot (ID = timestamp)
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

async function runDailyAggregation(dayKey) {
  // Agrège une journée UTC (YYYY-MM-DD) à partir des snapshots (hourly_stats / games/hourly_stats)
  // Ecrit dans daily_stats (par chaîne, par jeu) + global_daily
  try {
    const start = new Date(`${dayKey}T00:00:00.000Z`).getTime();
    const end = new Date(`${dayKey}T23:59:59.999Z`).getTime();

    // 1) GLOBAL (depuis stats_history)
    const globalSnaps = await db.collection('stats_history')
      .where('timestamp_ms', '>=', start)
      .where('timestamp_ms', '<=', end)
      .get();

    let gTotalViewers = 0, gPeak = 0, gSamples = 0, gChannelsLive = 0;
    globalSnaps.forEach(d => {
      const v = d.data().total_viewers || 0;
      const c = d.data().channels_live || 0;
      gTotalViewers += v;
      gChannelsLive += c;
      gPeak = Math.max(gPeak, v);
      gSamples += 1;
    });

    const globalDailyRef = db.collection('daily_stats_global').doc(dayKey);
    await globalDailyRef.set({
      day: dayKey,
      avg_total_viewers: gSamples ? Math.round(gTotalViewers / gSamples) : 0,
      peak_total_viewers: gPeak,
      avg_channels_live: gSamples ? Math.round(gChannelsLive / gSamples) : 0,
      samples: gSamples,
      updated_at: admin.firestore.Timestamp.fromMillis(Date.now())
    }, { merge: true });

    // 2) PAR JEU (on agrège games/*/hourly_stats)
    // On limite aux jeux vus dans la journée (liste depuis stats global streams top_game est insuffisante)
    // -> on récupère une liste de games docs "touchés" récemment en lisant les hourly_stats de la journée par collection group.
    // Firestore: collectionGroup('hourly_stats') sur games est possible si règles/index ok.
    const gameHourly = await db.collectionGroup('hourly_stats')
      .where('timestamp', '>=', start)
      .where('timestamp', '<=', end)
      .get();

    const perGame = new Map(); // gameId -> {total, peak, samples, channelsSet}
    const perChannel = new Map(); // channelId -> {total, peak, samples, gameCounts}

    gameHourly.forEach(doc => {
      const data = doc.data();
      const parent = doc.ref.parent.parent; // games/{gameId}
      const gameId = parent?.id;
      if (!gameId) return;

      const viewers = data.viewers || 0;
      const channelId = data.channel_id || null;

      let g = perGame.get(gameId);
      if (!g) g = { total: 0, peak: 0, samples: 0, channels: new Set() };
      g.total += viewers;
      g.peak = Math.max(g.peak, viewers);
      g.samples += 1;
      if (channelId) g.channels.add(channelId);
      perGame.set(gameId, g);

      if (channelId) {
        let ch = perChannel.get(channelId);
        if (!ch) ch = { total: 0, peak: 0, samples: 0, games: new Map() };
        ch.total += viewers;
        ch.peak = Math.max(ch.peak, viewers);
        ch.samples += 1;
        ch.games.set(gameId, (ch.games.get(gameId) || 0) + 1);
        perChannel.set(channelId, ch);
      }
    });

    // Ecriture par batch
    let batch = db.batch();
    let ops = 0;
    const commitIfNeeded = async () => {
      if (ops >= 450) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    };

    for (const [gameId, g] of perGame.entries()) {
      const ref = db.collection('games').doc(String(gameId))
        .collection('daily_stats').doc(dayKey);
      batch.set(ref, {
        day: dayKey,
        avg_viewers_total: g.samples ? Math.round(g.total / g.samples) : 0,
        peak_viewers_total: g.peak,
        unique_channels: g.channels.size,
        samples: g.samples,
        saturation_score: computeSaturationIndex({ channels: g.channels.size, totalViewers: g.samples ? (g.total / g.samples) : 0 }),
        updated_at: admin.firestore.Timestamp.fromMillis(Date.now())
      }, { merge: true });
      ops++; await commitIfNeeded();
    }

    for (const [channelId, ch] of perChannel.entries()) {
      // top game du jour (le plus fréquent dans hourly stats)
      let topGameId = null; let topCount = 0;
      for (const [gid, cnt] of ch.games.entries()) {
        if (cnt > topCount) { topCount = cnt; topGameId = gid; }
      }

      const approxMinutesLive = ch.samples * SNAPSHOT_EVERY_MIN; // 1 sample ~= SNAPSHOT_EVERY_MIN minutes
      const ref = db.collection('channels').doc(String(channelId))
        .collection('daily_stats').doc(dayKey);
      batch.set(ref, {
        day: dayKey,
        avg_viewers: ch.samples ? Math.round(ch.total / ch.samples) : 0,
        peak_viewers: ch.peak,
        minutes_live_est: approxMinutesLive,
        top_game_id: topGameId,
        samples: ch.samples,
        updated_at: admin.firestore.Timestamp.fromMillis(Date.now())
      }, { merge: true });
      ops++; await commitIfNeeded();
    }

    await batch.commit();

    console.log(`📅 [DAILY] Aggregation OK for ${dayKey} (games=${perGame.size}, channels=${perChannel.size})`);
  } catch (e) {
    console.error("❌ [DAILY] Aggregation error:", e.message);
  }
}

// Daily job: toutes les heures, on tente d’agréger "hier" (idempotent)
async function dailyAggregationTick() {
  // On agrège à la fois "aujourd'hui" (partiel) et "hier" (complet).
  // Objectif: obtenir des daily_stats rapidement même au démarrage du produit.
  const now = Date.now();
  const todayKey = yyyy_mm_dd_from_ms(now);
  const yesterdayKey = yyyy_mm_dd_from_ms(now - 24 * 60 * 60 * 1000);
  await runDailyAggregation(todayKey);
  if (yesterdayKey !== todayKey) await runDailyAggregation(yesterdayKey);
}



// =========================================================
// 2D. ALERTES IA AUTOMATIQUES + GAME HOURS (PRO)
// =========================================================

// Petite formule "growth score" propriétaire (0-100) basée sur daily_stats
function computeGrowthScore({ avg_viewers=0, peak_viewers=0, growth_percent=0, days=1, minutes_live_est=0 } = {}) {
  const base = Math.log10(avg_viewers + 1) * 25;              // 0..~60
  const peakBoost = Math.log10(peak_viewers + 1) * 10;        // 0..~40
  const growthBoost = Math.max(-50, Math.min(200, growth_percent)) * 0.15; // -7.5..30
  const cadence = Math.min(20, (minutes_live_est / 60) * 1.2); // 0..20 (heures)
  const raw = base + peakBoost + growthBoost + cadence;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

// Enregistre une alerte (idempotente) dans alerts/{channelId}/items/{dayKey_type}
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

// Génère des alertes simples (sans magie) + option IA (Gemini) si présent
async function generateAlertsForLogin(login, days=30) {
  try {
    // resolve twitch id
    const uRes = await twitchAPI(`users?login=${encodeURIComponent(login)}`);
    if (!uRes.data || !uRes.data.length) return { success:false, message:"introuvable" };
    const user = uRes.data[0];
    const channelId = String(user.id);

    // daily stats récents
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

    const growth_score = computeGrowthScore({ avg_viewers: avg, peak_viewers: peak, growth_percent, minutes_live_est });
    const dayKey = yyyy_mm_dd_from_ms(Date.now());

    // Alertes déterministes
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

    // Option IA: 1 alerte premium / jour
    if (aiClient) {
      const prompt = `Tu es un coach Twitch. Pour la chaîne ${user.display_name} (${login}), propose 1 alerte courte et actionnable pour AUJOURD'HUI (FR), basée sur: moyenne=${avg}, pic=${peak}, croissance=${growth_percent}%, score=${growth_score}/100. Réponds en JSON strict: {"title":"...","message":"...","tag":"..."} (tag = growth|niche|schedule|content).`;
      const out = await runGeminiAnalysis(prompt);
      // runGeminiAnalysis renvoie html, on veut json -> on tente parse
      const raw = (out.html_response || "").trim();
      try {
        const jsonStart = raw.indexOf('{');
        const jsonEnd = raw.lastIndexOf('}');
        if (jsonStart >= 0 && jsonEnd > jsonStart) {
          const obj = JSON.parse(raw.slice(jsonStart, jsonEnd+1));
          if (obj?.title && obj?.message) {
            await saveAlert(channelId, dayKey, "ia", {
              title: obj.title,
              message: obj.message,
              tag: obj.tag || "growth",
              score: growth_score
            });
          }
        }
      } catch (_) {}
    }

    return { success:true, channel_id: channelId, growth_score, growth_percent, avg_viewers: avg, peak_viewers: peak };
  } catch (e) {
    return { success:false, error: e.message };
  }
}

// Endpoint: récupère les alertes d'un streamer (par login)
app.get('/api/alerts/channel_by_login/:login', async (req, res) => {
  const login = String(req.params.login||'').trim().toLowerCase();
  const limit = clamp(parseInt(req.query.limit||'10',10), 1, 50);
  if (!login) return res.status(400).json({ success:false, error:"login manquant" });

  try {
    const uRes = await twitchAPI(`users?login=${encodeURIComponent(login)}`);
    if (!uRes.data || !uRes.data.length) return res.json({ success:false, error:"introuvable" });
    const channelId = String(uRes.data[0].id);

    const q = await db.collection('alerts').doc(channelId)
      .collection('items').orderBy('created_at','desc').limit(limit).get();

    const items = q.docs.map(d => d.data());
    return res.json({ success:true, channel_id: channelId, items });
  } catch (e) {
    return res.status(500).json({ success:false, error:e.message });
  }
});

// Endpoint: heatmap / saturation par heure pour un jeu (basé sur games/{gameId}/hourly_stats)


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
      const h = new Date(ts).getUTCHours(); // UTC pour cohérence serveur
      const viewers = x.viewers || 0;
      hours[h].total_viewers += viewers;
      if (x.channel_id) hours[h].channels.add(String(x.channel_id));
      hours[h].samples += 1;
    });

    const out = hours.map(o => {
      const ch = o.channels.size;
      const avgPerChan = ch ? Math.round(o.total_viewers / ch) : 0;
      // saturation: plus il y a de chaînes pour peu de viewers/chan, plus c'est saturé
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

    // top slot = discoverability max (avec viewers suffisants)
    const best = [...out].sort((a,b)=> (b.discoverability_score - a.discoverability_score) || (b.total_viewers - a.total_viewers))[0];

    return res.json({ success:true, game_id: gameId, days, hours: out, best_hour_utc: best?.hour ?? null });
  } catch (e) {
    return res.status(500).json({ success:false, error:e.message });
  }
});

if (ENABLE_CRON) {
  console.log(` - CRON ENABLED = true`);
  setInterval(collectAnalyticsSnapshot, SNAPSHOT_EVERY_MIN * 60 * 1000);
  // tick immédiat au démarrage pour remplir plus vite
  collectAnalyticsSnapshot().catch(() => {});
  // daily aggregation tick immédiat
  dailyAggregationTick().catch(() => {});
  // daily aggregation toutes les heures
  setInterval(dailyAggregationTick, 10 * 60 * 1000);
} else {
  console.log(` - CRON ENABLED = false`);
}

// =========================================================
// 3. ROUTES AUTH & VOD
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
      display_name: CACHE.twitchUser.display_name
    });
  }
  res.json({ is_connected: false });
});

// =========================================================
// 3A. FIREBASE STATUS (NOUVEAU)
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
      res.json({
        connected: false,
        message: 'Firebase not initialized'
      });
    }
  } catch (error) {
    res.json({
      connected: false,
      error: error.message
    });
  }
});

// =========================================================
// 4. STREAMS & VOD
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
      streams: data.data.map(s => ({
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
    return res.status(500).json({ success: false });
  }
});

app.get('/get_latest_vod', async (req, res) => {
  try {
    const u = await twitchAPI(`users?login=${encodeURIComponent(req.query.channel)}`);
    if (!u.data.length) return res.json({ success: false });

    const v = await twitchAPI(`videos?user_id=${u.data[0].id}&type=archive&first=1`);
    if (!v.data.length) return res.json({ success: false });

    res.json({
      success: true,
      vod: {
        title: v.data[0].title,
        thumbnail_url: v.data[0].thumbnail_url
          .replace('{width}', '320')
          .replace('{height}', '180'),
        id: v.data[0].id
      }
    });
  } catch (e) {
    res.json({ success: false });
  }
});

// =========================================================
// 5. ROTATION & BOOST
// =========================================================
async function refreshGlobalStreamList() {
  const now = Date.now();
  const rot = CACHE.globalStreamRotation;

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
  } catch (e) {
    console.error("Erreur refresh streams:", e);
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
  } catch (e) {
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > now) {
      boost = CACHE.boostedStream;
    }
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
    return res.json({
      success: true,
      channel: 'twitch',
      mode: 'FALLBACK'
    });
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

  if (rot.streams.length === 0) {
    return res.json({ success: false });
  }

  if (direction === 'next') {
    rot.currentIndex = (rot.currentIndex + 1) % rot.streams.length;
  } else {
    rot.currentIndex = (rot.currentIndex - 1 + rot.streams.length) % rot.streams.length;
  }

  return res.json({
    success: true,
    channel: rot.streams[rot.currentIndex].channel
  });
});

// =========================================================
// 6. STATS
// =========================================================
app.get('/api/stats/global', async (req, res) => {
  try {
    const data = await twitchAPI('streams?first=100');
    let v = 0;
    data.data.forEach(s => v += s.viewer_count);

    const est = Math.floor(v * 3.8);
    const topGame = data.data[0]?.game_name || "N/A";

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
            const timeStr = `${date.getHours()}h${
              date.getMinutes() < 10 ? '0' + date.getMinutes() : date.getMinutes()
            }`;
            history.live.labels.push(timeStr);
            history.live.values.push(stats.total_viewers);
          }
        });
      } else {
        history.live.labels = ["-1h", "Now"];
        history.live.values = [est * 0.9, est];
      }
    } catch (e) {
      console.error("Erreur stats history:", e);
    }

    res.json({
      success: true,
      total_viewers: est,
      total_channels: "98k+",
      top_game_name: topGame,
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
        box_art_url: g.box_art_url
          .replace('{width}', '52')
          .replace('{height}', '72')
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
// 7. SCAN COMPLET
// =========================================================
app.post('/scan_target', async (req, res) => {
  const { query } = req.body;

  try {
    // 1. Récupération User
    const uRes = await twitchAPI(`users?login=${encodeURIComponent(query)}`);

    if (uRes.data.length) {
      const u = uRes.data[0];

      // 2. Récupération Info Chaîne
      let channelInfo = {};
      try {
        const cRes = await twitchAPI(`channels?broadcaster_id=${u.id}`);
        if (cRes.data && cRes.data.length > 0) channelInfo = cRes.data[0];
      } catch (e) {}

      // 3. Récupération Stream Live
      let streamInfo = null;
      try {
        const sRes = await twitchAPI(`streams?user_id=${u.id}`);
        if (sRes.data.length > 0) streamInfo = sRes.data[0];
      } catch (e) {}

      const isLive = !!streamInfo;
      const createdDate = new Date(u.created_at).toLocaleDateString('fr-FR');

      let viewDisplay = u.view_count;
      if (viewDisplay === 0) viewDisplay = "Non public/0";

      const uData = {
        id: u.id,
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
        viewer_count: isLive ? streamInfo.viewer_count : 0,
        ai_calculated_niche_score: isLive && streamInfo.viewer_count < 100 ? "4.8/5" : "3.0/5"
      };

      CACHE.lastScanData = { type: 'user', ...uData };
      return res.json({ success: true, type: 'user', user_data: uData });
    }

    // Fallback Game
    const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(query)}&first=1`);

    if (gRes.data.length) {
      const g = gRes.data[0];
      const sRes = await twitchAPI(`streams?game_id=${g.id}&first=20`);
      const total = sRes.data.reduce((a, b) => a + b.viewer_count, 0);

      const gData = {
        name: g.name,
        box_art_url: g.box_art_url
          .replace('{width}', '60')
          .replace('{height}', '80'),
        total_viewers: total,
        ai_calculated_niche_score: total < 5000 ? 4.0 : 2.0
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
    ? `Analyse critique du niche "${query}" sur Twitch. Saturation? Opportunités? Format HTML.`
    : `Donne-moi 5 idées de clips viraux pour "${query}". Format HTML avec <ul><li>.`;

  res.json(await runGeminiAnalysis(prompt));
});

app.post('/stream_boost', async (req, res) => {
  const { channel } = req.body;
  const now = Date.now();

  try {
    await db.collection('boosts').add({
      channel,
      startTime: now,
      endTime: now + 900000 // 15 min
    });

    CACHE.boostedStream = {
      channel,
      endTime: now + 900000
    };

    res.json({
      success: true,
      html_response: "<p style='color:green;'>✅ Boost activé pendant 15 minutes!</p>"
    });
  } catch (e) {
    res.status(500).json({ error: "Erreur DB" });
  }
});

// =========================================================
// 8. RAID
// =========================================================
app.post('/start_raid', async (req, res) => {
  const { game, max_viewers } = req.body;

  try {
    const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(game)}&first=1`);
    if (!gRes.data.length) return res.json({ success: false });

    const sRes = await twitchAPI(
      `streams?game_id=${gRes.data[0].id}&first=100&language=fr`
    );

    const target = sRes.data
      .filter(s => s.viewer_count <= parseInt(max_viewers))
      .sort((a, b) => b.viewer_count - a.viewer_count)[0];

    if (target) {
      const thumb = target.thumbnail_url
        .replace('{width}', '320')
        .replace('{height}', '180');

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
// 9. BEST TIME TOOL (AMÉLIORÉ)
// =========================================================
app.post('/analyze_schedule', async (req, res) => {
  const { game } = req.body;

  if (!game) {
    return res.status(400).json({
      success: false,
      html_response: '<p style="color:red;">❌ Nom du jeu manquant</p>'
    });
  }

  try {
    // Récupérer le jeu
    const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(game)}&first=1`);

    if (!gRes.data || gRes.data.length === 0) {
      return res.json({
        success: false,
        html_response: `<p style="color:red;"><strong>❌ Jeu "${game}" non trouvé sur Twitch</strong></p>`
      });
    }

    const gameName = gRes.data[0].name;
    const gameId = gRes.data[0].id;

    // Récupérer les streams actuels pour ce jeu
    const sRes = await twitchAPI(`streams?game_id=${gameId}&first=100&language=fr`);
    const totalViewers = sRes.data.reduce((a, b) => a + b.viewer_count, 0);
    const channelCount = sRes.data.length;
    const avgViewers = Math.round(totalViewers / (channelCount || 1));

    // Prompt ultra-directif pour Gemini
    const prompt = `Tu es expert en optimisation streaming Twitch pour le jeu "${gameName}".

📊 DONNÉES ACTUELLES:
- Chaînes en live: ${channelCount}
- Viewers totaux: ${totalViewers}
- Moyenne viewers/chaîne: ${avgViewers}

DEMANDE: Fournis EXACTEMENT en HTML pur (pas de markdown):
1. ⏱️ Niveau de saturation actuelle (Faible/Moyenne/Haute) avec explication courte
2. 🎯 3 créneaux horaires PRÉCIS (Jour + Heure exacte, ex: Mercredi 14h-16h) où la concurrence est FAIBLE mais les viewers NOMBREUX
3. 📈 Score de "niche profitability" de 1 à 10
4. 💡 1 conseil actionnable pour maximiser audience

Format HTML STRICT: utilise <h4>, <ul>, <li>, <p>, <strong>. Pas de markdown, pas de backticks.`;

    const aiResponse = await runGeminiAnalysis(prompt);

    return res.json({
      success: aiResponse.success !== false,
      html_response: aiResponse.html_response || '<p style="color:red;">❌ Erreur IA</p>'
    });

  } catch (error) {
    console.error('❌ Analyze schedule error:', error);
    return res.json({
      success: false,
      html_response: `<p style="color:red;">❌ Erreur: ${error.message}</p>`
    });
  }
});


// =========================================================
// 9B. ANALYTICS PRO – ENDPOINTS (SullyGnome-like)
// =========================================================

// Resolve Twitch IDs (pour le front qui travaille au login)
app.get('/api/resolve_channel_id', async (req, res) => {
  const login = String(req.query.login || '').trim().toLowerCase();
  if (!login) return res.status(400).json({ success: false, error: 'login manquant' });
  try {
    const uRes = await twitchAPI(`users?login=${encodeURIComponent(login)}`);
    if (!uRes.data || uRes.data.length === 0) return res.json({ success: false, error: 'introuvable' });
    return res.json({ success: true, id: uRes.data[0].id, login: uRes.data[0].login, display_name: uRes.data[0].display_name });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// Analytics directement depuis un login (plus simple côté UI)
app.get('/api/analytics/channel_by_login/:login', async (req, res) => {
  const login = String(req.params.login || '').trim().toLowerCase();
  if (!login) return res.status(400).json({ success: false, error: 'login manquant' });

  try {
    const uRes = await twitchAPI(`users?login=${encodeURIComponent(login)}`);
    if (!uRes.data || uRes.data.length === 0) return res.json({ success: false, error: 'introuvable' });
    const channelId = uRes.data[0].id;

    // On réutilise l'endpoint existant en appelant directement la fonction (même logique)
    // Ici on copie une logique minimaliste: stats 30j + série (points)
    const days = clamp(parseInt(req.query.days || '30', 10), 1, 90);
    const since = Date.now() - (days * 24 * 60 * 60 * 1000);
    const snaps = await db
      .collection('channels')
      .doc(channelId)
      .collection('hourly_stats')
      .where('timestamp', '>', since)
      .get();

    if (snaps.empty) {
      return res.json({ success: false, error: 'pas_de_donnees', id: channelId, login });
    }

    const sorted = snaps.docs.map(d => d.data()).sort((a, b) => a.timestamp - b.timestamp);
    const viewers = sorted.map(d => Number(d.viewers || 0));
    const avg = Math.round(viewers.reduce((a, b) => a + b, 0) / (viewers.length || 1));
    const peak = Math.max(...viewers);

    const volatility = Math.round(
      Math.sqrt(viewers.reduce((a, v) => a + Math.pow(v - avg, 2), 0) / (viewers.length || 1))
    );

    const first = viewers[0] || 0;
    const last = viewers[viewers.length - 1] || 0;
    const growth = first > 0 ? Math.round(((last - first) / first) * 100) : 0;

    // Série compacte (max 60 points) pour l'UI
    const step = Math.max(1, Math.floor(sorted.length / 60));
    const series = [];
    for (let i = 0; i < sorted.length; i += step) {
      const it = sorted[i];
      series.push({ t: it.timestamp, v: Number(it.viewers || 0) });
    }

    return res.json({
      success: true,
      id: channelId,
      login,
      display_name: uRes.data[0].display_name,
      avg_viewers: avg,
      peak_viewers: peak,
      volatility,
      growth_percent: growth,
      samples: viewers.length,
      series
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/resolve_game_id', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ success: false, error: 'q manquant' });
  try {
    const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(q)}&first=1`);
    if (!gRes.data || gRes.data.length === 0) return res.json({ success: false, error: 'introuvable' });
    return res.json({ success: true, id: gRes.data[0].id, name: gRes.data[0].name });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// Analytics chaîne (daily + KPIs + growth score)
app.get('/api/analytics/channel/:id', async (req, res) => {
  const channelId = String(req.params.id);
  const days = clamp(parseInt(req.query.days || '30', 10), 1, 180);

  try {
    const sinceMs = Date.now() - (days * 24 * 60 * 60 * 1000);
    const sinceKey = yyyy_mm_dd_from_ms(sinceMs);

    const snaps = await db.collection('channels').doc(channelId)
      .collection('daily_stats')
      .where('day', '>=', sinceKey)
      .orderBy('day', 'asc')
      .get();

    if (snaps.empty) {
      return res.json({ success: false, message: 'Pas assez de données daily_stats (attends 24h ou lance l’agrégation).' });
    }

    const series = [];
    let totalAvg = 0, totalMinutes = 0, peak = 0, n = 0;
    for (const d of snaps.docs) {
      const x = d.data();
      series.push({
        day: x.day,
        avg_viewers: x.avg_viewers || 0,
        peak_viewers: x.peak_viewers || 0,
        minutes_live_est: x.minutes_live_est || 0,
        top_game_id: x.top_game_id || null
      });
      totalAvg += (x.avg_viewers || 0);
      totalMinutes += (x.minutes_live_est || 0);
      peak = Math.max(peak, x.peak_viewers || 0);
      n += 1;
    }

    const avg = Math.round(totalAvg / n);
    const hoursPerWeek = Math.round((totalMinutes / 60) / (days / 7));

    // croissance % (première vs dernière)
    const first = series[0]?.avg_viewers || 0;
    const last = series[series.length - 1]?.avg_viewers || 0;
    const growthPct = first > 0 ? Math.round(((last - first) / first) * 100) : (last > 0 ? 100 : 0);

    // volatilité (écart-type) sur la série avg_viewers
    const mean = avg;
    const variance = series.reduce((a, p) => a + Math.pow((p.avg_viewers || 0) - mean, 2), 0) / series.length;
    const volatility = Math.round(Math.sqrt(variance));

    const growth_score = computeGrowthScore({ avgViewers: avg, growthPct, volatility, hoursPerWeek });

    return res.json({
      success: true,
      channel_id: channelId,
      days: days,
      kpis: {
        avg_viewers: avg,
        peak_viewers: peak,
        growth_percent: growthPct,
        volatility,
        hours_per_week_est: hoursPerWeek,
        growth_score
      },
      series
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// Analytics jeu (courbe + saturation)
app.get('/api/analytics/game/:id', async (req, res) => {
  const gameId = String(req.params.id);
  const days = clamp(parseInt(req.query.days || '30', 10), 1, 180);

  try {
    const sinceMs = Date.now() - (days * 24 * 60 * 60 * 1000);
    const sinceKey = yyyy_mm_dd_from_ms(sinceMs);

    const snaps = await db.collection('games').doc(gameId)
      .collection('daily_stats')
      .where('day', '>=', sinceKey)
      .orderBy('day', 'asc')
      .get();

    if (snaps.empty) {
      return res.json({ success: false, message: 'Pas assez de données daily_stats jeu.' });
    }

    const series = snaps.docs.map(d => {
      const x = d.data();
      return {
        day: x.day,
        avg_viewers_total: x.avg_viewers_total || 0,
        peak_viewers_total: x.peak_viewers_total || 0,
        unique_channels: x.unique_channels || 0,
        saturation_score: x.saturation_score ?? null
      };
    });

    return res.json({ success: true, game_id: gameId, days, series });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});


// Comparaison "chaîne vs niche" (jeu) – calcule à partir des daily_stats
app.get('/api/compare/channel_vs_game', async (req, res) => {
  const channelId = String(req.query.channel_id || '').trim();
  const gameId = String(req.query.game_id || '').trim();
  const days = clamp(parseInt(req.query.days || '30', 10), 1, 180);

  if (!channelId || !gameId) {
    return res.status(400).json({ success: false, error: 'channel_id et game_id requis' });
  }

  try {
    const sinceKey = yyyy_mm_dd_from_ms(Date.now() - (days * 24 * 60 * 60 * 1000));

    const [chSnaps, gSnaps] = await Promise.all([
      db.collection('channels').doc(channelId).collection('daily_stats')
        .where('day', '>=', sinceKey).orderBy('day', 'asc').get(),
      db.collection('games').doc(gameId).collection('daily_stats')
        .where('day', '>=', sinceKey).orderBy('day', 'asc').get()
    ]);

    if (chSnaps.empty || gSnaps.empty) {
      return res.json({ success: false, error: 'data manquante (daily_stats)' });
    }

    const chSeries = chSnaps.docs.map(d => d.data());
    const gSeries = gSnaps.docs.map(d => d.data());

    const chAvg = Math.round(chSeries.reduce((a, x) => a + (x.avg_viewers || 0), 0) / chSeries.length);
    const chPeak = Math.max(...chSeries.map(x => x.peak_viewers || 0));
    const chMinutes = chSeries.reduce((a, x) => a + (x.minutes_live_est || 0), 0);
    const hoursPerWeek = Math.round((chMinutes / 60) / (chSeries.length / 7));

    const chFirst = chSeries[0]?.avg_viewers || 0;
    const chLast = chSeries[chSeries.length - 1]?.avg_viewers || 0;
    const growthPct = chFirst > 0 ? Math.round(((chLast - chFirst) / chFirst) * 100) : (chLast > 0 ? 100 : 0);

    const mean = chAvg;
    const variance = chSeries.reduce((a, p) => a + Math.pow((p.avg_viewers || 0) - mean, 2), 0) / chSeries.length;
    const volatility = Math.round(Math.sqrt(variance));
    const growth_score = computeGrowthScore({ avgViewers: chAvg, growthPct, volatility, hoursPerWeek });

    const gLast = gSeries[gSeries.length - 1];
    const avgTotal = gLast.avg_viewers_total || 0;
    const uniqueChannels = gLast.unique_channels || 0;
    const saturation = gLast.saturation_score ?? computeSaturationIndex({ channels: uniqueChannels, totalViewers: avgTotal });

    const discoverability = computeDiscoverabilityScore({
      yourViewers: chAvg,
      totalViewers: avgTotal,
      channels: uniqueChannels
    });

    return res.json({
      success: true,
      channel: { avg_viewers: chAvg, peak_viewers: chPeak, growth_percent: growthPct, volatility, hours_per_week_est: hoursPerWeek, growth_score },
      game_last: { day: gLast.day, avg_viewers_total: avgTotal, peak_viewers_total: gLast.peak_viewers_total || 0, unique_channels: uniqueChannels, saturation_score: saturation },
      derived: {
        discoverability_score: discoverability,
        saturation_score: saturation,
        summary: (discoverability >= 65)
          ? "🔥 Bon spot: concurrence gérable + marché actif."
          : (discoverability >= 45 ? "⚠️ Mitigé: faisable avec bon timing/format." : "🧱 Dur: niche saturée ou trop faible marché.")
      }
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});


// Simulation (estimation, pas une promesse)
app.get('/api/simulate/growth', async (req, res) => {
  // Accepte channel_id OU login
  let channelId = String(req.query.channel_id || '').trim();
  const login = String(req.query.login || '').trim().toLowerCase();
  const hoursPerWeek = clamp(parseFloat(req.query.hours_per_week || '0'), 0, 80);
  const days = clamp(parseInt(req.query.days || '30', 10), 7, 90);

  if (!channelId && login) {
    try {
      const uRes = await twitchAPI(`users?login=${encodeURIComponent(login)}`);
      if (uRes.data && uRes.data.length) channelId = String(uRes.data[0].id);
    } catch (e) {}
  }

  if (!channelId || !hoursPerWeek) return res.status(400).json({ success: false, error: 'channel_id (ou login) et hours_per_week requis' });

  try {
    const snaps = await db.collection('channels').doc(channelId)
      .collection('daily_stats')
      .orderBy('day', 'desc')
      .limit(days)
      .get();

    if (snaps.empty) return res.json({ success: false, message: 'Pas assez de données daily_stats.' });

    const series = snaps.docs.map(d => d.data()).reverse();
    const avg = Math.round(series.reduce((a, x) => a + (x.avg_viewers || 0), 0) / series.length);

    const totalMinutes = series.reduce((a, x) => a + (x.minutes_live_est || 0), 0);
    const curHoursPerWeek = Math.max(1, (totalMinutes / 60) / (series.length / 7));

    // gain relatif : +k * log(heures)
    const ratio = hoursPerWeek / curHoursPerWeek;
    const k = 0.22; // agressif mais plausible
    const expectedMultiplier = clamp(1 + k * Math.log(ratio), 0.6, 1.8);

    const expectedAvg = Math.round(avg * expectedMultiplier);

    return res.json({
      success: true,
      note: "Estimation basée sur ton historique (pas une garantie).",
      current: {
        avg_viewers: avg,
        hours_per_week_est: Math.round(curHoursPerWeek * 10) / 10
      },
      target: {
        hours_per_week: hoursPerWeek,
        expected_avg_viewers: expectedAvg,
        expected_change_percent: Math.round((expectedMultiplier - 1) * 100)
      }
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// IA – reco personnalisée (HTML) à partir des KPIs
app.get('/api/ai/reco', async (req, res) => {
  // Accepte channel_id OU login (plus simple côté front)
  let channelId = String(req.query.channel_id || '').trim();
  const login = String(req.query.login || '').trim().toLowerCase();
  const days = clamp(parseInt(req.query.days || '30', 10), 7, 90);

  if (!channelId && login) {
    try {
      const uRes = await twitchAPI(`users?login=${encodeURIComponent(login)}`);
      if (uRes.data && uRes.data.length) channelId = String(uRes.data[0].id);
    } catch (e) {}
  }

  if (!channelId) {
    return res.status(400).json({ success: false, html_response: "<p style='color:red;'>channel_id (ou login) requis</p>" });
  }

  try {
    const aRes = await db.collection('channels').doc(channelId).collection('daily_stats')
      .orderBy('day', 'desc').limit(days).get();

    if (aRes.empty) return res.json({ success: false, html_response: "<p style='color:red;'>Pas assez de données daily_stats.</p>" });

    const series = aRes.docs.map(d => d.data()).reverse();
    const avg = Math.round(series.reduce((a, x) => a + (x.avg_viewers || 0), 0) / series.length);
    const peak = Math.max(...series.map(x => x.peak_viewers || 0));
    const totalMinutes = series.reduce((a, x) => a + (x.minutes_live_est || 0), 0);
    const hoursPerWeek = Math.round((totalMinutes / 60) / (series.length / 7));

    const first = series[0]?.avg_viewers || 0;
    const last = series[series.length - 1]?.avg_viewers || 0;
    const growthPct = first > 0 ? Math.round(((last - first) / first) * 100) : (last > 0 ? 100 : 0);

    const mean = avg;
    const variance = series.reduce((a, p) => a + Math.pow((p.avg_viewers || 0) - mean, 2), 0) / series.length;
    const volatility = Math.round(Math.sqrt(variance));
    const growthScore = computeGrowthScore({ avgViewers: avg, growthPct, volatility, hoursPerWeek });

    const prompt = `Tu es un coach Twitch DATA-DRIVEN (style SullyGnome mais actionnable).
Tu dois répondre UNIQUEMENT en HTML (<h4>, <ul>, <li>, <p>, <strong>).

DONNÉES CHAÎNE:
- avg_viewers: ${avg}
- peak_viewers: ${peak}
- growth_percent (sur période): ${growthPct}%
- volatility: ${volatility}
- hours_per_week_est: ${hoursPerWeek}
- growth_score (0-100): ${growthScore}

OBJECTIF:
- Donne 5 recommandations concrètes (format, rythme, horaires, contenu).
- Donne 3 \"expériences\" à tester la semaine prochaine.
- Termine par 1 phrase motivante mais réaliste (sans promesse magique).`;

    const ai = await runGeminiAnalysis(prompt);
    return res.json(ai);
  } catch (e) {
    return res.status(500).json({ success: false, html_response: `<p style='color:red;'>${e.message}</p>` });
  }
});

// =========================================================
// 10. SERVER START + SOCKET.IO (Hub Secure Chat)
// =========================================================

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: true,
    methods: ['GET', 'POST']
  }
});

io.on('connection', (socket) => {
  console.log('🔌 [SOCKET] client connected');

  socket.on('chat message', (msg) => {
    // message attendu: { user, text }
    const safe = {
      user: String(msg?.user || 'Anon').slice(0, 40),
      text: String(msg?.text || '').slice(0, 500)
    };
    if (!safe.text) return;
    io.emit('chat message', safe);
  });

  socket.on('disconnect', () => {
    console.log('🔌 [SOCKET] client disconnected');
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 [SERVER] Démarré sur http://localhost:${PORT}`);
  console.log("✅ Routes prêtes");
  console.log(" - UI: / (NicheOptimizer.html)");
  console.log(" - /firebase_status");
  console.log(" - /analyze_schedule");
  console.log(" - /scan_target, /start_raid, /stream_boost");
  console.log(" - /api/analytics/channel/:id");
  console.log(" - /api/analytics/channel_by_login/:login");
  console.log(` - CRON ENABLED = ${ENABLE_CRON ? 'true' : 'false'}`);
});
// =========================================================
// X. CO-STREAM RECOMMENDER (BEST MATCH)
// =========================================================
app.get('/api/costream/best', async (req, res) => {
  const login = String(req.query.login || '').trim().toLowerCase();
  const days = clamp(parseInt(req.query.days || '14', 10), 1, 60);
  if (!login) return res.status(400).json({ success: false, message: 'login manquant' });

  try {
    // 1) Resolve user + current stream/game
    const uRes = await twitchAPI(`users?login=${encodeURIComponent(login)}`);
    if (!uRes.data || uRes.data.length === 0) return res.json({ success: false, message: 'Chaîne introuvable' });
    const me = uRes.data[0];

    let myStream = null;
    try {
      const sRes = await twitchAPI(`streams?user_id=${me.id}`);
      if (sRes.data && sRes.data.length) myStream = sRes.data[0];
    } catch (e) {}

    // fallback: last known game from Firestore meta
    let gameId = myStream?.game_id || null;
    let gameName = myStream?.game_name || null;
    let myViewers = myStream?.viewer_count || null;

    if (!gameId) {
      try {
        const metaSnap = await db.collection('channels').doc(String(me.id)).get();
        if (metaSnap.exists) {
          const meta = metaSnap.data();
          gameId = meta.current_game_id || null;
          gameName = meta.current_game_name || null;
        }
      } catch (e) {}
    }

    if (!gameId) {
      return res.json({ success: false, message: 'Chaîne offline et jeu inconnu (pas assez de data). Lance un live ou attends le cron.' });
    }

    // 2) Estimate target viewers if offline
    if (myViewers == null) {
      try {
        const ana = await fetchLocalJson(`/api/analytics/channel/${me.id}?days=${days}`);
        if (ana?.success) myViewers = ana.kpis?.avg_viewers || 50;
      } catch (e) {
        myViewers = 50;
      }
    }

    // 3) Find candidates live in same game (FR), close audience size
    const sGame = await twitchAPI(`streams?game_id=${encodeURIComponent(gameId)}&first=100&language=fr`);
    const candidates = (sGame.data || []).filter(s => s.user_login && s.user_login.toLowerCase() !== login);

    if (!candidates.length) {
      return res.json({ success: false, message: 'Aucun co-streamer FR live trouvé sur ce jeu.' });
    }

    const target = Math.max(5, Number(myViewers) || 50);
    const best = candidates
      .map(s => ({ s, diff: Math.abs((s.viewer_count || 0) - target) }))
      .sort((a, b) => a.diff - b.diff)[0]?.s;

    if (!best) return res.json({ success: false, message: 'Pas de match' });

    // 4) Fetch profile
    let prof = null;
    try {
      const uu = await twitchAPI(`users?login=${encodeURIComponent(best.user_login)}`);
      if (uu.data && uu.data.length) prof = uu.data[0];
    } catch (e) {}

    return res.json({
      success: true,
      login: best.user_login,
      display_name: best.user_name,
      profile_image_url: prof?.profile_image_url || null,
      reason: `Même jeu (${gameName || best.game_name}), audience proche (${best.viewer_count} vs ~${target}). Idéal pour un co-stream/raid croisé.`
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});


