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
