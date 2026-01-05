require('dotenv').config();

const express = require('express');
const http = require('http');
const session = require('express-session');
const MemoryStore = require('memorystore')(session);
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const { Server } = require('socket.io');

const admin = require('firebase-admin');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });

/* ----------------- FIREBASE ----------------- */
let db = null;
try {
  admin.initializeApp({
    credential: admin.credential.applicationDefault()
  });
  db = admin.firestore();
  console.log('🔥 Firestore connected');
} catch (e) {
  console.warn('⚠️ Firestore not available');
}

/* ----------------- MIDDLEWARE ----------------- */
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json());
app.use(cookieParser());

app.use(session({
  store: new MemoryStore({ checkPeriod: 86400000 }),
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

/* ----------------- STATIC ----------------- */
app.use(express.static(__dirname));

/* ----------------- AUTH MOCK (Twitch-ready) -----------------
   Pour l’instant : 1 user = 1 session
   Tu pourras brancher OAuth Twitch ensuite sans casser le reste
-------------------------------------------------------------- */
app.get('/api/me', (req, res) => {
  if (!req.session.user) {
    req.session.user = {
      id: 'user_' + Math.random().toString(36).slice(2),
      name: 'Streamer'
    };
  }
  res.json(req.session.user);
});

/* ----------------- CHAT HUB ----------------- */
io.on('connection', (socket) => {
  console.log('🔌 client connected');

  socket.emit('hub:init', { ok: true });

  socket.on('hub:message', async (msg) => {
    const out = {
      user: msg.user || 'User',
      text: msg.text || '',
      ts: Date.now()
    };

    if (db) {
      await db.collection('chat').add(out);
    }

    io.emit('hub:message', out);
  });

  socket.on('disconnect', () => {
    console.log('❌ client disconnected');
  });
});

/* ----------------- FANTASY MARKET ----------------- */
app.get('/api/fantasy/market', async (req, res) => {
  const streamer = (req.query.streamer || '').toLowerCase();
  if (!streamer) return res.status(400).json({ error: 'missing streamer' });

  let data = { price: 100, volume: 0 };

  if (db) {
    const ref = db.collection('market').doc(streamer);
    const snap = await ref.get();
    if (snap.exists) data = snap.data();
  }

  res.json({ success: true, data });
});

app.post('/api/fantasy/invest', async (req, res) => {
  const { streamer, amount } = req.body;
  if (!streamer || !amount) return res.status(400).json({ error: 'bad request' });

  if (db) {
    const ref = db.collection('market').doc(streamer.toLowerCase());
    await ref.set({
      price: admin.firestore.FieldValue.increment(amount / 10),
      volume: admin.firestore.FieldValue.increment(amount)
    }, { merge: true });
  }

  res.json({ success: true });
});

/* ----------------- START ----------------- */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('🚀 Server running on', PORT);
});
