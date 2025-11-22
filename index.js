// --- IMPORTATIONS NÉCESSAIRES ---
// Assurez-vous d'avoir les dépendances 'express', 'node-fetch', 'firebase-admin' installées.
const express = require('express');
const fetch = require('node-fetch');

// Firebase Admin SDK est requis pour les opérations de backend (Node.js)
const admin = require('firebase-admin');

// --- CONFIGURATION FIREBASE ADMIN POUR ENVIRONNEMENT EXTERNE (ex: Render) ---

// 1. Définir une variable d'environnement pour stocker la clé de service JSON complète.
const serviceAccountKey = process.env.FIREBASE_SA_KEY;

let db; // Déclaration de l'instance de base de données

// Initialisation de Firebase Admin
if (!admin.apps.length) {
    if (serviceAccountKey) {
        // Mode Déploiement Externe (Render, Heroku, etc.)
        try {
            const serviceAccount = JSON.parse(serviceAccountKey);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log("Firebase Admin SDK initialisé via clé de service (pour Render).");
        } catch (e) {
            console.error("ERREUR CRITIQUE: Échec du parsing ou de l'initialisation de la clé de service Firebase. Vérifiez la variable FIREBASE_SA_KEY.", e);
            // Arrêter l'application si l'initialisation Firebase échoue
            process.exit(1); 
        }
    } else {
        // Mode Environnement Google Cloud (Canvas, GCE) - Fallback
        // Attention: Pour Render, cette partie est ignorée si FIREBASE_SA_KEY est bien configuré.
        admin.initializeApp({
            credential: admin.credential.applicationDefault()
        });
        console.log("Firebase Admin SDK initialisé via Default Application Credentials (pour Canvas/GCP).");
    }
}

db = admin.firestore(); // db est l'instance de la base de données Firestore !
const app = express();
// Lecture du port depuis l'environnement
const port = process.env.PORT || 3000; 

// Middleware pour analyser le corps JSON
app.use(express.json());

// --- CONFIGURATION TWITCH (CRITIQUE) ---
// ⚠️ Lecture des clés depuis process.env (variables d'environnement) pour la sécurité sur Render
// Mettez ces variables (TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET) dans les réglages Render
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || 'ifypidjkytqzoktdyljgktqsczrv4j'; 
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || '3cxzcj23fcrczbe5n37ajzcb4y7u9q';
let TWITCH_ACCESS_TOKEN = null;

// Les constantes __app_id et __firebase_config sont spécifiques à l'environnement Canvas
// Pour Render, nous devons utiliser un chemin plus simple ou gérer l'appId différemment,
// mais nous conservons la structure pour la compatibilité avec votre code existant.
const appId = process.env.APP_ID || 'GOODSTREAM-twitch-prod'; 

// Chemin de la collection Firestore pour les streamers soumis (Collection Publique)
const SUBMISSION_COLLECTION_PATH = `artifacts/${appId}/public/data/submitted_streamers`;
// Chemin de la collection Firestore pour les votes
const RATING_COLLECTION_PATH = `artifacts/${appId}/public/data/streamer_ratings`;

// --- CONFIGURATION GEMINI API ---
// L'API Key sera lue depuis l'environnement (Render)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-2.5-flash-preview-09-2025';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;


// --- FONCTIONS UTILITAIRES ---

/**
 * Récupère le jeton d'accès Twitch (nécessaire pour appeler l'API Helix).
 */
async function getTwitchAccessToken() {
    if (TWITCH_ACCESS_TOKEN) return TWITCH_ACCESS_TOKEN;
    const tokenUrl = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
    
    try {
        // En environnement réel, assurez-vous que 'fetch' supporte l'implémentation de backoff exponentiel.
        const response = await fetch(tokenUrl, { method: 'POST' });
        const data = await response.json();
        TWITCH_ACCESS_TOKEN = data.access_token;
        console.log("Jeton Twitch récupéré.");
        return TWITCH_ACCESS_TOKEN;
    } catch (error) {
        console.error("Erreur lors de la récupération du jeton Twitch:", error);
        return null;
    }
}

