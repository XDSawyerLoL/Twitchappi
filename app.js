/**
 * STREAMER & NICHE AI HUB - BACKEND (SECURE MULTI-USER + MODULAR + ONBOARDING + PROFILES)
 * =====================================================================================
 * - Auth Twitch multi-user (session cookie signée)
 * - Tokens chiffrés en Firestore (AES-256-GCM) si TOKEN_ENC_KEY fourni
 * - Routes modularisées (routers)
 * - Onboarding status/complete
 * - Profils streamers sauvegardés (CRUD)
 * - Compatible avec ton front actuel (endpoints conservés)
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
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { Server } = require("socket.io");

const admin = require("firebase-admin");
const { GoogleGenAI } = require("@google/genai");

// =========================================================
// 0) ENV / CONSTANTES
// =========================================================
const PORT = process.env.PORT || 10000;

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;

const SESSION_SECRET = process.env.SESSION_SECRET || ""; // en prod: obligatoire
const TOKEN_ENC_KEY = process.env.TOKEN_ENC_KEY || "";   // pour chiffrer tokens en Firestore

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash";

const ENABLE_CRON = (process.env.ENABLE_CRON || "true").toLowerCase() !== "false";
const SNAPSHOT_EVERY_MIN = parseInt(process.env.SNAPSHOT_EVERY_MIN || "5", 10);

// CORS (safe par défaut)
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

// Cookies
const COOKIE_NAME = "hub_session";
const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,          // en local http => tu peux mettre SECURE_COOKIES=false
  sameSite: "lax",
  path: "/",
};
const SECURE_COOKIES = (process.env.SECURE_COOKIES || "true").toLowerCase() !== "false";
if (!SECURE_COOKIES) COOKIE_OPTS.secure = false;

// =========================================================
// 1) FIREBASE INIT
// =========================================================
let serviceAccount;
if (process.env.FIREBASE_SERVICE_KEY) {
  try {
    let rawJson = process.env.FIREBASE_SERVICE_KEY;
    if (rawJson.startsWith("'") && rawJson.endsWith("'")) rawJson = rawJson.slice(1, -1);
    if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.slice(1, -1);
    rawJson = rawJson.replace(/\\r\\n/g, "\\n").replace(/\\n/g, "\\n").replace(/\\r/g, "\\n");
    serviceAccount = JSON.parse(rawJson);
  } catch (error) {
    console.error("❌ Erreur JSON Firebase:", error.message);
  }
} else {
  try {
    serviceAccount = require("./serviceAccountKey.json");
  } catch (e) {}
}

try {
  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
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
    db.settings({ projectId: serviceAccount.project_id, ignoreUndefinedProperties: true });
  } else {
    db.settings({ ignoreUndefinedProperties: true });
  }
} catch (e) {}

// =========================================================
// 2) IA (Gemini)
// =========================================================
let aiClient = null;
if (GEMINI_API_KEY) {
  try {
    aiClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    console.log("✅ [IA] Gemini prêt.");
  } catch (e) {
    console.error("❌ [IA] init error:", e.message);
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
          "Tu es un expert Data Twitch. Réponds UNIQUEMENT en HTML simple (<p>, <h4>, <ul>, <li>, <strong>). Pas de markdown, pas de backticks.",
      },
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return { success: true, html_response: text };
  } catch (e) {
    console.error("❌ Erreur IA:", e);
    return { success: false, html_response: `<p style='color:red;'>❌ Erreur IA: ${e.message}</p>` };
  }
}

// =========================================================
// 3) HELPERS
// =========================================================
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

function base64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function base64urlJSON(obj) {
  return base64url(Buffer.from(JSON.stringify(obj)));
}
function signHMAC(data, secret) {
  return base64url(crypto.createHmac("sha256", secret).update(data).digest());
}

/**
 * Session token simple type JWT-like (HS256)
 * payload minimal: { sid, uid, exp }
 */
