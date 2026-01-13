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
1) Variable d'environnement `FIREBASE_SERVICE_KEY` (JSON du service account, éventuellement échappé)
2) Fichier `serviceAccountKey.json` à la racine (non inclus dans le repo)

## Dossiers
- `public/NicheOptimizer.html` : page unique
- `public/assets/js/...` : modules UI
- `app.js` : API, sessions, sécurité, intégrations

## Pricing (crédits + Premium)
- Page: `GET /pricing`
- API (mock, prêt à brancher Stripe plus tard) :
  - `GET /api/credits/status` (plan + crédits + actions)
  - `GET /api/credits/packs` (packs de crédits)
  - `POST /api/credits/buy-pack` (demo: ajoute des crédits)
  - `POST /api/credits/spend` (optionnel: consommer des crédits)
  - `POST /api/billing/subscribe_pro` (demo: passe en PRO)

> Par défaut, les endpoints "paiement" sont en **mode démo** (aucun vrai paiement).
> Tu peux désactiver le mode démo avec `CREDITS_DEMO=false` et `BILLING_DEMO=false`.

## Endpoints portefeuille/marché
- `GET /api/fantasy/portfolio`
- `POST /api/fantasy/invest`
- `POST /api/fantasy/sell`
- `GET /api/fantasy/market?streamer=<login>`
- `GET /api/fantasy/leaderboard`

> Les routes gardent `/api/fantasy/*` pour compatibilité front, mais l'UI affiche le nom **Portefeuille Marché du Streamer**.
