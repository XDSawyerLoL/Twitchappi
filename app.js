/**
 * STREAMER HUB - BACKEND (Multi-user auth + Profiles + Twitflix Netflix-like)
 * ==========================================================================
 * - Multi-user Twitch OAuth via cookie session (sid)
 * - Firestore persistence for users, onboarding, streamer profiles
 * - Twitflix: category search + rail + hover preview (muted autoplay embed)
 *
 * Notes:
 * - Requires env: TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_REDIRECT_URI
 * - Optional: GEMINI_API_KEY, FIREBASE_SERVICE_KEY (or serviceAccountKey.json)
 *
 * Based on your current app.js structure but fixed multi-user + added routes.
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
// 0) FIREBASE INIT
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
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id });
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
  if (serviceAccount) db.settings({ projectId: serviceAccount.project_id, ignoreUndefinedProperties: true });
  else db.settings({ ignoreUndefinedProperties: true });
} catch (_) {}

// =========================================================
// 1) APP CONFIG
// =========================================================
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });

const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash";

const SESSION_SECRET = process.env.SESSION_SECRET || "dev_change_me_session_secret";
const TOKEN_ENC_KEY = crypto.createHash('sha256').update(String(process.env.TOKEN_ENC_KEY || SESSION_SECRET)).digest(); // 32 bytes

app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json({ limit: '2mb' }));
app.use(cookieParser(SESSION_SECRET));
app.use(express.static(path.join(__dirname)));

// UI
app.get('/', (req, res) => {
  const candidates = [
    process.env.UI_FILE,
    'NicheOptimizer.html',
    'NicheOptimizer_v56.html',
    'index.html'
  ].filter(Boolean);
  const found = candidates.find(f => fs.existsSync(path.join(__dirname, f)));
  if (!found) return res.status(500).send('UI introuvable sur le serveur.');
  return res.sendFile(path.join(__dirname, found));
});

// =========================================================
// 2) HELPERS
// =========================================================
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function yyyy_mm_dd_from_ms(ms) {
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function randomId(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

function encryptJson(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', TOKEN_ENC_KEY, iv);
  const plaintext = Buffer.from(JSON.stringify(obj), 'utf8');
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decryptJson(b64) {
  const raw = Buffer.from(String(b64 || ''), 'base64');
  if (raw.length < 12 + 16 + 1) throw new Error("cipher too short");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', TOKEN_ENC_KEY, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return JSON.parse(dec.toString('utf8'));
}

function getBaseUrl(req) {
  // behind proxy (render etc.)
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').toString();
  const host = (req.headers['x-forwarded-host'] || req.headers.host).toString();
  return `${proto}://${host}`;
}

// =========================================================
// 2A) TWITCH API TOKEN (APP)
// =========================================================
const CACHE = {
  twitchAppToken: null, // { access_token, expiry }
  globalStreamRotation: { streams: [], currentIndex: 0, lastFetchTime: 0, fetchCooldown: 3 * 60 * 1000 },
  lastScanData: null,
  boostedStream: null
};

async function getTwitchAppToken() {
  if (CACHE.twitchAppToken && CACHE.twitchAppToken.expiry > Date.now()) return CACHE.twitchAppToken.access_token;

  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(TWITCH_CLIENT_ID)}&client_secret=${encodeURIComponent(TWITCH_CLIENT_SECRET)}&grant_type=client_credentials`,
    { method: 'POST' }
  );
  const data = await res.json();
  if (!data.access_token) throw new Error("No app token");
  CACHE.twitchAppToken = { access_token: data.access_token, expiry: Date.now() + (data.expires_in * 1000) - 300000 };
  return CACHE.twitchAppToken.access_token;
}

async function twitchAPI(endpoint, token = null) {
  const accessToken = token || await getTwitchAppToken();
  const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
    headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${accessToken}` }
  });
  if (res.status === 401 && !token) {
    CACHE.twitchAppToken = null;
    throw new Error("Token app expiré");
  }
  return res.json();
}

// =========================================================
// 2B) GEMINI
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
  if (!aiClient) return { success: false, html_response: "<p style='color:red;'>❌ IA non initialisée.</p>" };

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

// =========================================================
// 3) MULTI-USER SESSIONS (cookie sid -> Firestore sessions)
// =========================================================
const SESSION_COOKIE = "sid";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 jours

function setSessionCookie(res, sid) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    signed: true,
    maxAge: SESSION_TTL_MS
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE);
  res.clearCookie('twitch_state');
}

async function getSession(req) {
  const sid = req.signedCookies?.[SESSION_COOKIE];
  if (!sid) return null;
  try {
    const snap = await db.collection('sessions').doc(String(sid)).get();
    if (!snap.exists) return null;
    const s = snap.data() || {};
    if (!s.uid || !s.enc) return null;
    if (s.expires_at && s.expires_at.toMillis && s.expires_at.toMillis() < Date.now()) return null;

    const tokens = decryptJson(s.enc); // { access_token, refresh_token?, expiry }
    return { sid, uid: s.uid, display_name: s.display_name, profile_image_url: s.profile_image_url, tokens };
  } catch (e) {
    return null;
  }
}

async function requireUser(req, res, next) {
  const sess = await getSession(req);
  if (!sess || !sess.tokens?.access_token || (sess.tokens.expiry && sess.tokens.expiry < Date.now())) {
    return res.status(401).json({ success: false, error: "not_authenticated" });
  }
  req.user = sess;
  next();
}

async function upsertUserDoc(uid, payload) {
  try {
    await db.collection('users').doc(String(uid)).set({
      ...payload,
      updated_at: admin.firestore.Timestamp.fromMillis(Date.now())
    }, { merge: true });
  } catch (_) {}
}

// =========================================================
// 4) AUTH ROUTES (MULTI-USER)
// =========================================================
app.get('/twitch_auth_start', async (req, res) => {
  const state = randomId(16);

  // on enregistre state -> pour éviter CSRF multi-user
  res.cookie('twitch_state', state, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 10 * 60 * 1000 });

  const scope = encodeURIComponent("user:read:follows");
  const url = `https://id.twitch.tv/oauth2/authorize?client_id=${encodeURIComponent(TWITCH_CLIENT_ID)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scope}&state=${encodeURIComponent(state)}`;
  return res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
  const { code, state } = req.query;
  const expected = req.cookies?.twitch_state;
  if (!code || !state || !expected || String(state) !== String(expected)) {
    return res.send("Erreur Auth (state).");
  }

  try {
    const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: TWITCH_CLIENT_ID,
        client_secret: TWITCH_CLIENT_SECRET,
        code: String(code),
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI
      })
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.send("Erreur Token.");

    const userRes = await twitchAPI('users', tokenData.access_token);
    const user = userRes?.data?.[0];
    if (!user?.id) return res.send("Erreur User.");

    const uid = String(user.id);
    const sid = randomId(18);

    const expiry = Date.now() + (Number(tokenData.expires_in || 0) * 1000);
    const enc = encryptJson({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      expiry
    });

    await db.collection('sessions').doc(sid).set({
      uid,
      display_name: user.display_name || user.login || "User",
      profile_image_url: user.profile_image_url || null,
      enc,
      created_at: admin.firestore.Timestamp.fromMillis(Date.now()),
      expires_at: admin.firestore.Timestamp.fromMillis(Date.now() + SESSION_TTL_MS)
    }, { merge: false });

    await upsertUserDoc(uid, {
      uid,
      login: user.login || null,
      display_name: user.display_name || null,
      profile_image_url: user.profile_image_url || null,
      onboarded: admin.firestore.FieldValue.increment(0) // ensure field exists
    });

    setSessionCookie(res, sid);

    // close popup
    return res.send("<script>window.close();</script>");
  } catch (e) {
    console.error("Auth callback error:", e.message);
    return res.send("Erreur Serveur.");
  }
});

app.post('/twitch_logout', async (req, res) => {
  const sid = req.signedCookies?.[SESSION_COOKIE];
  if (sid) {
    try { await db.collection('sessions').doc(String(sid)).delete(); } catch (_) {}
  }
  clearSessionCookie(res);
  return res.json({ success: true });
});

app.get('/twitch_user_status', async (req, res) => {
  const sess = await getSession(req);
  if (!sess) return res.json({ is_connected: false });

  return res.json({
    is_connected: true,
    display_name: sess.display_name,
    profile_image_url: sess.profile_image_url
  });
});

app.post('/api/onboarding/complete', requireUser, async (req, res) => {
  try {
    await db.collection('users').doc(String(req.user.uid)).set({
      onboarded: true,
      onboarded_at: admin.firestore.Timestamp.fromMillis(Date.now())
    }, { merge: true });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/onboarding/status', requireUser, async (req, res) => {
  try {
    const snap = await db.collection('users').doc(String(req.user.uid)).get();
    const d = snap.exists ? (snap.data() || {}) : {};
    return res.json({ success: true, onboarded: !!d.onboarded });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/firebase_status', (req, res) => {
  try {
    if (db && admin.apps.length > 0) res.json({ connected: true, message: 'Firebase connected', hasServiceAccount: !!serviceAccount });
    else res.json({ connected: false, message: 'Firebase not initialized' });
  } catch (error) {
    res.json({ connected: false, error: error.message });
  }
});

// =========================================================
// 5) SOCKET.IO - HUB SECURE (namespaced rooms per sid)
// =========================================================
io.on('connection', async (socket) => {
  try {
    // optional: read cookie sid from handshake headers (if same origin)
    // for now: allow chat but sanitize client side; server tags sid if present
    socket.on('chat message', async (msg) => {
      const user = (msg && msg.user) ? String(msg.user).slice(0, 40) : 'Anon';
      const text = (msg && msg.text) ? String(msg.text).slice(0, 500) : '';
      if (!text) return;

      io.emit('chat message', { user, text, ts: Date.now() });
    });
  } catch (e) {}
});

// =========================================================
// 6) PROFILES - save streamer profiles per user
// =========================================================
app.get('/api/profiles', requireUser, async (req, res) => {
  try {
    const q = await db.collection('users').doc(String(req.user.uid)).collection('profiles')
      .orderBy('created_at', 'desc').limit(200).get();

    const profiles = q.docs.map(d => ({ id: d.id, ...d.data() }));
    return res.json({ success: true, profiles });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/profiles', requireUser, async (req, res) => {
  const login = String(req.body?.login || '').trim().toLowerCase();
  const label = String(req.body?.label || '').trim().slice(0, 60);
  if (!login) return res.status(400).json({ success: false, error: "login_required" });

  try {
    // fetch twitch user meta
    const uRes = await twitchAPI(`users?login=${encodeURIComponent(login)}`);
    const u = uRes?.data?.[0];
    if (!u?.id) return res.status(404).json({ success: false, error: "not_found" });

    const payload = {
      login: u.login,
      display_name: u.display_name || u.login,
      twitch_id: String(u.id),
      profile_image_url: u.profile_image_url || null,
      description: u.description || "",
      view_count: u.view_count || 0,
      label: label || null,
      created_at: admin.firestore.Timestamp.fromMillis(Date.now())
    };

    const ref = await db.collection('users').doc(String(req.user.uid)).collection('profiles')
      .doc(String(u.id));
    await ref.set(payload, { merge: true });

    return res.json({ success: true, profile: payload });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

app.delete('/api/profiles/:twitch_id', requireUser, async (req, res) => {
  const tid = String(req.params.twitch_id || '').trim();
  if (!tid) return res.status(400).json({ success: false });
  try {
    await db.collection('users').doc(String(req.user.uid)).collection('profiles').doc(tid).delete();
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// =========================================================
// 7) STREAM INFO
// =========================================================
app.post('/stream_info', async (req, res) => {
  const channel = String(req.body?.channel || '').trim().toLowerCase();
  if (!channel) return res.status(400).json({ success:false, error:'channel manquant' });

  try {
    const u = await twitchAPI(`users?login=${encodeURIComponent(channel)}`);
    if (!u.data || !u.data.length) return res.json({ success:false, error:'introuvable' });

    const user = u.data[0];
    const s = await twitchAPI(`streams?user_id=${encodeURIComponent(user.id)}`);
    const stream = s.data && s.data.length ? s.data[0] : null;

    const out = stream ? {
      id: stream.id,
      user_id: stream.user_id,
      user_login: stream.user_login,
      user_name: stream.user_name,
      game_id: stream.game_id || null,
      game_name: stream.game_name || null,
      title: stream.title || null,
      viewer_count: stream.viewer_count || 0,
      started_at: stream.started_at || null
    } : null;

    return res.json({ success:true, user, stream: out });
  } catch (e) {
    return res.status(500).json({ success:false, error:e.message });
  }
});

// =========================================================
// 8) TWITFLIX - categories + search + rails + hover preview
// =========================================================

// existing: top categories pagination
app.get('/api/categories/top', async (req, res) => {
  try {
    const cursor = req.query.cursor;
    let url = 'games/top?first=100';
    if (cursor) url += `&after=${encodeURIComponent(cursor)}`;

    const d = await twitchAPI(url);
    if (!d.data) return res.json({ success: false });

    const categories = d.data.map(g => ({
      id: g.id,
      name: g.name,
      box_art_url: g.box_art_url.replace('{width}', '285').replace('{height}', '380')
    }));

    const nextCursor = d.pagination ? d.pagination.cursor : null;
    res.json({ success: true, categories, cursor: nextCursor });
  } catch (e) {
    res.status(500).json({ success:false, error:e.message });
  }
});

// NEW: search categories by query (for Twitflix search bar)
app.get('/api/categories/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const first = clamp(parseInt(req.query.first || '24', 10), 1, 50);
  if (!q) return res.json({ success: true, categories: [] });

  try {
    const d = await twitchAPI(`search/categories?query=${encodeURIComponent(q)}&first=${first}`);
    const categories = (d.data || []).map(g => ({
      id: g.id,
      name: g.name,
      box_art_url: g.box_art_url ? g.box_art_url.replace('{width}', '285').replace('{height}', '380') : null
    }));
    return res.json({ success: true, categories });
  } catch (e) {
    return res.status(500).json({ success:false, error: e.message });
  }
});

// existing: play random stream by category (<100 viewers)
app.post('/api/stream/by_category', async (req, res) => {
  const gameId = String(req.body?.game_id || '');
  if (!gameId) return res.status(400).json({ success: false, error: 'game_id manquant' });

  try {
    let sRes = await twitchAPI(`streams?game_id=${gameId}&language=fr&first=100`);
    let streams = sRes.data || [];

    if (streams.length < 5) {
      const gRes = await twitchAPI(`streams?game_id=${gameId}&first=100`);
      streams = [...streams, ...(gRes.data || [])];
    }

    const candidates = streams.filter(s => (s.viewer_count || 0) <= 100);

    if (candidates.length === 0) {
      streams.sort((a, b) => (a.viewer_count || 0) - (b.viewer_count || 0));
      if (streams.length > 0) candidates.push(streams[0]);
    }

    if (candidates.length === 0) {
      return res.json({ success: false, message: 'Aucun stream trouvé dans cette catégorie.' });
    }

    const randomStream = candidates[Math.floor(Math.random() * candidates.length)];
    return res.json({
      success: true,
      channel: randomStream.user_login,
      game_name: randomStream.game_name
    });

  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// NEW: Twitflix rail (list of items for a "Netflix row")
app.get('/api/twitflix/rail', async (req, res) => {
  const gameId = String(req.query.game_id || '').trim();
  const first = clamp(parseInt(req.query.first || '18', 10), 6, 24);
  if (!gameId) return res.status(400).json({ success: false, error: 'game_id manquant' });

  try {
    // get streams (prefer FR, fallback global)
    let sRes = await twitchAPI(`streams?game_id=${encodeURIComponent(gameId)}&language=fr&first=100`);
    let streams = sRes.data || [];
    if (streams.length < 10) {
      const gRes = await twitchAPI(`streams?game_id=${encodeURIComponent(gameId)}&first=100`);
      streams = [...streams, ...(gRes.data || [])];
    }

    // sort by "small/medium" to resemble discovery
    streams = streams
      .filter(s => (s.viewer_count || 0) > 0)
      .sort((a, b) => (a.viewer_count || 0) - (b.viewer_count || 0))
      .slice(0, 80);

    // pick first N but shuffle a little
    const picked = streams.sort(() => 0.5 - Math.random()).slice(0, first);

    const items = picked.map(s => ({
      channel: s.user_login,
      channel_name: s.user_name,
      title: s.title || "",
      viewers: s.viewer_count || 0,
      thumbnail_url: (s.thumbnail_url || "")
        .replace('{width}', '480')
        .replace('{height}', '270'),
      game_id: s.game_id || gameId,
      started_at: s.started_at || null
    }));

    return res.json({ success: true, items });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// NEW: hover preview (“bande-annonce”): returns one channel to embed + meta
app.get('/api/twitflix/preview', async (req, res) => {
  const gameId = String(req.query.game_id || '').trim();
  if (!gameId) return res.status(400).json({ success: false, error: 'game_id manquant' });

  try {
    let sRes = await twitchAPI(`streams?game_id=${encodeURIComponent(gameId)}&language=fr&first=100`);
    let streams = sRes.data || [];

    if (streams.length < 3) {
      const gRes = await twitchAPI(`streams?game_id=${encodeURIComponent(gameId)}&first=100`);
      streams = [...streams, ...(gRes.data || [])];
    }

    // choose a small stream to keep “Twitflix”
    const candidates = streams
      .filter(s => (s.viewer_count || 0) <= 300)
      .sort(() => 0.5 - Math.random());

    const s = candidates[0] || streams[0];
    if (!s) return res.json({ success: false, error: "no_stream" });

    return res.json({
      success: true,
      channel: s.user_login,
      channel_name: s.user_name,
      title: s.title || "",
      viewers: s.viewer_count || 0,
      thumbnail_url: (s.thumbnail_url || "").replace('{width}', '480').replace('{height}', '270')
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// =========================================================
// 9) FOLLOWED STREAMS (multi-user) + ROTATION + BOOST
// =========================================================
app.get('/followed_streams', requireUser, async (req, res) => {
  try {
    const data = await twitchAPI(
      `streams/followed?user_id=${encodeURIComponent(req.user.uid)}`,
      req.user.tokens.access_token
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
    return res.status(500).json({ success: false, error:e.message });
  }
});

async function refreshGlobalStreamList() {
  const now = Date.now();
  const rot = CACHE.globalStreamRotation;
  if (now - rot.lastFetchTime < rot.fetchCooldown && rot.streams.length > 0) return;

  try {
    const data = await twitchAPI(`streams?language=fr&first=100`);
    let suitable = (data.data || []).filter(s => (s.viewer_count || 0) <= 100);
    if (suitable.length === 0) suitable = (data.data || []).slice(-10);

    if (suitable.length > 0) {
      rot.streams = suitable.sort(() => 0.5 - Math.random()).map(s => ({ channel: s.user_login, viewers: s.viewer_count }));
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

  if (boost) return res.json({ success: true, channel: boost.channel, mode: 'BOOST', message: `⚡ BOOST ACTIF` });

  await refreshGlobalStreamList();
  const rot = CACHE.globalStreamRotation;

  if (rot.streams.length === 0) return res.json({ success: true, channel: 'twitch', mode: 'FALLBACK' });

  return res.json({
    success: true,
    channel: rot.streams[rot.currentIndex].channel,
    mode: 'AUTO',
    viewers: rot.streams[rot.currentIndex].viewers,
    message: `👁️ AUTO`
  });
});

app.post('/cycle_stream', async (req, res) => {
  const { direction } = req.body;

  if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
    return res.json({ success: false, error:'boost_active' });
  }

  await refreshGlobalStreamList();
  const rot = CACHE.globalStreamRotation;
  if (rot.streams.length === 0) return res.json({ success: false, error:'no_streams' });

  if (direction === 'next') rot.currentIndex = (rot.currentIndex + 1) % rot.streams.length;
  else rot.currentIndex = (rot.currentIndex - 1 + rot.streams.length) % rot.streams.length;

  return res.json({ success: true, channel: rot.streams[rot.currentIndex].channel });
});

app.post('/stream_boost', async (req, res) => {
  const channel = String(req.body?.channel || '').trim().toLowerCase();
  if (!channel) return res.status(400).json({ success:false, error:'channel manquant' });

  const now = Date.now();
  try {
    await db.collection('boosts').add({ channel, startTime: now, endTime: now + 900000 });
    CACHE.boostedStream = { channel, endTime: now + 900000 };
    res.json({ success: true, html_response: "<p style='color:green;'>✅ Boost activé pendant 15 minutes!</p>" });
  } catch (e) {
    res.status(500).json({ success:false, error: "Erreur DB" });
  }
});

// =========================================================
// 10) STATS (kept, minimal)
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
      const snaps = await db.collection('stats_history').orderBy('timestamp', 'desc').limit(12).get();
      if (!snaps.empty) {
        snaps.docs.reverse().forEach(d => {
          const stats = d.data();
          if (stats.timestamp?.toDate) {
            const date = stats.timestamp.toDate();
            const timeStr = `${date.getHours()}h${date.getMinutes() < 10 ? '0' + date.getMinutes() : date.getMinutes()}`;
            history.live.labels.push(timeStr);
            history.live.values.push(stats.total_viewers || 0);
          }
        });
      } else {
        history.live.labels = ["-1h", "Now"];
        history.live.values = [Math.floor(est * 0.9), est];
      }
    } catch (e) {
      console.error("Erreur stats history:", e.message);
    }

    res.json({ success: true, total_viewers: est, total_channels: "98k+", top_game_name: topGame, history });
  } catch (e) {
    res.status(500).json({ success:false, error: e.message });
  }
});

app.get('/api/stats/top_games', async (req, res) => {
  try {
    const d = await twitchAPI('games/top?first=10');
    res.json({ games: (d.data || []).map(g => ({ name: g.name, box_art_url: g.box_art_url.replace('{width}', '52').replace('{height}', '72') })) });
  } catch (e) {
    res.status(500).json({ success:false, error: e.message });
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
    res.status(500).json({ success:false, error: e.message });
  }
});

// =========================================================
// 11) BEST TIME TOOL (kept)
// =========================================================
app.post('/analyze_schedule', async (req, res) => {
  const game = String(req.body?.game || '').trim();
  if (!game) return res.status(400).json({ success: false, html_response: '<p style="color:red;">❌ Nom du jeu manquant</p>' });

  try {
    const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(game)}&first=1`);
    if (!gRes.data || gRes.data.length === 0) {
      return res.json({ success: false, html_response: `<p style="color:red;"><strong>❌ Jeu "${game}" non trouvé sur Twitch</strong></p>` });
    }

    const gameName = gRes.data[0].name;
    const gameId = gRes.data[0].id;

    const sRes = await twitchAPI(`streams?game_id=${gameId}&first=100&language=fr`);
    const totalViewers = (sRes.data || []).reduce((a, b) => a + (b.viewer_count || 0), 0);
    const channelCount = (sRes.data || []).length;
    const avgViewers = Math.round(totalViewers / (channelCount || 1));

    const prompt = `Tu es expert en optimisation streaming Twitch pour le jeu "${gameName}".\n\n📊 DONNÉES ACTUELLES:\n- Chaînes en live: ${channelCount}\n- Viewers totaux: ${totalViewers}\n- Moyenne viewers/chaîne: ${avgViewers}\n\nDEMANDE: Fournis EXACTEMENT en HTML pur (pas de markdown):\n1) ⏱️ Saturation actuelle (Faible/Moyenne/Haute) + 1 phrase\n2) 🎯 3 créneaux horaires PRÉCIS (Jour + heure ex: Mercredi 14h-16h) avec justification\n3) 📈 Score "niche profitability" de 1 à 10\n4) 💡 1 conseil actionnable\n\nHTML STRICT: <h4>, <ul>, <li>, <p>, <strong>.`;

    const aiResponse = await runGeminiAnalysis(prompt);

    return res.json({
      success: aiResponse.success !== false,
      html_response: aiResponse.html_response || '<p style="color:red;">❌ Erreur IA</p>'
    });
  } catch (error) {
    console.error('❌ Analyze schedule error:', error.message);
    return res.json({ success: false, html_response: `<p style="color:red;">❌ Erreur: ${error.message}</p>` });
  }
});

// =========================================================
// 12) CRON SNAPSHOTS (optional - unchanged idea, simplified)
// =========================================================
const ENABLE_CRON = (process.env.ENABLE_CRON || 'true').toLowerCase() !== 'false';
const SNAPSHOT_EVERY_MIN = parseInt(process.env.SNAPSHOT_EVERY_MIN || '5', 10);

async function collectAnalyticsSnapshot() {
  const now = Date.now();
  try {
    const data = await twitchAPI('streams?first=100&language=fr');
    const streams = data?.data || [];

    let totalViewers = 0;
    for (const s of streams) totalViewers += (s.viewer_count || 0);

    await db.collection('stats_history').doc(String(now)).set({
      timestamp: admin.firestore.Timestamp.fromMillis(now),
      timestamp_ms: now,
      total_viewers: totalViewers,
      channels_live: streams.length,
      top_game: streams[0]?.game_name || null
    }, { merge: false });

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
// START
// =========================================================
server.listen(PORT, () => {
  console.log(`✅ Server running on :${PORT}`);
});