/**
 * Récupère l'état en direct (viewers) pour une liste de streamers Twitch.
 */
async function getLiveStreamsData(usernames) {
    const token = await getTwitchAccessToken();
    if (!token || usernames.length === 0) return [];
    
    // Limite à 100 utilisateurs par requête API Twitch
    const limitedUsernames = usernames.slice(0, 100); 

    const userQueries = limitedUsernames.map(u => `user_login=${u}`).join('&');
    const streamsUrl = `https://api.twitch.tv/helix/streams?${userQueries}`;

    try {
        const response = await fetch(streamsUrl, {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.status === 401) {
             console.error("Jeton Twitch expiré. Réinitialisation.");
             TWITCH_ACCESS_TOKEN = null; 
             return [];
        }

        const data = await response.json();
        return data.data || [];
        
    } catch (error) {
        console.error("Erreur lors de la récupération des données de flux Twitch:", error);
        return [];
    }
}

/**
 * Met à jour les métriques de tirage du streamer dans Firestore (Firebase) après qu'il ait été sélectionné.
 */
async function updateStreamerDrawMetrics(username) {
    try {
        const docRef = db.collection(SUBMISSION_COLLECTION_PATH).doc(username.toLowerCase());
        // Met à jour la date du dernier tirage et incrémente le compteur de tirages dans Firebase
        await docRef.update({
            last_draw_date: admin.firestore.Timestamp.now(),
            draw_count: admin.firestore.FieldValue.increment(1)
        });
    } catch (error) {
        console.error(`Erreur lors de la mise à jour des métriques pour ${username}:`, error);
    }
}

/**
 * Met à jour le score moyen d'un streamer après un nouveau vote dans Firestore (Firebase).
 * @param {string} username Le nom d'utilisateur du streamer.
 */
async function recalculateAverageScore(username) {
    const streamerRef = db.collection(SUBMISSION_COLLECTION_PATH).doc(username.toLowerCase());
    
    // On doit lire tous les votes pour cet utilisateur dans Firebase
    const ratingsSnapshot = await db.collection(RATING_COLLECTION_PATH)
        .where('username', '==', username.toLowerCase())
        .get();
        
    if (ratingsSnapshot.empty) {
        // S'il n'y a pas de votes, on revient au score par défaut
        await streamerRef.update({
            avg_score: 3.0,
            rating_count: 0
        });
        return;
    }

    let totalScore = 0;
    ratingsSnapshot.forEach(doc => {
        totalScore += doc.data().rating;
    });

    const ratingCount = ratingsSnapshot.size;
    const newAvgScore = totalScore / ratingCount;

    // Mise à jour de la note moyenne du streamer dans Firebase
    await streamerRef.update({
        avg_score: newAvgScore,
        rating_count: ratingCount
    });
}

/**
 * Fonction utilitaire pour appeler l'API Gemini avec backoff exponentiel.
 * @param {object} payload Le corps de la requête API Gemini.
 * @returns {Promise<string>} Le texte généré ou un message d'erreur.
 */
async function callGeminiApi(payload) {
    let resultText = "Désolé, impossible d'obtenir une critique par l'IA pour le moment.";
    const maxRetries = 5;
    let delay = 1000; // 1 seconde de délai initial

    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(GEMINI_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const result = await response.json();
                const candidate = result.candidates?.[0];
                if (candidate && candidate.content?.parts?.[0]?.text) {
                    resultText = candidate.content.parts[0].text;
                    return resultText; // Succès, on sort de la boucle
                }
            } else if (response.status === 429) {
                // Trop de requêtes (Rate limit), on tente le backoff
                console.warn(`Tentative ${i + 1}: Rate limit atteint. Réessai dans ${delay / 1000}s.`);
            } else {
                // Autres erreurs HTTP (400, 500, etc.)
                console.error(`Erreur API Gemini: Statut ${response.status}`);
                break; // Erreur non-recoverable, on sort
            }

        } catch (error) {
            console.error(`Erreur lors de l'appel à Gemini (tentative ${i + 1}):`, error.message);
        }

        // Attendre avant la prochaine tentative (Backoff Exponentiel)
        if (i < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; // Doubler le délai
        }
    }
    return resultText;
}


