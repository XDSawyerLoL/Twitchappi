# SWAPP — retrait Firestore du runtime Hostinger (16 novembre 2026)

## Incident confirmé

Les journaux Hostinger montrent des centaines de refus PERMISSION_DENIED depuis l'ancien projet goodstreamer-7e87d, notamment les opérations upsertChannelMetaFromStream, channel rollup et CRON Snapshot. L'utilisateur confirme que Firestore n'est plus le stockage actif souhaité.

La cause dans server.js : l'initialisation pouvait se produire automatiquement dès que des secrets Firebase historiques étaient encore définis. Deux tâches de collecte Firestore pouvaient également démarrer avec ENABLE_CRON ou ENABLE_TRACKED_CRON.

## Modifications de code

- Politique fixe FIRESTORE_RUNTIME_ENABLED=false, non réactivable par une variable d'environnement : aucune initialisation Firebase ni nouveau client Firestore à partir du serveur SWAPP.
- Désactivation des deux CRON historiques, indépendamment des anciennes valeurs ENABLE_CRON=true / ENABLE_TRACKED_CRON=true. Garde supplémentaire au début de chaque collecteur/écrivain hérité.
- ACTUS n'initialise plus jamais l'ancien backend Firestore. Il utilise uniquement SWAPP_NEWS_MYSQL_URL, SWAPP_MYSQL_URL ou SWAPP_ACCOUNT_MYSQL_URL.
- Les trois anciennes API /api/tracked_channels et la liaison Firebase Steam renvoient HTTP 410 plutôt que prétendre sauvegarder des données.
- L'import des sauvegardes administrateur en production exige désormais le stockage MySQL des comptes, pas une connexion Firestore.
- Le setup-wizard ne propose plus de clé Firebase et fixe SWAPP_ACCOUNT_STORE=mysql, SWAPP_NEWS_BACKEND=mysql et les deux CRON hérités à false.
- Nouveau point de contrôle public et sans secret : GET /api/swapp/storage-runtime. Le smoke test de production vérifie que Firebase/CRON sont bien arrêtés et que MySQL comptes/ACTUS est opérationnel.

## Vérifications après déploiement

1. Déployer le nouveau master et redémarrer **tous** les processus Node Hostinger ; un ancien processus peut continuer à envoyer des écritures Firebase malgré une fusion GitHub.
2. GET https://swapp.tv/api/swapp/storage-runtime doit afficher firestoreRuntime:false, firebaseAppInitialized:false, legacySnapshotCron:false, legacyTrackedCron:false, accountsBackend:"mysql", accountsReady:true, newsBackend:"mysql".
3. Contrôler aussi /api/oryon/persistence-status et /api/actus/storage-status. Des échecs éventuels sont des problèmes MySQL à résoudre, pas une raison de réactiver Firestore.
4. Faire un backup des anciennes données Firestore avant de retirer leurs secrets de Hostinger. Ne pas effacer les collections ni les comptes avant vérification de migration.
5. Surveiller les journaux d'application : aucun nouveau upsertChannelMetaFromStream, DAILY channel rollup ou CRON Snapshot error ne doit provenir des nouveaux processus.
6. Lancer npm run verify:production. Le résultat doit être un échec explicite si un vieux serveur ou un WAF CAPTCHA répond à la place de l'API de contrôle.

## Périmètre et risques

Le runtime Firestore ne doit plus contacter le service. Toutefois, du code et des routes historiques existent toujours dans le dépôt pour migration et compatibilité. Certaines fonctionnalités anciennes reposaient sur ce stockage (ancien chat du hub, statistiques Twitch historiques, état optionnel, boutique/billing legacy). L'arrêt Firestore n'est pas en soi une migration de leurs données. Les remplacer progressivement par des tables MySQL, sans en simuler la persistance ni inventer des statistiques. Le code de l'ancienne migration CLI Firestore reste volontairement disponible uniquement sur action manuelle explicite.

Ce correctif est dans GitHub ; il n'arrête pas à distance un processus Node déjà exécuté sur Hostinger.
