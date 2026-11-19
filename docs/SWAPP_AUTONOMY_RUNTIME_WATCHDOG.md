# SWAPP Autonomy — premier watchdog réellement branché à Node

## Activation et périmètre

Le démarrage de `server.js` crée un observateur local au sein de chaque processus Node en production. Toutes les 60 secondes, il lit uniquement des variables déjà disponibles dans ce processus. Aucune requête externe, transaction SQL, relance automatique ou nouvelle dépendance n'est créée. Le minuteur n'empêche pas Node de s'arrêter (`unref()`). Le comportement est identique sur Hostinger et reste limité à chaque instance.

L'observateur collecte cinq vérifications booléennes :
- intégrité structurelle du manifeste de déploiement (`releaseComplete`) ;
- disponibilité déclarée de MySQL pour les comptes (`accountsMysqlReady`) ;
- sélection du backend MySQL pour le magazine (`newsMysqlConfigured`) ;
- retrait du runtime Firebase (`firestoreDisabled`) ;
- désactivation des anciens cron Firestore (`legacyCronsDisabled`).

Il expose `GET /api/swapp/autonomy/status`, réponse JSON `{success, scope, state, checkedAt, checks}`, avec `scope=single_node_process` et `Cache-Control: no-store`. Les états sont `warming`, `healthy`, `degraded`, `error`. Un changement d'état est journalisé **une seule fois** à chaque transition, sans valeur de secret ni erreur brute. Le module est chargé de manière facultative : un transfert partiel Hostinger n'empêche pas le serveur principal de démarrer ; la route renvoie alors `503 watchdog_unavailable`.

**Attention :** `healthy` signifie que les indicateurs locaux retenus sont cohérents, pas que le service est globalement sain. L'indicateur `newsMysqlConfigured` ne prouve pas une connexion SQL, et le module ne teste ni HLS, ni Twitch, ni la latence réseau, ni les paiements.

## Compatibilité et preuve de déploiement

Le fichier `modules/swapp-autonomy/runtime-watchdog.js` est désormais exigé par l'archive Hostinger et inclus dans l'empreinte de déploiement. Vérifications :
1. `npm run test:autonomy` pour les tests ciblés ;
2. `npm run check` pour les fichiers principaux ;
3. `npm test` pour la régression globale ;
4. `npm run release:info` puis `npm run verify:production` après livraison réelle ;
5. `GET /api/swapp/autonomy/status` sur le site, attendre au moins un cycle de 60 secondes et vérifier le JSON métier.

Les sondes HTTP depuis les outils externes ont reçu HTTP 403 du pare-feu le 19/11/2026. **Ne pas contourner le WAF** ; ce contrôle peut être réalisé directement depuis Hostinger ou depuis un navigateur administrateur autorisé. Un commit GitHub ne constitue pas une preuve de déploiement.

## Test et publication

Le noyau et ses cinq scénarios ont été testés sous Node.js 22.16.0, aux côtés des vingt tests existants : **25/25 réussis**, sans accès réseau ni SQL. Le JavaScript de `server.js` complet a été analysé syntaxiquement, mais la régression globale d'application et le contrôle de l'environnement Hostinger restent nécessaires.

Aucune migration MySQL, automatisation éditoriale, écriture commerciale, modification des tarifs/paiements, diffusion HLS ou OBS n'est incluse. Aucun auto-redémarrage n'est effectué sur une panne : une remédiation doit être prouvée sans boucles ni perte de données avant activation.

Les huit autres moteurs nécessitent une intégration progressive. Ce déploiement marque **la première fonctionnalité d'observation autonomisée**, pas l'autonomie intégrale de SWAPP.
