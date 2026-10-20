# SWAPP SOCIAL — migration sécurisée de Render vers MySQL Hostinger

**Statut : code préparé, migration des données NON exécutée, bascule NON activée.**
Ne jamais annoncer que SOCIAL n'utilise plus Render tant que les vérifications sur Hostinger et un test réel de deux comptes ne sont pas terminés.

## Constat vérifié

- SWAPP utilisait `/api/pulse/*` → proxy Node → service QuanticMinds sur Render.
- La vraie implémentation Pulse est dans `XDSawyerLoL/QuanticSillage/backend/pulse.mjs`. Elle stocke `users`, `handles`, `posts`, `follows`, `likes`, `reposts`, `bookmarks`, `circles`, `circleMembers`, `notifications`, `reports`, `blocks`, `conversations` et `messages`.
- Le serveur source prend en charge PostgreSQL (`PULSE_DATABASE_URL`), MySQL (`PULSE_DB_*`), et **JSON local** (`DATA_DIR/pulse.json`). Le mode réellement utilisé sur Render doit être vérifié : aucun accès à une sauvegarde complète n'a été obtenu par cette implémentation.
- Render QuanticMinds reste **inchangé** : le redéployer avant de connaître son stockage serait dangereux, notamment s'il utilise un fichier temporaire.
- Un export individuel `/api/pulse/export` **n'est pas un dump complet**, ne contient pas toutes les relations et ne peut pas garantir une migration sans perte.

## Contenu du lot

1. `modules/swapp-social-native/pulse.mjs` : adaptation locale de l'API Quantic Pulse. **MySQL Hostinger uniquement**, table `swapp_social_native_store`, aucun démarrage d'un réseau vide, pas de fallback JSON/Firestore/Render à l'intérieur de ce backend.
2. `modules/swapp-social-local-bridge.js` : appels en mémoire, dans le **même processus Node SWAPP**, pas de second service ni de VPS. La validation de session SWAPP et la traduction des pseudos restent dans le proxy original.
3. `modules/swapp-social-native-proxy.js` : sélection contrôlée entre Render historique et service local ; le frontend conserve ses URL `/api/pulse/*`.
4. `tools/swapp-social-render-export.js` : export **en lecture seule** du vrai magasin de données depuis un environnement administratif disposant de ses accès. Il n'est pas déployé dans Render automatiquement.
5. `tools/swapp-social-mysql-import.js` : vérification de structure, relations utilisateurs/posts/messages, empreinte SHA-256, import **une seule fois**, transaction + lecture de contrôle, refus d'écrasement d'un magasin déjà initialisé.
6. `/api/swapp/social-native/backend-status` : état public sans secrets : mode demandé, disponibilité MySQL, présence d'un snapshot, bascule approuvée et gel des écritures.
7. `SWAPP_SOCIAL_MIGRATION_FREEZE=1` : option de maintenance bloquant les écritures `/api/pulse/*` côté SWAPP pendant le cliché final, sans changer les lecteurs existants.

### Schéma et charge

Le premier lot conserve le schéma logique Pulse dans **un document JSON transactionnel en MySQL**. Cela réduit considérablement les risques de conversion de relations et de perte de messages. Il s'agit d'un **socle de migration**, pas du modèle relationnel définitif : il faudra ensuite normaliser les posts, réponses, abonnements et messages en tables indexées pour améliorer les performances à plus grande échelle.

## Préparation obligatoire de la source

1. **Ne pas pousser ni redéployer QuanticSillage/QuanticMinds** avant de connaître la source de vérité et d'avoir extrait une sauvegarde.
2. Vérifier depuis l'environnement Render actuellement en service : `GET /api/pulse/health` expose le type de stockage : `mysql`, `postgres` ou `json`. Ne pas confondre `/health` du site et `/api/pulse/health`.
3. Obtenir un accès administratif au stockage effectif. Le script d'export doit être exécuté dans un environnement **de confiance** disposant des variables `PULSE_DATABASE_URL` ou `PULSE_DB_*`, ou du fichier `DATA_DIR/pulse.json`. Le fichier source brut peut contenir les **messages privés et des hachages de mots de passe** : ne jamais le placer dans le site public, le committer sur GitHub ou le poster dans une conversation.
4. Par exemple, une fois le script installé dans un chemin privé sur la machine/instance qui accède réellement aux données :

```bash
cd /chemin/vers/QuanticSillage/backend
node /chemin/prive/swapp-social-render-export.js --output=/chemin/prive/pulse-full.json
```

Ce script ne modifie pas les données source et refuse d'écraser le fichier de sauvegarde. Le fichier doit être copié par un canal privé et protégé (permissions 0600). **Si la source est du JSON local sur une instance Render sans stockage persistant, récupérer cette sauvegarde avant toute redéploiement ou arrêt de l'instance.**

## Validation et import dans la base MySQL Hostinger existante

D'abord travailler sur une copie sûre du snapshot, sans jamais déposer `pulse-full.json` dans le répertoire web de SWAPP.

