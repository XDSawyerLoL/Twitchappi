# OBS → SWAPP TV : diffusion directe sans SWAPP Local (25 octobre 2026)

## Résultat souhaité

OBS Studio **seul** capture le jeu, la voix, les scènes et le son. SWAPP TV reçoit directement, sur `https://swapp.tv`, les segments HLS produits par le mode de streaming HLS natif d'OBS ; le site vérifie la clé personnelle, publie le direct et affiche la chaîne.

Aucune application « SWAPP Local », aucun tunnel, aucune API payante et aucun VPS supplémentaire.

**OBS n'utilise pas ici « Serveur personnalisé / RTMP »** : Hostinger Node web/cloud n'accepte pas de ports d'entrée RTMP/SRT personnalisés. La méthode choisie est **OBS HLS via HTTPS PUT**, prise en charge par son muxer `ffmpeg_hls_muxer`.

## Réglage unique OBS sous Windows

1. Fermer OBS.
2. Télécharger `tools/configurer-obs-swapp-hls.ps1` et l'exécuter dans PowerShell. Ce script sauvegarde puis adapte exclusivement la liste de services OBS de l'utilisateur, sous `%APPDATA%\obs-studio\plugin_config\rtmp-services`. Il ne télécharge ni n'installe d'autre logiciel.
3. Relancer OBS. Paramètres → Stream → **Afficher tous les services** → `SWAPP Live (HTTPS HLS)`.
4. Dans SWAPP → espace streamer → Gestionnaire de diffusion, copier la **clé privée OBS**. Coller cette clé dans le champ de clé de stream OBS.
5. Paramètres → Sortie : vidéo **H.264** (NVENC, AMF, QuickSync ou x264), CBR, 6000 à 8000 kb/s, intervalle d'images clés 2 secondes ; audio AAC 128–160 kb/s. Tester d'abord 720p30 si Hostinger ou le réseau présente une instabilité.
6. Dans OBS, cliquer simplement sur **Démarrer le streaming**. Le dashboard SWAPP affiche l'état « En attente du flux OBS », puis « En direct sur SWAPP » seulement après la réception de **segments vidéo réellement valides**.

Le réglage du service HLS est ponctuel. Après configuration initiale, plus besoin d'ouvrir un site ni de lancer d'application pour **publier** depuis OBS ; SWAPP transmet le contenu au lecteur public et le titre/la catégorie sont modifiables dans le dashboard.

Le fichier `assets/swapp-obs-hls-preset.json` contient la définition vérifiable du service pour les versions non Windows.

## Ingest SWAPP

`PUT https://swapp.tv/api/swapp/obs-hls/put?cid={stream_key}&file=index.m3u8`

OBS transforme `file` pour les segments `index0.ts`, `index1.ts`, etc. Le backend convertit ces noms en `seg_0.ts`, `seg_1.ts` et réutilise les vérifications, quotas et lecteur HLS SWAPP actuels. **Ne pas coller la clé personnelle dans une URL destinée au partage : la clé doit rester privée dans OBS.** Les logs Node masquent les paramètres sensibles ; vérifier également les journaux d'accès de Hostinger.

La publication n'est confirmée que lorsque le serveur a une playlist et de véritables segments MPEG-TS. La détection reste limitée au processus Node sur Hostinger.

## Prérequis / limites

- Hostinger doit accepter les requêtes HTTPS `PUT` contenant les fragments HLS. La compatibilité avec le proxy Hostinger n'est pas encore prouvée en production.
- Le relais reste limité à **deux salons actifs par défaut**, en mémoire dans un seul processus Node. Sa bande passante doit être mesurée avec des spectateurs réels avant tout lancement public à grande échelle.
- Le débit peut rester proche de la qualité OBS d'origine (pas de transcoding imposé). Il faut néanmoins un réseau stable, sinon le direct peut s'interrompre ou être retardé.
- HLS n'offre pas une latence nulle. Ne pas annoncer « zéro latence ».
- Les versions récentes d'OBS peuvent écraser la liste personnalisée lors d'une mise à jour ; relancer le script de configuration si SWAPP disparaît du sélecteur, en attendant l'intégration officielle de SWAPP aux services OBS.
- Les streamers déjà sur SWAPP Local peuvent continuer provisoirement jusqu'à la validation en production.

## Tests prioritaires à faire en production

