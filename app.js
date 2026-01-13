/**
 * StreamerHub — minimal server (stable static + Twitch auth + Billing Firestore)
 * Goal: keep NicheOptimizer UI untouched, add only billing + /pricing.
 */
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const MemoryStore = require('memorystore')(session);
const cookieParser = require('cookie-parser');
const fetch = require('node-fetch');
const path = require('path');
const crypto = require('crypto');

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const admin = require('firebase-admin');

const PORT = process.env.PORT || 10000;
const APP_ORIGIN = process.env.APP_ORIGIN || ''; // optional, for CORS if needed

// ---------------- Firebase Admin init ----------------
function parseFirebaseKey(raw){
  if (!raw) return null;
  // allow base64-encoded json too
  try{
    if (raw.trim().startsWith('{')) return JSON.parse(raw);
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    if (decoded.trim().startsWith('{')) return JSON.parse(decoded);
  }catch(_){}
  return null;
}

const firebaseKey = parseFirebaseKey(process.env.FIREBASE_SERVICE_KEY);
if (!admin.apps.length){
  if (firebaseKey){
    admin.initializeApp({ credential: admin.credential.cert(firebaseKey) });
  } else {
    console.warn('⚠️ FIREBASE_SERVICE_KEY missing: billing will fall back to in-memory store (dev).');
  }
}
const db = admin.apps.length ? admin.firestore() : null;

// ---------------- Express app ----------------
const app = express();

app.use(helmet({
  contentSecurityPolicy: false // keep compatible with existing UI; you can enable later
}));

app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(rateLimit({ windowMs: 60_000, max: 300 }));

app.use(session({
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 14
  },
  store: new MemoryStore({ checkPeriod: 1000 * 60 * 60 * 24 }),
  secret: process.env.SESSION_SECRET || 'dev_secret_change_me',
  resave: false,
  saveUninitialized: false
}));

// Static public (CRITICAL for /assets/*)
app.use(express.static(path.join(__dirname, 'public')));

// --------- Helpers ---------
function requireTwitch(req, res, next){
  if (!req.session || !req.session.twitch || !req.session.twitch.id){
    return res.status(401).json({ error: 'Connexion Twitch requise' });
  }
  return next();
}

function userKey(req){
  return req.session?.twitch?.id || null;
}

const inMemBilling = global.__inMemBilling || (global.__inMemBilling = new Map());

async function getOrInitBilling(twitchId){
  const DEFAULT_CREDITS = 1200;
  const now = Date.now();

  if (!twitchId){
    return { plan: 'free', credits: 0, createdAt: now, updatedAt: now };
  }

  // Firestore mode
  if (db){
    const ref = db.collection('billing_users').doc(String(twitchId));
    const snap = await ref.get();
    if (!snap.exists){
      const doc = { plan: 'free', credits: DEFAULT_CREDITS, createdAt: now, updatedAt: now };
      await ref.set(doc, { merge: true });
      await db.collection('billing_ledger').add({ twitchId: String(twitchId), type:'grant', amount: DEFAULT_CREDITS, reason:'welcome', at: now });
      return doc;
    }
    const data = snap.data() || {};
    // ensure defaults
    const plan = data.plan || 'free';
    const credits = Number.isFinite(data.credits) ? data.credits : Number(data.credits || 0);
    return { ...data, plan, credits };
  }

  // in-memory fallback
  if (!inMemBilling.has(twitchId)){
    inMemBilling.set(twitchId, { plan:'free', credits: DEFAULT_CREDITS, createdAt: now, updatedAt: now });
  }
  return inMemBilling.get(twitchId);
}

async function saveBilling(twitchId, patch, ledger){
  const now = Date.now();
  if (!twitchId) return;

  if (db){
    const ref = db.collection('billing_users').doc(String(twitchId));
    await ref.set({ ...patch, updatedAt: now }, { merge:true });
    if (ledger){
      await db.collection('billing_ledger').add({ twitchId: String(twitchId), at: now, ...ledger });
    }
    return;
  }
  const cur = await getOrInitBilling(twitchId);
  inMemBilling.set(twitchId, { ...cur, ...patch, updatedAt: now });
}

// ---------------- Routes (pages) ----------------
app.get('/', (req, res) => {
  return res.sendFile(path.join(__dirname, 'public', 'NicheOptimizer.html'));
});

app.get('/pricing', (req, res) => {
  return res.sendFile(path.join(__dirname, 'public', 'pricing.html'));
});

// ---------------- Twitch OAuth ----------------
// You must set: TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_REDIRECT_URI
function twitchEnvOk(){
  return !!(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET && process.env.TWITCH_REDIRECT_URI);
}

app.get('/auth/twitch', (req, res) => {
  if (!twitchEnvOk()){
    return res.status(500).send('Twitch OAuth non configuré (env manquantes).');
  }
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;
  const scope = encodeURIComponent('user:read:email'); // minimal
  const redirect = encodeURIComponent(process.env.TWITCH_REDIRECT_URI);
  const url = `https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=${process.env.TWITCH_CLIENT_ID}&redirect_uri=${redirect}&scope=${scope}&state=${state}`;
  return res.redirect(url);
});

