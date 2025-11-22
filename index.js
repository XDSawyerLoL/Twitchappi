import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("⚠️ TWITCH_CLIENT_ID ou TWITCH_CLIENT_SECRET manquants !");
  process.exit(1);
}

let twitchToken = null;
let tokenExpiry = null;

async function getTwitchToken() {
  if (twitchToken && tokenExpiry && Date.now() < tokenExpiry - 60 * 1000) return twitchToken;

  const url = `https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`;
  const res = await fetch(url, { method: "POST" });
  const data = await res.json();
  if (!data.access_token) throw new Error("Impossible de récupérer le token Twitch");

  twitchToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;
  return twitchToken;
}

app.get("/random", async (req, res) => {
  try {
    const token = await getTwitchToken();

    const url = `https://api.twitch.tv/helix/streams?first=50`;
    const response = await fetch(url, {
      headers: {
        "Client-ID": CLIENT_ID,
        "Authorization": `Bearer ${token}`
      }
    });
    const data = await response.json();

    if (!data.data || data.data.length === 0) {
      return res.json({ streamer: null, message: "Aucun streamer trouvé." });
    }

    const filtered = data.data.filter(s => s.viewer_count <= 5);
    if (filtered.length === 0) return res.json({ streamer: null, message: "Aucun streamer < 5 viewers." });

    const randomStreamer = filtered[Math.floor(Math.random() * filtered.length)];
    res.json({ streamer: randomStreamer });

  } catch (err) {
    console.error("Erreur /random :", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/", (req, res) => res.send("Backend Streamer Hub OK ✅"));

app.listen(PORT, () => console.log(`⚡ Backend Twitch Scanner running on port ${PORT}`));