function createSessionToken(payload) {
  if (!SESSION_SECRET) throw new Error("SESSION_SECRET manquant");
  const header = { alg: "HS256", typ: "JWT" };
  const h = base64urlJSON(header);
  const p = base64urlJSON(payload);
  const sig = signHMAC(`${h}.${p}`, SESSION_SECRET);
  return `${h}.${p}.${sig}`;
}
function verifySessionToken(token) {
  if (!SESSION_SECRET) return null;
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;
    const [h, p, sig] = parts;
    const expected = signHMAC(`${h}.${p}`, SESSION_SECRET);
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

    const payload = JSON.parse(Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    if (!payload || !payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

// AES-256-GCM (tokens twitch)
function canEncrypt() {
  return TOKEN_ENC_KEY && TOKEN_ENC_KEY.length >= 16;
}
function encryptJSON(obj) {
  if (!canEncrypt()) return { plaintext: obj };
  const key = crypto.createHash("sha256").update(TOKEN_ENC_KEY).digest(); // 32 bytes
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const raw = Buffer.from(JSON.stringify(obj), "utf8");
  const enc = Buffer.concat([cipher.update(raw), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    enc: base64url(enc),
    iv: base64url(iv),
    tag: base64url(tag),
    v: 1,
  };
}
function decryptJSON(payload) {
  if (!payload) return null;
  if (payload.plaintext) return payload.plaintext;
  if (!canEncrypt()) return null;

  try {
    const key = crypto.createHash("sha256").update(TOKEN_ENC_KEY).digest();
    const iv = Buffer.from(payload.iv.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    const tag = Buffer.from(payload.tag.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    const data = Buffer.from(payload.enc.replace(/-/g, "+").replace(/_/g, "/"), "base64");

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(out.toString("utf8"));
  } catch (e) {
    return null;
  }
}

function requireEnvOrWarn() {
  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI) {
    console.warn("⚠️ Twitch env manquantes: TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET / TWITCH_REDIRECT_URI");
  }
  if (!SESSION_SECRET) {
    console.warn("⚠️ SESSION_SECRET manquant (OBLIGATOIRE en prod).");
  }
}
requireEnvOrWarn();

// =========================================================
// 4) TWITCH API (app token + user token)
// =========================================================
const CACHE = {
  twitchAppToken: null, // { access_token, expiry }
  globalStreamRotation: { streams: [], currentIndex: 0, lastFetchTime: 0, fetchCooldown: 3 * 60 * 1000 },
  boostedStream: null,
};

async function getTwitchAppToken() {
  if (CACHE.twitchAppToken && CACHE.twitchAppToken.expiry > Date.now()) {
    return CACHE.twitchAppToken.access_token;
  }

  const url =
    `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(TWITCH_CLIENT_ID)}` +
    `&client_secret=${encodeURIComponent(TWITCH_CLIENT_SECRET)}` +
    `&grant_type=client_credentials`;

  const res = await fetch(url, { method: "POST" });
  const data = await res.json();

  if (!data.access_token) throw new Error("Impossible d'obtenir le token app Twitch.");
  CACHE.twitchAppToken = {
    access_token: data.access_token,
    expiry: Date.now() + data.expires_in * 1000 - 300000,
  };
  return CACHE.twitchAppToken.access_token;
}

async function twitchAPI(endpoint, token = null) {
  const accessToken = token || (await getTwitchAppToken());
  const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
    headers: {
      "Client-ID": TWITCH_CLIENT_ID,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (res.status === 401) {
    if (!token) CACHE.twitchAppToken = null;
    throw new Error("Token Twitch expiré.");
  }
  return res.json();
}

// =========================================================
// 5) AUTH MULTI-USER (Firestore-backed sessions)
// =========================================================
/**
 * Collections:
 * - sessions/{sid} => { uid, createdAt, lastSeenAt }
 * - users/{uid} => { display_name, login, profile_image_url, token: <encrypted>, onboarding: {...} }
 * - users/{uid}/profiles/{docId} => streamer profiles sauvegardés
 */

async function loadSession(req) {
  const token = req.cookies?.[COOKIE_NAME];
  const payload = verifySessionToken(token);
  if (!payload?.sid || !payload?.uid) return null;

  try {
    const sessRef = db.collection("sessions").doc(String(payload.sid));
    const sessSnap = await sessRef.get();
    if (!sessSnap.exists) return null;

    // Touch lastSeen (soft)
    sessRef.set({ lastSeenAt: admin.firestore.Timestamp.fromMillis(Date.now()) }, { merge: true }).catch(() => {});
    return { sid: payload.sid, uid: payload.uid };
  } catch (e) {
    return null;
  }
}

async function loadUser(uid) {
  const snap = await db.collection("users").doc(String(uid)).get();
  if (!snap.exists) return null;
  return snap.data();
}

async function getUserTwitchToken(uid) {
  const user = await loadUser(uid);
  if (!user?.token) return null;
  const tokenObj = decryptJSON(user.token);
  if (!tokenObj?.access_token || !tokenObj?.expiry) return null;
  if (tokenObj.expiry <= Date.now()) return null;
  return tokenObj.access_token;
}

async function storeUserAndSession({ twitchUser, tokenData }) {
  const uid = String(twitchUser.id);
  const sid = crypto.randomBytes(18).toString("hex");

  const tokenPayload = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || null,
    scope: tokenData.scope || [],
    expiry: Date.now() + (tokenData.expires_in * 1000),
  };

  const userRef = db.collection("users").doc(uid);
  const sessRef = db.collection("sessions").doc(sid);

  const nowTs = admin.firestore.Timestamp.fromMillis(Date.now());

  await db.runTransaction(async (tx) => {
    tx.set(
      userRef,
      {
        uid,
        login: twitchUser.login,
        display_name: twitchUser.display_name,
        profile_image_url: twitchUser.profile_image_url,
        updatedAt: nowTs,
        createdAt: twitchUser.created_at ? nowTs : nowTs,
        token: encryptJSON(tokenPayload),
      },
      { merge: true }
    );

    tx.set(sessRef, { sid, uid, createdAt: nowTs, lastSeenAt: nowTs }, { merge: false });
  });

  return { uid, sid };
}

function authRequired(handler) {
  return async (req, res) => {
    const sess = await loadSession(req);
    if (!sess) return res.status(401).json({ success: false, error: "not_authenticated" });
    req.auth = sess;
    handler(req, res);
  };
}

// =========================================================
// 6) EXPRESS APP + MIDDLEWARES
// =========================================================
const app = express();

// security
app.use(helmet({ crossOriginEmbedderPolicy: false }));
app.set("trust proxy", 1);

// rate limit (basique)
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 240,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// cors
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (CORS_ORIGINS.length === 0) return cb(null, true); // fallback permissif si rien configuré
      if (CORS_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(bodyParser.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

// =========================================================
// 7) UI ROUTE
// =========================================================
app.get("/", (req, res) => {
  const candidates = [process.env.UI_FILE, "NicheOptimizer.html", "NicheOptimizer_v56.html", "index.html"].filter(Boolean);
  const found = candidates.find((f) => fs.existsSync(path.join(__dirname, f)));
  if (!found) return res.status(500).send("UI introuvable sur le serveur.");
  return res.sendFile(path.join(__dirname, found));
});

// =========================================================
// 8) ROUTERS
// =========================================================
const authRouter = express.Router();
const twitchRouter = express.Router();
const profilesRouter = express.Router();
const onboardingRouter = express.Router();
const statsRouter = express.Router();
const analyticsRouter = express.Router();
const aiRouter = express.Router();

// -------------------------
// 8A) AUTH (Twitch OAuth)
// -------------------------
authRouter.get("/twitch_auth_start", (req, res) => {
  const state = crypto.randomBytes(18).toString("hex");

  // Important: on met le state en cookie httpOnly
  res.cookie("twitch_state", state, { ...COOKIE_OPTS, maxAge: 10 * 60 * 1000 });

  const scope = encodeURIComponent("user:read:follows");
  const url =
    `https://id.twitch.tv/oauth2/authorize?client_id=${encodeURIComponent(TWITCH_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code&scope=${scope}&state=${encodeURIComponent(state)}`;

  res.redirect(url);
});

authRouter.get("/twitch_auth_callback", async (req, res) => {
  const code = String(req.query.code || "");
  const state = String(req.query.state || "");
  const expected = String(req.cookies?.twitch_state || "");

  if (!code || !state || !expected || state !== expected) {
    return res.status(400).send("Erreur Auth (state mismatch).");
  }

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
    if (!tokenData?.access_token) return res.status(400).send("Erreur Token Twitch.");

    // get user identity with user token
    const userRes = await twitchAPI("users", tokenData.access_token);
    const twitchUser = userRes?.data?.[0];
    if (!twitchUser?.id) return res.status(400).send("Erreur: utilisateur Twitch introuvable.");

    const { sid, uid } = await storeUserAndSession({ twitchUser, tokenData });

    const sessionToken = createSessionToken({
      sid,
      uid,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 jours
    });

    // cookie de session
    res.cookie(COOKIE_NAME, sessionToken, { ...COOKIE_OPTS, maxAge: 7 * 24 * 60 * 60 * 1000 });

    // ferme la popup (compat front actuel)
    res.send("<script>window.close();</script>");
  } catch (e) {
    console.error("❌ twitch_auth_callback:", e.message);
    res.status(500).send("Erreur Serveur.");
  }
});

authRouter.post("/twitch_logout", async (req, res) => {
  // wipe cookie + session doc (best effort)
  const token = req.cookies?.[COOKIE_NAME];
  const payload = verifySessionToken(token);
  res.clearCookie(COOKIE_NAME, { ...COOKIE_OPTS });

  if (payload?.sid) {
    db.collection("sessions").doc(String(payload.sid)).delete().catch(() => {});
  }
  res.json({ success: true });
});

authRouter.get("/twitch_user_status", async (req, res) => {
  const sess = await loadSession(req);
  if (!sess) return res.json({ is_connected: false });

  try {
    const user = await loadUser(sess.uid);
    if (!user) return res.json({ is_connected: false });

    return res.json({
      is_connected: true,
      display_name: user.display_name || user.login || "User",
      profile_image_url: user.profile_image_url || "",
      uid: user.uid,
    });
  } catch (e) {
    return res.json({ is_connected: false });
  }
});

// firebase status (compat front)
authRouter.get("/firebase_status", async (req, res) => {
  try {
    if (db && admin.apps.length > 0) {
      res.json({ connected: true, message: "Firebase connected", hasServiceAccount: !!serviceAccount });
    } else {
      res.json({ connected: false, message: "Firebase not initialized" });
    }
  } catch (error) {
    res.json({ connected: false, error: error.message });
  }
});

// -------------------------
// 8B) TWITCH endpoints (compat + twitflix)
// -------------------------
twitchRouter.post("/stream_info", async (req, res) => {
  const channel = String(req.body?.channel || "").trim().toLowerCase();
  if (!channel) return res.status(400).json({ success: false, error: "channel manquant" });

  try {
    const u = await twitchAPI(`users?login=${encodeURIComponent(channel)}`);
    if (!u.data || !u.data.length) return res.json({ success: false, error: "introuvable" });

    const user = u.data[0];
    const s = await twitchAPI(`streams?user_id=${encodeURIComponent(user.id)}`);
    const stream = s.data && s.data.length ? s.data[0] : null;

    const out = stream
      ? {
          id: stream.id,
          user_id: stream.user_id,
          user_login: stream.user_login,
          user_name: stream.user_name,
          game_id: stream.game_id || null,
          game_name: stream.game_name || null,
          title: stream.title || null,
          viewer_count: stream.viewer_count || 0,
          started_at: stream.started_at || null,
        }
      : null;

    return res.json({ success: true, user, stream: out });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// TwitFlix: pagination top categories
twitchRouter.get("/api/categories/top", async (req, res) => {
  try {
    const cursor = req.query.cursor;
    let url = "games/top?first=100";
    if (cursor) url += `&after=${encodeURIComponent(cursor)}`;

    const d = await twitchAPI(url);
    if (!d.data) return res.json({ success: false });

    const categories = d.data.map((g) => ({
      id: g.id,
      name: g.name,
      box_art_url: g.box_art_url.replace("{width}", "285").replace("{height}", "380"),
    }));

    const nextCursor = d.pagination ? d.pagination.cursor : null;
    res.json({ success: true, categories, cursor: nextCursor });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// TwitFlix: recherche de catégories (pour la future UI "Netflix-like search")
twitchRouter.get("/api/categories/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  const first = clamp(parseInt(req.query.first || "20", 10), 1, 50);
  if (!q) return res.status(400).json({ success: false, error: "q manquant" });

  try {
    const d = await twitchAPI(`search/categories?query=${encodeURIComponent(q)}&first=${first}`);
    const categories = (d.data || []).map((g) => ({
      id: g.id,
      name: g.name,
      box_art_url: g.box_art_url.replace("{width}", "285").replace("{height}", "380"),
    }));
    res.json({ success: true, categories });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// TwitFlix: choisir un stream par catégorie (<100 viewers)
twitchRouter.post("/api/stream/by_category", async (req, res) => {
  const gameId = String(req.body?.game_id || "");
  if (!gameId) return res.status(400).json({ success: false, error: "game_id manquant" });

  try {
    let sRes = await twitchAPI(`streams?game_id=${encodeURIComponent(gameId)}&language=fr&first=100`);
    let streams = sRes.data || [];

    if (streams.length < 5) {
      const gRes = await twitchAPI(`streams?game_id=${encodeURIComponent(gameId)}&first=100`);
      streams = [...streams, ...(gRes.data || [])];
    }

    const candidates = streams.filter((s) => (s.viewer_count || 0) <= 100);

    if (candidates.length === 0) {
      streams.sort((a, b) => (a.viewer_count || 0) - (b.viewer_count || 0));
      if (streams.length > 0) candidates.push(streams[0]);
    }

    if (candidates.length === 0) {
      return res.json({ success: false, message: "Aucun stream trouvé dans cette catégorie." });
    }

    const randomStream = candidates[Math.floor(Math.random() * candidates.length)];
    return res.json({
      success: true,
      channel: randomStream.user_login,
      game_name: randomStream.game_name,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Followed streams (auth user token)
twitchRouter.get("/followed_streams", authRequired(async (req, res) => {
  try {
    const token = await getUserTwitchToken(req.auth.uid);
    if (!token) return res.status(401).json({ success: false, error: "token_expired" });

    const user = await loadUser(req.auth.uid);
    const data = await twitchAPI(`streams/followed?user_id=${encodeURIComponent(user.uid)}`, token);

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
}));

// Rotation globale (AUTO)
async function refreshGlobalStreamList() {
  const now = Date.now();
  const rot = CACHE.globalStreamRotation;
  if (now - rot.lastFetchTime < rot.fetchCooldown && rot.streams.length > 0) return;

  try {
    const data = await twitchAPI(`streams?language=fr&first=100`);
    let suitable = (data.data || []).filter((s) => (s.viewer_count || 0) <= 100);
    if (suitable.length === 0) suitable = (data.data || []).slice(-10);

    if (suitable.length > 0) {
      rot.streams = suitable
        .sort(() => 0.5 - Math.random())
        .map((s) => ({ channel: s.user_login, viewers: s.viewer_count }));
      rot.currentIndex = 0;
      rot.lastFetchTime = now;
    }
  } catch (e) {
    console.error("Erreur refresh streams:", e.message);
  }
}

// BOOST (global) stocké Firestore comme avant
twitchRouter.get("/get_default_stream", async (req, res) => {
  const now = Date.now();
  let boost = null;

  try {
    const q = await db.collection("boosts").where("endTime", ">", now).orderBy("endTime", "desc").limit(1).get();
    if (!q.empty) boost = q.docs[0].data();
  } catch (e) {
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > now) boost = CACHE.boostedStream;
  }

  if (boost) {
    return res.json({ success: true, channel: boost.channel, mode: "BOOST", message: "⚡ BOOST ACTIF" });
  }

  await refreshGlobalStreamList();
  const rot = CACHE.globalStreamRotation;

  if (rot.streams.length === 0) {
    return res.json({ success: true, channel: "twitch", mode: "FALLBACK" });
  }

  return res.json({
    success: true,
    channel: rot.streams[rot.currentIndex].channel,
    mode: "AUTO",
    viewers: rot.streams[rot.currentIndex].viewers,
    message: "👁️ AUTO",
  });
});

twitchRouter.post("/cycle_stream", async (req, res) => {
  const { direction } = req.body;

  if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
    return res.json({ success: false, error: "boost_active" });
  }

  await refreshGlobalStreamList();
  const rot = CACHE.globalStreamRotation;
  if (rot.streams.length === 0) return res.json({ success: false, error: "no_streams" });

  if (direction === "next") rot.currentIndex = (rot.currentIndex + 1) % rot.streams.length;
  else rot.currentIndex = (rot.currentIndex - 1 + rot.streams.length) % rot.streams.length;

  return res.json({ success: true, channel: rot.streams[rot.currentIndex].channel });
});

twitchRouter.post("/stream_boost", async (req, res) => {
  const channel = String(req.body?.channel || "").trim().toLowerCase();
  if (!channel) return res.status(400).json({ success: false, error: "channel manquant" });

  const now = Date.now();
  try {
    await db.collection("boosts").add({ channel, startTime: now, endTime: now + 900000 }); // 15 min
    CACHE.boostedStream = { channel, endTime: now + 900000 };
    res.json({ success: true, html_response: "<p style='color:green;'>✅ Boost activé pendant 15 minutes!</p>" });
  } catch (e) {
    res.status(500).json({ success: false, error: "Erreur DB" });
  }
});

// -------------------------
// 8C) ONBOARDING
// -------------------------
onboardingRouter.get("/api/onboarding/status", authRequired(async (req, res) => {
  try {
    const user = await loadUser(req.auth.uid);
    const ob = user?.onboarding || {};
    res.json({
      success: true,
      completed: !!ob.completed,
      step: ob.step || "welcome",
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}));

onboardingRouter.post("/api/onboarding/complete", authRequired(async (req, res) => {
  const step = String(req.body?.step || "done");
  try {
    await db.collection("users").doc(String(req.auth.uid)).set(
      {
        onboarding: {
          completed: step === "done",
          step,
          updatedAt: admin.firestore.Timestamp.fromMillis(Date.now()),
        },
      },
      { merge: true }
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}));

// -------------------------
// 8D) PROFILS STREAMERS (CRUD)
// -------------------------
profilesRouter.get("/api/profiles", authRequired(async (req, res) => {
  try {
    const snap = await db.collection("users").doc(String(req.auth.uid)).collection("profiles").orderBy("updatedAt", "desc").limit(200).get();
    const profiles = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ success: true, profiles });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}));

profilesRouter.post("/api/profiles", authRequired(async (req, res) => {
  const login = String(req.body?.login || "").trim().toLowerCase();
  if (!login) return res.status(400).json({ success: false, error: "login manquant" });

  const payload = {
    login,
    display_name: String(req.body?.display_name || "").trim() || null,
    tags: Array.isArray(req.body?.tags) ? req.body.tags.slice(0, 12) : [],
    notes: String(req.body?.notes || "").slice(0, 2000) || "",
    favorite: !!req.body?.favorite,
    updatedAt: admin.firestore.Timestamp.fromMillis(Date.now()),
    createdAt: admin.firestore.Timestamp.fromMillis(Date.now()),
  };

  try {
    const ref = await db.collection("users").doc(String(req.auth.uid)).collection("profiles").add(payload);
    res.json({ success: true, id: ref.id });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}));

profilesRouter.put("/api/profiles/:id", authRequired(async (req, res) => {
  const id = String(req.params.id || "");
  if (!id) return res.status(400).json({ success: false, error: "id manquant" });

  const patch = {};
  if (req.body?.display_name != null) patch.display_name = String(req.body.display_name).trim().slice(0, 80);
  if (req.body?.notes != null) patch.notes = String(req.body.notes).slice(0, 2000);
  if (req.body?.favorite != null) patch.favorite = !!req.body.favorite;
  if (req.body?.tags != null && Array.isArray(req.body.tags)) patch.tags = req.body.tags.slice(0, 12);
  patch.updatedAt = admin.firestore.Timestamp.fromMillis(Date.now());

  try {
    await db.collection("users").doc(String(req.auth.uid)).collection("profiles").doc(id).set(patch, { merge: true });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}));

profilesRouter.delete("/api/profiles/:id", authRequired(async (req, res) => {
  const id = String(req.params.id || "");
  if (!id) return res.status(400).json({ success: false, error: "id manquant" });

  try {
    await db.collection("users").doc(String(req.auth.uid)).collection("profiles").doc(id).delete();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}));

// =========================================================
// 9) STATS / ANALYTICS (reprend ta logique existante)
//    (On garde le CRON + daily_stats/hourly_stats + endpoints)
// =========================================================
function computeGrowthScore({ avgViewers = 0, growthPct = 0, volatility = 0, hoursPerWeek = 0 }) {
  const logPart = Math.log10(avgViewers + 1) * 22;      // ~0..66
  const growthPart = clamp(growthPct, -50, 200) * 0.22; // ~-11..44
  const volPenalty = clamp(volatility, 0, 200) * 0.18;  // ~0..36
  const hoursPart = clamp(hoursPerWeek, 0, 80) * 0.25;  // ~0..20
  const raw = 15 + logPart + growthPart + hoursPart - volPenalty;
  return Math.round(clamp(raw, 0, 100));
}

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
    await db.collection("games").doc(String(gameId)).set(
      { name: gameName || null, last_seen: admin.firestore.Timestamp.fromMillis(Date.now()) },
      { merge: true }
    );
  } catch (e) {}
}

async function updateDailyRollupsForStream(stream, nowMs) {
  const viewers = Number(stream.viewer_count || 0);
  const dayKey = yyyy_mm_dd_from_ms(nowMs);

  const chDailyRef = db.collection("channels").doc(String(stream.user_id)).collection("daily_stats").doc(dayKey);

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

      tx.set(
        chDailyRef,
        {
          day: dayKey,
          samples: nextSamples,
          total_viewers_sum: nextSum,
          avg_viewers: Math.round(nextSum / nextSamples),
          peak_viewers: nextPeak,
          minutes_live_est: nextSamples * SNAPSHOT_EVERY_MIN,
          top_game_id: stream.game_id || null,
          top_game_name: stream.game_name || null,
          updated_at: admin.firestore.Timestamp.fromMillis(nowMs),
        },
        { merge: true }
      );
    });
  } catch (e) {
    console.error("❌ [DAILY] channel rollup:", e.message);
  }
}

async function collectAnalyticsSnapshot() {
  const now = Date.now();
  try {
    const data = await twitchAPI("streams?first=100&language=fr");
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
      totalViewers += s.viewer_count || 0;

      await upsertChannelMetaFromStream(s, now);
      await upsertGameMeta(s.game_id, s.game_name);
      rollupPromises.push(updateDailyRollupsForStream(s, now));

      const chRef = db.collection("channels").doc(String(s.user_id)).collection("hourly_stats").doc(String(now));
      batch.set(chRef, {
        timestamp: now,
        viewers: s.viewer_count || 0,
        game_id: s.game_id || null,
        game_name: s.game_name || null,
        title: s.title || null,
        language: s.language || null,
        channel_id: String(s.user_id),
      });
      ops++;
      await commitIfNeeded();

      if (s.game_id) {
        const gRef = db.collection("games").doc(String(s.game_id)).collection("hourly_stats").doc(`${s.user_id}_${now}`);
        batch.set(gRef, {
          timestamp: now,
          channel_id: String(s.user_id),
          viewers: s.viewer_count || 0,
        });
        ops++;
        await commitIfNeeded();
      }
    }

    const globalRef = db.collection("stats_history").doc(String(now));
    batch.set(globalRef, {
      timestamp: admin.firestore.Timestamp.fromMillis(now),
      timestamp_ms: now,
      total_viewers: totalViewers,
      channels_live: streams.length,
      top_game: streams[0]?.game_name || null,
    });
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
  console.log(` - CRON ENABLED = true (every ${SNAPSHOT_EVERY_MIN} min)`);
  setInterval(collectAnalyticsSnapshot, SNAPSHOT_EVERY_MIN * 60 * 1000);
  collectAnalyticsSnapshot().catch(() => {});
} else {
  console.log(` - CRON ENABLED = false`);
}

// Stats endpoints (compat)
statsRouter.get("/api/stats/global", async (req, res) => {
  try {
    const data = await twitchAPI("streams?first=100");
    let v = 0;
    (data.data || []).forEach((s) => (v += s.viewer_count || 0));

    const est = Math.floor(v * 3.8);
    const topGame = data.data?.[0]?.game_name || "N/A";
    const history = { live: { labels: [], values: [] } };

    try {
      const snaps = await db.collection("stats_history").orderBy("timestamp", "desc").limit(12).get();
      if (!snaps.empty) {
        snaps.docs.reverse().forEach((d) => {
          const stats = d.data();
          if (stats.timestamp) {
            const date = stats.timestamp.toDate();
            const timeStr = `${date.getHours()}h${date.getMinutes() < 10 ? "0" + date.getMinutes() : date.getMinutes()}`;
            history.live.labels.push(timeStr);
            history.live.values.push(stats.total_viewers);
          }
        });
      } else {
        history.live.labels = ["-1h", "Now"];
        history.live.values = [est * 0.9, est];
      }
    } catch (e) {
      console.error("Erreur stats history:", e.message);
    }

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

statsRouter.get("/api/stats/top_games", async (req, res) => {
  try {
    const d = await twitchAPI("games/top?first=10");
    res.json({
      games: (d.data || []).map((g) => ({
        name: g.name,
        box_art_url: g.box_art_url.replace("{width}", "52").replace("{height}", "72"),
      })),
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

statsRouter.get("/api/stats/languages", async (req, res) => {
  try {
    const d = await twitchAPI("streams?first=100");
    const l = {};
    (d.data || []).forEach((s) => (l[s.language] = (l[s.language] || 0) + 1));

    const sorted = Object.keys(l)
      .map((k) => ({ name: k.toUpperCase(), percent: l[k] }))
      .sort((a, b) => b.percent - a.percent)
      .slice(0, 5);

    res.json({ languages: sorted });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// =========================================================
// 10) AI / ANALYTICS (garde les endpoints déjà utilisés)
// =========================================================
aiRouter.get("/api/ai/reco", async (req, res) => {
  const login = String(req.query.login || "").trim().toLowerCase();
  const days = clamp(parseInt(req.query.days || "30", 10), 7, 90);
  if (!login) return res.status(400).json({ success: false, html_response: "<p style='color:red;'>login requis</p>" });

  try {
    const a = await fetch(`http://localhost:${PORT}/api/analytics/channel_by_login/${encodeURIComponent(login)}?days=${days}`).then(r => r.json());
    if (!a.success) return res.json({ success: false, html_response: "<p style='color:red;'>Pas assez de data.</p>" });

    const k = a.kpis || {};
    const prompt = `Tu es un coach Twitch DATA-DRIVEN.
Réponds UNIQUEMENT en HTML (<h4>, <ul>, <li>, <p>, <strong>).

KPIs:
- avg_viewers: ${k.avg_viewers}
- peak_viewers: ${k.peak_viewers}
- growth_percent: ${k.growth_percent}%
- volatility: ${k.volatility}
- hours_per_week_est: ${k.hours_per_week_est}
- growth_score: ${k.growth_score}/100

Donne 5 recommandations concrètes + 3 expériences à tester.`;

    const ai = await runGeminiAnalysis(prompt);
    return res.json(ai);
  } catch (e) {
    return res.status(500).json({ success: false, html_response: `<p style="color:red;">${e.message}</p>` });
  }
});

// Analytics endpoint (reprend la structure existante)
analyticsRouter.get("/api/analytics/channel_by_login/:login", async (req, res) => {
  const login = String(req.params.login || "").trim().toLowerCase();
  const days = clamp(parseInt(req.query.days || "30", 10), 1, 90);
  if (!login) return res.status(400).json({ success: false, error: "login manquant" });

  try {
    const uRes = await twitchAPI(`users?login=${encodeURIComponent(login)}`);
    if (!uRes.data || !uRes.data.length) return res.json({ success: false, error: "introuvable" });
    const channelId = String(uRes.data[0].id);

    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const q = await db
      .collection("channels")
      .doc(channelId)
      .collection("daily_stats")
      .where("day", ">=", yyyy_mm_dd_from_ms(since))
      .orderBy("day", "asc")
      .get();

    if (q.empty) {
      return res.json({
        success: false,
        channel_id: channelId,
        message: "Pas assez de données daily_stats (laisse tourner le cron quelques minutes/heures).",
      });
    }

    const series = q.docs.map((d) => d.data());
    const avg = Math.round(series.reduce((a, x) => a + (x.avg_viewers || 0), 0) / series.length);
    const peak = Math.max(...series.map((x) => x.peak_viewers || 0));

    const first = series[0]?.avg_viewers || 0;
    const last = series[series.length - 1]?.avg_viewers || 0;
    const growthPct = first > 0 ? Math.round(((last - first) / first) * 100) : 0;

    // volatility simple: moyenne des écarts absolus
    let vol = 0;
    for (let i = 1; i < series.length; i++) vol += Math.abs((series[i].avg_viewers || 0) - (series[i - 1].avg_viewers || 0));
    vol = series.length > 1 ? Math.round(vol / (series.length - 1)) : 0;

    const totalMinutes = series.reduce((a, x) => a + (x.minutes_live_est || 0), 0);
    const hoursPerWeekEst = Math.max(1, (totalMinutes / 60) / (series.length / 7));

    const score = computeGrowthScore({
      avgViewers: avg,
      growthPct,
      volatility: vol,
      hoursPerWeek: hoursPerWeekEst,
    });

    res.json({
      success: true,
      channel_id: channelId,
      series,
      kpis: {
        avg_viewers: avg,
        peak_viewers: peak,
        growth_percent: growthPct,
        volatility: vol,
        hours_per_week_est: Math.round(hoursPerWeekEst * 10) / 10,
        growth_score: score,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// =========================================================
// 11) MOUNT ROUTERS
// =========================================================
app.use("/", authRouter);
app.use("/", twitchRouter);
app.use("/", onboardingRouter);
app.use("/", profilesRouter);
app.use("/", statsRouter);
app.use("/", analyticsRouter);
app.use("/", aiRouter);

// =========================================================
// 12) SOCKET.IO (Hub Secure) - multi-user
// =========================================================
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (CORS_ORIGINS.length === 0) return cb(null, true);
      if (CORS_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  },
});

// Auth socket via cookie hub_session
io.use(async (socket, next) => {
  try {
    const cookieHeader = socket.handshake.headers.cookie || "";
    const cookies = Object.fromEntries(
      cookieHeader.split(";").map(v => v.trim()).filter(Boolean).map(kv => {
        const i = kv.indexOf("=");
        return [kv.slice(0, i), decodeURIComponent(kv.slice(i + 1))];
      })
    );

    const token = cookies[COOKIE_NAME];
    const payload = verifySessionToken(token);
    if (!payload?.uid) {
      socket.user = { uid: null, name: "Anon" };
      return next(); // autoriser en anon (tu peux bloquer si tu veux)
    }

    const user = await loadUser(payload.uid);
    socket.user = { uid: payload.uid, name: user?.display_name || user?.login || "User" };
    return next();
  } catch (e) {
    socket.user = { uid: null, name: "Anon" };
    return next();
  }
});

io.on("connection", (socket) => {
  socket.on("chat message", (msg) => {
    const text = typeof msg === "string" ? msg : String(msg?.text || "");
    const safe = text.slice(0, 500);

    io.emit("chat message", {
      user: socket.user?.name || "Anon",
      text: safe,
      at: Date.now(),
    });
  });
});

// =========================================================
// 13) START SERVER
// =========================================================
server.listen(PORT, () => {
  console.log(`✅ Server running on :${PORT}`);
});
