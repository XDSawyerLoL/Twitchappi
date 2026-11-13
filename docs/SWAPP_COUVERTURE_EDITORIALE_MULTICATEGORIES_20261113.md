# SWAPP — Contrat de couverture éditoriale multithématique (13 novembre 2026)

## Constat vérifié dans le dépôt
- `modules/swapp-news/editorial-release-sync.js` adopte des lots déjà approuvés, sans rechercher de nouvelles informations.
- `modules/swapp-news/router.js` déclenche une synchronisation idempotente, mais ne fournit pas de veille multi-sources.
- `docs/SWAPP_VEILLE_PUBLICATION_AUTOMATIQUE.md` impose des sources primaires, médias autorisés, déduplication, contrôle de production et conservation des modifications CMS.
- Le lot de trois brouillons `docs/swapp-veille-selection-multicategories-20261113.md` n'est PAS une publication.

## Règles éditoriales à implémenter dans le moteur natif Hostinger
Catégories à inspecter indépendamment à chaque passage :
1. Gaming / sorties : Steam News, Steam Charts, éditeurs, PlayStation Blog, Xbox Wire, Nintendo.
2. Guides : correctifs officiels, documentation des développeurs, changements de mécaniques.
3. PC / hardware : NVIDIA, AMD, Intel, Steam Hardware Survey (mensuelle, pas quotidienne).
4. Consoles / services : PlayStation Blog, Xbox Wire, Nintendo News, pages des abonnements.
5. IA : blogs de laboratoires et publications techniques ; distinguer benchmark interne et validation indépendante.
6. Robotique : annonces industrielles, articles techniques, tests réels, sécurité.
7. Streaming / création : OBS Project, Twitch, YouTube Creator, changelogs éditeurs.
8. Culture gaming / industrie : communiqués éditeurs, rapports financiers datés, organismes professionnels.

Pour chaque catégorie, produire un état `new_verified`, `already_covered`, `insufficient_evidence`, `source_unavailable` ou `no_new_event`. Ne jamais remplir artificiellement une catégorie.

## Algorithme attendu
1. Charger le manifeste, le catalogue CMS public et les identifiants connus sans contourner 403/429.
2. Lire des flux publics autorisés et relever date de publication, date de l'événement, titre, URL canonique et auteur.
3. Dédupliquer par (jeu ou produit, événement, date, source canonique), et non seulement par slug.
4. Donner priorité aux faits nouveaux et utiles, puis à la diversité de catégories ; limiter les dossiers répétitifs.
5. Exiger une source primaire datée et, pour les affirmations controversées, une corroboration indépendante.
6. Produire un article français original avec explications, limites, contexte, sources, crédits, SEO.
7. Vérifier droits des médias, cohérence du trailer et de la miniature. Sans droit vérifiable, garder en brouillon.
8. Valider le schéma via `assertArticle`, les tests natifs et les contraintes de publication.
9. Écrire un lot JSON nouveau puis ajouter son nom au manifeste sans réécrire les lots historiques.
10. Après déploiement, contrôler backend MySQL, adoption CMS, URL publique, visuel, trailer, crédit et absence de doublon.
11. Ne notifier que les publications réellement visibles ou les blocages majeurs.

## Garde-fous
- Ne pas restaurer Firestore ni changer MySQL Hostinger ; aucun VPS, API payante ou Actions facturable.
- Ne jamais modifier HLS, OBS, paiements ou comptes.
- Respecter les suppressions et brouillons du Studio : aucune résurrection.
- Ne jamais inventer de note SWAPP Score, audience ou croissance.
- Si les sources ne fournissent pas d'événement récent crédible, consigner `no_new_event` plutôt que produire du remplissage.

## Vérifications nécessaires avant d'affirmer que le problème est résolu
- Tester l'ingestion des sources avec dates et échecs simulés.
- Tester la déduplication événementielle et l'équilibrage des catégories.
- Tester la validation des médias et des articles.
- Vérifier le backend `mysql-hostinger` en production et l'adoption des lots.
- Vérifier au moins une publication réelle sur /actus ; vérifier /guides séparément.
- Mesurer sur plusieurs passages la couverture par catégorie, les nouveaux événements détectés et le taux d'échec.

