// --- DÉCLARATIONS GLOBALES ET CONSTANTES ---
const API_BASE = window.location.origin;
const DEFAULT_CHANNEL = 'twitch'; 
const CYCLE_DURATION_MS = 3 * 60 * 1000; // 3 minutes

let embed = null;
let autoCycleTimer = null;
let countdownTimer = null;
let currentChannel = null;

// --- 1. Fonction de Lancement du Lecteur ---
function launchPlayer(channelName) {
    if (embed && embed.getChannel() === channelName) { return; }
    currentChannel = channelName;
    
    const hostWithoutPort = window.location.hostname;
    const parentList = [ hostWithoutPort, "localhost", "127.0.0.1", "justplayerstreamhubpro.onrender.com", "justplayer.fr" ];
    if (window.location.host.includes(':')) { parentList.push(window.location.host); }

    const embedContainer = document.getElementById('twitch-embed');
    if (!embedContainer) { return; }
    embedContainer.innerHTML = '';

    const config = { 
        width: "100%", height: "100%", channel: channelName,
        layout: "video", parent: parentList 
    };

    if (typeof Twitch !== 'undefined') {
        embed = new Twitch.Embed("twitch-embed", config);
    }
}

// --- 2. Fonction de Mise à Jour du Compteur ---
function updateCountdownDisplay(secondsLeft) {
    const statusEl = document.getElementById('player-status');
    const minutes = Math.floor(secondsLeft / 60);
    const seconds = secondsLeft % 60;
    
    let statusMessage = '';
    if (currentChannel) {
        // Utilisation du code hexadécimal direct (#59d682) pour éviter le blocage
        statusMessage = `<i class='fas fa-tv' style='color:#59d682;'></i> ${currentChannel.toUpperCase()} | `; 
    }
    
    statusMessage += `Prochain cycle: ${minutes}m ${seconds}s`;
    statusEl.innerHTML = statusMessage;
}

// --- 3. Fonction de Cycle Automatique (Appel API au Backend) ---
async function startCycle() {
    const statusEl = document.getElementById('player-status');
    
    if (autoCycleTimer) clearInterval(autoCycleTimer);
    if (countdownTimer) clearInterval(countdownTimer);

    statusEl.innerHTML = `<i class='fas fa-sync fa-spin'></i> Recherche micro-niche...`; 

    try {
        // APPEL API au backend Render
        const res = await fetch(`${API_BASE}/get_micro_niche_stream_cycle?min_viewers=0&max_viewers=50`); 
        
        if (!res.ok) {
            const errorText = await res.text().catch(() => 'Erreur inconnue.');
            throw new Error(`Erreur ${res.status}: ${errorText.substring(0, 50)}...`);
        }

        const data = await res.json();
        
        if (data.success && data.channel) {
            launchPlayer(data.channel);
        } else {
            launchPlayer(DEFAULT_CHANNEL);
            throw new Error(data.message || "Aucune chaîne dans la niche 0-50 trouvée. Lancement par défaut.");
        }
    } catch (e) {
        console.error("Échec de la recherche de micro-niche:", e.message);
        if (!currentChannel) launchPlayer(DEFAULT_CHANNEL); 
        statusEl.innerHTML = `<i class='fas fa-exclamation-triangle' style='color:red;'></i> Erreur: ${e.message}`;
    } finally {
        // Démarrer le timer de 3 minutes pour le cycle AUTOMATIQUE
        autoCycleTimer = setInterval(startCycle, CYCLE_DURATION_MS);
        
        // Affichage du Compteur
        let secondsLeft = CYCLE_DURATION_MS / 1000;
        updateCountdownDisplay(secondsLeft);

        countdownTimer = setInterval(() => {
            secondsLeft--;
            if (secondsLeft < 0) {
                clearInterval(countdownTimer);
                return;
            }
            updateCountdownDisplay(secondsLeft);
        }, 1000);
    }
}

// --- INITIALISATION ---
window.onload = () => {
    if (typeof Twitch === 'undefined') {
        document.getElementById('player-status').innerHTML = 'Erreur: La librairie Twitch n\'a pas pu être chargée.';
        return;
    }
    startCycle();
};
