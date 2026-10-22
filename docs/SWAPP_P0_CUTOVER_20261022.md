# SWAPP — Passage P0 vers un vrai pilote (22 octobre 2026)

## État vérifié en production
Contrôles publics non authentifiés du 22 octobre (valeurs susceptibles de changer) :
- `/api/release` : manifest complet ; l'empreinte doit encore être comparée au checkout exact après livraison.
- `/api/oryon/persistence-status` : **Firestore encore actif pour cinq comptes**.
- `/api/swapp/social-native/backend-status` : **MySQL actif**, snapshot `fresh`; les autorisations temporaires d'initialisation sont toujours demandées dans la configuration.
- `/api/creator/spotlight/status` : `enabled:false`, `accounts_mysql:false`.
- `/api/swapp-tv/queue/status` : file/régie désactivées.
- `/api/discovery/fair-summary` : mécanisme actif, échantillon limité.
- `/api/actus/release-status` : 6 articles éditoriaux versionnés, 6 éditables.

Lancer depuis un checkout **identique à la version déployée** : `npm run audit:p0` (lecture seule, sept GET) puis `npm run verify:production`. La commande n'active ni ne désactive aucune fonction et ne constitue pas un test navigateur.

## Étape 1 — Sécuriser SOCIAL déjà initialisé
1. Vérifier `active_backend=mysql`, `snapshot_type=fresh`, `snapshot_present=true`, `writes_frozen=false`.
2. Sauvegarder la configuration Hostinger actuelle, **sans afficher de mots de passe ni secrets**.
3. Mettre **uniquement** `SWAPP_SOCIAL_FRESH_START_APPROVED=0` et `SWAPP_SOCIAL_FRESH_AUTO_INIT=0`. Conserver `SWAPP_SOCIAL_FRESH_START_VERIFIED=1` ainsi que `SWAPP_SOCIAL_BACKEND=mysql`.
4. Redémarrer via Hostinger, lire à nouveau l'API ; vérifier `fresh_bootstrap_authorized:false`, `fresh_auto_init_requested:false`, `active_backend:mysql`.
5. Avec deux comptes, publier puis rafraîchir, répondre, supprimer son post, annuler un repost, envoyer un message privé et vérifier que les données restent après redémarrage. Aucun effacement de SOCIAL.

**Important :** `fresh_start_approved` dans l'ancienne API signifie que le snapshot est **vérifié** par `FRESH_START_VERIFIED`, et non qu'une autorisation temporaire est encore accordée. Le nouvel indicateur distinct est `fresh_bootstrap_authorized`.

## Étape 2 — Préparer les comptes SWAPP MySQL, sans perte cachée
1. Les cinq comptes actuellement enregistrés dans Firestore peuvent être des comptes d'essai, mais l'opération invalide leurs sessions. Conserver une sauvegarde de la base, de la configuration et les moyens de retour arrière avant toute modification.
2. Vérifier MySQL Hostinger, droits SQL et création de la table de comptes **sans modifier les données Firestore**. Pas de partage de `SWAPP_MYSQL_URL` en clair.
3. Pour le départ neuf explicitement choisi, activer `SWAPP_ACCOUNT_STORE=mysql` dans **l'application Node de SWAPP sur Hostinger** ; redémarrer puis contrôler `/api/oryon/persistence-status` : `mysql:true`, `persistence:mysql:swapp_oryon_accounts`.
4. Créer deux comptes neufs ; tester inscription, connexion, déconnexion, mot de passe oublié, ouverture d'une autre session, F5, Safari iPhone, Chrome Android, changement de couleur, publication SOCIAL et messages. Refaire la liaison Twitch dans le tableau de bord. Ne jamais rattacher l'historique d'un ancien identifiant sur une simple correspondance de pseudo.
5. En cas d'erreur MySQL, ne pas autoriser de repli silencieux en fichier JSON ou une réinitialisation des données. Sauvegarder les logs utiles et restaurer la dernière configuration connue.

## Étape 3 — Activer les créateurs en deux temps
**Spotlight :** seulement après deux comptes MySQL et liaisons Twitch vérifiées, configurer `SWAPP_SPOTLIGHT_ENABLED=1`, contrôler `/api/creator/spotlight/status` puis tester une réservation réelle d'un jeu publié, les règles de quotas, le refus du second occupant, le report et l'annulation. Confirmer l'identité du direct Twitch **et du jeu** avant affichage `EN DIRECT`.

**SWAPP TV :** activer `SWAPP_TV_QUEUE_ENABLED=1` puis contrôler `/api/swapp-tv/queue/status` ; le nouveau code refuse explicitement de la déclarer ouverte lorsque le stockage des comptes MySQL n'est pas opérationnel. Vérifier les inscriptions et retraits. Activer `SWAPP_TV_DIRECTOR_ENABLED=1` seulement lorsque l'algorithme de rotation et les live checks ont passé les tests sur de vrais créateurs. Ne pas laisser une régie automatique sélectionner des directs non vérifiés.

## Étape 4 — Test du parcours fondamental
Avec deux comptes, sur ordinateur + iPhone + Android :
- Découvrir un jeu depuis l'accueil, ouvrir sa fiche `/jeux/:slug`, son article, puis son créateur réellement actif.
- Ouvrir SOCIAL sur **le même jeu**, écrire un message, y répondre et revenir à la fiche sans double identification.
- Depuis l'article, vérifier une réservation Spotlight valide et son état réel ; quitter et revenir sans F5 supplémentaire.
- Depuis SWAPP TV, vérifier la file, le vrai jeu, l'agenda, les chats et la lecture au niveau du lecteur.
- Si le jeu n'a ni live ni salon, montrer un état vide réel et une action utile, sans inventer des personnes en direct.
- Vérifier les annulations, refus 401/403 et protections contre les actions d'un autre compte.

## Critère de sortie
Le pilote technique n'est **préqualifié** par `npm run audit:p0` que si tous les services P0 répondent prêts. **Le lancement nécessite ensuite les tests réels ci-dessus**, un résultat `npm run verify:production` sans drift et un plan de retour arrière. Aucune activation automatique, migration destructive, cron payant ou nouveau VPS.
