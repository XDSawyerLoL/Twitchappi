/**
 * STREAMER & NICHE AI HUB - BACKEND (ULTIMATE AUDIO + INFINITE SCROLL)
 * =========================================================
 * Updates:
 * - /api/categories/top : Supporte pagination (cursor) + fetch 100 items
 * - Chat force dark mode param check
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
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const MemoryStore = require('memorystore')(session);
const http = require('http');
const { Server } = require('socket.io');
const openid = require('openid');

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
  if (serviceAccount) {
    db.settings({ projectId: serviceAccount.project_id, ignoreUndefinedProperties: true });
  } else {
    db.settings({ ignoreUndefinedProperties: true });
  }
} catch (e) {}


// =========================================================
// 0.B HUB CHAT PERSISTENCE + GIF PROXY (SAFE)
// =========================================================
const CHAT_COLLECTION = 'hub_messages';
const USER_COLLECTION = 'hub_users';
const MAX_INMEM_HISTORY = 200;

let firestoreOk = true;
try { db.collection('_ping').limit(1); } catch (e) { firestoreOk = false; }

const inMemHistory = []; // fallback if firestore not available

function sanitizeText(s, max=500){
  return String(s || '').replace(/\s+/g,' ').trim().slice(0, max);
}
function sanitizeName(s, max=40){
  return String(s || 'Anon').replace(/[\r\n\t]/g,' ').trim().slice(0, max) || 'Anon';
}
function isValidHttpUrl(u){
  try{
    const url = new URL(u);
    return url.protocol === 'http:' || url.protocol === 'https:';
  }catch(_){ return false; }
}
function makeId(){
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,10);
}

async function loadRecentMessages(limit=50){
  if (firestoreOk){
    try{
      const snap = await db.collection(CHAT_COLLECTION).orderBy('ts','desc').limit(limit).get();
      const out = [];
      snap.forEach(doc => out.push(doc.data()));
      return out.reverse();
    }catch(e){
      console.warn('⚠️ [CHAT] Firestore load failed, fallback memory:', e.message);
      firestoreOk = false;
      return inMemHistory.slice(-limit);
    }
  }
  return inMemHistory.slice(-limit);
}

async function saveMessage(msg){
  // msg: {id,user,text,gif,ts,reactions}
  if (firestoreOk){
    try{
      await db.collection(CHAT_COLLECTION).doc(msg.id).set(msg, { merge: true });
      return;
    }catch(e){
      console.warn('⚠️ [CHAT] Firestore save failed, fallback memory:', e.message);
      firestoreOk = false;
    }
  }
  inMemHistory.push(msg);
  if (inMemHistory.length > MAX_INMEM_HISTORY) inMemHistory.splice(0, inMemHistory.length - MAX_INMEM_HISTORY);
}

async function addXP(user, delta){
  if (!firestoreOk) return { xp: 0, grade: 'NEWCOMER' };
  try{
    const ref = db.collection(USER_COLLECTION).doc(user.toLowerCase());
    const snap = await ref.get();
    const cur = snap.exists ? snap.data() : { xp: 0 };
    const xp = Math.max(0, (cur.xp || 0) + delta);
    const grade =
      xp >= 2000 ? 'LEGEND' :
      xp >= 900  ? 'CATALYST' :
      xp >= 350  ? 'STRATEGIST' :
      xp >= 120  ? 'CURATOR' : 'NEWCOMER';
    await ref.set({ xp, grade, updatedAt: Date.now(), name: user }, { merge: true });
    return { xp, grade };
  }catch(e){
    console.warn('⚠️ [CHAT] XP update failed:', e.message);
    return { xp: 0, grade: 'NEWCOMER' };
  }
}

// =========================================================
// 1. CONFIGURATION
// =========================================================
const app = express();
app.set('trust proxy', 1);

// Helmet: iframe-safe (NE BLOQUE PAS Fourthwall/iframe)
// Helmet: iframe-safe + CSP option (enable with CSP_ENABLED=true)
const CSP_ENABLED = (process.env.CSP_ENABLED || 'false').toLowerCase() === 'true';

app.use(helmet({
  crossOriginEmbedderPolicy: false,
  frameguard: false,
  // In dev we keep CSP off to avoid blocking CDNs; in prod enable via env.
  contentSecurityPolicy: CSP_ENABLED ? {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'", "*"], // allow embedding your UI in iframes if needed
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      mediaSrc: ["'self'", "https:", "blob:"],
      fontSrc: ["'self'", "https:", "data:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https:"],
      connectSrc: ["'self'", "https:", "wss:", "ws:"],
      frameSrc: ["'self'", "https://player.twitch.tv", "https://www.twitch.tv", "https://embed.twitch.tv", "https://www.youtube.com", "https://www.youtube-nocookie.com", "https://www.youtube.com/embed", "https://www.youtube-nocookie.com/embed"],
    }
  } : false
}));


// =========================================================
// 1.b REQUEST ID + LOGS STRUCTURÉS (SOCLE A)
// =========================================================
app.use((req, res, next) => {
  try{
    const rid = (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(12).toString('hex'));
    req.__rid = rid;
    res.setHeader('X-Request-Id', rid);
    const t0 = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - t0;
      const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
      console.log(JSON.stringify({
        t: new Date().toISOString(),
        rid,
        m: req.method,
        p: req.originalUrl,
        s: res.statusCode,
        ms,
        ip
      }));
    });
  }catch(_){}
  next();
});

// Rate limit par défaut sur /api (évite spam)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api', apiLimiter);

// Limites plus strictes pour routes coûteuses (YouTube/Twitch search)
const heavyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false
});


const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const STEAM_API_KEY = process.env.STEAM_API_KEY;

let aiClient = null;
if (GEMINI_API_KEY) {
  try {
    aiClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    console.log("✅ [IA] Gemini prêt.");
  } catch (e) {
    console.error("❌ [IA] init error:", e.message);
  }
}

// CORS: multi-domain (set CORS_ORIGINS="https://prod.com,https://staging.com")
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean);
app.use(cors({
  origin: function(origin, cb){
    if(!origin) return cb(null, true);
    if(!CORS_ORIGINS.length) return cb(null, true); // default: allow all (previous behavior)
    return cb(null, CORS_ORIGINS.includes(origin));
  },
  credentials: true
}));
app.use(bodyParser.json({ limit: '2mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

// Sessions (memorystore) — supprime le warning MemoryStore
if (!process.env.SESSION_SECRET) {
  console.warn('⚠️ SESSION_SECRET manquant (OBLIGATOIRE en prod)');
}
const sessionMiddleware = session({
  name: 'streamerhub.sid',
  store: new MemoryStore({ checkPeriod: 24 * 60 * 60 * 1000 }),
  secret: process.env.SESSION_SECRET || 'dev_secret_change_me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    // If your UI is on a different domain (e.g. justplayer.fr) than the API (onrender.com),
    // you NEED SameSite=None + Secure for the session cookie to be sent.
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production',
  }
});

app.use(sessionMiddleware);

// =========================================================
// 1B. STEAM OPENID (no manual SteamID64)
// =========================================================
const STEAM_PROVIDER = 'https://steamcommunity.com/openid';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || ''; // ex: https://justplayer.onrender.com
function getBaseUrl(req){
  // trust proxy enabled: req.protocol honors X-Forwarded-Proto on Render/Cloudflare
  const fromReq = `${req.protocol}://${req.get('host')}`;
  return PUBLIC_BASE_URL || fromReq;
}
function safeNext(next){
  const s = String(next || '').trim();
  // Only allow relative paths to avoid open redirects
  if (!s || !s.startsWith('/')) return '/';
  return s;
}
function steamRelyingParty(req){
  const baseUrl = getBaseUrl(req);
  const returnUrl = `${baseUrl}/auth/steam/return`;
  const realm = baseUrl;
  // stateless = true, strict = true. We rely on express-session for state anyway.
  return new openid.RelyingParty(returnUrl, realm, true, true, []);
}
async function steamFetchPlayerSummary(steamid){
  if(!STEAM_API_KEY) return null;
  try{
    const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(STEAM_API_KEY)}&steamids=${encodeURIComponent(steamid)}`;
    const r = await fetch(url);
    const d = await r.json();
    const p = d?.response?.players?.[0];
    if(!p) return null;
    return {
      steamid: p.steamid,
      personaname: p.personaname || null,
      avatar: p.avatar || null,
      avatarmedium: p.avatarmedium || null,
      avatarfull: p.avatarfull || null,
      profileurl: p.profileurl || null,
      communityvisibilitystate: p.communityvisibilitystate || null,
      lastlogoff: p.lastlogoff || null
    };
  }catch(_){ return null; }
}
async function verifyFirebaseIdTokenFromReq(req){
  const auth = String(req.headers.authorization || '').trim();
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : (req.body?.idToken ? String(req.body.idToken).trim() : '');
  if(!token) return null;
  try{
    return await admin.auth().verifyIdToken(token);
  }catch(e){
    return null;
  }
}

// Start Steam auth (use popup or full redirect)
app.get('/auth/steam', async (req, res) => {
  try{
    const next = safeNext(req.query.next);
    req.session.steamNext = next;

    const rp = steamRelyingParty(req);
    rp.authenticate(STEAM_PROVIDER, false, (err, authUrl) => {
      if (err || !authUrl) {
        return res.status(500).send('Steam auth init failed');
      }
      return res.redirect(authUrl);
    });
  }catch(e){
    return res.status(500).send('Steam auth init failed');
  }
});

// Steam callback
app.get('/auth/steam/return', async (req, res) => {
  const next = safeNext(req.session?.steamNext);
  const rp = steamRelyingParty(req);
  rp.verifyAssertion(req, async (err, result) => {
    try{
      if (err || !result?.authenticated) {
        return res.redirect(`/steam/connected?ok=0&next=${encodeURIComponent(next)}`);
      }
      const claimed = String(result.claimedIdentifier || '');
      const m = claimed.match(/steamcommunity\.com\/openid\/id\/(\d+)/i);
      const steamid = m ? m[1] : '';
      if(!steamid){
        return res.redirect(`/steam/connected?ok=0&next=${encodeURIComponent(next)}`);
      }

      const profile = await steamFetchPlayerSummary(steamid);

      req.session.steam = {
        steamid,
        profile: profile || null,
        linkedAt: Date.now()
      };

      // If the user is also connected via Twitch on this session, persist Steam on their Billing doc.
      // This avoids relying on Firebase Auth on the frontend and makes Steam "permanent".
      try{
        const tu = req.session?.twitchUser;
        if(tu) await setBillingSteam(tu, req.session.steam);
      }catch(_){ }

      // Optional: if front sends Firebase idToken later, we can persist the link.
      return res.redirect(`/steam/connected?ok=1&next=${encodeURIComponent(next)}`);
    }catch(_){
      return res.redirect(`/steam/connected?ok=0&next=${encodeURIComponent(next)}`);
    }
  });
});

// Tiny page to close popup + notify opener
app.get('/steam/connected', (req, res) => {
  const ok = String(req.query.ok || '0') === '1';
  const next = safeNext(req.query.next);
  const steamid = req.session?.steam?.steamid || '';
  const payload = JSON.stringify({ type: 'steam:connected', ok, steamid });
  res.setHeader('content-type','text/html; charset=utf-8');
  return res.send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Steam</title></head>
<body style="font-family:system-ui;background:#0b0c10;color:#e5e7eb;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
  <div style="max-width:520px;padding:20px;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:rgba(255,255,255,.04)">
    <h2 style="margin:0 0 10px 0">${ok ? 'Steam connecté ✅' : 'Steam: échec ❌'}</h2>
    <p style="margin:0 0 12px 0;opacity:.85">${ok ? 'Tu peux revenir à TwitFlix.' : 'Réessaie la connexion Steam.'}</p>
    <a href="${next}" style="color:#00e5ff">Retour</a>
  </div>
  <script>
    (function(){
      try{
        if(window.opener && !window.opener.closed){
          window.opener.postMessage(${payload}, '*');
          window.close();
        }
      }catch(e){}
      // fallback: redirect after 1.2s
      setTimeout(function(){ try{ location.href = ${JSON.stringify(next)}; }catch(e){} }, 1200);
    })();
  </script>
</body></html>`);
});

// Session info (used by TwitFlix)
app.get('/api/steam/me', async (req, res) => {
  const s = req.session?.steam;
  if(s?.steamid){
    return res.json({ success:true, connected:true, steamid: s.steamid, profile: s.profile || null, linkedAt: s.linkedAt || null, source: 'session' });
  }

  // Fallback: if user is connected via Twitch, read persisted Steam link from billing_users/{twitchUserId}
  try{
    const tu = req.session?.twitchUser;
    if(!tu) return res.json({ success:true, connected:false });
    const b = await getBillingDoc(tu);
    if(b?.steam?.steamid){
      return res.json({ success:true, connected:true, steamid: b.steam.steamid, profile: b.steam.profile || null, linkedAt: b.steam.linkedAt || null, source: 'billing' });
    }
  }catch(_){ }

  return res.json({ success:true, connected:false });
});

// Persist Steam link to Firestore for the currently logged-in Firebase user
app.post('/api/steam/link', async (req, res) => {
  try{
    const s = req.session?.steam;
    if(!s?.steamid) return res.status(400).json({ success:false, error:'Steam non connecté (session)' });

    const decoded = await verifyFirebaseIdTokenFromReq(req);
    if(!decoded?.uid) return res.status(401).json({ success:false, error:'Auth Firebase requise' });

    await db.collection('users').doc(decoded.uid).set({
      steam: {
        steamid: s.steamid,
        profile: s.profile || null,
        linkedAt: admin.firestore.Timestamp.fromMillis(s.linkedAt || Date.now()),
        updatedAt: admin.firestore.Timestamp.fromMillis(Date.now())
      }
    }, { merge: true });

    return res.json({ success:true });
  }catch(e){
    return res.status(500).json({ success:false, error:e.message });
  }
});

app.post('/api/steam/logout', (req, res) => {
  try{
    if(req.session) req.session.steam = null;
  }catch(_){}
  return res.json({ success:true });
});

// Remove the persisted Steam link for the current Twitch user
app.post('/api/steam/unlink', async (req, res) => {
  try{
    const tu = requireTwitchSession(req, res);
    if(!tu) return;
    await setBillingSteam(tu, null);
    if(req.session) req.session.steam = null;
    return res.json({ success:true });
  }catch(e){
    return res.status(500).json({ success:false, error:e.message });
  }
});



// Static assets (kept simple: UI + /assets folder)
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use(express.static(path.join(__dirname)));

// Page principale (UI)
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

// Pricing page (credits + premium)
app.get('/pricing', (req, res) => {
  const f = path.join(__dirname, 'pricing.html');
  if (!fs.existsSync(f)) return res.status(404).send('Pricing introuvable.');
  return res.sendFile(f);
});

// =========================================================
// 2. CACHE & HELPERS
// =========================================================
const CACHE = {
  twitchTokens: {},
  boostedStream: null,
  lastScanData: null,
  globalStreamRotation: {
    streams: [],
    currentIndex: 0,
    lastFetchTime: 0,
    fetchCooldown: 3 * 60 * 1000
  }
};


// YouTube trailer cache (reduces quota + stabilizes TwitFlix trailer search)
const YT_TRAILER_CACHE = new Map();
// VOD cache: keep short-lived lists per (game_id|lang|maxViews) to make "Lecture" instant.
const TWIFLIX_VOD_CACHE = new Map();
const YT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;


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
// =========================================================
// ORYON TV — VODs by title (FR streamers 20-200 viewers)
// =========================================================
const __oryonVodSearchCache = new Map(); // key -> {ts, items}
// Ultra-fast: Twiflix "play" cache (game_id -> eligible vod ids)
const __twiflixPlayCache = new Map(); // key -> {ts, vods:[{id, thumbnail_url, title, url, view_count, user_name, user_login}]}

function __oryonCacheGet(map, key, ttlMs){
  const v = map.get(key);
  if(!v) return null;
  if((Date.now()-v.ts) > ttlMs) { map.delete(key); return null; }
  return v.items;
}
function __oryonCacheSet(map, key, items){
  map.set(key, { ts: Date.now(), items });
}

function __twiflixCacheGet(key, ttlMs){
  const v = __twiflixPlayCache.get(key);
  if(!v) return null;
  if((Date.now()-v.ts) > ttlMs) { __twiflixPlayCache.delete(key); return null; }
  return v.vods;
}
function __twiflixCacheSet(key, vods){
  __twiflixPlayCache.set(key, { ts: Date.now(), vods });
}

// =========================================================
// ORYON TV — Twiflix: play one random VOD for a game (ULTRA RAPIDE)
// GET /api/twiflix/play?game_id=...&lang=fr&maxViews=800
// Returns: { ok:true, vod_id, url, title, thumbnail_url }
// =========================================================
app.get('/api/twiflix/play', async (req, res) => {
  try{
    const game_id = String(req.query.game_id || '').trim();
    const lang = String(req.query.lang || 'fr').trim().toLowerCase();
    const maxViews = Math.max(10, parseInt(req.query.maxViews || '800', 10) || 800);
    const cacheKey = `${game_id}:${lang}:${maxViews}`;

    if(!game_id) return res.json({ ok:false, reason:'missing_game_id' });

    // 5 minutes cache of eligible VODs for this game
    let vods = __twiflixCacheGet(cacheKey, 5 * 60 * 1000);
    if(!vods){
      const token = await getTwitchToken('app');
      if(!token) return res.json({ ok:false, reason:'missing_app_token' });

      // One single Helix call for speed (first=50). Filter client-side.
      const data = await twitchAPI(`videos?game_id=${encodeURIComponent(game_id)}&first=50&type=archive`, token);
      const rows = data?.data || [];
      vods = rows
        .filter(v => {
          const vc = v.view_count || 0;
          // Best-effort language: prefer FR; allow unknown.
          const vlang = String(v.language || '').toLowerCase();
          if(lang && vlang && vlang !== lang) return false;
          if(vc > maxViews) return false;
          // Exclude very short clips / anomalies
          if(!v.duration || String(v.duration).length < 2) return false;
          return true;
        })
        .map(v => ({
          id: v.id,
          url: v.url,
          title: v.title,
          thumbnail_url: v.thumbnail_url,
          view_count: v.view_count,
          user_name: v.user_name,
          user_login: v.user_login,
        }));

      // If too strict (no FR), relax language filter once
      if(!vods.length && lang){
        vods = rows
          .filter(v => (v.view_count || 0) <= maxViews)
          .map(v => ({
            id: v.id,
            url: v.url,
            title: v.title,
            thumbnail_url: v.thumbnail_url,
            view_count: v.view_count,
            user_name: v.user_name,
            user_login: v.user_login,
          }));
      }

      __twiflixCacheSet(cacheKey, vods);
    }

    if(!vods || !vods.length) return res.json({ ok:false, reason:'no_vods' });
	    // Warm-cache call: do not select a VOD, just report availability.
	    if(String(req.query.dry || '') === '1'){
	      return res.json({ ok:true, warmed:true, count: vods.length });
	    }
    const pick = vods[Math.floor(Math.random() * vods.length)];
    return res.json({ ok:true, vod_id: pick.id, url: pick.url, title: pick.title, thumbnail_url: pick.thumbnail_url });
  }catch(e){
    return res.json({ ok:false, reason:'error', message: String(e?.message || e) });
  }
});

// =========================================================
// GET /api/twiflix/episodes?game_id=...&lang=fr&maxViewers=200&limit=10
// Returns a Netflix-like "episodes" list: small FR streamers currently live on this game.
// =========================================================
app.get('/api/twiflix/episodes', async (req, res) => {
  try{
    const game_id = String(req.query.game_id || '').trim();
    const game_name = String(req.query.game_name || '').trim();
    const lang = String(req.query.lang || 'fr').trim().toLowerCase();
    const maxViewers = Math.max(5, parseInt(req.query.maxViewers || '200', 10) || 200);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit || '10', 10) || 10), 20);
    if(!game_id) return res.json({ success:false, items:[], reason:'missing_game_id' });

    const cacheKey = `eps:${game_id}:${lang}:${maxViewers}:${limit}`;
    const cached = __twiflixCacheGet(cacheKey, 60_000);
    if(cached) return res.json({ success:true, items:cached, cached:true });

    const token = await getTwitchToken('app');
    if(!token) return res.json({ success:false, items:[], reason:'missing_app_token' });

    // Find small FR streams for this game.
    const qs = new URLSearchParams();
    qs.set('game_id', game_id);
    qs.set('first','100');
    if(lang) qs.set('language', lang);
    const data = await twitchAPI(`streams?${qs.toString()}`, token);
    const rows = (data?.data || []).filter(s => (s.viewer_count||0) <= maxViewers);

    // Unique users
    const seen = new Set();
    const picks = [];
    for(const s of rows){
      if(seen.has(s.user_id)) continue;
      seen.add(s.user_id);
      picks.push({
        user_id: s.user_id,
        login: s.user_login,
        display_name: s.user_name,
        viewer_count: s.viewer_count||0,
        title: s.title||'',
        thumbnail_url: s.thumbnail_url||''
      });
      if(picks.length >= limit) break;
    }

    if(!picks.length){
      __twiflixCacheSet(cacheKey, []);
      return res.json({ success:true, items:[], reason:'no_streams' });
    }

    // Enrich with user description + profile image.
    const ids = picks.map(p=>p.user_id).join('&id=');
    const users = await twitchAPI(`users?id=${ids}`, token);
    const umap = new Map();
    for(const u of (users?.data||[])) umap.set(u.id, u);
    const out = picks.map(p => {
      const u = umap.get(p.user_id);
      return {
        login: p.login,
        display_name: p.display_name,
        viewer_count: p.viewer_count,
        description: u?.description || '',
        profile_image_url: u?.profile_image_url || '',
        thumbnail_url: p.thumbnail_url,
        game_name: game_name || ''
      };
    });

    __twiflixCacheSet(cacheKey, out);
    return res.json({ success:true, items: out });
  }catch(e){
    return res.json({ success:false, items:[], reason:'error', message:String(e?.message||e) });
  }
});

async function twitchGetUserIdByLogin(login, token){
  const d = await twitchAPI(`users?login=${encodeURIComponent(login)}`, token);
  return d?.data?.[0]?.id || null;
}

// Random VODs (used by UI rows)
app.get('/api/twitch/vods/random', heavyLimiter, async (req, res) => {
  try{
    const min = Math.max(0, parseInt(req.query.min || '20', 10) || 20);
    const max = Math.max(min+1, parseInt(req.query.max || '200', 10) || 200);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit || '18', 10) || 18), 30);
    const lang = String(req.query.lang || 'fr').trim().toLowerCase();
    const key = `rnd:${min}:${max}:${limit}:${lang}`;
    const cached = __oryonCacheGet(__oryonVodSearchCache, key, 60_000);
    if(cached) return res.json({ success:true, items:cached, cached:true });

    const token = await getTwitchToken('app');
    if(!token) return res.json({ success:true, items:[], reason:'missing_app_token' });

    // collect candidates
    let cursor = '';
    const candidates = [];
    for(let page=0; page<12 && candidates.length < 1200; page++){
      const qs = new URLSearchParams();
      qs.set('first','100');
      if(cursor) qs.set('after', cursor);
      if(lang) qs.set('language', lang);
      const data = await twitchAPI(`streams?${qs.toString()}`, token);
      const rows = data?.data || [];
      cursor = data?.pagination?.cursor || '';
      for(const s of rows){
        const vc = s.viewer_count || 0;
        if(vc>=min && vc<=max){
          candidates.push({ user_id:s.user_id, user_login:s.user_login, user_name:s.user_name, game_name:s.game_name, viewer_count:vc });
        }
      }
      if(!cursor) break;
    }
    if(!candidates.length) return res.json({ success:true, items:[], reason:'no_candidates_in_range' });

    // shuffle
    for(let i=candidates.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [candidates[i],candidates[j]]=[candidates[j],candidates[i]];
    }

    const items=[];
    const attempts = Math.min(800, candidates.length);
    for(let i=0;i<attempts && items.length<limit;i++){
      const s=candidates[i];
      try{
        let v = await twitchAPI(`videos?user_id=${encodeURIComponent(s.user_id)}&first=1&type=archive`, token);
        let row = (v?.data||[])[0];
        if(!row){
          v = await twitchAPI(`videos?user_id=${encodeURIComponent(s.user_id)}&first=1&type=highlight`, token);
          row = (v?.data||[])[0];
        }
        if(!row) continue;
        items.push({
          id: row.id, title: row.title, url: row.url, thumbnail_url: row.thumbnail_url,
          duration: row.duration, view_count: row.view_count, created_at: row.created_at, vod_type: row.type,
          user_name: s.user_name, user_login: s.user_login, game_name: s.game_name, live_viewers: s.viewer_count,
          platform:'twitch'
        });
      }catch(_){}
    }
    __oryonCacheSet(__oryonVodSearchCache, key, items);
    return res.json({ success:true, items, candidates:candidates.length });
  }catch(e){
    console.warn('⚠️ /api/twitch/vods/random', e.message);
    return res.json({ success:true, items:[], reason:'server_error', error:e.message });
  }
});

// Search VODs by title among FR live streamers in viewer range
app.get('/api/twitch/vods/search', heavyLimiter, async (req, res) => {
  try{
    const title = String(req.query.title || req.query.q || '').trim();
    const min = Math.max(0, parseInt(req.query.min || '20', 10) || 20);
    const max = Math.max(min+1, parseInt(req.query.max || '200', 10) || 200);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit || '18', 10) || 18), 30);
    const lang = String(req.query.lang || 'fr').trim().toLowerCase();

    if(!title || title.length < 2){
      return res.json({ success:true, items:[], reason:'missing_title' });
    }

    const key = `q:${title.toLowerCase()}:${min}:${max}:${limit}:${lang}`;
    const cached = __oryonCacheGet(__oryonVodSearchCache, key, 45_000);
    if(cached) return res.json({ success:true, items:cached, cached:true });

    const token = await getTwitchToken('app');
    if(!token) return res.json({ success:true, items:[], reason:'missing_app_token' });

    // gather candidates
    let cursor = '';
    const candidates = [];
    for(let page=0; page<14 && candidates.length < 1400; page++){
      const qs = new URLSearchParams();
      qs.set('first','100');
      if(cursor) qs.set('after', cursor);
      if(lang) qs.set('language', lang);
      const data = await twitchAPI(`streams?${qs.toString()}`, token);
      const rows = data?.data || [];
      cursor = data?.pagination?.cursor || '';
      for(const s of rows){
        const vc = s.viewer_count || 0;
        if(vc>=min && vc<=max){
          candidates.push({ user_id:s.user_id, user_login:s.user_login, user_name:s.user_name, game_name:s.game_name, viewer_count:vc });
        }
      }
      if(!cursor) break;
    }
    if(!candidates.length) return res.json({ success:true, items:[], reason:'no_candidates_in_range' });

    // shuffle to keep "randomness"
    for(let i=candidates.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [candidates[i],candidates[j]]=[candidates[j],candidates[i]];
    }

    const low = title.toLowerCase();
    const items = [];
    const attempts = Math.min(900, candidates.length);

    for(let i=0; i<attempts && items.length < limit; i++){
      const s = candidates[i];
      try{
        // fetch up to 5 recent videos, search in their title
        const v = await twitchAPI(`videos?user_id=${encodeURIComponent(s.user_id)}&first=5&type=archive`, token);
        const vids = v?.data || [];
        for(const row of vids){
          if(items.length >= limit) break;
          const t = String(row.title||'').toLowerCase();
          if(!t.includes(low)) continue;
          items.push({
            id: row.id, title: row.title, url: row.url, thumbnail_url: row.thumbnail_url,
            duration: row.duration, view_count: row.view_count, created_at: row.created_at, vod_type: row.type,
            user_name: s.user_name, user_login: s.user_login, game_name: s.game_name, live_viewers: s.viewer_count,
            platform:'twitch'
          });
        }
      }catch(_){}
    }

    __oryonCacheSet(__oryonVodSearchCache, key, items);
    return res.json({ success:true, items, candidates:candidates.length });
  }catch(e){
    console.warn('⚠️ /api/twitch/vods/search', e.message);
    return res.json({ success:true, items:[], reason:'server_error', error:e.message });
  }
});


// =========================================================
// ORYON TV — VODs by game (used by TwitFlix drawer: LIVE/VOD/PREVIEW)
// =========================================================
app.get('/api/twitch/vods/by-game', heavyLimiter, async (req, res) => {
  try{
    const gameIdIn = String(req.query.game_id || '').trim();
    const gameNameIn = String(req.query.game_name || req.query.q || '').trim();
    // Allow larger lists for UI carousels/modals
    const limit = Math.min(Math.max(1, parseInt(req.query.limit || '24', 10) || 24), 80);
    const days = Math.min(Math.max(1, parseInt(req.query.days || '60', 10) || 60), 180);
    const lang = String(req.query.lang || '').trim().toLowerCase();
    const small = String(req.query.small || '').trim() === '1' || String(req.query.small || '').trim().toLowerCase() === 'true';
    const maxViews = Math.min(Math.max(0, parseInt(req.query.maxViews || (small ? '200000' : '0'), 10) || 0), 5_000_000);

    const token = await getTwitchToken('app');
    if(!token) return res.json({ success:true, items:[], reason:'missing_app_token' });

    let gameId = gameIdIn;
    if(!gameId){
      if(!gameNameIn) return res.json({ success:true, items:[], reason:'missing_game' });
      const s = await twitchAPI(`search/categories?query=${encodeURIComponent(gameNameIn)}&first=1`, token);
      gameId = s?.data?.[0]?.id || '';
      if(!gameId) return res.json({ success:true, items:[], reason:'game_not_found' });
    }

    const key = `bygame:${gameId}:${limit}:${days}:${lang}:${small ? 1 : 0}:${maxViews}`;
    const cached = __oryonCacheGet(__oryonVodSearchCache, key, 90_000);
    if(cached) return res.json({ success:true, items:cached, cached:true });

    // Pull more to allow filtering (lang/small/maxViews)
    const first = 50;
    const qs = new URLSearchParams();
    qs.set('game_id', gameId);
    qs.set('first', String(first));
    qs.set('type', 'archive');
    if(lang) qs.set('language', lang);
    // Helix videos supports sort/time and period, but keep defaults (relevance) and filter ourselves.
    const v = await twitchAPI(`videos?${qs.toString()}`, token);
    const rows = (v?.data || []).slice(0, first);

    const cutoff = Date.now() - (days * 24 * 36e5);
    let items = rows
      .filter(r => {
        const t = Date.parse(r.created_at || '') || 0;
        return !t || t >= cutoff;
      })
      .map(r => ({
        id: r.id,
        title: r.title,
        url: r.url,
        thumbnail_url: r.thumbnail_url,
        duration: r.duration,
        view_count: r.view_count,
        created_at: r.created_at,
        vod_type: r.type,
        user_id: r.user_id,
        user_name: r.user_name,
        game_id: r.game_id,
        game_name: r.game_name,
        language: r.language,
        platform: 'twitch'
      }));

    // Filters
    if(maxViews > 0) items = items.filter(it => (Number(it.view_count || 0) || 0) <= maxViews);
    if(small){
      const seen = new Set();
      items = items.filter(it => {
        const uid = String(it.user_id || '');
        if(!uid) return false;
        if(seen.has(uid)) return false;
        seen.add(uid);
        return true;
      });
    }

    items = items.slice(0, limit);
    __oryonCacheSet(__oryonVodSearchCache, key, items);
    return res.json({ success:true, items });
  }catch(e){
    console.warn('⚠️ /api/twitch/vods/by-game', e.message);
    return res.json({ success:true, items:[], reason:'server_error', error:e.message });
  }
});

// =========================================================
// ORYON TV — VOD by game seeded from small live streamers
// Goal: Netflix-like discovery for emerging creators (e.g. 20–200 viewers)
// Strategy: get current small streams for a game -> fetch 1–2 recent archives per channel
// =========================================================
app.get('/api/twitch/vods/by-game-small', heavyLimiter, async (req, res) => {
  try{
    const gameIdIn = String(req.query.game_id || '').trim();
    const gameNameIn = String(req.query.game_name || req.query.q || '').trim();
    const limit = Math.min(Math.max(1, parseInt(req.query.limit || '24', 10) || 24), 40);
    const days = Math.min(Math.max(1, parseInt(req.query.days || '60', 10) || 60), 180);
    const lang = String(req.query.lang || '').trim().toLowerCase();
    const minViewers = Math.max(0, parseInt(req.query.minViewers || '20', 10) || 0);
    const maxViewers = Math.max(0, parseInt(req.query.maxViewers || '200', 10) || 0);
    const maxViews = Math.max(0, parseInt(req.query.maxViews || '200000', 10) || 0);
    const perChannel = Math.min(Math.max(1, parseInt(req.query.perChannel || '2', 10) || 2), 3);

    const token = await getTwitchToken('app');
    if(!token) return res.json({ success:true, items:[], reason:'missing_app_token' });

    let gameId = gameIdIn;
    if(!gameId){
      if(!gameNameIn) return res.json({ success:true, items:[], reason:'missing_game' });
      const s = await twitchAPI(`search/categories?query=${encodeURIComponent(gameNameIn)}&first=1`, token);
      gameId = s?.data?.[0]?.id || '';
      if(!gameId) return res.json({ success:true, items:[], reason:'game_not_found' });
    }

    const key = `vodsmall:${gameId}:${limit}:${days}:${lang}:${minViewers}:${maxViewers}:${perChannel}`;
    const cached = __oryonCacheGet(__oryonVodSearchCache, key, 90_000);
    if(cached) return res.json({ success:true, items:cached, cached:true });

    // 1) Discover small creators via live streams for this game.
    // Paginate a bit to avoid "only 4 results" when FR is sparse.
    const streams = [];
    const fetchStreams = async (useLang) => {
      let after = '';
      for(let page=0; page<4; page++){
        const qs = new URLSearchParams();
        qs.set('game_id', gameId);
        qs.set('first', '100');
        if(useLang) qs.set('language', useLang);
        if(after) qs.set('after', after);
        const sres = await twitchAPI(`streams?${qs.toString()}`, token);
        const rows = (sres?.data || []).filter(s => {
          const v = Number(s?.viewer_count || 0);
          if (minViewers && v < minViewers) return false;
          if (maxViewers && v > maxViewers) return false;
          return true;
        });
        streams.push(...rows);
        after = sres?.pagination?.cursor || '';
        if(!after) break;
        // If we already have enough candidates, stop early
        if(streams.length >= 240) break;
      }
    };

    // Prefer lang (FR). If too few streams, fallback to any language.
    await fetchStreams(lang || '');
    if(lang && streams.length < 20){
      streams.length = 0;
      await fetchStreams('');
    }

    // Deduplicate channels, keep order (higher viewers first inside the band)
    const channelIds = [];
    const seen = new Set();
    for(const s of streams){
      const uid = String(s.user_id || '');
      if(!uid || seen.has(uid)) continue;
      seen.add(uid);
      channelIds.push(uid);
      if(channelIds.length >= 60) break; // cap work
    }

    const cutoff = Date.now() - (days * 24 * 36e5);
    const out = [];

    const normalizeThumb = (u) => {
      const s = String(u || '').trim();
      if (!s) return '';
      return s
        .replace(/%\{width\}/g, '640')
        .replace(/%\{height\}/g, '360');
    };

    // 2) fetch archives per channel (limited)
    for(const uid of channelIds){
      if(out.length >= limit) break;
      const vqs = new URLSearchParams();
      vqs.set('user_id', uid);
      vqs.set('first', String(perChannel));
      vqs.set('type', 'archive');
      if(lang) vqs.set('language', lang);
      const v = await twitchAPI(`videos?${vqs.toString()}`, token);
      let rows = (v?.data || []).slice(0, perChannel);
      // Keep only VODs actually matching the game (Twitch videos endpoint is per-user)
      rows = rows.filter(r => String(r?.game_id || '') === String(gameId));
      for(const r of rows){
        const t = Date.parse(r.created_at || '') || 0;
        if(t && t < cutoff) continue;
        const vc = Number(r.view_count || 0);
        if (maxViews && vc > maxViews) continue;
        out.push({
          id: r.id,
          title: r.title,
          url: r.url,
          thumbnail_url: normalizeThumb(r.thumbnail_url),
          duration: r.duration,
          view_count: vc,
          created_at: r.created_at,
          vod_type: r.type,
          user_id: r.user_id,
          user_name: r.user_name,
          game_id: r.game_id,
          game_name: r.game_name,
          language: r.language,
          platform: 'twitch'
        });
        if(out.length >= limit) break;
      }
    }

    // 3) Fallback: if we still have too few VODs (FR sparse), query videos directly by game.
    // This is much more reliable than "seed with small live channels" for some games.
    if (out.length < Math.min(8, limit)) {
      const seenVod = new Set(out.map(x => String(x.id)));
      const fetchByGame = async (useLang) => {
        let after = '';
        for (let page = 0; page < 3; page++) {
          if (out.length >= limit) break;
          const qs = new URLSearchParams();
          qs.set('game_id', gameId);
          qs.set('first', '100');
          qs.set('type', 'archive');
          if (useLang) qs.set('language', useLang);
          if (after) qs.set('after', after);
          const vres = await twitchAPI(`videos?${qs.toString()}`, token);
          const rows = (vres?.data || []);
          for (const r of rows) {
            if (out.length >= limit) break;
            const id = String(r?.id || '');
            if (!id || seenVod.has(id)) continue;
            const t = Date.parse(r.created_at || '') || 0;
            if (t && t < cutoff) continue;
            const vc = Number(r.view_count || 0);
            if (maxViews && vc > maxViews) continue;
            out.push({
              id: r.id,
              title: r.title,
              url: r.url,
              thumbnail_url: normalizeThumb(r.thumbnail_url),
              duration: r.duration,
              view_count: vc,
              created_at: r.created_at,
              vod_type: r.type,
              user_id: r.user_id,
              user_name: r.user_name,
              game_id: r.game_id,
              game_name: r.game_name,
              language: r.language,
              platform: 'twitch'
            });
            seenVod.add(id);
          }
          after = vres?.pagination?.cursor || '';
          if (!after) break;
        }
      };

      // Prefer FR, then fallback any language
      await fetchByGame(lang || '');
      if (lang && out.length < Math.min(8, limit)) {
        await fetchByGame('');
      }
    }

    __oryonCacheSet(__oryonVodSearchCache, key, out);
    return res.json({ success:true, items: out, seeded:true, band:{ minViewers, maxViewers } });
  }catch(e){
    console.warn('⚠️ /api/twitch/vods/by-game-small', e.message);
    return res.json({ success:true, items:[], reason:'server_error', error:e.message });
  }
});

// =========================================================
// ORYON TV — Streams by game (used by TwitFlix drawer)
// =========================================================
const __oryonStreamsByGameCache = new Map();
app.get('/api/twitch/streams/by-game', heavyLimiter, async (req, res) => {
  try{
    const gameIdIn = String(req.query.game_id || '').trim();
    const gameNameIn = String(req.query.game_name || req.query.q || '').trim();
    const limit = Math.min(Math.max(1, parseInt(req.query.limit || '24', 10) || 24), 40);
    const lang = String(req.query.lang || '').trim().toLowerCase();
    // Discovery filters (viewer bands)
    const minViewers = Math.max(0, parseInt(req.query.minViewers || '0', 10) || 0);
    const maxViewers = Math.max(0, parseInt(req.query.maxViewers || '0', 10) || 0);

    const token = await getTwitchToken('app');
    if(!token) return res.json({ success:true, items:[], reason:'missing_app_token' });

    let gameId = gameIdIn;
    if(!gameId){
      if(!gameNameIn) return res.json({ success:true, items:[], reason:'missing_game' });
      const s = await twitchAPI(`search/categories?query=${encodeURIComponent(gameNameIn)}&first=1`, token);
      gameId = s?.data?.[0]?.id || '';
      if(!gameId) return res.json({ success:true, items:[], reason:'game_not_found' });
    }

    const key = `sbg:${gameId}:${limit}:${lang}:${minViewers}:${maxViewers}`;
    const cached = __oryonCacheGet(__oryonStreamsByGameCache, key, 45_000);
    if(cached) return res.json({ success:true, items:cached, cached:true });

    const qs = new URLSearchParams();
    qs.set('game_id', gameId);
    qs.set('first', '100');
    if(lang) qs.set('language', lang);
    const d = await twitchAPI(`streams?${qs.toString()}`, token);
    const rows = (d?.data || []).slice(0, 100);

    // Apply viewer band filter (best-effort)
    const filtered = rows.filter(s => {
      const v = Number(s?.viewer_count || 0);
      if (minViewers && v < minViewers) return false;
      if (maxViewers && v > maxViewers) return false;
      return true;
    });

    const items = filtered.slice(0, limit).map(s => ({
      user_id: s.user_id,
      user_login: s.user_login,
      user_name: s.user_name,
      game_id: s.game_id,
      game_name: s.game_name,
      viewer_count: s.viewer_count,
      title: s.title,
      thumbnail_url: s.thumbnail_url,
      language: s.language,
      started_at: s.started_at,
      platform: 'twitch'
    }));

    __oryonCacheSet(__oryonStreamsByGameCache, key, items);
    return res.json({ success:true, items });
  }catch(e){
    console.warn('⚠️ /api/twitch/streams/by-game', e.message);
    return res.json({ success:true, items:[], reason:'server_error', error:e.message });
  }
});


// =========================================================
// ORYON TV — Top VOD (global) — Netflix-like
// Heuristic: top streams + top games -> recent archives, ranked
// =========================================================
const __oryonTopVodCache = { ts: 0, items: [], meta: null };

// Channel enrichment cache (broadcaster_language, display_name, etc.)
// Note: Twitch Helix does not expose follower count with an app token.
// We can still enrich videos with broadcaster_language via /helix/channels.
const __oryonChannelCache = new Map(); // broadcaster_id -> { ts:number, data:object|null }

async function __getChannelInfo(broadcasterId, token){
  const id = String(broadcasterId || '').trim();
  if (!id) return null;
  const now = Date.now();
  const cached = __oryonChannelCache.get(id);
  const TTL = 60 * 60 * 1000; // 1h
  if (cached && cached.ts && (now - cached.ts) < TTL) return cached.data;

  try{
    const d = await twitchAPI(`channels?broadcaster_id=${encodeURIComponent(id)}`, token);
    const ch = (d?.data && d.data[0]) ? d.data[0] : null;
    __oryonChannelCache.set(id, { ts: now, data: ch });
    return ch;
  }catch(_){
    __oryonChannelCache.set(id, { ts: now, data: null });
    return null;
  }
}

function __normalizeTwitchThumb(url, w=540, h=720){
  if(!url) return '';
  return String(url)
    .replace('%{width}', String(w)).replace('%{height}', String(h))
    .replace('{width}', String(w)).replace('{height}', String(h));
}

function __parseTwitchDurationToMinutes(dur){
  // Twitch formats like "3h12m5s" or "45m" etc.
  const s = String(dur||'').toLowerCase();
  let h=0,m=0,sec=0;
  const mh = s.match(/(\d+)h/); if(mh) h=parseInt(mh[1],10)||0;
  const mm = s.match(/(\d+)m/); if(mm) m=parseInt(mm[1],10)||0;
  const ms = s.match(/(\d+)s/); if(ms) sec=parseInt(ms[1],10)||0;
  return h*60 + m + Math.round(sec/60);
}

function __scoreVod(row){
  // row: helix video
  const views = Math.max(0, Number(row.view_count||0));
  const ageH = Math.max(0, (Date.now() - Date.parse(row.created_at||row.published_at||row.created_at||0)) / 36e5);
  const mins = __parseTwitchDurationToMinutes(row.duration);
  // log views + recency bonus (freshness within 72h) + mild duration sanity
  const logViews = Math.log10(views + 1);
  const recency = ageH <= 72 ? (72 - ageH)/72 : 0; // 0..1
  const dur = mins<=0 ? 0 : (mins<15 ? -0.35 : (mins>720 ? -0.15 : 0.10));
  return (logViews * 10) + (recency * 6) + dur;
}

async function __twitchFetchWithConcurrency(tasks, limit=3){
  const out = [];
  let i=0;
  async function worker(){
    while(i < tasks.length){
      const cur = i++;
      try{ out[cur] = await tasks[cur](); }catch(e){ out[cur] = null; }
    }
  }
  const workers = Array.from({length: Math.max(1, limit)}, ()=>worker());
  await Promise.all(workers);
  return out;
}

// Global "Top VOD" (cached)
app.get('/api/twitch/vods/top', heavyLimiter, async (req, res) => {
  try{
    const limit = Math.min(Math.max(1, parseInt(req.query.limit || '60', 10) || 60), 120);
    const ttlMs = Math.min(Math.max(60_000, parseInt(req.query.ttlMs || '900000', 10) || 900_000), 3_600_000); // 1m..60m

    // Filters (best-effort)
    const lang = String(req.query.lang || '').trim().toLowerCase(); // e.g. 'fr'
    // "small" tries to favor smaller creators. Twitch follower counts are not available with an app token,
    // so we approximate using view_count thresholds + diversity (1 VOD per channel).
    const small = String(req.query.small || '').trim() === '1' || String(req.query.small || '').trim().toLowerCase() === 'true';
    const maxViews = Math.min(Math.max(0, parseInt(req.query.maxViews || (small ? '200000' : '0'), 10) || 0), 5_000_000);

    if(__oryonTopVodCache.ts && (Date.now() - __oryonTopVodCache.ts) < ttlMs && Array.isArray(__oryonTopVodCache.items) && __oryonTopVodCache.items.length){
      const filtered = await __filterTopVodItems(__oryonTopVodCache.items, { lang, small, maxViews });
      return res.json({ success:true, cached:true, meta:__oryonTopVodCache.meta, items: filtered.slice(0,limit) });
    }

    const token = await getTwitchToken('app');
    if(!token) return res.json({ success:true, items:[], reason:'missing_app_token' });

    // A) seed streams
    // Twitch has no "global top VOD" endpoint. We build a pool from live streams + top games,
    // then rank VOD archives by views + recency.
    //
    // Important UX detail: if a language is requested (e.g. lang=fr), seeding from FR streams
    // yields dramatically more FR VODs than filtering an EN-heavy global pool after the fact.
    const seedLang = String(req.query.seedLang || lang || '').trim().toLowerCase();

    // 1) language-seeded streams (if requested)
    let streams = [];
    if(seedLang){
      const s1 = await twitchAPI(`streams?first=100&language=${encodeURIComponent(seedLang)}`, token);
      streams = (s1?.data || []).slice(0, 100);
    }

    // 2) global streams as fallback (to fill the pool if needed)
    if(streams.length < 60){
      const s2 = await twitchAPI('streams?first=80', token);
      const more = (s2?.data || []).slice(0, 80);
      const seen = new Set(streams.map(x=>x.user_id).filter(Boolean));
      for(const it of more){
        if(!it?.user_id) continue;
        if(seen.has(it.user_id)) continue;
        streams.push(it);
        seen.add(it.user_id);
        if(streams.length >= 100) break;
      }
    }

    const streamUserIds = [...new Set(streams.map(s=>s.user_id).filter(Boolean))].slice(0, 55);

    // B) top games (optionally language-biased by first taking games currently streamed in seedLang)
    const gamesData = await twitchAPI('games/top?first=25', token);
    const games = (gamesData?.data || []).slice(0,25);
    const gameIds = games.map(g=>g.id).filter(Boolean).slice(0,18);

    const pool = [];

    // fetch videos by user
    const userTasks = streamUserIds.map(uid => async () => {
      // Pull a bit more per channel so filters (FR/small) still leave enough.
      const v = await twitchAPI(`videos?user_id=${encodeURIComponent(uid)}&first=6&type=archive`, token);
      return (v?.data || []).slice(0,6);
    });
    const userResults = await __twitchFetchWithConcurrency(userTasks, 4);
    for(const arr of userResults){ if(Array.isArray(arr)) pool.push(...arr); }

    // fetch videos by game
    const gameTasks = gameIds.map(gid => async () => {
      const v = await twitchAPI(`videos?game_id=${encodeURIComponent(gid)}&first=8&type=archive`, token);
      return (v?.data || []).slice(0,8);
    });
    const gameResults = await __twitchFetchWithConcurrency(gameTasks, 4);
    for(const arr of gameResults){ if(Array.isArray(arr)) pool.push(...arr); }

    // de-dup by video id
    const byId = new Map();
    for(const row of pool){
      if(!row || !row.id) continue;
      if(byId.has(row.id)) continue;
      // basic filtering: public, not too old
      const created = Date.parse(row.created_at || '') || 0;
      const ageDays = created ? ((Date.now()-created)/(24*36e5)) : 0;
      // keep a larger window so FR filters still have enough items
      if(ageDays > 60) continue;
      if(String(row.type||'').toLowerCase() !== 'archive') continue;
      byId.set(row.id, row);
    }

    let items = [...byId.values()]
      .map(v => ({
        type:'vod', provider:'twitch',
        id: v.id,
        title: v.title,
        url: v.url,
        thumbnail_url: __normalizeTwitchThumb(v.thumbnail_url),
        duration: v.duration,
        view_count: v.view_count,
        created_at: v.created_at,
        user_id: v.user_id,
        user_name: v.user_name,
        game_id: v.game_id,
        game_name: v.game_name,
        language: v.language,
        score: __scoreVod(v)
      }))
      .sort((a,b)=> (b.score||0) - (a.score||0))
      .slice(0, Math.max(limit, 60));

    // Best-effort enrichment: broadcaster language from /helix/channels
    const tokenForEnrich = token;
    const uniqUsers = [...new Set(items.map(x=>x.user_id).filter(Boolean))].slice(0, 80);
    const enrichTasks = uniqUsers.map(uid => async ()=>({ uid, ch: await __getChannelInfo(uid, tokenForEnrich) }));
    const enrichRes = await __twitchFetchWithConcurrency(enrichTasks, 4);
    const byUser = new Map();
    for(const r of enrichRes){
      if(r && r.uid) byUser.set(r.uid, r.ch || null);
    }
    items = items.map(it => {
      const ch = byUser.get(it.user_id) || null;
      const bl = ch && ch.broadcaster_language ? String(ch.broadcaster_language).toLowerCase() : '';
      return {
        ...it,
        broadcaster_language: bl,
        broadcaster_name: ch?.broadcaster_name || it.user_name
      };
    });

    // Apply requested filters after caching base list
    const filteredNow = await __filterTopVodItems(items, { lang, small, maxViews });

    const meta = { streams: streams.length, users: streamUserIds.length, games: gameIds.length, pool: pool.length, unique: byId.size, ttlMs };
    __oryonTopVodCache.ts = Date.now();
    __oryonTopVodCache.items = items;
    __oryonTopVodCache.meta = meta;

    return res.json({ success:true, cached:false, meta, items: filteredNow.slice(0,limit) });
  }catch(e){
    console.warn('⚠️ /api/twitch/vods/top', e.message);
    return res.json({ success:true, items:[], reason:'server_error', error:e.message });
  }
});

async function __filterTopVodItems(items, opts){
  const arr = Array.isArray(items) ? items : [];
  const lang = String(opts?.lang || '').trim().toLowerCase();
  const small = !!opts?.small;
  const maxViews = Number(opts?.maxViews || 0) || 0;

  // Language filter: prefer video.language, fallback to broadcaster_language.
  const langFiltered = !lang ? arr : arr.filter(it => {
    const l = String(it.language || it.broadcaster_language || '').toLowerCase();
    return l === lang || l.startsWith(lang);
  });

  // Best-effort "small creators" filter.
  // Twitch follower count is not exposed with an app token, so we use view_count threshold + diversity.
  let out = langFiltered;
  if (maxViews > 0){
    out = out.filter(it => (Number(it.view_count || 0) || 0) <= maxViews);
  }
  if (small){
    const seen = new Set();
    const dedup = [];
    for (const it of out){
      const uid = String(it.user_id || '');
      if (!uid) continue;
      if (seen.has(uid)) continue; // 1 VOD per channel
      seen.add(uid);
      dedup.push(it);
    }
    out = dedup;
  }
  return out;
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

// ---------------------------------------------------------
// AI: short French game descriptions for StreamFlix modal
// ---------------------------------------------------------
const GAME_DESC_CACHE = new Map(); // key -> { t, text }
const GAME_DESC_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function __getGameDescCache(key){
  const it = GAME_DESC_CACHE.get(key);
  if (!it) return '';
  if ((Date.now() - (it.t||0)) > GAME_DESC_TTL_MS){
    GAME_DESC_CACHE.delete(key);
    return '';
  }
  return String(it.text || '').trim();
}

function __setGameDescCache(key, text){
  const t = String(text || '').trim();
  if (!t) return;
  GAME_DESC_CACHE.set(key, { t: Date.now(), text: t });
}

async function runGeminiPlainText(prompt){
  if (!aiClient) return '';
  try{
    const response = await aiClient.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: "Réponds en FRANÇAIS, en TEXTE BRUT uniquement (sans HTML, sans markdown). 2-3 phrases maximum."
      }
    });
    return String(response.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
  }catch(e){
    console.error("❌ Erreur IA (plain):", e.message);
    return '';
  }
}

app.get('/api/ai/game_desc', async (req, res) => {
  try{
    const name = String(req.query.name || req.query.game || '').trim();
    if (!name) return res.status(400).json({ success:false, description:'' });
    const key = name.toLowerCase();
    const cached = __getGameDescCache(key);
    if (cached) return res.json({ success:true, description: cached, cached:true });

    // Compact prompt: usable as a short pitch in the hero/modal
    const prompt = `Écris une description courte et premium du jeu vidéo "${name}".\n` +
      `Contraintes:\n- 2 à 3 phrases maximum\n- ton neutre/premium, orienté "à regarder"\n- pas de spoilers\n- pas de liens\n- pas de listes\n- en français.`;
    const text = await runGeminiPlainText(prompt);
    const out = text || '';
    if (out) __setGameDescCache(key, out);
    return res.json({ success: !!out, description: out, cached:false });
  }catch(e){
    return res.status(500).json({ success:false, description:'', error:e.message });
  }
});

// =========================================================
// 2B. ANALYTICS SCORE
// =========================================================
function computeGrowthScore({ avgViewers = 0, growthPct = 0, volatility = 0, hoursPerWeek = 0 }) {
  const logPart = Math.log10(avgViewers + 1) * 22;             // ~0..66
  const growthPart = clamp(growthPct, -50, 200) * 0.22;        // ~-11..44
  const volPenalty = clamp(volatility, 0, 200) * 0.18;         // ~0..36
  const hoursPart = clamp(hoursPerWeek, 0, 80) * 0.25;         // ~0..20
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
      ops++; await commitIfNeeded();

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
// 3. AUTH (MULTI-USER SAFE)
// =========================================================
app.get('/twitch_auth_start', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');

  // Stockage du state en session (anti-CSRF) — pas en variable globale
  req.session.twitch_oauth_state = state;

  const url =
    `https://id.twitch.tv/oauth2/authorize` +
    `?client_id=${TWITCH_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent('user:read:follows')}` +
    `&state=${encodeURIComponent(state)}`;

  res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
  const { code, state } = req.query;

  if (!state || !req.session.twitch_oauth_state || state !== req.session.twitch_oauth_state) {
    return res.status(403).send('Erreur Auth (state).');
  }
  // one-time use
  req.session.twitch_oauth_state = null;

  try {
    const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: TWITCH_CLIENT_ID,
        client_secret: TWITCH_CLIENT_SECRET,
        code: String(code || ''),
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI
      })
    });

    const tokenData = await tokenRes.json();
    if (!tokenData?.access_token) return res.status(401).send('Erreur Token.');

    const userRes = await twitchAPI('users', tokenData.access_token);
    const user = userRes?.data?.[0];
    if (!user) return res.status(401).send('Erreur User.');

    // ✅ Stockage par utilisateur: SESSION (multi-user)
    req.session.twitchUser = {
      display_name: user.display_name,
      login: user.login,
      id: user.id,
      profile_image_url: user.profile_image_url,
      access_token: tokenData.access_token,
      expiry: Date.now() + (Number(tokenData.expires_in || 0) * 1000)
    };

    // If Steam was connected before Twitch, persist it now so it becomes permanent.
    try{
      if(req.session?.steam?.steamid){
        await setBillingSteam(req.session.twitchUser, req.session.steam);
      }
    }catch(_){ }

    // S’assure que la session est persistée avant fermeture de la popup
    req.session.save(() => {
      res.send(`
        <script>
          try {
            if (window.opener && !window.opener.closed) {
              window.opener.location.reload();
            }
          } catch (e) {}
          window.close();
        </script>
      `);
    });

  } catch (e) {
    res.status(500).send('Erreur Serveur.');
  }
});

app.post('/twitch_logout', (req, res) => {
  req.session.twitchUser = null;
  req.session.save(() => res.json({ success: true }));
});

app.get('/twitch_user_status', (req, res) => {
  const u = req.session?.twitchUser;

  if (u && (!u.expiry || u.expiry > Date.now())) {
    return res.json({
      is_connected: true,
      display_name: u.display_name,
      profile_image_url: u.profile_image_url
    });
  }

  // Session expirée -> purge
  if (req.session) req.session.twitchUser = null;

  res.json({ is_connected: false });
});

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
// 4. STREAM INFO & TWITFLIX
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

// --- ROUTES TWITFLIX (Updated for Infinite Scroll) ---

app.get('/api/categories/top', async (req, res) => {
  try {
    // On supporte la pagination via "cursor"
    const cursor = req.query.cursor;
    
    // On demande 100 catégories d'un coup (max Twitch)
    let url = 'games/top?first=100';
    if (cursor) url += `&after=${encodeURIComponent(cursor)}`;

    const d = await twitchAPI(url);
    if (!d.data) return res.json({ success: false });
    
    const categories = d.data.map(g => ({
      id: g.id,
      name: g.name,
      box_art_url: g.box_art_url.replace('{width}', '285').replace('{height}', '380')
    }));

    // On renvoie aussi le curseur pour la page suivante
    const nextCursor = d.pagination ? d.pagination.cursor : null;

    res.json({ success: true, categories, cursor: nextCursor });
  } catch (e) {
    res.status(500).json({ success:false, error:e.message });
  }
});


// Search categories (pour la barre de recherche TwitFlix)
// - retourne un tableau de catégories (mêmes champs que /api/categories/top)
app.get('/api/categories/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ success: true, categories: [] });

    // Twitch: search/categories?query=...&first=50
    // Twitch does not guarantee best ordering for multi-word queries.
    // We re-rank server-side to make exact/prefix matches appear first.
    const qLow = q.toLowerCase();
    const d = await twitchAPI(`search/categories?query=${encodeURIComponent(q)}&first=50`);
    const raw = (d.data || []).map(g => ({
      id: g.id,
      name: g.name,
      box_art_url: (g.box_art_url || '').replace('{width}', '285').replace('{height}', '380')
    }));

    function norm(s){
      return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    }
    function scoreName(name){
      const n = norm(name);
      if(!n) return 0;
      if(n === norm(q)) return 10000;
      if(n.startsWith(norm(q))) return 8000;
      // token / word scoring
      const qTokens = norm(q).split(/\s+/).filter(Boolean);
      const nTokens = n.split(/\s+/).filter(Boolean);
      let hit = 0;
      for(const t of qTokens){ if(nTokens.includes(t)) hit += 1; }
      const contains = n.includes(norm(q)) ? 1 : 0;
      // prefer shorter names when score tie
      const lenPenalty = Math.min(200, n.length);
      return (contains*2000) + (hit*900) + (Math.max(0, 500 - lenPenalty));
    }

    const categories = raw
      .map(x => ({...x, _score: scoreName(x.name)}))
      .sort((a,b)=> (b._score - a._score) || (String(a.name).length - String(b.name).length))
      .map(({_score, ...rest}) => rest);

    return res.json({ success: true, categories });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});


// =========================================================
// Twitch Streams: Top (for LIVE banner)
//  - Returns streams filtered by language/viewers
//  - Enriches with game box art for better UI
// =========================================================
app.get('/api/twitch/streams/top', heavyLimiter, async (req, res) => {
  try {
    const lang = String(req.query.lang || '').trim();
    const minViewers = Math.max(0, parseInt(req.query.minViewers || req.query.min || '0', 10) || 0);
    const maxViewers = Math.max(0, parseInt(req.query.maxViewers || req.query.max || '0', 10) || 0);
    const limit = Math.min(100, Math.max(10, parseInt(req.query.limit || '60', 10) || 60));

    // Pull a bigger pool and filter server-side
    const first = 100;
    let url = `streams?first=${first}`;
    if (lang) url += `&language=${encodeURIComponent(lang)}`;
    const d = await twitchAPI(url);
    let items = Array.isArray(d.data) ? d.data.slice(0) : [];

    if (minViewers || maxViewers){
      items = items.filter(s => {
        const v = Number(s.viewer_count || 0);
        if (minViewers && v < minViewers) return false;
        if (maxViewers && v > maxViewers) return false;
        return true;
      });
    }

    // Prefer diversity by game (one stream per game)
    const byGame = new Map();
    for (const s of items){
      const gid = String(s.game_id || '');
      if (!gid) continue;
      if (!byGame.has(gid)) byGame.set(gid, s);
      if (byGame.size >= limit) break;
    }

    const unique = Array.from(byGame.values());
    const gameIds = Array.from(byGame.keys());

    // Enrich with box art
    const artMap = {};
    if (gameIds.length){
      const chunks = [];
      for(let i=0;i<gameIds.length;i+=50) chunks.push(gameIds.slice(i,i+50));
      for(const ch of chunks){
        const q = ch.map(id => `id=${encodeURIComponent(id)}`).join('&');
        const gd = await twitchAPI(`games?${q}`);
        const arr = Array.isArray(gd.data) ? gd.data : [];
        for(const g of arr){
          artMap[String(g.id)] = (g.box_art_url || '').replace('{width}','285').replace('{height}','380');
        }
      }
    }

    const out = unique.map(s => ({
      ...s,
      box_art_url: artMap[String(s.game_id||'')] || null
    }));

    return res.json({ success: true, items: out });
  } catch (e) {
    console.warn('⚠️ /api/twitch/streams/top', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
});


// =========================================================
// STEAM (lightweight integration) + ADN / IA-assisted search
// =========================================================
function tokenSet(s){
  return new Set(String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean));
}
function jaccard(a,b){
  const A = tokenSet(a), B = tokenSet(b);
  if(!A.size || !B.size) return 0;
  let inter = 0;
  for(const x of A){ if(B.has(x)) inter++; }
  const uni = A.size + B.size - inter;
  return uni ? inter/uni : 0;
}
async function steamGetRecentlyPlayed(steamid){
  if(!STEAM_API_KEY) throw new Error("STEAM_API_KEY missing");
  const url = `https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/?key=${encodeURIComponent(STEAM_API_KEY)}&steamid=${encodeURIComponent(steamid)}&count=5`;
  const r = await fetch(url);
  const d = await r.json();
  const games = (d && d.response && Array.isArray(d.response.games)) ? d.response.games : [];
  return games;
}
async function steamResolveAppNames(appids){
  const out = [];
  for(const appid of (appids||[]).slice(0,3)){
    try{
      const url = `https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(appid)}&l=english`;
      const r = await fetch(url);
      const d = await r.json();
      const entry = d && d[String(appid)];
      const name = entry && entry.success && entry.data ? entry.data.name : null;
      if(name) out.push({ appid, name });
    }catch(_){}
  }
  return out;
}

// GET /api/steam/recent?steamid=STEAMID64
app.get('/api/steam/recent', async (req,res)=>{
  try{
    let steamid = String(req.query.steamid||'').trim();
    if(!steamid) steamid = String(req.session?.steam?.steamid||'').trim();
    if(!steamid) return res.status(400).json({success:false,error:'steamid manquant'});
    const recent = await steamGetRecentlyPlayed(steamid);
    const names = await steamResolveAppNames(recent.map(x=>x.appid));
    return res.json({success:true,recent, names});
  }catch(e){
    return res.status(500).json({success:false,error:e.message});
  }
});

// GET /api/reco/personalized?steamid=STEAMID64
app.get('/api/reco/personalized', async (req,res)=>{
  try{
    let steamid = String(req.query.steamid||'').trim();
    if(!steamid) steamid = String(req.session?.steam?.steamid||'').trim();
    if(!steamid || !STEAM_API_KEY){
      return res.json({ success:true, title:'Tendances <span>FR</span>', seedGame:null, categories:[] });
    }

    const recent = await steamGetRecentlyPlayed(steamid);
    const resolved = await steamResolveAppNames(recent.map(x=>x.appid));
    const seed = resolved[0]?.name || null;
    if(!seed){
      return res.json({ success:true, title:'Tendances <span>FR</span>', seedGame:null, categories:[] });
    }

    const top = await twitchAPI('games/top?first=100');
    const pool = (top.data||[]).map(g=>({
      id: g.id,
      name: g.name,
      box_art_url: (g.box_art_url||'').replace('{width}','285').replace('{height}','380')
    }));

    const scored = pool.map(c=>{
      const sim = jaccard(seed, c.name);
      const compat = Math.max(65, Math.min(99, Math.round(65 + sim*34)));
      return { ...c, compat, _sim: sim };
    }).sort((a,b)=> b._sim - a._sim);

    const title = `Parce que tu as aimé <span>${sanitizeText(seed,40)}</span>`;
    return res.json({ success:true, title, seedGame: seed, categories: scored.slice(0, 56) });
  }catch(e){
    return res.status(500).json({success:false,error:e.message});
  }
});

// POST /api/search/intent  { text: "comme Zomboid mais plus de craft et moins de stress" }
app.post('/api/search/intent', async (req,res)=>{
  try{
    const text = String(req.body?.text || '').trim();
    if(!text) return res.json({success:true, categories:[]});

    const low = text.toLowerCase();

    // Heuristic NLP (no external LLM required): turns a sentence into a curated set of games.
    // Goal: make queries like "comme Zomboid mais plus de craft et moins de stress" actually work.

    // 1) Extract base game after "comme" (optional)
    let base = '';
    const mm = low.match(/\bcomme\s+([^,.;]+)/i);
    if(mm) base = mm[1].split(' mais ')[0].trim();

    // 2) Detect intent signals
    const wantsCraft = /\bcraft\b|artisan|artisanat|construction|build|builder|base\b|b\u00e2tir/i.test(low);
    const wantsSurvival = /survie|survival|zombie|hardcore/i.test(low);
    const wantsCoop = /coop|co-op|multijoueur|team|groupe/i.test(low);
    const wantsRogue = /rogue|roguelite|roguelike/i.test(low);

    const lessStress = /(moins|pas)\s+(de\s+)?stress|chill|relax|calme|zen|tranquille/i.test(low);
    const moreStress = /plus\s+(de\s+)?stress|tryhard|sueur/i.test(low);
    const wantsMoreCraft = /plus\s+(de\s+)?craft|plus\s+(de\s+)?construction|plus\s+(de\s+)?b\u00e2timent/i.test(low);

    // 3) Curated KB (kept small; reliable)
    const KB = {
      base_zomboid: [
        'Project Zomboid', '7 Days to Die', 'DayZ', 'State of Decay 2', 'Dying Light', 'Unturned'
      ],
      craft: [
        'Minecraft', 'Valheim', 'Terraria', 'Raft', 'The Forest', 'Sons of the Forest', 'Subnautica', 'No Man\'s Sky', 'Astroneer'
      ],
      chill: [
        'Stardew Valley', 'Slime Rancher', 'Spiritfarer', 'No Man\'s Sky', 'Astroneer', 'Terraria', 'Minecraft'
      ],
      coop: [
        'Valheim', 'Raft', 'The Forest', 'Sons of the Forest', 'Deep Rock Galactic', 'Lethal Company'
      ],
      rogue: [
        'Hades', 'Dead Cells', 'The Binding of Isaac: Repentance', 'Risk of Rain 2'
      ]
    };

    const wants = new Set();

    // Base-driven expansion
    if(base){
      if(/zomboid/.test(base)) KB.base_zomboid.forEach(x=>wants.add(x));
      else wants.add(base);
    }

    // Intent-driven expansion
    if(wantsCraft || wantsMoreCraft) KB.craft.forEach(x=>wants.add(x));
    if(lessStress) KB.chill.forEach(x=>wants.add(x));
    if(wantsCoop) KB.coop.forEach(x=>wants.add(x));
    if(wantsRogue) KB.rogue.forEach(x=>wants.add(x));

    // If user asked for "moins de stress", avoid very stressful picks (keep it simple)
    const STRESSY = new Set(['Rust', 'Escape from Tarkov', 'Dead by Daylight', 'Call of Duty: Warzone']);

    // 4) Resolve these names to Twitch categories (exact-ish)
    const byId = new Map();
    const picks = Array.from(wants).filter(Boolean).slice(0, 18);
    for(const name of picks){
      try{
        const d = await twitchAPI(`search/categories?query=${encodeURIComponent(name)}&first=5`);
        const arr = Array.isArray(d.data) ? d.data : [];
        if(!arr.length) continue;
        // prefer exact match
        let g = arr.find(x => String(x.name||'').toLowerCase() === String(name).toLowerCase()) || arr[0];
        if(!g?.id) continue;
        if(STRESSY.has(g.name) && lessStress) continue;

        const compatBase = base ? jaccard(base, g.name) : 0.35;
        let compat = 68 + compatBase * 28;
        if(wantsCraft || wantsMoreCraft) compat += 3;
        if(lessStress) compat += 2;
        if(wantsCoop) compat += 1;
        if(moreStress) compat -= 2;
        compat = Math.max(60, Math.min(99, Math.round(compat)));

        byId.set(g.id, {
          id: g.id,
          name: g.name,
          box_art_url: (g.box_art_url||'').replace('{width}','285').replace('{height}','380'),
          compat
        });
      }catch(_){ }
    }

    // Fallback: if nothing resolved, fallback to Twitch search on the whole sentence
    if(!byId.size){
      try{
        const d = await twitchAPI(`search/categories?query=${encodeURIComponent(base || text)}&first=50`);
        for(const g of (d.data||[])){
          if(!g?.id) continue;
          if(byId.has(g.id)) continue;
          byId.set(g.id, {
            id: g.id,
            name: g.name,
            box_art_url: (g.box_art_url||'').replace('{width}','285').replace('{height}','380')
          });
        }
      }catch(_){ }
    }

    return res.json({ success:true, categories: Array.from(byId.values()).slice(0,120) });
  }catch(e){
    return res.status(500).json({success:false,error:e.message});
  }
});


// YouTube trailer search (server-side) — for TwitFlix trailers carousel
// Front can call: GET /api/youtube/trailer?q=GAME_NAME

app.get('/api/youtube/health', async (req,res)=>{
  try{
    const hasKey = !!process.env.YOUTUBE_API_KEY;
    if(!hasKey) return res.json({ ok:true, hasKey:false });

    const testQ = String(req.query.q || 'Minecraft').trim();
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=${encodeURIComponent(testQ)}&key=${encodeURIComponent(process.env.YOUTUBE_API_KEY)}`;
    const r = await fetchWithTimeout(url, {}, 5500).catch(e=>null);
    if(!r) return res.json({ ok:false, hasKey:true, fetch:false });

    const status = r.status;
    const txt = await r.text().catch(()=> '');
    let parsed = null;
    try{ parsed = JSON.parse(txt); }catch(_){ parsed = null; }

    const reason = parsed?.error?.errors?.[0]?.reason || parsed?.error?.message || null;
    return res.json({ ok: r.ok, hasKey:true, status, reason });
  }catch(e){
    return res.json({ ok:false, error:e.message });
  }
});

app.get('/api/youtube/trailer', heavyLimiter, async (req, res) => {
  const q0 = String(req.query.q || '').trim();
  const type = String(req.query.type || 'game'); // game|movie
  const lang = String(req.query.lang || 'fr');
  const debug = String(req.query.debug || '') === '1';
  if (!q0) return res.status(400).json({ success:false, error:'q manquant' });

  const q = sanitizeText(q0, 160);
  const key = (type + '|' + q).toLowerCase();

  const cached = YT_TRAILER_CACHE.get(key);
  if (cached && (Date.now() - cached.ts) < YT_CACHE_TTL_MS) {
    return res.json({ success:true, ...cached.data, cached:true });
  }

  const queries = (() => {
    const base = q;
    if (type === 'movie') {
      return [
        `${base} bande annonce officielle`,
        `${base} bande-annonce officielle`,
        `${base} trailer officiel`,
        `${base} official trailer`
      ];
    }
    // game
    return [
      `${base} trailer officiel`,
      `${base} bande annonce officielle`,
      `${base} bande-annonce officielle`,
      `${base} gameplay trailer`,
      `${base} official trailer`,
      `${base} cinematic trailer`,
      `${base} launch trailer`,
      `${base} trailer`
    ];
  })();

  // -------- YouTube Data API (if key works) --------
  async function ytApiSearch(query){
    if (!YOUTUBE_API_KEY) return { ok:false, reason:'missing_key' };
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=6&safeSearch=moderate&relevanceLanguage=${encodeURIComponent(lang === 'fr' ? 'fr' : 'en')}&regionCode=${encodeURIComponent(lang === 'fr' ? 'FR' : 'US')}&q=${encodeURIComponent(query)}&key=${encodeURIComponent(YOUTUBE_API_KEY)}`;
    const r = await fetchWithTimeout(url, {}, 5500).catch((e)=>({ ok:false, _err:e }));
    if (!r || r.ok === false) {
      return { ok:false, reason:'fetch_failed', err: r?._err?.message };
    }
    const status = r.status || 0;
    const text = await r.text().catch(()=> '');
    let data = null;
    try { data = JSON.parse(text || '{}'); } catch(_) { data = null; }
    if (!r.ok) {
      const reason = data?.error?.errors?.[0]?.reason || data?.error?.message || 'youtube_api_error';
      return { ok:false, reason, status, raw: debug ? text?.slice(0,400) : undefined };
    }
    const items = Array.isArray(data?.items) ? data.items : [];
    const pick = items.find(x => x?.id?.videoId) || null;
    if (!pick) return { ok:false, reason:'no_result' };

    return {
      ok:true,
      data: {
        videoId: pick.id.videoId,
        title: pick.snippet?.title || '',
        channelTitle: pick.snippet?.channelTitle || '',
        publishedAt: pick.snippet?.publishedAt || ''
      }
    };
  }

  // -------- Fallback: Invidious public instances --------
  const INVIDIOUS = [
    "https://yewtu.be",
    "https://inv.nadeko.net",
    "https://invidious.fdn.fr",
    "https://invidious.nerdvpn.de"
  ];

  async function invSearch(inst, query){
    const url = `${inst}/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort_by=relevance`;
    const r = await fetchWithTimeout(url, { headers: { 'accept':'application/json' } }, 4500).catch(()=>null);
    if(!r || !r.ok) return null;
    const j = await r.json().catch(()=>null);
    if(!Array.isArray(j)) return null;
    const it = j.find(x => x && x.videoId && String(x.videoId).length === 11) || null;
    if(!it) return null;
    return {
      videoId: it.videoId,
      title: it.title || '',
      channelTitle: it.author || '',
      publishedAt: it.published || ''
    };
  }

  try {
    // 1) Try YouTube API with multiple query variants
    let lastApiErr = null;
    for (const qq of queries) {
      const r = await ytApiSearch(qq);
      if (r.ok) {
        YT_TRAILER_CACHE.set(key, { ts: Date.now(), data: r.data });
        return res.json({ success:true, ...r.data, provider:'youtube_api' });
      }
      lastApiErr = r;
      // If key missing, don't keep trying API
      if (r.reason === 'missing_key') break;
    }

    // 2) Fallback to Invidious when API fails (quota/restricted/etc.)
    const shuffled = [...INVIDIOUS].sort(()=>Math.random()-0.5);
    for (const inst of shuffled) {
      for (const qq of queries) {
        const out = await invSearch(inst, qq);
        if (out) {
          YT_TRAILER_CACHE.set(key, { ts: Date.now(), data: out });
          return res.json({ success:true, ...out, provider:'invidious' });
        }
      }
    }

	    // 3) Last resort: scrape YouTube search HTML for a videoId (no API key).
	    // Best-effort: may fail if YouTube returns consent/captcha.
	    try {
	      for (const qq of queries) {
	        const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(qq)}`;
	        const r = await fetchWithTimeout(url, { headers: { 'user-agent': 'Mozilla/5.0' } }, 5500).catch(()=>null);
	        if (!r || !r.ok) continue;
	        const html = await r.text().catch(()=> '');
	        const m = html.match(/\"videoId\"\s*:\s*\"([a-zA-Z0-9_-]{11})\"/);
	        if (m && m[1]) {
	          const out = { videoId: m[1], title: '', channelTitle: '', publishedAt: '' };
	          YT_TRAILER_CACHE.set(key, { ts: Date.now(), data: out });
	          return res.json({ success:true, ...out, provider:'youtube_scrape' });
	        }
	      }
	    } catch(_) {}

    // no result
    return res.json({ success:false, error:'no_result', details: debug ? lastApiErr : undefined });
  } catch (e) {
    return res.status(500).json({ success:false, error:e.message });
  }
});



app.post('/api/stream/by_category', async (req, res) => {
  const gameId = String(req.body?.game_id || '');
  if (!gameId) return res.status(400).json({ success: false, error: 'game_id manquant' });

  try {
    // 100 streams max, FR ou global
    let sRes = await twitchAPI(`streams?game_id=${gameId}&language=fr&first=100`);
    let streams = sRes.data || [];

    if (streams.length < 5) {
      const gRes = await twitchAPI(`streams?game_id=${gameId}&first=100`);
      streams = [...streams, ...(gRes.data || [])];
    }

    // Filtre < 100 viewers
    const candidates = streams.filter(s => (s.viewer_count || 0) <= 100);

    if (candidates.length === 0) {
      // Fallback
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

// =========================================================
// 5. STREAMS FOLLOWED + ROTATION + BOOST
// =========================================================
app.get('/followed_streams', async (req, res) => {
  const u = req.session?.twitchUser;
  if (!u || (u.expiry && u.expiry <= Date.now())) {
    if (req.session) req.session.twitchUser = null;
    return res.status(401).json({ success: false });
  }

  try {
    const data = await twitchAPI(
      `streams/followed?user_id=${u.id}`,
      u.access_token
    );

    return res.json({
      success: true,
      streams: (data.data || []).map(s => ({
        user_id: s.user_id,
        user_name: s.user_name,
        user_login: s.user_login,
        game_name: s.game_name,
        title: s.title,
        viewer_count: s.viewer_count,
        started_at: s.started_at,
        thumbnail_url: s.thumbnail_url
      }))
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
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
      rot.streams = suitable.sort(() => 0.5 - Math.random()).map(s => ({
        channel: s.user_login,
        viewers: s.viewer_count
      }));
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
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > now) {
      boost = CACHE.boostedStream;
    }
  }

  if (boost) {
    return res.json({ success: true, channel: boost.channel, mode: 'BOOST', message: `⚡ BOOST ACTIF` });
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
    await db.collection('boosts').add({
      channel,
      startTime: now,
      endTime: now + 900000 // 15 min
    });

    CACHE.boostedStream = { channel, endTime: now + 900000 };

    res.json({ success: true, html_response: "<p style='color:green;'>✅ Boost activé pendant 15 minutes!</p>" });
  } catch (e) {
    res.status(500).json({ success:false, error: "Erreur DB" });
  }
});

// =========================================================
// 6. STATS
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
          if (stats.timestamp) {
            const date = stats.timestamp.toDate();
            const timeStr = `${date.getHours()}h${date.getMinutes() < 10 ? '0' + date.getMinutes() : date.getMinutes()}`;
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
// 7. SCAN + CRITIQUE IA
// =========================================================
app.post('/scan_target', async (req, res) => {
  const query = String(req.body?.query || '').trim().toLowerCase();
  if (!query) return res.status(400).json({ success:false, error:'query manquant' });

  try {
    const uRes = await twitchAPI(`users?login=${encodeURIComponent(query)}`);
    if (uRes.data && uRes.data.length) {
      const u = uRes.data[0];

      let channelInfo = {};
      try {
        const cRes = await twitchAPI(`channels?broadcaster_id=${u.id}`);
        if (cRes.data && cRes.data.length) channelInfo = cRes.data[0];
      } catch (e) {}

      let streamInfo = null;
      try {
        const sRes = await twitchAPI(`streams?user_id=${u.id}`);
        if (sRes.data && sRes.data.length) streamInfo = sRes.data[0];
      } catch (e) {}

      const isLive = !!streamInfo;
      const createdDate = new Date(u.created_at).toLocaleDateString('fr-FR');

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
        view_count: u.view_count || 0,
        is_live: isLive,
        viewer_count: isLive ? streamInfo.viewer_count : 0
      };

      CACHE.lastScanData = { type: 'user', ...uData };
      return res.json({ success: true, type: 'user', user_data: uData });
    }

    const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(query)}&first=1`);
    if (gRes.data && gRes.data.length) {
      const g = gRes.data[0];
      const sRes = await twitchAPI(`streams?game_id=${g.id}&first=20`);
      const total = (sRes.data || []).reduce((a, b) => a + (b.viewer_count || 0), 0);

      const gData = {
        name: g.name,
        box_art_url: g.box_art_url.replace('{width}', '60').replace('{height}', '80'),
        total_viewers: total,
        ai_calculated_niche_score: total < 5000 ? 4.0 : 2.0
      };

      CACHE.lastScanData = { type: 'game', ...gData };
      return res.json({ success: true, type: 'game', game_data: gData });
    }

    return res.json({ success: false });
  } catch (e) {
    res.status(500).json({ success:false, error: e.message });
  }
});

app.post('/critique_ia', async (req, res) => {
  const type = String(req.body?.type || '').trim();
  const query = String(req.body?.query || '').trim();
  if (!query) return res.status(400).json({ success:false, html_response:"<p style='color:red;'>query requis</p>" });

  // Paid feature guard: Premium or credits
  const quota = await requireActionQuota(req, res, 'critique_ia');
  if (!quota) return;


  const prompt = type === 'niche'
    ? `Analyse critique du niche "${query}" sur Twitch. Saturation? Opportunités? Réponds en HTML.`
    : `Donne-moi 5 idées de clips viraux pour "${query}". Réponds en HTML avec <ul><li>.`;

  res.json(await runGeminiAnalysis(prompt));
});

// =========================================================
// 8. RAID
// =========================================================
app.post('/start_raid', async (req, res) => {
  const game = String(req.body?.game || '').trim();
  const max_viewers = parseInt(req.body?.max_viewers || '100', 10);

  if (!game) return res.status(400).json({ success:false, error:'game manquant' });

  try {
    const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(game)}&first=1`);
    if (!gRes.data || !gRes.data.length) return res.json({ success: false });

    const sRes = await twitchAPI(`streams?game_id=${gRes.data[0].id}&first=100&language=fr`);

    const target = (sRes.data || [])
      .filter(s => (s.viewer_count || 0) <= max_viewers)
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
// 9. BEST TIME TOOL
// =========================================================
app.post('/analyze_schedule', async (req, res) => {
  const game = String(req.body?.game || '').trim();
  if (!game) {
    return res.status(400).json({ success: false, html_response: '<p style="color:red;">❌ Nom du jeu manquant</p>' });
  }
  // Paid feature guard: Premium or credits
  const quota = await requireActionQuota(req, res, 'best_time');
  if (!quota) return;


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

    const prompt = `Tu es expert en optimisation streaming Twitch pour le jeu "${gameName}".

📊 DONNÉES ACTUELLES:
- Chaînes en live: ${channelCount}
- Viewers totaux: ${totalViewers}
- Moyenne viewers/chaîne: ${avgViewers}

DEMANDE: Fournis EXACTEMENT en HTML pur (pas de markdown):
1) ⏱️ Saturation actuelle (Faible/Moyenne/Haute) + 1 phrase
2) 🎯 3 créneaux horaires PRÉCIS (Jour + heure ex: Mercredi 14h-16h) avec justification
3) 📈 Score "niche profitability" de 1 à 10
4) 💡 1 conseil actionnable

HTML STRICT: <h4>, <ul>, <li>, <p>, <strong>.`;

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
// 10. ALERTS
// =========================================================
async function saveAlert(channelId, dayKey, type, payload) {
  try {
    const ref = db.collection('alerts').doc(String(channelId)).collection('items').doc(`${dayKey}_${type}`);
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
    if (!uRes.data || !uRes.data.length) return { success:false, message:"introuvable" };
    const channelId = String(uRes.data[0].id);

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
    const hoursPerWeek = Math.round((minutes_live_est/60)/(days/7));

    const volatility = 0; // simplifié
    const growth_score = computeGrowthScore({ avgViewers: avg, growthPct: growth_percent, volatility, hoursPerWeek });
    const dayKey = yyyy_mm_dd_from_ms(Date.now());

    if (growth_percent >= 25 && growth_score >= 60) {
      await saveAlert(channelId, dayKey, "acceleration", {
        title: "🚀 Accélération détectée",
        message: `Ta moyenne grimpe (+${growth_percent}%). Double down sur les formats qui performent.`,
        score: growth_score
      });
    }

    if (aiClient) {
      const prompt = `Tu es un coach Twitch. Propose 1 alerte courte et actionnable pour AUJOURD'HUI (FR) pour ${login}.
Données: avg=${avg}, peak=${peak}, growth=${growth_percent}%, score=${growth_score}/100.
Réponds en JSON strict: {"title":"...","message":"...","tag":"..."} (tag = growth|niche|schedule|content).`;
      const out = await runGeminiAnalysis(prompt);
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

app.get('/api/alerts/channel_by_login/:login', async (req, res) => {
  const login = String(req.params.login||'').trim().toLowerCase();
  const limit = clamp(parseInt(req.query.limit||'10',10), 1, 50);
  if (!login) return res.status(400).json({ success:false, error:"login manquant" });

  try {
    const uRes = await twitchAPI(`users?login=${encodeURIComponent(login)}`);
    if (!uRes.data || !uRes.data.length) return res.json({ success:false, error:"introuvable" });
    const channelId = String(uRes.data[0].id);

    const q = await db.collection('alerts').doc(channelId).collection('items')
      .orderBy('created_at','desc').limit(limit).get();

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

  // Paid feature guard: Premium or credits
  const quota = await requireActionQuota(req, res, 'alerts_generate');
  if (!quota) return;
  const r = await generateAlertsForLogin(login, days);
  return res.json(r);
});

// =========================================================
// 11. GAME HOURS (heatmap)
// =========================================================
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

    return res.json({ success:true, game_id: gameId, days, hours: out, best });
  } catch (e) {
    return res.status(500).json({ success:false, error:e.message });
  }
});

// =========================================================
// 12. ANALYTICS PRO
// =========================================================
app.get('/api/analytics/channel_by_login/:login', async (req, res) => {
  const login = String(req.params.login || '').trim().toLowerCase();
  const days = clamp(parseInt(req.query.days || '30', 10), 1, 90);
  if (!login) return res.status(400).json({ success:false, error:'login manquant' });

  try {
    const uRes = await twitchAPI(`users?login=${encodeURIComponent(login)}`);
    if (!uRes.data || !uRes.data.length) return res.json({ success:false, error:'introuvable' });
    const channelId = String(uRes.data[0].id);

    const since = Date.now() - (days * 24 * 60 * 60 * 1000);
    const q = await db.collection('channels').doc(channelId)
      .collection('daily_stats')
      .where('day', '>=', yyyy_mm_dd_from_ms(since))
      .orderBy('day', 'asc')
      .get();

    if (q.empty) {
      return res.json({
        success:false,
        channel_id: channelId,
        message:"Pas assez de données daily_stats (laisse tourner le cron quelques minutes/heures)."
      });
    }

    const rows = q.docs.map(d => d.data());
    const labels = rows.map(r => r.day?.slice(5) || '—'); // MM-DD
    const values = rows.map(r => Number(r.avg_viewers || 0));

    const avg = Math.round(values.reduce((a,b)=>a+b,0) / (values.length || 1));
    const peak = Math.max(...rows.map(r => Number(r.peak_viewers || 0)));

    const first = values[0] || 0;
    const last = values[values.length-1] || 0;
    const growth = first > 0 ? Math.round(((last - first) / first) * 100) : (last>0?100:0);

    const mean = avg;
    const variance = values.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / (values.length || 1);
    const volatility = Math.round(Math.sqrt(variance));

    const totalMinutes = rows.reduce((a,r)=>a + Number(r.minutes_live_est || 0), 0);
    const hoursPerWeek = Math.round((totalMinutes / 60) / (Math.max(1, rows.length) / 7));

    const growth_score = computeGrowthScore({ avgViewers: avg, growthPct: growth, volatility, hoursPerWeek });

    return res.json({
      success:true,
      channel_id: channelId,
      days,
      kpis: {
        avg_viewers: avg,
        peak_viewers: peak,
        growth_percent: growth,
        volatility,
        hours_per_week_est: hoursPerWeek,
        days: rows.length,
        growth_score
      },
      series: { labels, values }
    });
  } catch (e) {
    return res.status(500).json({ success:false, error:e.message });
  }
});

// Simulation & IA reco
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

    if (snaps.empty) return res.json({ success:false, message:'Pas assez de données daily_stats.' });

    const series = snaps.docs.map(d => d.data()).reverse();
    const avg = Math.round(series.reduce((a, x) => a + (x.avg_viewers || 0), 0) / series.length);

    const totalMinutes = series.reduce((a, x) => a + (x.minutes_live_est || 0), 0);
    const curHoursPerWeek = Math.max(1, (totalMinutes / 60) / (series.length / 7));

    const ratio = hoursPerWeek / curHoursPerWeek;
    const k = 0.22;
    const expectedMultiplier = clamp(1 + k * Math.log(ratio), 0.6, 1.8);

    const expectedAvg = Math.round(avg * expectedMultiplier);

    return res.json({
      success:true,
      current:{ avg_viewers: avg, hours_per_week_est: Math.round(curHoursPerWeek * 10) / 10 },
      target:{ hours_per_week: hoursPerWeek, expected_avg_viewers: expectedAvg, expected_change_percent: Math.round((expectedMultiplier - 1) * 100) }
    });
  } catch (e) {
    return res.status(500).json({ success:false, error:e.message });
  }
});

app.get('/api/ai/reco', async (req, res) => {
  const login = String(req.query.login || '').trim().toLowerCase();
  const days = clamp(parseInt(req.query.days || '30', 10), 7, 90);
  if (!login) return res.status(400).json({ success:false, html_response:"<p style='color:red;'>login requis</p>" });

  // Paid feature guard: Premium or credits
  const quota = await requireActionQuota(req, res, 'ai_reco');
  if (!quota) return;

  try {
    const a = await fetch(`http://localhost:${PORT}/api/analytics/channel_by_login/${encodeURIComponent(login)}?days=${days}`).then(r=>r.json());
    if (!a.success) return res.json({ success:false, html_response:"<p style='color:red;'>Pas assez de data.</p>" });

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
    return res.status(500).json({ success:false, html_response:`<p style="color:red;">${e.message}</p>` });
  }
});

// =========================================================
// 13. CO-STREAM
// =========================================================
app.get('/api/costream/best', async (req, res) => {
  const login = String(req.query.login || '').trim().toLowerCase();
  const days = clamp(parseInt(req.query.days || '14', 10), 1, 60);
  if (!login) return res.status(400).json({ success:false, message:'login manquant' });

  try {
    const uRes = await twitchAPI(`users?login=${encodeURIComponent(login)}`);
    if (!uRes.data || !uRes.data.length) return res.json({ success:false, message:'Chaîne introuvable' });
    const me = uRes.data[0];

    let myStream = null;
    try {
      const sRes = await twitchAPI(`streams?user_id=${me.id}`);
      if (sRes.data && sRes.data.length) myStream = sRes.data[0];
    } catch (e) {}

    let gameId = myStream?.game_id || null;
    let gameName = myStream?.game_name || null;
    let myViewers = myStream?.viewer_count ?? null;

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

    if (!gameId) return res.json({ success:false, message:'Chaîne offline et jeu inconnu (pas assez de data).' });

    if (myViewers == null) {
      // fallback: use daily avg if exists
      try {
        const snaps = await db.collection('channels').doc(String(me.id)).collection('daily_stats').orderBy('day','desc').limit(days).get();
        if (!snaps.empty) {
          const vals = snaps.docs.map(d=>Number(d.data().avg_viewers||0));
          myViewers = Math.round(vals.reduce((a,b)=>a+b,0)/(vals.length||1));
        }
      } catch (e) {}
      if (myViewers == null) myViewers = 50;
    }

    const sGame = await twitchAPI(`streams?game_id=${encodeURIComponent(gameId)}&first=100&language=fr`);
    const candidatesLive = (sGame.data || []).filter(s => s.user_login && s.user_login.toLowerCase() !== login);

    if (!candidatesLive.length) return res.json({ success:false, message:'Aucun co-streamer FR live trouvé sur ce jeu.' });

    const target = Math.max(5, Number(myViewers) || 50);

    const scored = candidatesLive.map(s => {
      const diff = Math.abs((s.viewer_count || 0) - target);
      const score = Math.max(0, 100 - Math.round(diff * 2)); // simple
      return { s, diff, score };
    }).sort((a,b)=> b.score - a.score);

    const bestS = scored[0].s;
    const bestScore = scored[0].score;

    let prof = null;
    try {
      const uu = await twitchAPI(`users?login=${encodeURIComponent(bestS.user_login)}`);
      if (uu.data && uu.data.length) prof = uu.data[0];
    } catch (e) {}

    const best = {
      login: bestS.user_login,
      display_name: bestS.user_name,
      profile_image_url: prof?.profile_image_url || null,
      score: bestScore,
      why: `Même jeu (${gameName || bestS.game_name}), audience proche (${bestS.viewer_count} vs ~${target}).`
    };

    const candidates = scored.slice(1, 8).map(x => ({
      login: x.s.user_login,
      display_name: x.s.user_name,
      score: x.score
    }));

    return res.json({ success:true, best, candidates });
  } catch (e) {
    return res.status(500).json({ success:false, message:e.message });
  }
});

// =========================================================
// 14. SERVER START + SOCKET.IO
// =========================================================
const server = http.createServer(app);

// Prevent proxies (Render/Cloudflare) from closing long-polling connections too aggressively
server.keepAliveTimeout = 120000; // 120s
server.headersTimeout = 125000;   // must be > keepAliveTimeout


const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 60000
});

// Partage la session Express avec Socket.IO (multi-user)

// Helpful debug for unstable connections
io.engine.on('connection_error', (err) => {
  console.warn('⚠️ [SOCKET] connection_error:', err.code, err.message);
});

io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});


// =========================================================
// HUB: GIF picker proxy (GIPHY) + chat history
// =========================================================
app.get('/api/chat/history', async (req, res) => {
  try{
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '50', 10)));
    const msgs = await loadRecentMessages(limit);
    return res.json({ success:true, messages: msgs, firestoreOk });
  }catch(e){
    return res.status(500).json({ success:false, error:e.message });
  }
});

app.get('/api/gifs/trending', async (req, res) => {
  try{
    if (!process.env.GIPHY_API_KEY) return res.status(400).json({ success:false, error:'GIPHY_API_KEY missing' });
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '24', 10)));
    const url = `https://api.giphy.com/v1/gifs/trending?api_key=${encodeURIComponent(process.env.GIPHY_API_KEY)}&limit=${limit}&rating=pg-13`;
    const r = await fetch(url);
    const d = await r.json();
    const gifs = (d.data || []).map(g => ({
      id: g.id,
      title: g.title,
      url: g.images?.original?.url || g.images?.downsized_large?.url || g.images?.downsized?.url,
      preview: g.images?.fixed_width?.url || g.images?.fixed_width_small?.url || g.images?.downsized?.url
    })).filter(x => x.url);
    return res.json({ success:true, gifs });
  }catch(e){
    return res.status(500).json({ success:false, error:e.message });
  }
});

app.get('/api/gifs/search', async (req, res) => {
  try{
    if (!process.env.GIPHY_API_KEY) return res.status(400).json({ success:false, error:'GIPHY_API_KEY missing' });
    const q = String(req.query.q || '').trim();
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '24', 10)));
    if (!q) return res.json({ success:true, gifs: [] });

    const url = `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(process.env.GIPHY_API_KEY)}&q=${encodeURIComponent(q)}&limit=${limit}&rating=pg-13&lang=fr`;
    const r = await fetch(url);
    const d = await r.json();
    const gifs = (d.data || []).map(g => ({
      id: g.id,
      title: g.title,
      url: g.images?.original?.url || g.images?.downsized_large?.url || g.images?.downsized?.url,
      preview: g.images?.fixed_width?.url || g.images?.fixed_width_small?.url || g.images?.downsized?.url
    })).filter(x => x.url);
    return res.json({ success:true, gifs });
  }catch(e){
    return res.status(500).json({ success:false, error:e.message });
  }
});


io.on('connection', async (socket) => {
  console.log('🔌 [SOCKET] client connected');

  // send recent history on connect
  try{
    const msgs = await loadRecentMessages(60);
    socket.emit('chat history', msgs);
  }catch(e){}

  // simple anti-spam per socket
  let lastMsgAt = 0;

  socket.on('chat message', async (msg) => {
    const now = Date.now();
    if (now - lastMsgAt < 650) return; // cooldown
    lastMsgAt = now;
    const sessU = socket.request?.session?.twitchUser;
    const isSessValid = !!(sessU && (!sessU.expiry || sessU.expiry > Date.now()));
    const user = sanitizeName(isSessValid ? (sessU.display_name || sessU.login || sessU.id) : (msg?.user));
    const user_display = isSessValid ? (sessU.display_name || null) : null;
    const text = sanitizeText(msg?.text, 800);

    let gif = '';
    if (msg?.gif && typeof msg.gif === 'string' && isValidHttpUrl(msg.gif)) {
      gif = msg.gif.slice(0, 800);
    }

    if (!text && !gif) return;

    const out = {
      id: makeId(),
      user,
      user_display: (typeof user_display !== 'undefined' ? user_display : null),
      text,
      gif,
      ts: now,
      reactions: {}
    };

    // XP: only if non-empty text (avoid farming with empty)
    if (text) await addXP(user, 5);

    await saveMessage(out);
    io.emit('chat message', out);
    io.emit('hub:message', out);
  });

  socket.on('hub:message', async (msg) => {
    const now = Date.now();
    if (now - lastMsgAt < 650) return; // cooldown
    lastMsgAt = now;
    const sessU = socket.request?.session?.twitchUser;
    const isSessValid = !!(sessU && (!sessU.expiry || sessU.expiry > Date.now()));
    const user = sanitizeName(isSessValid ? (sessU.display_name || sessU.login || sessU.id) : (msg?.user));
    const user_display = isSessValid ? (sessU.display_name || null) : null;
    const text = sanitizeText(msg?.text, 800);

    let gif = '';
    if (msg?.gif && typeof msg.gif === 'string' && isValidHttpUrl(msg.gif)) {
      gif = msg.gif.slice(0, 800);
    }

    if (!text && !gif) return;

    const out = {
      id: makeId(),
      user,
      user_display: (typeof user_display !== 'undefined' ? user_display : null),
      text,
      gif,
      ts: now,
      reactions: {}
    };

    // XP: only if non-empty text (avoid farming with empty)
    if (text) await addXP(user, 5);

    await saveMessage(out);
    io.emit('chat message', out);
    io.emit('hub:message', out);
  });

  
  socket.on('chat react', async (payload) => {
    try{
      const msgId = String(payload?.id || '');
      const emo = String(payload?.emoji || '').slice(0, 16);
      if (!msgId || !emo) return;

      // Update in Firestore if possible; else update memory history
      if (firestoreOk){
        const ref = db.collection(CHAT_COLLECTION).doc(msgId);
        await db.runTransaction(async (t) => {
          const snap = await t.get(ref);
          if (!snap.exists) return;
          const data = snap.data() || {};
          const reactions = data.reactions || {};
          reactions[emo] = (reactions[emo] || 0) + 1;
          t.set(ref, { reactions }, { merge: true });
        });
        const updated = (await db.collection(CHAT_COLLECTION).doc(msgId).get()).data();
        if (updated) io.emit('chat update', { id: msgId, reactions: updated.reactions || {} });
        return;
      }

      const item = inMemHistory.find(m => m.id === msgId);
      if (item){
        item.reactions = item.reactions || {};
        item.reactions[emo] = (item.reactions[emo] || 0) + 1;
        io.emit('chat update', { id: msgId, reactions: item.reactions });
      io.emit('hub:react', { id: msgId, reactions: item.reactions });
      }
    }catch(_){}
  });

  socket.on('hub:react', async (payload) => {
    try{
      const msgId = String(payload?.id || '');
      const emo = String(payload?.emoji || '').slice(0, 16);
      if (!msgId || !emo) return;

      // Update in Firestore if possible; else update memory history
      if (firestoreOk){
        const ref = db.collection(CHAT_COLLECTION).doc(msgId);
        await db.runTransaction(async (t) => {
          const snap = await t.get(ref);
          if (!snap.exists) return;
          const data = snap.data() || {};
          const reactions = data.reactions || {};
          reactions[emo] = (reactions[emo] || 0) + 1;
          t.set(ref, { reactions }, { merge: true });
        });
        const updated = (await db.collection(CHAT_COLLECTION).doc(msgId).get()).data();
        if (updated) io.emit('chat update', { id: msgId, reactions: updated.reactions || {} });
        return;
      }

      const item = inMemHistory.find(m => m.id === msgId);
      if (item){
        item.reactions = item.reactions || {};
        item.reactions[emo] = (item.reactions[emo] || 0) + 1;
        io.emit('chat update', { id: msgId, reactions: item.reactions });
      io.emit('hub:react', { id: msgId, reactions: item.reactions });
      }
    }catch(_){}
  });

  
  socket.on('disconnect', () => {
    console.log('🔌 [SOCKET] client disconnected');
  });
});


// ================== FANTASY MARKET (persistent, impact, max10) ==================
const FANTASY_USERS = 'fantasy_users';
const FANTASY_MARKET = 'fantasy_market';
const FANTASY_HISTORY = 'history';
const FANTASY_MAX_HOLDINGS = 10;

// Market impact parameters (tweakable)
const FANTASY_ALPHA = 0.18;  // strength
const FANTASY_SCALE = 250;   // shares scale

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

async function getLiveViewers(login){
  const user_login = String(login||'').toLowerCase().trim();
  if(!user_login) return 0;
  try{
    const token = await getTwitchToken();
    const url = `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(user_login)}`;
    const r = await fetch(url, { headers: { 'Client-ID': process.env.TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` } });
    const j = await r.json();
    const stream = j?.data?.[0];
    return Number(stream?.viewer_count || 0);
  }catch(_){
    return 0;
  }
}

// Anchor base price from viewers (simple, predictable)
async function getBasePrice(login){
  const v = await getLiveViewers(login);
  // If offline -> small base to keep market functioning
  if(!v) return 25;
  // Scale viewers to credits (soft)
  return clamp(Math.round(10 + Math.sqrt(v) * 6), 15, 5000);
}

function applyImpact(basePrice, sharesOutstanding){
  const so = Math.max(0, Number(sharesOutstanding||0));
  const mult = 1 + FANTASY_ALPHA * Math.log1p(so / FANTASY_SCALE);
  return { price: Math.max(5, Math.round(basePrice * mult)), mult };
}

async function getMarket(login){
  const key = String(login||'').toLowerCase().trim();
  if(!key) throw new Error('missing streamer');
  let sharesOutstanding = 0;

  if(firestoreOk){
    const ref = db.collection(FANTASY_MARKET).doc(key);
    const doc = await ref.get();
    if(doc.exists) sharesOutstanding = Number(doc.data()?.sharesOutstanding || 0);
    else {
      await ref.set({ login:key, sharesOutstanding:0, updatedAt: Date.now() });
      sharesOutstanding = 0;
    }
  } else {
    global.__inMemMarket = global.__inMemMarket || new Map();
    sharesOutstanding = Number(global.__inMemMarket.get(key) || 0);
  }

  const basePrice = await getBasePrice(key);
  const { price, mult } = applyImpact(basePrice, sharesOutstanding);
  return { login:key, basePrice, price, mult, sharesOutstanding };
}

async function bumpShares(login, deltaShares){
  const key = String(login||'').toLowerCase().trim();
  if(!key) return;

  if(firestoreOk){
    const ref = db.collection(FANTASY_MARKET).doc(key);
    await ref.set({
      login:key,
      sharesOutstanding: admin.firestore.FieldValue.increment(deltaShares),
      updatedAt: Date.now()
    }, { merge:true });

    const m = await getMarket(key);
    // record history point
    await db.collection(FANTASY_MARKET).doc(key).collection(FANTASY_HISTORY).add({
      ts: Date.now(),
      price: m.price,
      basePrice: m.basePrice,
      sharesOutstanding: m.sharesOutstanding,
      mult: m.mult
    });
  } else {
    global.__inMemMarket = global.__inMemMarket || new Map();
    const cur = Number(global.__inMemMarket.get(key) || 0);
    global.__inMemMarket.set(key, Math.max(0, cur + deltaShares));
  }
}

async function getUserWallet(user){
  const u = sanitizeText(user || 'Anon', 50) || 'Anon';
  if(!firestoreOk){
    global.__inMemWallet = global.__inMemWallet || new Map();
    if(!global.__inMemWallet.get(u)) global.__inMemWallet.set(u, { user:u, cash: 0, holdings: {} });
    return global.__inMemWallet.get(u);
  }
  const ref = db.collection(FANTASY_USERS).doc(u.toLowerCase());
  const doc = await ref.get();
  if(!doc.exists){
    const init = { user:u, cash: 0, holdings: {}, updatedAt: Date.now() };
    await ref.set(init);
    return init;
  }
  return doc.data();
}
async function saveUserWallet(wallet){
  if(!wallet) return;
  if(!firestoreOk){
    global.__inMemWallet.set(wallet.user, wallet);
    return;
  }
  const ref = db.collection(FANTASY_USERS).doc(String(wallet.user).toLowerCase());
  wallet.updatedAt = Date.now();
  await ref.set(wallet, { merge:true });
}

function holdingsToArray(holdings){
  return Object.entries(holdings||{}).map(([login, h])=>({ login, shares: Number(h.shares||0) }));
}

// Market endpoint for chart
app.get('/api/fantasy/market', async (req,res)=>{
  try{
    const login = sanitizeText(req.query.streamer || req.query.login || '', 50).toLowerCase();
    if(!login) return res.status(400).json({ success:false, error:'missing streamer' });

    const m = await getMarket(login);
    let history = [];
    if(firestoreOk){
      const snap = await db.collection(FANTASY_MARKET).doc(login).collection(FANTASY_HISTORY)
        .orderBy('ts','desc').limit(80).get();
      history = snap.docs.map(d=>d.data()).reverse();
    }
    res.json({ success:true, market:m, history });
  }catch(e){
    res.status(500).json({ success:false, error:e.message });
  }
});

// Profile + holdings values
// Auth helper for endpoints that must be linked to Twitch (multi-user safe)
function requireTwitchSession(req, res) {
  const u = req.session?.twitchUser;
  if (!u || (u.expiry && u.expiry <= Date.now())) {
    if (req.session) req.session.twitchUser = null;
    res.status(401).json({ success: false, error: 'Connexion Twitch obligatoire.' });
    return null;
  }
  return u;
}

// =========================================================
// BILLING (Firestore source of truth)
// - credits live in billing_users/{twitchUserId}
// - plan: free | premium
// - 1 action = 20 credits (only if not premium)
// =========================================================
const BILLING_USERS = 'billing_users';
const ACTION_COST_CREDITS = Number(process.env.ACTION_COST_CREDITS || 20);

async function getBillingDoc(twitchUser){
  if(!firestoreOk) return { credits: 0, plan: 'free', noFirestore: true };
  const id = String(twitchUser.id || twitchUser.login || twitchUser.display_name || 'unknown');
  const ref = db.collection(BILLING_USERS).doc(id);
  const snap = await ref.get();
  if(!snap.exists){
    const init = {
      userId: id,
      login: twitchUser.login || null,
      display_name: twitchUser.display_name || null,
      plan: 'free',
      credits: 0,
      entitlements: { overview:false, analytics:false, niche:false, bestTime:false },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await ref.set(init, { merge: true });
    return init;
  }
  return snap.data();
}

async function updateBillingCredits(twitchUser, delta){
  if(!firestoreOk) return;
  const id = String(twitchUser.id || twitchUser.login || twitchUser.display_name || 'unknown');
  const ref = db.collection(BILLING_USERS).doc(id);
  await ref.set({
    credits: admin.firestore.FieldValue.increment(Number(delta||0)),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}


async function setBillingCreditsAbsolute(twitchUser, credits){
  if(!firestoreOk) return;
  const id = String(twitchUser.id || twitchUser.login || twitchUser.display_name || 'unknown');
  const ref = db.collection(BILLING_USERS).doc(id);
  await ref.set({
    credits: Number(credits||0),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

async function setBillingPlan(twitchUser, plan){
  if(!firestoreOk) return;
  const id = String(twitchUser.id || twitchUser.login || twitchUser.display_name || 'unknown');
  const ref = db.collection(BILLING_USERS).doc(id);
  await ref.set({
    plan: String(plan||'free'),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

// Store (or remove) the Steam link on the Billing doc. This makes Steam persistent across browser sessions.
async function setBillingSteam(twitchUser, steam){
  if(!firestoreOk) return;
  if(!twitchUser) return;
  const id = String(twitchUser.id || twitchUser.login || twitchUser.display_name || 'unknown');
  const ref = db.collection(BILLING_USERS).doc(id);
  if(!steam){
    await ref.set({ steam: admin.firestore.FieldValue.delete(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge:true });
    return;
  }
  await ref.set({
    steam: {
      steamid: String(steam.steamid||''),
      profile: steam.profile || null,
      linkedAt: steam.linkedAt ? admin.firestore.Timestamp.fromMillis(Number(steam.linkedAt)) : admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge:true });
}

async function requireActionQuota(req, res, actionName){
  const tu = requireTwitchSession(req, res);
  if(!tu) return null;
  const b = await getBillingDoc(tu);
  const plan = String(b.plan || 'free').toLowerCase();
  if(plan === 'premium') return { ok: true, plan, credits: Number(b.credits||0) };

  const credits = Number(b.credits||0);
  if(credits < ACTION_COST_CREDITS){
    res.status(402).json({ success:false, error:`Crédits insuffisants (${credits}). Action requiert ${ACTION_COST_CREDITS} crédits.`, code:'NO_CREDITS' });
    return null;
  }

  // Deduct now (server-side enforced)
  await updateBillingCredits(tu, -ACTION_COST_CREDITS);
  return { ok: true, plan, credits: credits - ACTION_COST_CREDITS };
}

app.get('/api/fantasy/profile', async (req,res)=>{
  try{
    const tu = requireTwitchSession(req, res);
    if(!tu) return;
    const user = sanitizeText(tu.login || tu.display_name || tu.id || 'Anon', 50) || 'Anon';
    const w = await getUserWallet(user);

    const holdingsArr = holdingsToArray(w.holdings);
    const enriched = [];
    for(const it of holdingsArr){
      const m = await getMarket(it.login);
      enriched.push({
        login: it.login,
        shares: it.shares,
        price: m.price,
        value: it.shares * m.price
      });
    }

        const bill = await getBillingDoc(tu);
    // Single source of truth: billing credits == market cash
    let cash = Number(bill.credits||0);

    // One-time migration: if billing credits are 0 but legacy fantasy wallet cash exists, sync it into billing.
    if(cash <= 0 && Number(w.cash||0) > 0){
      cash = Number(w.cash||0);
      try{ await setBillingCreditsAbsolute(tu, cash); }catch(_){ }
    }

    // keep wallet cash in sync for leaderboard compatibility (do not erase holdings)
    try{ w.cash = cash; await saveUserWallet(w); }catch(_){ }res.json({ success:true, user: w.user, plan: bill.plan || 'free', credits: cash, cash, holdings: enriched });
  }catch(e){
    res.status(500).json({ success:false, error:e.message });
  }
});

// Invest (amount in credits -> shares at current market price)
app.post('/api/fantasy/invest', async (req,res)=>{
  try{
    const tu = requireTwitchSession(req, res);
    if(!tu) return;
    const user = sanitizeText(tu.login || tu.display_name || tu.id || 'Anon', 50) || 'Anon';
    // Market action consumes credits unless Premium
    const quota = await requireActionQuota(req, res, 'market_trade');
    if(!quota) return;
    const login = sanitizeText(req.body.streamer || '', 50).toLowerCase();
    const amount = Number(req.body.amount||0);

    if(!login || !amount || amount<=0) return res.status(400).json({ success:false, error:'Streamer + montant requis.' });

    const w = await getUserWallet(user);

    const bill = await getBillingDoc(tu);
    const credits = Number(bill.credits||0);
    if(amount > credits) return res.status(400).json({ success:false, error:'Crédits insuffisants.' });

    const isNew = !w.holdings || !w.holdings[login];
    const distinct = Object.keys(w.holdings || {}).length;
    if(isNew && distinct >= FANTASY_MAX_HOLDINGS){
      return res.status(400).json({ success:false, error:`Limite: ${FANTASY_MAX_HOLDINGS} streamers max.` });
    }

    const m = await getMarket(login);
    const shares = Math.max(1, Math.floor(amount / m.price));
    const cost = shares * m.price;

        // Deduct from billing credits (single source of truth)
    await updateBillingCredits(tu, -cost);
    // Keep fantasy wallet cash mirrored (for leaderboard)
    w.cash = credits - cost;
    w.holdings = w.holdings || {};
    w.holdings[login] = w.holdings[login] || { shares: 0 };
    w.holdings[login].shares += shares;

    await saveUserWallet(w);
    await bumpShares(login, shares);

        res.json({ success:true, shares, cost, price: m.price });
  }catch(e){
    res.status(500).json({ success:false, error:e.message });
  }
});

// Sell (amount in credits -> shares to sell)
app.post('/api/fantasy/sell', async (req,res)=>{
  try{
    const tu = requireTwitchSession(req, res);
    if(!tu) return;
    const user = sanitizeText(tu.login || tu.display_name || tu.id || 'Anon', 50) || 'Anon';
    // Market action consumes credits unless Premium
    const quota = await requireActionQuota(req, res, 'market_trade');
    if(!quota) return;
    const login = sanitizeText(req.body.streamer || '', 50).toLowerCase();
    const amount = Number(req.body.amount||0);

    if(!login || !amount || amount<=0) return res.status(400).json({ success:false, error:'Streamer + montant requis.' });

    const w = await getUserWallet(user);

    const bill = await getBillingDoc(tu);
    const credits = Number(bill.credits||0);

    const have = Number(w.holdings?.[login]?.shares || 0);
    if(!have) return res.status(400).json({ success:false, error:'Aucune position sur ce streamer.' });

    const m = await getMarket(login);
    const sharesToSell = clamp(Math.floor(amount / m.price), 1, have);
    const proceeds = sharesToSell * m.price;

    w.holdings[login].shares -= sharesToSell;
    if(w.holdings[login].shares <= 0) delete w.holdings[login];
        // Credit proceeds to billing credits (single source of truth)
    await updateBillingCredits(tu, +proceeds);
    // Keep fantasy wallet cash mirrored (for leaderboard)
    w.cash = credits + proceeds;

    await saveUserWallet(w);
    await bumpShares(login, -sharesToSell);

    res.json({ success:true, shares: sharesToSell, proceeds, price: m.price });
  }catch(e){
    res.status(500).json({ success:false, error:e.message });
  }
});

// Leaderboard by net worth
app.get('/api/fantasy/leaderboard', async (req,res)=>{
  try{
    let users = [];
    if(firestoreOk){
      const snap = await db.collection(FANTASY_USERS).limit(50).get();
      users = snap.docs.map(d=>d.data());
    }else{
      global.__inMemWallet = global.__inMemWallet || new Map();
      users = Array.from(global.__inMemWallet.values());
    }

    const items = [];
    for(const u of users){
      const holdingsArr = holdingsToArray(u.holdings);
      let worth = Number(u.cash||0);
      for(const it of holdingsArr){
        const m = await getMarket(it.login);
        worth += it.shares * m.price;
      }
      items.push({ user: u.user, netWorth: worth });
    }
    items.sort((a,b)=>b.netWorth-a.netWorth);
    res.json({ success:true, items: items.slice(0,20) });
  }catch(e){
    res.status(500).json({ success:false, error:e.message });
  }
});

// =========================================================
// BILLING API
// =========================================================
app.get('/api/billing/me', async (req,res)=>{
  try{
    const tu = requireTwitchSession(req, res);
    if(!tu) return;
    let b = await getBillingDoc(tu);

    // Migration safety: if billing credits are 0 but fantasy wallet cash exists, sync it once.
    if(Number(b.credits||0) <= 0){
      try{
        const userKey = sanitizeText(tu.login || tu.display_name || tu.id || 'Anon', 50) || 'Anon';
        const w = await getUserWallet(userKey);
        if(Number(w.cash||0) > 0){
          await setBillingCreditsAbsolute(tu, Number(w.cash||0));
          b = await getBillingDoc(tu);
        }
      }catch(_){}
    }

    const steam = b.steam && b.steam.steamid ? { connected:true, steamid:b.steam.steamid, profile:b.steam.profile || null } : { connected:false };
    res.json({ success:true, plan: b.plan || 'free', credits: Number(b.credits||0), entitlements: b.entitlements || {}, steam });
  }catch(e){
    res.status(500).json({ success:false, error:e.message });
  }
});

// Unlock a premium feature with credits (200 by default)
app.post('/api/billing/unlock-feature', async (req,res)=>{
  try{
    const tu = requireTwitchSession(req, res);
    if(!tu) return;
    if(!firestoreOk) return res.status(503).json({ success:false, error:'firestore_unavailable' });

    const feature = String((req.body && req.body.feature) || '').trim();
    const cost = Number((req.body && req.body.cost) || 200);

    const allowed = ['overview','analytics','niche','bestTime'];
    if(!allowed.includes(feature)) return res.status(400).json({ success:false, error:'invalid_feature' });

    const id = String(tu.id || tu.login || tu.display_name || 'unknown');
    const ref = db.collection(BILLING_USERS).doc(id);

    await db.runTransaction(async (tx)=>{
      const snap = await tx.get(ref);
      const cur = snap.exists ? snap.data() : {};
      const plan = String(cur.plan || 'free').toLowerCase();
      const ent = Object.assign({ overview:false, analytics:false, niche:false, bestTime:false }, cur.entitlements || {});
      const credits = Number(cur.credits || 0);

      // Premium: just mark as unlocked
      if(plan === 'premium'){
        ent[feature] = true;
        tx.set(ref, { entitlements: ent, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge:true });
        return;
      }

      if(ent[feature] === true) return; // already unlocked
      if(credits < cost) throw new Error('credits_insufficient');

      ent[feature] = true;
      tx.set(ref, {
        credits: credits - cost,
        entitlements: ent,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge:true });
    });

    const b = await ref.get();
    const data = b.data() || {};
    res.json({ success:true, credits:Number(data.credits||0), plan:data.plan||'free', entitlements:data.entitlements||{} });
  }catch(e){
    const msg = e.message === 'credits_insufficient' ? 'credits_insufficient' : e.message;
    res.status(400).json({ success:false, error: msg });
  }
});

// Stripe (optional). If not configured, returns a clear error.
let stripe = null;
try{
  if(process.env.STRIPE_SECRET_KEY){
    // eslint-disable-next-line global-require
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
}catch(_){ stripe = null; }

app.post('/api/billing/create-checkout-session', async (req,res)=>{
  try{
    const tu = requireTwitchSession(req, res);
    if(!tu) return;

    if(!stripe) return res.status(501).json({ success:false, error:'Stripe non configuré (STRIPE_SECRET_KEY manquant).'});

    const sku = String(req.body?.sku || '').trim();
    const success_url = (process.env.BILLING_SUCCESS_URL || (req.protocol + '://' + req.get('host') + '/pricing'));
    const cancel_url  = (process.env.BILLING_CANCEL_URL  || (req.protocol + '://' + req.get('host') + '/pricing'));

    // Map sku -> priceId + metadata
    const map = {
      credits_500:  { price: process.env.STRIPE_PRICE_CREDITS_500,  mode:'payment',  credits: 500 },
      credits_1250: { price: process.env.STRIPE_PRICE_CREDITS_1250, mode:'payment',  credits: 1250 },
      premium_monthly: { price: process.env.STRIPE_PRICE_PREMIUM_MONTHLY, mode:'subscription', plan:'premium' }
    };
    const item = map[sku];
    if(!item || !item.price){
      return res.status(400).json({ success:false, error:'SKU invalide ou Price ID manquant côté serveur.' });
    }

    const session = await stripe.checkout.sessions.create({
      mode: item.mode,
      line_items: [{ price: item.price, quantity: 1 }],
      success_url: success_url + '?success=1',
      cancel_url: cancel_url + '?canceled=1',
      client_reference_id: String(tu.id || tu.login || ''),
      metadata: {
        sku,
        twitch_user_id: String(tu.id || ''),
        twitch_login: String(tu.login || ''),
        credits: item.credits ? String(item.credits) : '',
        plan: item.plan || ''
      }
    });

    res.json({ success:true, url: session.url });
  }catch(e){
    res.status(500).json({ success:false, error:e.message });
  }
});

// Dev helper: grant credits / set plan (disabled in production)
if(process.env.NODE_ENV !== 'production'){
  app.post('/api/billing/dev/grant', async (req,res)=>{
    try{
      const tu = requireTwitchSession(req, res);
      if(!tu) return;
      const credits = Number(req.body?.credits||0);
      const plan = req.body?.plan ? String(req.body.plan) : null;
      if(credits) await updateBillingCredits(tu, credits);
      if(plan) await setBillingPlan(tu, plan);
      const b = await getBillingDoc(tu);
      res.json({ success:true, plan: b.plan||'free', credits: Number(b.credits||0) });
    }catch(e){
      res.status(500).json({ success:false, error:e.message });
    }
  });
}


server.listen(PORT, () => {
  console.log(`\n🚀 [SERVER] Démarré sur http://localhost:${PORT}`);
  console.log("✅ Routes prêtes");
});


// =========================================================
// 9. SAFE ERROR HANDLER (évite crash silencieux)
// =========================================================
app.use((err, req, res, next) => {
  try{
    console.error('[ERROR]', req.__rid || '-', err && (err.stack || err.message || err));
  }catch(_){}
  if(res.headersSent) return next(err);
  return res.status(500).json({ success:false, error:'internal_error', rid: req.__rid || null });
});