// -------------------------------------------------------------------------
// ENDPOINT 1 : Tirage Aléatoire Pondéré (Cœur de l'application)
// -------------------------------------------------------------------------

/**
 * Endpoint qui exécute le Tirage Pondéré basé sur la budgétisation 20%/80%.
 */
app.get('/random', async (req, res) => {
    
    // Vérification initiale des clés Twitch (Maintenant avec les vraies clés, la vérification est moins critique)
    if (TWITCH_CLIENT_ID === 'VOTRE_CLIENT_ID_TWITCH') {
        return res.status(500).json({ error: "Veuillez configurer vos identifiants Twitch dans index.js." });
    }

    try {
        // 1. Récupérer tous les streamers du pool (LECTURE FIREBASE)
        const snapshot = await db.collection(SUBMISSION_COLLECTION_PATH).get();
        if (snapshot.empty) {
            return res.status(404).json({ message: "Aucun streamer trouvé dans le pool de soumission." });
        }
        
        // Mapper les données Firestore (y compris les métriques de pondération)
        const allStreamers = snapshot.docs.map(doc => ({ 
            username: doc.data().username, 
            last_draw_date: doc.data().last_draw_date,
            avg_score: doc.data().avg_score || 3.0 // Par défaut, note neutre si aucune
        }));

        const allUsernames = allStreamers.map(s => s.username);

        // 2. Vérification des statuts en direct via Twitch API (PAS FIREBASE)
        const liveStreamsData = await getLiveStreamsData(allUsernames);
        const liveStreamMap = new Map(liveStreamsData.map(stream => [stream.user_login.toLowerCase(), stream]));
        
        // Filtrer les streamers qui sont Live et sous le seuil de 151 spectateurs
        let availableStreamers = allStreamers
            .map(s => {
                const liveData = liveStreamMap.get(s.username.toLowerCase());
                return {
                    ...s,
                    viewer_count: liveData ? liveData.viewer_count : null,
                    is_available: !!liveData && liveData.viewer_count < 151 
                };
            })
            .filter(s => s.is_available);
            
        if (availableStreamers.length === 0) {
            return res.status(404).json({ message: "Aucun streamer soumis n'est en live ou disponible." });
        }


        // --- LOGIQUE CRITIQUE DE BUDGÉTISATION DU TIRAGE (20% Urgence / 80% Croissance) ---

        // Séparer les pools
        const poolUrgence = availableStreamers.filter(s => s.viewer_count <= 1); // 0 ou 1 viewer
        const poolCroissance = availableStreamers.filter(s => s.viewer_count > 1); // 2 à 150 viewers
        
        let targetPool;
        let poolUsedName;
        
        // Décision : 20% de chance pour le Pool Urgence (si disponible)
        if (poolUrgence.length > 0 && Math.random() < 0.2) { 
            targetPool = poolUrgence;
            poolUsedName = "Urgence (0-1 Spectateur) - 20% Budget";
        } else {
            // 80% des cas ou Pool Urgence est vide
            if (poolCroissance.length === 0) {
                // Fallback : S'il n'y a pas de streamers "Croissance", on utilise l'Urgence restante
                targetPool = poolUrgence; 
                poolUsedName = "Urgence (0-1 Spectateur) - Fallback";
            } else {
                // Cas standard (80%) : Utiliser la pool Croissance
                targetPool = poolCroissance;
                poolUsedName = "Croissance (2-150 Spectateurs) - 80% Budget";
            }
        }
        
        if (targetPool.length === 0) {
            return res.status(404).json({ message: "Aucun streamer disponible pour le tirage final." });
        }
        
        
        // --- LOGIQUE DE PONDÉRATION (Appliquée si le Pool Croissance est utilisé) ---
        
        let finalSelectionPool;
        
        if (poolUsedName.startsWith("Croissance")) {
            
            // 1. Pondération Équité (Attente) : Sélectionne la moitié qui attend depuis le plus longtemps
            targetPool.sort((a, b) => {
                const dateA = a.last_draw_date ? a.last_draw_date.toDate().getTime() : 0;
                const dateB = b.last_draw_date ? b.last_draw_date.toDate().getTime() : 0;
                return dateA - dateB; // Tri ascendant par date (les plus anciennes sont les premières)
            });
            const topEquity = targetPool.slice(0, Math.ceil(targetPool.length / 2)); 

            // 2. Pondération Qualité (Mérite) : Sélectionne la moitié avec le meilleur score
            targetPool.sort((a, b) => b.avg_score - a.avg_score); // Tri descendant par score
            const topQuality = targetPool.slice(0, Math.ceil(targetPool.length / 2)); 

            // 3. Combinaison (pour inclure les streamers qui excellent dans au moins une catégorie)
            const combinedPool = [...new Set([...topEquity, ...topQuality])];
            finalSelectionPool = combinedPool.length > 0 ? combinedPool : targetPool;
            
        } else {
            // Pool Urgence : tirage aléatoire simple car la priorité est déjà établie par le viewer_count
            finalSelectionPool = targetPool;
        }

        // 4. Tirage final aléatoire dans le pool sélectionné
        const winner = finalSelectionPool[Math.floor(Math.random() * finalSelectionPool.length)];

        // 5. Mettre à jour les métriques du gagnant (ÉCRITURE FIREBASE)
        await updateStreamerDrawMetrics(winner.username);

        // 6. Réponse de l'API (avec l'information sur le pool utilisé)
        const streamData = liveStreamMap.get(winner.username.toLowerCase());
        const streamTitle = streamData ? streamData.title : "Titre non disponible";

        // ID pour le suivi du vote post-découverte (Label de Qualité)
        const submissionId = admin.firestore.Timestamp.now().toMillis() + '-' + Math.random().toString(36).substring(2, 9);
        
        res.json({
            status: "success",
            pool_used: poolUsedName, 
            submission_id: submissionId, 
            streamer: {
                username: winner.username,
                viewer_count: winner.viewer_count,
                title: streamTitle,
                avg_score: winner.avg_score,
                last_draw: winner.last_draw_date ? winner.last_draw_date.toDate().toISOString() : "Jamais"
            },
            redirect_url: `https://www.twitch.tv/${winner.username}?ref=votre_api_decouverte` 
        });

    } catch (error) {
        console.error("Erreur générale dans l'API /random:", error);
        res.status(500).json({ error: "Erreur interne du serveur lors du tirage au sort." });
    }
});

