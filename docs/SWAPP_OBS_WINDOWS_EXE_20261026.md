# Installer SWAPP Live HLS dans OBS Studio (Windows 64 bits)

## Un téléchargement direct — sans SWAPP Local

Le panneau « Diffuser depuis OBS sur SWAPP » propose désormais un seul téléchargement :

`/assets/downloads/SWAPP-OBS-HLS-Installer-x64.exe`

Ce lien retourne **l'exécutable Windows x64 réel** (7 680 octets, type PE32+) en pièce jointe HTTP, et non une page GitHub, un script `.ps1` ou l'ancienne application de capture SWAPP Live. L'artefact embarqué est compressé en gzip dans `modules/swapp-obs-installer-download.js` et sa somme SHA-256 est contrôlée avant distribution.

**SHA-256 de l'EXE :** `19e68ff5502365db5e94afc01b516797c5a40a0611ce51aebd3b910d6a14c28a`

Cette méthode permet de distribuer le petit exécutable sur Hostinger Node, sans CDN, stockage supplémentaire, API payante ou GitHub Actions.

## Installation

1. Avoir OBS Studio installé sur Windows x64 et l'avoir ouvert au moins une fois.
2. **Fermer OBS** complètement.
3. Dans SWAPP > Gestionnaire > Diffuser depuis OBS, télécharger puis ouvrir l'installateur.
4. Relancer OBS > **Paramètres > Stream > Afficher tous les services** et sélectionner **SWAPP Live (HTTPS HLS)**.
5. Copier dans OBS la clé personnelle affichée sur SWAPP ; démarrer la diffusion.

Le programme fonctionne entièrement hors ligne, sans élévation administrateur, sans PowerShell, ni téléchargement de dépendances. Il modifie uniquement le catalogue OBS de **l'utilisateur Windows courant** :

- `%APPDATA%\obs-studio\plugin_config\rtmp-services\services.json` : ajoute la destination HTTPS/HLS SWAPP tout en conservant les autres services.
- `%APPDATA%\obs-studio\plugin_config\rtmp-services\package.json` : augmente la version du catalogue.
- Copies originales enregistrées avec suffixe `.swapp-original.bak` avant modification.

L'installateur est idempotent : il détecte la présence de SWAPP et n'ajoute pas un doublon. Si le catalogue OBS manque, il le copie depuis les fichiers de l'installation standard dans `%ProgramFiles%\obs-studio\data\obs-plugins\rtmp-services\`.

## Sécurité et limites

- **EXE non signé numériquement** : Windows SmartScreen peut afficher un avertissement ; aucune méthode de contournement des protections n'est recommandée.
- Build croisé depuis Linux avec clang et lld-link ; **validation native sous Windows + OBS réel encore nécessaire**.
- L'installation ajoute SWAPP à la liste des services. Elle **ne valide pas** à elle seule la réception HLS par Hostinger, la lecture du son ou la stabilité à plusieurs spectateurs.
- Le service utilise `protocol: HLS`, `recommended.output: ffmpeg_hls_muxer` et `{stream_key}`, conformément au format OBS.
- OBS installé dans un chemin non standard ou portable peut ne pas être trouvé ; les anciens scripts de secours du dépôt restent disponibles pour le dépannage, mais **n'encombrent plus** le panneau courant.
- Pour conserver la capture via navigateur, seules les cartes de sélection redondantes sont masquées ; la zone de capture reste en place. Les diagnostics OBS sont accessibles dans « Diagnostic avancé OBS ».

## Contrôles avant mise en production

- `node --test test/swapp-obs-installer.test.js test/swapp-obs-public-readiness.test.js` et `npm test` sur Node local ; ne pas lancer GitHub Actions payantes.
- Télécharger l'EXE depuis l'URL de SWAPP et comparer le SHA-256 au hash ci-dessus.
- Installer sur Windows 10/11 avec OBS, vérifier la liste des services et le paramétrage HLS.
- Tester un live OBS sur la chaîne publique depuis un **autre réseau** et vérifier image et audio.
- Toute fusion Hostinger pouvant redémarrer le processus Node doit être faite hors direct sensible.

## Code source de construction

Une copie du code natif C de cet exécutable est fournie en pièce jointe au chantier. Les contrôles de compilation PE32+ et d'intégrité ont réussi, mais pas les tests Windows/OBS.
