import express from 'express';
import cors from 'cors';
import admin from 'firebase-admin';

const app = express();
app.use(cors());
app.use(express.json());

// Vérifie que la variable FIREBASE_SERVICE_ACCOUNT est définie
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT n'est pas défini !");
}

// Parse la variable d'environnement JSON
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

// Initialise Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Exemple de collection Firestore pour stocker les streamers validés
const db = admin.firestore();
const streamersCol = db.collection('streamers');

// Route d'accueil
app.get('/', (req, res) => {
  res.send('⚡ Backend Twitch Scanner running !');
});

// Route Boost / Scanner IA
app.get('/boost', async (req, res) => {
  try {
    // Récupère un streamer aléatoire validé
    const snapshot = await streamersCol.get();
    if (snapshot.empty) {
      return res.json({ message: "Aucun streamer validé trouvé." });
    }

    const streamers = snapshot.docs.map(doc => doc.data());
    const randomStreamer = streamers[Math.floor(Math.random() * streamers.length)];

    res.json({ streamer: randomStreamer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur lors du scan." });
  }
});

// Exemple de route Twitch
app.get('/twitch', (req, res) => {
  res.json({ message: "Route Twitch OK" });
});

// Démarre le serveur
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`⚡ Backend Twitch Scanner running on port ${PORT}`);
});

