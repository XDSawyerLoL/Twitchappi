# StreamerHub — Prescriptive + SaaS (Firestore-only)

Cette version ajoute **le mode prescriptif** (recommandations automatiques, alertes, benchmark entre pairs) **sans casser le visuel**.
Le **Marché du Streamer** (portefeuille) est **100% Firestore** (source unique de vérité) et multi-user via session.

## 1) Installation
```bash
npm install
npm start
```
Ouvre: `http://localhost:10000`

## 2) Variables d'environnement (minimum)
- `TWITCH_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`
- `TWITCH_REDIRECT_URI`
- `FIREBASE_SERVICE_KEY` (JSON service account, stringifié) **ou** un `serviceAccountKey.json` à la racine.
- (optionnel) `ADMIN_KEY` pour activer PRO manuellement

## 3) Marché du Streamer (API)
Routes compatibles (ancien nom) :
- `GET  /api/fantasy/profile`
- `POST /api/fantasy/invest` `{ amount, streamer }`
- `POST /api/fantasy/sell` `{ amount, streamer }`
- `GET  /api/fantasy/market?streamer=login`
- `GET  /api/fantasy/leaderboard`

Routes canoniques :
- `GET  /api/streamer-market/profile`
- `POST /api/streamer-market/invest`
- `POST /api/streamer-market/sell`
- `GET  /api/streamer-market/market`
- `GET  /api/streamer-market/leaderboard`

## 4) Mode PRO (prescriptif)
### Lire le plan
- `GET /api/billing/plan` -> `{ plan: FREE|PRO }`

### Activer PRO (temporaire, mode admin)
- `POST /api/billing/activate_pro` `{ adminKey: "...", userKey?: "twitch:123" }`
> Si `userKey` est absent, ça active PRO pour **l'utilisateur courant**.

### Recommandations (PRO)
- `GET /api/recommendations?game_name=Valorant&days=7`
Renvoie les meilleures fenêtres (données historiques Firestore `games/{gameId}/hourly_stats`).

### Alertes (PRO)
- `GET  /api/alerts`
- `POST /api/alerts` `{ enabled, game_name, minScore }`
- `GET  /api/alerts/check` (déclenche si opportunité dans les 6 prochaines heures)

### Benchmark (PRO)
- `GET /api/benchmark/me?days=14`
⚠️ nécessite connexion Twitch (pour avoir `twitchUser.id`).

## 5) UI
Le script `public/assets/js/modules/prescriptive/prescriptive-ui.js` ajoute une section dans le modal du portefeuille :
- boutons Recommandations / Benchmark / Alertes
- affichage du plan (FREE/PRO)
- sans modifier la mise en page existante