// -------------------------------------------------------------------------
// ENDPOINT 2 : Soumission d'un nouveau streamer (/submit)
// -------------------------------------------------------------------------

app.post('/submit', async (req, res) => {
    const { username } = req.body;

    if (!username) {
        return res.status(400).json({ error: "Le nom d'utilisateur (username) est requis." });
    }

    const lowerUsername = username.toLowerCase().trim();
    const docRef = db.collection(SUBMISSION_COLLECTION_PATH).doc(lowerUsername);

    try {
        // Vérification d'existence dans Firebase (LECTURE FIREBASE)
        const doc = await docRef.get();

        if (doc.exists) {
            return res.status(409).json({ message: `Le streamer ${lowerUsername} est déjà dans le pool.` });
        }

        // Ajout du nouveau streamer avec des métriques initiales (ÉCRITURE FIREBASE)
        await docRef.set({
            username: lowerUsername,
            created_at: admin.firestore.Timestamp.now(),
            last_draw_date: null,
            draw_count: 0,
            avg_score: 3.0, // Score de départ neutre
            rating_count: 0
        });

        res.status(201).json({ status: "success", message: `Streamer ${lowerUsername} ajouté au pool.` });

    } catch (error) {
        console.error("Erreur lors de la soumission du streamer:", error);
        res.status(500).json({ error: "Erreur interne du serveur lors de la soumission." });
    }
});


