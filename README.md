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

## Pricing / Credits / Premium (Option A)
- UI: `public/pricing.html`
- Assets: `public/assets/css/pricing.css`, `public/assets/js/billing-hud.js`
- Route: `GET /pricing`
- Billing API: `GET /api/billing/status`, `POST /api/billing/spend`, `POST /api/billing/create-checkout-session`

### Free credits
- 1200 credits are granted automatically on first Twitch login (Firestore).

### Stripe (optional)
Set env vars:
- STRIPE_SECRET_KEY
- STRIPE_PRICE_CREDITS_500
- STRIPE_PRICE_CREDITS_1250
- STRIPE_PRICE_PREMIUM

Enable demo grant (dev only):
- BILLING_DEMO=true

## Billing (credits + Premium) — Option A (/public/assets)

### Règles
- Free: **1200 crédits offerts** à la première connexion Twitch.
- 1 action = **20 crédits**.
- Premium/Pro: actions illimitées.

### Endpoints
- `GET /api/billing/status` → `{ plan, credits, actions }`
- `GET /api/billing/packs`
- `POST /api/billing/spend` → débite 20 crédits
- `POST /api/billing/create-checkout-session` (Stripe optionnel)

### Variables d'env (Stripe optionnel)
- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_CREDITS_500`
- `STRIPE_PRICE_CREDITS_1250`
- `STRIPE_PRICE_PREMIUM`

### UI
- HUD crédits injecté à côté du login: `public/assets/js/billing-hud.js`
- Pricing: `GET /pricing` (sert `public/pricing.html`) + `public/assets/css/pricing.css`
