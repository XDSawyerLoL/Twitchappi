# ORYON / StreamerHub — Socle A (stabilité + sécurité)

## Ce qui a été ajouté
- `/api/auth/status` : état d'auth (évite de spammer billing/fantasy quand non connecté)
- `requireTwitchSession` : 401 stable + `Retry-After: 5`
- Front: wrapper `oryonFetchJson()` avec backoff automatique sur 401
- Correctif mineur de réponse `/api/fantasy/profile` (return + format)
- Cache-bust automatique du script `app-bootstrap.js?v=1770480537`

## Recommandations Render
- `NODE_ENV=production`
- `SESSION_SECRET` fort et unique
- (Déjà présent) `app.set('trust proxy', 1)` pour cookies secure derrière proxy.

## Vérification
1. Ouvre la console réseau: quand pas loggé, `/api/billing/me` doit être 401, mais ne doit pas se répéter en boucle.
2. Après OAuth Twitch, `/api/billing/me` et `/api/fantasy/profile` doivent passer en 200.
