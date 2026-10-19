# SWAPP : comptes locaux sur Hostinger MySQL

## Ce qui change
Avec `SWAPP_ACCOUNT_STORE=mysql`, les comptes locaux SWAPP (identités, mots de passe déjà hachés, profils, relations aux chaînes, jetons persistants sous forme de hash) sont lus et enregistrés dans la table `swapp_oryon_accounts` de la base MySQL Hostinger existante. Les IDs locaux restent stables et continuent de servir de clé dans les tables Mes jeux / SOCIAL.

Le code historique Firestore reste présent pour d'autres fonctions du site et comme ancien mode non sélectionné ; **il n'est plus lu ni écrit pour les comptes quand le mode MySQL est activé**. Le mode ne migre pas automatiquement les comptes tests et ne les efface pas dans Firestore.

## Activation en Hostinger (sans VPS)
1. Garder une sauvegarde privée du répertoire / des données, même si les comptes actuels sont des tests.
2. Déployer le code depuis la branche de cette fonctionnalité une fois les contrôles passés.
3. Définir `SWAPP_MYSQL_URL` dans les secrets de la Web App Node Hostinger (la même base que SOCIAL si disponible), puis `SWAPP_ACCOUNT_STORE=mysql`. Ne mettre aucun mot de passe dans GitHub.
4. Redémarrer l'application Node après le déploiement. `migrations/mysql/009_swapp_oryon_accounts.sql` est identique au DDL de bootstrap automatique et peut être exécuté dans phpMyAdmin si l'utilisateur SQL applicatif n'a pas de droit CREATE.
5. Ouvrir `https://swapp.tv/api/oryon/persistence-status`. Attendu : `store=mysql`, `mysql=true`, `persistence=mysql:swapp_oryon_accounts`, `github_deploy_safe=true`. Une base neuve peut contenir `users:0`.
6. Inscrire un nouveau compte SWAPP de test et contrôler connexion, déconnexion, F5, nouveau navigateur, récupération du mot de passe et lien avec SOCIAL / Mes jeux. Redémarrer le processus Node, puis revérifier l'authentification et les données.

## Comptes de test existants
La table MySQL démarre vide si elle n'a jamais été créée. Les anciennes identités Firestore restent dans Firestore mais **ne sont pas utilisées**, et les cookies associés ne permettent pas de se reconnecter aux comptes absents de MySQL. Les joueurs pourront recréer leurs comptes.

Attention : tout contenu SOCIAL, points, envies ou salons qui utilise un ancien `user_id` peut rester lié aux comptes de test antérieurs. La création d'un nouveau compte avec le même pseudo n'est pas une migration de ces données. Ne pas associer automatiquement les données d'un ancien identifiant à un nouvel utilisateur uniquement sur son pseudo.

## Sécurité
- Stockage MySQL transactionnel, identifiants et emails uniques, validation des enregistrements, aucune suppression automatique de compte.
- Les passwords conservent le hachage PBKDF2 existant : aucun mot de passe brut n'est exporté.
- Si la connexion MySQL échoue, l'authentification renvoie une indisponibilité ; aucun repli silencieux Firestore/JSON.
- Ne pas supprimer les données Firestore avant d'avoir vérifié le fonctionnement du site et la recréation des comptes nécessaires.
- La branche ne change PAS le backend historique des posts et messages privés de SOCIAL : ces fonctions dépendent encore de Render jusqu'à leur migration distincte.

## Vérification avant fusion
```bash
npm run check
node --test test/swapp-oryon-mysql-accounts.test.js test/swapp-oryon-mysql-mode.test.js
npm test
```
Ne pas déclencher GitHub Actions coûteux : exécuter les commandes localement ou dans l'environnement Hostinger de développement.
