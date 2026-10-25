# SWAPP Live — Notifications Push gratuites et opt-in

Statut : **code en branche, non déployé, désactivé par défaut**. Ces notifications ne sont pas des abonnements payants.

## Objectif

Chaque spectateur connecté à son **unique compte SWAPP** peut suivre une chaîne gratuitement et activer/désactiver sa cloche séparément. L'alerte n'est envoyée que lorsque des indices de médias réellement disponibles sont présents :
- Diffusion **OBS native** : premier manifeste HLS dont les segments TS existent dans le relais SWAPP ;
- Diffusion **navigateur/WebRTC** : au premier signal `native:viewer:media` indiquant `playing:true` d'un spectateur autorisé (signal client, non preuve indépendante de décodage vidéo).
Les avertissements sont dédupliqués par session de diffusion et bridés à **une notification maximum par créateur sur 20 minutes**, y compris après une reconnexion. Aucune tâche externe, cron, VPS, SMTP ou API Push payante.

Les alertes sont de véritables notifications système via Service Worker / Push API. Les navigateurs envoient techniquement les messages via leur service Push standard (Apple, Mozilla, FCM, Windows). **Pas de suivi publicitaire.**

## Activation depuis Hostinger (pas depuis GitHub)

1. Préserver la base actuelle : sauvegarde MySQL Hostinger, vérification des connexions et des comptes persistants `SWAPP_ACCOUNT_STORE=mysql`.
2. Déployer le code Node et installer les dépendances EXISTANTES (pas de bibliothèque Push supplémentaire).
3. Générer une paire VAPID en local : `node tools/swapp-push-vapid-keys.js`. Cette commande ne contacte aucun serveur. Copier sa sortie uniquement dans les variables privées Hostinger, jamais dans un commit ni une capture publique.
4. Définir en variables privées :
   - `SWAPP_ACCOUNT_STORE=mysql` (déjà activé et testé pour les comptes)
   - `SWAPP_MYSQL_URL=mysql://...` (URL privée vers MySQL Hostinger)
   - `SWAPP_PUSH_VAPID_PUBLIC_KEY=<clé publique VAPID>`
   - `SWAPP_PUSH_VAPID_PRIVATE_KEY=<clé privée VAPID>`
   - `SWAPP_PUSH_VAPID_SUBJECT=mailto:<adresse de support réelle>`
   - `SWAPP_PUSH_ENABLED=1`
5. Redémarrer l'application Node, confirmer les tables créées dans la base existante : `swapp_live_push_devices`, `swapp_live_push_preferences`, `swapp_live_push_events`.
6. Vérifier `GET /api/swapp/live-alerts/config` → `available:true`. Si ce champ est false, aucune cloche ne doit prétendre fonctionner. Ne jamais exposer la clé privée.
7. Connecter deux comptes réels, suivre un créateur et activer la cloche **après permission navigateur explicite**. Fermer SWAPP et lancer un direct OBS avec segments ou WebRTC avec spectateur lisant la vidéo. Contrôler la notification puis sa navigation.
8. Désactiver la cloche et relancer un nouveau live ; aucune alerte ne doit être envoyée au compte ayant désactivé la préférence. Tester deux navigateurs/appareils, F5, déconnexion, suivi et désabonnement.

## Architecture

- `GET /api/swapp/live-alerts/config` : public, fournit uniquement disponibilité et clé publique.
- `GET /api/swapp/live-alerts/status?creator=<login>` : état lié au compte ; ne dévoile ni les autres suivis ni les abonnements Push privés.
- `POST /api/swapp/live-alerts/enable` : session SWAPP, chaîne suivie, Origin same-site vérifié, abonnement Push HTTPS validé, création atomique de l'appareil et de la préférence dans MySQL.
- `POST /api/swapp/live-alerts/disable` : session SWAPP, révocation immédiate de la préférence pour ce créateur.
- `POST /api/swapp/live-alerts/device/remove` : effacement du jeton de l'appareil courant.
- `GET /swapp-live-sw.js` : service worker root scope, sans cache de vidéo ni tracking.
- `notifyLive` : liste de préférences actives jointe aux appareils, recontrôle du follow au moment de l'envoi, requêtes chiffrées Web Push AES128GCM, VAPID ES256, maximum 4 envois simultanés, suppression des endpoints expirés (404/410).
- Seuls les hôtes Push reconnus sont autorisés : blocage des cibles SSRF et localhost.
- Les clés de chiffrement des navigateurs et les endpoints sont des données sensibles à protéger. Documenter cette finalité et la suppression des appareils dans la politique de confidentialité.

## Compatibilité et limites

- HTTPS obligatoire.
- Edge, Chrome, Firefox : Push API/Service Worker selon leur disponibilité et permission.
- macOS Safari : Push pris en charge sur versions compatibles.
- iPhone/iPad : **ajouter le site à l'écran d'accueil en tant qu'app web**, puis donner la permission dans l'app. Ouvrir simplement swapp.tv dans un onglet Safari iOS ne suffit généralement pas.
- Les notifications peuvent être retardées ou bloquées par le système, économie de batterie, restrictions appareil, réseau ou autorisations.
- Plusieurs onglets SWAPP ouverts ne déclenchent pas plusieurs Push si le même appareil a un seul endpoint et que la préférence est partagée.
- La première installation **n'envoie pas rétroactivement** d'alerte pour un live déjà commencé.
- Si le processus Node redémarre, les abonnements et l'historique de notification persistent dans MySQL, mais les rooms WebRTC/HLS en mémoire restent soumis aux limites normales de SWAPP.
- La configuration **ne résout pas** la capacité actuelle du relais (maximum deux lives simultanés), le transcodage adaptatif, ou les limites de bande passante.

## Tests de release

`node --test test/swapp-live-push.test.js test/swapp-channel-follow-toggle.test.js test/swapp-direct-hls-relay.test.js`

Faire des tests de réception réels après déploiement sur Hostinger, navigateur fermé, **sans aucun déclenchement factice via bouton de test**. Contrôler refus permission, origine incorrecte, endpoint non approuvé, token expiré, compte non suivi, reconnection, anti-spam, double compte/appareil.

L'activation n'est autorisée qu'après confirmation MySQL + domaine HTTPS + réception et révocation réellement constatées. Tant que cette étape manque, `SWAPP_PUSH_ENABLED` reste **0**.