**Statut : spécification technique et éditoriale, pas preuve de moteur automatisé déployé.**

## Exécution effective du 13 novembre 2026
- Nouveau lot de **quatre articles** : `data/swapp-veille-native-20261113-multicategories-sourcees.json`, enregistré à la fin du manifeste sans écraser les anciens lots.
- Thèmes couverts : `GAMING` (PlayStation Plus et Dawn of War IV), `AI` (Gemini 4 Hydrogen), `ROBOTICS` et `FUTURE` (LG, Kakao, NVIDIA).
- Veille Node/Hostinger étendue dans `tools/swapp-tech-watch.js` aux flux RSS officiels PlayStation Blog, Xbox Wire, NVIDIA Gaming et au flux des versions OBS publié par le projet officiel sur GitHub.
- `modules/swapp-tech-watch-store.js` accepte maintenant `GAMING` dans **la table MySQL existante** ; aucun changement de schéma.
- Événements dont la publication RSS est antérieure à 21 jours (ou datés plus d'un jour dans le futur) rejetés de la nouvelle collecte ; seuls des **candidats non vérifiés** sont enregistrés.
- Test ajouté : `test/swapp-multicategory-watch-release-20261113.test.js`. Syntaxe JS contrôlée et collecte pure simulée exercée sans API ni frais ; **suite Node complète non exécutée**.
- Aucun déclencheur GitHub Actions, nouvelle dépendance ou service externe payant.
- Droits médias : deux vidéos issues des chaînes officielles et intégrées sans copie ; deux articles purement textuels, aucun visuel récupéré sans autorisation.
- Dernier contrôle public des API `/api/actus`, `/api/actus/storage-status`, `/api/actus/release-status`, `/api/release` : **HTTP 403 via lecture automatisée**. Ces réponses empêchent de certifier l'adoption MySQL, le SHA déployé et l'affichage. Ne pas annoncer la publication publique tant que ces contrôles n'ont pas réussi.

Le statut GitHub (lot préparé et/ou fusionné) doit toujours être distingué du statut *publié et visible sur swapp.tv*.

## Correction des liens et des visuels — 13 novembre 2026
- Dans `assets/swapp-actus-app.js`, le titre et la vignette des **brèves sourcées** ne redirigent plus le lecteur vers l'éditeur externe : si `articleSlug` désigne un article natif, ils mènent à `/actus/<slug>` ; sinon, ils ouvrent le détail de la brève **dans la même page SWAPP**.
- La référence primaire externe reste disponible à la fin du détail, sous l'intitulé explicite « Référence externe » ; elle n'est pas une destination implicite pour une carte.
- Dans `data/swapp-editorial-signals.json`, les brèves Dawn of War IV et Gemini 4 Hydrogen pointent vers les deux nouveaux articles intégraux SWAPP.
- Les quatre articles du lot `data/swapp-veille-native-20261113-multicategories-sourcees.json` ont une **illustration distante officielle avec crédit** : couverture de partage PlayStation.Blog, miniature vidéo Deep Silver sur YouTube, visuel Open Graph Google et visuel Open Graph NVIDIA.
- Les deux bande-annonces de jeux sont identifiées par leurs véritables références officielles : KOJIMA PRODUCTIONS `HdzIwQhYABQ` et Deep Silver `FIr-v1G-4nQ`. Aucune image ni vidéo n'est copiée ou hébergée par SWAPP.
- Tests de navigation des brèves et validation du jeu de quatre médias dans `test/swapp-actus-visuals-internal-links-20261113.test.js`. Vérification dynamique isolée effectuée pour les modes **article natif** et **brève déroulante** ; suite Node complète à exécuter dans l'environnement du dépôt.
- **Aucune preuve de déploiement Hostinger :** les requêtes automatisées vers `/api/actus` et les quatre pages publiques renvoient HTTP 403. Ne pas confondre fusion GitHub et publication visible.

Cette correction n'ouvre pas de nouvelle rubrique ; elle réutilise le magazine `/actus` et ses cartes existantes.
