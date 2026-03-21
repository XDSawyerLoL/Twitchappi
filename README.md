# StreamerHub Pro

Base validée: **v6**. Cette version garde le rendu actuel et ajoute des correctifs de sécurité et de monétisation sans casser les flux existants.

## Structure réelle
- `NicheOptimizer.html` : interface principale
- `assets/` : scripts, styles, images
- `app.js` : serveur Express principal
- `pricing.html` : page de monétisation
- `electron-main.js` / `preload.js` : emballage Windows / Electron
- `IA/` : module IA séparé
- `scripts/` : scripts de vérification et nettoyage

## Démarrage local
```bash
npm install
npm start
```
Puis ouvrir `http://localhost:10000`.

## Variables d'environnement principales
Créer un fichier `.env` à la racine.

### Sécurité
- `NODE_ENV=production`
- `SESSION_SECRET=` secret long et unique, obligatoire en production
- `CORS_ORIGINS=` liste d'origines autorisées séparées par des virgules

### Twitch
- `TWITCH_CLIENT_ID=`
- `TWITCH_CLIENT_SECRET=`
- `TWITCH_REDIRECT_URI=`
- `ADMIN_TWITCH_LOGINS=sansahd`
- `ADMIN_TWITCH_IDS=` optionnel

### Firebase / Firestore
- `FIREBASE_SERVICE_KEY=` JSON complet du compte de service

### Stripe
- `STRIPE_SECRET_KEY=`
- `STRIPE_WEBHOOK_SECRET=`
- `STRIPE_PRICE_CREDITS_500=`
- `STRIPE_PRICE_CREDITS_1250=`
- `STRIPE_PRICE_PREMIUM_MONTHLY=`
- `BILLING_SUCCESS_URL=`
- `BILLING_CANCEL_URL=`

### Services optionnels
- `GEMINI_API_KEY=` ou `GOOGLE_API_KEY=`
- `YOUTUBE_API_KEY=`
- `STEAM_API_KEY=`

## Stripe
L'application crée une session Checkout et expose maintenant un webhook serveur :
- `POST /api/stripe/webhook`

### Événements gérés
- `checkout.session.completed`
- `invoice.paid`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Le webhook met à jour Firestore de manière idempotente via la collection `stripe_events` et crédite / active l'abonnement à partir des métadonnées Stripe.

## Vérifications utiles
```bash
npm run verify:js
npm run verify:all
npm run audit:prod
npm run clean:dead
```

## Remarques
- en production, `SESSION_SECRET` vide ou égal à `dev_secret_change_me` bloque désormais le démarrage
- si `CORS_ORIGINS` n'est pas défini, le serveur ne reste permissif qu'en développement local
- `/api/health` expose l'état des dépendances critiques pour faciliter le diagnostic
