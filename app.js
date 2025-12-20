/**
 * ====================================================================================
 * STREAMER & NICHE AI HUB - BACKEND (V29 - PRODUCTION EDITION)
 * ====================================================================================
 * * DESCRIPTION :
 * Ce serveur Node.js agit comme un "Data Warehouse" et un "Coach IA" pour Twitch.
 * Il agrège les données, les analyse avec Gemini, et les stocke dans Firebase.
 * * FONCTIONNALITÉS CLÉS :
 * 1. Market Recorder : Analyse et enregistre les tendances globales (Jeux/Langues).
 * 2. Trader Dashboard : Calcul des tendances boursières (Hausse/Baisse) pour les streamers.
 * 3. Smart Raid : Algorithme de recherche de cible avec affichage Avatar + Miniature.
 * 4. Deep Dive Rotation : Système de mise en avant équitable pour les petits streamers.
 * * ====================================================================================
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { GoogleGenAI } = require('@google/genai');
const admin = require('firebase-admin');

// ====================================================================================
// 1. INITIALISATION DE LA BASE DE DONNÉES (FIREBASE)
// ====================================================================================

let serviceAccount;

// Tentative 1 : Chargement depuis les variables d'environnement (Pour Render/Heroku)
if (process.env.FIREBASE_SERVICE_KEY) {
    try {
        let rawJson = process.env.FIREBASE_SERVICE_KEY;
        // Nettoyage des caractères parasites ajoutés par certains hébergeurs
        if (rawJson.startsWith("'") && rawJson.endsWith("'")) rawJson = rawJson.slice(1, -1);
        if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.slice(1, -1);
        rawJson = rawJson.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n');
        
        serviceAccount = JSON.parse(rawJson);
        console.log("✅ [FIREBASE] Clé chargée depuis l'environnement.");
    } catch (error) {
        console.error("❌ [FIREBASE] Erreur critique de parsing JSON :", error.message);
    }
} 
// Tentative 2 : Chargement depuis un fichier local (Pour le développement)
else {
    try {
        serviceAccount = require('./serviceAccountKey.json');
        console.log("✅ [FIREBASE] Clé chargée depuis le fichier local.");
    } catch (e) {
        console.warn("⚠️ [FIREBASE] Aucune clé trouvée. Le mode 'Persistance' est désactivé.");
    }
}

// Démarrage de l'instance Admin Firebase
if (serviceAccount) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id 
        });
    } catch (e) { 
        console.error("❌ [FIREBASE] Erreur d'initialisation :", e.message); 
    }
} else {
    // Initialisation vide pour éviter le crash si pas de clé
    try { admin.initializeApp(); } catch(e){}
}

const db = admin.firestore();

// Paramètres Firestore pour éviter les avertissements
if (serviceAccount) {
    try { 
        db.settings({ projectId: serviceAccount.project_id, ignoreUndefinedProperties: true }); 
    } catch(e) {}
}

const app = express();
const PORT = process.env.PORT || 10000;

// ====================================================================================
// 2. CONFIGURATION API & MIDDLEWARES
// ====================================================================================

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
const GEMINI_MODEL = "gemini-2.5-flash"; 

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY }); 

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 

// Système de Cache en RAM (Pour réduire les appels API et accélérer le site)
const CACHE = {
    twitchTokens: {},       
    twitchUser: null,       
    boostedStream: null,    
    
    // Configuration de la rotation des streams
    globalStreamRotation: { 
        streams: [],        
        currentIndex: 0,    
        lastFetchTime: 0,   
        fetchCooldown: 10 * 60 * 1000 // 10 Minutes
    }
};

// ====================================================================================
// 3. FONCTIONS UTILITAIRES (HELPERS)
// ====================================================================================

/**
 * Récupère un Token d'Application Twitch (Client Credentials)
 * Gère automatiquement l'expiration et le renouvellement.
 */
async function getTwitchToken() {
    if (CACHE.twitchTokens.app && CACHE.twitchTokens.app.expiry > Date.now()) {
        return CACHE.twitchTokens.app.token;
    }
    
    try {
        const r = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' });
        const d = await r.json();
        
        if (d.access_token) {
            CACHE.twitchTokens.app = { 
                token: d.access_token, 
                expiry: Date.now() + d.expires_in * 1000 
            };
            return d.access_token;
        }
        return null;
    } catch (e) { 
        console.error("Erreur Token Twitch:", e);
        return null; 
    }
}

