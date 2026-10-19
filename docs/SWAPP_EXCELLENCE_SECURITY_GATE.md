# SWAPP Excellence : contrôle avant déploiement

Commande à exécuter sur un poste ayant accès à swapp.tv :

```bash
npm run verify:accounts
```

Avec un minimum de comptes déjà vérifié par l'administrateur :

```bash
SWAPP_PREFLIGHT_MIN_USERS=4 npm run verify:accounts
```

Remplacer 4 par le minimum réellement connu. Le script n'effectue que cinq lectures HTTPS : comptes, version, MySQL, version SOCIAL et disponibilité du service historique. Il ne déploie pas et ne modifie aucune donnée.

Un compte peut être chargé depuis un fichier local même quand Firestore est configuré. Le pré-contrôle refuse alors la validation, indépendamment de la valeur du champ historique `github_deploy_safe`.

Pour migrer SOCIAL hors de Render, préserver les utilisateurs, messages, publications, communautés et droits d'accès. Vérifier des sauvegardes restaurables avant toute bascule. Maintenir le système historique disponible jusqu'à la vérification complète du nouvel environnement. Ne jamais initialiser une base vide pour forcer une validation.

Même un résultat entièrement positif ne prouve pas la réussite des sauvegardes, des écritures, des appels vocaux ou des tests entre deux comptes. Il ne remplace pas `npm run verify:production`, `npm run verify:social` et la recette réelle des navigateurs.
