# SWAPP SOCIAL — Gates de mise en production

Ce document sépare les validations réelles des simples vérifications statiques. Il n'autorise pas à annoncer « tout fonctionne » à partir d'un statut MySQL ou d'une compilation JavaScript.

## Architecture réelle (octobre 2026)
- Session unique : compte local SWAPP via `/api/oryon/session`.
- Publications, abonnements, communautés, messages privés, notifications : proxy first-party `/api/pulse/*` vers `https://quanticminds.onrender.com`.
- SWAPP Match, sondages, salons textuels et passeports : MySQL Hostinger via `/api/swapp/interactions/*`.
- Actualités : `/api/actus`, lives : `/api/discovery/game-lives`.
- Tant que les données historiques du service Render n'ont pas été migrées sans perte, une panne Render peut interrompre le fil et les messages. **Ne pas désactiver le proxy en production sans plan d'export/import, contrôle des comptes et rollback.**

## Changements de stabilité vérifiables
1. Un seul `core.js` sans query string pour `app.js`, `views.js`, `session.js` et `render.js`.
2. Les clics de navigation sont délégués aux boutons créés dynamiquement.
3. Une réponse réseau ancienne ne peut pas réécrire une autre vue.
4. Les messages privés se rafraîchissent sans réinitialiser le champ de saisie.
5. Les liens de jeu ouvrent la vue Jouer ; les salons ouvrent la vue Salons.
6. RSS limité à un délai connu ; diagnostics Render séparés du diagnostic MySQL.
7. Limites de lecture plus souples que les limites d'actions sensibles.
8. Suppression des formulaires de faux sondages et des anciennes cartes SWAPP Match qui ne faisaient que préparer du texte.

## Étape A : test read-only sans aucun identifiant
Dans un terminal ayant accès à Internet : `node tools/swapp-social-smoke.js`.
- `/api/swapp/interactions/status` doit être `database_read_ready`.
- `/api/pulse/health` doit répondre 200. Sinon le fil historique, les messages privés et les communautés dépendent d'un amont indisponible.
- `/api/actus` et la page /communaute doivent répondre.
- Sans cookie, les routes privées répondent normalement 401 ; ce n'est **pas** une preuve de leur fonctionnement avec un compte.

## Étape B : navigateur avec compte SWAPP connecté
Tester avec deux comptes distincts. Ne jamais transmettre de cookies, mots de passe ni secrets à un tiers.
- Connexion et persistance après F5, compte affiché identique dans le fil et Messages.
- Fil Pour vous, Récent/Abonnements, Actualité : 10 changements rapides sans écran collé.
- Créer une publication, joindre un lien HTTPS, commenter, réagir, partager, enregistrer.
- Suivre un membre, consulter son profil, bloquer et signaler.
- Envoyer et recevoir un message privé dans les deux sens, revenir à la liste ; conserver un brouillon pendant actualisation.
- Créer, rejoindre/quitter une communauté et y accéder depuis la colonne droite.
- Créer une annonce Match, remplir passeport et tester sa visibilité privée/publique, puis enregistrer.
- Créer un sondage, voter avec un compte, vérifier les totaux, tester le second compte.
- Créer un salon, envoyer un message, rouvrir le salon après F5.
- Actualité « Discuter du jeu » et lien /communaute?game=PUBG doivent ouvrir l'univers.
- iPhone Safari et Android Chrome : menus, saisie au clavier, boutons accessibles, aucune superposition.
- Aucun faux utilisateur, faux compteur ou faux statut en direct.

## Étape C : release et rollback
- Déployer `master` depuis Hostinger en conservant les variables et données existantes.
- Vider les anciens caches clients (liens assets versionnés).
- Surveiller les codes 401/429/503 pour `/api/pulse/*` et `/api/swapp/interactions/*`, ainsi que les erreurs JS.
- En cas de panne persistante, restaurer le commit précédent plutôt que d'écraser les tables ou les publications.
- Un test de lecture ou une simulation ne valide pas les écritures réelles ni les échanges entre comptes.
