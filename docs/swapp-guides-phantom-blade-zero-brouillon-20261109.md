# SWAPP Guides — Phantom Blade Zero : premiers pas, combat et progression (dossier de vérification)

**Statut :** brouillon documentaire, NON publié. **Révision :** 2026-11-10, v0.2 (complément du 10 novembre en fin de dossier). **Auteur :** Rédaction SWAPP. **Jeu :** Phantom Blade Zero, S-GAME Studio / S-GAME Publishing. **Plateformes confirmées :** PC Windows (Steam), PS5 selon communication éditeur relayée par la presse ; présence Epic à revalider sur une fiche officielle. **Patch PC annoncé :** 1.0302256, daté du 4 novembre 2026 sur la page Steam ; détail des changements non relu dans le billet original, donc aucune modification de mécanique attribuée à ce patch. **Date de sortie :** 28 octobre sur la fiche Steam (fuseau horaire), 29 octobre dans des sources de suivi : ne pas présenter cette divergence comme deux sorties distinctes.

## Pourquoi traiter ce jeu ?
SteamDB relève un pic de **833 921 connexions simultanées le 1er novembre 2026** (instantané consulté le 9 novembre). Il s'agit de connexions Steam, ni de ventes ni du total multi-plateforme. Les chiffres d'autres agrégateurs divergent : privilégier SteamDB avec date et méthode. Un article GamesRadar du 2 novembre relaie une annonce de 4 millions de ventes par S-GAME : déclaration de l'éditeur, non audit indépendant. Une actualité de lancement existe déjà dans `data/swapp-editorial-pending-20261029.json` : **ne pas republier cette actualité**. Ce document vise un guide distinct.

## Avant de commencer : préparer son jeu
Sur PC, réserver **145 Go libres sur SSD**, et au moins **16 Go de RAM** : ce sont les exigences publiées sur Steam, non des benchmarks indépendants. Le minimum annoncé vise 1080p/30 images par seconde avec upscaling ; la configuration recommandée vise 1440p/60 avec upscaling. Tester d'abord la stabilité avant de pousser les réglages graphiques. La fiche Steam indique la prise en charge complète de manettes, recommandées par le développeur. L'interface et les sous-titres sont disponibles en français ; **pas de doublage français annoncé**. Le réglage de difficulté est officiellement indiqué parmi les options d'accessibilité : choisir un niveau permettant d'apprendre le timing, sans considérer la difficulté élevée comme une obligation.

## Combat : apprendre un échange avant de chercher une combinaison miracle
S-GAME confirme les actions fondamentales **esquive, déviation, contre-attaque et frappe**, ainsi que des enchaînements de coups. Méthode d'apprentissage recommandée, sans prétendre à une fenêtre de parade chiffrée : sur un ennemi accessible, consacrer plusieurs tentatives à observer le début et la fin de ses attaques ; essayer ensuite une seule réponse défensive à la fois ; n'attaquer qu'après avoir identifié une ouverture reproductible. Comparer esquive et déviation sur une même attaque pour comprendre les risques de chacune. Si une séquence échoue, changer un seul élément plutôt que simultanément arme, rythme et difficulté. Les valeurs de dégâts, i-frames, statistiques, consommation de ressources et commandes exactes restent **non vérifiées**.

## Progression : exploration et choix d'armes
Le descriptif officiel annonce **plus de 30 armes principales** et **plus de 20 Phantom Edges**, ainsi que passages cachés et mécanismes dans les zones. Ce sont des indications d'étendue, pas la preuve que tout est disponible dès le début. Avant de quitter une zone, regarder les embranchements accessibles et les mécanismes visibles ; ne pas promettre une récompense précise sans relevé de jeu. Lorsqu'une nouvelle arme est obtenue, la tester dans une rencontre connue afin d'évaluer sa portée et son rythme plutôt que de déduire sa puissance de sa seule rareté ou apparence. Ne pas inventer d'arbre de compétences, de matériaux d'amélioration, de points de téléportation ou de parcours de boss.

