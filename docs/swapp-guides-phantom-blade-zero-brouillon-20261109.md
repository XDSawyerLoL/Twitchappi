# SWAPP Guides — Phantom Blade Zero : premiers pas, combat et progression (dossier de vérification)

**Statut :** brouillon documentaire, NON publié. **Révision :** 2026-11-09, v0.1. **Auteur :** Rédaction SWAPP. **Jeu :** Phantom Blade Zero, S-GAME Studio / S-GAME Publishing. **Plateformes confirmées :** PC Windows (Steam), PS5 selon communication éditeur relayée par la presse ; présence Epic à revalider sur une fiche officielle. **Patch PC annoncé :** 1.0302256, daté du 4 novembre 2026 sur la page Steam ; détail des changements non relu dans le billet original, donc aucune modification de mécanique attribuée à ce patch. **Date de sortie :** 28 octobre sur la fiche Steam (fuseau horaire), 29 octobre dans des sources de suivi : ne pas présenter cette divergence comme deux sorties distinctes.

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
