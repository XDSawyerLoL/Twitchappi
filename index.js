// index.js
import express from 'express';
import cors from 'cors';
import admin from 'firebase-admin';

const app = express();
app.use(cors());
app.use(express.json());

// --- Config Firebase Admin depuis variable d'environnement ---
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// --- Routes Backend ---

// Route Boost (exemple simple)
app.post('/boost', async (req, res) => {
  const { channelName, userId } = req.body;
  if(!channelName || !userId) return res.json({ message: '❌ Paramètres manquants' });

  try {
    // Ici tu peux faire ta logique : ajouter boost dans Firebase ou autre
    console.log('Boost pour', channelName, 'par', userId);
    return res.json({ message: `✅ Boost activé pour ${channelName}` });
  } catch (e) {
    console.error(e);
    return res.json({ message: '❌ Erreur serveur' });
  }
});

// Route Scanner (exemple simple renvoyant un streamer aléatoire)
app.get('/random', async (req, res) => {
  try {
    const fakeStreamers = [
      { username: 'gotaga', title: 'FPS Hardcore', viewer_count: 2500, avg_score: 9.5 },
      { username: 'squeezie', title: 'Jeux et Fun', viewer_count: 15000, avg_score: 8.7 },
      { username: 'xqc', title: 'Streaming Chaos', viewer_count: 20000, avg_score: 9.0 }
    ];
    const randomStreamer = fakeStreamers[Math.floor(Math.random()*fakeStreamers.length)];
    return res.json({ streamer: randomStreamer });
  } catch(e){
    console.error(e);
    return res.status(500).json({ message: '❌ Erreur serveur' });
  }
});

// --- Démarrage serveur ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`⚡ Backend Twitch Scanner running on port ${PORT}`));
