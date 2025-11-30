/* ============================
      JustPlayer Stream Hub
      Backend Futuristic Edition
===============================*/

import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import admin from "firebase-admin";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ========================== INIT APP ==============================
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended:true}));

const __dirname = path.resolve();

// ========================== ENV VARS ==============================
const {
  PORT = 10000,
  TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET,
  TWITCH_REDIRECT_URI,
  GEMINI_API_KEY,
  FIREBASE_SERVICE_ACCOUNT
} = process.env;

// ========================== CHECK VARS ==============================
console.log("\n--- Statut des Variables d'Environnement ---");
console.log("PORT:",PORT);
console.log("TWITCH_CLIENT_ID:", TWITCH_CLIENT_ID ? "OK":"❌ MANQUANT");
console.log("TWITCH_CLIENT_SECRET:", TWITCH_CLIENT_SECRET ? "OK":"❌ MANQUANT");
console.log("TWITCH_REDIRECT_URI:", TWITCH_REDIRECT_URI ? "OK":"❌ MANQUANT");
console.log("GEMINI_API_KEY:", GEMINI_API_KEY ? "OK":"❌ MANQUANT");
console.log("---------------------------------------------------------\n");

// ========================== FIREBASE ==============================
try {
  const svc = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(svc)
  });
  console.log("Firebase Admin SDK initialisé.");
}catch(e){
  console.error("ERREUR Firebase:", e?.message || e);
}

// ========================== GEMINI ==============================
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const GEMINI_MODEL = "gemini-2.0-flash";

// ========================== TWITCH TOKEN ==============================
let TWITCH_APP_TOKEN = null;
let TWITCH_EXP = 0;

async function getTwitchAccessToken(){
  const now = Date.now()/1000;
  if(TWITCH_APP_TOKEN && now < TWITCH_EXP) return TWITCH_APP_TOKEN;

  const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
  const r = await fetch(url,{method:"POST"});
  const d = await r.json();
  if(!d.access_token){
    console.error("Impossible d'obtenir token Twitch");
    return null;
  }
  TWITCH_APP_TOKEN = d.access_token;
  TWITCH_EXP = (Date.now()/1000) + d.expires_in - 30;
  console.log("Nouveau token Twitch obtenu.");
  return TWITCH_APP_TOKEN;
}

// ========================== EXPRESS ROUTES ==============================

// AI critique
app.get("/critique_ia", async(req,res)=>{
  try{
    const target = req.query.target || "inconnu";

    const model = genAI.getGenerativeModel({model:GEMINI_MODEL});
    const prompt = `Analyse complète du streamer ${target}, forces, faiblesses, opportunités, conseils pratiques.`;

    const out = await model.generateContent(prompt);
    res.send(`<div class="p-2">${out.response.text().replace(/\n/g,"<br>")}</div>`);

  }catch(e){
    res.status(500).send("Erreur IA.");
  }
});

// Niche analyse
app.get("/niche_analyse", async(req,res)=>{
  try{
    const text = req.query.text || "...";
    const model = genAI.getGenerativeModel({model:GEMINI_MODEL});
    const out = await model.generateContent(`Analyse la niche suivante : ${text}`);
    res.send(`<div class="p-2">${out.response.text().replace(/\n/g,"<br>")}</div>`);
  }catch(e){
    res.status(500).send("Erreur IA.");
  }
});

// Repurpose
app.get("/repurpose", async(req,res)=>{
  try{
    const text = req.query.text || "...";
    const model = genAI.getGenerativeModel({model:GEMINI_MODEL});
    const out = await model.generateContent(`Transforme ce texte en contenu multi-plateforme : ${text}`);
    res.send(`<div class="p-2">${out.response.text().replace(/\n/g,"<br>")}</div>`);
  }catch(e){
    res.status(500).send("Erreur IA.");
  }
});

// Trend detector
app.get("/trend_detector", async(req,res)=>{
  try{
    const model = genAI.getGenerativeModel({model:GEMINI_MODEL});
    const out = await model.generateContent(`Analyse les tendances Twitch actuelles, jeux en hausse, opportunités.`);
    res.send(`<div class="p-2">${out.response.text().replace(/\n/g,"<br>")}</div>`);
  }catch(e){
    res.status(500).send("Erreur IA.");
  }
});

// ======================= LIVE PING (Futuristic Render-Compatible) =======================
app.get("/live_ping", async(req,res)=>{
  try{
    const channel = req.query.channel;
    if(!channel) return res.json({live:false});

    const t = await getTwitchAccessToken();
    if(!t) return res.json({live:false});

    const url = `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(channel)}`;
    const r = await fetch(url,{
      headers:{
        "Client-ID":TWITCH_CLIENT_ID,
        "Authorization":`Bearer ${t}`
      }
    });

    const d = await r.json();
    const live = d.data && d.data.length>0;
    return res.json({live});
  }catch(e){
    console.error("Erreur /live_ping:", e.message);
    res.json({live:false});
  }
});

// ========================== STATIC ==========================
app.use(express.static(path.join(__dirname,".")));
app.get("*",(req,res)=>{
  res.sendFile(path.join(__dirname,"NicheOptimizer.html"));
});

// ========================== START ==========================
app.listen(PORT,()=>{
  console.log("🚀 Serveur démarré sur le port",PORT);
});










