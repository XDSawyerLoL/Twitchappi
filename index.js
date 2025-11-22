// index.js
import express from 'express';
import cors from 'cors';
import admin from 'firebase-admin';

const app = express();
app.use(cors());
app.use(express.json());

// --- Firebase Admin ---
let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (err) {
  console.error("❌ FIREBASE_SERVICE_ACCOUNT invalide ou manquant !");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// --- Routes Twitch & API ---
// Exemple simple : renvoie un streamer "au hasard"
app.get('/random', async (req, res) => {
  try {
    // Ici tu peux faire un fetch depuis Firestore ou Twitch API
    res.json({
      streamer: {
        username: 'gotaga',
        viewer_count: 1234,
        title: 'Streamer de test',
        avg_score: 4.5
      }
    });
  } catch (err) {
    console.error("Erreur /random:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Exemple : route pour soumettre un boost
app.post('/boost', async (req, res) => {
  const { channelName, userId } = req.body;
  if (!channelName || !userId) return res.status(400).json({ error: "Paramètres manquants" });

  try {
    const path = `artifacts/GOODSTREAM-twitch-prod/public/data/submitted_streamers/${channelName.toLowerCase()}`;
    await db.doc(path).set({
      username: channelName.toLowerCase(),
      userId,
      timestamp: admin.firestore.Timestamp.now(),
      avg_score: 3.0,
      draw_count: 0
    }, { merge: true });

    res.json({ success: true, message: "✅ Boost activé !" });
  } catch (err) {
    console.error("Erreur /boost:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// --- Démarrage du serveur ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`⚡ Backend Twitch Scanner running on port ${PORT}`));
