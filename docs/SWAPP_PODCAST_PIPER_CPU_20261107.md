# SWAPP PODCAST — génération de vraies voix neurales locales (CPU)

Ce chantier remplace **la maquette eSpeak** par deux voix françaises Piper. Aucun abonnement, aucune API payante, aucun VPS ni changement de lecteur. La qualité obtenue doit être jugée à l'écoute : Piper n'est pas ElevenLabs et n'offre pas nécessairement un jeu d'acteur convaincant.

## Lancer sous Windows

Pré-requis : Python 3.10+ (`py`), FFmpeg dans le PATH, connexion Internet lors de la première installation. Depuis la racine du dépôt :

```powershell
powershell -ExecutionPolicy Bypass -File scripts/swapp-podcast-piper-windows.ps1 -InstallerVoix
```

Le lancement initialise un environnement Python isolé, installe `piper-tts` si nécessaire, télécharge **deux modèles** dans `.swapp-on-air-private/piper-voices` puis génère `.swapp-on-air-private/swapp-podcast-pikmin-piper-v1.mp3`.

Une fois les modèles installés, lancer sans `-InstallerVoix`. Un MP3 existant **ne sera jamais écrasé** ; choisir une autre sortie avec le script Python si une nouvelle prise est nécessaire.

Commandes individuelles :

```powershell
python -m pip install piper-tts
python -m piper.download_voices fr_FR-siwis-medium fr_FR-tom-medium --data-dir .swapp-on-air-private/piper-voices
python scripts/swapp-podcast-piper-cpu.py --render
```

## Contrôles et conservation

- Fichier source : `data/swapp-on-air/episode-pikmin-20261105.json` (30 répliques).
- Pas d'enregistrement ou de modification du catalogue public pendant le rendu.
- Ne pas publier automatiquement : écoute humaine intégrale, vérification des faits Nintendo, des droits de redistribution et des licences spécifiques de voix.
- Les fichiers historiques, routes `/on-air`, player et RSS restent intacts.
- Tests sans modèles : `python -m unittest discover -s test -p 'test_swapp_podcast_piper_cpu.py'`.
- La génération réelle n'a pas été exécutée dans l'environnement ChatGPT, dont le réseau de téléchargements est bloqué.

Voix : Siwis (femme) et Tom (homme) dans le catalogue `rhasspy/piper-voices`; vérifier les MODEL_CARD et conditions d'attribution avant redistribution commerciale. On ne distribue aucun modèle dans GitHub.
