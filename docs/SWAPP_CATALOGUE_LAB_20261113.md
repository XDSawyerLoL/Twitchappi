# SWAPP — catalogue immersif de test (13 novembre 2026)

## Accès et périmètre
- URL de test : `/catalogue-test`, uniquement après déploiement du commit sur Hostinger.
- La page n'apparaît **ni dans le menu, ni dans le sitemap**, et répond `noindex,nofollow,noarchive` avec une politique `Cache-Control: private, no-store`.
- Aucun remplacement des routes `/categories`, `/decouvrir`, `/actus` ni du lecteur HLS/OBS. Retour permanent au catalogue existant sur la page.
- Navigation principale de SWAPP : casse **visuellement uniforme en capitales** sur ordinateur et mobile, libellés accessibles d'origine inchangés.

## Présentation
- Expérience de navigation inspirée du catalogue de streaming illustré : rail latéral, grande mise en avant visuelle, recherche, catégories horizontales, aperçu au survol ou au focus, fiches détaillées et actions.
- Sources **réelles uniquement** : `GET /api/discovery/home-lives?limit=12&lang=fr`, `GET /api/twitch/streams/top?limit=40&lang=fr` et `GET /api/categories/top`. Recherche approfondie d'un jeu uniquement à l'ouverture de sa fiche : `/api/discovery/game-lives?game=...`.
- Les cartes distinguent clairement direct SWAPP, Twitch, jeux, petites communautés (≤ 50 spectateurs) et favoris. Si les flux sont indisponibles, la page affiche un état vide ou partiel, sans vignettes de faux streamers.
- Les descriptions des jeux sont éditées localement pour des titres connus ; les autres affichent « Présentation éditoriale à compléter » plutôt que des données inventées.
- Prévisualisation : survol/focus = **affiche mise à jour à partir de la vraie miniature** ; la vidéo Twitch muette ne se charge **que sur clic** via un iframe avec parent du domaine courant. Pour un live natif sans miniature vidéo, le lien « Regarder » mène au vrai lecteur SWAPP.
- Aucun lecteur supplémentaire créé en arrière-plan et aucun flux HLS changé.

## Favoris et persistance
- Jeux : contrôles `data-swapp-follow-game` gérés par **`assets/swapp-my-games.js`** et sa clé locale `swapp:followed-games:v1`, avec synchronisation MySQL de l'existant *seulement si elle était déjà activée*.
- Créateurs : même stockage local `oryon_v4_likes` utilisé par l'ancienne exploration Oryon V4. Les abonnements aux chaînes **ne sont pas** des abonnements Twitch/SWAPP distants. Un favori hors ligne ne compte pas dans les directs affichés.
- Accès aux lives via les routes natives `/live/twitch/:login` et `/:login`, jamais une redirection implicite vers Twitch.

## Fichiers / validation
- Serveur : `modules/swapp-catalogue-lab.js`, route enregistrée dans `server.js` avant le catch-all des créateurs.
- Front : `assets/swapp-catalogue-lab.js`, `assets/swapp-catalogue-lab.css`.
- Tests Node : `node --test test/swapp-catalogue-lab-20261113.test.js test/swapp-flat-navigation-20261113.test.js`.
- E2E navigateur après déploiement : `npx playwright test e2e/swapp-catalogue-lab.spec.cjs` avec données d'API interceptées, pour éprouver l'affichage, les prévisualisations, les boutons, les favoris, le mobile et l'absence de débordement.
- Les fichiers sont pris en compte par `tools/swapp-release.js` pour différencier la version réellement déployée.
- Les tests logiques isolés ont été exécutés et passent ; **ne pas affirmer que l'E2E ou le déploiement Hostinger ont été vérifiés avant leur exécution effective**.

## V2 cinéma : rendu « simili Netflix » — 13 novembre 2026

