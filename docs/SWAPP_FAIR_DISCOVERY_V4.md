# SWAPP Fair Discovery v4 — propositions du serveur et vues volontaires

## Fonctionnement

Fair Discovery possède désormais **deux mesures indépendantes**, présentes sur les espaces Accueil, Découvrir et Fiches de jeux.

**Propositions du serveur (v4).** Une proposition est comptée lorsqu'une carte de créateur public **munie d'une preuve SWAPP signée** figure dans une réponse API ayant terminé l'envoi HTTP avec un statut 200. Sont comptés les éléments effectivement renvoyés par les API `/api/discovery/home-lives`, `/api/oryon/discover/find-live`, `/api/discovery/game-lives`. Un classement de 60 lives « Découvrir » peut compter jusqu'à 60 propositions : ce n'est **pas** 60 cartes vues. Les fallbacks non signés, les erreurs 4xx/5xx et les candidats exclus du résultat ne sont pas comptés.

**Vues volontaires (v2/v3).** Une impression n'est comptée qu'après activation expresse par le visiteur, au moins 50 % de visibilité pendant 1,25 s, onglet visible, et envoi au serveur d'une preuve SWAPP signée. Le clic est enregistré séparément. L'accord est temporaire pour la surface affichée.

Ces **deux populations et ces deux processus de mesure ne sont pas comparables statistiquement**. NE PAS calculer `vues / propositions` comme taux de conversion, ni comparer un groupe volontaire à tous les visiteurs. Ni visiteurs uniques, ni impressions globales, ni véritable parité ne sont mesurés. Les propositions incluent des candidats que le navigateur n'affichera jamais et peuvent être sollicités plusieurs fois par des appels API ou des robots.

## Architecture Hostinger

- Base MySQL Hostinger existante, **table additive** `migrations/mysql/011_swapp_fair_opportunities_daily.sql` créée idempotemment au premier accès (aucune migration destructive). Les mesures volontaires restent dans `010_swapp_fair_exposure_daily.sql`.
- Le suivi reprend le commutateur déjà utilisé `SWAPP_FAIR_METRICS_ENABLED=1`. Aucun secret, service ou VPS supplémentaire.
- Le code `modules/swapp-fair-offers.js` valide uniquement les preuves publiques HMAC émises par SWAPP. Aucune requête ou compte visiteur, IP, cookies, session, URL visitée, login de visiteur ou en-tête HTTP n'entre dans la table ou les tampons.
- Capture après l'événement HTTP `finish` et uniquement pour les réponses HTTP 200. Les sauvegardes agrégées sont **asynchrones et groupées** (maximum 50 clés d'agrégats par requête MySQL, tampon plafonné à 512 clés, tentative de vidage après environ 15 secondes). Le site continue de servir les contenus si la sauvegarde statistique est en panne ; les événements perdus ne sont pas compensés artificiellement.
- Regroupement par date UTC, emplacement, plateforme, identifiant de chaîne **publique**, jeu public et tranche d'audience. Suppression des jours de plus de 14 jours lors de la maintenance légère.
- Limitation du trafic existante sur les routes de découverte. Les robots, rafraîchissements répétitifs et requêtes distribuées peuvent gonfler les « propositions », donc il ne s'agit **pas** d'une mesure certifiée anti-fraude.

## Administration

Le tableau privé `https://swapp.tv/admin/fair-discovery` montre les **propositions du serveur** dans un panneau distinct des **impressions volontaires**. Un seul filtre 7/14 jours et Accueil/Découvrir/Fiches/Tous pilote les deux séries. Cela permet de diagnostiquer une situation où de nombreux lives de petites chaînes figurent dans les résultats API sans nécessairement être visibles.

Les propositions ne sont affichées que si au moins **50 propositions ET 5 créateurs distincts** existent dans le périmètre choisi. Les répartitions par tranche sont masquées sous **10 propositions OU 3 créateurs**. Les vues volontaires conservent leurs seuils de confidentialité d'origine. Les totaux globaux ne sont pas divulgués au public : l'API du tableau est protégée par le rôle administrateur SWAPP déjà existant.

## Vérifications de livraison

Exécuter dans un environnement Node complet : `npm test` et `npm run check`. Les contrôles ciblés : `node --test test/swapp-fair-offers-v4.test.js test/swapp-fair-admin.test.js test/swapp-fair-discovery-v3.test.js`.

Après déploiement Hostinger, ouvrir `/api/release` pour vérifier la correspondance du code, puis le tableau administrateur. Vérifier les 3 placements indépendamment : une requête de découverte avec de vraies cartes signées peut faire augmenter les propositions **après regroupement des écritures** (~15 s) ; elle ne doit pas augmenter les impressions volontaires tant que le bouton de contribution n'est pas activé. Le tableau affiche « données insuffisantes » en l'absence de seuils.

Limite : un compte rendu de tests isolés des fonctions n'est pas une vérification réelle sur Hostinger, iPhone, Android ou navigateur avec trafic public.
