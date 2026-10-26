# SWAPP — Cloche visible et liens communautaires du créateur (26 octobre 2026)

## Correctif de la cloche

La cloche Push existante dans `assets/swapp-live-alert-bell.js` ne doit **jamais disparaître** à cause d'une configuration manquante ou d'un navigateur incompatible. Elle reste visible dans le bandeau du direct près de « Suivre », avec des messages explicites au clic :

- **Disponible** : l'activation exige toujours que le spectateur soit connecté, suive la chaîne, accepte la permission du navigateur et qu'une souscription Push réelle soit enregistrée via le backend Hostinger.
- **Serveur Push non configuré** : la cloche apparaît mais informe que les variables VAPID / MySQL / `SWAPP_PUSH_ENABLED` doivent être configurées. Aucun abonnement Push inventé.
- **Navigateur incompatible** : message réel de compatibilité, sans fausse notification.
- **Sur sa propre chaîne** : le propriétaire voit l'emplacement via une icône clairement désactivée ; le vrai bouton authentifié reste destiné aux spectateurs.

L'API de notifications, le worker, les consentements et le stockage restent inchangés. Pour que les notifications fonctionnent une fois le navigateur fermé, vérifier sur Hostinger `SWAPP_PUSH_ENABLED=1`, `SWAPP_ACCOUNT_STORE=mysql`, `SWAPP_MYSQL_URL`, `SWAPP_PUSH_VAPID_PUBLIC_KEY`, `SWAPP_PUSH_VAPID_PRIVATE_KEY` et `SWAPP_PUSH_VAPID_SUBJECT`. Ne jamais mettre les clés privées dans le dépôt GitHub.

## Liens sur le lecteur

La barre `swapp-creator-social-shortcuts` est **une petite rangée d'icônes dans les commandes du vrai lecteur**, et non une couche au-dessus de la vidéo. Elle n'affiche **que les liens renseignés** par le créateur :

- **Signal** : lien public Signal (`signal.group` ou `signal.me`) ;
- **Bluesky** : lien de profil `bsky.app/profile/…` ;
- **Mastodon** : profil `https://instance/@pseudo` ou `https://instance/users/pseudo`, sans imposer une instance centrale ;
- **Minds** : profil `minds.com/pseudo`.

Sur sa chaîne, le propriétaire peut cliquer sur « + Liens » à côté des icônes ou « Gérer ma chaîne → Liens sociaux ». Il modifie/supprime les liens, puis enregistre. Le formulaire POST **uniquement** `channel_social_links` vers l'API authentifiée déjà existante `/api/oryon/profile` ; le profil public est relu pour vérifier la sauvegarde. Aucun doublon avec `channel_links` de la galerie.

Côté serveur : champ persistant `channel_social_links` du compte SWAPP, exposé en lecture publique, modification réservée à la session propriétaire, validation HTTPS, domaines officiels pour Signal/Bluesky/Minds, profil Mastodon sur instance avec nom de domaine valide, interdiction d'URL avec identifiants, localhost, IP privée ou schéma `javascript:`. Les URLs extérieures sont ouvertes en nouvel onglet avec `rel="noopener noreferrer nofollow ugc"`.

## Déploiement et QA

Tests ciblés dans `test/swapp-visible-bell-creator-social.test.js` et régression `test/swapp-live-viewer-actions.test.js`. Vérifier sous navigateur connecté et anonyme, sur deux chaînes distinctes, la persistance après F5, le retrait d'un lien, la compatibilité mobile, l'activation de la cloche si le serveur Push est réellement configuré, et l'absence d'interruption du flux OBS.

L'interface ne touche ni aux sockets, ni à la playlist HLS, ni au format 16:9, ni au calcul de hauteur lecteur/tchat. Aucun prestataire payant ni VPS supplémentaire.
