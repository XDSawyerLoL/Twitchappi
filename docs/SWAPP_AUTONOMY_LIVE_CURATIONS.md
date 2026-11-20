# SWAPP Live — sélection des petits créateurs (20 novembre 2026)

## Livraison

La route existante `GET /api/discovery/home-lives?limit=12&lang=fr` conserve son tableau `items`, son ordre de découverte et les preuves signées `fairProof`. Elle reçoit un champ facultatif **`liveCuration`**, calculé à partir du même lot déjà interrogé. **Aucun nouvel appel Twitch/Kick/YouTube, aucun accès SQL, aucun nouveau cron, aucune API payante**.

Le filtre transversal `replayTitle` reconnaît maintenant, en plus des titres, les tags Twitch `Rediffusion`, `Replay`, `Rerun`, les diffusions `24/7`, les `AFK` et les boucles explicitement annoncées. Un marathon « 24 heures » n'est pas assimilé à une diffusion `24/7`. Le classement de la page d'accueil et la découverte par jeu bénéficient de cette correction existante.

## Signification du nouveau JSON

- `basis: home-sample-only` : **échantillon des résultats de l'accueil**, et non classement de popularité Twitch, Steam ou marché.
- `eligibleSmallCount` : directs affichés éligibles aux petits créateurs, entre 20 et 149 spectateurs inclus, hors catégories non ludiques connues, rediffusions et titres AFK/24/7.
- `surpriseIndex` : indice dans `items` vers le créateur proposé. L'interface doit réutiliser l'objet source et sa `fairProof` ; ne pas créer une fiche non signée.
- `refreshWindowSeconds: 180` : rotation déterministe de la proposition toutes les trois minutes **lorsqu'une requête de découverte est effectuée**. Ce n'est **pas** un collecteur exécuté en permanence.
- `candidateCount`, `homeCount`, `excludedReplayCandidates` : volumes du lot reçu et de ses exclusions explicites.
- `gamesInSample` : jeux présents dans **ce petit échantillon**, avec nombre de directs et spectateurs observés parmi les résultats ; **ne pas appeler ce tableau « jeux tendance »** sans historique de plusieurs collectes indépendantes.

Une réponse `liveCuration:null` indique un chargement facultatif non opérationnel pendant un déploiement partiel. Le reste de l'API reste utilisable. Aucune donnée spectateur, cookie ou profil individuel n'est créée.

## Validation

Neuf scénarios unitaires de curation ont été exécutés sans erreur dans un environnement JavaScript V8 isolé, à partir des fichiers GitHub exacts (dépendance de normalisation simulée). La syntaxe du `server.js` complet a été vérifiée. La **suite Node du dépôt, les tests de route Express et la production restent à vérifier**.

Commandes après checkout : `npm run test:autonomy`, `node --test test/swapp-discover-ranking.test.js`, `npm test`, puis `npm run verify:production` après déploiement.

Le fingerprint de `tools/swapp-release.js` suit désormais le nouveau module, et `tools/swapp-hostinger-package.js` l'exige dans le paquet.

## Exemple à contrôler dans le navigateur

`https://swapp.tv/api/discovery/home-lives?limit=12&lang=fr`

Après livraison effective, la réponse doit inclure `liveCuration` avec `basis:home-sample-only`. Les streams tagués `Rediffusion` doivent être absents de `items`. Ne pas contourner un éventuel HTTP 403 du pare-feu : ouvrir cette URL depuis une session navigateur autorisée.

**Prochaine étape :** collecteur périodique compatible avec les quotas et les instances Hostinger, stockage MySQL idempotent avec mesure historique, calcul de tendances sur plusieurs observations. Les plateformes Kick et YouTube requièrent leur collecte vérifiée avant de pouvoir être annoncées comme prises en charge.
