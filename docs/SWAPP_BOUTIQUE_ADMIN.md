# SWAPP Boutique — guide d'administration

La Boutique est désormais une vitrine native de SWAPP à l'adresse **https://swapp.tv/boutique**. Elle garde le menu, le thème et les comptes du site.

## Structure

- **Jeux vidéo** : trois fiches de démonstration (Clair Obscur: Expedition 33, Hades II, Kingdom Come: Deliverance II).
- **Casquettes** : deux modèles conceptuels.
- **Tapis de souris** : deux deskmat conceptuels.

La présentation utilise désormais une **véritable structure de catalogue** : grande sélection en vedette, trois rayons illustrés, grille de cartes produits (jusqu'à 4 colonnes sur ordinateur, 2 sur mobile), recherche par nom, filtres par catégorie, tri alphabétique, et URL individuelle pour chaque fiche à `/boutique/produit/:id`. La galerie permet deux vues lorsqu'elles sont renseignées.

Toutes les fiches d'exemple sont **non vendables**, sans prix ni lien de paiement. La galerie utilise désormais **de vrais visuels** : images promotionnelles officielles via le CDN Steam pour les jeux et photographies Unsplash pour les accessoires. Les photos de casquettes et de bureaux sont **des inspirations photographiques**, jamais des photographies de produits SWAPP déjà fabriqués. Aucun élément CSS ne simule plus les objets.

## Gérer la vitrine

1. Se connecter au compte SWAPP administrateur déjà autorisé pour la rédaction.
2. Ouvrir le menu du compte → **Gestion Boutique · Produits & vitrine**, ou depuis SWAPP Studio → **Gestion Boutique · Produits**.
3. Sur **/boutique/admin**, choisir une fiche, corriger son nom, sa description, son rayon, son image principale (obligatoire pour toute fiche visible), sa deuxième photo facultative et son statut, et éventuellement un prix EUR indicatif pour un produit réel. L'aperçu doit montrer la photo attendue, sans erreur de chargement. Le bouton **Appliquer à la liste** prépare le changement, mais ne le publie pas.
4. Cliquer **Enregistrer sur SWAPP** pour publier les fiches visibles. **Ouvrir la vitrine** permet de contrôler le rendu.
5. Les flèches permettent de changer l'ordre des produits dans un rayon. La case **Visible sur la Boutique** masque une fiche sans la supprimer.

Pour une **vraie référence**, désactiver la case Démonstration, renseigner le nom du marchand, une vraie image utilisable et son URL HTTPS. Le lien extérieur sera alors affiché sur la fiche produit ; un prix facultatif saisi par l'administrateur apparaîtra avec la mention « prix indicatif, à confirmer chez le marchand ». Les démos ne reçoivent jamais de prix par défaut. Cocher « Lien affilié » uniquement pour un lien réellement rémunéré. La Boutique ne réalise aucun achat ni traitement de carte bancaire.

## Stockage et sécurité

- Le catalogue partagé utilise une seule fiche `swapp_shop/catalog_v1` dans **la base Firestore déjà connectée au site** : aucune nouvelle infrastructure ni tâche GitHub Actions.
- Les sept démos sont dans `data/swapp-shop.json`. Tant qu'aucun catalogue n'a été enregistré, le serveur les montre par défaut. Une fois un catalogue publié, seules les fiches sauvegardées sont affichées.
- Les écritures exigent **la session administrateur SWAPP**, ou une clé autorisée par le système rédactionnel existant ; l'en-tête `x-swapp-editor: 1` et l'origine sont vérifiés. Aucun rôle basé uniquement sur un pseudo.
- Les sauvegardes utilisent une **révision transactionnelle** ; deux administrateurs ne peuvent pas écraser sans avertissement la même version. Les valeurs sont validées côté serveur (catégorie, longueur, identifiants uniques, URL HTTPS, prix EUR positif facultatif).
- En cas d'indisponibilité de Firestore : la vitrine reste disponible avec les exemples, mais l'éditeur refuse de prétendre avoir enregistré. L'utilisateur reçoit une erreur.
- Le futur passage éventuel à MySQL Hostinger nécessite une migration explicite de `swapp_shop/catalog_v1` ; ne pas désactiver l'ancien stockage avant vérification.
- Le chemin `/boutique/admin` est protégé et exclu des robots. Les fiches de démonstration comportent également une instruction noindex. Aucun paiement, panier, stock ou livraison n'est simulé.


## Provenance des images de démonstration

- **Clair Obscur: Expedition 33**, **Hades II** et **Kingdom Come: Deliverance II** : visuels des fiches officielles Steam (Steam CDN, respectivement les applications 1903340, 1145350 et 1771300). Ces œuvres promotionnelles appartiennent à leurs ayants droit ; avant une activité commerciale, vérifier les autorisations de réutilisation et remplacer si nécessaire par les médias autorisés fournis par l'éditeur ou le marchand.
- **Casquette noire, casquette graphique** : photographies Unsplash des contributeurs Julian Faist et 420 FourTwoO.
- **Deskmat noir, deskmat bureau** : photographies Unsplash de Muhammet SAIN et Kofi Nartey.
- **Licence photographique** : https://unsplash.com/license (utilisation possible dans une vitrine commerciale selon les conditions ; les marques/produits reconnaissables nécessitent leur propre vérification). Photos sources : https://unsplash.com/photos/IVb43vObfMA , https://unsplash.com/photos/BIr8rxlnD1s , https://unsplash.com/photos/8e9KCdOj29o , https://unsplash.com/photos/X2ZYZZnfm9U .
- Les URLs actuelles sont **distantes**, pas des fichiers hébergés par SWAPP. Leur affichage dépend de leur disponibilité. Pour la boutique définitive, privilégier des photos de produits réels dont le vendeur autorise l'hébergement sur Hostinger.
- Un catalogue administrateur déjà sauvegardé avec les anciens sept exemples peut être mis à niveau automatiquement pour ces identifiants **uniquement si la fiche est encore marquée Démonstration et sans image**. Les modifications et photos choisies par l'administrateur ne sont pas remplacées.
- Une fiche visible sans URL HTTPS d'image est refusée à la sauvegarde. Les anciennes fiches qui n'ont pas de visuel ne sont pas montrées au public. Le navigateur donne un aperçu pour vérifier manuellement que l'image charge.

## Déploiement

La connexion GitHub → Hostinger existante doit déployer les commits de `master` sans workflow GitHub Actions. Vérifier ensuite `/boutique`, le compte administrateur et `/boutique/admin`. Pour un contrôle global, utiliser `npm run verify:production` à partir du checkout déployé. La réussite d'un commit GitHub ne prouve pas à elle seule le rendu en production.
