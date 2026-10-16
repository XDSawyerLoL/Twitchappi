# SWAPP — Centralisation Hostinger sans ajout de service payant

Statut : **plan de migration préparatoire, aucune donnée transférée**.

> Mise à jour : la priorité est d'abord de déployer sans casse le code SWAPP via Hostinger (ZIP ou FTP/SFTP dans un emplacement de préparation). Les historiques d'événements et anciennes statistiques ne sont **pas** à reprendre. Les comptes, articles, posts et données utiles restent indispensables. Voir [SWAPP_HOSTINGER_SAFE_DEPLOY.md](SWAPP_HOSTINGER_SAFE_DEPLOY.md).\n\n## But et contraintes

- Hostinger héberge déjà SWAPP (application Express/Node démarrée par `app.js`).
- Réutiliser une base MySQL existante sur le **même hébergement Hostinger**, si sa capacité, ses accès et sa structure sont confirmés.
- GitHub reste le dépôt de versions ; aucun GitHub Actions, aucun moteur IA payant, aucun nouveau fournisseur.
- Préserver les articles récupérés de JustPlayer, les comptes et sessions, les votes, les publications SOCIAL et la possibilité de restaurer l'ancien backend.
- Ne jamais supprimer les collections Firestore ni le serveur Render avant une migration vérifiée sur données réelles.
- Ne pas afficher, copier dans Git ou envoyer des mots de passe, clefs de service ni URL contenant des secrets.

## État constaté dans le dépôt

| Composant | Stockage / dépendance actuelle | Migration envisagée |
| --- | --- | --- |
| Application SWAPP | Node.js / Express chez Hostinger | **Conserver** |
| Articles, brouillons, import, outbox | Firestore : `swapp_news_articles`, `swapp_news_outbox`, `swapp_news_import_keys` | Tables MySQL transactionnelles |
| Notes lecteurs SWAPP Score | Firestore : `swapp_article_scores`, `swapp_article_votes` | Votes individuels anonymisés, contrainte unique (article, votant), agrégats recalculables |
| Comptes ORYON et données associées | Firestore : `oryon_users`, `oryon_state`, `oryon_user_logins`, `oryon_user_emails`, `oryon_state_files`, `oryon_viewer_profiles`, `oryon_viewer_events` | Migration spécifique des identités, mots de passe déjà hachés et jetons sans exposition |
| Analytics Twitch | Firestore : `tracked_channels`, `channels`, `games`, `stats_history` + sous-collections horaires/quotidiennes | MySQL avec rétention limitée, index sur canal et date |
| Boosts / alertes / chat | Firestore : `boosts`, `alerts` et collection `CHAT_COLLECTION` configurable | MySQL avec transactions / limites de taille |
| SOCIAL | Proxy SWAPP vers `https://quanticminds.onrender.com/api/pulse` | **Migration distincte** : sauvegarde des comptes, posts, médias, conversations et modération ; vérifier que le serveur Render n'est pas partagé avec Quantic |
| Stockage médias | Dépendances `@google-cloud/storage` / Firebase ; usage effectif à inventorier | Fichiers privés ou espace médias Hostinger après vérification des volumes et des accès |
| Paiements, Twitch, AdSense | Services externes nécessaires à leurs fonctions | Ne peuvent pas être « hébergés » en MySQL ; conserver les APIs utiles sans infra supplémentaire |

**Point d'attention :** une variable `DATABASE_URL` dans `server.js` est présentée comme `postgres-ready`, mais ce statut n'établit pas qu'un backend PostgreSQL fonctionne. Le dépôt ne comporte ni `mysql2` ni `pg` dans ses dépendances principales. Il faut écrire et tester la couche MySQL.

## Étapes de migration

### 0. Vérification Hostinger (lecture seule)

1. Confirmer le type de base existante (MySQL / MariaDB), sa capacité, son espace restant et les limites de connexions pour le plan souscrit.
2. Vérifier l'accès depuis le processus Node sur le **même hébergement**, avec un compte SQL dédié à SWAPP ; privilégier `localhost` et interdire l'accès MySQL ouvert à tous.
3. Inventorier les tables actuelles et sauvegarder **la base existante** avant tout changement.
4. Mesurer sur Firestore les volumes et le nombre de documents, sous-collections, médias et utilisateurs. Chiffrer les exports ; les exports Google peuvent générer des coûts, donc pas d'export massif sans estimation.