```bash
# Étape 1 : audit local SANS connexion à la base
node tools/swapp-social-mysql-import.js /chemin/prive/pulse-full.json

# Étape 2 : seulement après comparaison des utilisateurs, posts et messages,
# et après un gel des écritures sur TOUTES les interfaces de la source.
SWAPP_SOCIAL_IMPORT_APPROVED=1 node tools/swapp-social-mysql-import.js \
  /chemin/prive/pulse-full.json --commit --sha256=EMPREINTE_AFFICHÉE_PAR_L_AUDIT
```

La destination utilise `SWAPP_SOCIAL_MYSQL_URL` si présent, sinon `SWAPP_MYSQL_URL`. **La base de comptes SWAPP n'est ni effacée ni migrée** : SOCIAL utilise une table additive. L'import échoue si `swapp_social_native_store` contient déjà un snapshot.

Les sessions SOCIAL et les challenges temporaires sont réinitialisés volontairement ; aucun post ni message n'est supprimé. Les connexions seront recréées à partir de la session SWAPP et du même secret SSO qu'avant migration. Préserver `SWAPP_SOCIAL_SSO_SECRET` ou son fallback existant.

### Capturer les changements survenus après le premier export

Le snapshot doit correspondre à un **instant où les écritures ont cessé**, ou être complété par un mécanisme de synchronisation validé. Le gel SWAPP n'empêche pas d'autres clients directs de QuanticMinds d'écrire : l'opérateur doit s'assurer que toutes les origines concernées cessent d'écrire pendant le cliché final.

Ne jamais importer une ancienne copie et basculer sans traiter les posts/DMs créés depuis.

## Bascule sans perte de données

Variables Hostinger recommandées avant validation :

```dotenv
SWAPP_ACCOUNT_STORE=mysql
SWAPP_SOCIAL_BACKEND=render
SWAPP_SOCIAL_MYSQL_MIGRATION_VERIFIED=0
SWAPP_SOCIAL_MIGRATION_FREEZE=0
SWAPP_SOCIAL_IMPORT_APPROVED=0
```

Après le dernier export, la comparaison des comptes/relations/messages et le test en environnement non public :

1. `SWAPP_SOCIAL_MIGRATION_FREEZE=1` côté SWAPP et une mesure équivalente pour toutes les écritures QuanticMinds.
2. Effectuer l'**export final**, audit du SHA et import. Vérifier `GET /api/swapp/social-native/backend-status` : `snapshot_present=true`.
3. Mettre `SWAPP_SOCIAL_BACKEND=mysql` et **uniquement après validation** `SWAPP_SOCIAL_MYSQL_MIGRATION_VERIFIED=1`. Si le flag est absent, SWAPP refuse les nouvelles requêtes vers ce mode, **sans se rabattre silencieusement sur Render**.
4. En maintenant le gel des écritures, valider le fil Pour vous/Abonnements, les profils, les réponses, les favoris, les abonnements et les anciens threads/messages avec **deux comptes SWAPP**.
5. Si l'ensemble des données est correct, lever `SWAPP_SOCIAL_MIGRATION_FREEZE=0`. Le backend est alors local, sur le même Node/Hostinger. Tester posts, likes, reposts, DMs, notifications, blocage et modération.
6. Conserver la sauvegarde Render **hors ligne** et révoquer tout accès d'export temporaire. Ne pas supprimer le service source immédiatement.

**Rollback :** avant toute écriture sur le nouveau MySQL, repasser `SWAPP_SOCIAL_BACKEND=render` est réversible. **Après de nouvelles publications sur MySQL**, un retour sur Render sans synchroniser les écritures ferait perdre les changements récents : geler d'abord et prévoir un export inverse contrôlé, ne jamais basculer silencieusement.

## Tests attendus

```bash
npm run check
node --test test/swapp-social-native-mysql-migration.test.js
npm test
```

- Un snapshot sans utilisateur, post, message ou relation obligatoire est refusé.
- Un message rattaché à un utilisateur absent ou un post avec auteur absent est refusé.
- Un snapshot déjà présent n'est jamais écrasé ; la transaction doit être annulée.
- Un import réussi est relu et comparé par SHA-256.
- Les secrets source restent hors des réponses API, des logs et des fichiers servis.
- Sans approbation explicite, la source Render demeure la référence par défaut.
- Un faux host `http://swapp-social.internal` ne peut jamais déclencher une requête réseau externe ; le pont est strictement en mémoire.
- Tous les tests d'ergonomie de /social (mobile, F5, retour navigateur, posts et DMs) doivent être refaits sur la nouvelle base.

## Blocages actuels

- Pas d'accès direct au fichier ou à la table réelle du stockage Render depuis les outils disponibles : **snapshot non récupéré, utilisateurs non migrés**.
- Paramètres Node Hostinger non modifiés : `SWAPP_SOCIAL_BACKEND=render` reste le mode nominal.
- Aucune preuve de test fonctionnel réel sur Hostinger, ni d'amélioration garantie de latence.
- Aucun nouvel hébergement, service vidéo, VPS ou coût de base de données n'a été engagé par ce lot.
