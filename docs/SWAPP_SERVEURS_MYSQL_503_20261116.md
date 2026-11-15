# SWAPP SERVEUR + — diagnostic de la panne HTTP 503 (16 novembre 2026)

## Cause potentielle identifiée et corrigée dans le code

Les comptes SWAPP peuvent lire `SWAPP_ACCOUNT_MYSQL_URL` (voir `server.js`), mais le module SERVEUR + ne consultait auparavant que `SWAPP_SERVERS_MYSQL_URL` et `SWAPP_MYSQL_URL`. Un hébergement Hostinger configuré uniquement avec l'URL du compte pouvait ainsi authentifier ses utilisateurs tout en renvoyant `swapp_servers_mysql_not_configured` et HTTP 503 pour le classement.

La résolution des connexions suit désormais **cet ordre strict** :
1. `SWAPP_SERVERS_MYSQL_URL` — URL dédiée, si définie.
2. `SWAPP_MYSQL_URL` — base partagée SWAPP, si définie.
3. `SWAPP_ACCOUNT_MYSQL_URL` — la base MySQL des comptes déjà fonctionnels.

`DATABASE_URL` n'est jamais utilisé comme repli : il peut correspondre à PostgreSQL. Aucune URL ni aucun mot de passe ne sont imprimés dans les journaux ou renvoyés par l'API.

## Protection des inscriptions

- Les lectures publiques ne lancent plus de `CREATE TABLE` si la table centrale des serveurs est absente de la base sélectionnée. Il vaut mieux révéler une mauvaise configuration que créer silencieusement un deuxième annuaire vide.
- Les routes explicites d'écriture/construction conservent leur initialisation existante ; aucune suppression, migration ou réécriture des inscriptions n'est déclenchée par ce correctif.
- Les requêtes publiques et le diagnostic partagent désormais la **même expression SQL** de filtre, compatible avec le mode `ANSI_QUOTES` et avec des tags absents via `CONCAT_WS`. Les critères d'inscription publiée et les paramètres SQL restent inchangés.
- La route `GET /api/swapp/serveurs` trace uniquement une phase et un code d'erreur : `mysql_connection`, `published_count`, `listing` ou `optional_enrichment`. Ni identifiants, ni SQL complet, ni données personnelles.

## Diagnostic après déploiement Hostinger

Connecté avec un compte réellement administrateur (contrôlé par `ORYON_ADMIN_USER_IDS`), ouvrir :

`https://swapp.tv/api/swapp/serveurs/diagnostic`

Interpréter la réponse JSON :
- `configSource` indique le **nom** de la variable MySQL sélectionnée, jamais sa valeur. `null` et `reason=mysql_not_configured` indiquent une connexion absente ; `injected` n'apparaît que dans les tests avec base simulée.
- `status=connected`, `publicCount.status=ready` et `listing.status=ready` confirment que les requêtes essentielles réussissent. Il faut ensuite vérifier `GET /api/swapp/serveurs` dans le navigateur réel.
- `publicCount.status=unavailable` signifie que **le filtre SQL du classement**, et non simplement le chargement des tables, échoue. Le code SQL sûr dans `publicCount.reason` aide à localiser la panne.
- `listing.status=fallback_ready` signifie qu'une table facultative (votes/branding) manque mais que la base des serveurs reste lisible ; les vrais serveurs doivent rester visibles sans métriques inventées.
- `counts.published` et `counts.pending` sont les comptes effectivement stockés. Si `published=0` mais des fiches existent dans une autre base, vérifier le nom de base utilisé par Hostinger. **Ne pas recréer d'anciennes fiches ni forcer leur publication**.
- `reason=schema_not_initialized` signale qu'aucune table centrale n'existe dans la base choisie. Identifier la base initiale avant toute création/migration.
- Une page HTML de challenge reCAPTCHA/anti-bot à la place du JSON indique une panne de protection ou de quota, distincte d'un HTTP 503 émis par Node.

Si le compte administrateur reçoit HTTP 403, contrôler `ORYON_ADMIN_USER_IDS` dans la configuration Hostinger et les journaux correspondants sans partager d'identifiants secrets ici.

## Vérifications

- Tests isolés du module : choix de configuration dédiée/partagée/compte, absence de repli PostgreSQL, compteurs et listing fonctionnels, simulation de code SQL en échec, diagnostic privé.
- Tests ajoutés dans `test/swapp-servers-hostinger-mysql-config-20261116.test.js` et `test/swapp-servers-diagnostic-and-waf-20261115.test.js` renforcé.
- `npm test` complet et exécution sur la vraie base Hostinger **non effectués**.
- **GitHub n'est pas Hostinger** : déployer le commit fusionné, redémarrer Node, vérifier la version `/api/release`, puis contrôler les réponses réelles et les logs.
