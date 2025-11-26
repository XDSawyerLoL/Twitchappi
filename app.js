// =========================================================
// Configuration des Endpoints API
// =========================================================
// L'URL de base pour toutes les API qui s'exécutent sur ce même serveur (justplayerstreamhubpro.onrender.com).
// Utiliser un chemin relatif ("/") permet d'éviter les erreurs CORS pour ces routes.
const INTERNAL_API_BASE = ''; 

// L'URL pour les routes IA/critiques
const CRITIQUE_API_URL = `${INTERNAL_API_BASE}/critique_ia`;
const DIAGNOSTIC_API_URL = `${INTERNAL_API_BASE}/diagnostic_titre`;
const GAME_ID_API_URL = `${INTERNAL_API_BASE}/gameid`;

// 🚨 CORRECTION CORS 🚨
// Nous appelons maintenant nos propres routes /random et /boost sur le serveur principal, 
// au lieu de l'API externe (twitch-random-api.onrender.com) qui posait problème.
const RANDOM_API_URL = `${INTERNAL_API_BASE}/random`; 
const BOOST_API_URL = `${INTERNAL_API_BASE}/boost`; 
// =========================================================


let currentStreamer = null;
const resultsContainer = document.getElementById('random-streamer-results');
const boostButton = document.getElementById('boost-button');
const critiqueButton = document.getElementById('critique-button');
const titleDiagnosticButton = document.getElementById('title-diagnostic-button');
const loadingSpinner = document.getElementById('loading-spinner');
const errorDisplay = document.getElementById('error-message');


/**
 * @typedef {object} StreamerDetails
 * @property {string} username
 * @property {string} title
 * @property {string} game_name
 * @property {number} viewer_count
 * @property {number} follower_count
 * @property {number} avg_score
 */


// --- Affichage des messages et état de chargement ---

function showLoading(isLoading) {
    loadingSpinner.classList.toggle('hidden', !isLoading);
    boostButton.disabled = isLoading || !currentStreamer;
    critiqueButton.disabled = isLoading || !currentStreamer;
    titleDiagnosticButton.disabled = isLoading || !currentStreamer;
}

function displayMessage(message, isError = false) {
    errorDisplay.textContent = message;
    errorDisplay.classList.toggle('text-red-500', isError);
    errorDisplay.classList.toggle('text-green-500', !isError);
    errorDisplay.classList.remove('hidden');
    // Cacher après 5 secondes si ce n'est pas une erreur critique
    if (!isError) {
        setTimeout(() => errorDisplay.classList.add('hidden'), 5000);
    }
}

// --- Fonctions d'appel API ---

/**
 * Récupère un ID de jeu Twitch à partir de son nom.
 * @param {string} gameName 
 * @returns {Promise<string|null>} L'ID du jeu ou null.
 */
async function getGameId(gameName) {
    try {
        const response = await fetch(`${GAME_ID_API_URL}?name=${encodeURIComponent(gameName)}`);
        if (!response.ok) {
            console.error("Erreur Game ID API:", response.status);
            return null;
        }
        const data = await response.json();
        return data.game_id || null;
    } catch (error) {
        console.error("Erreur réseau Game ID:", error);
        return null;
    }
}


/**
 * Effectue un appel API vers l'endpoint /random pour trouver un streamer.
 * @returns {Promise<StreamerDetails|null>} Les détails du streamer.
 */
async function fetchRandomStreamer() {
    showLoading(true);
    resultsContainer.innerHTML = '';
    currentStreamer = null;
    errorDisplay.classList.add('hidden');
    
    // Le filtre max_viewers de 30 est géré côté serveur par index.cjs

    try {
        // 🚨 Utilisation du nouvel endpoint local
        const response = await fetch(`${RANDOM_API_URL}?max_viewers=30`); 
        
        if (!response.ok) {
            const errorData = await response.json();
            displayMessage(`Erreur de scan: ${errorData.message || response.statusText}`, true);
            showLoading(false);
            return null;
        }

        const data = await response.json();
        const streamer = data.streamer;
        
        // Stocker pour les autres fonctions
        currentStreamer = streamer; 
        
        renderStreamerDetails(streamer);

    } catch (error) {
        displayMessage('Erreur de connexion serveur. Vérifiez que le serveur est actif.', true);
        console.error("Erreur Fetch Random Streamer:", error);
    } finally {
        showLoading(false);
    }
}

/**
 * Envoie une demande de boost au serveur.
 */
async function sendBoostRequest() {
    if (!currentStreamer) {
        displayMessage("Aucun streamer sélectionné à booster.", true);
        return;
    }
    
    showLoading(true);
    errorDisplay.classList.add('hidden');

    try {
        // 🚨 Utilisation du nouvel endpoint local
        const response = await fetch(BOOST_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                channelName: currentStreamer.username,
                // Si vous aviez un user ID dans votre app, vous le mettriez ici
            })
        });

        const data = await response.json();

        if (response.ok && data.status === 'ok') {
            displayMessage(`🚀 ${data.message}`);
        } else {
            displayMessage(`Échec du boost: ${data.message || 'Erreur inconnue'}`, true);
        }

    } catch (error) {
        displayMessage('Erreur réseau lors de l\'envoi de la requête Boost.', true);
        console.error("Erreur Fetch Boost:", error);
    } finally {
        showLoading(false);
    }
}

