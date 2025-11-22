import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, Timestamp } from 'firebase/firestore';
import { Loader2, Send, Clock, User, CheckCircle, AlertTriangle, Zap, TrendingUp, Search, ExternalLink } from 'lucide-react';

// --- CONFIGURATION FIREBASE ---
// Variables globales fournies par l'environnement
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// Initialisation des services
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Chemin de la collection publique (pour que tous les utilisateurs puissent y accéder)
const getStreamerDocPath = (username) => {
  return `artifacts/${appId}/public/data/submitted_streamers/${username.toLowerCase()}`;
};

const COOLDOWN_HOURS = 12; // Période de dépendance pour la resoumission
const COOLDOWN_MS = COOLDOWN_HOURS * 60 * 60 * 1000;

const App = () => {
  // --- ÉTATS POUR LA SOUMISSION ---
  const [username, setUsername] = useState('');
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [canSubmit, setCanSubmit] = useState(true);
  const [lastSubmissionTime, setLastSubmissionTime] = useState(null);

  // --- NOUVEAUX ÉTATS POUR LA DÉCOUVERTE ---
  const [discoveredStreamer, setDiscoveredStreamer] = useState(null);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryMessage, setDiscoveryMessage] = useState('Prêt à explorer le pool !');

  // 1. Initialisation et Authentification Firebase
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Erreur d'authentification Firebase:", error);
      }
    };

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        setUserId(null);
      }
      setLoading(false);
    });

    initializeAuth();
    return () => unsubscribe();
  }, []);

  // 2. Vérification du Cooldown (Soumission)
  const checkCooldown = useCallback(async (currentUsername) => {
    if (!currentUsername || !userId) return;
    
    const docRef = doc(db, getStreamerDocPath(currentUsername));

    try {
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        const lastSubmitted = data.last_submitted.toDate().getTime();
        const now = Date.now();
        
        if (now - lastSubmitted < COOLDOWN_MS) {
          setCanSubmit(false);
          setLastSubmissionTime(lastSubmitted);
          const remainingTime = new Date(lastSubmitted + COOLDOWN_MS);
          setMessage(
            `Vous avez déjà soumis cette chaîne. Prochaine soumission autorisée : ${remainingTime.toLocaleTimeString()} le ${remainingTime.toLocaleDateString()}.`
          );
        } else {
          setCanSubmit(true);
          setLastSubmissionTime(null);
          setMessage("Soumission autorisée !");
        }
      } else {
        setCanSubmit(true);
        setLastSubmissionTime(null);
        setMessage("Première soumission pour cette chaîne.");
      }
    } catch (error) {
      console.error("Erreur lors de la vérification du cooldown:", error);
      setMessage("Erreur lors de la vérification du délai. Veuillez réessayer.");
      setCanSubmit(false);
    }
  }, [userId]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (username.trim()) {
        checkCooldown(username.trim());
      } else {
        setMessage('');
        setCanSubmit(true);
        setLastSubmissionTime(null);
      }
    }, 500); // Debounce pour éviter trop de requêtes
    return () => clearTimeout(handler);
  }, [username, checkCooldown]);

  // 3. Logique de Soumission (Mise à jour Firestore)
  const handleSubmit = async (e) => {
    e.preventDefault();
    const streamerName = username.trim().toLowerCase();
    if (!userId || isSubmitting || !canSubmit || streamerName === '') return;

    setIsSubmitting(true);
    setMessage('Soumission en cours...');

    const nowTimestamp = Timestamp.now();
    
    // Initialisation des données pour les systèmes de Pondération et de Qualité
    const streamerData = {
      username: streamerName,
      submitter_uid: userId, 
      last_submitted: nowTimestamp, 
      // Métriques pour le Tirage Pondéré
      last_draw_date: new Timestamp(0, 0), // Jamais tiré au début (date très ancienne)
      draw_count: 0,
      // Métriques pour le Label de Qualité (avg_score et total_votes)
      avg_score: 3.0, // Score neutre par défaut
      total_votes: 0, 
    };

    const docRef = doc(db, getStreamerDocPath(streamerName));
    
    try {
      // Utilisez setDoc avec merge: true pour ne pas écraser les métriques existantes (score, draw_count)
      await setDoc(docRef, streamerData, { merge: true });
      
      setMessage(
        <div>
            <CheckCircle className="inline w-5 h-5 mr-2 text-green-500" />
            Chaîne **{username}** soumise avec succès ! Vous êtes dans le pool.
        </div>
      );
      setLastSubmissionTime(nowTimestamp.toDate().getTime());
      setCanSubmit(false); // Bloque la soumission après succès
      
    } catch (error) {
      console.error("Erreur d'ajout à Firestore:", error);
      setMessage("Échec de la soumission. Veuillez réessayer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4. Logique de Découverte (Appel API au Backend /random)
  const handleDiscoverStreamer = async () => {
    setIsDiscovering(true);
    setDiscoveryMessage('Recherche du meilleur streamer à vous présenter, selon nos critères Équité/Qualité...');
    setDiscoveredStreamer(null);

    try {
        // Appel à l'endpoint /random de votre serveur index.js
        const response = await fetch('/random'); 
        const data = await response.json();

        if (response.ok && data.status === "success") {
            setDiscoveredStreamer(data.streamer);
            // Afficher le pool utilisé pour expliquer la décision
            setDiscoveryMessage(
                <div>
                    🎉 Succès ! Streamer trouvé dans la **{data.pool_used}** : 
                    <span className='font-bold text-indigo-700 ml-1'>{data.streamer.username}</span> !
                </div>
            );
        } else {
            // Gérer les messages d'erreur du backend (ex: Aucun streamer disponible)
            setDiscoveryMessage(
                <div>
                    ❌ Échec de la découverte : <span className='font-semibold'>{data.message || data.error || 'Erreur inconnue.'}</span>
                </div>
            );
        }
    } catch (error) {
        console.error("Erreur d'appel API /random:", error);
        setDiscoveryMessage('Une erreur de connexion au serveur est survenue (Assurez-vous que index.js est fonctionnel).');
    } finally {
        setIsDiscovering(false);
    }
  };

  // 5. Affichage
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        <span className="ml-3 text-lg font-semibold text-gray-700">Connexion sécurisée...</span>
      </div>
    );
  }

  const isInvalidUsername = username.trim() === '';

  const getRemainingTimeText = () => {
    if (!lastSubmissionTime || canSubmit) return null;
    const now = Date.now();
    const expiry = lastSubmissionTime + COOLDOWN_MS;
    const remaining = expiry - now;
    
    const h = Math.floor(remaining / (1000 * 60 * 60));
    const m = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((remaining % (1000 * 60)) / 1000);

    return `Temps restant avant resoumission : ${h}h ${m}m ${s}s`;
  };

  // Composant d'explication du Pool
  const PoolStatus = ({ type }) => {
    if (type === 'urgence') {
      return (
        <div className="flex items-center text-sm font-medium text-red-700 bg-red-100 p-3 rounded-lg border border-red-300">
          <Zap className="w-5 h-5 mr-2 text-red-500" />
          **Pool Urgence (0-1 Viewer)** : Vous bénéficiez d'un filet de sécurité, mais votre chance de tirage est limitée à 20%.
        </div>
      );
    }
    return (
      <div className="flex items-center text-sm font-medium text-green-700 bg-green-100 p-3 rounded-lg border border-green-300">
        <TrendingUp className="w-5 h-5 mr-2 text-green-500" />
        **Pool Croissance (2-150 Viewers)** : Votre visibilité est prioritaire (80% des tirages) et basée sur l'Équité et la Qualité.
      </div>
    );
  };

  // Composant d'affichage de la découverte
  const DiscoverySection = () => (
    <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200 space-y-4">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center border-b pb-2">
            <Search className="w-6 h-6 mr-3 text-indigo-600"/>
            Découvrir un Streamer
        </h2>
        
        <div 
          className={`p-3 text-sm rounded-lg transition duration-300 
            ${discoveryMessage.includes('Succès') ? 'bg-green-100 text-green-700' : discoveryMessage.includes('Échec') || discoveryMessage.includes('Erreur') ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-700'}`
          }
        >
          <div dangerouslySetInnerHTML={{ __html: discoveryMessage }}></div>
        </div>

        <button
          onClick={handleDiscoverStreamer}
          className={`w-full flex items-center justify-center px-6 py-3 text-base font-medium rounded-lg shadow-xl transition duration-300 transform hover:scale-[1.01]
            ${isDiscovering
              ? 'bg-gray-400 cursor-not-allowed text-gray-700'
              : 'bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-300'
            }`
          }
          disabled={isDiscovering}
        >
          {isDiscovering ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Analyse des Pools...
            </>
          ) : (
            <>
              <Zap className="w-5 h-5 mr-2" />
              Trouver ma Pépite !
            </>
          )}
        </button>

        {discoveredStreamer && (
            <div className='mt-6 p-4 bg-gray-50 border border-gray-300 rounded-lg space-y-3'>
                <h3 className='text-xl font-extrabold text-indigo-700'>
                    Streamer sélectionné : {discoveredStreamer.username}
                </h3>
                <p className='text-gray-700'>**Titre du stream:** {discoveredStreamer.title}</p>
                <p className='text-gray-700'>**Spectateurs actuels:** <span className='font-bold text-lg text-red-600'>{discoveredStreamer.viewer_count}</span></p>
                <p className='text-gray-700'>**Score Qualité (Moy.):** {discoveredStreamer.avg_score.toFixed(1)} / 5</p>
                <a
                    href={discoveredStreamer.redirect_url || `https://www.twitch.tv/${discoveredStreamer.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-pink-600 hover:bg-pink-700 transition duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500"
                >
                    Voir la chaîne en direct
                    <ExternalLink className="w-4 h-4 ml-2" />
                </a>
            </div>
        )}
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-8 p-8 bg-white rounded-xl shadow-2xl border-t-4 border-indigo-600">
        
        {/* Colonne de Soumission */}
        <div className="space-y-6">
            <h1 className="text-3xl font-extrabold text-gray-900 flex items-center justify-center lg:justify-start">
                <Clock className="w-8 h-8 mr-3 text-indigo-600"/> 
                Soumission au Pool
            </h1>
            <p className="text-sm text-gray-600">
                Soumettez votre chaîne pour entrer dans le pool de découverte. 
                Seules les chaînes de **0 à 150 spectateurs** sont éligibles.
            </p>

            <div className="flex items-center text-sm text-gray-500 bg-indigo-50 p-3 rounded-lg">
                <User className="w-4 h-4 mr-2 text-indigo-600" />
                Votre ID de Session : <code className="ml-2 font-mono text-xs text-indigo-700 select-all">{userId}</code>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Le champ de saisie du nom d'utilisateur et le bouton de soumission restent ici */}
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                  Nom d'utilisateur Twitch
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ex: xdsawyerlol"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition duration-150"
                  disabled={isSubmitting}
                  required
                />
              </div>

              <div 
                className={`p-3 text-sm rounded-lg transition duration-300 
                  ${!username ? 'hidden' : canSubmit ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-red-100 text-red-700 border border-red-300'}`
                }
              >
                {message && <div dangerouslySetInnerHTML={{ __html: message }}></div>}
                {!canSubmit && lastSubmissionTime && (
                    <div className="mt-1 font-semibold">
                        {getRemainingTimeText()}
                    </div>
                )}
              </div>
              
              <button
                type="submit"
                className={`w-full flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg shadow-md transition duration-300
                  ${isSubmitting || !canSubmit || isInvalidUsername
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
                  }`
                }
                disabled={isSubmitting || !canSubmit || isInvalidUsername}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Soumission au Pool...
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5 mr-2" />
                    Entrer dans le Pool de Visibilité
                  </>
                )}
              </button>
            </form>
            
            <hr className="my-6"/>
            <div className="space-y-4">
                <h2 className="text-xl font-bold text-gray-800 border-b pb-2">Fonctionnement du Moteur</h2>
                <PoolStatus type="urgence" />
                <PoolStatus type="croissance" />
                <p className="text-sm text-gray-500">
                    **Le tirage choisit toujours le pool qui a le plus besoin d'aide (20% Urgence) ou qui mérite la récompense (80% Croissance), selon une balance stratégique.**
                </p>
            </div>
        </div>
        
        {/* Colonne de Découverte (NOUVEAU) */}
        <DiscoverySection />
      </div>
    </div>
  );
};

export default App;