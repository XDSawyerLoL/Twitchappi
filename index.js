


import express from 'express';
import cors from 'cors';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Initialisation Firebase Admin ---
import serviceAccount from './serviceAccountKey.json' assert { type: 'json' };
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// --- Routes ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Exemple de route /random pour le scanner
app.get('/random', async (req, res) => {
  try {
    const snapshot = await db.collection('streamers').limit(1).get();
    const streamer = snapshot.docs[0]?.data() || null;
    res.json({ streamer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Exemple de route /boost pour le formulaire Boost
app.post('/boost', async (req, res) => {
  const { username, userId } = req.body;
  if (!username || !userId) return res.status(400).json({ error: 'Paramètres manquants' });

  try {
    await db.collection('streamers').doc(username).set({
      username,
      userId,
      timestamp: Timestamp.now(),
      avg_score: 3.0,
      draw_count: 0
    }, { merge: true });

    res.json({ message: '✅ Boost activé !' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Échec du boost' });
  }
});

// --- Démarrage du serveur ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`⚡ Backend Twitch Scanner running on port ${PORT}`));
