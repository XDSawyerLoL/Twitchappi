# SWAPP SOCIAL audio — validation avant production

## Dépendances
1. Fusionner **#38** (refonte du menu SOCIAL), puis **#39** (salons WebRTC), puis **#40** (messages et appels privés).
2. Utiliser la Web App Node existante de Hostinger, sans VPS. Node 20+ et Socket.IO 4.x.
3. Activer `SWAPP_SOCIAL_FEATURES=1` seulement avec `SWAPP_MYSQL_URL` configurée. Le bootstrap idempotent doit créer les tables `swapp_social_voice_notes` et `swapp_social_audio_blocks`.
4. Maintenir `SESSION_SECRET` stable, confidentiel et d'au moins 24 caractères. Ne publier ni la valeur ni les URLs MySQL.
5. Définir `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` seulement si un relais TURN sûr est déjà disponible. Sans TURN, plusieurs réseaux mobiles/NAT échoueront en P2P.

## Tests locaux sans Actions facturées

```bash
npm test
node --test test/swapp-social-voice.test.js test/swapp-social-direct-audio.test.js test/swapp-social-audio-privacy.test.js test/swapp-social-mysql-schema.test.js
```

## Vérification à deux comptes, appareils séparés

- Compte A ouvre un salon ; Compte B rejoint : les microphones demandent une permission uniquement après le clic explicite. Couper, réactiver, quitter, changer de salon, recharger, fermer l'onglet.
- En DM, A enregistre un vocal court, l'écoute avant envoi, l'envoie à B. Tester lecture sur Safari iPhone, Chrome Android et PC. Vérifier que B peut lire et qu'un compte C ne le peut jamais.
- Vérifier refus de formats invalides, limite 30 secondes et 512 Kio, quota par jour ; suppression par l'expéditeur. Après 30 jours, les données sont inaccessibles et régulièrement purgées.
- B reçoit une invitation d'appel en restant connecté à la page SOCIAL, peut la refuser, l'accepter, couper le micro et raccrocher. Aucune permission micro sollicitée avant l'acceptation de B.
- A bloque B depuis son profil SOCIAL SWAPP : A et B ne peuvent plus appeler ni échanger de notes vocales. Un appel en cours est interrompu et les anciens fichiers entre A/B deviennent inaccessibles. Tester également blocage initié par B.
- Réseau Wi-Fi vers 4G, iPhone et Android : vérifier si un relais TURN est indispensable, et les permissions audio système.
- Mesurer charge Socket.IO/Hostinger et espace MySQL, puis déployer progressivement.

## Points de confidentialité non résolus

- **Seules les actions « Bloquer » effectuées via le proxy SWAPP sont répliquées dans la table audio MySQL.** Un blocage effectué directement dans une autre interface du service Quantic SOCIAL peut ne pas être connu de SWAPP. Cette synchronisation bidirectionnelle doit être traitée avant de déclarer le système entièrement cohérent entre les deux produits.
- Les enregistrements privés sont conservés sous forme binaire sur MySQL, protégés par authentification et autorisation, **sans chiffrement de bout en bout des fichiers stockés**. Ne pas annoncer du E2EE.
- Les appels WebRTC ne sont pas enregistrés par le serveur, mais un client pourrait naturellement capturer son propre audio.
- Aucun push mobile ni historique d'appels manqués lorsque le correspondant a fermé SOCIAL.
- Un blocage enregistré pour l'audio reste actif ; la levée du blocage doit être conçue explicitement, et synchronisée avec le service SOCIAL, avant la mise en production générale.

Ne pas merger les branches ou annoncer que la production est prête sans validation réelle des éléments ci-dessus.