/**
 * Effectue un appel sécurisé à l'API Twitch Helix
 */
async function apiCall(endpoint) {
    const token = await getTwitchToken();
    if (!token) throw new Error("Impossible d'obtenir un token Twitch.");

    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: { 
            'Client-ID': TWITCH_CLIENT_ID, 
            'Authorization': `Bearer ${token}` 
        }
    });

    if (res.status === 401) {
        CACHE.twitchTokens.app = null; // Force le refresh au prochain appel
        throw new Error("Token Twitch expiré. Réessayez.");
    }
    
    return res.json();
}

/**
 * Appelle l'IA Gemini avec un contexte spécifique
 */
async function runGeminiAnalysis(prompt, type="standard") {
    let sysInstruct = "Tu es un expert en analyse de données Twitch. Sois concis.";
    
    if (type === 'coach') {
        sysInstruct = "Tu es un Coach de Performance pour Streamers. Tu es direct, motivant et stratégique. Utilise des listes à puces. Pas de longs paragraphes.";
    }
    
    try {
        const r = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { systemInstruction: sysInstruct }
        });
        return { success: true, html_response: r.text.trim() };
    } catch (e) { 
        return { success: false, html_response: "<p>Le service IA est momentanément indisponible.</p>" }; 
    }
}

// ====================================================================================
// 4. ROUTES PRINCIPALES (MARKET, SCAN, RAID)
// ====================================================================================

/**
 * ROUTE: GLOBAL PULSE (Le coeur du "TwitchTracker")
 * Récupère les stats globales et sauvegarde un snapshot dans Firebase.
 */
app.post('/global_pulse', async (req, res) => {
    const { type } = req.body; // 'games' ou 'languages'
    
    try {
        // 1. Récupération d'un échantillon représentatif (Top 100 streams)
        const sRes = await apiCall('streams?first=100');
        const streams = sRes.data;
        
        // Calcul des totaux bruts de l'échantillon
        const sampleViewers = streams.reduce((acc, s) => acc + s.viewer_count, 0);
        
        // Extrapolation statistique pour estimer le trafic total de la plateforme
        // (Multiplicateur basé sur la distribution de Pareto typique de Twitch)
        const estViewers = Math.floor(sampleViewers * 1.65);
        const estChannels = Math.floor(streams.length * 85);

        // Données "Overview" (Cartes du haut)
        const overview = {
            viewers: estViewers.toLocaleString(),
            channels: estChannels.toLocaleString(),
            active_streamers: Math.floor(estChannels * 0.85).toLocaleString(),
            watch_time: Math.floor(estViewers * 55 / 60) + "Mh", // Estimation Millions d'heures
            stream_time: Math.floor(estChannels * 3) + "Kh"      // Estimation Milliers d'heures
        };

        let tableData = [];

        if (type === 'languages') {
            // --- ANALYSE PAR LANGUE ---
            const langMap = {};
            streams.forEach(s => {
                const l = s.language.toUpperCase();
                if(!langMap[l]) langMap[l] = {count:0, v:0};
                langMap[l].count++; 
                langMap[l].v += s.viewer_count;
            });
            
            // Tri et formatage
            tableData = Object.entries(langMap)
                .sort((a,b) => b[1].v - a[1].v)
                .map(([key, val], i) => ({
                    rank: i+1, 
                    name: key, 
                    viewers: val.v, 
                    channels: val.count, 
                    rating: val.v > 50000 ? "A+" : (val.v > 10000 ? "B" : "C")
                }));

        } else {
            // --- ANALYSE PAR JEU (Défaut) ---
            const gRes = await apiCall('games/top?first=15');
            
            for(let i=0; i<gRes.data.length; i++) {
                const g = gRes.data[i];
                
                // On scanne un petit échantillon de chaque jeu pour avoir le ratio
                const gs = await apiCall(`streams?game_id=${g.id}&first=5`);
                
                // Extrapolation spécifique au jeu
                const gv = gs.data.reduce((a,b)=>a+b.viewer_count,0) * (i<3 ? 30 : 15); 
                const gc = gs.data.length * (i<3 ? 80 : 40);
                
                // Note de saturation (Ratio Viewers/Channels)
                const ratio = gv / Math.max(1, gc);
                let rating = "C";
                if (ratio > 40) rating = "A+ (Viral)";
                else if (ratio > 15) rating = "B (Sain)";
                
                tableData.push({
                    rank: i+1, 
                    name: g.name, 
                    img: g.box_art_url.replace('{width}','50').replace('{height}','70'),
                    viewers: gv, 
                    channels: gc, 
                    rating: rating
                });
            }
        }

        // 3. SAUVEGARDE DANS FIREBASE (Uniquement pour les Jeux)
        if(type === 'games') {
            try {
                await db.collection('market_history').add({
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    total_viewers: estViewers,
                    active_channels: estChannels,
                    top_game: tableData[0]?.name || 'Inconnu'
                });
                console.log("💾 Market Snapshot enregistré.");
            } catch(e) { 
                console.warn("⚠️ Pas d'enregistrement DB (Config manquante ou erreur)."); 
            }
        }

        res.json({ success: true, overview, table: tableData });

    } catch(e) { 
        res.status(500).json({error: e.message}); 
    }
});

