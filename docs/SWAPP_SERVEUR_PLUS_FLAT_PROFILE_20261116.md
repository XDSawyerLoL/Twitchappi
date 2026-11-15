# SERVEUR + — fiche éditoriale sans cartes imbriquées (16 novembre 2026)

## Demande
L'utilisateur constate trop de « bulles » dans la fiche serveur : les informations pratiques ont chacune leur panneau sombre, les sections sont enfermées dans de grands cadres arrondis, les créateurs associés sont reconditionnés dans des petites cartes, et la sidebar comporte une deuxième boîte uniquement pour le partage.

## Modifications
- **Sections principales** : présentation, recherche de joueurs, lives associés, informations pratiques, activité, avis et FAQ deviennent des sections éditoriales à fond transparent et lignes de séparation discrètes. Pas de carte arrondie autour de chaque section.
- **Informations pratiques** : liste sémantique `dl/dt/dd` conservée, présentée sur deux colonnes de lignes simples (une colonne sur mobile) avec une seule séparation horizontale par information. Ne répète plus les votes, clics ou avis affichés dans leurs sections dédiées.
- **Lives et joueurs** : créateurs, lives vérifiés et participants à la recherche de groupe s'affichent en lignes sans arrière-plans individuels ; les actions utiles restent accessibles. La note sur l'absence de preuve de live est abrégée et placée après les créateurs.
- **Colonne latérale** : caractéristiques, vote, rejoindre, personnaliser, Twitch/site, copier le lien sont regroupés dans une seule colonne nette. La boîte supplémentaire « Partager ce serveur » est supprimée au profit d'un accès au partage en ligne dans la même colonne.
- **Avis et chiffres** : les mesures et les sous-notes utilisent également des listes horizontales sans petits panneaux pour chaque nombre.
- **Responsive** : une colonne en mobile pour les données, les liens créateurs restent accessibles, les actions sont conservées.
- Aucun champ inventé ; aucun changement des API, de la base MySQL, des droits propriétaires, des votes ou de la modération.

## Fichiers
- `modules/swapp-servers-profile.js` : données sans répétitions et partage intégré.
- `modules/swapp-servers-community.js` : note de vérification condensée et déplacée sous la liste.
- `assets/swapp-servers.css` et `assets/swapp-servers-community.css` : nouvelle typographie, séparateurs, contrastes et mobile.
- `modules/swapp-servers.js` : cache CSS renouvelé (`20261116-flat-profile-v22`, `20261116-flat-community-v3`).
- `test/swapp-server-profile-flat-editorial-20261116.test.js` : tests de structure, actions conservées et portée CSS aux seules fiches.

## Validation
La syntaxe des fichiers JS et le rendu HTML avec données d'essai ont été vérifiés en exécution isolée. Résultat positif : cinq informations pratiques, un seul cadre latéral, boutons vote/rejoindre/personnaliser/partager conservés, navigation des vies et recherche de joueurs conservées. **La suite Node complète et la comparaison visuelle sur Hostinger n'ont pas été exécutées ici.** Le déploiement de cette version doit encore être effectué et contrôlé avec la feuille de style actualisée.
