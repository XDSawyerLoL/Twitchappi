# SWAPP — fidélisation par utilité (octobre 2026)

## Promesse produit
Découvrir → s'informer → regarder des créateurs en direct → acheter **si offre réellement disponible** → trouver une équipe → en discuter → revenir pour une nouveauté utile.

Les membres doivent revenir pour **une raison vérifiable**, jamais parce qu'un mécanisme crée une anxiété de manquer quelque chose.

## Livré dans cette évolution
- `/mes-jeux` : accès aux jeux disposant déjà d'au moins deux publications SWAPP indépendantes et publiées.
- Bouton « Suivre ce jeu » sur l'index /jeux, les pages de jeu et les articles dont un dossier est indexable.
- Jeu suivi → articles récents vérifiés, lien vers les lives existants, SOCIAL et la boutique (pas d'offre inventée).
- Nombre de **nouveaux articles publiés après la date du suivi ou la dernière validation de lecture** ; l'utilisateur marque explicitement comme consultés.
- Accès « Mes jeux » dans le menu Compte et, une fois au moins un jeu suivi, un lien discret dans le groupe d'actions déjà présent sous la une.
- Aucun nouveau rail sur l'accueil, aucun second compte, aucun service externe.
- Stockage local volontaire par défaut ; le joueur peut désormais activer explicitement la synchronisation sur son compte SWAPP (MySQL existant). Sans consentement, aucune requête bibliothèque n'est effectuée.
- Activation : import des suivis locaux de cet appareil en fusionnant les jeux du compte, vérification d'identité, sauvegarde du consentement sur l'appareil.
- Après activation : ajout, suppression, marquage comme lu et effacement de la sélection du compte ; accès à la même bibliothèque depuis un autre appareil en activant la synchronisation, export JSON.
- Il ne s'agit ni d'un carnet d'achats ni d'une preuve de possession d'un jeu.

## Ce qu'il ne faut pas fabriquer
- Badges fictifs « 12 personnes regardent », faux commentaires, fausses économies ou fausse rareté.
- Streaks punitifs, relances quotidiennes incessantes, fenêtres de rétention intrusives, autoplay audio non consenti.
- Une vente de clé numérique tant que le distributeur B2B, les droits, le paiement, la livraison, les factures, le support et la conformité ne sont pas opérationnels.
- Une personnalisation multi-appareils sans autorisation et infrastructure sécurisée.

## Deuxième livraison (après validation production)
1. **Valider le compte SWAPP unique / jeux suivis synchronisés** sur Hostinger et iPhone/Android avec l'activation par consentement, l'export et la suppression : MySQL existant, pas de VPS.
2. **Vrais états « Disponible en vente », « Dans ma bibliothèque »** distinguant achat SWAPP, possession déclarée et suivi. Ne jamais présumer de l'achat.
3. **Événements de jeu** vérifiés : patch, sortie, événement communautaire ou nouveau live réel, pas de badge vide. Alertes strictement opt-in, choix jeu/canal, fréquence et désabonnement explicites.
4. **Salon lié au jeu** : correspondance fiable entre le dossier, les lives Twitch réellement dans ce jeu et les salons SWAPP disponibles. Une salle n'est pas affichée comme active sans signal réel.
5. **Boutique SWAPP transactionnelle** une fois le contrat B2B validé : produits et droits, clé/édition/région, paiement, facture, livraison, annulation et SAV.

## Mesurer l'utilité plutôt que le temps capté
- Première session : proportion de visiteurs ayant volontairement suivi au moins un jeu.
- Retours volontaires sur `/mes-jeux`, et accès à un nouvel article pertinent (mesures agrégées first-party, sans identifiant externe).
- Passage réel de page jeu → live correspondant → salon → boutique.
- Réussite des parcours, taux d'erreur, abandon dû au chargement, satisfaction.
- Conservation de compte à 7/30 jours uniquement avec base légale, transparence et agrégation adaptées.

Ne pas mesurer comme succès le temps inutilement passé, le défilement compulsif ou le nombre brut de notifications.

## Avant d'annoncer la mise en production
- `npm test`, `npm run check` puis `npm run verify:production`, `npm run verify:social` sur un checkout correspondant au déploiement Hostinger.
- Confirmer la migration MySQL `006_swapp_social_game_library.sql` et le statut des nouvelles tables sur le diagnostic SOCIAL.
- Avec deux comptes isolés : synchronisation explicite, changement de compte, ajout et retrait multi-appareils, export local, suppression de tous les suivis du compte, refus HTTP 401/403/409.
- Confirmer l'URL `/mes-jeux`, le bouton Suivre depuis un article et `/jeux/:slug`, l'actualisation après F5, le retrait, l'absence de faux contenu.
- Vérifier iPhone Safari, Android Chrome et desktop, cookies / localStorage désactivés, navigation clavier et lecteur d'écran.
- Deux comptes, deux réseaux réels pour valider vocal et messagerie, y compris le relais TURN si nécessaire.
- Contrôler le `/api/release` avec l'empreinte de GitHub ; ne pas confondre fusion GitHub et mise en production.
- Ne pas lancer des GitHub Actions facturées pour une simple validation.

Cette version n'a pas de notifications push ni de ventes natives. Elle inaugure la **boucle de retour fondée sur les jeux choisis** ; mesurer et fiabiliser avant de multiplier les fonctionnalités.


## Boutique : envies privées et points découverte (version 2026-10-18)
- Bouton **♡ Ajouter aux envies** sur les dossiers indexés, les articles reliés à un dossier et les dix fiches de la vitrine Steam.
- Liste de souhaits privée MySQL, rattachée au compte SWAPP, 50 titres maximum, suppression individuelle ou complète ; pas de suivi caché ni de prix fictif.
- La vitrine Steam reste datée ; la présence d'un jeu dans les envies ne signifie ni disponibilité commerciale sur SWAPP, ni prix vérifié, ni possession, ni achat.
- Points : 10 points pour le premier **nouveau** jeu suivi sur un compte SWAPP synchronisé, uniquement si SWAPP peut vérifier que ce jeu dispose d'un dossier éditorial indexable (deux publications réellement publiées) ; maximum 10 titres / 100 points à vie.
- Le crédit est atomique dans une transaction MySQL, avec verrou de compte, journal idempotent par couple utilisateur + jeu et aucun nouveau point en se désabonnant puis en se réabonnant.
- Niveaux symboliques : Découvreur (0), Éclaireur (30), Pionnier (60), Explorateur confirmé (100). Le niveau s'affiche dans **Mes jeux**.
- Aucun point pour une commande, un clic publicitaire, une connexion quotidienne, un défilement ou une activité artificielle. Pas de loteries ni remises monétaires avant décision explicite, validation du commerce et cadre juridique.
- La synchronisation initiale importe les jeux existants sans crédit rétroactif automatique, pour ne pas inciter à fabriquer des préférences locales.
- En cas d'indisponibilité de l'index éditorial, le suivi reste possible mais **aucun point n'est inventé**.
- Les API personnelles `/library/wishlist` et `/rewards/me` nécessitent un compte SWAPP actif, renvoient des réponses no-store et refusent les écritures hors origine.
- Les points sont une reconnaissance de découverte, non convertibles, sans valeur marchande, ni classement public et sans expiration ; ne pas les présenter comme des bons d'achat.

## Acceptation avant mise en production des points
- `node --test test/swapp-wishlist-rewards.test.js test/swapp-verified-rewards.test.js test/swapp-social-mysql-schema.test.js`
- Tester depuis deux comptes différents : création, retrait, 50 envies, vérification du solde séparé ; 10 nouveaux jeux maximum et aucun double crédit après retrait / re-suivi.
- Tester le repli si les articles sont indisponibles : zéro point attribué à un dossier non vérifié.
- Confirmer MySQL migration `007_swapp_wishlist_rewards.sql`, état de santé des 3 nouvelles tables et version publiée `social-wishlist-points-20261018`.
- Vérifier iPhone Safari et Android Chrome, clavier, états d'erreur inline, cache CSS/JS et affichage sans nouvelles sections de boutique.

## Espace joueur : fil éditorial personnel (suite de la PR #46)
- La page /mes-jeux expose « À lire sur tes jeux » immédiatement après son en-tête, avec jusqu'à huit articles réellement publiés. Elle prend en compte les jeux suivis et la liste de souhaits privée déjà disponible sur le compte.
- Les articles sont classés par date, avec au plus deux articles par jeu ; leurs titres et liens viennent des dossiers éditoriaux déjà publiés et indexés. Aucun appel externe ou nouveau stockage n'est nécessaire.
- Chaque article renvoie à sa page réelle. Chaque jeu renvoie au dossier qui propose déjà les lives de ce jeu, la communauté et la boutique.
- Un souhait ne devient pas un jeu suivi automatiquement. Les libellés « Dans tes envies », « Jeu suivi » et « Nouveau depuis ton suivi » sont distincts, sans simulation de présence ou de lecture.
- Si une envie issue de Steam n'a pas de dossier éditorial publié dans le catalogue de la page, le lien mène à /boutique et non à une page /jeux inexistante. Aucune disponibilité ni remise n'est affirmée.
- La mise en page est éditoriale et sans rail d'accueil ajouté. Rendu deux colonnes sur ordinateur et une colonne sur mobile, sans série quotidienne, publicité imposée ou notification non consentie.

### Vérifications requises
- Tests ciblés : node --test test/swapp-player-hub.test.js test/swapp-my-games.test.js test/swapp-wishlist-ui.test.js test/swapp-verified-rewards.test.js
- Scénarios : rien de suivi, suivre puis retirer un jeu, ajout d'envie seule, lien hors actualité ignoré, brouillon exclu, souhait sans dossier publié, navigation clavier.
- Confirmer iPhone Safari, Android Chrome, desktop, accès direct à /mes-jeux et F5. Les tests de rendu réels ne sont pas remplacés par des simulations.
- Confirmer migration MySQL 007, identité du compte SWAPP et points en production avant annonce publique. Cette évolution n'ajoute aucune migration.
- Vérifier le déploiement sur Hostinger et la version de cache 20261018-player-hub-v2. La fusion GitHub seule ne prouve pas la mise en ligne.

## Lives SWAPP natifs + Twitch dans Mes jeux (2026-10-19)
- Nouvelle section « En direct sur tes jeux » située après les actualités personnelles, uniquement sur /mes-jeux. Les deux sources sont explicites : LIVE SWAPP natif (platform oryon/swapp) et Twitch lu dans SWAPP.
- Les directs sont recherchés avec /api/discovery/game-lives, service public existant, uniquement pour des jeux éditoriaux publiés que la personne suit ou met dans ses envies. Équivalence stricte des noms de jeux, jamais de correspondance approximative avec une suite différente.
- Maximum 4 jeux analysés par lot, 8 directs affichés, au plus 3 par jeu, sans doublon de chaîne par plateforme. Priorité de présentation aux lives SWAPP natifs réellement présents, indépendamment du nombre de spectateurs.
- Le module s'active à l'apparition de la section à l'écran ; si IntersectionObserver est indisponible, les jeux choisis sont recherchés sans attendre. Pas de polling, pas de sauvegarde des chaînes regardées, actualisation et passage au lot de 4 jeux suivants sur action explicite.
- Les liens de visionnage restent internes : SWAPP natif /pseudo ; Twitch /live/twitch/pseudo?game=Jeu. Un lien contextualisé /communaute?game=Jeu ouvre les salons et joueurs réellement présents sur SOCIAL. Accès au dossier éditorial et à la Boutique SWAPP sans présenter de fausse disponibilité.
- En cas de panne des sources, afficher un état d'indisponibilité et un bouton de reprise ; ne jamais mettre une chaîne hors ligne en direct, inventer des membres ou afficher un nombre de spectateurs inexistant.
- Le sous-module SOCIAL de recherche de lives respecte lui aussi le parcours de lecture dans SWAPP et les alias officiels (GTA VI, Planet Zoo II...).
- Pas de migration MySQL, de VPS, de tâches GitHub Actions, de nouvelles dépendances ou de ventes transactionnelles.

### Recette de production
- npm test ; npm run check ; npm run verify:production, puis vérifier la section /mes-jeux et /communaute?game=...
- Deux chaînes natives SWAPP : une réellement active et une hors ligne ; deux chaînes Twitch dont un jeu proche mais différent ; un compte sans jeux suivis et un compte avec liste de souhaits.
- Contrôler la priorité des directs SWAPP, l'absence de faux lives, les liens internes, le repli de panne, l'actualisation manuelle, la pagination 4 jeux et la navigation tactile iPhone/Android.
- Vérifier les assets versionnés 20261019-live-journey-v3 et l'empreinte de la release sur Hostinger ; une fusion GitHub ne prouve pas le déploiement.
