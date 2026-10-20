# SOCIAL neuf sur MySQL — sans migration de l'historique

## Décision de produit

Il est possible de **ne rien transférer depuis Render** si les anciennes publications, les abonnements, les anciens profils SOCIAL et les messages privés n'ont pas à apparaître dans le nouveau SOCIAL.

Ce choix conserve les **comptes SWAPP existants** : la connexion et les profils principaux restent dans la base MySQL SWAPP. Lorsque le membre ouvre le nouveau SOCIAL, le proxy SSO recrée automatiquement son identité SOCIAL correspondante, sans second mot de passe.

**Aucun contenu de Render n'est supprimé ni modifié** par cette procédure. Le backend Render est conservé comme archive indépendante, tant qu'il existe et que sa base PostgreSQL est maintenue. L'utilisateur ne retrouvera pas son ancien fil, ses anciens abonnements, ses anciennes conversations ou ses anciennes notifications dans SOCIAL neuf. Il ne faut pas lui présenter le nouveau SOCIAL comme une migration des données historiques.

## Ce qui a été préparé

- `tools/swapp-social-fresh-start.js` génère un document SOCIAL vide, conforme au protocole Pulse existant, avec le marqueur `fresh-v1`.
- L'initialisation se fait **uniquement sur consentement explicite** : `--commit --confirm=NEW_SOCIAL_WITHOUT_HISTORY`, `SWAPP_SOCIAL_FRESH_START_APPROVED=1` et comptes SWAPP déjà en MySQL.
- L'initialisation crée une seule ligne `pulse` dans la table dédiée `swapp_social_native_store` et **refuse absolument tout écrasement** d'une ligne existante.
- Aucune migration PostgreSQL n'est requise pour un SOCIAL neuf.
- `SWAPP_SOCIAL_FRESH_START_VERIFIED=1` est **distinct** de l'ancienne autorisation `SWAPP_SOCIAL_MYSQL_MIGRATION_VERIFIED=1`. Ne jamais activer les deux en même temps.
- Le backend contrôle que le document présent dans MySQL porte vraiment le marqueur `fresh-v1` avant de laisser passer les requêtes en mode MySQL.
- Les jetons d'une ancienne session Render sont invalidés lorsque le service cible passe au backend MySQL. Le membre SWAPP reste connecté et reçoit une nouvelle session SOCIAL automatiquement.

## Lancement : ordre strict

**1. Contrôler** le compte SWAPP en MySQL et les variables de connexion `SWAPP_MYSQL_URL`. Si un magasin SOCIAL existe déjà sur MySQL, ne pas initialiser ni l'écraser.

**2. Préparer le nouveau SOCIAL** : laisser `SWAPP_SOCIAL_BACKEND=render` et exécuter le dry-run qui ne fait aucun accès base.

```bash
node tools/swapp-social-fresh-start.js
```

**3. Initialiser une seule fois** depuis un shell privé sur l'application SWAPP avec les secrets MySQL Hostinger déjà configurés. Ne pas copier l'URL MySQL ni les mots de passe dans GitHub ou dans un chat.

```bash
SWAPP_SOCIAL_FRESH_START_APPROVED=1 \
  node tools/swapp-social-fresh-start.js --commit \
  --confirm=NEW_SOCIAL_WITHOUT_HISTORY
```

Aucune nouvelle base n'est nécessaire : seule une table supplémentaire est utilisée. Ne pas laisser `SWAPP_SOCIAL_FRESH_START_APPROVED=1` configuré en permanence.

**4. Vérifier** le magasin sans révéler de données :

`GET https://swapp.tv/api/swapp/social-native/backend-status` doit annoncer `mysql_reachable=true`, `snapshot_present=true`, `snapshot_type=fresh`.

**5. Activer** le mode neuf dans Hostinger (service Node SWAPP) :

```dotenv
SWAPP_ACCOUNT_STORE=mysql
SWAPP_SOCIAL_BACKEND=mysql
SWAPP_SOCIAL_FRESH_START_VERIFIED=1
SWAPP_SOCIAL_MYSQL_MIGRATION_VERIFIED=0
SWAPP_SOCIAL_MIGRATION_FREEZE=0
SWAPP_SOCIAL_FRESH_START_APPROVED=0
```

Redémarrer l'application. Vérifier `active_backend=mysql` et `snapshot_type=fresh`.

**6. Tester** : connecter deux comptes SWAPP, ouvrir SOCIAL depuis les deux, publier, répondre, aimer, reposter, suivre, créer un canal et échanger des messages. Vérifier qu'aucune reconnexion SOCIAL distincte n'est demandée. Actualiser F5 sur ordinateur, iPhone et Android. Tester deux publications concurrentes, notifications, blocages et suppressions.

**7. Conserver Render** en lecture historique. Son arrêt définitif est une décision indépendante à prendre seulement après avoir vérifié qu'il ne sert à aucune autre application Quantic.

## Rollback

- Avant de publier des nouveaux contenus sur MySQL, repasser `SWAPP_SOCIAL_BACKEND=render` remet en service l'ancien historique.
- Après des nouvelles publications, revenir à Render masquerait l'activité MySQL récente. Ne pas faire d'aller-retour sans stratégie de sauvegarde des nouveaux contenus. Les données MySQL restent stockées même si le backend repasse temporairement sur Render.

## Limitations à connaître

- **Nouvelle communauté** : le fil initial est vide, les anciens abonnés et messages ne sont pas récupérés. Les comptes SWAPP restent intacts.
- Le premier magasin MySQL conserve le schéma Pulse monodocument transactionnel. Ce n'est **pas encore un système relationnel optimisé pour des milliers de publications**.
- L'interface et les fonctionnalités déjà disponibles dans SWAPP sont réutilisées ; la parité à 100 % avec X, les tests de charge, la modération et les correctifs de messagerie restent des chantiers séparés.
- **Aucune de ces étapes Hostinger ni l'initialisation de données MySQL n'ont été exécutées automatiquement par GitHub.** Les scripts sont livrés, pas une activation garantie.

## Tests Node

```bash
node --test test/swapp-social-fresh-start.test.js test/swapp-social-source-export.test.js
npm run check
npm test
```

Le mode par défaut reste Render tant que l'administrateur n'active pas explicitement le backend neuf.
