import express from 'express';
import cors from 'cors';
import admin from 'firebase-admin';
import fetch from 'node-fetch'; // Pour appels API Twitch si besoin

const app = express();
app.use(cors());
app.use(express.json());

// --- Initialisation Firebase Admin ---
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT n'est pas défini !");
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const streamersCol = db.collection('streamers');

// --- Route test Twitch (exemple) ---
app.get('/twitch/:username', async (req, res) => {
  const { username } = req.params;
  try {
    // Exemple : récupérer les infos d'un streamer via Twitch API
    // Tu peux mettre ton client_id et access_token Twitch dans les variables d'environnement
    const response = await fetch(`https://api.twitch.tv/helix/users?login=${username}`, {
      headers: {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`,
      },
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Erreur Twitch:", error);
    res.status(500).json({ error: "Erreur serveur Twitch" });
  }
});

// --- Route Boost / Scanner IA ---
app.get('/boost', async (req, res) => {
  try {
    const snapshot = await streamersCol.get();
    if (snapshot.empty) return res.json({ message: "Aucun streamer validé trouvé." });

    const streamers = snapshot.docs.map(doc => doc.data());
    const randomStreamer = streamers[Math.floor(Math.random() * streamers.length)];

    res.json(randomStreamer);
  } catch (error) {
    console.error("Erreur /boost:", error);
    res.status(500).json({ error: "Erreur serveur lors du scan." });
  }
});

// --- Route de test simple ---
app.get('/', (req, res) => res.send('Backend Twitch Scanner actif ✅'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`⚡ Backend Twitch Scanner running on port ${PORT}`));
