# SERVEUR + — Recherche de joueurs premium (16 novembre 2026)

## Problème constaté

Le module d'origine ressemblait à un formulaire administratif, avec deux champs qui se chevauchaient (« Annonce » et « Vocal »), deux énormes boutons blancs dont le retrait pouvait devenir visible malgré `hidden`, un état vide peu engageant et aucune information accessible sur le nombre de joueurs réellement disponibles.

## Refonte implémentée

- Un titre engageant **« Trouve ta prochaine équipe. »** explique immédiatement l'utilité du dispositif. Les trois repères « Visible pendant 1 heure », « Annonce modifiable » et « Aucune présence inventée » restent explicites.
- Un indicateur de disponibilité affiche initialement **« — / Vérification en cours »**, puis uniquement le nombre de déclarations non expirées renvoyées par `GET /api/swapp/serveurs/:id/community`. Le backend limite le résultat à 30 joueurs : si la limite est atteinte, afficher `30+`, et non un total inventé. En cas d'erreur, revenir à « — » et « Données non vérifiées ».
- Une **seule surface de publication** au style glacé, sobre et premium : titre, annonce facultative (160 caractères), vocal souhaité, bouton cyan « Me rendre disponible » avec microtexte. La grille à deux colonnes dispose de largeurs minimales et de `min-width:0` ; elle passe en une colonne sous 680 px. `label for` et `input id` correspondent.
- « Retirer ma disponibilité » est une action secondaire, cachée explicitement par `[hidden]{display:none!important}` tant que le compte n'a pas de déclaration active. Le bouton principal devient « Actualiser ma disponibilité » si la personne est déjà présente.
- Pour les visiteurs non connectés, aucune tentative de POST vouée à un 401 : une invitation « connecte-toi à ton compte SWAPP » est affichée et le CTA conduit à `/compte`. L'API renvoie seulement `authenticated:boolean`.
- L'état vide ne simule pas d'activité : « La prochaine équipe commence avec toi », une invitation à publier et un bouton qui ramène le focus au formulaire.
- Les déclarations existantes sont présentées en lignes compactes, avec initiale réelle du pseudonyme déclaré (pas d'avatar inventé), texte facultatif, préférence vocale et durée restante lorsqu'elle est connue.
- La page met à jour les disponibilités toutes les **60 secondes si l'onglet est visible**, alors que les sources de lives existantes restent vérifiées toutes les 5 minutes. Les timers sont arrêtés lors de `pagehide`.

## Portée et sécurité

Le module n'invente ni joueur, ni audience, ni statut en ligne. Les publications sont volontaires, liées au compte identifié, limitées à 60 minutes par le backend existant. Les limites de fréquence, l'absence de coordonnées externes dans le texte, la modération des créateurs et leurs statuts validés restent inchangés.

## Fichiers

- `modules/swapp-servers-community.js` — structure HTML du module et présence d'une session.
- `assets/swapp-servers-community.js` — compteur vérifié, UX active/invitée, état vide, affichage compact des joueurs et rafraîchissement.
- `assets/swapp-servers-community.css` — refonte responsive, contraste, focus et réduction des animations.
- `modules/swapp-servers.js` — versions CSS/JS invalidées vers `20261116-lfg-discord-v5`.
- `test/swapp-servers-lfg-premium-20261116.test.js` — huit tests ciblés.
- `test/swapp-server-profile-flat-editorial-20261116.test.js` — version CSS attendue mise à jour.

## Contrôles

- Syntaxe JS vérifiée.
- Tests ciblés de structure, d'actions et de styles : **8/8 réussis en exécution isolée**.
- Simulation de l'interface JS avec zéro joueur, deux joueurs et une erreur d'API : valeurs correctes, aucun faux zéro, « Retirer » réservé aux annonces actives.
- À confirmer après déploiement : captures réelles sur largeur 375 / 768 / 1440 px, authentification, annonce, actualisation, retrait et rafraîchissement de la disponibilité.
- Le `npm test` complet et le déploiement Hostinger **n'ont pas été exécutés**. La fusion GitHub ne déploie pas l'instance publique.