1. Vérifier que le commit est déployé sur Hostinger et que le site renvoie les nouveaux fichiers `swapp-obs-direct-dashboard.js` et `swapp-obs-hls-preset.json`.
2. Configurer OBS 31+ via le script. Confirmer que le service SWAPP affiche une destination **HLS**, pas « Custom RTMP ».
3. Démarrer 720p30 H.264/AAC, puis tester 1080p60. Relever les requêtes PUT sans afficher les clés et le diagnostic `/api/oryon/local-relay/<login>/probe`.
4. Vérifier `/api/oryon/local-relay/<login>/state` avec `active:true` et `segment_age_ms` faible ; puis l'URL publique de la chaîne sur Firefox/Edge et un téléphone en données mobiles. Valider **image animée ET son**.
5. Confirmer titre, catégorie, chat, nombre de vues réelles, et fin automatique du live lorsque OBS s'arrête.
6. Tester la reconnexion OBS, l'expiration d'une ancienne clé après régénération, les uploads malveillants refusés, et plusieurs spectateurs simultanés.
7. Ne retirer définitivement la méthode SWAPP Local que quand les tests réels 2–6 sont terminés et reproductibles.

## Tests de code

```bash
node --test test/swapp-direct-hls-relay.test.js
```

Un jeu de vérifications simulées sur la route PUT a validé le rejet d'une clé invalide, le rejet de chemins interdits, le refus des playlists sans médias, la réception des segments et du manifeste et la publication du lecteur. Il ne remplace pas un essai OBS réel.


## Diagnostic de réception (26 octobre 2026)

Si OBS semble diffuser mais le dashboard affiche « En attente du flux OBS » :

1. Vérifier que la dernière version de SWAPP est déployée sur Hostinger et recharger le dashboard. La nouvelle rubrique « Réception OBS » affiche l'état exact du relais.
2. Cliquer **Tester la connexion HTTPS OBS** : cette requête PUT est effectuée sans clé ni vidéo. En cas d'échec HTTP 404/405/403, vérifier la route Node déployée et les règles Hostinger/proxy/WAF sur la méthode PUT.
3. Lire le diagnostic authentifié `GET /api/swapp/obs-hls/diagnostics` depuis le dashboard : `no_upload` (rien reçu), `upload_detected` (premier contact), `segments_only` (MPEG-TS reçus mais playlist absente/invalide), `rejected` (statut HTTP), `upload_stale` (flux interrompu), `live` (segments et playlist validés).
4. Si `no_upload` après un test PUT réussi, vérifier OBS : service SWAPP **HLS** sélectionné (pas RTMP personnalisé), clé présente, démarrage réel, journal OBS. Le muxer HLS OBS peut ignorer des erreurs HTTP, donc le voyant OBS « émission » seul ne prouve pas que SWAPP reçoit de la vidéo.
5. Si `rejected`, regarder le code HTTP : 400 corps ou nom invalide (souvent proxy / transfert chunked), 409 playlist avant les segments, 413 taille trop grande, 422 média/playlist incorrect, 429 capacité / débit dépassé, 503 service indisponible.
6. Si `live` mais que le lecteur reste noir, vérifier séparément le player, la compatibilité H.264/AAC et la réception depuis un navigateur/réseau externe.

Le diagnostic ne retourne jamais la clé OBS, l'IP ou l'URL portant le paramètre secret. Ne partage jamais de journaux contenant ta clé de diffusion sans la masquer.

**Important :** ces tests de code et ces écrans ne prouvent pas que l'instance de production Hostinger a déployé la version actuelle ou autorise le transfert HTTP PUT avec corps chunked. Le seul critère final reste la lecture audio/vidéo observée depuis un autre navigateur.


## Correction du rejet HTTP 422 — 26 octobre 2026

**Cause reproduite avec FFmpeg 7.1** : pour le service HLS HTTPS PUT
\`https://swapp.tv/api/swapp/obs-hls/put?cid={stream_key}&file=index.m3u8\`,
FFmpeg génère des URI de segments dans la playlist comme
\`put?cid=<clé-privée>&file=index0.ts\`, et non \`index0.ts\`.
Le validateur SWAPP précédent rejetait ces lignes avec HTTP 422.

**Correction** :
- Normalisation dans \`modules/swapp-obs-hls-playlist.js\` de ces références en \`seg_0.ts\`, \`seg_1.ts\` et suivantes.
- Rejet des URI externes, des chemins de traversée, des clés ne correspondant pas à la chaîne, et des playlists chiffrées ou non prises en charge.
- Reconstruction de la playlist publique **sans aucune URL ou clé OBS**.
- Acceptation d'une playlist envoyée avant les segments qu'elle référence, comme observé dans un vrai flux FFmpeg ; SWAPP n'annonce le live qu'après réception des fragments valides.
- La diffusion SWAPP Local HLS préexistante reste inchangée ; tests de compatibilité simulés réussis.
- Diagnostic OBS enrichi avec \`last_error_file_type\`, \`last_error_reason\` et \`pending_obs_segments\`.
- Les nouveaux fichiers nécessitent un redémarrage Node Hostinger pour charger le module ajouté.

Tests : \`node --test test/swapp-obs-hls-playlist.test.js test/swapp-direct-hls-relay.test.js\`.

Le correctif est dans le dépôt GitHub. Une validation réelle OBS → Hostinger → lecteur sur réseau externe reste nécessaire ; les tests locaux ne la remplacent pas.
