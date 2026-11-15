# SWAPP Serveurs — annuaire communautaire natif (15 novembre 2026)

## Objectif
Ajouter à SWAPP un annuaire de serveurs par jeu, inspiré de la logique publique de top-serveurs.net mais sans reprise de son code, de ses données ou de sa marque. Page \`/serveurs\`, lien depuis \`/explorer\`. Accessible avec l'en-tête SWAPP natif et un fond noir.

## Fonctionnalités écrites dans le dépôt
- Recherche par nom, description, jeu et tags ; tri par votes du mois, récence ou nom.
- Fiches réelles ajoutées par des comptes SWAPP existants, sans faux serveurs préchargés.
- Soumission gratuite (cinq fiches maximum par compte), description d'au moins 30 caractères, HTTPS requis pour le site et la bannière.
- Modération par compte administrateur ID fixé dans \`ORYON_ADMIN_USER_IDS\`, avant publication. Le panneau de modération n'est visible que par ce compte.
- Votes serveur par compte SWAPP, renouvelables au bout de deux heures. L'historique des votes éligibles est comptabilisé dans le classement mensuel ; transactions MySQL avec verrou sur la ligne du dernier vote.
- Aucun nombre de joueurs connectés, latence, état en ligne, avis ou récompense de plugin inventés. Aucun accès à l'API Top-Serveurs.

## Infrastructure
Le module \`modules/swapp-servers.js\` utilise \`mysql2/promise\` et la base MySQL Hostinger EXISTANTE, par \`SWAPP_MYSQL_URL\` ou \`SWAPP_SERVERS_MYSQL_URL\`. Aucun VPS ni API payante. Trois tables créées de manière idempotente : \`swapp_game_servers\`, \`swapp_game_server_votes\`, \`swapp_game_server_vote_events\`. Secrets uniquement dans les variables privées Hostinger. Une application sans base MySQL renvoie 503 explicite : elle ne simule aucun classement.

## Sécurité et intégration
- Vote et création exigent une session \`req.session.oryonUser.id\` et une origine de confiance.
- Modération exige l'ID admin épinglé dans \`ORYON_ADMIN_USER_IDS\` (pas le pseudonyme seul).
- Requêtes SQL paramétrées ; tailles limitées, HTML échappé côté serveur et textes injectés avec \`textContent\` côté client.
- URLs externes HTTPS autorisées seulement après validation, liens externes en \`noopener noreferrer nofollow\`.
- Pas de comptes SWAPP supplémentaires, pas de migration ou de modification de SWAPP SOCIAL, NEWS ou LIVE.
- Déploiement : intégrer les commits dans le paquet Hostinger actuel, démarrer Node avec MySQL et vérifier \`GET /api/swapp/serveurs\`, \`GET /serveurs\`, formulaire avec compte authentifié, modération et deux votes espacés de deux heures.
- Ne pas présenter \`/serveurs\` comme en production avant vérification publique réelle.

## Évolutions non réalisées
Monitoring réel des serveurs par protocole, avis avec modération, statistiques historiques avancées, votes de plugins (ex. Votifier), système antifraude multi-comptes renforcé. Ces fonctionnalités nécessitent des implémentations et tests supplémentaires : ne pas les annoncer comme disponibles.


## Extension graphique et SEO du 15 novembre
- Page /serveurs : trois univers en vedette (GTA V/FiveM, Minecraft, Rust), grille de 34 catégories réelles, filtre de jeux et portraits de jeu pertinents.
- Fonds illustrés depuis des pages de jeux Steam (CDN Steam) ; Minecraft utilise la couverture de la catégorie Minecraft Twitch/IGDB. Une bannière de serveur déclarée par son propriétaire a priorité sur la couverture du jeu ; en cas d'échec, le visuel du jeu correspondant sert de recours. Aucune image d'un autre jeu ne doit être réutilisée.
- Comptages par catégorie issus des fiches validées SQL : `SELECT game, COUNT(*) ... WHERE status="published"`. Un compteur inconnu n'est jamais présenté comme zéro.
- Pages de jeu partageables : `/serveurs/minecraft`, `/serveurs/gta-rp`, etc. Les URL sont construites à partir du catalogue autorisé, pas d'une saisie libre.
- Fiches publiques individuelles : `/serveurs/<jeu>/<fiche>`, accessibles uniquement pour les serveurs approuvés ; description, couverture, adresse, lien de connexion, région, nombre de votes du mois et bouton de vote.
- `/serveurs` et `/explorer` ajoutés au sitemap public.
- Les images distantes restent la propriété des ayants droit ; leur disponibilité et leurs conditions d'utilisation doivent être recontrôlées avant le déploiement.

## ACTUS — correction des bandes latérales
Quand `#actus.view.active` est affiché, la page entière (`html`, `body`, `main.app` et `#actus`) a un fond `#030405` sans image de fond. Cela ne modifie ni la bande-annonce animée de la bannière ni les illustrations des articles. Le correctif est dans `assets/swapp-actus-app.css`.

## Vérifications effectuées
Les fichiers JavaScript du backend, de la galerie, du lecteur de fiche, des pages Explorer et du serveur ont passé une vérification de syntaxe. Les éléments HTML générés ont été contrôlés en exécution isolée avec dépendances simulées : 34 jeux, 35 cartes de filtres (avec la catégorie générale), rubriques illustrées, URL canoniques par jeu, détail d'un serveur Rust, routes GET/POST et fond noir d'ACTUS.

**Non vérifié** : lecture effective d'images sur tous les navigateurs, enregistrement SQL, votes réels, session administrateur sur Hostinger et mise en production. Ne pas décrire ces opérations comme accomplies.
