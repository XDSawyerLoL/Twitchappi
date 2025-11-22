// --- IMPORTATIONS NÉCESSAIRES ---
// Assurez-vous d'avoir les dépendances 'express', 'node-fetch', 'firebase-admin' installées.
import express from 'express';
import fetch from 'node-fetch';

// Firebase Admin SDK est requis pour les opérations de backend (Node.js)
import * as admin from 'firebase-admin';

// --- CONFIGURATION FIREBASE ADMIN ---
// Les identifiants de configuration sont fournis par l'environnement
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// Initialisation de Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        // Utilisation du compte de service par défaut pour l'authentification
        credential: admin.credential.applicationDefault() 
    });
}
const db = admin.firestore();
const app = express();
// Lecture du port depuis l'environnement
const port = process.env.PORT || 3000; 

// Middleware pour analyser le corps JSON
app.use(express.json());

// --- CONFIGURATION TWITCH SÉCURISÉE (CRITIQUE) ---
// ⚠️ Les clés sont LUES depuis les variables d'environnement (Render)
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID; 
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
let TWITCH_ACCESS_TOKEN = null; // Le jeton sera stocké temporairement en mémoire

// Chemin de la collection Firestore pour les streamers soumis (Collection Publique)
const SUBMISSION_COLLECTION_PATH = `artifacts/${appId}/public/data/submitted_streamers`;


// --- FONCTIONS UTILITAIRES ---

/**
 * Récupère le jeton d'accès Twitch (nécessaire pour appeler l'API Helix).
 */
async function getTwitchAccessToken() {
    if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
        console.error("ERREUR DE SÉCURITÉ : Les variables d'environnement TWITCH_CLIENT_ID ou TWITCH_CLIENT_SECRET sont manquantes.");
        return null;
    }
    
    if (TWITCH_ACCESS_TOKEN) return TWITCH_ACCESS_TOKEN;
    const tokenUrl = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
    
    try {
        // Implémentation de la fonction fetch avec backoff exponentiel non affichée ici pour la concision
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
 * Met à jour les métriques de tirage du streamer dans Firestore après qu'il ait été sélectionné.
 */
async function updateStreamerDrawMetrics(username) {
    try {
        const docRef = db.collection(SUBMISSION_COLLECTION_PATH).doc(username.toLowerCase());
        // Met à jour la date du dernier tirage et incrémente le compteur de tirages
        await docRef.update({
            last_draw_date: admin.firestore.Timestamp.now(),
            draw_count: admin.firestore.FieldValue.increment(1)
        });
    } catch (error) {
        console.error(`Erreur lors de la mise à jour des métriques pour ${username}:`, error);
    }
}

// --- ENDPOINT PRINCIPAL : /random ---

/**
 * Endpoint qui exécute le Tirage Pondéré basé sur la budgétisation 20%/80%.
 */
app.get('/random', async (req, res) => {
    
    // Vérification de sécurité des clés d'environnement
    if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
        return res.status(500).json({ error: "Configuration manquante : Clés Twitch non définies dans les variables d'environnement." });
    }

    try {
        // 1. Récupérer tous les streamers du pool
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

        // 2. Vérification des statuts en direct via Twitch API
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

        // 5. Mettre à jour les métriques du gagnant
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


// Démarrage du serveur
app.listen(port, () => {
    console.log(`Le serveur d'API écoute sur le port : ${port}`);
    console.log(`Endpoint de Tirage : http://localhost:${port}/random`);
});