## Comprendre les systèmes sans confondre marketing et mécaniques
Le joueur incarne Soul, accusé du meurtre de son maître et engagé dans une enquête sur une conspiration ; les « 66 jours » appartiennent à la prémisse narrative. **Aucune preuve consultée ne permet d'affirmer qu'il existe un compte à rebours jouable de 66 jours**. Le terme « Phantom Edge » désigne une famille d'armes annoncée par S-GAME ; son mode d'obtention exact et ses synergies restent à tester. Les mentions « fins multiples » proviennent de tags communautaires Steam et ne suffisent pas à établir une procédure de fins alternatives.

## Erreurs à éviter
1. Confondre le chiffre de joueurs simultanés Steam avec les ventes globales.
2. Copier une « meilleure build » sans version, mesures ni preuve de test.
3. Supposer que la promesse de 66 jours implique une limite de temps réelle en jeu.
4. Traiter des conseils de combat génériques comme des données de frame précises.
5. Présenter les tags Steam comme une confirmation du développeur.
6. Réutiliser des captures, artworks ou miniatures de presse sans autorisation.

## Sources et traçabilité (consultées le 9 novembre 2026)
- **Primaire, S-GAME / Valve :** fiche officielle Steam, caractéristiques, configuration, langues, combat, armes : https://store.steampowered.com/app/4115450/Phantom_Blade_Zero/
- **Primaire à approfondir :** annonce du patch « Phantom Blade Zero — Patch Notes (Version 1.0302256) », affichée sur Steam au 4 novembre ; URL directe et contenu détaillé à récupérer avant toute assertion de changement.
- **Mesure indépendante :** SteamDB, pic simultané et date : https://steamdb.info/app/4115450/charts/
- **Corroboration presse :** GamesRadar, article du 2 novembre sur les ventes annoncées par l'éditeur : https://www.gamesradar.com/games/action-rpg/phantom-blade-zero-has-sold-4-million-copies-in-just-3-days-and-sailed-past-battlefield-6-and-marvel-rivals-on-steam-with-a-peak-player-count-of-820-000/
- **Existant SWAPP :** `data/swapp-editorial-pending-20261029.json`, actualité de lancement, non assimilable à ce guide.

## Médias et publication
**Aucun média incorporé ni droit de réutilisation validé.** Ne pas emprunter d'illustration à un article tiers. Une intégration distante d'une bande-annonce officielle n'est envisageable qu'après identification et contrôle de son URL exacte, de son contexte et de son crédit « © S-GAME ». **Ne pas créer de lot JSON ni ajouter ce document au manifeste** tant que médias, patch notes, API de production et absence de doublon dans le catalogue complet ne sont pas validés. Les routes `/guides`, `/api/actus`, `/api/actus/storage-status` et `/api/actus/release-status` étaient inaccessibles à l'outil de contrôle le 9 novembre ; aucune publication n'est attestée. Le ticket #204 est ouvert. Préserver MySQL Hostinger, sans intervention sur HLS/OBS/paiements ni note SWAPP Score.

## Historique
- **2026-11-09 — v0.1 :** création d'un dossier original de prise en main et méthode de progression, distinction des faits vérifiés et des conseils éditoriaux ; aucun lot de publication.

## Révision documentaire du 10 novembre 2026 — v0.2 (non publiée)

### Signal de priorité, avec périmètre
Le classement officiel Steam consulté le **10 novembre 2026** place Phantom Blade Zero parmi les cinq jeux les plus joués au moment de la mesure. Le classement est **instantané et limité à Steam** : il ne prouve ni une croissance quotidienne continue ni des ventes sur consoles. La fiche du jeu annonce une sortie le **28 octobre 2026** ; conserver cette date officielle, plutôt que déduire une seconde sortie du 29 octobre de fuseaux horaires différents.

