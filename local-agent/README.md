# Swapp Local — patch tunnel stable

Ce patch désactive localtunnel/loca.lt parce que ce service affiche une page de sécurité dans les iframes. Cette page casse le lecteur public Swapp.

Fonctionnement :

- OBS envoie vers `rtmp://127.0.0.1:1935/live`
- Swapp Local convertit en HLS local avec FFmpeg intégré
- Swapp Local crée un Cloudflare Tunnel en arrière-plan
- le tunnel est vérifié via DNS + `/health`
- si le tunnel tombe ou ne répond pas, l'application le recrée automatiquement
- l'URL publiée sur Swapp n'est plus une URL `loca.lt`

Vérification locale :

```txt
http://127.0.0.1:8081/api/setup/check
```

Le mode idéal sans application serait un serveur RTMP public Swapp, par exemple :

```txt
Serveur OBS : rtmp://ingest.swapp.tv/live
Clé OBS     : ta clé Swapp
```

Mais cela demande un vrai serveur média public dédié, pas seulement l'hébergement web Hostinger.
