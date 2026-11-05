# SWAPP ON AIR — Premier épisode à deux voix, sans API payante

## Sujet du premier épisode
**SWAPP ON AIR — Pikmin, le grand retour du Dandori** (dialogue original Nova/Kern, 30 répliques, 3 sources Nintendo vérifiées).

Fichier : `data/swapp-on-air/episode-pikmin-20261105.json`.

Informations :
- Nintendo a présenté le Pikmin Day le 1er novembre 2026.
- Pikmin 4 – Nintendo Switch 2 Edition + Dandori Academy est annoncé pour le 12 novembre 2026.
- Dandori Academy comprend des défis chronométrés et des examens le week-end.
- Des commandes vocales sont prévues pour Otchin/Oatchi.
- Une démo gratuite était annoncée par Nintendo lors du Pikmin Day Direct.

Sources officielles :
- https://www.nintendo.com/us/whatsnew/nintendo-declares-november-1-pikmin-day-in-recognition-of-all-things-pikmin/
- https://www.nintendo.com/fr-fr/News/2026/Novembre/Jeux-a-venir-Novembre-2026-3229019.html
- https://www.nintendo.com/us/nintendo-direct/11-1-2026/

Le dialogue est **prêt à générer, pas un enregistrement**. Aucun article inventé ou annonce non vérifiée n'a été intégré. Le drapeau `publication_allowed: false` demeure : il faut écouter et approuver les voix et vérifier les sources au moment de publier.

## Sur Windows : une procédure simple

1. Depuis le dépôt local SWAPP, double-cliquer sur **`scripts/swapp-on-air-start-fr.cmd`**.
2. Au premier lancement, confirmer l'installation **gratuite** de Qwen3-TTS dans l'environnement isolé `.swapp-on-air-private/venv`. Les poids sont téléchargés sur le PC ; prévoir plusieurs Go de stockage et de préférence un GPU NVIDIA compatible CUDA. Il n'y a pas de frais d'API, mais la génération utilise le matériel et l'électricité du PC.
3. Deux voix originales orientées français, NOVA et KERN, sont conçues localement avec Qwen VoiceDesign 1.7B et clonées de manière cohérente pendant les dialogues avec Qwen Base 0.6B. Le script exporte `.wav` puis `.mp3`.
4. La page `https://swapp.tv/on-air/studio` s'ouvre avec les métadonnées et sources **préremplies** dans un fragment d'URL local. Sélectionner le MP3, l'écouter intégralement, vérifier les noms propres puis valider et publier.

Par sécurité du navigateur, le script **ne téléverse pas automatiquement** le fichier local. L'admin doit le sélectionner et cocher les approbations ; aucune piste robotique ne peut être publiée par défaut.

### Sans GPU

Pour autoriser explicitement le CPU, utiliser PowerShell depuis la racine du dépôt :

`powershell -ExecutionPolicy Bypass -File scripts/swapp-on-air-start-fr.ps1 -AutoriserCPU`

Ce traitement peut être extrêmement lent ou nécessiter plus de mémoire. Si les modèles ou la connexion ne sont pas disponibles, aucun MP3 n'est annoncé comme prêt. L'outil réutilise le MP3 existant sans l'écraser.

Le MP3 généré se trouve dans `.swapp-on-air-private/swapp-pikmin-20261105.mp3`. Ne pas placer les voix de référence et fichiers intermédiaires dans GitHub.

## Abonnement au podcast

Le flux RSS gratuit se trouve à `https://swapp.tv/on-air/feed.xml`.

Il regroupe **uniquement** les épisodes effectivement validés, dont le fichier MP3 existe sur le serveur. Les durées et poids d'enclosure proviennent du média. Un catalogue vide donne un flux vide, jamais des épisodes fictifs.

Ce flux sert d'abord aux lecteurs RSS. Les grandes plateformes de podcasts peuvent imposer des conditions supplémentaires, notamment une illustration carrée conforme à leurs spécifications.

## Tests de validation

Exécuter dans le dépôt :
`python -m unittest test.test_swapp_on_air_real_pilot`
`node --test test/swapp-on-air.test.js test/swapp-on-air-studio.test.js`
`npm run verify:production`

Après mise à jour du site Hostinger :
- `/on-air` affiche la rubrique et le lien RSS.
- `/on-air/feed.xml` a une balise `<enclosure>` **seulement si un vrai MP3 est publié**.
- `/on-air/studio` refuse un visiteur non administrateur.
- `/api/on-air/episodes` retourne l'épisode après l'envoi du MP3 et sa validation.
- Un auditeur peut lire, mettre en pause et avancer dans le fichier.

**Ne pas annoncer un podcast opérationnel avant un vrai MP3 publié, une écoute d'approbation, et un contrôle Hostinger.** Une fusion GitHub seule ne suffit pas.
