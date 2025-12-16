/**
 * ===================================================================
 * STREAMER HUB V15 - LOGIQUE DU COCKPIT (LCD.js)
 * ===================================================================
 */

// Configuration API (Utilise les endpoints définis dans votre serveur)
const API_BASE_URL = window.location.origin;
let twitchPlayer = null;

/**
 * 1. FONCTION DE FERMETURE ET REFRESH
 * Ferme le cockpit et rafraîchit la page Just Player pour mettre à jour les stats.
 */
function closeAndRefresh() {
    console.log("Fermeture du cockpit et rafraîchissement du site Just Player...");
    
    // Si la fenêtre parente existe encore, on la rafraîchit
    if (window.opener && !window.opener.closed) {
        try {
            window.opener.location.reload();
        } catch (e) {
            console.error("Erreur lors du rafraîchissement de la page parente:", e);
        }
    }
    
    // Fermeture du pop-up actuel
    window.self.close();
}

/**
 * 2. RÉCUPÉRATION DU STREAM (MICRO-NICHE)
 * Appelle votre route Node.js /get_micro_niche_stream_cycle
 */
async function fetchNextStream() {
    const statusEl = document.getElementById('player-status');
    statusEl.innerHTML = '<i class="fas fa-sync fa-spin"></i> Recherche Niche...';

    try {
        const response = await fetch(`${API_BASE_URL}/get_micro_niche_stream_cycle`);
        const data = await response.json();

        if (data.success && data.channel) {
            statusEl.innerHTML = `<i class="fas fa-eye"></i> Focus: ${data.channel} (${data.viewers} vues)`;
            updateTwitchEmbed(data.channel);
        } else {
            statusEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Aucun flux trouvé';
            // Relance une recherche après 10 secondes en cas d'échec
            setTimeout(fetchNextStream, 10000);
        }
    } catch (error) {
        console.error("Erreur lors de la récupération du flux:", error);
        statusEl.innerHTML = '<i class="fas fa-wifi"></i> Erreur Connexion';
    }
}

/**
 * 3. MISE À JOUR DU LECTEUR TWITCH
 * Utilise l'API Embed de Twitch chargée dans LCD.html
 */
function updateTwitchEmbed(channel) {
    const embedContainer = document.getElementById('twitch-embed');
    
    // Nettoie l'ancien contenu si nécessaire
    embedContainer.innerHTML = '';

    twitchPlayer = new Twitch.Embed("twitch-embed", {
        width: "100%",
        height: "100%",
        channel: channel,
        parent: [window.location.hostname],
        layout: "video",
        autoplay: true,
        muted: false
    });

    // Optionnel : Cycle automatique après 10 minutes sur un streamer
    // setTimeout(fetchNextStream, 600000); 
}

/**
 * 4. INITIALISATION AU CHARGEMENT
 */
window.onload = () => {
    console.log("STREAMER HUB V15 Cockpit Initialisé.");
    fetchNextStream();
};

/**
 * 5. SÉCURITÉ DE FERMETURE
 * Rafraîchit le site si l'utilisateur ferme l'onglet via la croix du navigateur.
 */
window.onbeforeunload = function() {
    if (window.opener && !window.opener.closed) {
        window.opener.location.reload();
    }
};
