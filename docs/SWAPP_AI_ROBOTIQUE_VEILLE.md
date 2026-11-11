# SWAPP — Rubriques Actualité par tags (11 novembre 2026)

## Décision finale du propriétaire

**Une seule page éditoriale : [Actualité](https://swapp.tv/actus).** Les nouvelles rubriques ne sont **ni** des pages indépendantes **ni** des chaînes de streamer. Les tags sont un filtre léger au-dessus de la liste d'articles existante :

- `GAMING` : actualités des jeux vidéo, guides, lives
- `AI` : intelligence artificielle
- `ROBOTICS` : robots et automatisation
- `FUTURE` : technologies émergentes
- `Toutes les actualités` : flux transversal SWAPP LIVE NEWS, sans duplication du site

Le menu principal reste celui de SWAPP. Les liens vers les tags sont rangés dans le menu **Actualité** sur ordinateur et mobile.

Les anciens liens `/tech`, `/technologies`, `/gaming`, `/ai`, `/robotics`, `/future` et `/live-news` sont des **redirections temporaires vers /actus** (avec `?tag=` lorsqu'une rubrique est déterminée). La route explicite doit précéder la route générique des chaînes pour éviter de montrer un streamer « tech ».

## Implémentation

- `assets/swapp-actus-app.js` affiche des filtres compacts `Toutes les actualités / GAMING / AI / ROBOTICS / FUTURE`, et filtre uniquement les éléments déjà publiés présents dans `/api/actus`.
- La classification utilise les champs **tags** existants des articles et accepte notamment les synonymes français IA, Robotique, Futur. Les articles historiques dépourvus de tags reconnus restent accessibles sous `GAMING` afin de ne pas masquer l'ancien catalogue.
- Chaque carte montre les tags de rubrique. La recherche existante, les catégories internes existantes, les filtres par jeu et les liens vers les lives restent en place.
- L'éditeur natif `modules/swapp-news/editor-ui.js` garde son champ tags et précise les quatre tags éditoriaux. Aucun nouveau champ de base de données, nouvelle table de catégories ou migration n'est nécessaire.
- La liste et le filtre ne lisent **que** `/api/actus` : un article supprimé ou mis en brouillon dans MySQL ne peut pas être réintroduit par le filtre.
- La ressource `index.html` utilise de nouvelles versions des scripts/styles pour écarter le cache des anciennes pages.

## Collecte et rédaction : responsabilités distinctes

Le collecteur backend de flux officiels IA/Robotique/Future peut rester actif sur Hostinger MySQL si l'environnement est configuré. Les éléments collectés sont marqués `candidate_unverified` : **ce ne sont pas des publications**. Après vérification éditoriale et rédaction, un article utilise l'architecture SWAPP native `data/swapp-veille-native-YYYYMMDD-<sujet>.json` puis le manifeste `data/swapp-editorial-releases.json`, avec `tags: ["AI"]` ou `tags: ["ROBOTICS"]` ou `tags: ["FUTURE"]` (et autres tags si pertinents).

Les contenus de jeu utilisent `tags: ["GAMING"]`. Le dossier Fable déjà présent dans le manifeste porte ce tag. Les autres jeux annoncés et les éventuels prix de précommande nécessitent une vérification officielle avant publication. Ne pas créer automatiquement des articles à partir de la seule capture du propriétaire.

Aucune dépendance à Firebase, API payante, nouveau VPS ou cron supplémentaire n'est introduite.

## Contrôles avant et après fusion

1. Tests de sélection des tags, absence de nouveaux liens principaux, validation du champ Studio.
2. Vérifier `/actus`, `/actus?tag=AI`, `/actus?tag=GAMING`, `/actus?tag=ROBOTICS` et `/actus?tag=FUTURE` sur ordinateur et mobile.
3. Contrôler les anciennes URL de rubrique : redirection 302 vers `/actus`, jamais vers une chaîne.
4. Contrôler les catégories, jeux, lives et articles actuels ; ne pas modifier les publications retirées.
5. Vérifier le déploiement réel Hostinger et son SHA. Si le quota reCAPTCHA Enterprise bloque la consultation avant Node, le problème relève de la protection externe et ne doit pas être contourné.

**La modification GitHub ne prouve pas que le site de production a adopté le code.**