### 1. Adapter SWAPP à MySQL sans remplacer les données

- Ajouter `mysql2/promise` au backend Hostinger uniquement après confirmation du serveur MySQL accessible.
- Créer un `storage` commun : implémentations Firestore et MySQL derrière des contrats identiques, puis migrer les fonctionnalités une par une.
- Toute écriture métier utilise une transaction SQL ; index/contraintes uniques pour votes, slug d'article, email/pseudo.
- Préparer un schéma et un import de test **idempotent** dans des tables préfixées `swapp_`, sans modifier les tables existantes d'autres produits.
- Tests manuels depuis Hostinger ; pas d'Actions ni de tâche de fond payante.

### 2. Pilote sans impact utilisateur

- Migrer en premier les articles publiés et brouillons SWAPP dans une **base MySQL de préparation** ou un ensemble de tables `swapp_migration_*` isolées.
- Contrôler nombre de lignes, slug, images, auteurs, sources, dates, brouillons et redirections JustPlayer.
- Lire depuis MySQL uniquement dans des tests isolés ; conserver Firestore en production.
- Préparer une bascule réversible et vérifiée, avec sauvegarde horodatée.

### 3. Votes / comptes / transactions

- SWAPP Score : garantir 1 vote par identité, mise à jour de vote atomique, compteurs corrects ; ne pas conserver d'IP.
- Comptes ORYON : migrer après preuve que connexions, réinitialisations, sessions, permissions rédaction et mots de passe hachés restent fonctionnels.
- Migrer ensuite boost, statistiques et messages ; décider des durées de conservation pour contenir la taille MySQL.

### 4. SOCIAL et Render

- Auditer **séparément** le dépôt, les bases et les utilisateurs du service Quantic SOCIAL actuel sur Render.
- Déployer un backend SOCIAL compatible sur Hostinger, idéalement sous `/api/social` ou via l'actuel proxy `/api/pulse`, sans casser les clients Quantic.
- Migrer comptes, posts, messages et médias avec validation des totaux et du chiffrement/autorisation.
- Basculer le proxy seulement après tests mobiles, authentification, conversation, publication, signalement et rollback.
- Couper Render uniquement s'il n'est plus utilisé par SWAPP **ni aucun autre projet Quantic**.

### 5. Réduction effective de la facture

- Vérifier 7 à 14 jours de fonctionnement stable, rapprochement des données, sauvegardes régulières et restauration essayée.
- Désactiver les identifiants Firestore/Google spécifiques à SWAPP après vérification d'absence d'autres consommateurs.
- Fermer les ressources cloud **uniquement** après export conservé et suppression de toute dépendance résiduelle.
- Vérifier les factures Google Cloud / Render après migration : un simple arrêt d'appel dans SWAPP n'annule pas un abonnement ou une ressource facturée.

## Verrous de sécurité / risques

- Hostinger mutualisé/managed prend en charge **MySQL**, pas PostgreSQL natif. Sur VPS, d'autres moteurs peuvent être installés mais cela change la maintenance et le coût.
- Limites de taille et connexions SQL dépendent du plan. Un hébergement unique est plus simple à gérer, mais devient un **point de défaillance unique**.
- Les fichiers médias ne doivent pas être transférés dans des champs SQL volumineux.
- Ne pas désactiver Firestore ni déplacer des tokens/mots de passe sans migration chiffrée, sauvegarde testée et solution de retour arrière.

## Information encore nécessaire avant modification de la production

- Type exact de la base existante sur Hostinger (MySQL / MariaDB ou autre) et plan d'hébergement.
- Tables déjà occupées / espace libre / accès Node ↔ MySQL.
- Emplacement réel des données Quantic SOCIAL et éventuelle utilisation du backend Render par d'autres sites.

**Cette préparation est uniquement documentaire. Elle ne crée pas de nouvelle instance, de base, de tâche récurrente ou de coût cloud.**
