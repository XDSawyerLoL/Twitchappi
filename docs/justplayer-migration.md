# JustPlayer → SWAPP : migration du catalogue

## Statut (14 octobre 2026)

Le catalogue `data/justplayer-public-catalog.json` contient **12 publications repérées et vérifiées sur les pages publiques** : **11 articles** et **1 publication vidéo Fourthwall**. Ce n'est **pas un export exhaustif** du compte Fourthwall. Aucune publication n'a été copiée dans Firestore ni publiée sur SWAPP ; ce travail nécessite les corps complets et un accès en écriture au CMS après déploiement et validation.

La liste actuelle, incomplète, a été constituée depuis https://justplayer.fr/supporters et des URLs individuelles publiques. Les articles d'avant janvier 2026, les pages non indexées, les éléments réservés aux abonnés, les vidéos et les images originales ne sont pas tous couverts. Ne pas supprimer JustPlayer/Fourthwall avant une réconciliation du nombre exact de posts dans son tableau de bord.

## Fonctionnement du convertisseur

1. Obtenir, depuis Fourthwall en tant que propriétaire, **un export contenant le texte intégral** de chaque publication. Si aucun export de posts n'est offert par l'interface, établir une extraction autorisée depuis l'accès propriétaire plutôt que d'inventer les textes manquants.
2. Enregistrer les publications dans un fichier JSON UTF-8. Format accepté : un tableau, ou `{ "posts": [...] }`, `{ "articles": [...] }`, `{ "data": { "posts": [...] } }`.
3. Une publication doit contenir : `title`, `body` (texte ou HTML), `legacyUrl` (URL publique numérique `https://justplayer.fr/supporters/posts/12345`), `publishedAt` (date réelle), et éventuellement `summary`, `author`, `category`, `sources`, `image: {url, credit, rights}`. L'image non attestée est exclue avec un avertissement ; elle n'est pas implicitement libre de droits.
4. Tester localement, sans écriture de production :

    `node tools/justplayer-import.js --input justplayer-export.json --catalog data/justplayer-public-catalog.json --out migration-resultat`

    `report.json` donne le nombre d'articles acceptés, rejetés, répétés et manquants. Les fichiers `batch-001.json`, etc. contiennent au plus 20 brouillons par lot, toujours en mode `dryRun:true`.

5. **Après installation et contrôle des sauvegardes du CMS sur SWAPP**, vérifier en lecture seule :

    `SWAPP_BASE_URL=https://swapp.tv SWAPP_ADMIN_KEY=<secret-configure-hors-commande> node tools/justplayer-import.js --input justplayer-export.json --catalog data/justplayer-public-catalog.json --send`

    Ne pas mettre le secret dans le dépôt ou les logs : fournir les variables par le gestionnaire de secrets de l'environnement.

6. Pour réellement insérer les **brouillons** uniquement, répéter avec `--send --commit` après lecture du rapport et validation des sauvegardes. **Aucune publication ou diffusion sociale ne peut être déclenchée** par cet outil. Toute publication passe séparément par le studio SWAPP, après vérification des droits et de la fidélité du contenu.

## Conventions de migration

- Conserver les dates de publication d'origine, les auteurs, les URL d'origine et les sources ; ne pas ajouter un article factice pour combler un manque.
- Prévenir les doublons par `legacyUrl` et `slug`. La route import SWAPP a en plus une clé de migration Firestore, de sorte qu'un envoi répété n'efface pas un article existant.
- Les vidéos Fourthwall requièrent un adaptateur distinct avec média autorisé et légende ; elles sont **signalées comme manquantes**, jamais silencieusement transformées en articles.
- Le système de publication sociale et son outbox restent en pause.
- Lors de la bascule, garder JustPlayer en lecture seule jusqu'à vérification du compte total, des images, des URL canoniques et des redirections (à configurer sur Fourthwall si possible).

## Limites connues

Le convertisseur transforme une description HTML simple en texte lisible avec titres/listes de base ; les images, légendes, embeds, vidéos et mise en page complexes demandent une passe média. L'extraction publique par URL seule n'est pas déclarée fiable ou exhaustive. Les brouillons peuvent avoir besoin d'un contrôle éditorial des sources avant publication.

## Collecte directe des articles publics (option supplémentaire)

`node tools/justplayer-import.js --fetch-public --catalog data/justplayer-public-catalog.json --out migration-publique`

L'outil tente de lire la page HTML de chaque URL vérifiée, mais n'extrait un article que lorsque le corps complet apparaît dans un bloc `article` ou dans un objet JSON-LD Article/BlogPosting. Il refuse les pages de connexion, les contenus incomplets et les formats qu'il ne sait pas interpréter. Le rapport recense chaque échec et les vidéos exclues. Ce mode **n'assure pas l'exhaustivité**, notamment si Fourthwall change le HTML, charge le texte en JavaScript ou impose un accès privé. Il ne contourne aucune restriction.