// -------------------------------------------------------------------------
// ENDPOINT 3 : Noter un streamer (/rate)
// -------------------------------------------------------------------------

app.post('/rate', async (req, res) => {
    // Le `submission_id` permet de lier le vote à la session de découverte (non utilisé ici)
    const { username, rating } = req.body;
    // Idéalement, on utiliserait le userId de l'utilisateur authentifié pour éviter le spam de votes
    const userId = req.body.userId || 'anonymous_user'; 

    if (!username || rating === undefined || rating < 1 || rating > 5) {
        return res.status(400).json({ error: "Le nom d'utilisateur et une note valide (1-5) sont requis." });
    }

    const lowerUsername = username.toLowerCase().trim();
    
    try {
        // Enregistrer le vote dans la collection de votes (ÉCRITURE FIREBASE)
        await db.collection(RATING_COLLECTION_PATH).add({
            username: lowerUsername,
            rating: parseInt(rating, 10),
            user_id: userId, 
            timestamp: admin.firestore.Timestamp.now()
        });
        
        // Recalculer la moyenne et mettre à jour le document du streamer (LECTURE/ÉCRITURE FIREBASE)
        await recalculateAverageScore(lowerUsername);

        res.status(200).json({ status: "success", message: `Note de ${rating}/5 enregistrée pour ${lowerUsername}.` });

    } catch (error) {
        console.error("Erreur lors de l'enregistrement de la note:", error);
        res.status(500).json({ error: "Erreur interne du serveur lors de l'enregistrement de la note." });
    }
});


// -------------------------------------------------------------------------
// ENDPOINT 4 : Demander une critique IA du streamer (/review-streamer)
// -------------------------------------------------------------------------

app.post('/review-streamer', async (req, res) => {
    const { username } = req.body;

    if (!username) {
        return res.status(400).json({ error: "Le nom d'utilisateur est requis pour la critique IA." });
    }

    // 1. Définir le prompt et l'instruction système
    const systemPrompt = "Vous êtes un critique de streaming Twitch. Fournissez une critique concise, positive et engageante en un seul paragraphe sur le streamer demandé. Concentrez-vous sur le style, le contenu et la communauté. Répondez en français.";
    const userQuery = `Générer une critique du streamer Twitch : ${username}.`;
    
    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        
        // Utilisation de l'ancrage Google Search pour des informations actualisées
        tools: [{ "google_search": {} }], 
        
        systemInstruction: {
            parts: [{ text: systemPrompt }]
        },
    };
    
    try {
        // 2. Appeler l'API Gemini avec gestion du backoff
        const reviewText = await callGeminiApi(payload);
        
        // 3. Répondre au client
        res.status(200).json({ 
            status: "success", 
            username: username,
            review: reviewText
        });
        
    } catch (error) {
        console.error("Erreur lors de l'appel à l'API Gemini:", error);
        res.status(500).json({ error: "Erreur interne du serveur lors de la génération de la critique IA." });
    }
});


// Démarrage du serveur
app.listen(port, () => {
    console.log(`Le serveur d'API écoute sur le port : ${port}`);
    console.log(`Endpoint de Tirage : http://localhost:${port}/random`);
    console.log(`Endpoint de Soumission : http://localhost:${port}/submit`);
    console.log(`Endpoint de Notation : http://localhost:${port}/rate`);
    console.log(`Endpoint de Critique IA : http://localhost:${port}/review-streamer`);
});