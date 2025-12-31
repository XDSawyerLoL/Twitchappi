/**
 * STREAMER HUB — app.js (BACKEND COMPLET, routes alignées + analytics pédagogiques)
 * ============================================================================
 * Objectifs :
 * - Garder TOUTES les routes utiles (scan, raid, boost, stats, analytics, alerts, games/hours, IA, costream, etc.)
 * - Ajouter des endpoints pour :
 *    ✅ "petits streamers" (0–100 viewers) + random ("J'ai de la chance")
 *    ✅ recherche/galerie de jeux (style Netflix) via Helix (search/categories)
 * - Stabiliser Socket.IO (websocket only) pour éviter le spam connect/disconnect
 * - Rendre les analytics compréhensibles : champs FR + bulles d’explications (tooltips) renvoyées en JSON
 *
 * Dépendances :
 *  npm i express cors node-fetch body-parser cookie-parser socket.io firebase-admin @google/genai dotenv
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const cookieParser = require("cookie-parser");
const http = require("http");
const { Server } = require("socket.io");

// IA
const { GoogleGenAI } = require("@google/genai");

// Firebase
const admin = require("firebase-admin");

// =========================================================
// 1) CONFIG
// =========================================================
const PORT = process.env.PORT || 10000;

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash";

const ENABLE_CRON = (process.env.ENABLE_CRON || "true").toLowerCase() !== "false";
const SNAPSHOT_EVERY_MIN = parseInt(process.env.SNAPSHOT_EVERY_MIN || "5", 10);

// Limites "petits streamers"
const SMALL_STREAMER_MAX_VIEWERS = parseInt(process.env.SMALL_STREAMER_MAX_VIEWERS || "100", 10);
const DEFAULT_LANGUAGE = process.env.DEFAULT_LANGUAGE || "fr";

// =========================================================
// 2) INIT EXPRESS
// =========================================================
const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(bodyParser.json({ limit: "2mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

// =========================================================
// 3) INIT FIREBASE
// =========================================================
let serviceAccount = null;

if (process.env.FIREBASE_SERVICE_KEY) {
  try {
    let rawJson = process.env.FIREBASE_SERVICE_KEY;
    if (
      (rawJson.startsWith("'") && rawJson.endsWith("'")) ||
      (rawJson.startsWith('"') && rawJson.endsWith('"'))
    ) {
      rawJson = rawJson.slice(1, -1);
    }
    rawJson = rawJson
      .replace(/\\r\\n/g, "\\n")
      .replace(/\\n/g, "\\n")
      .replace(/\\r/g, "\\n");
    serviceAccount = JSON.parse(rawJson);
  } catch (error) {
    console.error("❌ Erreur JSON Firebase:", error.message);
  }
} else {
  try {
    serviceAccount = require("./serviceAccountKey.json");
  } catch (_) {}
}

try {
  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
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
// 4) INIT IA (Gemini)
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
        systemInstruction:
          "Tu réponds UNIQUEMENT en HTML simple (<p>, <h4>, <ul>, <li>, <strong>). Pas de markdown, pas de backticks.",
      },
    });
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return { success: true, html_response: text };
  } catch (e) {
    console.error("❌ Erreur IA:", e.message);
    return { success: false, html_response: `<p style='color:red;'>❌ Erreur IA: ${e.message}</p>` };
  }
}

// =========================================================
// 5) SOCKET.IO (websocket only => stop spam)
// =========================================================
const io = new Server(server, {
  cors: { origin: true, methods: ["GET", "POST"] },
  transports: ["websocket"],
  allowUpgrades: false,
  pingInterval: 25000,
  pingTimeout: 20000,
});

io.on("connection", (socket) => {
  console.log("🔌 [SOCKET] client connected", socket.id);

  socket.on("chat message", (msg) => {
    const safe = {
      user: String(msg?.user || "Anon").slice(0, 40),
      text: String(msg?.text || "").slice(0, 500),
    };
    if (!safe.text) return;
    io.emit("chat message", safe);
  });

  socket.on("disconnect", (reason) => {
    console.log("🔌 [SOCKET] client disconnected", socket.id, reason);
  });
});

// =========================================================
// 6) CACHE + HELPERS
// =========================================================
const CACHE = {
  twitchTokens: { app: null },
  twitchUser: null, // user OAuth
  boostedStream: null,
  globalStreamRotation: {
    streams: [],
    currentIndex: 0,
    lastFetchTime: 0,
    fetchCooldown: 3 * 60 * 1000,
  },
};

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function yyyy_mm_dd_from_ms(ms) {
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function getTwitchTokenApp() {
  if (CACHE.twitchTokens.app && CACHE.twitchTokens.app.expiry > Date.now()) {
    return CACHE.twitchTokens.app.access_token;
  }

  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
    { method: "POST" }
  );
  const data = await res.json();
  if (!data.access_token) return null;

  CACHE.twitchTokens.app = {
    access_token: data.access_token,
    expiry: Date.now() + data.expires_in * 1000 - 300000,
  };
  return data.access_token;
}

async function twitchAPI(endpoint, token = null) {
  const accessToken = token || (await getTwitchTokenApp());
  if (!accessToken) throw new Error("No Token.");

  const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
    headers: {
      "Client-ID": TWITCH_CLIENT_ID,
      Authorization: `Bearer ${accessToken}`,
    },
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

// Bulles pédagogiques (FR) => le front pourra afficher un (?) partout
const TOOLTIP_FR = {
  avg_viewers: {
    title: "Moyenne de viewers",
    what: "La moyenne de spectateurs sur la période.",
    why: "C'est ton indicateur de 'niveau réel' : plus fiable qu’un seul pic.",
    how: "Calculée en moyenne sur les points mesurés (heure/5 min selon tes snapshots).",
  },
  peak_viewers: {
    title: "Pic de viewers",
    what: "Le maximum atteint sur la période.",
    why: "Montre ton potentiel quand un moment/performance accroche.",
    how: "On prend la valeur la plus haute observée dans la série.",
  },
  growth_percent: {
    title: "Progression (%)",
    what: "Évolution entre le début et la fin de la période.",
    why: "Permet de voir si la tendance monte, stagne ou baisse.",
    how: "((dernier - premier) / premier) * 100 (si premier > 0).",
  },
  volatility: {
    title: "Volatilité",
    what: "À quel point tes viewers bougent (montent/descendent) rapidement.",
    why: "Utile pour détecter si ta rétention est stable ou si tu perds/gagnes souvent.",
    how: "Écart-type approximatif sur la série.",
  },
  hours_per_week_est: {
    title: "Heures / semaine (estim.)",
    what: "Estimation de ton volume de live.",
    why: "Trop peu = difficile de grandir, trop = fatigue. Il faut un rythme durable.",
    how: "Basé sur minutes_live_est en daily_stats ou estimations.",
  },
  growth_score: {
    title: "Score de croissance (0–100)",
    what: "Un score composite (moyenne + progression + stabilité + régularité).",
    why: "Pour savoir si tu es en 'phase de traction' ou si tu dois changer quelque chose.",
    how: "Formule pondérée : viewers + croissance + heures - volatilité.",
  },
};

// =========================================================
// 7) UI ROUTE
// =========================================================
app.get("/", (req, res) => {
  const candidates = [process.env.UI_FILE, "NicheOptimizer.html"].filter(Boolean);
  const found = candidates.find((f) => fs.existsSync(path.join(__dirname, f)));
  if (!found) return res.status(500).send("UI introuvable sur le serveur.");
  return res.sendFile(path.join(__dirname, found));
});

// =========================================================
// 8) STATUS ROUTES
// =========================================================
app.get("/firebase_status", (req, res) => {
  try {
    res.json({
      connected: !!db && admin.apps.length > 0,
      hasServiceAccount: !!serviceAccount,
    });
  } catch (e) {
    res.json({ connected: false, error: e.message });
  }
});

// Liste (pratique pour debug front)
app.get("/api/routes", (req, res) => {
  res.json({
    success: true,
    routes: [
      "GET /",
      "GET /firebase_status",
      "GET /twitch_user_status",
      "GET /twitch_auth_start",
      "GET /twitch_auth_callback",
      "POST /twitch_logout",
      "POST /stream_info",
      "GET /followed_streams",
      "GET /get_default_stream",
      "POST /cycle_stream",
      "POST /stream_boost",
      "POST /scan_target",
      "POST /start_raid",
      "POST /analyze_schedule",
      "GET /api/stats/global",
      "GET /api/stats/top_games",
      "GET /api/stats/languages",
      "GET /api/stats/global_intraday",
      "GET /api/analytics/channel_by_login/:login",
      "GET /api/analytics/channel_intraday_by_login/:login",
      "GET /api/ai/reco",
      "GET /api/costream/best",
      "GET /api/alerts/channel_by_login/:login",
      "POST /api/alerts/generate",
      "GET /api/games/hours",
      "GET /api/games/search",
      "GET /api/streams/small",
      "GET /api/streams/random_small",
    ],
  });
});

// =========================================================
// 9) AUTH (Twitch OAuth user:read:follows)
// =========================================================
app.get("/twitch_auth_start", (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  const scope = "user:read:follows";
  const url =
    `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code&scope=${encodeURIComponent(scope)}&state=${state}`;

  // ⚠️ secure:true en prod https ; en local http => secure false sinon cookie absent
  const secureCookie = (process.env.COOKIE_SECURE || "auto").toLowerCase() === "true"
    ? true
    : (process.env.COOKIE_SECURE || "auto").toLowerCase() === "false"
      ? false
      : (req.secure || req.headers["x-forwarded-proto"] === "https");

  res.cookie("twitch_state", state, { httpOnly: true, secure: secureCookie, maxAge: 600000, sameSite: "lax" });
  res.redirect(url);
});

app.get("/twitch_auth_callback", async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.send("Erreur Auth: code manquant.");
  if (state !== req.cookies.twitch_state) return res.send("Erreur Auth: state invalide.");

  try {
    const tokenRes = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: TWITCH_CLIENT_ID,
        client_secret: TWITCH_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.send("Erreur Token.");

    const userRes = await twitchAPI("users", tokenData.access_token);
    const user = userRes.data?.[0];
    if (!user) return res.send("Erreur User.");

    CACHE.twitchUser = {
      display_name: user.display_name,
      id: user.id,
      profile_image_url: user.profile_image_url || null,
      access_token: tokenData.access_token,
      expiry: Date.now() + tokenData.expires_in * 1000,
    };

    res.send("<script>window.close();</script>");
  } catch (e) {
    res.send("Erreur Serveur.");
  }
});

app.post("/twitch_logout", (req, res) => {
  CACHE.twitchUser = null;
  res.json({ success: true });
});

app.get("/twitch_user_status", (req, res) => {
  if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) {
    return res.json({
      is_connected: true,
      display_name: CACHE.twitchUser.display_name,
      profile_image_url: CACHE.twitchUser.profile_image_url || null,
    });
  }
  res.json({ is_connected: false });
});

// =========================================================
// 10) STREAMS / STREAM INFO (front)
// =========================================================
app.post("/stream_info", async (req, res) => {
  const channel = String(req.body?.channel || "").trim().toLowerCase();
  if (!channel || channel === "twitch") return res.json({ success: false });

  try {
    const uRes = await twitchAPI(`users?login=${encodeURIComponent(channel)}`);
    if (!uRes.data?.length) return res.json({ success: false, error: "introuvable" });

    const userId = uRes.data[0].id;
    const sRes = await twitchAPI(`streams?user_id=${encodeURIComponent(userId)}&first=1`);
    const stream = sRes.data?.[0] || null;

    return res.json({ success: true, stream });
  } catch (e) {
    return res.json({ success: false, error: e.message });
  }
});

app.get("/followed_streams", async (req, res) => {
  if (!CACHE.twitchUser) return res.status(401).json({ success: false });

  try {
    const data = await twitchAPI(
      `streams/followed?user_id=${CACHE.twitchUser.id}`,
      CACHE.twitchUser.access_token
    );
    return res.json({
      success: true,
      streams: (data.data || []).map((s) => ({
        user_id: s.user_id,
        user_name: s.user_name,
        user_login: s.user_login,
        viewer_count: s.viewer_count,
        game_id: s.game_id || null,
        game_name: s.game_name || null,
        title: s.title || null,
        thumbnail_url: s.thumbnail_url,
      })),
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// =========================================================
// 11) ROTATION & BOOST (petits streamers privilégiés)
// =========================================================
async function refreshGlobalStreamList({ language = DEFAULT_LANGUAGE, maxViewers = SMALL_STREAMER_MAX_VIEWERS } = {}) {
  const now = Date.now();
  const rot = CACHE.globalStreamRotation;
  if (now - rot.lastFetchTime < rot.fetchCooldown && rot.streams.length > 0) return;

  try {
    const data = await twitchAPI(`streams?language=${encodeURIComponent(language)}&first=100`);
    let suitable = (data.data || []).filter((s) => (s.viewer_count || 0) <= maxViewers);
    if (suitable.length === 0) suitable = (data.data || []).slice(-10);

    rot.streams = suitable
      .sort(() => 0.5 - Math.random())
      .map((s) => ({ channel: s.user_login, viewers: s.viewer_count, game_id: s.game_id, game_name: s.game_name }));
    rot.currentIndex = 0;
    rot.lastFetchTime = now;
  } catch (e) {
    console.error("Erreur refresh streams:", e.message);
  }
}

app.get("/get_default_stream", async (req, res) => {
  const now = Date.now();
  let boost = null;

  try {
    const q = await db
      .collection("boosts")
      .where("endTime", ">", now)
      .orderBy("endTime", "desc")
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
    return res.json({ success: true, channel: boost.channel, mode: "BOOST", message: "⚡ BOOST ACTIF" });
  }

  await refreshGlobalStreamList();
  const rot = CACHE.globalStreamRotation;

  if (!rot.streams.length) return res.json({ success: true, channel: "twitch", mode: "FALLBACK" });

  return res.json({
    success: true,
    channel: rot.streams[rot.currentIndex].channel,
    mode: "AUTO",
    viewers: rot.streams[rot.currentIndex].viewers,
  });
});

app.post("/cycle_stream", async (req, res) => {
  const direction = String(req.body?.direction || "next");

  if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
    return res.json({ success: false, error: "boost_active" });
  }

  await refreshGlobalStreamList();
  const rot = CACHE.globalStreamRotation;
  if (!rot.streams.length) return res.json({ success: false });

  if (direction === "next") rot.currentIndex = (rot.currentIndex + 1) % rot.streams.length;
  else rot.currentIndex = (rot.currentIndex - 1 + rot.streams.length) % rot.streams.length;

  return res.json({ success: true, channel: rot.streams[rot.currentIndex].channel });
});

app.post("/stream_boost", async (req, res) => {
  const channel = String(req.body?.channel || "").trim().toLowerCase();
  if (!channel) return res.status(400).json({ success: false });

  const now = Date.now();
  try {
    await db.collection("boosts").add({
      channel,
      startTime: now,
      endTime: now + 900000, // 15 min
    });

    CACHE.boostedStream = { channel, endTime: now + 900000 };

    res.json({
      success: true,
      html_response: "<p style='color:green;'>✅ Boost activé pendant 15 minutes !</p>",
    });
  } catch (e) {
    res.status(500).json({ success: false, error: "Erreur DB" });
  }
});

// =========================================================
// 12) STATS
// =========================================================
app.get("/api/stats/global", async (req, res) => {
  try {
    const data = await twitchAPI("streams?first=100");
    let v = 0;
    (data.data || []).forEach((s) => (v += s.viewer_count || 0));

    const est = Math.floor(v * 3.8);
    const topGame = data.data?.[0]?.game_name || "N/A";

    const history = { live: { labels: [], values: [] } };
    try {
      const snaps = await db.collection("stats_history").orderBy("timestamp_ms", "desc").limit(12).get();

      if (!snaps.empty) {
        snaps.docs.reverse().forEach((d) => {
          const stats = d.data();
          const ts = stats.timestamp_ms || stats.timestamp?.toMillis?.() || null;
          if (!ts) return;
          const date = new Date(ts);
          const timeStr = `${String(date.getHours()).padStart(2, "0")}h${String(date.getMinutes()).padStart(2, "0")}`;
          history.live.labels.push(timeStr);
          history.live.values.push(Number(stats.total_viewers || 0));
        });
      } else {
        history.live.labels = ["-1h", "Now"];
        history.live.values = [Math.round(est * 0.9), est];
      }
    } catch (_) {}

    res.json({
      success: true,
      total_viewers: est,
      total_channels: "98k+",
      top_game_name: topGame,
      history,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get("/api/stats/top_games", async (req, res) => {
  try {
    const d = await twitchAPI("games/top?first=10");
    res.json({
      games: (d.data || []).map((g) => ({
        name: g.name,
        box_art_url: g.box_art_url.replace("{width}", "52").replace("{height}", "72"),
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/stats/languages", async (req, res) => {
  try {
    const d = await twitchAPI("streams?first=100");
    const l = {};
    (d.data || []).forEach((s) => {
      const key = String(s.language || "??");
      l[key] = (l[key] || 0) + 1;
    });

    const sorted = Object.keys(l)
      .map((k) => ({ name: k.toUpperCase(), percent: l[k] }))
      .sort((a, b) => b.percent - a.percent)
      .slice(0, 5);

    res.json({ languages: sorted });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Global intraday (24h) via stats_history
app.get("/api/stats/global_intraday", async (req, res) => {
  const hours = clamp(parseInt(req.query.hours || "24", 10), 1, 48);
  const since = Date.now() - hours * 60 * 60 * 1000;

  try {
    const snaps = await db
      .collection("stats_history")
      .where("timestamp_ms", ">=", since)
      .orderBy("timestamp_ms", "asc")
      .get();

    if (snaps.empty) {
      const live = await twitchAPI("streams?first=100");
      let v = 0;
      (live.data || []).forEach((s) => (v += s.viewer_count || 0));
      return res.json({
        success: true,
        current_total_viewers: Math.floor(v * 3.8),
        current_channels_live: (live.data || []).length,
        series: { labels: ["now"], values: [Math.floor(v * 3.8)] },
      });
    }

    const labels = [];
    const values = [];
    let curViewers = 0;
    let curChannels = 0;

    snaps.forEach((d) => {
      const x = d.data();
      const ts = x.timestamp_ms || 0;
      const dt = new Date(ts);
      labels.push(`${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`);
      values.push(Number(x.total_viewers || 0));
      curViewers = Number(x.total_viewers || 0);
      curChannels = Number(x.channels_live || 0);
    });

    res.json({
      success: true,
      current_total_viewers: curViewers,
      current_channels_live: curChannels,
      series: { labels, values },
      labels_fr: {
        current_total_viewers: "Viewers totaux (estimation FR)",
        current_channels_live: "Chaînes live (FR)",
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// =========================================================
// 13) SCAN (user ou game) — utile pour “analyser une chaîne / un jeu”
// =========================================================
app.post("/scan_target", async (req, res) => {
  const query = String(req.body?.query || "").trim().toLowerCase();
  if (!query) return res.status(400).json({ success: false });

  try {
    // 1) try user
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
        created_at: new Date(u.created_at).toLocaleDateString("fr-FR"),
        game_name: channelInfo.game_name || "Aucun jeu défini",
        title: channelInfo.title || "Aucun titre",
        tags: channelInfo.tags ? channelInfo.tags.slice(0, 5).join(", ") : "Aucun",
        language: channelInfo.broadcaster_language || "fr",
        view_count: u.view_count || 0,
        is_live: isLive,
        viewer_count: isLive ? streamInfo.viewer_count : 0,
        ai_calculated_niche_score: isLive && streamInfo.viewer_count < SMALL_STREAMER_MAX_VIEWERS ? "4.8/5" : "3.0/5",
      };

      return res.json({ success: true, type: "user", user_data: uData });
    }

    // 2) fallback game
    const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(query)}&first=1`);
    if (gRes.data?.length) {
      const g = gRes.data[0];
      const sRes = await twitchAPI(`streams?game_id=${g.id}&first=20&language=${encodeURIComponent(DEFAULT_LANGUAGE)}`);
      const total = (sRes.data || []).reduce((a, b) => a + (b.viewer_count || 0), 0);

      const gData = {
        id: g.id,
        name: g.name,
        box_art_url: g.box_art_url.replace("{width}", "60").replace("{height}", "80"),
        total_viewers: total,
        ai_calculated_niche_score: total < 5000 ? 4.0 : 2.0,
      };

      return res.json({ success: true, type: "game", game_data: gData });
    }

    res.json({ success: false });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// =========================================================
// 14) RAID (trouver une cible <= max viewers dans un jeu)
// =========================================================
app.post("/start_raid", async (req, res) => {
  const game = String(req.body?.game || "").trim();
  const maxViewers = clamp(parseInt(req.body?.max_viewers || String(SMALL_STREAMER_MAX_VIEWERS), 10), 1, 500);

  if (!game) return res.status(400).json({ success: false });

  try {
    const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(game)}&first=1`);
    if (!gRes.data?.length) return res.json({ success: false });

    const sRes = await twitchAPI(
      `streams?game_id=${gRes.data[0].id}&first=100&language=${encodeURIComponent(DEFAULT_LANGUAGE)}`
    );

    const target = (sRes.data || [])
      .filter((s) => (s.viewer_count || 0) <= maxViewers)
      .sort((a, b) => (b.viewer_count || 0) - (a.viewer_count || 0))[0];

    if (!target) return res.json({ success: false });

    return res.json({
      success: true,
      target: {
        name: target.user_name,
        login: target.user_login,
        viewers: target.viewer_count,
        thumbnail_url: target.thumbnail_url.replace("{width}", "320").replace("{height}", "180"),
        game: target.game_name,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// =========================================================
// 15) BEST TIME (IA) — pratique mais dépend des données live
// =========================================================
app.post("/analyze_schedule", async (req, res) => {
  const game = String(req.body?.game || "").trim();
  if (!game) {
    return res.status(400).json({ success: false, html_response: '<p style="color:red;">❌ Nom du jeu manquant</p>' });
  }

  try {
    const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(game)}&first=1`);
    if (!gRes.data?.length) {
      return res.json({
        success: false,
        html_response: `<p style="color:red;"><strong>❌ Jeu "${game}" non trouvé sur Twitch</strong></p>`,
      });
    }

    const gameName = gRes.data[0].name;
    const gameId = gRes.data[0].id;

    const sRes = await twitchAPI(
      `streams?game_id=${encodeURIComponent(gameId)}&first=100&language=${encodeURIComponent(DEFAULT_LANGUAGE)}`
    );
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
      html_response: aiResponse.html_response || "<p style='color:red;'>❌ Erreur IA</p>",
    });
  } catch (e) {
    return res.json({ success: false, html_response: `<p style="color:red;">❌ Erreur: ${e.message}</p>` });
  }
});

// =========================================================
// 16) FIRESTORE SNAPSHOTS (CRON) — hourly_stats + stats_history
// =========================================================
async function upsertChannelMetaFromStream(stream, nowMs) {
  const ref = db.collection("channels").doc(String(stream.user_id));
  try {
    const snap = await ref.get();
    const payload = {
      login: stream.user_login || null,
      display_name: stream.user_name || null,
      language: stream.language || null,
      current_game_id: stream.game_id || null,
      current_game_name: stream.game_name || null,
      last_seen_live: admin.firestore.Timestamp.fromMillis(nowMs),
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
    await db
      .collection("games")
      .doc(String(gameId))
      .set(
        {
          name: gameName || null,
          last_seen: admin.firestore.Timestamp.fromMillis(Date.now()),
        },
        { merge: true }
      );
  } catch (_) {}
}

async function collectAnalyticsSnapshot() {
  const now = Date.now();
  try {
    const data = await twitchAPI(`streams?first=100&language=${encodeURIComponent(DEFAULT_LANGUAGE)}`);
    const streams = data?.data || [];
    let totalViewers = 0;

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
      totalViewers += s.viewer_count || 0;

      await upsertChannelMetaFromStream(s, now);
      await upsertGameMeta(s.game_id, s.game_name);

      const chRef = db
        .collection("channels")
        .doc(String(s.user_id))
        .collection("hourly_stats")
        .doc(String(now));

      batch.set(
        chRef,
        {
          timestamp: now,
          viewers: s.viewer_count || 0,
          game_id: s.game_id || null,
          game_name: s.game_name || null,
          title: s.title || null,
          language: s.language || null,
        },
        { merge: false }
      );
      ops++;
      await commitIfNeeded();
    }

    const globalRef = db.collection("stats_history").doc(String(now));
    batch.set(
      globalRef,
      {
        timestamp: admin.firestore.Timestamp.fromMillis(now),
        timestamp_ms: now,
        total_viewers: totalViewers,
        channels_live: streams.length,
        top_game: streams[0]?.game_name || null,
      },
      { merge: false }
    );
    ops++;
    await commitIfNeeded();

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
  console.log("ℹ️ CRON ENABLED = false");
}

// =========================================================
// 17) ANALYTICS — daily (par dayKey) via daily_stats (si dispo) + fallback via hourly_stats
// =========================================================
async function fallbackDailyFromHourly(channelId, days = 30) {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;

  const q = await db
    .collection("channels")
    .doc(String(channelId))
    .collection("hourly_stats")
    .where("timestamp", ">=", since)
    .get();

  if (q.empty) return [];

  // group by UTC day
  const map = new Map();
  q.docs.forEach((doc) => {
    const p = doc.data();
    const ts = Number(p.timestamp || 0);
    if (!ts) return;
    const day = yyyy_mm_dd_from_ms(ts);
    if (!map.has(day)) map.set(day, { day, viewers: [], peak: 0, samples: 0 });
    const g = map.get(day);
    const v = Number(p.viewers || 0);
    g.viewers.push(v);
    g.samples++;
    if (v > g.peak) g.peak = v;
  });

  // produce daily_stats-like objects
  const out = [...map.values()]
    .map((d) => {
      const avg = Math.round(d.viewers.reduce((a, b) => a + b, 0) / (d.viewers.length || 1));
      // estimation minutes_live_est: si au moins 1 point => ~ SNAPSHOT_EVERY_MIN minutes par point
      const minutes_live_est = Math.round(d.samples * SNAPSHOT_EVERY_MIN);
      return {
        day: d.day,
        avg_viewers: avg,
        peak_viewers: d.peak,
        minutes_live_est,
      };
    })
    .sort((a, b) => (a.day < b.day ? -1 : 1));

  return out;
}

app.get("/api/analytics/channel_by_login/:login", async (req, res) => {
  const login = String(req.params.login || "").trim().toLowerCase();
  const days = clamp(parseInt(req.query.days || "30", 10), 1, 90);
  if (!login) return res.status(400).json({ success: false, message: "login manquant" });

  try {
    const uRes = await twitchAPI(`users?login=${encodeURIComponent(login)}`);
    if (!uRes.data?.length) return res.json({ success: false, message: "introuvable" });

    const channelId = String(uRes.data[0].id);
    const sinceKey = yyyy_mm_dd_from_ms(Date.now() - days * 24 * 60 * 60 * 1000);

    // 1) try daily_stats
    let seriesDays = [];
    try {
      const snaps = await db
        .collection("channels")
        .doc(channelId)
        .collection("daily_stats")
        .where("day", ">=", sinceKey)
        .orderBy("day", "asc")
        .get();

      if (!snaps.empty) {
        seriesDays = snaps.docs.map((d) => d.data());
      }
    } catch (_) {}

    // 2) fallback from hourly_stats if needed
    if (!seriesDays.length) {
      seriesDays = await fallbackDailyFromHourly(channelId, days);
    }

    if (!seriesDays.length) return res.json({ success: false, message: "pas_de_donnees", channel_id: channelId });

    const labels = seriesDays.map((x) => x.day);
    const values = seriesDays.map((x) => Number(x.avg_viewers || 0));

    const avg = Math.round(values.reduce((a, b) => a + b, 0) / (values.length || 1));
    const peak = Math.max(...seriesDays.map((x) => Number(x.peak_viewers || 0)));

    const first = values[0] || 0;
    const last = values[values.length - 1] || 0;
    const growthPct = first > 0 ? Math.round(((last - first) / first) * 100) : last > 0 ? 100 : 0;

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
        days: labels.length,
      },
      series: { labels, values },
      kpis_fr: {
        moyenne_viewers: avg,
        pic_viewers: peak,
        progression_pourcent: growthPct,
        volatilite: volatility,
        heures_par_semaine_estimees: hoursPerWeek,
        score_croissance: growthScore,
      },
      tooltips: TOOLTIP_FR,
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// Intraday (24h) par chaîne via hourly_stats (timestamp ms)
app.get("/api/analytics/channel_intraday_by_login/:login", async (req, res) => {
  const login = String(req.params.login || "").trim().toLowerCase();
  const hours = clamp(parseInt(req.query.hours || "24", 10), 1, 48);
  if (!login) return res.status(400).json({ success: false, message: "login manquant" });

  try {
    const uRes = await twitchAPI(`users?login=${encodeURIComponent(login)}`);
    if (!uRes.data?.length) return res.json({ success: false, message: "introuvable" });
    const channelId = String(uRes.data[0].id);

    const since = Date.now() - hours * 60 * 60 * 1000;

    const q = await db
      .collection("channels")
      .doc(channelId)
      .collection("hourly_stats")
      .where("timestamp", ">=", since)
      .get();

    if (q.empty) {
      return res.json({ success: false, message: "pas_de_donnees", channel_id: channelId });
    }

    const points = q.docs.map((d) => d.data()).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    const labels = [];
    const values = [];

    let sum = 0;
    let peak = 0;
    const viewersArr = [];

    let current_game_id = null;
    let current_game_name = null;

    points.forEach((p) => {
      const ts = Number(p.timestamp || 0);
      const dt = new Date(ts);
      labels.push(`${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`);

      const v = Number(p.viewers || 0);
      values.push(v);
      viewersArr.push(v);

      sum += v;
      if (v > peak) peak = v;

      if (p.game_id) {
        current_game_id = p.game_id;
        current_game_name = p.game_name || null;
      }
    });

    const avg = Math.round(sum / (viewersArr.length || 1));
    const first = viewersArr[0] || 0;
    const last = viewersArr[viewersArr.length - 1] || 0;
    const growth = first > 0 ? Math.round(((last - first) / first) * 100) : last > 0 ? 100 : 0;

    const mean = avg;
    const variance = viewersArr.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / (viewersArr.length || 1);
    const volatility = Math.round(Math.sqrt(variance));

    // hours/week est from daily_stats if exists
    let hoursPerWeek = null;
    try {
      const ds = await db
        .collection("channels")
        .doc(channelId)
        .collection("daily_stats")
        .orderBy("day", "desc")
        .limit(14)
        .get();
      if (!ds.empty) {
        const series = ds.docs.map((d) => d.data());
        const minutes = series.reduce((a, x) => a + (x.minutes_live_est || 0), 0);
        const dayCount = series.length || 1;
        hoursPerWeek = Math.round((minutes / 60) / (dayCount / 7));
      }
    } catch (_) {}

    const growth_score = computeGrowthScore({
      avgViewers: avg,
      growthPct: growth,
      volatility,
      hoursPerWeek: hoursPerWeek || 0,
    });

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
        samples: viewersArr.length,
      },
      series: { labels, values },
      kpis_fr: {
        moyenne_viewers: avg,
        pic_viewers: peak,
        progression_pourcent: growth,
        volatilite: volatility,
        heures_par_semaine_estimees: hoursPerWeek,
        score_croissance: growth_score,
        points_mesures: viewersArr.length,
      },
      tooltips: TOOLTIP_FR,
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// =========================================================
// 18) ALERTS (génération + lecture)
// =========================================================
async function saveAlert(channelId, dayKey, type, payload) {
  try {
    const ref = db.collection("alerts").doc(String(channelId)).collection("items").doc(`${dayKey}_${type}`);
    await ref.set(
      {
        channel_id: String(channelId),
        day: dayKey,
        type,
        ...payload,
        created_at: admin.firestore.Timestamp.fromMillis(Date.now()),
      },
      { merge: true }
    );
  } catch (e) {
    console.error("❌ [ALERT] saveAlert:", e.message);
  }
}

function computeGrowthScoreSimple({ avg_viewers = 0, peak_viewers = 0, growth_percent = 0, minutes_live_est = 0 } = {}) {
  const base = Math.log10(avg_viewers + 1) * 25;
  const peakBoost = Math.log10(peak_viewers + 1) * 10;
  const growthBoost = clamp(growth_percent, -50, 200) * 0.15;
  const cadence = Math.min(20, (minutes_live_est / 60) * 1.2);
  const raw = base + peakBoost + growthBoost + cadence;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

async function generateAlertsForLogin(login, days = 30) {
  const uRes = await twitchAPI(`users?login=${encodeURIComponent(login)}`);
  if (!uRes.data?.length) return { success: false, message: "introuvable" };
  const user = uRes.data[0];
  const channelId = String(user.id);

  // daily_stats or fallback
  let series = [];
  try {
    const snaps = await db
      .collection("channels")
      .doc(channelId)
      .collection("daily_stats")
      .orderBy("day", "desc")
      .limit(days)
      .get();
    if (!snaps.empty) series = snaps.docs.map((d) => d.data()).reverse();
  } catch (_) {}

  if (!series.length) {
    series = await fallbackDailyFromHourly(channelId, days);
  }
  if (!series.length) return { success: false, message: "pas_de_donnees" };

  const first = series[0]?.avg_viewers || 0;
  const last = series[series.length - 1]?.avg_viewers || 0;
  const growth_percent = first > 0 ? Math.round(((last - first) / first) * 100) : last > 0 ? 100 : 0;

  const avg = Math.round(series.reduce((a, x) => a + (x.avg_viewers || 0), 0) / series.length);
  const peak = Math.max(...series.map((x) => x.peak_viewers || 0));
  const minutes_live_est = Math.round(series.reduce((a, x) => a + (x.minutes_live_est || 0), 0) / series.length);

  const growth_score = computeGrowthScoreSimple({ avg_viewers: avg, peak_viewers: peak, growth_percent, minutes_live_est });
  const dayKey = yyyy_mm_dd_from_ms(Date.now());

  // alert rules (simple)
  if (growth_percent >= 25 && growth_score >= 60) {
    await saveAlert(channelId, dayKey, "acceleration", {
      title: "🚀 Accélération détectée",
      message: `Ta moyenne grimpe (+${growth_percent}%). Double sur ce qui marche (format, catégorie, titres, clips).`,
      score: growth_score,
    });
  }
  if (avg < 10 && minutes_live_est >= 180) {
    await saveAlert(channelId, dayKey, "format", {
      title: "🧪 Ajuste ton format",
      message: "Tu streams beaucoup mais la moyenne reste basse. Teste : titres + clairs, catégories moins saturées, intro + courte.",
      score: growth_score,
    });
  }

  if (aiClient) {
    const prompt = `Tu es un coach Twitch. Pour ${user.display_name} (${login}), propose 1 alerte courte et actionnable pour aujourd'hui basée sur:
- moyenne=${avg}
- pic=${peak}
- croissance=${growth_percent}%
- score=${growth_score}/100

Réponds en HTML simple.`;
    const out = await runGeminiAnalysis(prompt);
    await saveAlert(channelId, dayKey, "ia", {
      title: "💡 Suggestion IA",
      message: (out.html_response || "").replace(/<\/?[^>]+(>|$)/g, "").slice(0, 380),
      score: growth_score,
    });
  }

  return { success: true, channel_id: channelId, growth_score, growth_percent, avg_viewers: avg, peak_viewers: peak };
}

app.get("/api/alerts/channel_by_login/:login", async (req, res) => {
  const login = String(req.params.login || "").trim().toLowerCase();
  const limit = clamp(parseInt(req.query.limit || "10", 10), 1, 50);
  if (!login) return res.status(400).json({ success: false, error: "login manquant" });

  try {
    const uRes = await twitchAPI(`users?login=${encodeURIComponent(login)}`);
    if (!uRes.data?.length) return res.json({ success: false, error: "introuvable" });
    const channelId = String(uRes.data[0].id);

    const q = await db
      .collection("alerts")
      .doc(channelId)
      .collection("items")
      .orderBy("created_at", "desc")
      .limit(limit)
      .get();

    const items = q.docs.map((d) => d.data());
    return res.json({ success: true, channel_id: channelId, items });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

app.post("/api/alerts/generate", async (req, res) => {
  const login = String(req.body?.login || "").trim().toLowerCase();
  const days = clamp(parseInt(req.body?.days || "30", 10), 1, 180);
  if (!login) return res.status(400).json({ success: false, error: "login manquant" });

  const r = await generateAlertsForLogin(login, days);
  return res.json(r);
});

// =========================================================
// 19) GAME HOURS (depuis games/{id}/hourly_stats)
// =========================================================
app.get("/api/games/hours", async (req, res) => {
  const gameId = String(req.query.game_id || "").trim();
  const days = clamp(parseInt(req.query.days || "7", 10), 1, 30);
  if (!gameId) return res.status(400).json({ success: false, error: "game_id requis" });

  try {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const snaps = await db.collection("games").doc(gameId).collection("hourly_stats").where("timestamp", ">=", since).get();

    const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, total_viewers: 0, channels: new Set(), samples: 0 }));

    snaps.forEach((d) => {
      const x = d.data();
      const ts = x.timestamp || 0;
      const h = new Date(ts).getUTCHours();
      const viewers = Number(x.viewers || 0);
      hours[h].total_viewers += viewers;
      if (x.channel_id) hours[h].channels.add(String(x.channel_id));
      hours[h].samples += 1;
    });

    const out = hours.map((o) => {
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
        discoverability_score: discoverability,
      };
    });

    const best = [...out].sort(
      (a, b) => b.discoverability_score - a.discoverability_score || b.total_viewers - a.total_viewers
    )[0];

    return res.json({
      success: true,
      game_id: gameId,
      days,
      hours: out,
      best_hour_utc: best?.hour ?? null,
      tooltips_fr: {
        saturation_score: {
          title: "Saturation (0–100)",
          what: "Plus c’est haut, plus il y a de concurrence relative.",
          why: "Une saturation haute = plus dur d’être visible.",
          how: "Heuristique basée sur nombre de chaînes vs viewers moyens/chaîne.",
        },
        discoverability_score: {
          title: "Découvrabilité (0–100)",
          what: "Plus c’est haut, plus tu peux être découvert facilement.",
          why: "Idéal pour petites chaînes : tu ressors mieux dans la liste.",
          how: "Heuristique inverse de la saturation.",
        },
      },
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// =========================================================
// 20) IA RECO (coach data-driven)
// =========================================================
app.get("/api/ai/reco", async (req, res) => {
  const login = String(req.query.login || "").trim().toLowerCase();
  const days = clamp(parseInt(req.query.days || "30", 10), 7, 90);
  if (!login) return res.status(400).json({ success: false, html_response: "<p style='color:red;'>login requis</p>" });

  try {
    const uRes = await twitchAPI(`users?login=${encodeURIComponent(login)}`);
    if (!uRes.data?.length) return res.json({ success: false, html_response: "<p style='color:red;'>introuvable</p>" });
    const channelId = String(uRes.data[0].id);

    // daily_stats or fallback
    let series = [];
    try {
      const sinceKey = yyyy_mm_dd_from_ms(Date.now() - days * 24 * 60 * 60 * 1000);
      const snaps = await db
        .collection("channels")
        .doc(channelId)
        .collection("daily_stats")
        .where("day", ">=", sinceKey)
        .orderBy("day", "asc")
        .get();
      if (!snaps.empty) series = snaps.docs.map((d) => d.data());
    } catch (_) {}
    if (!series.length) series = await fallbackDailyFromHourly(channelId, days);

    if (!series.length) return res.json({ success: false, html_response: "<p style='color:red;'>Pas assez de données.</p>" });

    const values = series.map((x) => Number(x.avg_viewers || 0));
    const avg = Math.round(values.reduce((a, b) => a + b, 0) / (values.length || 1));
    const peak = Math.max(...series.map((x) => Number(x.peak_viewers || 0)));

    const first = values[0] || 0;
    const last = values[values.length - 1] || 0;
    const growthPct = first > 0 ? Math.round(((last - first) / first) * 100) : last > 0 ? 100 : 0;

    const mean = avg;
    const variance = values.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / (values.length || 1);
    const volatility = Math.round(Math.sqrt(variance));

    const totalMinutes = series.reduce((a, x) => a + Number(x.minutes_live_est || 0), 0);
    const hoursPerWeek = Math.round((totalMinutes / 60) / (days / 7));
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
    return res.status(500).json({ success: false, html_response: `<p style='color:red;'>${e.message}</p>` });
  }
});

// =========================================================
// 21) CO-STREAM (trouver un streamer proche en viewers sur le même jeu)
// =========================================================
app.get("/api/costream/best", async (req, res) => {
  const login = String(req.query.login || "").trim().toLowerCase();
  if (!login) return res.status(400).json({ success: false, message: "login manquant" });

  try {
    const uRes = await twitchAPI(`users?login=${encodeURIComponent(login)}`);
    if (!uRes.data?.length) return res.json({ success: false, message: "Chaîne introuvable" });
    const me = uRes.data[0];

    const sMe = await twitchAPI(`streams?user_id=${me.id}`);
    const myStream = sMe.data?.[0] || null;

    const gameId = myStream?.game_id || null;
    const gameName = myStream?.game_name || null;
    const myViewers = Number(myStream?.viewer_count || 50);

    if (!gameId) return res.json({ success: false, message: "Chaîne offline (jeu inconnu). Lance un live." });

    const sGame = await twitchAPI(
      `streams?game_id=${encodeURIComponent(gameId)}&first=100&language=${encodeURIComponent(DEFAULT_LANGUAGE)}`
    );
    const candidatesRaw = (sGame.data || []).filter((s) => s.user_login && s.user_login.toLowerCase() !== login);

    if (!candidatesRaw.length) return res.json({ success: false, message: "Aucun co-streamer FR live sur ce jeu." });

    const target = Math.max(5, myViewers);
    const scored = candidatesRaw
      .map((s) => {
        const v = Number(s.viewer_count || 0);
        const diff = Math.abs(v - target);
        const score = Math.max(1, 100 - diff); // simple
        return { s, score };
      })
      .sort((a, b) => b.score - a.score);

    const bestS = scored[0].s;

    let prof = null;
    try {
      const bestProfile = await twitchAPI(`users?login=${encodeURIComponent(bestS.user_login)}`);
      prof = bestProfile.data?.[0] || null;
    } catch (_) {}

    const candidates = scored.slice(0, 8).map((x) => ({
      login: x.s.user_login,
      display_name: x.s.user_name,
      score: x.score,
    }));

    return res.json({
      success: true,
      best: {
        login: bestS.user_login,
        display_name: bestS.user_name,
        profile_image_url: prof?.profile_image_url || null,
        score: scored[0].score,
        why: `Même jeu (${gameName || bestS.game_name}) + audience proche (${bestS.viewer_count} vs ~${target}).`,
      },
      candidates,
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// =========================================================
// 22) NOUVEAU — catalogue jeux (Netflix-like) + petits streamers
// =========================================================

// 🔎 Recherche de jeux (catégories) pour afficher des pochettes
app.get("/api/games/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  const first = clamp(parseInt(req.query.first || "24", 10), 1, 50);
  if (!q) return res.status(400).json({ success: false, error: "q requis" });

  try {
    const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(q)}&first=${first}`);
    const games = (gRes.data || []).map((g) => ({
      id: g.id,
      name: g.name,
      box_art_url: g.box_art_url.replace("{width}", "210").replace("{height}", "280"),
    }));
    return res.json({ success: true, games });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// ✅ Liste de streams "petits" (<= max_viewers), option game_id
app.get("/api/streams/small", async (req, res) => {
  const maxViewers = clamp(parseInt(req.query.max_viewers || String(SMALL_STREAMER_MAX_VIEWERS), 10), 1, 500);
  const language = String(req.query.language || DEFAULT_LANGUAGE).trim();
  const gameId = String(req.query.game_id || "").trim();

  try {
    const base = gameId
      ? `streams?game_id=${encodeURIComponent(gameId)}&first=100&language=${encodeURIComponent(language)}`
      : `streams?first=100&language=${encodeURIComponent(language)}`;

    const sRes = await twitchAPI(base);
    const small = (sRes.data || []).filter((s) => (s.viewer_count || 0) <= maxViewers);

    return res.json({
      success: true,
      max_viewers: maxViewers,
      count: small.length,
      streams: small.map((s) => ({
        user_id: s.user_id,
        user_login: s.user_login,
        user_name: s.user_name,
        viewer_count: s.viewer_count,
        game_id: s.game_id,
        game_name: s.game_name,
        title: s.title || null,
        thumbnail_url: s.thumbnail_url?.replace("{width}", "320").replace("{height}", "180"),
      })),
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// 🎲 Random "J'ai de la chance" (dans un game_id donné si présent)
app.get("/api/streams/random_small", async (req, res) => {
  const maxViewers = clamp(parseInt(req.query.max_viewers || String(SMALL_STREAMER_MAX_VIEWERS), 10), 1, 500);
  const language = String(req.query.language || DEFAULT_LANGUAGE).trim();
  const gameId = String(req.query.game_id || "").trim();

  try {
    const base = gameId
      ? `streams?game_id=${encodeURIComponent(gameId)}&first=100&language=${encodeURIComponent(language)}`
      : `streams?first=100&language=${encodeURIComponent(language)}`;

    const sRes = await twitchAPI(base);
    const small = (sRes.data || []).filter((s) => (s.viewer_count || 0) <= maxViewers);

    if (!small.length) return res.json({ success: false, message: "no_small_streamers" });

    const pick = small[Math.floor(Math.random() * small.length)];

    return res.json({
      success: true,
      picked: {
        user_id: pick.user_id,
        user_login: pick.user_login,
        user_name: pick.user_name,
        viewer_count: pick.viewer_count,
        game_id: pick.game_id,
        game_name: pick.game_name,
        title: pick.title || null,
        thumbnail_url: pick.thumbnail_url?.replace("{width}", "640").replace("{height}", "360"),
      },
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// =========================================================
// 23) START SERVER
// =========================================================
server.listen(PORT, () => {
  console.log(`\n🚀 [SERVER] Démarré sur http://localhost:${PORT}`);
  console.log("✅ Routes prêtes (voir /api/routes)");
  console.log(`✅ Petits streamers : <= ${SMALL_STREAMER_MAX_VIEWERS} viewers`);
  console.log(`✅ Langue défaut : ${DEFAULT_LANGUAGE}`);
});
