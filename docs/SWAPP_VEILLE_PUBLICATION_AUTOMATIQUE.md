# SWAPP — veille et publication automatique native, sans abonnement supplementaire

## Decisions du 21 octobre 2026
- Conserver la veille **toutes les 6 heures** pour les annonces majeures, originales, verifiees.
- Publier sur SWAPP les articles complets en francais, avec une image **reelle** du jeu, une video officielle pertinente et des sources primaires. Jamais de fausse capture generee.
- Eviter les doublons **par jeu + evenement + date + source canonique**. Si l'article existe, ne pas generer un second slug.
- Garder l'hebergement existant Hostinger et GitHub ; aucun nouvel abonnement, service IA payant, VPS, GitHub Actions facture ni cron supplementaire.
- L'image de la carte peut etre la miniature YouTube d'une bande-annonce officielle selectionnee pour ce jeu : la page conserve le credit et n'heberge pas une copie de l'image. Ne pas prendre une miniature sans lien avec l'annonce (une bande-annonce d'anime ne doit pas etre decrite comme un gameplay).
- La mise en ligne GitHub n'est **pas** une preuve de mise en ligne : controler le deploiement reel des URL et de l'API. Ne jamais annoncer une publication avant succes du controle de production.

## Flux technique

1. Verifier les actualites du jour et le catalogue public `https://swapp.tv/api/actus`. Rechercher un nouvel evenement avec sources fiables et primaires.
2. Rediger en francais les faits verifies, les limites, la date du fait, les liens primaires. Renseigner `title`, `slug`, `summary`, `body`, `game`, `games`, `tags`, `seo`, `sources`, `trailerUrl`, `publishedAt`.
3. Creer un lot JSON versionne sous `data/swapp-veille-native-YYYYMMDD-<theme>.json` au format `{"kind":"swapp-editorial-release","release":"...","articles":[...]}`. Le modele est dans `data/swapp-veille-native-20261021.json`. Un slug n'apparait que dans un seul lot.
4. Ajouter ensuite le nom du fichier a `data/swapp-editorial-releases.json`. **Creer le fichier avant de modifier le manifeste** pour que chaque commit intermediaire reste executable.
5. Le module `modules/swapp-news/router.js` affiche les articles du manifeste dans les routes publiques normales. Les images des cartes sont obtenues via `cardImageSources` : thumbnail ou image de droits confirmes, sinon miniature YouTube officielle pour le jeu.
6. En production, une premiere lecture du catalogue `/api/actus` ou du Studio lance une synchronisation **idempotente** vers la collection existante `swapp_news_articles` (Firestore). La source publique reste disponible si la base est temporairement indisponible. Le statut **stored** prime ensuite sur les fichiers : une modification ou une depublication dans le Studio ne doit jamais etre annulee par une redeployment.
7. Controler `https://swapp.tv/api/actus/release-status` : `editableCount` doit correspondre a `releaseCount`. Verifier les pages `/actus/<slug>`, la couverture, le vrai jeu, le bon trailer et la recherche de doublons. Le Studio edite ensuite le document de base via PATCH.
8. En cas d'echec de deploiement, de mauvaise image ou de statut CMS incomplet : ne pas annoncer l'article comme publie/entierement editable. Signaler le blocage precis.

## Garanties de securite
- Aucune API publique d'ecriture sans `requireEditor`, aucune cle dans GitHub, aucune elevation d'un compte par pseudo.
- La synchronisation automatique ne concerne **que** les lots editoriaux versions et deja publies par l'editeur sur GitHub ; elle n'utilise aucune URL d'actualite externe pour ecrire du contenu aveuglement.
- Une ligne Firestore preexistante, meme en brouillon ou de-publiee, n'est jamais reecrite, effacee ou republiee automatiquement.
- Les donnees MySQL de comptes et SOCIAL sont independantes : cette methode ne migre pas les comptes et ne change pas le mecanisme de stockage des articles.
- EXCEPTION VALIDEE : toute **nouvelle** publication est mise en file pour une annonce dans le salon Discord choisi par le proprietaire, via webhook prive Hostinger SWAPP_DISCORD_WEBHOOK_URL. Voir docs/SWAPP_DISCORD_AUTOPUBLICATION.md. Les articles historiques deja publies ne sont pas automatiquement republies sur Discord.
- Les autres reseaux sociaux (Twitch, X, SOCIAL, etc.) restent desactives sans connexion et autorisation distinctes.
- Le type `video` exige un trailer officiel et une validation des droits ; les articles sans videos peuvent faire une alerte au lieu d'une auto-publication.

