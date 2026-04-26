# Oryon Video Engine

Cette version prépare l'utilisation d'un moteur vidéo Oryon basé sur PeerTube, sans afficher PeerTube dans le parcours utilisateur.

## Ce qui est fait dans le code Oryon

- Le gestionnaire OBS affiche : Serveur live Oryon + Clé de stream Oryon.
- La configuration lit les variables Render `ORYON_*`.
- Le statut du moteur vidéo est consultable via `/api/oryon/video-engine/status`.
- Le dossier `deploy/peertube` contient une base Docker pour installer le moteur vidéo sur un VPS.

## Ce qui reste à faire sur l'infra

- Installer PeerTube sur un VPS.
- Pointer `video.oryon.fr` et `live.oryon.fr` vers ce VPS.
- Ouvrir le port RTMP `1935`.
- Créer/associer automatiquement les lives PeerTube aux comptes Oryon via l'API PeerTube.

## Variables Render recommandées

```env
ORYON_VIDEO_MODE=oryon-engine
ORYON_PUBLIC_RTMP_URL=rtmp://live.oryon.fr/live
ORYON_RTMP_URL=rtmp://live.oryon.fr/live
ORYON_PLAYER_EMBED_TEMPLATE=https://video.oryon.fr/videos/embed/{uuid}?autoplay=1&warningTitle=0&peertubeLink=0
ORYON_VIDEO_ENGINE_API_URL=https://video.oryon.fr
PEERTUBE_BASE_URL=https://video.oryon.fr
```
