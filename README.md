# Swapp Live Connector — patch Cloudflare stable

Ce patch transforme l'app locale en connecteur simple : OBS → Swapp, avec Cloudflare Tunnel géré automatiquement.

À copier dans :

```txt
Swapp Local\resources\app\
```

ou :

```txt
Oryon Local\resources\app\
```

Corrections importantes :

- plus de `loca.lt` / localtunnel ;
- URL Swapp par défaut : `https://swapp.tv` ;
- téléchargement automatique de `cloudflared.exe` au premier lancement Windows ;
- tunnel Cloudflare créé uniquement quand on clique sur Start ;
- vérification `/health` avant publication ;
- pas de boucle infinie en cas de 429 ;
- HLS servi via `/hls/...` ;
- le player utilise des URLs relatives, donc il marche aussi via `trycloudflare.com` ;
- readiness réel : HLS n'est prêt que si un segment vidéo `.ts` existe.

Test local :

```txt
http://127.0.0.1:8081/api/setup/check
http://127.0.0.1:8081/player/TA_CLE
```

Pendant le live, le diagnostic doit montrer :

```txt
OBS actif: true
FFmpeg: true
HLS: true
Tunnel: publié
```

Si Cloudflare répond 429, attendre le cooldown. Cliquer Start en boucle aggrave le blocage.
