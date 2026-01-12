# StreamerHub — Dossier final (Front modulaire + Marché multi-user)

## Démarrage local
```bash
npm install
npm start
```
Puis ouvre: `http://localhost:10000`

## Structure
- `app.js` : API + Socket Hub + Twitch OAuth + Marché (portefeuille multi-user)
- `public/NicheOptimizer.html` : UI (1 seul fichier HTML)
- `public/assets/js/` : scripts externalisés (HTML allégé)
  - `main.js` : charge les scripts dans l’ordre
  - `core/app-bootstrap.js` : logique principale (player, follow, tabs, twitflix, etc.)
  - `modules/player/ambilight-vibe.js` : ambilight/vibe
  - `modules/market/market-overlay.js` : overlay marché + portefeuille
  - `modules/ui/*` : tabs exclusifs + tooltips (❓)

## Portefeuille "Marché du streamer" (multi-user)
### Identité utilisateur
- Si l’utilisateur est connecté Twitch : clé `twitch:<id>`
- Sinon : clé `sess:<sessionId>` (cookie de session)

### Persistance
- Si Firestore est disponible (Firebase) : stockage Firestore
- Sinon : fallback fichier (persistant) dans:
  - `data/streamer_market/users.json`
  - `data/streamer_market/market.json`

> Résultat: plus de perte de portefeuille au redémarrage, et isolation multi-user.

## Variables d’environnement (optionnel)
- `PORT` (défaut 10000)
- `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_REDIRECT_URI` (OAuth)
- `SESSION_SECRET`
- `CSP_ENABLED=true|false` (CSP Helmet)

## Notes CSP
- Par défaut CSP est désactivée (dev friendly).
- Active-la en prod: `CSP_ENABLED=true`.
