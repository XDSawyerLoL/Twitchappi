# Correctifs sécurité / monétisation

## Corrigé
- webhook Stripe serveur ajouté: `POST /api/stripe/webhook`
- traitement idempotent des événements Stripe via `stripe_events`
- crédit des packs et activation du plan Premium depuis les métadonnées Stripe
- suivi Firestore des références Stripe (`customerId`, `subscriptionId`, `sessionId`)
- `SESSION_SECRET` de développement interdit en production
- CORS resserré: plus d'ouverture totale par défaut en production
- `/api/health` enrichi avec l'état des dépendances critiques
- documentation réalignée avec l'arborescence réelle
- `IA/env.example` corrigé
- module IA: CORS piloté par `CORS_ORIGINS`
- scripts de maintenance renforcés (`audit:fix:prod`, `dedupe`, `verify`, `clean:dead`)

## À configurer côté déploiement
- créer le webhook Stripe vers `/api/stripe/webhook`
- renseigner `STRIPE_WEBHOOK_SECRET`
- renseigner un vrai `SESSION_SECRET`
- définir `CORS_ORIGINS`
- fournir les secrets Twitch / Firebase / Stripe / IA nécessaires

## Limites honnêtes
- la baisse exacte du nombre de vulnérabilités npm dépend du `npm install` et de `npm audit` sur la machine cible
- les abonnements Stripe récurrents dépendent des Price IDs et du webhook réellement branché dans Stripe
