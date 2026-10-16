# SWAPP Boutique — guide d'administration

La Boutique est désormais une vitrine native de SWAPP à l'adresse **https://swapp.tv/boutique**. Elle garde le menu, le thème et les comptes du site.

## Structure

- **Jeux vidéo** : trois fiches de démonstration (Clair Obscur: Expedition 33, Hades II, Ghost of Yōtei).
- **Casquettes** : deux modèles conceptuels.
- **Tapis de souris** : deux deskmat conceptuels.

Toutes les fiches d'exemple sont **non vendables**, sans prix ni lien de paiement. Les illustrations graphiques sont produites localement par CSS jusqu'à la fourniture d'images autorisées. Aucune image du jeu ou photographie de produit n'est présentée comme authentique sans accord.

## Gérer la vitrine

1. Se connecter au compte SWAPP administrateur déjà autorisé pour la rédaction.
2. Ouvrir le menu du compte → **Gestion Boutique · Produits & vitrine**, ou depuis SWAPP Studio → **Gestion Boutique · Produits**.
3. Sur **/boutique/admin**, choisir une fiche, corriger son nom, sa description, son rayon, son image et son statut. Le bouton **Appliquer à la liste** prépare le changement, mais ne le publie pas.
4. Cliquer **Enregistrer sur SWAPP** pour publier les fiches visibles. **Ouvrir la vitrine** permet de contrôler le rendu.
5. Les flèches permettent de changer l'ordre des produits dans un rayon. La case **Visible sur la Boutique** masque une fiche sans la supprimer.

Pour une **vraie référence**, désactiver la case Démonstration, renseigner le nom du marchand et son URL HTTPS. Le lien extérieur sera alors affiché. Cocher « Lien affilié » uniquement pour un lien réellement rémunéré. La Boutique ne réalise aucun achat ni traitement de carte bancaire.

## Stockage et sécurité

- Le catalogue partagé utilise une seule fiche `swapp_shop/catalog_v1` dans **la base Firestore déjà connectée au site** : aucune nouvelle infrastructure ni tâche GitHub Actions.
- Les sept démos sont dans `data/swapp-shop.json`. Tant qu'aucun catalogue n'a été enregistré, le serveur les montre par défaut. Une fois un catalogue publié, seules les fiches sauvegardées sont affichées.
- Les écritures exigent **la session administrateur SWAPP**, ou une clé autorisée par le système rédactionnel existant ; l'en-tête `x-swapp-editor: 1` et l'origine sont vérifiés. Aucun rôle basé uniquement sur un pseudo.
- Les sauvegardes utilisent une **révision transactionnelle** ; deux administrateurs ne peuvent pas écraser sans avertissement la même version. Les valeurs sont validées côté serveur (catégorie, longueur, identifiants uniques, URL HTTPS).
- En cas d'indisponibilité de Firestore : la vitrine reste disponible avec les exemples, mais l'éditeur refuse de prétendre avoir enregistré. L'utilisateur reçoit une erreur.
- Le futur passage éventuel à MySQL Hostinger nécessite une migration explicite de `swapp_shop/catalog_v1` ; ne pas désactiver l'ancien stockage avant vérification.
- Le chemin `/boutique/admin` est protégé et exclu des robots.

## Déploiement

La connexion GitHub → Hostinger existante doit déployer les commits de `master` sans workflow GitHub Actions. Vérifier ensuite `/boutique`, le compte administrateur et `/boutique/admin`. Pour un contrôle global, utiliser `npm run verify:production` à partir du checkout déployé. La réussite d'un commit GitHub ne prouve pas à elle seule le rendu en production.
