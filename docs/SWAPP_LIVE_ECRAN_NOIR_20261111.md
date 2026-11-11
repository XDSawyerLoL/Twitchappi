# SWAPP Live : écran noir immédiatement après démarrage — diagnostic et correctifs

Date : 11 novembre 2026.

## Deux causes techniques indépendantes

1. **Relais média lié à un unique processus Node.** Les fragments OBS HLS et les fragments MediaRecorder du navigateur étaient conservés dans des `Map` en mémoire. Avec plusieurs workers et un reverse proxy sans affinité de session, `PUT`/ `POST` peuvent atteindre le worker A et `GET` le worker B. Celui-ci ne possède pas les segments et répond 404/410 ou « inactive », provoquant un écran noir.
2. **Protection amont reCAPTCHA Enterprise.** Le contrôle externe du 11/11/2026 sur `/vnhz`, `/api/oryon/local-relay/vnhz/probe`, `/api/oryon/local-relay/vnhz/state` et `/api/native/browser-relay/vnhz/state` renvoie une page HTML « This site is exceeding reCAPTCHA Enterprise free quota » et non le contenu/JSON demandé. **Aucun correctif Node ne peut réparer une requête bloquée avant Node.** Corriger la règle de sécurité dans le service qui l'applique ; ne pas contourner CAPTCHA ou mettre une clé secrète dans le navigateur.

## Modification du transport SWAPP

- OBS HLS : disque partagé automatiquement sous `<ORYON_DATA_DIR ou dossier data du projet>/.swapp-live-relay`, sauf si `SWAPP_DIRECT_RELAY_SHARED_DIR` fournit un chemin absolu. Segments écrits par renommage atomique, playlist publiée après ses segments ; nettoyage des anciens fichiers pour éviter un VOD implicite et l'occupation disque sans limite.
- Navigateur : MediaRecorder envoie au stockage borné `<répertoire HLS partagé>/.browser-relay`, pouvant être consulté par les autres processus du **même système de fichiers**. Vérification de la session SWAPP ou du cookie mémorisé **en lecture seule** pour chaque upload, sans rotation du cookie ni écriture MySQL à chaque fragment. Les vidéos sont temporaires, taille bornée à 10 Mio par salon, un seul diffuseur par compte. Pas d'accès à d'autres comptes.
- Statuts publics `/api/oryon/channel/<login>/live-ping` et `/status` : lecture des vrais fragments récents partagés. Un seul fragment d'initialisation WebM/MP4 ne suffit pas à annoncer la lecture. Si OBS HLS est vérifié et simultanément un ancien salon WebRTC subsiste, **HLS réel est prioritaire**.
- Lecteur navigateur : privilégier les fragments WebM supportés simultanément par MediaRecorder et MediaSource sous Edge/Chromium ; MP4 reste proposé selon les capacités. Afficher un avertissement au diffuseur si l'envoi HTTP échoue.
- Dépendances : aucun VPS, API payante ou nouveau serveur. Les chemins ont une durée de vie limitée ; ils ne constituent pas des archives de vidéos.

**Important** : un même *chemin absolu* ne garantit pas un système de fichiers réellement partagé si Hostinger lance plusieurs répliques séparées. Dans cette configuration, il faut utiliser une seule instance Node pour l'ingestion/la lecture, ou un volume réellement partagé. Socket.IO WebRTC sur plusieurs processus exige également une affinité de session ou un adaptateur partagé, que ces changements n'introduisent pas.

## Vérification de production, dans cet ordre

1. Accéder sans défi reCAPTCHA à `/api/oryon/local-relay/<login>/probe` et à `/api/native/browser-relay/<login>/state`. Si le type de contenu est HTML reCAPTCHA, corriger d'abord la sécurité amont. Ce n'est pas un problème de codec ni de navigateur.
2. OBS : cliquer sur « Tester la connexion HTTPS OBS » puis lancer un test H.264/AAC 720p30 ; dans `/api/swapp/obs-hls/diagnostics` (propriétaire uniquement) vérifier `stage=live`, puis dans `/probe` `media_fresh=true`, `playlist_ready=true`, `segment_ready=true`, `media.video_browser_compatible=true`. Comparer `worker` ou `instance` entre plusieurs lectures et vérifier le même média.
3. OBS : ouvrir `/api/oryon/local-relay/<login>/index.m3u8` depuis deux navigateurs ; chaque segment annoncé doit être accessible et comporter des paquets MPEG-TS. Ne jamais exposer l'URL PUT avec la clé OBS.
4. Navigateur : `/api/native/browser-relay/<login>/state` doit afficher `active=true` avec `lastSeq` en croissance et `shared_storage=true`, même quand les requêtes arrivent sur plusieurs workers. `/segment/0` puis `/segment/<lastSeq>` doivent renvoyer du binaire, pas du HTML.
5. Ouvrir la chaîne depuis **un autre navigateur et un téléphone hors Wi-Fi**, valider images réellement animées et audio. Tester après 30 secondes, puis après plusieurs minutes et une reconnexion. Un badge « LIVE » et une image poster ne sont pas des preuves de lecture.
6. Vérifier la consommation disque temporaire et les journaux HTTP 403, 404, 409, 410, 429 et 503 sans y copier les clés de stream. Si `shared_storage_enabled` vaut true mais que les fichiers diffèrent entre instances, les répliques n'ont pas le même volume.

## Tests de code

`node --test test/swapp-live-shared-worker-black-screen.test.js test/swapp-direct-hls-relay.test.js test/swapp-browser-http-relay.test.js test/swapp-native-live-public.test.js`

Ces tests ne remplacent pas une émission OBS réellement décodée ni l'essai du pare-feu Hostinger. Un commit GitHub ne prouve pas le déploiement.
