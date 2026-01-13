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
      frameSrc: ["'self'", "https://player.twitch.tv", "https://www.twitch.tv", "https://embed.twitch.tv"],
    }
  } : false
}));

// Rate limit léger sur /api (évite spam)
app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 300 }));

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

app.use(express.static(path.join(__dirname, 'public')));
// Page principale (UI)
// Page principale (UI) — toujours servie depuis /public
app.get(['/', '/NicheOptimizer.html'], (req, res) => {
  const uiPath = path.join(__dirname, 'public', (process.env.UI_FILE || 'NicheOptimizer.html'));

// Pricing page (credits + premium)
app.get('/pricing', (req, res) => {
  const p = path.join(__dirname, 'public', 'pricing.html');
  if (!fs.existsSync(p)) return res.status(500).send('Pricing introuvable sur le serveur.');
  return res.sendFile(p);
});
  if (!fs.existsSync(uiPath)) return res.status(500).send('UI introuvable sur le serveur.');
  return res.sendFile(uiPath);
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


// =========================================================
// 3B. BILLING (CRÉDITS + PREMIUM) — Firestore source unique
// =========================================================
const BILLING_USERS = 'billing_users';
const BILLING_LEDGER = 'billing_ledger';
const FREE_START_CREDITS = Number(process.env.FREE_START_CREDITS || 1200);
const ACTION_COST = Number(process.env.ACTION_COST || 20);
const BILLING_DEMO_MODE = (process.env.BILLING_DEMO_MODE || 'true').toLowerCase() === 'true';

// Twitch required middleware (market + billing)
function requireTwitch(req, res, next){
  const u = req.session?.twitchUser;
  if (u && (!u.expiry || u.expiry > Date.now())) return next();
  return res.status(401).json({ success:false, error:'Twitch login required', code:'TWITCH_LOGIN_REQUIRED' });
}

async function getOrInitBillingForUser(twitchUser){
  const uid = String(twitchUser.id);
  const ref = db.collection(BILLING_USERS).doc(uid);
  const snap = await ref.get();
  if (!snap.exists){
    const doc = {
      uid,
      login: twitchUser.login || null,
      display_name: twitchUser.display_name || null,
      plan: 'free',
      credits: FREE_START_CREDITS,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await ref.set(doc, { merge:false });
    await db.collection(BILLING_LEDGER).add({
      uid,
      ts: Date.now(),
      type: 'grant_start',
      creditsDelta: FREE_START_CREDITS,
      meta: { reason: 'free_start' }
    });
    return doc;
  }
  const d = snap.data() || {};
  // Ensure baseline fields exist
  if (typeof d.credits !== 'number' || !d.plan){
    const patched = {
      plan: d.plan || 'free',
      credits: typeof d.credits === 'number' ? d.credits : FREE_START_CREDITS,
      updatedAt: Date.now()
    };
    await ref.set(patched, { merge:true });
    return { ...d, ...patched };
  }
  return d;
}

function computeActionsAvailable(plan, credits){
  if (String(plan) === 'premium' || String(plan) === 'pro') return -1; // infinity
  const c = Number(credits || 0);
  return Math.max(0, Math.floor(c / ACTION_COST));
}

// Status: plan + credits + actions
app.get('/api/billing/status', async (req, res) => {
  try{
    const tu = req.session?.twitchUser;
    if (!tu || (tu.expiry && tu.expiry <= Date.now())){
      return res.json({ success:true, needs_login:true, plan:'free', credits:0, actions:0, action_cost: ACTION_COST });
    }
    const b = await getOrInitBillingForUser(tu);
    return res.json({
      success:true,
      needs_login:false,
      plan: b.plan || 'free',
      credits: Number(b.credits || 0),
      actions: computeActionsAvailable(b.plan, b.credits),
      action_cost: ACTION_COST,
      free_start_credits: FREE_START_CREDITS
    });
  }catch(e){
    res.status(500).json({ success:false, error:e.message });
  }
});

// Packs (frontend display)
app.get('/api/billing/packs', (req,res)=>{
  res.json({
    success:true,
    action_cost: ACTION_COST,
    packs: [
      { id:'starter', credits:200, price_eur:4.99, label:'Starter' },
      { id:'core', credits:500, price_eur:9.99, label:'Core' },
      { id:'power', credits:1200, price_eur:19.99, label:'Power' }
    ]
  });
});

// Buy pack (demo mode only unless you wire Stripe)
app.post('/api/billing/buy-pack', requireTwitch, async (req,res)=>{
  try{
    const packId = String(req.body?.packId || '');
    const packs = { starter:200, core:500, power:1200 };
    const credits = packs[packId];
    if (!credits) return res.status(400).json({ success:false, error:'packId invalid' });

    if (!BILLING_DEMO_MODE){
      return res.status(501).json({ success:false, error:'Payment not configured (Stripe)', code:'PAYMENT_NOT_CONFIGURED' });
    }

    const tu = req.session.twitchUser;
    const ref = db.collection(BILLING_USERS).doc(String(tu.id));
    await ref.set({ updatedAt: Date.now() }, { merge:true });
    await db.runTransaction(async (tx)=>{
      const snap = await tx.get(ref);
      const cur = snap.exists ? snap.data() : { plan:'free', credits:0 };
      const next = Number(cur.credits||0) + credits;
      tx.set(ref, { credits: next, updatedAt: Date.now() }, { merge:true });
    });
    await db.collection(BILLING_LEDGER).add({ uid:String(tu.id), ts:Date.now(), type:'buy_pack_demo', creditsDelta: credits, meta:{ packId } });

    const b2 = await getOrInitBillingForUser(tu);
    res.json({ success:true, credits: Number(b2.credits||0), actions: computeActionsAvailable(b2.plan, b2.credits) });
  }catch(e){
    res.status(500).json({ success:false, error:e.message });
  }
});

// Subscribe premium (demo mode)
app.post('/api/billing/subscribe-premium', requireTwitch, async (req,res)=>{
  try{
    if (!BILLING_DEMO_MODE){
      return res.status(501).json({ success:false, error:'Subscription not configured (Stripe)', code:'SUBSCRIPTION_NOT_CONFIGURED' });
    }
    const tu = req.session.twitchUser;
    const ref = db.collection(BILLING_USERS).doc(String(tu.id));
    await ref.set({ plan:'premium', updatedAt: Date.now() }, { merge:true });
    await db.collection(BILLING_LEDGER).add({ uid:String(tu.id), ts:Date.now(), type:'subscribe_demo', creditsDelta: 0 });
    const b = await getOrInitBillingForUser(tu);
    res.json({ success:true, plan:b.plan, credits:Number(b.credits||0), actions: computeActionsAvailable(b.plan, b.credits) });
  }catch(e){
    res.status(500).json({ success:false, error:e.message });
  }
});

// Spend one action (20 credits) to unlock premium features temporarily
app.post('/api/billing/spend', requireTwitch, async (req,res)=>{
  try{
    const reason = String(req.body?.reason || 'action');
    const tu = req.session.twitchUser;
    const ref = db.collection(BILLING_USERS).doc(String(tu.id));

    let result = null;
    await db.runTransaction(async (tx)=>{
      const snap = await tx.get(ref);
      const cur = snap.exists ? snap.data() : { plan:'free', credits: FREE_START_CREDITS };
      const plan = cur.plan || 'free';
      if (plan === 'premium' || plan === 'pro'){
        result = { plan, credits: Number(cur.credits||0), actions: -1 };
        return;
      }
      const curCredits = Number(cur.credits||0);
      if (curCredits < ACTION_COST){
        throw new Error('Crédits insuffisants');
      }
      const nextCredits = curCredits - ACTION_COST;
      tx.set(ref, { credits: nextCredits, updatedAt: Date.now() }, { merge:true });
      result = { plan, credits: nextCredits, actions: computeActionsAvailable(plan, nextCredits) };
    });

    await db.collection(BILLING_LEDGER).add({
      uid:String(tu.id), ts:Date.now(), type:'spend_action', creditsDelta: -ACTION_COST, meta:{ reason }
    });

    res.json({ success:true, ...result, action_cost: ACTION_COST });
  }catch(e){
    res.status(400).json({ success:false, error:e.message });
  }
});

// Require Twitch auth on fantasy market APIs
app.use('/api/fantasy', requireTwitch);


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

    // Twitch: search/categories?query=...&first=100
    const d = await twitchAPI(`search/categories?query=${encodeURIComponent(q)}&first=50`);
    const categories = (d.data || []).map(g => ({
      id: g.id,
      name: g.name,
      box_art_url: (g.box_art_url || '').replace('{width}', '285').replace('{height}', '380')
    }));
    return res.json({ success: true, categories });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
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

function requireFirestore(res){
  if(!firestoreOk){
    res.status(503).json({ success:false, error:'Firestore not initialized. Configure Firebase Admin credentials.' });
    return false;
  }
  return true;
}


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
    if(!global.__inMemWallet.get(u)) global.__inMemWallet.set(u, { user:u, cash: 10000, holdings: {} });
    return global.__inMemWallet.get(u);
  }
  const ref = db.collection(FANTASY_USERS).doc(u.toLowerCase());
  const doc = await ref.get();
  if(!doc.exists){
    const init = { user:u, cash: 10000, holdings: {}, updatedAt: Date.now() };
    await ref.set(init);
    return init;
  }
  return doc.data();
}
async function saveUserWallet(wallet){
  if(!wallet) return;
  if(!firestoreOk){ throw new Error('Firestore not initialized'); }
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
    if(!requireFirestore(res)) return;

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
app.get('/api/fantasy/profile', async (req,res)=>{
  try{
    const user = sanitizeText(req.query.user || 'Anon', 50) || 'Anon';
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

    res.json({ success:true, user: w.user, cash: Number(w.cash||0), holdings: enriched });
  }catch(e){
    res.status(500).json({ success:false, error:e.message });
  }
});

// Invest (amount in credits -> shares at current market price)
app.post('/api/fantasy/invest', async (req,res)=>{
  try{
    const user = sanitizeText(req.body.user || 'Anon', 50) || 'Anon';
    const login = sanitizeText(req.body.streamer || '', 50).toLowerCase();
    const amount = Number(req.body.amount||0);

    if(!login || !amount || amount<=0) return res.status(400).json({ success:false, error:'Streamer + montant requis.' });

    const w = await getUserWallet(user);
    if(amount > Number(w.cash||0)) return res.status(400).json({ success:false, error:'Solde insuffisant.' });

    const isNew = !w.holdings || !w.holdings[login];
    const distinct = Object.keys(w.holdings || {}).length;
    if(isNew && distinct >= FANTASY_MAX_HOLDINGS){
      return res.status(400).json({ success:false, error:`Limite: ${FANTASY_MAX_HOLDINGS} streamers max.` });
    }

    const m = await getMarket(login);
    const shares = Math.max(1, Math.floor(amount / m.price));
    const cost = shares * m.price;

    w.cash = Number(w.cash||0) - cost;
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
    if(!requireFirestore(res)) return;

    const user = sanitizeText(req.body.user || 'Anon', 50) || 'Anon';
    const login = sanitizeText(req.body.streamer || '', 50).toLowerCase();
    const amount = Number(req.body.amount||0);

    if(!login || !amount || amount<=0) return res.status(400).json({ success:false, error:'Streamer + montant requis.' });

    const w = await getUserWallet(user);
    const have = Number(w.holdings?.[login]?.shares || 0);
    if(!have) return res.status(400).json({ success:false, error:'Aucune position sur ce streamer.' });

    const m = await getMarket(login);
    const sharesToSell = clamp(Math.floor(amount / m.price), 1, have);
    const proceeds = sharesToSell * m.price;

    w.holdings[login].shares -= sharesToSell;
    if(w.holdings[login].shares <= 0) delete w.holdings[login];
    w.cash = Number(w.cash||0) + proceeds;

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
    if(!requireFirestore(res)) return;

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


server.listen(PORT, () => {
  console.log(`\n🚀 [SERVER] Démarré sur http://localhost:${PORT}`);
  console.log("✅ Routes prêtes");
});
