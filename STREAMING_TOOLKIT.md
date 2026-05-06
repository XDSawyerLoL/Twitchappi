# Guide streaming Swapp

## Architecture propre

Swapp accepte deux modes de live :

1. **Live navigateur** : capture écran/caméra en WebRTC P2P. Pratique pour tester vite, mais dépend du navigateur du streamer.
2. **OBS via Swapp Local** : recommandé pour un vrai stream. OBS envoie en RTMP local, Swapp Local transforme en HLS avec FFmpeg et publie un player public via tunnel.

## Ce que le patch corrige

- Le badge “En direct” ne dépend plus d’une seule variable locale.
- La page publique lit `/api/oryon/channel/:login/status`.
- Si le stream est live mais que la source vidéo n’est pas encore prête, la page affiche un état “Connexion au live…” au lieu d’un écran noir.
- Le refresh du streamer garde le live actif pendant la fenêtre de reconnexion.
- Le manager masque correctement l’overlay “Hors ligne” quand le live est actif.

## Endpoints utiles

```txt
GET /api/swapp/streaming/readiness
GET /api/oryon/channel/:login/status
GET /api/native/lives
GET /api/oryon/local-agent/config
POST /api/oryon/local-agent/register-public-url
POST /api/oryon/local-agent/heartbeat
POST /api/oryon/local-agent/stop
```

## Diagnostic page publique

Pendant qu’un streamer est live :

```txt
https://swapp.tv/api/oryon/channel/pseudo/status
```

Il faut voir :

```json
{
  "live": {
    "is_live": true,
    "status": "live",
    "source": "local-agent ou browser-webrtc",
    "player_url": "... si OBS/Swapp Local"
  }
}
```

Si `is_live=true` mais `player_url` est vide, le navigateur live peut encore marcher via WebRTC. Pour OBS/Swapp Local, `player_url` doit être présent.

## OBS + Swapp Local

Swapp Local inclut `ffmpeg-static`, donc l’utilisateur final ne doit pas installer FFmpeg manuellement dans le cas standard.

Commandes :

```bash
npm --prefix local-agent install
npm run stream:local
```

Puis OBS :

```txt
rtmp://127.0.0.1:1935/live
clé affichée par Swapp Local
```

## Tunnel public

Swapp Local tente :

1. Cloudflare Tunnel si `cloudflared` est disponible.
2. `localtunnel` si installé dans `local-agent`.
3. URL manuelle si l’utilisateur a son propre tunnel.

Le bouton “Démarrer sur Swapp” refuse de publier une URL `localhost` pour éviter l’écran noir côté viewer.

## Checklist avant pré-alpha

- Firestore OK.
- Resend ou SMTP OK pour mot de passe oublié.
- `/api/swapp/streaming/readiness` OK.
- Swapp Local installé avec FFmpeg intégré.
- Test OBS réel avec deux navigateurs : streamer + viewer.
- Refresh streamer : le live doit rester en reconnexion, pas passer hors ligne.
- Page `/pseudo` : player visible ou message “Connexion au live…”.
