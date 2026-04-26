# Oryon Local

Application locale pour streamer sur Oryon depuis OBS sans VPS.

## Démarrage Windows
Double-clique sur `LANCER-ORYON-LOCAL-WINDOWS.bat`.

## Démarrage macOS / Linux
Lance `./lancer-oryon-local-mac-linux.sh`.

## OBS
- Service : Personnalisé
- Serveur : `rtmp://localhost:1935/live`
- Clé : ta clé Oryon affichée dans le Gestionnaire de stream.

## Rendre le live visible aux autres
Sans tunnel, le player ne fonctionne que sur ton PC. Pour les viewers, expose `http://localhost:8081` avec Cloudflare Tunnel, ngrok ou Tailscale Funnel, puis colle l’URL publique du player dans ton profil Oryon.

## Important
FFmpeg doit être disponible sur le PC pour convertir le flux OBS en HLS. Si la preview reste noire, installe FFmpeg et relance l’application.

## Créer une vraie application Windows (.exe)

Cette version contient Electron Builder. Sur un PC Windows avec Node.js installé :

1. Ouvre le dossier `local-agent`.
2. Lance `BUILD-WINDOWS.bat`.
3. Le `.exe` portable et l'installateur seront générés dans `local-agent/dist/`.

Le package inclut `ffmpeg-static`, donc l'utilisateur final ne devrait plus avoir à installer FFmpeg séparément après build.

Commandes manuelles :

```bash
npm install
npm run dist:win
```

OBS :

```text
Serveur : rtmp://localhost:1935/live
Clé : ta clé Oryon
```
