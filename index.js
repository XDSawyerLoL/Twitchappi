import express from 'express';
import cors from 'cors';
import admin from 'firebase-admin';

const app = express();
app.use(cors());
app.use(express.json());

// Initialisation Firebase Admin avec variable d'environnement
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT n'est pas défini !");
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const streamersCol = db.collection('streamers');

// Route Boost / Scanner IA
app.get('/boost', async (req, res) => {
  try {
    const snapshot = await streamersCol.get();
    if (snapshot.empty) {
      return res.json({ message: "Aucun streamer validé trouvé." });
    }

    const streamers = snapshot.docs.map(doc => doc.data());
    const randomStreamer = streamers[Math.floor(Math.random() * streamers.length)];

    return res.json(randomStreamer);
  } catch (error) {
    console.error("Erreur /boost:", error);
    return res.status(500).json({ error: "Erreur serveur lors du scan." });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Backend Twitch Scanner running on port ${PORT}`));
