# SWAPP — remédiation des alertes npm (9 novembre 2026)

## Statut
Plan de correction préparé sur une branche isolée, **pas déployé**. Le lockfile doit être recalculé avec un accès au registre npm. Ne pas fusionner tant que `npm ci`, les tests et `npm audit` n'ont pas réussi. Les versions ci-dessous proviennent du rapport fourni par le propriétaire ; leur disponibilité et la compatibilité doivent être confirmées par npm.

## Procédure reproductible
```bash
node tools/swapp-security-remediate.js
npm install --package-lock-only --ignore-scripts
npm ci
npm run check
npm test
npm audit --omit=dev --json > security-audit-after.json
```
Inspecter le JSON, la résolution transitive, et le diff de `package-lock.json` ; committer ensemble `package.json` et `package-lock.json` après succès. Le rapport JSON peut contenir des informations d'environnement ; ne pas le publier sans revue.

## Remédiations prévues
- Critiques : proxy-addr >=2.0.8, websocket-driver >=0.7.5.
- Élevées : @grpc/grpc-js >=1.14.5, ws >=8.21.0, engine.io >=6.6.10, socket.io-parser >=4.2.7, node-forge >=1.4.1, @fastify/busboy >=3.2.2, protobufjs >=7.6.5, form-data >=2.5.6.
- Autres : qs >=6.16.1, fast-xml-builder >=1.1.7, body-parser >=1.20.6, nodemailer >=10.1.4.
- uuid 8/9 vers 11 : **non forcé**, car changement majeur ; examiner la chaîne de dépendances et mettre à niveau le paquet parent.
- Si npm refuse un override (contrainte de version ou dépendance directe), mettre à jour le paquet parent plutôt que forcer un lock incohérent.
- Nodemailer 6 -> 10 : vérifier Node supporté, SMTP, transport, encodage des destinataires, TLS et envoi réel avec compte de test avant production.

## Validation fonctionnelle
Tester login/logout, cookies de session, Twitch OAuth, API publiques, MySQL, Socket.IO, chat, émission et lecture HLS, e-mails, uploads et pages d'actualité. Déployer progressivement et contrôler les logs ; conserver un rollback.

## CAPTCHA et HTTP 403
La page « Verifying that you are not a robot » est distincte des alertes npm. Le CDN désactivé ne supprime pas nécessairement les règles LiteSpeed/reCAPTCHA au niveau de l'hébergeur. Demander à Hostinger les événements anti-bot/ModSecurity et les logs HTTP 403 pour l'IP et l'heure concernées. Ne pas contourner le CAPTCHA, désactiver le WAF globalement ni introduire une exception IP universelle. Les corrections npm ne garantissent **pas** la disparition du CAPTCHA.

## Autres constats du code
- CSP opt-in (`CSP_ENABLED` désactivé par défaut) : déployer d'abord en report-only et corriger les ressources nécessaires.
- `frameguard:false` et `frameAncestors:['self','*']` : auditer les besoins d'intégration puis restreindre aux origines autorisées.
- Sessions `MemoryStore` et secret généré si `SESSION_SECRET` absent : vérifier stockage partagé et secret stable sur toutes les instances.
- `app.set('trust proxy',1)` : valider le nombre de reverse proxies réels ; une mauvaise configuration affecte la confiance accordée à l'IP et le rate limiting.
