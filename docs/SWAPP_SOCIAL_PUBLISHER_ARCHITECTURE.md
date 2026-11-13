# SWAPP Social Publisher — état et procédure (10 novembre 2026)

## Livraison sur la branche PR #217

Le module maison est développé, sans Metricool, VPS ni tâche GitHub Actions payante :

- `modules/swapp-news/social-publisher.js` : préparation du post depuis un article réellement publié, web-intent X, file de déduplication persistante, liste des messages et compte rendu manuel.
- `modules/swapp-news/social-publisher-ui.js` et `assets/swapp-social-publisher.js` : page privée `/actus/social-publisher`.
- `modules/swapp-news/router.js` : routes éditoriales authentifiées et création d'événement à la première publication via SWAPP Studio.
- `modules/swapp-news/editorial-release-sync.js` : même événement pour un nouvel article issu d'un lot de veille éditoriale.
- `modules/swapp-news/mysql-store.js` : liste autorisée des collections MySQL comprenant `swapp_news_social_outbox`. Aucune nouvelle table SQL n'est nécessaire : utilisation de `swapp_news_documents` existante.
- `modules/swapp-news/editor-ui.js` : accès au module depuis le menu Studio.
- `test/swapp-social-publisher.test.js` : contrôles des URLs, du statut publié, de la file et des doublons.

### Workflow gratuit opérationnel après déploiement
1. Publier un **nouvel** article dans SWAPP Studio ou via un lot éditorial adopté.
2. Ouvrir `https://swapp.tv/actus/social-publisher` avec un compte éditeur.
3. Sélectionner l'article ; son titre, l'accroche et son URL canonique sont préparés.
4. Cliquer sur « Ouvrir la publication sur X ». Cela ouvre le formulaire officiel de partage prérempli.
5. Vérifier l'identité du compte connecté : **@swappstreaming**. Cliquer soi-même sur « Publier » sur X.
6. Facultatif : copier l'URL publique du nouveau post dans SWAPP pour conserver une trace. SWAPP affiche « lien renseigné », **pas** « envoyé et vérifié ».

Les corrections ultérieures ou nouvelles tentatives d'adoption d'un même article ne réinsèrent pas l'annonce.
Les articles dépubliés ne figurent plus dans la liste de messages prêts à partager.
Aucune donnée de connexion X, cookie de navigateur ou jeton X n'est collecté ou stocké.

### Pourquoi ce n'est pas un autopost X
Les règles X interdisent l'automatisation de leur site via script ; les publications sur leur API officielle sont facturées. Une publication X totalement automatique, sans coût ni autre autorisation, n'est donc **pas** réalisable de façon officiellement conforme.
Sources : https://help.x.com/en/rules-and-policies/x-automation et https://docs.x.com/x-api/getting-started/pricing.
Ne jamais écrire « X publié automatiquement » ou `sent` sans acquittement distant légitime. Le statut `reported` est seulement une déclaration manuelle.

### Tests et déploiement
- Vérification JavaScript des nouveaux fichiers et quatre tests unitaires ciblés réussis localement.
- **Non vérifiés** : suite complète du serveur, tests en staging Hostinger, accès MySQL réel, publication sur X, fonctionnement de la page en production.
- PR #217 reste en brouillon en attendant tests d'intégration et déploiement contrôlé.
- Tester avant fusion : `node --test test/swapp-social-publisher.test.js test/news-editorial-release.test.js test/swapp-news-mysql-store.test.js`.
- Vérifier après déploiement : route privée `/actus/social-publisher`, status `/api/actus/storage-status`, nouvel article test, file unique, dépublication, et aucune régression HLS/OBS.

## Dépendance X future (facultative)
Un adaptateur API X n'est pas activé. Si le propriétaire accepte un jour la facturation ou reçoit un accès écrit officiellement gratuit, ajouter cet adaptateur **avec consentement explicite**, plafond de dépense strict, stockage des secrets côté Hostinger et statuts distants vérifiables. N'activer aucune dépense implicitement.
