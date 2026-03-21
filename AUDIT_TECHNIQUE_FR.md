# Audit technique — StreamerHub / Twitchappi-master

## Problème principal corrigé

### Symptôme
L'utilisateur paie en crédits le **Pass Marché / Bourse des streamers**, mais l'accès reste bloqué ou redirige encore vers `/pricing`.

### Cause racine
Le projet utilisait **plusieurs identifiants Firestore** pour le même utilisateur :
- parfois `twitchUser.id`
- parfois `twitchUser.login`
- parfois `display_name`

Résultat :
- les crédits pouvaient être écrits dans un document,
- les entitlements (`market`, `overview`, etc.) dans un autre,
- puis le front lisait un état incohérent.

C'est la cause la plus probable du cas : **paiement validé mais accès non déverrouillé**.

## Corrections appliquées

### 1) Unification de l'identifiant Firestore
Toutes les écritures critiques de facturation utilisent désormais la même résolution d'identifiant :
- `updateBillingCredits`
- `setBillingCreditsAbsolute`
- `setBillingPlan`
- `setBillingSteam`
- `unlock-feature`
- `unlock-market`

### 2) Pré-merge avant transaction
Avant `unlock-feature` et `unlock-market`, le serveur force un passage par `getBillingDoc(tu)` pour rapatrier les anciens documents et éviter les transactions sur un mauvais document.

### 3) Réponse `/api/billing/me` enrichie
L'API renvoie maintenant aussi :
- `connected: true/false`
- `is_connected: true/false`

Cela corrige un autre défaut UI : certains écrans croyaient encore l'utilisateur non connecté alors qu'il l'était.

### 4) Correction d'un entitlement incohérent
Dans `billing-guard.js`, la clé `besttime` était incohérente avec la clé serveur `bestTime`.
Le verrouillage de cette fonction pouvait donc se comporter de manière erratique.

### 5) Correction du comptage de holdings
Le comptage des positions de portefeuille prenait parfois `w.holdings` comme tableau alors que c'est un objet.
Le calcul est maintenant fiable.

## Windows / application desktop
Le projet n'était pas encore une vraie application Windows packagée.
J'ai ajouté une base Electron :
- `electron-main.js`
- `preload.js`
- scripts npm pour lancement desktop
- configuration `electron-builder`

## Commandes prévues

### Lancer en web
```bash
npm install
npm start
```

### Lancer en application desktop
```bash
npm install
npm run desktop
```

### Générer un installateur Windows
```bash
npm install
npm run dist:win
```

## Points encore à améliorer

### UX / français / intuitivité
Le socle reste fonctionnel, mais l'application contient encore :
- quelques libellés anglais (`Overview`, `Markets`, etc.)
- quelques formulations techniques visibles côté utilisateur
- une hiérarchie visuelle encore hétérogène selon les modules

### Priorités de la prochaine passe
1. Uniformiser tous les libellés en français
2. Clarifier la différence entre **crédits**, **pass temporaire**, **Premium**, **portefeuille** et **bourse**
3. Simplifier l'ouverture du Marché avec un message d'état plus lisible
4. Ajouter une vraie page d'accueil desktop plus propre pour Windows
5. Harmoniser boutons, overlays, modales et feedback utilisateur

## Verdict
Le bug critique de déblocage du Marché vient très probablement de la **désynchronisation Firestore par identifiant utilisateur**. La correction appliquée cible précisément cette zone.