/**
 * ROUTE: RAID FINDER (V28 FIX)
 * Recherche une cible de raid avec les bons critères et renvoie l'avatar.
 */
app.post('/start_raid', async (req, res) => {
    const { game, max } = req.body;
    
    try {
        // 1. Trouver l'ID du jeu
        const gRes = await apiCall(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(!gRes.data.length) return res.json({error: "Jeu introuvable. Vérifiez l'orthographe."});
        
        // 2. Trouver les streams de ce jeu en Français
        const sRes = await apiCall(`streams?game_id=${gRes.data[0].id}&first=100&language=fr`);
        
        // 3. Filtrage intelligent :
        // On cherche les chaînes qui ont MOINS de 'max' viewers,
        // Mais on trie pour prendre la plus grosse parmi celles-là (pour ne pas raider une chaine vide)
        let target = sRes.data
            .filter(s => s.viewer_count <= max)
            .sort((a,b) => b.viewer_count - a.viewer_count)[0];
        
        if(target) {
            // 4. Récupération de l'Avatar (Indispensable pour l'UI V28)
            const uRes = await apiCall(`users?id=${target.user_id}`);
            const avatar = uRes.data[0]?.profile_image_url || "";

            return res.json({
                success: true,
                target: {
                    name: target.user_name, 
                    login: target.user_login, 
                    viewers: target.viewer_count,
                    thumb: target.thumbnail_url.replace('{width}','320').replace('{height}','180'),
                    avatar: avatar
                }
            });
        }
        return res.json({error: "Aucune chaîne correspondante trouvée."});
        
    } catch(e) { res.json({error: e.message}); }
});

/**
 * ROUTE: SCAN TARGET (DASHBOARD)
 * Analyse un profil, calcule la tendance et demande un conseil au Coach.
 */
app.post('/scan_target', async (req, res) => {
    const {query} = req.body;
    try {
        // 1. Infos de base
        const u = await apiCall(`users?login=${query}`);
        
        if(u.data.length){
            const d = u.data[0];
            
            // 2. Followers (Nouveau endpoint officiel)
            let followers = 0;
            try { 
                const f = await apiCall(`channels/followers?broadcaster_id=${d.id}&first=1`); 
                followers = f.total; 
            } catch(e){}

            // 3. Analyse des jours de stream (via historique VOD)
            const v = await apiCall(`videos?user_id=${d.id}&first=10&type=archive`);
            let days = "Pas de données";
            if(v.data.length) {
                const map = {}; 
                v.data.forEach(x => {
                    const day = new Date(x.created_at).getDay();
                    map[day] = (map[day] || 0) + 1;
                });
                // Conversion des index en jours (0=Dimanche)
                const dayNames = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
                days = Object.keys(map)
                    .sort((a,b) => map[b] - map[a]) // Trie par fréquence
                    .slice(0, 3) // Garde les 3 principaux
                    .map(k => dayNames[k])
                    .join(', ');
            }

            // 4. Calcul de Tendance (Bourse)
            const ref = db.collection('history_stats').doc(d.id);
            const old = await ref.get();
            let diff = 0; 
            let trend = "stable";
            
            if(old.exists) { 
                const oldData = old.data();
                diff = followers - (oldData.total_followers || 0); 
                trend = diff > 0 ? "up" : (diff < 0 ? "down" : "stable"); 
            }
            
            // Mise à jour de l'historique
            await ref.set({
                total_followers: followers, 
                last_scan: new Date(),
                display_name: d.display_name
            }, {merge:true});

            // 5. Appel IA Coach (Concis)
            const prompt = `
                Streamer: ${d.display_name}.
                Followers: ${followers}.
                Tendance: ${trend} (${diff}).
                Jours actifs: ${days}.
                
                Donne un conseil stratégique en 2 phrases maximum pour booster cette chaîne. 
                Utilise un ton expert et motivant.
            `;
            const r = await runGeminiAnalysis(prompt, 'coach');

            res.json({
                success:true, 
                data: { ...d, followers, days }, 
                diff, 
                trend, 
                ia: r.html_response
            });
        } else { 
            res.json({success:false, error: "Streamer introuvable."}); 
        }
    } catch(e){ res.json({success:false, error: "Erreur API Twitch"}); }
});

// --- AUTRES ROUTINES (BOOST, PLANNING, AUTH) ---

app.post('/analyze_schedule', async (req, res) => {
    const { game } = req.body;
    try {
        const gRes = await apiCall(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(!gRes.data.length) return res.json({success:false, error: "Jeu inconnu"});
        
        const sRes = await apiCall(`streams?game_id=${gRes.data[0].id}&first=100`);
        const totalV = sRes.data.reduce((a,b)=>a+b.viewer_count,0);
        
        const prompt = `Jeu: ${gRes.data[0].name}. ${sRes.data.length} streamers live (sample), ${totalV} viewers. Donne 3 meilleurs créneaux horaires (Jour + Heure) pour streamer ça. Réponds en liste HTML <ul>.`;
        const r = await runGeminiAnalysis(prompt, 'coach');
        
        res.json({
            success: true,
            box_art: gRes.data[0].box_art_url.replace('{width}','80').replace('{height}','110'),
            name: gRes.data[0].name,
            ia_advice: r.html_response
        });
    } catch(e) { res.json({success:false, error: "Erreur Analyse"}); }
});

// Auth Routes
app.get('/twitch_auth_start', (req, res) => res.redirect(`https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows`));
app.get('/twitch_auth_callback', async (req, res) => {
    const r = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&code=${req.query.code}&grant_type=authorization_code&redirect_uri=${REDIRECT_URI}`, {method:'POST'});
    const d = await r.json();
    if(d.access_token) { CACHE.twitchUser = d.access_token; res.send("<script>window.opener.postMessage('auth_success','*');window.close();</script>"); }
});
app.get('/twitch_user_status', (req,res) => res.json({is_connected:!!CACHE.twitchUser}));
app.post('/twitch_logout', (req,res)=>{CACHE.twitchUser=null;res.json({success:true});});

app.get('/followed_streams', async (req, res) => {
    if(!CACHE.twitchUser) return res.json({success:false});
    // Il faut d'abord récupérer l'ID de l'utilisateur connecté
    const u = await fetch(`https://api.twitch.tv/helix/users`, {headers:{'Client-ID':TWITCH_CLIENT_ID, 'Authorization':`Bearer ${CACHE.twitchUser}`}});
    const ud = await u.json();
    if(!ud.data || !ud.data.length) return res.json({success:false});
    
    const f = await fetch(`https://api.twitch.tv/helix/streams/followed?user_id=${ud.data[0].id}`, {headers:{'Client-ID':TWITCH_CLIENT_ID, 'Authorization':`Bearer ${CACHE.twitchUser}`}});
    const d = await f.json();
    res.json({success:true, streams: d.data});
});

// Lecteur & Boost
app.post('/stream_boost', async(req,res)=>{
    const {channel}=req.body;
    try { await db.collection('boosts').add({channel, endTime: Date.now()+900000}); res.json({success:true}); } catch(e){res.json({error:"Erreur DB"});}
});
app.get('/get_default_stream', async (req, res) => {
    try {
        const b = await db.collection('boosts').where('endTime', '>', Date.now()).get();
        if(!b.empty) return res.json({success:true, channel: b.docs[0].data().channel, viewers:'BOOST'});
    } catch(e){}
    // Rotation par défaut
    const s = await apiCall('streams?language=fr&first=50');
    const pick = s.data.filter(x=>x.viewer_count<=100).sort(() => Math.random() - 0.5)[0] || s.data[0];
    res.json({success:true, channel: pick ? pick.user_login : 'twitch', viewers: pick ? pick.viewer_count : 0});
});
app.post('/cycle_stream', async (req, res) => {
    // Logique simplifiée de cycle
    const s = await apiCall('streams?language=fr&first=20');
    const pick = s.data[Math.floor(Math.random() * s.data.length)];
    res.json({success:true, channel: pick.user_login});
});

app.listen(PORT, () => console.log(`SERVER V28 READY ON PORT ${PORT}`));
