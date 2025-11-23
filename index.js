import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Exemple de collection en mémoire pour le boost
let streamers = [
  { username: "gotaga", title: "Stream de Gotaga", avg_score: 8.5, viewer_count: 1200 },
  { username: "monstreamer", title: "Mon Stream sympa", avg_score: 7.3, viewer_count: 340 }
];

// Route Boost (POST)
app.post('/boost', (req, res) => {
  const { channelName, userId } = req.body;
  if (!channelName) return res.status(400).json({ message: "Nom de chaîne requis" });

  // Simule le boost
  res.json({ message: `✅ Boost activé pour ${channelName} par ${userId}` });
});

// Route Scanner IA (GET)
app.get('/random', (req, res) => {
  if (streamers.length === 0) return res.json({ message: "Aucun streamer trouvé" });
  const randomStreamer = streamers[Math.floor(Math.random() * streamers.length)];
  res.json({ streamer: randomStreamer });
});

// Route principale pour servir le HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Lancement du serveur
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
