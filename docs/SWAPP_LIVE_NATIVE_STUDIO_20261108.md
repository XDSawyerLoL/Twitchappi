# SWAPP Live Windows 1.2.0 — Studio natif sans OBS

## Ce que cette branche apporte

- L'EXE ouvre le nouveau Studio au démarrage; le mode OBS reste accessible et conserve son fonctionnement.
- Choix du moniteur, de 30/60 FPS, du débit et des entrées de jeu/microphone DirectShow (si elles existent).
- Encodage H.264 NVIDIA NVENC en priorité sur les GPU compatibles, avec repli x264 logiciel ; mode de capture et encodeur aussi sélectionnables manuellement.
- Mélange audio `amix` des deux entrées DirectShow configurées (Stereo Mix/loopback + micro) vers AAC stéréo.
- La capture essaie DirectX (DDAGrab), puis Windows classique (gdigrab) si aucun HLS n'arrive. L'utilisateur peut aussi forcer l'un des modes.
- La capture alimente le RTMP local interne de SWAPP Live; le serveur crée un HLS présenté en aperçu avant toute publication.
- « Lancer le direct » utilise la publication SWAPP existante après connexion au compte; « Arrêter » coupe la publication et la capture.
- Les commandes de capture POST exigent le même Origin localhost que l'application et ne sont pas exposées au tunnel public.

## Limites explicites

- Les jeux en plein écran exclusif, les anti-cheats et les contenus protégés peuvent encore produire une image noire selon les pilotes. Cette méthode n'injecte pas de pilote de capture de jeu.
- Les deux entrées audio sont mixées quand une entrée système DirectShow (Stereo Mix / loopback) et un microphone sont réellement disponibles. L'application ne dispose pas encore de capture système WASAPI native et ne peut pas garantir le son du jeu sur tous les PC ; sinon AAC silencieux ou microphone seul.
- Le repli gdigrab capture tout le bureau virtuel, pas uniquement le moniteur demandé.
- Les limites du relais Hostinger existant restent en place.
- La compilation de l'EXE 1.2.0 et son test sur Windows réel restent à effectuer.

## Validation avant release

1. Sur Windows, lancer depuis la racine du dépôt : node --test test/swapp-native-desktop-studio.test.js test/swapp-local-ui-simplify.test.js test/swapp-local-tunnel.test.js test/swapp-electron-runtime-package.test.js
2. Dans local-agent : npm install puis npm start; vérifier le démarrage sur /studio.
3. Sans connexion au compte, démarrer la capture et vérifier que l'aperçu fonctionne sans rendre le direct public.
4. Tester bureau, jeux DirectX plein écran et capture Windows classique, sur un ou plusieurs moniteurs.
5. Tester séparément le microphone, Stereo Mix et les deux ensemble avec le mixage. Écouter depuis un spectateur distant et confirmer l'absence de double/écho.
6. Tester l'encodage NVENC sur un PC NVIDIA et le repli x264 sur un PC sans NVENC.
7. Connecter SWAPP, lancer le direct, puis regarder la chaîne sur un autre réseau pendant au moins cinq minutes.
8. Arrêter, vérifier que FFmpeg est coupé et que le mode OBS classique marche encore.
9. Après validation Windows, construire dans local-agent avec BUILD-WINDOWS.bat sur un poste préparé, ou déclencher manuellement le workflow GitHub, avec contrôle préalable des éventuels coûts de minutes runner.

Aucun workflow payant n'est automatiquement déclenché et la branche ne déploie pas le site.