## Activation et audit
- La reprise CMS automatique est active en `NODE_ENV=production` avec le stockage editorial configure et disponible. Les outils de test hors production ne doivent pas modifier la base.
- Verifications locales : `node --test test/news-editorial-release.test.js`, `npm run check`.
- A chaque incident de publication : comparer le SHA GitHub, l'empreinte `/api/release`, puis l'etat de `/api/actus/release-status` et le contenu reel des pages.
- Articles initiaux : Cyberpunk 2077 / Update 2.5, Crimson Desert / Charting the Unknown, Ordinary Oddness, lot du 21 octobre 2026.

## Mise à jour opérationnelle — 7 novembre 2026 (Hostinger MySQL)

Les mentions de **Firestore** dans le protocole initial du 21 octobre décrivent le fonctionnement historique. Pour la configuration Hostinger actuelle, le code de `server.js` choisit le stockage éditorial `newsStorage` à partir de `SWAPP_NEWS_BACKEND`, `SWAPP_ACCOUNT_STORE` et des variables SQL privées. Le module `modules/swapp-news/mysql-store.js` fournit les collections et transactions éditoriales sur la base MySQL existante. Aucun identifiant SQL ne doit figurer dans le dépôt.

La synchronisation via `modules/swapp-news/router.js` et `editorial-release-sync.js` adopte les nouveaux lots approuvés dans la collection `swapp_news_articles` du backend réellement sélectionné. Lorsque MySQL est actif mais que `SWAPP_NEWS_MIGRATION_VERIFIED` n'est pas à `1`, `editorial-release-selection.js` ne propose que les publications datées du **3 novembre 2026 ou après**. Un article déjà présent, y compris retiré ou en brouillon, n'est jamais écrasé. Ne pas forcer la migration des anciens lots, ni restaurer Firebase.

La catégorie `Guides` reste un article natif `contentType: article` tant qu'un type propre aux guides n'est pas déployé. Il est donc visible sur `/actus/<slug>` après adoption en production ; sa présence éventuelle dans `/guides` dépend du déploiement de la fonctionnalité du ticket #204. Le simple ajout d'un lot au manifeste n'atteste pas sa disponibilité sur le site.

**Contrôles de publication obligatoires :**
1. Vérifier `/api/actus/storage-status` : backend `mysql-hostinger` et connexion vraie, si MySQL est attendu.
2. Vérifier `/api/actus/release-status` : nouveau slug adopté et éditable, puis `/api/actus/<slug>`.
3. Ouvrir la page publique `/actus/<slug>` et confirmer texte, liens, crédits, visuel distant de la bande-annonce officielle et intégration vidéo.
4. Vérifier `/guides` séparément : HTTP 200 et présence effective du guide ; ne pas annoncer cette rubrique lancée si elle reste absente ou inaccessible.
5. En cas de 403, 404, 429 ou 503, ne pas contourner le pare-feu et ne pas annoncer le contenu comme publié ; comparer l'identité `/api/release` au commit GitHub.

**Lot de référence préparé :** `data/swapp-veille-native-20261107-where-winds-meet-guide-v23.json`, documentation et historique : `docs/swapp-guides-where-winds-meet-brouillon-20261107.md`. Bande-annonce officielle sur la chaîne du jeu, miniature distante via l'intégration YouTube existante ; aucune capture hébergée ni note fictive SWAPP Score.
