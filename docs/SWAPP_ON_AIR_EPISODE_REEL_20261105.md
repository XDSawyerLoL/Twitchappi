# Premier MP3 Nova/Kern livré par GitHub

Le dépôt contient désormais un véritable MP3 de 59 secondes, ses deux voix
synthétiques originales et le texte utilisé pour le produire. L'épisode
présente l'annonce Nintendo Pikmin Day du 2 novembre 2026 en distinguant les
faits officiels d'un avis qui nécessiterait de jouer à cette édition.

## Livraison

- Audio : `assets/on-air/pikmin-dandori-le-point-avec-nova-et-kern.mp3`.
- Catalogue : `data/swapp-on-air/episodes.json`.
- Texte : `data/swapp-on-air/episode-pikmin-court-20261105.json`.
- Contrôles : `data/swapp-on-air/review-pikmin-court-20261105.json`.
- Voix réutilisables : `data/swapp-on-air/voices/`.

Le lecteur existant et le flux RSS lisent ce catalogue. Ce mode utilise les
fichiers versionnés, sans dépendre du stockage temporaire du studio. Il faut
que le déploiement Hostinger reprenne réellement le commit contenant ces
fichiers. Un commit ne constitue pas, à lui seul, une preuve de mise en ligne.

## Contrôles réellement effectués

- Sources officielles Nintendo consultées avant la rédaction courte.
- Génération Qwen3-TTS VoiceDesign 1.7B, puis Base 0.6B avec les références
  françaises originales enregistrées dans le dépôt. Aucun humain cloné.
- Transcription indépendante des neuf prises avec Whisper Small, inspection
  des divergences et nouvelle génération de l'introduction pour clarifier SWAPP.
- Absence d'écrêtage sur les prises; décodage complet du MP3 avec FFmpeg;
  durée, codec et taille vérifiés avec FFprobe.
- Normalisation du montage avec une cible de -19 LUFS et -1,5 dBTP.
- Catalogue, page d'épisode et RSS vérifiés localement avec ce MP3.
- Onze tests Node du lecteur et du studio réussis.

Le contrôle audio est **automatique** : `audioReviewed: true` décrit ce
contrôle de transcription et de signal, tracé par `audioReviewMethod`.
`humanListeningReview: false` indique explicitement qu'aucune écoute humaine
n'a été attestée. Ces contrôles ne garantissent pas le naturel subjectif des
voix. Le MP3 indique lui-même que les deux voix sont synthétiques.

La suite Python existante présente deux assertions obsolètes : elle attend le
nom de l'ancien lanceur Python dans le lanceur PowerShell, et interdit le mot
Gemini même dans un commentaire expliquant son absence. Ces deux états étaient
déjà présents dans `1cbee324b8d7037849f8e84535a12aef0eb54c10`.

## Confidentialité de la génération

Les deux scripts de génération définissent désormais `ORT_DISABLE_TELEMETRY=1`,
`HF_HUB_DISABLE_TELEMETRY=1` et `DO_NOT_TRACK=1` par défaut avant le chargement
des dépendances. La génération réalisée ici utilisait des modèles déjà
téléchargés et le mode hors ligne. Aucun service de génération payant utilisé.

## Réutiliser les voix

Les fichiers `nova.wav` et `kern.wav` sont des voix fictives produites pour SWAPP.
Leurs transcriptions exactes et leur provenance sont fournies à côté. Le script
`scripts/swapp-on-air-qwen-local.py` peut les utiliser en mode `clone`, avec
`--authorized-reference`, les deux options `--reference-*` et les deux options
`--transcript-*`. Chaque nouvel épisode doit être contrôlé avant diffusion.
