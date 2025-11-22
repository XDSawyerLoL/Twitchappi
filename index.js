import express from 'express';
import cors from 'cors';
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

// Initialisation Firebase Admin
const serviceAccount = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'serviceAccountKey.json'), 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Express
const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 10000;

// Test
app.get('/', (req, res) => res.send('⚡ Twitch Scanner Backend OK'));

// Endpoint pour streamer aléatoire
app.get('/random', async (req, res) => {
  try {
    const snapshot = await db.collection('submitted_streamers').get();
    const streamers = snapshot.docs.map(doc => doc.data());
    const randomStreamer = streamers[Math.floor(Math.random() * streamers.length)] || null;
    res.json({ streamer: randomStreamer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint boost
app.post('/boost', async (req, res) => {
  const { username, userId } = req.body;
  if (!username || !userId) return res.status(400).json({ error: 'username et userId requis' });

  try {
    await db.collection('submitted_streamers').doc(username.toLowerCase()).set({
      username: username.toLowerCase(),
      userId,
      timestamp: admin.firestore.Timestamp.now(),
      avg_score: 3.0,
      draw_count: 0
    }, { merge: true });

    res.json({ success: true, message: '✅ Boost activé !' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`⚡ Backend Twitch Scanner running on port ${PORT}`));
