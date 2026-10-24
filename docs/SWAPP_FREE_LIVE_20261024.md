# SWAPP Live — diffusion native sans service vidéo payant

## Objectif
Préserver les deux entrées de diffusion :
1. **Navigateur** : capture d'écran/caméra dans SWAPP. WebRTC P2P prioritaire.
   Si aucune image n'arrive sur un autre réseau, MediaRecorder envoie des fragments
   compressés vers le serveur SWAPP actuel via HTTPS. Le lecteur essaie MediaSource
   après 9 secondes puis après un échec ICE/décodage.
2. **OBS** : application locale **SWAPP Live** construite en EXE Windows.
   OBS publie sur `rtmp://127.0.0.1:1935/live`; FFmpeg génère des fragments HLS
   dans `%APPDATA%\\SwappLocal\\media`. L'application diffuse le HLS via le tunnel
   HTTP existant, sans fenêtre CMD à l'utilisation.

Aucun compte Livepeer ni fournisseur de diffusion payant n'est requis.
Le relais HTTP consomme néanmoins la bande passante et la mémoire du plan
Hostinger existant : ce n'est pas une infrastructure de streaming illimitée.

## Sécurité et limites du relais navigateur
- Publication par `POST /api/native/browser-relay/:room/chunk`, uniquement avec
  une session SWAPP correspondant au compte ayant lancé le live et un Origin HTTPS.
- Fragments récupérables publiquement pendant le direct uniquement; aucun VOD
  ni écriture sur disque. 10 Mio de mémoire au maximum par salon.
- Deux salons HTTP simultanés par défaut (`SWAPP_HTTP_RELAY_MAX_ROOMS=2`, maximum 5),
  WebRTC restant disponible pour les autres.
- Un seul format MediaRecorder/MSE commun doit être reconnu par l'émetteur et
  le navigateur spectateur. Un émetteur WebM et un spectateur Safari incompatible
  avec WebM ne pourront pas toujours échanger. Aucune garantie de débit à
  grande audience : prévoir une architecture média dédiée si SWAPP grandit.

## Validation requise après déploiement
1. Se connecter à SWAPP depuis Edge sur le PC diffuseur et lancer un direct.
2. Ouvrir `https://swapp.tv/vnhz` depuis Firefox puis un téléphone sur 4G/5G,
   sans compte SWAPP. Vérifier **des images animées et du son**, pas seulement
   le badge « En direct ».
3. Consulter `/api/native/browser-relay/vnhz/state`: `active:true` et un
   `lastSeq` croissant indiquent un flux de fragments HTTP (pas nécessairement
   une lecture effective chez le spectateur).
4. Tester l'arrêt, le passage Wi-Fi/4G et une reconnexion de 30 secondes.
5. Vérifier que l'ancien lecteur local n'est pas choisi quand le navigateur
   SWAPP diffuse; quand seul OBS est actif, son lecteur HLS reste prioritaire.

## Construction de l'application Windows (une fois par le développeur)
Dans `local-agent`, exécuter `npm install` puis `npm run dist:win`, ou
utiliser `BUILD-WINDOWS.bat`. Les livrables NSIS et portable sont générés
dans `local-agent/dist`. L'utilisateur final double-clique sur le setup ou
l'exécutable portable; aucune commande ni fenêtre CMD n'est nécessaire.
Les binaires Electron, FFmpeg et éventuellement cloudflared doivent être
obtenus lors de la construction ou de l'initialisation, depuis leurs canaux
de distribution habituels.

**État :** correctifs implémentés dans le code source. Un vrai test depuis un
téléphone externe et une compilation de l'installateur Windows restent
nécessaires avant d'affirmer que la diffusion publique est réparée.
