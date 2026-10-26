# SWAPP — Communauté de chaîne : followers, points et modération

## Vue créateur
Depuis **Gestionnaire de diffusion → Communauté** :
- Liste des vrais comptes SWAPP qui suivent gratuitement la chaîne (`user.following`), 50 par page, recherche par pseudo et nom affiché.
- Points **de cette chaîne uniquement** et minutes de visionnage comptabilisées ; ce ne sont pas les points de gamification « Mes jeux ».
- Statut modérateur, banni du tchat ou simple follower.
- **Promouvoir modérateur**, **retirer le rôle**, **bannir du tchat**, **débannir** ; chacune de ces actions demande une confirmation.
- Spectateurs connectés et tableau de fidélité existants conservés plus bas.

## APIs réutilisées
- `GET /api/swapp/channel-followers/:room?page=1&q=...` : **propriétaire seulement** avec vérification serveur du login ET de l'ID de compte ; réponse `private, no-store`. Ne renvoie ni email, ni identifiant interne, ni adresses IP, ni suivi d'autres chaînes.
- Follows issus des comptes SWAPP existants ; on ne fabrique aucun membre à partir du nombre agrégé `followers_count`.
- Points lus par identifiants de **la page courante** (maximum 50) depuis le stockage local ou `swapp_channel_points` MySQL déjà existant ; si le stockage MySQL manque, points `null` et message « indisponibles » plutôt que 0 inventé.
- Actions via `POST /api/swapp/channel-moderation/:room`. Le serveur, et non le navigateur, contrôle l'identité du propriétaire. Les modérateurs de tchat ne peuvent pas promouvoir/dégrader des membres.
- Bannir un modérateur lui retire désormais automatiquement son rôle ; toute tentative de promotion d'un banni retourne HTTP 409.

## Périmètre exact du bannissement
**Banni du tchat SWAPP de cette chaîne**, donc impossible de poster dans le tchat natif ; ce n'est pas un bannissement de SWAPP entier, ni un bannissement Twitch/Kick, ni une suppression automatique du suivi gratuit. L'utilisateur peut toujours voir les pages publiques.

## Vérifications
- Syntaxe JS et simulations des APIs propriétaire/follower/points recherchés/erreur 403/400 : réussies.
- Tests d'autorisation de promotion, bannissement et révocation des droits : réussis en simulation.
- Test Node natif `node --test test/swapp-channel-followers.test.js test/swapp-followers-moderation-roles.test.js test/swapp-channel-moderation.test.js test/swapp-channel-audience.test.js` encore à exécuter sur l'environnement de déploiement ; aucune GitHub Action payante.
- À valider sur Hostinger : comptes réels, plusieurs pages de followers, MySQL disponible/indisponible, effets immédiats sur le tchat et navigation mobile.

## Idées suivantes (non livrées dans ce lot)
- Durée réelle depuis le follow : nécessite un horodatage persistant ; ne pas inventer les dates des anciens follows.
- Signaler / appel de sanction avec journal horodaté et motif, accessible propriétaire/modérateurs.
- Badges de fidélité non échangeables et salons réservés, **sur choix de l'utilisateur** ; ne pas impliquer de monétisation fictive.
- Tableau des modérateurs séparé, incluant ceux qui ne suivent pas la chaîne, avec délégation de permissions granularisée.
