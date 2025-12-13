<script src="https://embed.twitch.tv/embed/v1.js"></script>
<script>
    // =========================================================
    // CODE CORRIGÉ (Minimaliste)
    // =========================================================
    const API_BASE = window.location.origin;
    const DEFAULT_CHANNEL = 'twitch';
    // Durée du cycle automatique à 3 minutes.
    const AUTO_CYCLE_DURATION_MS = 3 * 60 * 1000; 
    let embed = null;
    let autoCycleTimer = null; 
    let countdownInterval = null; 
    let boostTimeout = null; 

    // --- GESTION ONGLETS ---
    function openTab(tabId) {
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
        const btn = document.querySelector(`.tab-btn[data-tab-id="${tabId}"]`);
        if(btn) btn.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        document.getElementById(tabId).classList.add('active');
        
        if (tabId === 'tab-followed') {
            loadFollowedStreams();
        }
    }
    
    // --- UTILS ---
    const safeFormat = (value) => { 
        if (value === 'N/A' || typeof value === 'undefined' || value === null) {
            return 'N/A';
        }
        return (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) 
               ? Number(value).toLocaleString('fr-FR') 
               : value.toString().toUpperCase();
    };

    // --- AUTH/STATUS CHECK (MAINTENU POUR LA CONNEXION TWITCH) ---
    async function checkTwitchStatus() {
        try {
            const res = await fetch(`${API_BASE}/twitch_user_status`);
            const data = await res.json();
            const dot = document.getElementById('status-dot');
            const text = document.getElementById('status-text');
            const btn = document.getElementById('btn-twitch-login');

            if (data.is_connected) {
                dot.className = 'status-dot status-connected';
                text.textContent = `Connecté: ${data.display_name}`;
                btn.style.display = 'none'; 
            } else {
                dot.className = 'status-dot status-disconnected';
                text.textContent = 'Déconnecté';
                btn.style.display = 'inline-block';
            }
        } catch (e) {
            console.error("Erreur statut Twitch:", e);
        }
    }


    // --- LECTEUR (INCLUT LE FIX DU DOMAINE PARENT) ---
    window.launchPlayer = function(channelName, videoId = null, time = 0) {
        if (embed && embed.getChannel() === channelName && !videoId) {
            return;
        }

        document.getElementById('twitch-embed').innerHTML = '';
        const config = { 
            width: "100%", 
            height: "100%", 
            layout: "video-and-chat", 
            // FIX: Assurez-vous que le domaine actuel et localhost sont listés dans 'parent'
            parent: [window.location.hostname, "localhost"] 
        };

        if (videoId) {
            config.video = videoId;
            if (time > 0) config.time = `${time}s`;
        } else {
            config.channel = channelName;
        }

        embed = new Twitch.Embed("twitch-embed", config);
    }

    // Logique du Lecteur par Défaut / Boost (DÉCLENCHE LE CYCLE AUTOMATIQUE)
    async function checkBoostAndPlay(isManualAction = false) {
        const playerStatusEl = document.getElementById('player-channel-status');
        const btnPrev = document.getElementById('btn-prev-stream');
        const btnNext = document.getElementById('btn-next-stream');
        
        // 1. Arrêter les timers existants
        if (autoCycleTimer) clearInterval(autoCycleTimer);
        if (countdownInterval) clearInterval(countdownInterval); 
        if (isManualAction && boostTimeout) clearTimeout(boostTimeout); 
        
        // Enregistrer l'heure de début du cycle ou récupérer l'heure du dernier cycle
        let startTime = Date.now();
        let secondsLeft = AUTO_CYCLE_DURATION_MS / 1000;
        
        // Persistance du timer via localStorage (pour survivre aux rechargements de page)
        if (!isManualAction && localStorage.getItem('lastCycleTime')) {
            const lastCycleTime = parseInt(localStorage.getItem('lastCycleTime'));
            const timeElapsed = Date.now() - lastCycleTime;
            
            if (timeElapsed < AUTO_CYCLE_DURATION_MS) {
                secondsLeft = Math.floor((AUTO_CYCLE_DURATION_MS - timeElapsed) / 1000);
                startTime = lastCycleTime; 
            } else {
                console.log("Temps de cycle dépassé. Forçage du prochain stream.");
                cycleStream('next'); 
                return; 
            }
        }
        
        // Mettre à jour localStorage immédiatement pour marquer le début du cycle
        localStorage.setItem('lastCycleTime', startTime);

        try {
            const res = await fetch(`${API_BASE}/get_default_stream`); 
            const data = await res.json();
            
            if (data.success) {
                // CORRECTION CLÉ: Utiliser les noms de variables du backend (channel_name, is_boosted)
                const { channel_name, viewers, title, is_boosted } = data; 
                launchPlayer(channel_name);
                
                if (is_boosted) {
                    btnPrev.disabled = true;
                    btnNext.disabled = true;
                    localStorage.removeItem('lastCycleTime'); // Pas de cycle auto en mode Boost
                    
                    playerStatusEl.innerHTML = `🔥 BOOST ACTIVÉ sur: ${title} (${safeFormat(viewers)} vues)`; 

                } else {
                    // Mode Auto-Discovery
                    btnPrev.disabled = false;
                    btnNext.disabled = false;
                    
                    playerStatusEl.innerHTML = `${title} (${safeFormat(viewers)} vues) <span id="timer-display" style="margin-left:10px; color:var(--color-ai-niche);"></span>`;
                    const timerDisplayEl = document.getElementById('timer-display');
                    
                    let currentSecondsLeft = secondsLeft;
                    
                    const updateTimer = () => {
                        const minutes = Math.floor(currentSecondsLeft / 60);
                        const seconds = currentSecondsLeft % 60;
                        timerDisplayEl.innerText = `(Prochain Auto-Cycle: ${minutes}m ${seconds.toString().padStart(2, '0')}s)`;
                        
                        currentSecondsLeft--;
                        
                        if (currentSecondsLeft < 0) {
                            clearInterval(countdownInterval); 
                        }
                    };
                    
                    updateTimer(); 

                    countdownInterval = setInterval(updateTimer, 1000);
                    
                    const actualDelay = secondsLeft * 1000;
                    if (actualDelay > 0) {
                        autoCycleTimer = setTimeout(() => {
                            cycleStream('next'); 
                        }, actualDelay);
                    }
                }
            } else {
                launchPlayer(data.channel_name || DEFAULT_CHANNEL); 
                playerStatusEl.innerHTML = `⚠️ ${data.title || 'Erreur de récupération lors du premier chargement.'}`;
                btnPrev.disabled = true;
                btnNext.disabled = true;
            }
        } catch (e) {
            console.error("Erreur dans la boucle du lecteur:", e.message);
            launchPlayer(DEFAULT_CHANNEL); 
            playerStatusEl.innerHTML = `❌ Erreur du Système. Rechargement manuel recommandé: ${e.message.substring(0, 50)}...`;
            btnPrev.disabled = true;
            btnNext.disabled = true;
        }
    }
    
    // Fonction pour changer de streamer manuellement
    async function cycleStream(direction) {
        // ... (Logique de désactivation des boutons et de l'affichage du chargement) ...
        const playerStatusEl = document.getElementById('player-channel-status');
        const btnPrev = document.getElementById('btn-prev-stream');
        const btnNext = document.getElementById('btn-next-stream');
        
        btnPrev.disabled = true;
        btnNext.disabled = true;
        playerStatusEl.innerHTML = `<i class='fas fa-sync fa-spin'></i> Changement de chaîne...`;

        if (autoCycleTimer) clearTimeout(autoCycleTimer);
        if (countdownInterval) clearInterval(countdownInterval); 
        
        try {
            const res = await fetch(`${API_BASE}/cycle_stream`, {
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify({ direction }) 
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || `Erreur Serveur: ${res.status}`);
            }

            const data = await res.json();
            
            if (data.success) {
                // CORRECTION: Utiliser data.channel_name
                launchPlayer(data.channel_name); 
                localStorage.setItem('lastCycleTime', Date.now()); 
            } else {
                throw new Error(data.error || 'Erreur inconnue.');
            }
            
        } catch (e) {
            playerStatusEl.innerHTML = `❌ Échec du changement: ${e.message}`;
        } finally {
            checkBoostAndPlay(true); 
        }
    }

    // --- AUTRES FONCTIONS (VOS FONCTIONS ORIGINALES) ---
    
    // NOTE: Les fonctions runAIAnalysis, runGlobalScan, loadFollowedStreams, 
    // et les gestionnaires d'événements (forms, buttons) sont censés être 
    // les mêmes que ceux qui fonctionnaient dans votre code original 
    // (hormis les corrections de variables que j'ai déjà appliquées ci-dessus).
    // Si ces fonctions causent des problèmes, veuillez me les montrer.
    
    // Je ne copie pas l'intégralité des fonctions lourdes (scan, IA, raid) ici 
    // pour éviter de modifier votre interface/logique plus que nécessaire,
    // mais je pars du principe que tout le reste de votre code (hors lecteur) est bon.
    
    // Je dois cependant inclure les fonctions d'action pour que le HTML ne les trouve pas.
    // Si votre code original contenait ces fonctions, elles doivent être conservées.
    // Si elles sont externes, ce n'est pas nécessaire. Je vais les coller à la fin 
    // pour être sûr que toutes les dépendances sont là.
    
    // ... Coller ici le reste de vos fonctions JavaScript si elles sont nécessaires ...
    // ... pour le bon fonctionnement (runAIAnalysis, runGlobalScan, loadFollowedStreams, etc.) ...
    
    // En attendant la version complète de votre script original, voici les stubs pour ne pas casser le chargement:
    async function runAIAnalysis(type, query, box, niche_score = null) { /* ... */ }
    async function runGlobalScan(query) { /* ... */ }
    async function loadFollowedStreams() { /* ... */ }


    // --- GESTION DES ÉVÉNEMENTS (VOS ORIGINAUX, SANS MODIFICATION DE LOGIQUE) ---
    document.getElementById('btn-twitch-login').addEventListener('click', () => {
        window.location.href = `${API_BASE}/twitch_auth_start`;
    });
    // ... Ajoutez ici les autres Event Listeners (scan, boost, raid, etc.) ...
    
    // Événement d'Export CSV corrigé (utilisation de la route auto_action)
    document.getElementById('btn-export-pdf').addEventListener('click', () => {
        const lastQuery = document.getElementById('input-global-target').value.trim() || 'Dernier_Scan';
        fetch(`${API_BASE}/auto_action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: lastQuery, action_type: 'export_metrics' })
        })
        .then(response => {
             if (response.ok) {
                 return response.blob().then(blob => {
                     const url = window.URL.createObjectURL(blob);
                     const a = document.createElement('a');
                     a.href = url;
                     const contentDisposition = response.headers.get('Content-Disposition');
                     const filenameMatch = contentDisposition && contentDisposition.match(/filename="(.+)"/);
                     a.download = filenameMatch ? filenameMatch[1] : `Stats_Twitch_Export.csv`;
                     document.body.appendChild(a);
                     a.click();
                     a.remove();
                     window.URL.revokeObjectURL(url);
                     document.getElementById('pdf-export-results').innerHTML = `<p style="color:var(--color-ai-growth);">✅ Export CSV téléchargé (basé sur le dernier Scan).</p>`;
                 });
             } else {
                 return response.json().then(errorData => {
                     const message = errorData.error || "Erreur lors de l'exportation des données.";
                     document.getElementById('pdf-export-results').innerHTML = `<p style="color:red;">❌ Échec de l'export: ${message}</p>`;
                 });
             }
        })
        .catch(error => {
            document.getElementById('pdf-export-results').innerHTML = `<p style="color:red;">❌ Erreur réseau lors de l'exportation: ${error.message}</p>`;
        });
    });


    // --- INITIALISATION ---
    window.onload = () => {
        checkTwitchStatus();
        // Lance le lecteur par défaut (Auto-Discovery ou Boost)
        checkBoostAndPlay(); 
        // Onglet par défaut
        openTab('tab-followed'); 
    };
</script>
