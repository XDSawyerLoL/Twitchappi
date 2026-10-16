# SWAPP — affiliation Instant Gaming

## Configuration

Référence du propriétaire SWAPP : `SANSAHD`. Lien original fourni : [Instant Gaming avec référence](https://www.instant-gaming.com/?igr=SANSAHD).

Le catalogue partagé `assets/swapp-instant-gaming.js` contient uniquement des **fiches jeux identifiées sur instant-gaming.com**, correspondant à des articles SWAPP :
- Valor Mortis — https://www.instant-gaming.com/fr/20157-acheter-valor-mortis-pc-steam/
- Planet Zoo 2 — https://www.instant-gaming.com/fr/21064-acheter-planet-zoo-2-pc-steam/
- 007 First Light — https://www.instant-gaming.com/fr/22735-acheter-007-first-light-pc-steam/
- CODE VEIN II — https://www.instant-gaming.com/fr/19500-acheter-code-vein-ii-pc-steam/

La référence `?igr=SANSAHD` est ajoutée aux URL des fiches. **Le site Instant Gaming et les outils web ne permettent pas ici de certifier que l'attribution des commissions fonctionne sur les liens profonds.** Avant de compter sur les revenus, vérifier auprès du programme partenaire Instant Gaming, puis contrôler les clics et commandes attribués dans le tableau de bord de l'affilié. Si le programme impose un format différent, modifier la fonction `offer()` et les tests.

## Expérience de lecture

- Un seul lien commercial par article correspondant à un jeu exact, en bas de « À découvrir ensuite ».
- Si l'article a déjà des liens commerciaux éditoriaux, ne pas ajouter un deuxième encart Instant Gaming.
- Aucune annonce pour les articles dont le jeu n'est pas répertorié, aucune proposition de suite/édition différente par approximation.
- Sur mobile, la même zone est repliable. Les liens sont de vrais liens externes avec `rel=sponsored nofollow noopener noreferrer`.
- Libellé **PARTENAIRE · LIEN AFFILIÉ** et mention du possible paiement d'une commission.
- Aucun prix, pourcentage de réduction, fausse promotion ou fausse disponibilité. Les fiches précisent plateforme/région ; vérifier avant achat.

## Boutique

**L'affiliation Instant Gaming est strictement réservée aux articles d'Actualité.** La page Boutique n'utilise ni les jeux du catalogue affilié ni le paramètre `igr=SANSAHD` automatiquement. Elle affiche uniquement les produits explicitement fournis au module `shop(products)` depuis le catalogue propriétaire SWAPP (`data/swapp-shop.json`). Si aucun produit n'est configuré, elle indique que sa sélection est en préparation. Pas d'API payante ni de récupération de prix côté serveur.

## Ajouter un jeu

1. Trouver la **vraie fiche Instant Gaming**, vérifier jeu, édition, plateforme et **région**. Éviter un jeu au même nom ou un DLC différent.
2. Ajouter un objet avec ID unique, titre, alias exacts, chemin relatif produit et plateforme dans `assets/swapp-instant-gaming.js`.
3. Mettre à jour `test/swapp-instant-gaming-affiliate.test.js`, vérifier la référence et l'absence de lien pour les autres jeux.
4. Vérifier sur SWAPP ordinateur/mobile et effectuer un test de suivi partenaire avant de promouvoir le lien.

Les coûts et résultats commerciaux restent à mesurer. **Ne pas présenter l'affiliation comme un partenariat officiel ou une rémunération garantie.**