/**
 * Demande une critique IA du streamer.
 */
async function fetchAICritique() {
    if (!currentStreamer) return;
    showLoading(true);
    
    // Afficher un message d'attente
    const critiqueOutput = document.getElementById('ia-critique-output');
    critiqueOutput.innerHTML = '<p class="text-indigo-400">🤖 L\'IA est en cours d\'analyse...</p>';

    const payload = {
        username: currentStreamer.username,
        game_name: currentStreamer.game_name,
        title: currentStreamer.title,
        viewer_count: currentStreamer.viewer_count,
        follower_count: currentStreamer.follower_count 
    };

    try {
        const response = await fetch(CRITIQUE_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        
        if (response.ok && data.critique) {
            critiqueOutput.innerHTML = `<div class="p-3 bg-gray-700 rounded-lg whitespace-pre-line">${data.critique}</div>`;
        } else {
            critiqueOutput.innerHTML = `<p class="text-red-400">Erreur IA: ${data.critique || 'Service non disponible'}</p>`;
        }

    } catch (error) {
        critiqueOutput.innerHTML = '<p class="text-red-400">Erreur de connexion avec l\'API IA.</p>';
        console.error("Erreur Fetch IA Critique:", error);
    } finally {
        showLoading(false);
    }
}

/**
 * Demande un diagnostic IA du titre du stream.
 */
async function fetchAITitleDiagnostic() {
    if (!currentStreamer) return;
    showLoading(true);
    
    const diagnosticOutput = document.getElementById('ia-diagnostic-output');
    diagnosticOutput.innerHTML = '<p class="text-indigo-400">🧠 Diagnostic en cours...</p>';

    const payload = {
        title: currentStreamer.title,
        game_name: currentStreamer.game_name
    };

    try {
        const response = await fetch(DIAGNOSTIC_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok && data.diagnostic) {
            diagnosticOutput.innerHTML = `<div class="p-3 bg-gray-700 rounded-lg whitespace-pre-line">${data.diagnostic}</div>`;
        } else {
            diagnosticOutput.innerHTML = `<p class="text-red-400">Erreur IA: ${data.diagnostic || 'Service non disponible'}</p>`;
        }

    } catch (error) {
        diagnosticOutput.innerHTML = '<p class="text-red-400">Erreur de connexion avec l\'API IA.</p>';
        console.error("Erreur Fetch IA Diagnostic:", error);
    } finally {
        showLoading(false);
    }
}


// --- Fonctions de rendu ---

/**
 * Affiche les détails d'un streamer dans l'interface.
 * @param {StreamerDetails} streamer 
 */
function renderStreamerDetails(streamer) {
    if (!streamer) return;

    // Reset l'état des critiques IA
    document.getElementById('ia-critique-output').innerHTML = '';
    document.getElementById('ia-diagnostic-output').innerHTML = '';

    const tagsHtml = (streamer.tags || []).map(tag => 
        `<span class="inline-block bg-indigo-900 text-indigo-200 text-xs px-2 py-1 rounded-full">${tag}</span>`
    ).join('');

    resultsContainer.innerHTML = `
        <div class="bg-gray-800 p-6 rounded-xl shadow-lg border border-indigo-600 space-y-4">
            <div class="flex justify-between items-center">
                <h2 class="text-3xl font-bold text-white truncate">${streamer.username}</h2>
                <div class="flex items-center space-x-2">
                    <span class="text-lg font-semibold text-yellow-400">${streamer.avg_score} / 5.0</span>
                    <span class="text-yellow-500">⭐</span>
                </div>
            </div>

            <p class="text-indigo-400 text-sm italic">Jeu: ${streamer.game_name}</p>
            <p class="text-gray-300 text-lg">${streamer.title}</p>
            
            <div class="grid grid-cols-2 gap-4 text-sm text-gray-400">
                <p>Spectateurs: <span class="text-white font-semibold">${streamer.viewer_count.toLocaleString()}</span></p>
                <p>Followers: <span class="text-white font-semibold">${streamer.follower_count.toLocaleString()}</span></p>
            </div>
            
            <div class="flex flex-wrap gap-2 pt-2">
                ${tagsHtml || '<span class="text-gray-500 text-sm">Aucun tag</span>'}
            </div>
            
            <div class="pt-4 border-t border-gray-700">
                <a href="https://twitch.tv/${streamer.user_login}" target="_blank" class="text-indigo-400 hover:text-indigo-300 font-semibold transition duration-150">
                    ➡️ Voir le stream sur Twitch
                </a>
            </div>
        </div>
    `;
}

// --- Initialisation ---

document.addEventListener('DOMContentLoaded', () => {
    // Boutons de navigation/scan
    document.getElementById('scan-button').addEventListener('click', fetchRandomStreamer);
    
    // Boutons d'action (doivent être initialement désactivés)
    boostButton.addEventListener('click', sendBoostRequest);
    critiqueButton.addEventListener('click', fetchAICritique);
    titleDiagnosticButton.addEventListener('click', fetchAITitleDiagnostic);

    // Initialisation de l'état
    boostButton.disabled = true;
    critiqueButton.disabled = true;
    titleDiagnosticButton.disabled = true;
    
    // Lancement du premier scan au chargement
    fetchRandomStreamer();
});