### Vérifications supplémentaires utiles au lecteur
- **Accessibilité et langue :** Steam confirme interface et sous-titres français, mais pas de voix françaises. Le jeu annonce une difficulté réglable et la prise en charge complète des manettes. Avant la première session, régler sous-titres, volume et difficulté selon les besoins du joueur, plutôt que supposer un doublage disponible.
- **Installation PC :** les **145 Go sur SSD**, **16 Go de RAM** et les objectifs de performance avec upscaling sont des spécifications du développeur, pas des performances mesurées indépendamment. Prévoir une marge d'espace supplémentaire pour mises à jour et cache sans inventer de taille requise.
- **Combat :** pour progresser, travailler séparément la reconnaissance d'une attaque, la défense et la contre-attaque, puis seulement combiner les actions. S-GAME confirme esquive, déviation et contre, mais pas de fenêtre universelle en images ni de rotation optimale. Le guide doit rester un protocole d'apprentissage, pas une tier list spéculative.
- **Exploration et armes :** S-GAME annonce plus de trente armes principales et vingt Phantom Edges. Recommander de tester chaque arme obtenue dans une rencontre déjà connue pour comparer rythme et portée, sans annoncer un emplacement, un taux de butin ou une amélioration qui n'a pas été observé.
- **Patch 1.0302256 :** l'annonce du 4 novembre sur la fiche Steam confirme des changements de commandes, audio, performances, combat et corrections de bugs. **Ne pas attribuer de chiffres ou d'effets détaillés à ce correctif sans accès au texte primaire complet.** Un article d'actualité distinct existe déjà dans le manifeste éditorial du 10 novembre ; ne pas le dupliquer ni en recopier les affirmations sans contrôle.

### Divergences et blocages vérifiés
1. **Lien source à réparer avant publication :** l'URL éditeur `https://pbz.s-game.com/ko-KR/news/patch-notes-2026-11-03/`, citée dans le lot d'actualité du 10 novembre, renvoie **HTTP 404** lors du contrôle externe de ce jour. L'annonce du patch reste visible sur la fiche Steam, mais le texte détaillé et son URL canonique doivent être récupérés puis comparés avant de réutiliser les précisions de l'article.
2. **Plateformes :** la version PC Steam est vérifiée directement. La PS5 est mentionnée dans les documents SWAPP et l'article existant ; vérifier sur la fiche officielle PlayStation accessible avant de généraliser les réglages ou les instructions PC à la console. L'Epic Games Store reste non confirmé.
3. **Droits et déploiement :** aucun média supplémentaire n'est incorporé dans ce brouillon. La route publique `/guides` et les trois API `/api/actus`, `/api/actus/storage-status`, `/api/actus/release-status` n'ont pas pu être validées lors de cette exécution. En revanche, `/guides/aion-2` renvoie bien un guide public : une page AION 2 fonctionnelle ne prouve pas que l'index général ou le pipeline des nouveaux guides soit actif.
4. **Doublons :** le manifeste contient déjà `swapp-veille-native-20261110-phantom-blade-zero-patch.json` ; l'actualité de lancement figure aussi dans `data/swapp-editorial-pending-20261029.json`. Ne pas créer de nouveau lot ni publier de version « guide » avant contrôle du catalogue MySQL et des médias.

### Sources vérifiées le 10 novembre 2026
- **Valve, classement officiel Steam :** https://store.steampowered.com/charts/ — classement ponctuel, sans extrapolation multi-plateforme.
- **S-GAME Publishing, fiche officielle Steam :** https://store.steampowered.com/app/4115450/Phantom_Blade_Zero/ — date, combat, armes, langues, matériel et annonce du patch 1.0302256 du 4 novembre.
- **Contrôle indépendant :** https://steamdb.info/charts/ — classement et pic de fréquentation Steam, instantané non comparable à des ventes.
- **Existant SWAPP :** `data/swapp-veille-native-20261110-phantom-blade-zero-patch.json` (article de correctif déjà déclaré dans le manifeste, publication réelle non confirmée).

