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

// Icônes SVG
const IconZap = () => `<svg class="w-6 h-6" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;
const IconSearch = () => `<svg class="w-6 h-6" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;
const IconSend = () => `<svg class="w-6 h-6 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
const IconVideo = () => `<svg class="w-6 h-6 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"></path><line x1="12" y1="9" x2="12" y2="15"></line><line x1="9" y1="12" x2="15" y2="12"></line></svg>`;
const ExternalLinkIcon = () => `<svg class="w-5 h-5 ml-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;

// --- Rendu principal ---
function render() {
  ROOT.innerHTML = `...`; // ton HTML existant ici

  initTwitchPlayer();

  // Formulaire lancement chaîne
  document.getElementById('streamer-input-form')?.addEventListener('submit', (e)=>{
    e.preventDefault();
    state.currentChannel = document.getElementById('channel-input').value.trim().toLowerCase();
    initTwitchPlayer();
  });

  // Formulaire boost
  document.getElementById('boost-form')?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const channelName = document.getElementById('boost-input').value.trim().toLowerCase();
    if(!channelName) return;
    state.boostLoading = true; render();
    try {
      const res = await fetch('https://twitchappi-goodstream1.onrender.com/boost', {
        method:'POST', 
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ channelName, userId: crypto.randomUUID() })
      });
      const data = await res.json();
      state.boostMessage = data.message || '❌ Erreur';
    } catch(e){ state.boostMessage = '❌ Erreur serveur'; }
    state.boostLoading = false; render();
  });

  // Scanner IA
  document.getElementById('scanner-button')?.addEventListener('click', async ()=>{
    state.scannerLoading = true; state.scannerMessage="Recherche en cours..."; render();
    try{
      const res = await fetch('https://twitchappi-goodstream1.onrender.com/random'); 
      const data = await res.json(); 
      state.scannerResult = data.streamer;
    }catch(e){ state.scannerMessage="❌ Échec du Scanner"; }
    state.scannerLoading=false; render();
  });

  // Regarder le streamer scanné
  document.getElementById('scanner-watch-btn')?.addEventListener('click', (e)=>{
    const channel = e.currentTarget.dataset.channel;
    if(channel){ state.currentChannel=channel; initTwitchPlayer(); }
  });
}

// --- Init Twitch Player ---
function initTwitchPlayer(){
  if(!twitchPlayer){
    twitchPlayer = new Twitch.Embed("twitch-embed", { width:"100%", height:"100%", channel:state.currentChannel, parent:[window.location.hostname] });
  } else {
    twitchPlayer.setChannel(state.currentChannel);
  }
}

// --- Start ---
render();

