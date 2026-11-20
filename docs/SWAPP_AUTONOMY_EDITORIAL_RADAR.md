# SWAPP Autonomy — radar éditorial Live → Magazine et Guides

**Livraison technique du 20 novembre 2026.** Cette étape exploite le moteur Live Trends déjà validé en production sans ajouter d'appels Twitch, sans utiliser de modèle d'IA payant, et sans publier automatiquement de contenus non vérifiés.

## Endpoint autonome

`GET https://swapp.tv/api/swapp/autonomy/editorial-opportunities`

Ce GET renvoie des pistes de recherche pour les équipes du **Magazine** et de **SWAPP Guides**, uniquement lorsque le collecteur Live renvoie :
- `state: ready`, `comparable: true`, deux observations horodatées ;
- source `twitch-helix-fr-first100`, couverture `bounded-provider-sample-not-market-share` ;
- observation récente (moins de quinze minutes selon le moteur).

Les pistes se limitent aux jeux affichant une hausse de directs, de spectateurs observés ou de petits créateurs entre ces deux échantillons. Il ne s'agit ni d'une croissance du marché, ni d'un événement lié à un jeu, ni d'une preuve d'annonce de son éditeur.

Chaque proposition inclut des chiffres **strictement issus de l'échantillon Twitch**, `sourceVerificationRequired: true` et `publicationAuthorized: false`. La rédaction doit rechercher et vérifier les sources primaires avant tout article ou guide, puis contrôler le contenu, la qualité et les médias avant toute publication.

## Connexion réelle au Magazine

Pour chaque jeu, le radar cherche dans le catalogue MySQL existant `swapp_news_documents` les **articles officiellement publiés** : `collection_name=swapp_news_articles`, `status=published`, identifiant de page valide et correspondance exacte ou alias éditorial explicitement connu.

Les données SQL lues sont limitées aux champs `slug`, `game`, `title`, `category`, `contentType`, `publishedAt`, `status` et à **200 enregistrements publiés maximum**, ordonnés par mise à jour décroissante. **Le corps des articles, les brouillons et les secrets ne sont pas transmis au radar** ; aucun slug n'est créé ni déduit de l'actualité Twitch.

Une correspondance publiée apparaît comme `editorial.relatedArticle.url = /actus/<slug-existant>`. Si aucun article publié n'existe, le lien est `null`.

## Connexion réelle à SWAPP Guides

Un article publié dont la catégorie ou le type est `Guide` / `Guides` apparaît comme `editorial.publishedGuide` et pointe vers son véritable chemin `/actus/<slug>`. Pour **Aion 2**, le guide SWAPP déjà implémenté sous `/guides/aion-2` peut aussi être proposé. Le radar **ne fabrique jamais** de lien `/guides/<jeu>` inexistant.

Si un guide n'existe pas encore, `editorial.recommendedAction = research-guide` : il s'agit d'une tâche éditoriale, pas d'un article paru. Pour les guides existants, l'action est `review-existing-guide`.

## Quotas, sécurité et reprises

- **Twitch** : zéro requête ajoutée ; réutilisation de `swappLiveTrendCollector.report()` avec son cache et son historique MySQL.
- **MySQL** : réutilisation du pool existant Live Trends (une seule connexion maximum par processus). Une lecture `SELECT` ciblée du catalogue éditorial au plus toutes les dix minutes par processus, et partage d'une même promesse lors de requêtes concurrentes. En cas d'échec, temporisation de soixante secondes.
- **Aucune écriture** : aucune migration, aucun `INSERT`, `UPDATE`, `DELETE` ou déclenchement d'un endpoint éditorial ayant des effets de bord.
- **Dégradation** : `state: awaiting-comparable-samples` tant que les tendances ne sont pas prêtes ; `catalogueStatus: unavailable` si les articles publiés ne peuvent pas être lus. Les liens ne sont jamais inventés et aucune erreur SQL brute n'est exposée.
- **Compatibilité Hostinger** : les deux modules sont obligatoires dans le ZIP et inclus dans l'empreinte `/api/release`. Une absence de module pendant un transfert partiel conduit à une route 503 sans bloquer le serveur principal.
- **Interrupteur** : si le moteur Live est désactivé par `SWAPP_LIVE_TRENDS_ENABLED=0`, le radar renvoie 503 (`disabled`), sans connexion supplémentaire.

## Recette

1. Ouvrir le nouveau lien de diagnostic après que Hostinger a reçu la version contenant cette livraison.
2. Vérifier `success: true`, `state: ready`, `publicationAuthorized: false`, `opportunities` et `catalogueStatus`.
3. Pour les jeux déjà documentés, vérifier que chaque `relatedArticle.url` mène réellement à un article publié, puis qu'un éventuel `publishedGuide.url` est public.
4. Vérifier l'absence de brouillons, de doublons, de liens `/guides/<jeu>` imaginaires, de faux pourcentages de croissance et de publications déclenchées par le GET.
5. Exécuter `npm run test:autonomy`, `npm run check`, `npm test` et la recette complète Hostinger. L'environnement isolé a exécuté **14 tests JavaScript ciblés, tous réussis**, et contrôlé la syntaxe ; ce contrôle ne remplace pas une suite complète Node sur le dépôt.

Le WAF SWAPP peut renvoyer HTTP 403 aux sondes automatiques extérieures. Utiliser un navigateur déjà autorisé pour la recette, sans contourner les protections.

**Prochaine étape distincte :** faire consommer ce radar au workflow de recherche des guides et à la veille éditoriale, puis produire des textes uniquement sur preuves primaires et validation du contenu, sans confondre signaux Twitch et actualités.
