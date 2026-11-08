# SWAPP Live Windows 1.2.0 — Studio natif sans OBS

## Ce que cette branche apporte

- L'EXE ouvre le nouveau Studio au démarrage; le mode OBS reste accessible et conserve son fonctionnement.
- Choix du moniteur, de 30/60 FPS, du débit et d'une entrée audio DirectShow facultative.
- La capture essaie DirectX (DDAGrab), puis Windows classique (gdigrab) si aucun HLS n'arrive. L'utilisateur peut aussi forcer l'un des modes.
- La capture alimente le RTMP local interne de SWAPP Live; le serveur crée un HLS présenté en aperçu avant toute publication.
- « Lancer le direct » utilise la publication SWAPP existante après connexion au compte; « Arrêter » coupe la publication et la capture.
- Les commandes de capture POST exigent le même Origin localhost que l'application et ne sont pas exposées au tunnel public.

## Limites explicites

- Les jeux en plein écran exclusif, les anti-cheats et les contenus protégés peuvent encore produire une image noire selon les pilotes. Cette méthode n'injecte pas de pilote de capture de jeu.
- Pas de mixage audio système + microphone automatique. Un seul périphérique DirectShow optionnel; sinon AAC silencieux.
- Le repli gdigrab capture tout le bureau virtuel, pas uniquement le moniteur demandé.
- Les limites du relais Hostinger existant restent en place.
- La compilation de l'EXE 1.2.0 et son test sur Windows réel restent à effectuer.

## Validation avant release

1. Sur Windows, lancer depuis la racine du dépôt : node --test test/swapp-native-desktop-studio.test.js test/swapp-local-ui-simplify.test.js test/swapp-local-tunnel.test.js test/swapp-electron-runtime-package.test.js
2. Dans local-agent : npm install puis npm start; vérifier le démarrage sur /studio.
3. Sans connexion au compte, démarrer la capture et vérifier que l'aperçu fonctionne sans rendre le direct public.
4. Tester bureau, jeux DirectX plein écran et capture Windows classique, sur un ou plusieurs moniteurs.
5. Tester l'audio choisi et écouter un spectateur distant. Sans entrée, le son reste volontairement silencieux.
6. Connecter SWAPP, lancer le direct, puis regarder la chaîne sur un autre réseau pendant au moins cinq minutes.
7. Arrêter, vérifier que FFmpeg est coupé et que le mode OBS classique marche encore.
8. Après validation Windows, construire dans local-agent avec BUILD-WINDOWS.bat sur un poste préparé, ou déclencher manuellement le workflow GitHub, avec contrôle préalable des éventuels coûts de minutes runner.

Aucun workflow payant n'est automatiquement déclenché et la branche ne déploie pas le site.
