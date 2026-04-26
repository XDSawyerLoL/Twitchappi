# Oryon Video Engine — installation PeerTube masquée

Objectif : utiliser PeerTube comme moteur vidéo interne, sans l'exposer comme marque dans l'interface Oryon.

## Architecture

OBS streamer -> `rtmp://live.oryon.fr/live` -> PeerTube -> lecteur intégré dans Oryon -> viewers.

Oryon garde : comptes, pages chaîne, tchat, dashboard, équipes, leveling, découverte.
PeerTube gère : ingestion RTMP, transcodage, diffusion vidéo, HLS/P2P.

## Pré-requis serveur vidéo

- VPS Linux séparé de Render, conseillé : 4 vCPU / 8 Go RAM minimum pour tester correctement le live.
- Domaine : `video.oryon.fr` vers le VPS.
- Domaine ou sous-domaine RTMP : `live.oryon.fr` vers le même VPS.
- Ports à ouvrir : `80`, `443`, `1935`.
- Docker + Docker Compose.

## Installation courte

1. Copier ce dossier `deploy/peertube` sur le VPS.
2. Copier `.env.oryon-video.example` en `.env`.
3. Remplir les domaines, SMTP et mots de passe.
4. Lancer :

```bash
docker compose --env-file .env -f docker-compose.oryon-video.yml up -d
```

5. Dans PeerTube, activer/valider le live et créer un compte technique Oryon si nécessaire.
6. Dans Render, ajouter les variables :

```env
ORYON_VIDEO_MODE=oryon-engine
ORYON_PUBLIC_RTMP_URL=rtmp://live.oryon.fr/live
ORYON_RTMP_URL=rtmp://live.oryon.fr/live
ORYON_PLAYER_EMBED_TEMPLATE=https://video.oryon.fr/videos/embed/{uuid}?autoplay=1&warningTitle=0&peertubeLink=0
ORYON_VIDEO_ENGINE_API_URL=https://video.oryon.fr
PEERTUBE_BASE_URL=https://video.oryon.fr
```

## OBS côté streamer

Dans Oryon > Gestionnaire de stream > OBS :

- Service : personnalisé
- Serveur : `rtmp://live.oryon.fr/live`
- Clé : clé Oryon affichée par le compte
- Résolution : 1920x1080
- FPS : 60 ou 30
- Débit : 6000-8000 kbps en 1080p60
- Intervalle keyframe : 2s

## Note importante

PeerTube permet de créer des lives et d'obtenir une URL RTMP + clé de live. Oryon masque ce fonctionnement derrière "Serveur live Oryon" et "Clé de stream Oryon". Pour une automatisation complète compte Oryon -> live PeerTube, il faudra ensuite brancher l'API PeerTube avec un compte technique.
