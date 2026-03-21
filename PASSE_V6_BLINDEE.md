# Passe v6 blindée

## Corrections intégrées

### 1. Billing et droits admin
- Fusion plus robuste des documents `billing_users` entre `id Twitch`, `login` et `display_name`.
- Réécriture centralisée sur le document principal résolu.
- `sansahd` et les comptes admin ne consomment plus de crédits sur les actions protégées.
- Les réponses `billing` et `market/access` renvoient désormais un plan effectif cohérent (`admin`, `premium`, `pro`, `free`).
- Les droits admin sont réinjectés côté serveur même si un ancien document Firestore était incomplet.

### 2. Déverrouillage Marché / Features
- Les routes `unlock-market` et `unlock-feature` utilisent maintenant un document billing préfusionné.
- Réduction du risque de cas « payé mais non débloqué ».

### 3. Durcissement du projet
- Ajout des scripts :
  - `npm run verify:js`
  - `npm run audit:prod`
  - `npm run prune:prod`
- Ajout d'`overrides` npm supplémentaires pour mieux contraindre certaines dépendances transitives.
- Ajout d'un `.npmrc` minimal pour réduire le bruit d'installation.

## Vérifications effectuées
- Syntaxe JS validée sur :
  - `app.js`
  - `electron-main.js`
  - `preload.js`
  - `assets/js/core/app-bootstrap.js`
  - `assets/js/modules/market/market-overlay.js`

## Commandes utiles
```bash
npm install
npm run verify:js
npm run audit:prod
npm start
```

## Point honnête
Le total exact des vulnérabilités npm dépendra encore de la résolution réelle faite sur ta machine au moment de `npm install`. Cette passe durcit le projet et corrige les points logiques majeurs, mais le résultat final de `npm audit` dépend des paquets effectivement téléchargés.
