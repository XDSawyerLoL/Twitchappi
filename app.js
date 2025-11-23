// app.js

const ROOT = document.getElementById('app-root');
let state = {
  currentChannel: 'gotaga',
  boostLoading: false,
  boostMessage: '',
  scannerLoading: false,
  scannerResult: null,
  scannerMessage: "Appuyez sur SCANNER pour trouver un streamer validé."
};

let twitchPlayer = null;

// --- Icônes SVG ---
const IconZap = () => `<svg class="w-6 h-6" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;
const IconSearch = () => `<svg class="w-6 h-6" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;
const IconSend = () => `<svg class="w-6 h-6 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
const IconVideo = () => `<svg class="w-6 h-6 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"></path><line x1="12" y1="9" x2="12" y2="15"></line><line x1="9" y1="12" x2="15" y2="12"></line></svg>`;
const ExternalLinkIcon = () => `<svg class="w-5 h-5 ml-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;

// --- Rendu principal ---
function render() {
  ROOT.innerHTML = `
    <header class="text-center mb-8 md:mb-12">
      <h1 class="text-4xl md:text-6xl font-extrabold text-[#FF0099] mb-2" style="font-family: 'Orbitron'">STREAMER HUB V2.0</h1>
      <p class="text-[#22c7ef] text-lg">Lecteur Intégré, Boost Actif & Scanner IA</p>
    </header>

    <div class="grid grid-cols-1 xl:grid-cols-3 gap-8">
      <div class="xl:col-span-2 space-y-4">
        <h2 class="text-2xl font-bold text-[#22c7ef] flex items-center" style="font-family: 'Orbitron'">${IconVideo()} FLUX VIDÉO CYBER</h2>
        <div class="bg-gray-900 p-4 rounded-xl shadow-lg border border-gray-700/50">
          <form id="streamer-input-form" class="flex flex-col sm:flex-row gap-2">
            <input id="channel-input" class="flex-grow p-3 bg-gray-800 border border-[#22c7ef]/60 rounded text-white focus:outline-none focus:border-[#FF0099]" value="${state.currentChannel}" required placeholder="Nom de la chaîne Twitch" />
            <button type="submit" class="btn-secondary px-6 py-3 rounded font-bold flex items-center justify-center min-w-[120px]">${IconVideo()} LANCER</button>
          </form>
        </div>
        <div class="twitch-embed-container bg-gray-900 neon-border">
          <div id="twitch-embed"></div>
        </div>
      </div>

      <div class="xl:col-span-1 space-y-8">
        <div class="p-6 rounded-xl neon-border bg-[#1a1a1a]">
          <h2 class="text-2xl font-bold text-[#FF0099] mb-4 flex items-center" style="font-family: 'Orbitron'">${IconZap()} BOOST ACTIVATION</h2>
          <form id="boost-form" class="space-y-4">
            <input id="boost-input" class="w-full p-3 bg-gray-900 border border-[#FF0099]/60 rounded text-white focus:outline-none focus:border-[#22c7ef]" required placeholder="Ex: MonStreamer" />
            <button type="submit" class="w-full btn-primary py-3 rounded font-bold flex justify-center items-center">${state.boostLoading ? '⟳ Transmission...' : `${IconSend()} SOUMETTRE`}</button>
            ${state.boostMessage ? `<p class="text-center font-bold mt-2 ${state.boostMessage.startsWith('✅') ? 'text-green-400' : 'text-red-400'}">${state.boostMessage}</p>` : ''}
          </form>
        </div>

        <div class="p-6 rounded-xl neon-border bg-[#1a1a1a]">
          <h2 class="text-2xl font-bold text-[#22c7ef] mb-4 flex items-center" style="font-family: 'Orbitron'">${IconSearch()} SCANNER (IA)</h2>
          <p class="text-gray-400 mb-6">Trouvez une pépite parmi les streamers validés par le système IA.</p>
          ${state.scannerResult ? `
            <div class="mb-6 p-4 bg-gray-800 border border-[#FF0099] rounded">
              <h3 class="text-xl font-bold text-[#22c7ef]">${state.scannerResult.username}</h3>
              <p class="text-sm text-gray-300 truncate">${state.scannerResult.title || "Titre non disponible."}</p>
              <div class="flex justify-between mt-2 text-xs font-bold">
                <span class="text-[#FF0099]">${state.scannerResult.viewer_count || 0} Viewers</span>
                <span class="text-green-400">Score: ${state.scannerResult.avg_score?.toFixed(1) || 'N/A'}</span>
              </div>
              <div class="flex gap-2 mt-3">
                <a href="https://twitch.tv/${state.scannerResult.username}" target="_blank" class="flex-1 flex items-center justify-center text-center bg-[#22c7ef] text-black font-bold py-2 rounded hover:bg-white text-sm">OUVRIR EXT ${ExternalLinkIcon()}</a>
                <button id="scanner-watch-btn" data-channel="${state.scannerResult.username}" class="flex-1 flex items-center justify-center text-center bg-[#FF0099] text-white font-bold py-2 rounded hover:bg-white/90 hover:text-black text-sm">REGARDER ICI</button>
              </div>
            </div>
          ` : `<p class="text-center text-sm text-gray-500 my-4">${state.scannerMessage}</p>`}
          <button id="scanner-button" class="mt-auto w-full btn-secondary py-3 rounded font-bold">${state.scannerLoading ? '⟳ ANALYSE...' : "LANCER LE SCAN"}</button>
        </div>
      </div>
    </div>
  `;

  initTwitchPlayer();
  attachEventListeners();
}

// --- Twitch Player ---
function initTwitchPlayer() {
  if (!twitchPlayer) {
    twitchPlayer = new Twitch.Embed("twitch-embed", { 
      width: "100%", 
      height: "100%", 
      channel: state.currentChannel, 
      parent: [window.location.hostname] 
    });
  } else {
    twitchPlayer.setChannel(state.currentChannel);
  }
}

// --- Events ---
function attachEventListeners() {
  document.getElementById('streamer-input-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    state.currentChannel = document.getElementById('channel-input').value.trim().toLowerCase();
    initTwitchPlayer();
  });

  document.getElementById('boost-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const channelName = document.getElementById('boost-input').value.trim().toLowerCase();
    if (!channelName) return;
    state.boostLoading = true; render();
    try {
      const res = await fetch('/boost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelName, userId: crypto.randomUUID() })
      });
      const data = await res.json();
      state.boostMessage = data.message || '❌ Erreur';
    } catch (err) { 
      state.boostMessage = '❌ Erreur serveur'; 
    }
    state.boostLoading = false; render();
  });

  document.getElementById('scanner-button')?.addEventListener('click', async () => {
    state.scannerLoading = true; state.scannerMessage = "Recherche en cours..."; render();
    try {
      const res = await fetch('/random');
      const data = await res.json();
      state.scannerResult = data.streamer;
    } catch (err) {
      state.scannerMessage = "❌ Échec du Scanner";
    }
    state.scannerLoading = false; render();
  });

  document.getElementById('scanner-watch-btn')?.addEventListener('click', (e) => {
    const channel = e.currentTarget.dataset.channel;
    if (channel) { state.currentChannel = channel; initTwitchPlayer(); }
  });
}

// --- Start App ---
render();