- L'ancienne disposition de laboratoire en deux colonnes est remplacée par une **navigation contextuelle horizontale compacte** sous le menu principal SWAPP (qui reste unique, uniforme, en majuscules).
- L'affiche principale passe **bord à bord**, sans encadrement, avec dégradés cinéma, grande typographie et défilement de **1 à 6 sélections réellement issues des flux**. Une source SWAPP illustrée est prioritaire ; les sources non disponibles ne produisent ni faux héros ni faux visuels.
- Les sélections disposent de boutons précédent/suivant, de points accessibles au clavier et d'un défilement automatique lent. Ce dernier se suspend si l'utilisateur interagit, si la page est masquée, si une fiche est ouverte ou si l'utilisateur préfère moins d'animations.
- Les rails **chevauchent légèrement** le bas de la grande affiche. Les vignettes se rapprochent de véritables affiches : repos = visuel dominant avec titre ; survol ou focus = zoom contenu, résumé et actions (Regarder, prévisualisation, favoris, détails) sans quitter la page.
- Sur ordinateur **seulement**, une vraie vignette Twitch avec image peut déclencher **un unique lecteur muet** après 1 250 ms de survol délibéré. Il est retiré sur départ du pointeur, déplacement, changement d'onglet, ouverture de fiche ou navigation. Pas de vidéo automatique sur mobile, connexion économiseur de données ou préférence d'animation réduite. Les lives natifs restent en vignette sans prétendre disposer d'un lecteur miniature HLS.
- Sur mobile / écran tactile, les actions et résumés restent **directement visibles** et les vignettes ne se dilatent pas au survol. Aucune interaction ne dépend exclusivement d'un pointeur.
- Les dialogues sont reliés à un véritable titre `aria-labelledby`, contrairement à la première version.
- Versionnement CSS/JS actualisé : `20261113-cinema-v2`, sans toucher au catalogue public `/categories`.
- Tests dédiés : `test/swapp-catalogue-cinema-20261113.test.js` (navigation du carrousel, sources réelles, comportement d'aperçu, fermeture, accessibilité, responsive). Scénario E2E `e2e/swapp-catalogue-lab.spec.cjs` actualisé mais **son exécution réelle reste nécessaire**.
- Ne pas affirmer que le rendu navigateur ou la production Hostinger ont été vérifiés tant que les tests E2E n'ont pas été exécutés sur la nouvelle version.

## V3 accueil : rail d'articles natifs — 13 novembre 2026

- Le laboratoire `/catalogue-test` ajoute **À la une sur SWAPP** entre le héros cinématographique et les rails de directs : `#scl-articles` avec défilement horizontal, lien « Toutes les actualités », recherche globale et onglet de filtre « Articles ».
- Source unique : `GET /api/actus`, la **liste d'articles publiés et vérifiés par le CMS MySQL**. Aucun RSS non vérifié, article inventé, duplication éditoriale ni URL d'éditeur utilisée comme destination de carte.
- Lien de lecture : exclusivement `/actus/<slug>`. Bouton **Partager** indépendant : partage natif quand disponible, sinon presse-papiers et champ sélectionnable en dernier recours. Jamais de confirmation mensongère de copie.
- Médias : `SwappArticleExtras.cardImageSources` déjà employé par le magazine officiel, avec filtre HTTPS ; fallback visuel SWAPP si l'illustration officielle est absente ou cassée. Aucun visuel fabriqué.
- API Actus et flux live/jeux sont chargés **en parallèle indépendamment** : une panne/lenteur CMS ne bloque pas les directs, et une panne live n'empêche pas de lire les articles.
- Mobile, clavier et réduction des animations pris en compte ; partage et ouverture de carte utilisables sans survol.
- Ressources versionnées `20261113-actus-rail-v3`. **Aucun remplacement de la page d'accueil `/` ou de `/categories`** : le test reste volontairement non indexé jusqu'à validation navigateur.
- Tests isolés : `test/swapp-catalogue-article-rail-20261113.test.js` et régressions cinéma/laboratoire/navigation ; E2E Playwright étendu au partage sans navigation et au filtre Articles, **non exécuté** sur navigateur réel avant déploiement.

### Candidature à la future page d'accueil

Ordre testé : affiche du moment → articles SWAPP → directs → univers de jeux → petites communautés → Ma liste. La migration vers `/` devra être une décision distincte, après validation des performances mobiles, du comportement réel des médias et de la qualité des publications.


## V4 : validation du catalogue comme accueil public (13 novembre 2026)

**Décision utilisateur** : promouvoir le catalogue cinéma / actualités / lives sur `/`.

- `/` rend désormais `modules/swapp-catalogue-lab.page({publicHome:true})` avec balise canonical SWAPP, titre/description orientés accueil, menu « Accueil » actif, balise de vérification Google et chargeur AdSense existants. Les liens Mentions légales, Confidentialité, Cookies, CGU et Contact restent accessibles depuis le pied de page.
- La SPA historique n'est **pas supprimée** : `/?classic=1` la sert toujours, avec `X-Robots-Tag: noindex, nofollow`. Si le module du catalogue échoue au démarrage, la route `/` utilise automatiquement l'ancien `sendSwappUi`.
- `/catalogue-test` reste non indexable et garde les outils expérimentaux. L'URL de test n'entre pas dans le menu.
- Le menu SPA redirige physiquement tout clic « Accueil » ou logo vers `/` ; aucune redirection silencieuse vers l'ancien `setView('home')`.
- Le rail **Petites communautés à découvrir** ne filtre plus uniquement les lives déjà classés en « populaires ». Il interroge indépendamment `/api/oryon/discover/find-live?mood=petite-commu` et `/api/twitch/streams/small`, plus les vrais directs SWAPP récupérés par le premier rail. Il affiche en priorité les chaînes de ≤50 spectateurs, puis élargit à ≤150 si moins de quatre chaînes de 50 spectateurs ou moins sont disponibles. La valeur max est explicitement affichée. Aucun faux live ou audience n'est généré. Si aucun direct n'est confirmé, un lien de découverte mène à `/decouvrir` au lieu d'une impasse.
- **Ancien bandeau éditorial d'accueil déplacé sur ACTUS** : la liste `/actus` affiche désormais, au-dessus du magazine, un grand visuel de la publication illustrée la plus récente avec titre, résumé et liens natifs « Lire l'article » / « Découvrir les directs ». Même hiérarchie visuelle et classes `swapp-home-hero-feature` / `swapp-home-feature-links` que le précédent accueil. Repli visuel SWAPP si aucun article publié/illustré n'est disponible.
- Versions des assets : `20261113-public-home-small-v4` (catalogue), `20261113-relocated-feature-v2` (ACTUS), `20261113-home-router-v2` (navigation SPA).
- Vérification de déploiement dans `tools/swapp-deploy-smoke.js` : `/` doit être l'accueil immersif indexable ; `/catalogue-test` doit rester noindex et la SPA classique doit rester disponible à `/?classic=1`. Les contrôles historiques de l'accueil classique passent sur cette URL.
- Tests unitaires isolés : `test/swapp-home-promotion-small-actus-20261113.test.js`. E2E Playwright : `e2e/swapp-public-home-small-actus-20261113.spec.cjs`. **Le navigateur réel et le déploiement Hostinger nécessitent toujours une vérification sur la version publiée.**

## V5 : audiences fiables et livraison Hostinger contrôlée (13 novembre 2026)

- Une audience absente ou invalide ne devient plus zéro spectateur dans le catalogue. Un compteur connu de 0 reste valable ; une audience inconnue affiche « Audience indisponible » et ne peut pas être présentée comme petite communauté confirmée.
- Nouveau cache-busting JS : `20261113-public-home-audience-v5`. CSS inchangé, `20261113-public-home-small-v4`.
- GitHub Actions manuel « SWAPP quality gate » intègre la syntaxe et les tests du catalogue, de l'accueil et de la navigation. Aucun déclenchement récurrent, aucun secret SSH/FTP ou API payante nécessaire.
- Après réussite, le workflow assemble le ZIP Hostinger depuis le commit exact contrôlé et l'attache comme artefact téléchargeable durant 7 jours. Télécharger l'artefact, extraire le ZIP intérieur et déposer son contenu à la racine de l'application Node Hostinger existante ; conserver variables d'environnement et stockage persistant, redémarrer Node, puis exécuter `npm run verify:production`.
- Le workflow ne déploie pas sur Hostinger : la fusion GitHub ne suffit pas pour valider la production.
