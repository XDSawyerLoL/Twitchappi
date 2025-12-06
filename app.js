<script src="https://embed.twitch.tv/embed/v1.js"></script>
<script>
    const API_BASE = window.location.origin;
    const DEFAULT_CHANNEL = 'twitch'; 
    let embed = null;

    // --- 1. FONCTIONS DE GESTION DES ONGLET ET DU VOD ---

    function openTab(tabId) {
        localStorage.setItem('activeTab', tabId);
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
        const targetTab = document.getElementById(tabId);
        if (targetTab) {
            targetTab.classList.add('active');
            const targetBtn = document.querySelector(`.tab-btn[data-tab-id="${tabId}"]`);
            if (targetBtn) targetBtn.classList.add('active');
        }
    }

    function analyzeGameNiche(gameName) {
        document.getElementById('input-niche-game').value = gameName;
        openTab('tab-niche');
        document.getElementById('btn-niche-analyse').click();
    }

    function updatePlayerStatus(channel, status) {
        const statusEl = document.getElementById('player-channel-status');
        const iconEl = document.getElementById('player-icon');
        
        if (status === 'LIVE') {
            statusEl.innerHTML = `🔴 ${channel.toUpperCase()} (LIVE)`;
            statusEl.style.color = '#ff0000';
            iconEl.innerHTML = '🔥';
        } else if (status === 'VOD') {
            statusEl.innerHTML = `${channel.toUpperCase()} (VOD)`;
            statusEl.style.color = '#9933ff';
            iconEl.innerHTML = '📼';
        } else {
            statusEl.innerHTML = `${channel.toUpperCase()} (Hors ligne)`;
            statusEl.style.color = 'var(--color-text-dimmed)';
            iconEl.innerHTML = '🎬';
        }
    }
    
    function generateShareButtons(channel, url) {
        const shareContainer = document.getElementById('twitch-player-share');
        if (!shareContainer) return;

        const shareUrl = url || `https://twitch.tv/${channel}`;
        const encodedUrl = encodeURIComponent(shareUrl);
        const encodedText = encodeURIComponent(`Découvrez le stream/VOD de ${channel} avec Streamer AI Hub !`);

        const twitterLink = `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`;
        const facebookLink = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
        const redditLink = `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedText}`;

        shareContainer.innerHTML = `
            <div class="flex space-x-2 mt-2 items-center text-sm">
                <span class="text-xs text-gray-400">Partager :</span>
                <button onclick="window.open('${twitterLink}', '_blank')" class="p-1 rounded bg-[#1DA1F2] hover:bg-[#1A91DA] text-white transition duration-200" title="Partager sur X (Twitter)">X</button>
                <button onclick="window.open('${facebookLink}', '_blank')" class="p-1 rounded bg-blue-800 hover:bg-blue-900 text-white transition duration-200" title="Partager sur Facebook">F</button>
                <button onclick="window.open('${redditLink}', '_blank')" class="p-1 rounded bg-[#FF4500] hover:bg-[#E53C00] text-white transition duration-200" title="Partager sur Reddit">R</button>
                <button onclick="navigator.clipboard.writeText('${shareUrl}'); alert('Lien copié !')" class="p-1 rounded bg-gray-500 hover:bg-gray-600 text-white transition duration-200" title="Copier le lien">🔗</button>
            </div>
        `;
    }

    function initializePlayer(channel = DEFAULT_CHANNEL, videoId = null, time = 0) {
        const embedContainer = document.getElementById('twitch-embed');
        if (embedContainer) {
             embedContainer.innerHTML = ''; 
        }

        const options = {
            width: "100%",
            height: "100%",
            channel: channel,
            allowfullscreen: true,
            layout: "video-and-chat",
            // IMPORTANT : L'élément 'parent' doit correspondre à votre nom de domaine
            parent: [window.location.hostname] 
        };

        let status = 'LIVE';
        let shareUrl = `https://twitch.tv/${channel}`;

        if (videoId) {
            options.video = videoId;
            options.channel = undefined; 
            status = 'VOD';
            shareUrl = `https://www.twitch.tv/videos/${videoId}`;
            if (time > 0) {
                 options.time = `${time}s`; 
            }
        }
        
        embed = new Twitch.Embed("twitch-embed", options);
        localStorage.setItem('activeChannel', channel);
        document.getElementById('input-channel').value = channel;
        updatePlayerStatus(channel, status);
        generateShareButtons(channel, shareUrl);

        if (videoId && time > 0) {
            embed.addEventListener(Twitch.Embed.VIDEO_READY, () => {
                setTimeout(() => {
                    embed.seek(time);
                }, 100); 
            });
        }
    }

    window.seekVod = function(videoId, seconds) {
        const channel = localStorage.getItem('activeChannel') || DEFAULT_CHANNEL;
        initializePlayer(channel, videoId, seconds);
        document.getElementById('form-channel-player').scrollIntoView({ behavior: 'smooth' });
    }

    // --- 2. LOGIQUE D'AUTHENTIFICATION TWITCH (MON FIL SUIVI) ---

    function handleLogin() {
        window.location.href = `${API_BASE}/twitch_auth_start`;
    }

    async function handleLogout() {
        await fetch(`${API_BASE}/twitch_logout`, { method: 'POST' });
        checkAuth(); 
    }

    // ✅ CORRIGÉE: Intègre le correctif des URL de miniatures
    async function fetchFollowedStreams() {
        const streamsList = document.getElementById('followed-streams-list');
        streamsList.innerHTML = '<p style="text-align:center; color:#555; padding:10px;">Chargement des streams LIVE...</p>';

        try {
            const res = await fetch(`${API_BASE}/followed_streams`);
            
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || `Erreur serveur lors de la récupération du fil: Statut ${res.status}`);
            }
            const data = await res.json();
            
            if (!data.success) {
                 throw new Error(data.error || "Échec de l'API serveur.");
            }

            if (data.streams.length === 0) {
                streamsList.innerHTML = '<p style="text-align:center; color:var(--color-text-dimmed); padding:10px;">Aucune chaîne suivie n\'est actuellement en direct.</p>';
                return;
            }

            streamsList.innerHTML = ''; 
            data.streams.forEach(stream => {
                const item = document.createElement('div');
                item.className = 'followed-stream-item';
                item.onclick = () => initializePlayer(stream.user_login); 
                
                // 🛠️ FIX DE MINIATURES : Remplace {width} et {height}
                const thumbnailUrl = stream.thumbnail_url
                    .replace('{width}', '320')
                    .replace('{height}', '180'); 

                item.innerHTML = `
                    <img src="${thumbnailUrl}" alt="${stream.user_name}" class="streamer-thumbnail">
                    <strong style="color:var(--color-primary-pink); font-size: 13px; margin-top: 5px;">${stream.user_name}</strong>
                    <div class="stream-meta">
                        <span>${stream.game_name}</span>
                        <span style="color:#ff0000;">${stream.viewer_count.toLocaleString()} vues</span>
                    </div>
                    <p class="stream-title">${stream.title.substring(0, 50)}...</p>
                `;
                streamsList.appendChild(item);
            });

        } catch (error) {
            streamsList.innerHTML = `<p style="color:red; text-align:center; padding:10px;">❌ Erreur de chargement du fil: ${error.message}</p>`;
        }
    }

    async function checkAuth() {
        const loginStatus = document.getElementById('login-status');
        const loginButton = document.getElementById('btn-twitch-login');
        loginStatus.textContent = 'Statut: Vérification...';
        loginButton.disabled = true;

        try {
            const res = await fetch(`${API_BASE}/twitch_user_status`);
            const data = await res.json();
            
            if (data.is_connected) {
                loginStatus.innerHTML = `✅ Connecté en tant que <strong>${data.display_name}</strong>.`;
                loginButton.textContent = 'Déconnexion';
                loginButton.style.backgroundColor = '#888';
                loginButton.onclick = handleLogout;
                
                await fetchFollowedStreams(); 
            } else {
                loginStatus.textContent = '❌ Déconnecté. Connectez-vous pour voir vos streams suivis.';
                loginButton.textContent = '🔒 SE CONNECTER VIA TWITCH';
                loginButton.style.backgroundColor = '#6441a5';
                loginButton.onclick = handleLogin;
                document.getElementById('followed-streams-list').innerHTML = '<p style="color:var(--color-text-dimmed); text-align:center; padding:10px;">Veuillez vous connecter pour voir votre fil suivi.</p>';
            }
        } catch (error) {
            loginStatus.textContent = `⚠️ Erreur de connexion au serveur d'authentification.`;
            loginButton.disabled = false;
        }
        loginButton.disabled = false;
    }


    // --- 3. GESTIONNAIRES D'ÉVÉNEMENTS ---

    document.getElementById('form-channel-player').addEventListener('submit', function(e) {
        e.preventDefault();
        const channelName = document.getElementById('input-channel').value.trim();
        if (channelName) {
            initializePlayer(channelName);
        }
    });

    function toggleAssistant() {
        const panel = document.getElementById('assistant-panel');
        panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex';
    }
    document.getElementById('assistant-toggle').onclick = toggleAssistant;

    // CORRIGÉE: Mini Assistant Logic avec gestion d'erreur améliorée
    const assistantForm = document.getElementById('assistant-form');
    const assistantMsgs = document.getElementById('assistant-messages');
    const input = document.getElementById('assistant-input');

    assistantForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const q = input.value.trim();
        const currentChannel = localStorage.getItem('activeChannel') || 'Twitch'; 
        
        if (!q) return;
        assistantMsgs.innerHTML += `<div class=\"msg user\">${q}</div>`;
        input.value = '';
        assistantMsgs.scrollTop = assistantMsgs.scrollHeight;
        const loaderId = 'loader-' + Date.now();
        assistantMsgs.innerHTML += `<div id=\"${loaderId}\" class=\"msg bot\">...</div>`;
        
        try {
            const res = await fetch(`${API_BASE}/mini_assistant`, { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify({ q, context: currentChannel }) 
            });
            
            if (!res.ok) {
                const errorData = await res.json();
                // Affiche l'erreur renvoyée par le serveur (500, 503, etc.)
                throw new Error(errorData.error || `Erreur serveur (Statut: ${res.status}).`);
            }

            const data = await res.json();
            document.getElementById(loaderId).remove();
            assistantMsgs.innerHTML += `<div class=\"msg bot\">${data.answer || "Désolé, problème IA ou réponse bloquée."}</div>`;
        } catch(err) { 
            document.getElementById(loaderId).remove();
            // Affiche l'erreur réelle
            assistantMsgs.innerHTML += `<div class=\"msg bot\" style=\"color:red;\">❌ Erreur IA: ${err.message || "Problème de connexion serveur."}</div>`;
        }
        assistantMsgs.scrollTop = assistantMsgs.scrollHeight;
    });


    // --- 4. Initialisation au chargement de la page ---
    document.addEventListener('DOMContentLoaded', function() {
        const lastChannel = localStorage.getItem('activeChannel') || DEFAULT_CHANNEL;
        initializePlayer(lastChannel); 

        const savedTab = localStorage.getItem('activeTab') || 'tab-followed';
        openTab(savedTab);
        
        checkAuth();
    });
</script>
