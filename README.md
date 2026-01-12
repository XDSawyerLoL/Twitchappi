# StreamerHub – Package clean (prod-ready)

Ce package contient **une seule page HTML** (`NicheOptimizer.html`) mais avec un code **découpé en fichiers JS lisibles** (core + modules).
Objectif : éviter l'écran blanc, faciliter la maintenance, et permettre une CSP plus stricte.

## Structure

- `app.js` : serveur Express (API + UI)
- `public/NicheOptimizer.html` : UI (page unique)
- `public/assets/js/core/app-bootstrap.js` : bootstrap global (API_BASE, init, sockets, TwitFlix core…)
- `public/assets/js/modules/player/ambilight-vibe.js` : ambilight + vibe + tools player
- `public/assets/js/modules/layout/sidepanel-dock-fix.js` : correctifs layout (dock side-panel)
- `public/assets/js/modules/market/market-overlay.js` : overlay Marché / stats
- `public/assets/js/modules/ui/sidepanel-tabs.js` : onglets CHAT/STATS/OUTILS (viewport)
- `public/assets/js/modules/ui/help-tooltips.js` : icônes ❓ + aides/coach

## Installation

```bash
npm install
npm start
```

Par défaut : `http://localhost:10000`

## Variables d'environnement (essentielles)

- `SESSION_SECRET` (obligatoire en prod)
- `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_REDIRECT_URI`
- `GEMINI_API_KEY` (optionnel)
- `FIREBASE_SERVICE_KEY` (optionnel)
- `CSP_ENABLED=true|false` (par défaut false)

## Dépannage “écran blanc”

1. Ouvre la console (F12) et vérifie qu'il n'y a pas de 404 sur :
   - `/assets/js/core/app-bootstrap.js`
   - `/assets/js/modules/.../*.js`

2. Vérifie que l'UI est bien servie depuis **/public** :
   - `/` ou `/NicheOptimizer.html` doit répondre.

3. Si `CSP_ENABLED=true` :
   - assure-toi que la CSP autorise les CDN nécessaires (Tailwind CDN, Chart.js, Socket.io, FontAwesome).

## Déploiement

- Render / Railway / VPS : `npm install` puis `npm start`
- Le serveur sert les fichiers statiques via `public/`.

