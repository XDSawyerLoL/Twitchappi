# Direction artistique SWAPP Guides — règle de référence

## Décision produit (20 novembre 2026)

Les pages `/guides` et `/guides/rob-run` doivent conserver **la même famille visuelle que SWAPP.tv** : noir profond, présence du visuel du jeu, mise en page de magazine premium, titres éditoriaux affirmés, nuances glacées très discrètes et navigation native SWAPP existante.

À éviter désormais lors de tout ajout de guide :
- « bulles » de cartes génériques : gros rectangles arrondis, petites pastilles décoratives, bordures colorées répétitives, contenus disposés comme un tableau de bord SaaS ;
- couvertures sans image ou remplacées par un simple dégradé abstrait ;
- photographies de stock, générées ou récupérées pour un autre jeu sans preuve de correspondance ;
- maquettes créées à côté de la navigation réelle, doubles menus et ruptures de typographie ;
- faux chiffres ou prétendues captures de jeu non réalisées.

## Réalisation

Le fichier `modules/swapp-guides-rob-run.js` reste une page HTML native et indexable, mais utilise désormais :
- un **hero plein format sans arrondi**, image promotionnelle ROB RUN en fond, dégradé sombre strictement destiné à la lisibilité du titre ;
- des photos **officielles des jeux concernés** ; ROB RUN : Kefir/Steam, Aion 2 : NCSOFT ;
- une liste de guides sous forme de **bandes éditoriales horizontales**, avec visuel jeu à gauche, titre, description et lien à droite ;
- des délimitations fines et sections de lecture, sans grilles de petites « cards » arrondies ;
- un article lisible, structuré en huit chapitres, avec photographie originale de l'éditeur, légendes et crédit explicite ;
- adaptation mobile où les images restent significatives et les liens accessibles, avec respect de `prefers-reduced-motion`.

Les trois entrées de `/guides` représentent des pages **réellement implémentées** : `/guides/rob-run`, `/guides/aion-2`, `/guides/choisir-communaute-gaming`. Pour le troisième guide, aucune photo de jeu factice n'est ajoutée pour remplir artificiellement une carte : la ligne typographique distingue les méthodes communautaires des guides sur un jeu précis.

## Visuels et provenance

- ROB RUN, paysage de fond officiel du jeu, Steam/Kefir : `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/4262460/dab8256c1dff89eff8f8b6d5e25327a68d8659dc/page_bg_raw.jpg?t=1793811654`
- ROB RUN, capsule officielle du jeu, Steam/Kefir : `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/4262460/eb2c70e5d9af9f4d74f36f0a60487e84b4911a39/capsule_616x353.jpg?t=1793811654`
- Aion 2, visuel officiel NCSOFT déjà utilisé dans l'académie SWAPP : `https://blogfiles.ncsoft.net/news/186b69f6-2a8d-4e72-9076-c72221de00b5.jpg`

Ces fichiers sont **appelés directement sur les CDN des éditeurs**, pas réhébergés sur Hostinger. Crédits conservés sur les pages ; droits réservés à leurs propriétaires. Si le détenteur retire un média ou interdit sa réutilisation, retirer proprement le fichier et obtenir un média autorisé, pas le remplacer par un faux visuel.

## Contrôle de qualité

`node --test test/swapp-guides-rob-run.test.js`, `npm run check`, `npm test`. Les neuf cas du guide vérifient notamment l'authenticité des chemins d'images, l'absence de cartes à bulles, les routes, le sitemap et les références.

Vérification impérative après déploiement Hostinger dans un vrai navigateur : regarder /guides et /guides/rob-run sur desktop **et mobile**, vérifier chargement réel du paysage, de la capsule et d'Aion 2, absence de titres masquant l'image, pas de coupures, pas de doublons de navigation et validation de l'en-tête personnalisé. Ne jamais confondre une PR GitHub fusionnée avec une recette visuelle de production.
