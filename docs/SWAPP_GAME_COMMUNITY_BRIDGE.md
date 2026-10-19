# SWAPP — Passer d'un jeu à sa vraie communauté

## Ce qui change
La page d'un jeu contient déjà les actualités éditoriales, les lives vérifiés et un lien vers `/communaute?game=NOM`. Désormais ce lien ouvre **les salons vocaux et textuels réels** du jeu, plutôt qu'une recherche de texte générale.

Un compte SWAPP connecté voit uniquement les salons publics de ce jeu et ses salons privés dont il est membre. Un écran vide indique honnêtement qu'aucun salon correspondant n'est accessible. Les joueurs peuvent créer un salon prérempli avec ce jeu ou afficher tous les salons. L'interface ne rejoint aucun canal vocal et ne demande jamais le micro automatiquement.

## Correspondance des jeux
Le backend MySQL et le stockage de secours existant utilisent l'identité conservatrice SWAPP :
- GTA VI / GTA 6 : équivalents ;
- Planet Zoo / Planet Zoo 2 : distincts ;
- Hades / Hades II : distincts ;
- The Witcher 3 / The Witcher 3 Remastered : distincts.

MySQL interroge les noms exacts et synonymes autorisés par paramètres SQL, puis contrôle les résultats. Un jeu sans correspondance vérifiée ne renvoie pas de salons non liés. Aucun `LIKE '%jeu%'` ne rapproche arbitrairement des éditions.

## Sécurité et vie privée
- Le contrôle d'authentification SWAPP reste obligatoire pour accéder aux salons.
- La clause SQL de visibilité (public OU membre d'un salon privé) est parenthésée **avant** le filtre du jeu pour préserver la confidentialité.
- Les membres non invités ne voient pas les salons personnels d'autrui.
- `Cache-Control: private, no-store`.
- Aucune modification du modèle d'accès aux salons vocaux, des invitations, ni des actions micro.
- Aucun nouveau cookie, tracking, service externe, schéma MySQL ou workflow GitHub Actions.
- Les liens de partage d'articles vers SOCIAL continuent d'ouvrir leur brouillon de partage.

## Contraintes connues
Le filtre fonctionne avec les jeux renseignés explicitement lors de la création du salon. Les salons sans jeu précis ne sont pas attachés à un univers. Le serveur renvoie au maximum 40 salons récents accessibles après filtration ; les noms inconnus ne disposent pas d'un référentiel externe universel à ce stade. Le service SOCIAL lui-même doit fonctionner sur l'hébergement réel pour que les salons s'affichent.

## Vérification
1. Exécuter `npm run check` et `npm test` dans une copie du dépôt, sans déclencher GitHub Actions payant.
2. Ouvrir `/jeux/:slug`, utiliser « Salons du jeu ».
3. Tester `/communaute?game=GTA%20VI` avec un compte SWAPP ; seuls les salons GTA VI / GTA 6 autorisés doivent apparaître.
4. Vérifier qu'un salon privé non rejoint reste invisible, puis rejoindre via son invitation et vérifier la visibilité et le vocal manuel.
5. Tester Hades/Hades II, Planet Zoo/Planet Zoo II et Witcher 3/remaster.
6. Tester iPhone, Android, PC et le bouton « Voir tous les salons ».
7. Vérifier `/api/release` et `npm run verify:production` sur Hostinger après déploiement. La fusion GitHub seule n'est pas une preuve de déploiement.

Prochaine phase : mesures de visibilité agrégées, sans suivi nominatif, pour quantifier réellement l'équité de Fair Discovery.
