# SWAPP — Fair Discovery v3 : Accueil + Découvrir + Fiches de jeux

## Livraison
L'accueil principal SWAPP et son parcours « Swap ton mood » dans `/decouvrir` sont désormais éligibles à **la même mesure volontaire** déjà utilisée sur les fiches de jeux.

Le classement des chaînes, les filtres par jeu et les recommandations selon l'ambiance restent inchangés. Aucun nouveau panneau ajouté à l'accueil, aucune requête supplémentaire aux APIs Twitch/SWAPP pour instrumenter les cartes.

- Le serveur joint une **preuve signée HMAC**, valable au maximum 45 minutes, aux candidats qu'il vient de recommander dans `/api/discovery/home-lives` ou `/api/oryon/discover/find-live`.
- Chaque preuve indique `home`, `discover` ou `game`. Ces placements existent déjà dans la colonne `placement` de `swapp_fair_exposure_daily` (MySQL Hostinger) ; aucune migration supplémentaire.
- Dans l'interface principale, seules les cartes possédant une **preuve du serveur** peuvent être mesurées. Les streams issus de flux de secours / réponses tierces sans preuve ne sont **pas** mesurés.
- Le visiteur active explicitement « Mesure équitable (facultatif) » sur chaque surface. Cet accord n'est enregistré ni dans un cookie, ni dans `localStorage`, ni dans son compte. Quitter la page SPA désactive cette mesure.
- Impression = **au moins 50 % du contenu à l'écran, pendant 1,25 s** avec onglet visible ; un clic vers le direct est un compteur distinct. La mesure ne se déclenche jamais sur « Pas ouf », sur une simple vue API, ou sur les suivis Twitch.
- Déduplication locale par preuve et événement (maximum 24 signaux par surface et page). Endpoint existant `POST /api/discovery/fair-event` avec `Origin` contrôlé et limite anti-abus ; données MySQL agrégées sans identité de visiteur, adresse IP ou session dans la table.

## Tableau de bord administrateur

`/admin/fair-discovery` dispose du sélecteur **Tous / Accueil / Découvrir / Fiches de jeux**, ainsi que 7 ou 14 jours. Le backend lie strictement les valeurs autorisées à la clause SQL `placement`. Le mode « Tous » additionne toutes les surfaces ; l'API publique `/api/discovery/fair-summary` conserve par défaut l'ancienne portée `game` pour compatibilité.

Les contrôles de confidentialité existants restent actifs : minimum global **50 impressions et 5 créateurs distincts**, minimum par catégorie **10 impressions et 3 créateurs**, par jeu **20 impressions et 3 créateurs**. Une absence de statistique ne signifie pas zéro.

## Limites

Les chiffres sont **des cartes vues par des volontaires**, pas le nombre total d'impressions de SWAPP, pas le nombre de visiteurs uniques, ni un classement automatique équitable. Les preuves peuvent être rejouées jusqu'à leur expiration ; le bridage par IP n'est pas une défense complète contre la fraude distribuée. Ne pas utiliser ces résultats pour rémunérer ou sanctionner automatiquement des chaînes.

Une carte peut être proposée dans une réponse API sans jamais être rendue : **ces propositions ne sont pas comptées comme impressions.** L'infrastructure actuelle n'enregistre pas encore séparément et de façon exhaustive les opportunités de placement côté serveur ; une comparaison « opportunités proposées vs réellement vues » nécessitera une métrique agrégée distincte avec critères de qualification documentés.

## Mise en production Hostinger

Les configurations précédentes restent valables : `SWAPP_FAIR_METRICS_ENABLED=1`, `SWAPP_SOCIAL_FEATURES=1`, `SESSION_SECRET` long et stable, connexion MySQL existante. Aucun nouveau secret. Le déploiement Node doit inclure le gros `index_script.js` modifié et ses nouvelles versions HTML ainsi que `assets/swapp-fair-v3.js` et `assets/swapp-fair-v3.css`.

Contrôles :
1. `npm test`, `npm run check`, `npm run release:info` sur le code déployable ; `npm run verify:production` sur le site.
2. Sur `/decouvrir`, lancer un jeu qui présente un vrai live ; vérifier l'apparition du bouton **facultatif**, aucune requête `fair-event` tant qu'il n'a pas été activé, puis l'émission d'un `impression` sur une carte visible et d'un `click` après « Voir ».
3. Sur l'accueil, une carte Twitch vérifiée peut recevoir le même contrôle ; **les suivis et fallbacks non signés n'en reçoivent pas**.
4. Après navigation entre accueil et Découvrir, constater que l'accord précédent ne reste pas actif.
5. Dans `/admin/fair-discovery`, vérifier le filtrage « Tous / Accueil / Découvrir / Fiches » ; aucun graphique ne doit apparaître sous les seuils. La réponse publique `/api/discovery/fair-summary` reste volontairement limitée aux fiches de jeux pour compatibilité.

L'accès admin utilise le rôle SWAPP déjà en place. Une fusion GitHub ne vaut pas déploiement Hostinger vérifié.
