# SWAPP SERVEUR + — actions premium des fiches (16 novembre 2026)

## Problème
Les boutons « Voter », « Rejoindre » et « Personnaliser » étaient trois grands rectangles bordeaux, pétrole et violet, de même importance, reproduits dans l'en-tête et la colonne latérale. Sur mobile, les anciennes règles forçaient aussi « Personnaliser » à occuper toute la largeur.

## Nouvelle hiérarchie
1. **Rejoindre la communauté** — seul bouton plein, dégradé cyan glacé et texte sombre très contrasté, avec petite description « Ouvrir le lien du serveur ». C'est l'action prioritaire si un lien extérieur réel est présent.
2. **Voter pour ce serveur** — action secondaire plus sombre, contour rose discret, cœur conservé et microtexte « Soutenir sa visibilité ».
3. **Personnaliser ma fiche** — action tertiaire réservée au propriétaire, présentée comme un lien discret et non comme un troisième grand bouton.

L'ordre est identique dans `ss-pro-actions` (hero) et `ss-pro-side-actions` (caractéristiques). Le groupe hero utilise un aménagement horizontal lorsque l'espace le permet ; sur écran compact et en sidebar, les actions sont verticales, avec l'action propriétaire réduite au format lien.

## Limites
- La fiche n'affiche pas de lien « Rejoindre » si aucune URL de communauté n'est disponible ; aucun faux accès.
- Les hooks `data-ss-vote-id`, `data-ss-outbound-id` et le chemin propriétaire `/serveurs/gerer/:slug` restent inchangés.
- Style limité à `.ss-pro`, sans modifier les boutons de l'annuaire, les outils de modération ou les formulaires.
- Contrastes, état focus clavier, états désactivés et `prefers-reduced-motion` conservés.
- Aucun changement MySQL, API, routage, authentification ou service payant.

## Tests et mise en ligne
- Syntaxe du module profil et des tests vérifiée.
- Exécution isolée du HTML : deux groupes d'actions, « Rejoindre » avant « Voter » avant « Personnaliser », URL et attributs attendus ; mode sans lien respecté.
- Version CSS renouvelée : `20261116-cta-premium-v23`, pour éviter le cache navigateur.
- Test ciblé ajouté : `test/swapp-server-profile-cta-premium-20261116.test.js`; test antérieur de CSS mis à jour.
- **Suite Node complète et comparaison visuelle sur Hostinger non exécutées** : après installation de la version fusionnée, vérifier le hero, la sidebar, la lisibilité à 375/768/1440 px et les actions réelles sans modifier les fiches.
