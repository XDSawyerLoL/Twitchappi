# SWAPP — Fair Discovery permanent, seuil 20, reconnaissance des créateurs (21 octobre 2026)

## Décisions produit
1. SWAPP Fair Discovery est appliqué automatiquement à tous les classements de mise en avant Accueil / Découvrir / fiches de jeux. Plus de bouton « Mesure équitable (facultatif) » : les compteurs portent exclusivement sur les cartes signées par SWAPP et réellement visibles, sans cookie, identifiant visiteur, suivi de navigation ou profil personnel.
2. Une chaîne doit diffuser en direct avec **au moins 20 spectateurs simultanés** pour recevoir une **mise en avant automatique**. Les créateurs à **20–25** spectateurs bénéficient d'un quota de découverte proportionné et d'une rotation. Les chaînes de 1–19 spectateurs ne sont pas supprimées de Twitch/SWAPP ; une recherche nominative explicite reste possible dans Découvrir.
3. Ce seuil est un **seuil d'éligibilité aux promotions éditoriales**, pas un niveau de certification, un minimum pour avoir un compte SWAPP, ni une obligation d'acheter de la visibilité. La catégorie et le direct doivent rester vérifiables.
4. Les chiffres d'audience Twitch sont des mesures instantanées de Twitch, pas des gains causés par SWAPP. Les impressions et clics SWAPP sont des agrégats de cartes vues ; les **propositions** provenant de l'API sont suivies séparément. Ne jamais mélanger ces mesures.
5. Les cartes en ligne doivent toujours pouvoir être consultées sans connexion SWAPP ; les opérations de mesure doivent être robustes à une panne MySQL et ne jamais bloquer le site.
6. La règle minimum 20 protège le bénéfice mutuel : viser des communautés existantes, tout en laissant une chance aux petits et moyens créateurs (20–100). Évaluer dans le temps l'impact réel sur les clics et le retour des créateurs sans promettre des abonnés.

## Notification de reconnaissance
- Pour un créateur **inscrit sur SWAPP, Twitch associé et ayant une réservation Spotlight réelle**, quand le jeu Twitch est vérifié et le direct atteint 20 spectateurs pendant son créneau, SWAPP enregistre une seule notification privée en MySQL (`swapp_spotlight_recognition`, clé primaire reservation_id).
- Le créateur connecté lit ses reconnaissances via `GET /api/creator/spotlight/mine` (authentifié) : bloc « SWAPP te met en lumière » dans son tableau de bord.
- Texte : « Ta chaîne est à l’honneur sur SWAPP. Ton live [jeu] a été sélectionné pour un Spotlight SWAPP. Ton direct a été vérifié, et les lecteurs peuvent le découvrir depuis la page du jeu. Merci de faire vivre la communauté ! ».
- Ne pas affirmer un nombre de spectateurs apportés ni déclencher de publication en cas de hors ligne, mauvais jeu, durée expirée ou audience inférieure à 20.
- Ceci **n'envoie pas un message privé à un compte Twitch tiers**. Les Whispers Twitch nécessitent des autorisations utilisateur Twitch appropriées et une politique anti-spam ; préparer une liaison explicite/opt-in pour de futures notifications externes, ne pas exploiter des listes de streamers découverts pour les démarcher automatiquement.

## Important : état production et activation
- Contrôle public du 21 octobre : `/api/discovery/fair-summary` indiquait `enabled:true`. Un score insuffisant signifie un volume statistique trop petit, pas une panne.
- Au même contrôle, `/api/creator/spotlight/status` retournait `enabled:false`, `accounts_mysql:false`, `twitch_api_configured:true`. La nouvelle reconnaissance Spotlight est donc **développée mais inactive** tant que le stockage de comptes MySQL et `SWAPP_SPOTLIGHT_ENABLED=1` ne sont pas opérationnels.
- Vérifier les variables de production existantes SWAPP_ACCOUNT_STORE, SWAPP_MYSQL_URL, SWAPP_SPOTLIGHT_ENABLED et l'état de bascule des comptes. Ne pas modifier les secrets ni activer de fonctionnalité si la base et les sessions n'ont pas été validées.
- L'activation de `SWAPP_SPOTLIGHT_ENABLED=1` doit suivre la vérification des comptes MySQL, de la liaison Twitch, des réservations et des droits sur l'administration. Ne pas annoncer un succès tant que `/api/creator/spotlight/status` n'indique pas `enabled:true`.
- Contrôler `/api/discovery/home-lives` et `/api/discovery/game-lives` en situation réelle : aucun placement promotionnel en-dessous du seuil ; comparer Accueil et Découvrir.
- Tests ciblés : `node --test test/swapp-fair-synergy.test.js test/swapp-home-discovery.test.js test/swapp-discover-ranking.test.js test/swapp-fair-admin.test.js test/swapp-spotlight-recognition.test.js`.
- Confidentialité : même en absence de cookie, tout dispositif de mesure automatique doit être documenté dans la politique de confidentialité et vérifié au regard des exigences CNIL sur l'exemption de consentement. Ne pas annoncer une conformité juridique sans audit.

## Références
- Architecture historique : `docs/SWAPP_FAIR_DISCOVERY_V3.md`, `docs/SWAPP_FAIR_DISCOVERY_V4.md`
- Classements : `modules/swapp-discovery-diversity.js`, `modules/swapp-home-discovery.js`
- Mesures : `modules/swapp-fair-metrics.js`, `modules/swapp-fair-offers.js`, `assets/swapp-fair-v3.js`, `assets/swapp-media-live.js`
- Reconnaissance MySQL : `modules/swapp-spotlight-notices.js`, `server.js`, `assets/swapp-spotlight.js`.
