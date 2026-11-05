# SWAPP ON AIR — Publication directe sur Hostinger (5 novembre 2026)

## Diagnostic et changement
Le catalogue GitHub data/swapp-on-air/episodes.json est vide : aucun véritable épisode Nova/Kern n'a été validé ni publié. L'interface /on-air ne peut donc pas jouer de MP3.

Le correctif crée /on-air/studio, réservé à l'administrateur SWAPP, pour publier un MP3 réel directement sur l'hébergement existant. L'interface comporte préécoute, progression d'envoi, titre, description, sources HTTPS, liens articles, trois validations de contenu et droits. Aucun nouveau VPS, API payante ni moteur TTS côté Hostinger.

## Mise en place Hostinger
Configurer SWAPP_ON_AIR_STORAGE_DIR : répertoire absolu, privé, persistant, accessible en écriture, et partagé par les processus Node qui servent SWAPP. Ne pas utiliser public_html. Sans cela le dossier de secours data/swapp-on-air/uploads risque d'être effacé lors d'un nouveau déploiement.

Les identités administrateur déjà utilisées par SWAPP doivent être correctement définies : ORYON_ADMIN_LOGINS et ORYON_ADMIN_USER_IDS (en production, l'ID épinglé est obligatoire). SESSION_SECRET doit rester cohérent entre instances.

Déployer la branche master mise à jour sur Hostinger et redémarrer Node. Le studio indiquera si le stockage est prêt.

## Publication
1. Se connecter avec le compte administrateur, ouvrir https://swapp.tv/on-air/studio.
2. Sélectionner le MP3 final, l'écouter, renseigner les sources primaires réelles et les métadonnées, puis cocher les trois validations.
3. Publier. La page /on-air/<slug>, le fichier /api/on-air/audio/<slug>.mp3 et l'API /api/on-air/episodes deviennent accessibles sans autre commit GitHub.

Contrôles : taille 30 Ko à 24 Mo, codec MP3, durée 20 s à 2 h, écriture atomique, protection administrateur + origine, absence de doublons, prise en charge des requêtes Range pour rechercher dans l'audio, uploads privés et ménage automatique après 24 h. FFprobe, lorsqu'il est installé, est appelé de façon asynchrone pour ne pas figer le processus des lives. Sans FFprobe, contrôle des trames MP3 et approbation manuelle.

## Voix naturelles
Les scripts Qwen3-TTS existants produisent des dialogues français gratuitement sur un PC suffisamment puissant :
- python scripts/swapp-on-air-qwen-design-fr.py --render --allow-download
- python scripts/swapp-on-air-qwen-local.py --render --allow-download

Un MP3 doit être effectivement produit puis écouté et approuvé. Il n'existe pas encore de MP3 naturel Nova/Kern approuvé dans le dépôt. Ces voix ouvertes ne sont pas identiques à Mairaiy / Gemini Aoede. Ne pas publier un MP3 robotique sous prétexte que le studio fonctionne.

## Validation
node --test test/swapp-on-air.test.js test/swapp-on-air-studio.test.js
npm run verify:production

Pour exiger la présence de vrais épisodes sur la production :
SWAPP_VERIFY_ON_AIR_PUBLISHED=1 npm run verify:production

Une fusion GitHub n'est pas un déploiement Hostinger. Si /api/on-air/episodes est vide, le podcast n'est toujours pas réellement écoutable.