app.get('/auth/twitch/callback', async (req, res) => {
  try{
    if (!twitchEnvOk()){
      return res.status(500).send('Twitch OAuth non configuré.');
    }
    const { code, state } = req.query;
    if (!code || !state || state !== req.session.oauthState){
      return res.status(400).send('OAuth state invalide.');
    }
    // exchange code -> token
    const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type':'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.TWITCH_CLIENT_ID,
        client_secret: process.env.TWITCH_CLIENT_SECRET,
        code: String(code),
        grant_type: 'authorization_code',
        redirect_uri: process.env.TWITCH_REDIRECT_URI
      })
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenJson?.message || 'Token exchange failed');

    const accessToken = tokenJson.access_token;
    // fetch user
    const uRes = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${accessToken}`
      }
    });
    const uJson = await uRes.json();
    const user = uJson?.data?.[0];
    if (!user?.id) throw new Error('User fetch failed');

    req.session.twitch = {
      id: user.id,
      login: user.login,
      display_name: user.display_name,
      profile_image_url: user.profile_image_url,
      access_token: accessToken
    };

    // init free credits on first login
    await getOrInitBilling(user.id);

    // back to app
    return res.redirect('/');
  }catch(e){
    console.error('Twitch callback error:', e);
    return res.status(500).send('Connexion Twitch échouée.');
  }
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(()=> res.json({ ok:true }));
});

app.get('/api/auth/me', (req, res) => {
  const u = req.session?.twitch;
  if (!u?.id) return res.json({ loggedIn:false });
  return res.json({ loggedIn:true, user:{ id:u.id, login:u.login, display_name:u.display_name, profile_image_url:u.profile_image_url } });
});

// ---------------- Billing API ----------------
app.get('/api/billing/status', requireTwitch, async (req, res) => {
  const id = userKey(req);
  const st = await getOrInitBilling(id);
  const plan = (st.plan || 'free').toLowerCase();
  const credits = Number(st.credits || 0);
  const actions = plan === 'premium' ? null : Math.floor(credits / 20);
  return res.json({ plan, credits, actions });
});

app.get('/api/billing/packs', (req, res) => {
  return res.json([
    { id:'starter', name:'Starter', credits:200, actions:10, price:'4,99 €', isBest:false },
    { id:'core', name:'Core', credits:500, actions:25, price:'9,99 €', isBest:true },
    { id:'power', name:'Power', credits:1200, actions:60, price:'19,99 €', isBest:false }
  ]);
});

// NOTE: Payment module placeholder. For now we keep a "demo purchase" endpoint.
// You can replace this with Stripe Checkout later without changing frontend contract.
app.post('/api/billing/buy-pack', requireTwitch, async (req, res) => {
  const id = userKey(req);
  const { packId } = req.body || {};
  const map = { starter:200, core:500, power:1200 };
  const add = map[String(packId||'')];
  if (!add) return res.status(400).json({ error:'Pack invalide' });

  const cur = await getOrInitBilling(id);
  const credits = Number(cur.credits||0) + add;
  const plan = (cur.plan || 'free') === 'premium' ? 'premium' : 'free';
  await saveBilling(id, { credits, plan }, { type:'purchase_demo', amount:add, packId:String(packId) });
  return res.json({ ok:true, credits });
});

app.post('/api/billing/subscribe-premium', requireTwitch, async (req, res) => {
  const id = userKey(req);
  await saveBilling(id, { plan:'premium' }, { type:'premium_demo' });
  return res.json({ ok:true, plan:'premium' });
});

app.post('/api/billing/cancel-premium', requireTwitch, async (req, res) => {
  const id = userKey(req);
  await saveBilling(id, { plan:'free' }, { type:'premium_cancel_demo' });
  return res.json({ ok:true, plan:'free' });
});

app.post('/api/billing/spend', requireTwitch, async (req, res) => {
  const id = userKey(req);
  const { feature, cost, ttlHours } = req.body || {};
  const c = Number(cost || 20);
  const st = await getOrInitBilling(id);
  const plan = (st.plan || 'free').toLowerCase();

  if (plan === 'premium'){
    return res.json({ ok:true, plan:'premium', credits: st.credits || 0 });
  }

  const credits = Number(st.credits || 0);
  if (credits < c) return res.status(402).json({ error:'Crédits insuffisants' });

  const newCredits = credits - c;
  await saveBilling(id, { credits: newCredits }, { type:'spend', feature:String(feature||'unknown'), amount:-c });

  // session unlock window (for gating UX)
  if (feature){
    const ttl = Number(ttlHours || 24) * 60 * 60 * 1000;
    req.session.unlocks = req.session.unlocks || {};
    req.session.unlocks[String(feature)] = Date.now() + ttl;
  }

  return res.json({ ok:true, credits: newCredits });
});

app.get('/api/billing/unlocks', requireTwitch, (req,res)=>{
  const u = req.session.unlocks || {};
  const now = Date.now();
  const active = {};
  for (const k of Object.keys(u)){
    if (Number(u[k]) > now) active[k]=u[k];
  }
  return res.json({ unlocks: active });
});

// Example protected endpoint for the "Market" (you can extend)
app.get('/api/market/status', requireTwitch, async (req, res) => {
  const id = userKey(req);
  const st = await getOrInitBilling(id);
  const plan = (st.plan||'free').toLowerCase();
  const unlockedUntil = req.session.unlocks?.market || 0;
  const unlocked = plan === 'premium' || Date.now() < Number(unlockedUntil||0);
  return res.json({ unlocked, plan });
});

// ---------------- Start ----------------
app.listen(PORT, () => {
  console.log(`✅ StreamerHub server on http://localhost:${PORT}`);
});
