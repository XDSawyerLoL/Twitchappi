// index.js - Backend Twitchappi prêt pour Render avec Firebase Admin

import express from 'express';
import cors from 'cors';
import admin from 'firebase-admin';

// Récupération de la config Firebase depuis la variable d'environnement
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT n'est pas défini !");
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const app = express();
app.use(cors());
app.use(express.json());

// --- Routes --- //

/**
 * Route de test basique
 */
app.get('/', (req, res) => {
  res.json({ message: 'Twitchappi Backend actif !' });
});

/**
 * Boost - soumission d'un streamer
 */
app.post('/boost', async (req, res) => {
  try {
    const { username, userId } = req.body;
    if (!username || !userId) return res.status(400).json({ error: 'username et userId requis' });

    const path = `artifacts/${username}/public/data/submitted_streamers/${username}`;
    await db.doc(path).set({
      username,
      userId,
      timestamp: admin.firestore.Timestamp.now(),
      avg_score: 3.0, // valeur initiale
      draw_count: 0
    }, { merge: true });

    res.json({ success: true, message: 'Boost Activé ! L’IA analysera cette chaîne.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la soumission du boost.' });
  }
});

/**
 * Scanner IA - renvoie un streamer aléatoire
 */
app.get('/random', async (req, res) => {
  try {
    // Exemple simple : récupère une chaîne aléatoire parmi les soumises
    const snapshot = await db.collectionGroup('submitted_streamers').limit(50).get();
    const docs = snapshot.docs.map(d => d.data());

    if (!docs.length) return res.status(404).json({ error: 'Aucun streamer trouvé.' });

    const random = docs[Math.floor(Math.random() * docs.length)];
    res.json({ streamer: random });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la récupération du streamer.' });
  }
});

// --- Démarrage du serveur --- //
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`⚡ Backend Twitch Scanner running on port ${PORT}`));
