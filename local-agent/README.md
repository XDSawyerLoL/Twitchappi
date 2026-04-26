# Oryon Local Agent

Objectif : transformer le PC du streamer en mini-serveur vidéo local.

## Installation

```bash
cd local-agent
npm install
npm start
```

## OBS

Dans OBS :

- Service : personnalisé
- Serveur : `rtmp://localhost:1935/live`
- Clé : ta clé Oryon affichée dans le Gestionnaire de stream

## Player local

Le player local est disponible ici :

```text
http://localhost:8081/player/TA_CLE_ORYON
```

## Pour que les viewers externes voient le live

Il faut exposer le player local via un tunnel public, par exemple Cloudflare Tunnel, ngrok ou Tailscale Funnel.
Ensuite, colle l'URL publique du player dans Oryon > Compte > Profil de chaîne > "Lien player Oryon Local public".

Limite : ce mode dépend de l'upload du streamer et de la stabilité de son PC. C'est une base auto-hébergée, pas encore une infra plateforme.
