# SWAPP PODCAST — essai Hostinger Node.js sans Python ni VPS (7 novembre 2026)

## Pourquoi un essai isolé

Hostinger Web/Cloud prend en charge les tâches planifiées Node.js depuis octobre 2026, mais **pas** les services Python, les workers permanents ou les demandes HTTP de plus de 120 secondes. Ce script n'est jamais appelé par Express, le lecteur vidéo ou le Studio.

Le port Node expérimental de Piper est `pipertts` (https://github.com/itsrealfortune/pipertts). Il utilise ONNX Runtime et des voix *.onnx, mais sa compatibilité réelle, ses licences, sa mémoire et son installation native sur le plan Hostinger actuel **ne sont pas vérifiées**. Aucun déploiement de cette bibliothèque ne doit être présumé réussi.

## Fichiers livrés

- `scripts/swapp-podcast-hostinger-node-pilot.cjs` : validation du brouillon Pikmin, dialogue 30 tours, synthèse de deux voix avec `pipertts`, assemblage WAV et export MP3 si FFmpeg est disponible.
- `test/swapp-podcast-hostinger-node-pilot.test.js` : tests Node natifs, sans téléchargement.
- Rien n'est automatiquement publié ; les anciens MP3 ne sont jamais remplacés.

## Contrôles requis avant activation

1. Exécuter `node --test test/swapp-podcast-hostinger-node-pilot.test.js` hors production.
2. Confirmer les ressources RAM/CPU de l'offre Hostinger ; ne jamais exécuter le modèle en parallèle d'un live.
3. Déterminer si la dépendance `pipertts` et ses binaires natifs peuvent être installés dans **un build isolé**, pas en modifiant les dépendances du serveur SWAPP actuel.
4. Mettre les modèles sous `.swapp-on-air-private/piper-voices` avec les noms `fr_FR-siwis-medium.onnx` et `fr_FR-tom-medium.onnx`, plus leurs fichiers JSON ; vérifier les licences et les droits de redistribution.
5. S'assurer que `ffmpeg` est disponible ; sinon le script s'arrête après sauvegarde du WAV, sans publication.
6. Définir `SWAPP_PODCAST_CRON_ENABLED=1` uniquement dans l'environnement dédié au job, et exécuter `node scripts/swapp-podcast-hostinger-node-pilot.cjs --render` dans un **cron Hostinger**. Ne pas le brancher à une route HTTP.
7. Écouter le MP3 complet et valider les faits, les sources et les voix avant l'import manuel dans le Studio.

**État actuel :** uniquement le code d'essai et les tests de validation sans modèle. Pas de modèle installé, pas d'essai sur Hostinger, pas de nouvelle publication. L'exigence d'un podcast naturel peut nécessiter un meilleur moteur que Piper.

## Sources de compatibilité

- https://www.hostinger.com/support/hostinger-node-js-limits-for-web-and-cloud-plans/
- https://www.hostinger.com/support/how-to-run-cron-jobs-for-node-js-websites-at-hostinger/
- https://github.com/itsrealfortune/pipertts
