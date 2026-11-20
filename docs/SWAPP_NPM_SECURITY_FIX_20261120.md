# SWAPP — Mise à jour de sécurité npm (20 novembre 2026)

## Portée
Quatre avis nouveaux : `GHSA-v36f-rjg3-3v46`, `GHSA-c4gv-fww2-jp3r`, `GHSA-9g4r-f5gq-qjrr` pour `websocket-driver` et `GHSA-cppf-2hm6-mrvm` pour `express-rate-limit`.

- `websocket-driver@0.7.5` -> **0.8.0** (override explicite)
- `websocket-extensions@0.1.4` -> **0.2.0** (requis par websocket-driver 0.8.0)
- `express-rate-limit@7.5.1` -> **8.7.5** (version directe exacte)
- `ip-address@10.7.3` ajouté au graphe comme dépendance d'express-rate-limit ; override explicite pour empêcher le retour à une version transitive vulnérable.
- `debug@4.4.3` déjà présent et compatible.

Les métadonnées `dist.integrity`, `dist.tarball` et dépendances ont été vérifiées via les réponses du registre npm officiel avant rédaction du lockfile. Le lockfile doit être régénéré et comparé par `npm install --package-lock-only --ignore-scripts` en environnement avec réseau npm pour attester une parfaite équivalence npm ; un JSON correct seul n'est pas une garantie d'installation.

## Gates de validation avant déploiement Hostinger
1. Dans une copie isolée du dépôt (pas sur le serveur de production pendant le trafic) exécuter :
   `npm ci --ignore-scripts --no-audit --no-fund`
   `npm ls websocket-driver websocket-extensions express-rate-limit ip-address --all`
   `npm run check`
   `node --test test/swapp-websocket-driver-security.test.js test/swapp-high-security-batch-20261114.test.js test/swapp-moderate-cve-security-20261115.test.js test/swapp-rate-limit-security-20261120.test.js`
   `SWAPP_WS_SECURITY_TEST=1 node --test test/swapp-websocket-driver-security.test.js`
   `SWAPP_RATE_LIMIT_RUNTIME_TEST=1 node --test test/swapp-rate-limit-security-20261120.test.js`
   `npm test`
2. Confirmer l'absence de `websocket-driver@0.7.5`, `express-rate-limit@7.5.1`, `websocket-extensions@0.1.4` et de versions `ip-address` anciennes.
3. Vérifier les limites d'authentification, le contenu des réponses `429`, les réponses de chat et le transport WebSocket/HLS.
4. Sauvegarde + redéploiement contrôlé via Hostinger Node.js Web App ; vérifier /api/release, /api/quantic-id/health et le site /compte et /tv.
5. Si crash, rétablir le déploiement Hostinger précédent. Ne jamais effacer MySQL ou changer les secrets pour déboguer les dépendances.

**Important :** les tests du dépôt anciennement épinglés à websocket-driver 0.7.5 ont été mis à jour pour éviter un verrou de régression trompeur. Pas de nouveau cron ou coût externe automatique.