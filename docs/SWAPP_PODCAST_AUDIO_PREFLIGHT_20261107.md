# PODCAST — contrôle technique hors ligne du nouvel épisode

Le renommage **PODCAST** est dans la PR #208. Les anciens MP3 et les anciennes routes restent en place.

## Avant de publier un nouveau MP3

1. Générer la nouvelle prise locale avec `scripts/swapp-on-air-start-fr.ps1` et un nom de sortie distinct. Ne jamais écraser l'ancien fichier.
2. Vérifier le WAV sans réseau, API ni service payant :

   ```powershell
   python scripts/swapp-podcast-audio-preflight.py .swapp-on-air-private/swapp-podcast-pikmin-dialogue-v2.wav
   ```

3. En cas de code de sortie 1 ou 2, **ne pas publier** : inspecter l'épisode. Le contrôle couvre la durée minimale, le volume global, les longues plages de silence et l'écrêtage.
4. Même si `technical_pass` vaut `true`, **écouter intégralement** les échanges Nova/Kern, vérifier la prononciation, la cohérence des répliques, la conformité des sources et l'absence de phrases adressées artificiellement aux auditeurs.
5. Comparer la durée du WAV et celle du MP3, vérifier la lecture et la navigation dans le Studio avant publication.

Ce précontrôle est volontairement **indépendant du lecteur et du serveur**. Il n'enregistre pas d'approbation humaine, ne publie rien, n'accède pas à Hostinger et ne prétend pas confirmer la qualité éditoriale.

Tests ciblés : `python -m unittest discover -s test -p 'test_swapp_podcast_audio_preflight.py'`.
