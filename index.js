// index.js
import express from 'express';
import cors from 'cors';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// --- 1️⃣ Initialisation Firebase Admin ---
if (!process.env.FIREBASE_SA_KEY) {
  console.error("⚠️ FIREBASE_SA_KEY manquant dans les variables d'environnement !");
  process.exit(1);
}

const firebaseKey = JSON.parse(process.env.FIREBASE_SA_KEY);

const appAdmin = initializeApp({
  credential: cert(firebaseKey),
});

const db = getFirestore(appAdmin);

// --- 2️⃣ Configuration Express ---
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// --- 3️⃣ Routes ---
app.get('/', (req, res) => {
  res.send('⚡ Backend Twitch Scanner OK!');
});

/**
 * Endpoint pour récupérer un streamer aléatoire
 * Exemple simplifié, tu peux remplacer par Firestore ou ton IA
 */
app.get('/random', async (req, res) => {
  try {
    // Ici tu peux récupérer depuis Firestore
    // Exemple factice :
    const streamer = {
      username: 'gotaga',
      title: 'Test Stream',
      viewer_count: 123,
      avg_score: 4.5
    };
    res.json({ streamer });
  } catch (err) {
    console.error("Erreur /random :", err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// --- 4️⃣ Démarrage serveur ---
app.listen(PORT, () => {
  console.log(`⚡ Backend Twitch Scanner running on port ${PORT}`);
});


