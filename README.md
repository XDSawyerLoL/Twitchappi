# StreamerHub / NicheOptimizer — Modular “Prod Clean”

Cette version garde **un seul fichier HTML** (`NicheOptimizer.html`) en façade, mais **tout le JavaScript inline a été sorti** dans des fichiers clairement nommés, rangés par modules.

## ✅ Objectifs atteints
- HTML unique, lisible et stable
- JS découpé en modules **par responsabilité**
- Prêt pour une CSP plus stricte (plus besoin de `unsafe-inline` en `script-src` quand `CSP_ENABLED=true`)
- Structure projet “vente / prod” (facile à auditer et à maintenir)

---

## Arborescence
```
.
├─ app.js
├─ package.json
├─ NicheOptimizer.html
└─ assets/
   └─ js/
      ├─ core/
      │  └─ app-bootstrap.js
      └─ modules/
         ├─ layout/
         │  └─ sidepanel-dom-fix.js
         ├─ market/
         │  └─ market-overlay.js
         ├─ player/
         │  └─ player-tools.js
         └─ ui/
            ├─ help-tooltips.js
            └─ sidepanel-tabs.js
```

### À quoi sert chaque fichier
- `core/app-bootstrap.js`  
  Base globale : constantes, helpers, appels API, init général, logique centrale (dont TwitFlix / hub / outils selon la version).

- `modules/player/player-tools.js`  
  Outils au-dessus du player : ambilight/vibe, mosaic/squad, interactions UX liées au player.

- `modules/layout/sidepanel-dom-fix.js`  
  Correctif DOM “hard fix” : garantit la structure du layout (side-panel bien attaché à `#main-layout`).

- `modules/market/market-overlay.js`  
  Module Marché : overlay Binance-like, watchlist, tabs/metrics, intégrations API.

- `modules/ui/sidepanel-tabs.js`  
  Gestion des onglets à droite (CHAT / STATS / OUTILS) + sync hauteur player ↔ side-panel.

- `modules/ui/help-tooltips.js`  
  Système ❓ : tooltips automatiques sur titres d’onglets / modules.

---

## Lancer en local
```bash
npm install
npm start
```
Par défaut, le serveur écoute sur `PORT` (sinon 10000).

---

## Variables d’environnement (principales)
### Serveur / sécurité
- `PORT` : port (défaut 10000)
- `NODE_ENV` : `production` active cookies `Secure` et `SameSite=None`
- `SESSION_SECRET` : **obligatoire en prod**
- `CORS_ORIGINS` : liste séparée par virgules (ex: `https://justplayer.fr,https://www.justplayer.fr`)
- `CSP_ENABLED` : `true|false` (défaut `false`)

### Twitch
- `TWITCH_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`
- `TWITCH_REDIRECT_URI`

### IA (Gemini)
- `GEMINI_API_KEY`

### Firestore
- `FIREBASE_SERVICE_KEY` (JSON string) **ou** `serviceAccountKey.json` (si présent)

---

## CSP (production)
Quand `CSP_ENABLED=true`, `script-src` n’autorise plus `unsafe-inline`.  
**Important :** `style-src` garde `unsafe-inline` car l’UI contient encore beaucoup de CSS inline (optimisable plus tard en sortant le CSS).

---

## Déploiement
- Render / Railway / VPS : ok
- Mettre `NODE_ENV=production`, `SESSION_SECRET`, `CORS_ORIGINS`, `CSP_ENABLED=true`
- Vérifier que `TWITCH_REDIRECT_URI` correspond bien au domaine de prod

---

## Notes
Si tu veux aller encore plus loin :
- sortir le CSS inline dans `/assets/css/app.css`
- passer en vrais ES Modules (`type="module"` + `import/export`) et bundler optionnel (Vite/Rollup) tout en gardant 1 HTML.
