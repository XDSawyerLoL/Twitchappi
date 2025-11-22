// index.js
import express from 'express';
import cors from 'cors';
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// --- Chemin pour serviceAccountKey.json ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serviceAccount = JSON.parse(readFileSync(path.join(__dirname, 'serviceAccountKey.json')));

// --- Initialisation Firebase Admin ---
initializeApp({
  credential: cert(serviceAccount)
});
const db = getFirestore();

// --- Express ---
const app = express();
app.use(cors());
app.use(express.json());

// --- Exemple d'API pour retourner un streamer aléatoire ---
app.get('/random', async (req, res) => {
  try {
    const snapshot = await db.collection('streamers').limit(50).get();
    const streamers = snapshot.docs.map(doc => doc.data());
    if (streamers.length === 0) return res.status(404).json({ error: 'Aucun streamer trouvé' });
    const randomStreamer = streamers[Math.floor(Math.random() * streamers.length)];
    res.json({ streamer: randomStreamer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// --- Démarrage serveur ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`⚡ Backend Twitch Scanner running on port ${PORT}`);
});