### Historique de révision
- **2026-11-10 — v0.2 :** vérification de la popularité Steam et des spécifications primaires, enrichissement des conseils de prise en main, identification d'une source officielle 404 dans le lot d'actualité et de l'impossibilité de certifier le déploiement. Statut inchangé : **brouillon, non publié**.

## Révision documentaire du 11 novembre 2026 — v0.3 (non publiée)

### Source primaire retrouvée et corrections précises
Le journal officiel S-GAME du patch **1.0302256** est accessible sur le domaine de l'éditeur : https://pbz.s-game.com/ru-RU/news/patch-notes-2026-11-03/ (URL localisée, texte anglais). Date de mise en ligne du correctif Steam : **4 novembre 2026**, build **26367565** selon SteamDB : https://steamdb.info/patchnotes/26367565/ . Cette source remplace l'URL coréenne signalée 404 dans la v0.2 ; elle ne permet pas d'affirmer que toutes les plateformes ont reçu le patch simultanément.

### Conseils utiles après le correctif, limités à ce qui est confirmé
- **Commandes PC :** « Interact / Talk » est désormais remappable au clavier et à la manette. Vérifier son assignation dans les options si une interaction semble ne plus répondre ; ne pas appliquer cette instruction à PS5 sans contrôle.
- **Démarrage PC et ray tracing :** les shaders ray tracing ne sont plus compilés systématiquement au démarrage. Après la mise à jour, une recompilation ponctuelle peut se produire pour les joueurs qui avaient désactivé le ray tracing. L'activer ultérieurement déclenche une compilation séparée au redémarrage suivant. Ne pas interpréter cette attente ponctuelle comme une régression permanente.
- **Fluidité PC :** le développeur annonce une réduction des saccades avec les manettes Bluetooth et le fonctionnement de NVIDIA Reflex en mode Auto avec V-Sync. Ce sont des correctifs annoncés, pas des gains chiffrés démontrés pour toutes les machines.
- **Combat :** Hua, Deadly Betrothed, utilise moins souvent ses prises **uniquement** aux difficultés Wayfarer et Pathbreaker. Aucune baisse généralisée de difficulté n'est établie. Les changements apportés à d'autres ennemis ne sont pas détaillés ; ne pas en déduire une nouvelle stratégie universelle.
- **Incidents après mise à jour :** S-GAME prévient que certains mods tiers sont incompatibles. En cas de crash ou de saccades, le studio recommande de retirer les mods problématiques puis, si nécessaire, de vider les fichiers du cache des shaders dans le répertoire du jeu et de relancer pour recompilation. Avant toute suppression, vérifier le chemin dans l'installation réelle et ne pas toucher aux sauvegardes.
- **Audio :** deux nouveaux curseurs règlent l'intensité du son des coups et de leur impact ; les tester pour distinguer retour sonore et efficacité réelle d'une attaque.

### Limites de publication et traçabilité
Le classement officiel Steam du **11 novembre 2026** place Phantom Blade Zero dans les cinq titres les plus joués au moment du relevé : https://store.steampowered.com/charts/ . Il s'agit d'une photographie instantanée, pas d'une preuve de croissance continue. Le dossier existant du 9 novembre est enrichi, **sans nouveau slug, sans média copié, sans note SWAPP Score**. Les API publiques /api/actus, /api/actus/storage-status, /api/actus/release-status et l'index /guides n'ont pas été vérifiables par l'outil externe le 11 novembre. Ne pas ajouter ce brouillon au manifeste éditorial ni prétendre à une publication. Les éventuelles illustrations et vidéos devront être contrôlées et créditées séparément.

**Historique :** 2026-11-11 — v0.3 : récupération d'une source primaire éditeur accessible, contrôle croisé du build, conseils techniques spécifiques et bornés au patch, maintien du statut documentaire.
