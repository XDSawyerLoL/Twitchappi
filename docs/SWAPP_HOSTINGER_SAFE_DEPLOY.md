# SWAPP — Déploiement Hostinger sans casse (GitHub → ZIP / FTP)

**Statut : préparation uniquement. Aucun accès FTP, déploiement, écriture MySQL ou arrêt Firestore/Render n'a été réalisé.**

## Architecture retenue

- Hostinger reste le seul hébergeur **de l'application SWAPP** (Node.js/Express) et sera aussi la cible des données importantes (MySQL existant).
- GitHub conserve le code source ; **aucun workflow GitHub Actions** ni API Gemini payante n'est nécessaire.
- La base MySQL existante **ne doit pas être écrasée**. Les nouvelles tables SWAPP seront isolées.
- Ne pas migrer les anciennes statistiques horaires, historiques d'événements de consultation et journaux obsolètes.
- Garder : comptes et connexions, articles/brouillons, posts et messages utiles, favoris/votes, réglages, médias nécessaires et autorisations. Ne supprimer aucune source tant que ces données ne sont pas vérifiées sur Hostinger.

## Important : FTP n'est pas un déploiement Node complet

**FTP/FTPS/SFTP ne copie que les fichiers.** SWAPP est une application Node, pas une simple page statique. Le site actif dépend aussi des packages NPM, variables d'environnement, processus Node et configuration du domaine.

Si SWAPP utilise **Node.js Web App géré dans hPanel**, Hostinger déploie via l'import d'une archive ZIP ou via la connexion GitHub native (indépendante de GitHub Actions) et gère lui-même construction et redémarrage. **Préférer ce mécanisme officiel**, qui conserve l'historique de déploiement, plutôt que d'écraser les fichiers `public_html` par FTP en production.

Si SWAPP utilise **VPS/SSH avec répertoire applicatif Node**, on peut transférer le contenu par SFTP/FTPS vers un répertoire de préproduction, installer les packages depuis le terminal puis basculer la version. Ne jamais envoyer le dossier `node_modules`, les secrets, les dumps SQL ou les fichiers `.env` avec le paquet.

La méthode dépend donc du type exact de configuration Hostinger. Ne pas déplacer des fichiers à l'aveugle vers `public_html` sous prétexte que l'accès FTP existe.

## 1. Préparer le code de GitHub

**Option recommandée sans GitHub Actions ni autre service :**
- Télécharger `https://github.com/XDSawyerLoL/Twitchappi/archive/refs/heads/master.zip` (GitHub → Code → Download ZIP) ou utiliser le clonage déjà disponible.
- Alternativement, dans un checkout Git propre : `node tools/swapp-hostinger-package.js` génère un ZIP des fichiers commités, excluant fichiers non suivis (`.env`, node_modules et dumps locaux). Le programme **refuse** de produire une archive si un chemin manifestement sensible est versionné. Il ne fait aucun upload FTP et ne crée aucun coût cloud.
- Sur le système local, exécuter : `npm ci` puis `npm run check` et `npm test`. Sur un hébergement très limité, éviter d'exécuter les tests complets sur le serveur en production.
- La commande `npm run release:info` doit montrer `complete:true`.

**Paramètres Node à conserver** : application Express, entrée `app.js`, script `npm start`, Node >=20 (version exacte conforme à l'environnement qui fonctionne déjà), mêmes valeurs de variables nécessaires. Ne jamais copier de mot de passe en clair dans Git.

## 2. Déploiement contrôlé Hostinger

1. Sauvegarder le site et sa base existants depuis hPanel ; conserver la dernière version qui fonctionne.
2. Déployer le ZIP via **hPanel → Node.js web app → Deploy/Redeploy** ou dans une nouvelle version de l'application. Si seul FTP est disponible, transférer les fichiers vers un **dossier non actif**. Ne pas supprimer le site actuel.
3. Configurer ou conserver les variables d'environnement dans hPanel, sans les inclure dans l'archive.
4. Vérifier que NPM a installé les dépendances et que l'application démarre avec `npm start`.
5. Tester l'URL de prévisualisation Hostinger : `/`, `/actus`, un article, `/communaute`, login, note article, recherche, images et navigation mobile. Contrôler `/api/release` et `/ads.txt`.
6. Une fois validé, activer la nouvelle version via la fonction de déploiement Hostinger ; maintenir l'ancienne disponible pour retour arrière.
7. Sur la version publiée, exécuter `npm run verify:production` depuis le même checkout si la commande est disponible, puis tester dans un navigateur sur téléphone.

**Rollback** : restaurer immédiatement la précédente version de l'app depuis l'outil de déploiement/sauvegarde Hostinger si route d'accueil, articles, comptes ou SOCIAL échouent. Ne pas essayer de « réparer » en désactivant Firestore ou en vidant les tables. Une sauvegarde MySQL seule ne remplace pas une sauvegarde de fichiers Node.

## 3. MySQL existant : aucun remplacement pour le moment

Les scripts `migrations/mysql/001_news_pilot.sql`, `tools/swapp-mysql-pilot.js` et `tools/swapp-firestore-news-export.js` ne sont **pas appelés par l'application** : ils constituent un pilote éventuel, opt-in. Ne pas les exécuter sur la base existante sans sauvegarde ni test d'accès. Aucun export automatique de Firestore.

Ordre futur de reprise des données :
1. Articles et brouillons.
2. Comptes, mots de passe déjà hachés, permissions et sessions.
3. Publications, messages et réglages utiles.
4. Votes/favoris et données nécessaires à l'interface.
5. Ignorer les anciens journaux d'événements, snapshots horaires et statistiques historiques inutiles.

L'absence d'historiques ne doit **pas** casser les pages qui affichent aujourd'hui des courbes : remplacer proprement par l'état récent ou un message « pas de données historiques ».

**Ne pas couper Firestore/Render** avant que chaque route et l'authentification ne soient fonctionnelles avec MySQL. Certaines données de SOCIAL peuvent appartenir à d'autres applications Quantic.

## Vérification de la méthode choisie

- **Node.js Web App hPanel** : le déploiement ZIP ou via GitHub géré par Hostinger est le plus simple. GitHub Actions reste désactivé et n'est pas facturé par ce mécanisme.
- **FTP/SFTP vers VPS ou hébergement classique** : nécessite le chemin exact de l'application Node active et sa commande de redémarrage.
- **FTP vers `public_html` sans gestion Node** : insuffisant, ne pas remplacer l'application existante.

Objectif mesurable : même contenu et mêmes connexions sur la nouvelle version, aucun écran cassé, aucun paiement automatique nouveau, et rollback testé.
