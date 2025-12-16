<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Streamer Hub V15 - Golden Hour Edition</title>
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
    <style>
        :root {
            --color-bg-dark: #0d0d0d; --color-bg-medium: #1a1a1a; --color-bg-light: #111;
            --color-primary-pink: #ff0099; --color-secondary-blue: #22c7ef;
            --color-ai-niche: #59d682; --color-ai-repurpose: #9933ff;
            --color-ai-growth: #ffcc00; --color-ai-action: #e34a64; 
            --color-text-dimmed: #9aa3a8; --color-border-dark: #2e2e2e;
            --shadow-pink: 0 0 15px rgba(255, 0, 153, 0.4);
        }
        body { background-color: var(--color-bg-dark); color: #fff; font-family: 'Inter', sans-serif; }
        #twitch-lucky-main { max-width: 1400px; margin: 20px auto; padding: 10px; }
        h1 { font-family: 'Orbitron', sans-serif; color: var(--color-primary-pink); text-align: center; text-shadow: var(--shadow-pink); }
        
        /* Navigation */
        .flex-tabs { display: flex; gap: 5px; margin-bottom: 15px; }
        .tab-btn { 
            font-family: 'Orbitron', sans-serif; padding: 12px; background: var(--color-bg-light); 
            border: 1px solid var(--color-border-dark); color: var(--color-text-dimmed); flex: 1; cursor: pointer; border-radius: 8px 8px 0 0;
        }
        .tab-btn.active { background: var(--color-bg-medium); color: #fff; border-top: 3px solid var(--color-primary-pink); box-shadow: var(--shadow-pink); }
        
        /* Contenu */
        .tab-content { display: none; background: var(--color-bg-medium); border-radius: 10px; padding: 20px; border: 1px solid var(--color-border-dark); }
        .tab-content.active { display: block; }

        /* Notification Pop-up */
        #notification-container { position: fixed; top: 20px; right: 20px; z-index: 10000; }
        .toast { 
            background: #222; border-left: 4px solid var(--color-primary-pink); padding: 15px 20px; 
            margin-bottom: 10px; border-radius: 4px; box-shadow: 0 5px 15px rgba(0,0,0,0.5);
            display: flex; justify-content: space-between; align-items: center; min-width: 250px;
            animation: slideIn 0.3s ease-out;
        }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }

        .btn-primary { background: var(--color-primary-pink); padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; }
    </style>
</head>
<body>

<div id="notification-container"></div>

<div id="twitch-lucky-main">
    <h1>STREAMER HUB <span style="color:var(--color-secondary-blue)">V15</span></h1>
    
    <div class="flex-tabs">
        <button class="tab-btn active" onclick="openTab('tab-dashboard')">📊 DASHBOARD</button>
        <button class="tab-btn" onclick="openTab('tab-golden')" style="border-top-color: var(--color-ai-growth);">✨ HEURE D'OR</button>
        <button class="tab-btn" onclick="openTab('tab-raid')">💥 RAID</button>
    </div>

    <div id="tab-dashboard" class="tab-content active">
        <h2 class="text-xl mb-4">Analyse de Niche</h2>
        <input id="input-target" type="text" placeholder="Nom de la chaîne ou catégorie..." class="w-full p-3 bg-black border border-gray-700 rounded mb-4">
        <button onclick="runAnalysis()" class="btn-primary">LANCER L'IA</button>
        <div id="res-ai" class="mt-4 p-4 border border-gray-800 rounded min-height-[100px]"></div>
    </div>

    <div id="tab-golden" class="tab-content">
        <div class="text-center">
            <h2 style="color:var(--color-ai-growth); font-family: 'Orbitron';">✨ CALCULATEUR D'HEURE D'OR</h2>
            <p class="text-gray-400 my-4">Trouvez le moment où vos concurrents dorment mais où l'audience est réveillée.</p>
            <button onclick="getGoldenHour()" class="btn-primary" style="background:var(--color-ai-growth); color:black;">DÉTERMINER MON CRÉNEAU</button>
        </div>
        <div id="res-golden" class="mt-6 p-6 bg-black rounded-lg border-t-2 border-yellow-500"></div>
    </div>
</div>

<script>
    const API_BASE = ""; // Laisser vide si même domaine

    function openTab(id) {
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(id).classList.add('active');
        event.currentTarget.classList.add('active');
    }

    // GESTION DU POP-UP (FERMETURE AUTO)
    function showPopup(msg, type="info") {
        const container = document.getElementById('notification-container');
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `<span>${msg}</span><button onclick="this.parentElement.remove()" class="ml-4 opacity-50">✕</button>`;
        container.appendChild(toast);
        
        // Fermeture automatique après 4 secondes
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 500);
        }, 4000);
    }

    async function getGoldenHour() {
        const resBox = document.getElementById('res-golden');
        resBox.innerHTML = "Analyse des flux Twitch en cours...";
        showPopup("Calcul de l'heure d'or lancé...");

        try {
            const response = await fetch('/auto_action', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    action_type: 'golden_hour',
                    data_context: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }
                })
            });
            const data = await response.json();
            resBox.innerHTML = data.html_response;
            showPopup("Analyse terminée !", "success");
        } catch(e) {
            resBox.innerHTML = "Erreur de connexion au serveur.";
        }
    }

    async function runAnalysis() {
        const target = document.getElementById('input-target').value;
        if(!target) return showPopup("Veuillez entrer une cible !");
        showPopup("Analyse IA en cours...");
        // Logique habituelle ici...
    }
</script>
</body>
</html>
