# SWAPP Live — stabilité OBS/HLS et spectateurs (26 octobre 2026)

## Incident signalé
Un spectateur invité a vu le flux geler après environ cinq minutes, suivi de « reconnexions en cours ». La **cause exacte en production n'est pas confirmée** : l'accès aux journaux Hostinger et aux métriques réseau réelles n'était pas disponible.

## Correctifs livrés au code

### Lecteur HLS public `local-agent/player.html`
- Une image n'est plus considérée comme fraîche simplement parce que `readyState>=2` et `videoWidth>0`. Le lecteur vérifie la **progression réelle du temps vidéo** et utilise `requestVideoFrameCallback` lorsqu'il est disponible pour repérer une image figée.
- Buffer plus robuste sur le HLS MPEG-TS actuel : démarrage à **3 segments complets** au lieu de 2, 20 s de tampon maximum demandé à hls.js au lieu de 12, 30 s de mémoire arrière au lieu de 80.
- **Récupération graduée**, d'abord du décodeur ou du téléchargement des segments, puis seulement si nécessaire reconstruction du moteur HLS. Limites de tentatives et temporisation progressive plafonnée à 15 s.
- Recalage au direct moins agressif (plus de 20 s de retard, au moins 30 s entre deux corrections), pour ne pas recharger des segments en boucle sur un réseau lent.
- Le compteur de reconnexions n'est remis à zéro qu'après 30 s de lecture stable, pas lors de chaque événement `loadeddata`.
- En cas d'arrêt des fragments OBS vérifié par l'API de statut, le lecteur distingue « Flux OBS interrompu » d'une erreur du navigateur.
- Aucune vidéo n'est transcoder automatiquement ; ni débit réduit chez le créateur, ni nouveau service.

### Relais HLS `modules/swapp-direct-hls-relay.js`
- Signalement des requêtes de segments devenus indisponibles dans la fenêtre mémoire limitée.
- API diagnostic propriétaire : `missing_segment_requests`, `segment_bytes_in_memory`, `segment_memory_budget`, `last_missing_segment_at`. Aucun secret de diffusion, identifiant de spectateur ni adresse IP.
- Les anciennes réponses 404 restent correctes (ne jamais inventer des segments ou retourner de fausses vidéos).

### OBS et MySQL
- Les mises à jour persistantes de l'état OBS passent de 18 s à 45 s, toujours **sous le délai de péremption de 120 s** utilisé par défaut pour le direct. Les échecs SQL sont espacés pour ne pas saturer le serveur.
- Le gestionnaire OBS affiche le pourcentage de mémoire vidéo utilisée et le nombre de fragments expirés demandés par des spectateurs.

## Ce qui est testé
- Parsing JS du serveur, relais, tableau de bord et lecteur intégré.
- Simulation HLS du relais : 212 segments successifs de 2 s (424 s), **deux lectures concurrentes**, playlist renouvelée, 30 requêtes de fragments récents avec 0 refus ; 40 segments conservés ; un ancien segment correctement refusé, signalé en diagnostic. Test automatisé ajouté dans `test/swapp-hls-five-minute-stability.test.js`.
- Aucun changement de transport OBS/HTTPS PUT ou de clé, aucun outil payant ni VPS.

## Contrôles obligatoires sur Hostinger
- Deux spectateurs extérieurs, dont un sur réseau mobile, lecture continue pendant **30 minutes minimum**, OBS 720p30 / H.264 / 4000–6000 kb/s pour isoler les limites réseau (ne constitue pas un nouvel encodage imposé).
- Sur le gestionnaire SWAPP, surveiller `segment_age_ms`, `playlist_age_ms`, les statuts HTTP d'upload, `missing_segment_requests` et la saturation de RAM.
- Vérifier l'identifiant d'instance retourné par `/api/oryon/local-relay/vnhz/probe` depuis plusieurs clients : le relais **RAM mono-processus** ne fonctionne pas entre plusieurs instances Node non partagées.
- Inspecter sur Hostinger les redémarrages du processus Node, les limites de RAM, CPU et trafic. En cas de redémarrage/instances multiples, un correctif lecteur seul ne suffit pas ; il faut des segments servis par un espace commun, ou imposer un seul processus de relais, sans supposer que l'un ou l'autre est déjà disponible.
- Tester les vrais flux à débit natif ensuite. Monter le débit ne peut pas résoudre un manque de bande passante sur un hébergement mutualisé.

Ne pas annoncer SWAPP Live comme « stable en production » tant que la validation réelle n'est pas passée. Déployer si possible **hors direct OBS** : le processus Node peut redémarrer pendant l'application du correctif.
