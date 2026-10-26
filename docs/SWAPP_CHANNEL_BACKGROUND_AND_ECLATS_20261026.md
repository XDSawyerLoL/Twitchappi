# SWAPP — Fond de chaîne personnalisable et Éclats (26 octobre 2026)

## Fond et ambiance : fonctionnalité codée

Dans **Gérer ma chaîne → Fond & ambiance** ou le gestionnaire propriétaire, le créateur peut :
- importer une image personnelle JPG, PNG ou WebP (jusqu'à 12 Mo à l'import), compressée en navigateur en WebP (moins de 1,05 Mo) puis enregistrée dans la table MySQL d'images de panneaux déjà utilisée par SWAPP ;
- choisir un des trois fonds gratuits sans image : **Nébuleuse**, **Aurore** et **Brasier** ; ou aucun fond ;
- régler intensité de 0 à 70 %, flou de 0 à 20 px, position X/Y, remplissage ou affichage complet et couleur d'accent ;
- voir immédiatement une prévisualisation, **Publier**, Annuler ou Retirer le fond ;
- vérifier après le POST que le GET public du profil renvoie **exactement** les réglages enregistrés. Pas de fausse notification de publication.

Le serveur stocke `channel_theme` dans le **compte propriétaire persistant** à travers le POST `/api/oryon/profile`. L'image est référencée via `/api/oryon/panel-image/<login>/<hash>` et accessible publiquement uniquement si ce hash appartient au fond ou aux panneaux de ce compte. Aucun `data:` URL public, URL externe ou image d'un autre compte n'est acceptée comme fond sauvegardé.

La bannière et le visuel hors ligne restent séparés et inchangés. Pendant un vrai direct, l'en-tête est limité à ~190 px sur desktop et 175 px sur mobile ; hors ligne, l'image de chaîne reste plus ample. Le lecteur et le tchat conservent leurs propres dimensions 16:9 et géométrie stable.

Les commandes propriétaires, notamment « Modifier le direct », utilisent leurs **boutons existants déplacés dans « Gérer ma chaîne »**, sans casser leurs actions. Les deux actions publiques « Suivre » et « Notifications » restent visibles si elles sont disponibles.

## Éclats : infrastructure sécurisée, MONÉTISATION NON ACTIVÉE

`Éclats ✦` est le nom de travail de la monnaie de soutien créateur, **distincte des pts de chaîne gratuits**.

Les Éclats ont vocation à être achetés avec de vrais euros puis dépensés pour soutenir un streamer, déclencher des animations/alertes et obtenir éventuellement des badges de soutien. Les points de chaîne resteront gratuits et non convertibles en euros.

Ce lot fournit :
- le module `modules/swapp-eclats.js` et `GET /api/swapp/eclats/status`, lequel renvoie explicitement `purchasable:false`, `spendable:false` et `available_balance:null` ;
- le schéma SQL des portefeuilles, événements de paiement et soutiens de créateurs (non initialisé tant qu'aucun prestataire n'est connecté) ;
- une fonction d'encaissement transactionnelle **non exposée en HTTP**, qui exige un vérificateur de paiement et un événement de règlement final en EUR, et refuse tout événement dupliqué.
- aucun service payant, checkout, carte bancaire enregistrée ou portefeuille fictif.

**À finaliser avant le lancement effectif :** montant TTC des packs d'Éclats, valeur économique, part nette du créateur, frais de plateforme/paiement, CGV, rétractation et remboursements, flux litiges/chargebacks, vérification d'identité/KYC des créateurs, prestataire de versement, webhooks signés et tests de remboursement/antifraude. L'intégration d'un prestataire comme Stripe Connect n'est **pas gratuite pour les transactions** selon son modèle tarifaire ; l'hébergement Hostinger existant reste l'option cible. Ne pas afficher « Acheter » avant la finalisation.

## Vérification technique

Les tests `test/swapp-channel-atmosphere.test.js` et `test/swapp-eclats.test.js` couvrent les images propres au créateur, la persistance côté profil, les options de fond, la non-régression des dimensions vidéo/chat, la monnaie désactivée, les vérifications de règlement et l'anti-doublon.

Avant une fusion en production, exécuter `node --test test/swapp-channel-atmosphere.test.js test/swapp-eclats.test.js` puis `npm test` localement **sans Actions payantes**, ainsi qu'un vrai test navigateur Windows/iOS/Android, et la publication/rechargement d'une image sur deux sessions distinctes.

Un redéploiement Hostinger peut redémarrer Node. Éviter le déploiement durant un direct OBS critique.
