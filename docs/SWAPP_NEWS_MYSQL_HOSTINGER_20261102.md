# SWAPP ACTUS — migration Hostinger MySQL (2 novembre 2026)

## Incident 503 : cause identifiée dans le code

Avant ce correctif, `server.js` n'initialisait `/api/actus` que si Firestore était disponible. Les comptes SWAPP et SOCIAL peuvent fonctionner sur MySQL Hostinger tout en laissant le magazine sur Firestore. Couper les clés Firebase avant d'avoir migré le CMS rend donc la rubrique indisponible.

Le nouveau module `modules/swapp-news/mysql-store.js` fournit le contrat transactionnel nécessaire au CMS, à la publication Discord, aux votes et aux insights. Il utilise **la base MySQL Hostinger existante** et crée uniquement `swapp_news_documents` via `CREATE TABLE IF NOT EXISTS`. Pas de VPS, d'API payante ni de nouveau service. La table est cloisonnée par collection et identifiant.

## Configuration privée du serveur Hostinger

- `SWAPP_NEWS_ENABLED=true`
- `SWAPP_NEWS_BACKEND=mysql` (facultatif si `SWAPP_ACCOUNT_STORE=mysql` et `SWAPP_MYSQL_URL` sont déjà définis)
- `SWAPP_MYSQL_URL` : URL privée existante, ou `SWAPP_NEWS_MYSQL_URL` pour une URL dédiée.
- `SWAPP_NEWS_MIGRATION_VERIFIED=0` **tant que l'intégralité des articles, brouillons, modifications et retraits n'a pas été rapprochée**.

Ne jamais mettre l'URL SQL et son mot de passe dans GitHub, les captures d'écran ou une conversation. Déployer les commits sur Hostinger et redémarrer Node. Les nouveaux fichiers de `modules/swapp-news` doivent être présents dans l'archive du déploiement.

Contrôle de lecture seul : `https://swapp.tv/api/actus/storage-status`

Réponse attendue : `backend: "mysql-hostinger"`, `connected: true`, puis nombre réel de documents. Si `needsImport: true`, la migration des historiques n'est pas encore déclarée complète. Si le backend est `firestore` ou si la route manque, vérifier le SHA effectivement déployé.

## Réintégrer des données, pas les réinventer

**Par défaut aucun brouillon, article, vote ni retrait n'est inventé ou réimporté automatiquement.** Les communiqués GitHub ne sont pas une sauvegarde fiable des modifications et retraits effectués dans le Studio Firestore.

Si les anciens articles ont déjà été transférés vers la table de pilote Hostinger `swapp_migration_news_articles` :

```bash
node tools/swapp-news-mysql-import.js --pilot
SWAPP_NEWS_IMPORT_APPROVED=YES node tools/swapp-news-mysql-import.js --pilot --commit
```

Si un export JSONL privé vérifié est disponible (chaque ligne : `{"id":"slug","data":{...}}`), situé **hors** du répertoire public du site :

```bash
node tools/swapp-news-mysql-import.js --file=/chemin/prive/articles.jsonl
SWAPP_NEWS_IMPORT_APPROVED=YES node tools/swapp-news-mysql-import.js --file=/chemin/prive/articles.jsonl --commit
```

Le premier appel est une prévisualisation sans écriture. Le second requiert une autorisation explicite, refuse les doublons conflictuels et vérifie le contenu après import. Il n'efface jamais les données existantes. La table pilote, si présente, n'est jamais supprimée.

**Important** : cet importateur gère les documents d'articles, pas une migration complète des votes et événements Discord historiques. Les comparer et les migrer séparément si leur conservation est indispensable. Ne pas annoncer la migration globale comme terminée sur la seule base d'un import d'articles.

Si les clés Firestore sont déjà désactivées et qu'aucune sauvegarde ou table pilote n'existe, l'historique exact (y compris les articles retirés) n'est pas récupérable à partir des seuls fichiers de publication GitHub. Ne pas basculer automatiquement sur ces fichiers : cela pourrait republier du contenu volontairement retiré.

**Après vérification exhaustive des données et des retraits** : configurer `SWAPP_NEWS_MIGRATION_VERIFIED=1` dans les variables privées Hostinger, puis redémarrer. Un catalogue vide ou incomplet ne doit pas être annoncé comme une migration réussie.

## Vérifications après déploiement

1. `GET /api/actus/storage-status` retourne `mysql-hostinger`, `connected: true`.
2. `GET /api/actus` retourne 200 avec les articles réellement présents en SQL, ou une erreur explicite si l'import est absent.
3. Un article publié puis retiré reste masqué, même après redémarrage; aucun ancien lot ne le recrée.
4. Le Studio peut créer, modifier et publier un brouillon ; l'outbox et les votes passent par la même couche SQL.
5. Les journaux Hostinger ne signalent ni `news_mysql_url_invalid` ni erreur de droits `CREATE TABLE`.

Ne pas présumer d'un déploiement effectif à partir des commits GitHub. Aucun accès distant à Hostinger ou à son MySQL n'a été utilisé pour ce correctif.
