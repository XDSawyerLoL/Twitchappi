# StreamerHub — Package final (Firestore only)

Ce package garde le **visuel existant** et remet une structure propre :
- `public/` pour l'UI
- `public/assets/` pour les scripts
- Backend Express dans `app.js`

## Démarrage
```bash
npm install
npm start
```
Ouvre ensuite: `http://localhost:10000`

## Firestore (source unique de vérité)
Le **marché** et le **portefeuille** (Portefeuille Marché du Streamer) utilisent Firestore **uniquement**.
Si Firestore n'est pas correctement initialisé, les endpoints du marché renverront une erreur (503).

### Fournir les identifiants Firebase Admin
Deux options :
1) Variable d'environnement `FIREBASE_SERVICE_ACCOUNT_JSON` (JSON du service account, éventuellement échappé)
2) Fichier `serviceAccountKey.json` à la racine (non inclus dans le repo)

## Dossiers
- `public/NicheOptimizer.html` : page unique
- `public/assets/js/...` : modules UI
- `app.js` : API, sessions, sécurité, intégrations

## Endpoints portefeuille/marché
- `GET /api/fantasy/portfolio`
- `POST /api/fantasy/buy`
- `POST /api/fantasy/sell`
- `GET /api/fantasy/market?streamer=<login>`
- `GET /api/fantasy/leaderboard`

> Les routes gardent `/api/fantasy/*` pour compatibilité front, mais l'UI affiche le nom **Portefeuille Marché du Streamer**.

## ORYON TV — Endpoints Twitch (VOD)
- `GET /api/twitch/vods/top?limit=60` : sélection globale "Top VOD" (heuristique: top streams + top games, cache serveur)
- `GET /api/twitch/vods/random?min=20&max=200&lang=fr&limit=18` : VOD aléatoires chez les lives (20–200 viewers)
- `GET /api/twitch/vods/search?title=<q>&min=20&max=200&lang=fr&limit=18` : recherche VOD (titre) chez les lives (20–200 viewers)

