# SWAPP Creator Impact — 26 octobre 2026

## Livré sur cette branche

- Endpoint privé GET `/api/creator/impact?days=7|14` : identité validée côté serveur, lecture agrégée de sa propre chaîne SWAPP, SQL paramétré.
- Interface dans `/dashboard` : cartes signalées visibles, clics, propositions de l'API et jeux correspondants. Données de 7 ou 14 jours, aucune actualisation automatique coûteuse.
- Deux mesures indépendantes : `swapp_fair_exposure_daily` et `swapp_fair_opportunities_daily`. Les propositions ne sont pas des vues et les clics ne sont pas des spectateurs gagnés.
- Couverture limitée aux plateformes `swapp` et `oryon` et au login du propriétaire SWAPP. Les audiences Twitch/Kick liées ne sont pas agrégées sous un autre login.
- Si le suivi est désactivé, le stockage absent ou les tables inexistantes, l'interface affiche « Non mesuré » et ne fabrique pas de zéro.
- Dossier jeu `/jeux/:slug` : la section live précède les articles, ancres `#game-live` et `#game-actus`; Spotlight et Social restent présents.
- Aucun fournisseur payant, aucune nouvelle base, aucun VPS, aucune modification HLS, WebRTC, lecteur ou tchat.

## Ce qui n'est pas encore ASCENSION

Le gain réel de spectateurs, le retour des spectateurs et la croissance moyenne vérifiée ne sont pas mesurés par ce lot. Ces données nécessitent des mesures de sessions réelles et des contrôles antifraude. Il ne faut pas afficher de rangs, followers ou revenus inventés.

## Vérification avant une fusion et déploiement

1. Exécuter localement `npm run check` et `node --test test/swapp-creator-impact.test.js test/swapp-creator-journey.test.js`, puis `npm test`. Aucune GitHub Action payante.
2. Tester l'API avec une session anonyme (401), un autre compte (403), le propriétaire valide (200), un `days=365` (400), le stockage absent (503) et l'absence de tables (mesure non disponible).
3. Vérifier l'identifiant du compte serveur, l'absence d'ID visiteur dans les réponses et le fait que les SQL ne consultent que le login authentifié.
4. Sur desktop et mobile, naviguer plusieurs fois vers `/dashboard` sans apparition de plusieurs modules. Tester période, bouton Actualiser et éléments interactifs.
5. Tester plusieurs `/jeux/:slug`, y compris un jeu sans chaîne active : correspondance exacte du jeu, section des vrais directs visible et absence de faux EN DIRECT.
6. Vérifier la fonction de diffusion OBS et le lecteur public sur réseaux distincts. Ne pas fusionner pendant un direct en cours risquant une coupure.
7. Comparer `GET /api/release` de Hostinger au commit déployé. GitHub ne prouve pas le déploiement.

## Limites

Les tests unitaires/statique ne prouvent pas la lecture vidéo réelle, la livraison des notifications ou les performances à forte audience. Aucun de ces points n'est affirmé comme validé.