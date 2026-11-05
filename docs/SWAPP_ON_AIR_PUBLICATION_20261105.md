# SWAPP ON AIR — site public et publication de vrais épisodes

## Parcours public

- https://swapp.tv/on-air — la rubrique ON AIR.
- https://swapp.tv/on-air/<slug> — page d'un épisode **publié et effectivement audible**.
- https://swapp.tv/api/on-air/episodes — catalogue public en lecture seule.
- La navigation Actualité (ordinateur et mobile) et le haut de la page /actus contiennent un accès ON AIR.

Le site utilise l'interface SWAPP existante. Un lecteur HTML audio natif, sans lecture automatique ni téléchargement tiers, apparaît uniquement si un **vrai fichier MP3** se trouve dans \`assets/on-air/<slug>.mp3\` et si le manifeste éditorial le valide.

### Pourquoi la page ON AIR peut afficher « en préparation »

Le dépôt contient **un générateur Qwen3-TTS et un dialogue d'essai**, mais il **ne contient aucun MP3 Qwen3 naturel vérifié**. Il n'était pas acceptable de publier l'ancien MP3 eSpeak ni de créer un lecteur fictif. Le manifeste \`data/swapp-on-air/episodes.json\` est donc volontairement vide.

Cela signifie que **mettre ce code sur Hostinger publie une rubrique SWAPP ON AIR, pas encore un épisode audio**.

## Production d'un épisode

1. Partir d'informations de jeu vidéo **vérifiées** et écrites en français, avec sources.
2. Préparer le dialogue Nova/Kern dans le format JSON de \`data/swapp-on-air/voice-natural-demo.json\`, sans publier un dialogue fictif comme une actualité réelle.
3. Générer les voix localement, sans API payante, avec les modèles ouverts Qwen3-TTS après avoir explicitement téléchargé leurs poids :
   - \`python scripts/swapp-on-air-qwen-design-fr.py --render --allow-download\` pour deux timbres originaux orientés français (VoiceDesign 1.7B puis Base 1.7B).
   - ou \`python scripts/swapp-on-air-qwen-local.py --render --allow-download\` pour les timbres prédéfinis (CustomVoice 1.7B).
   - \`--allow-cpu\` autorise explicitement le calcul sans GPU, mais celui-ci peut être très lent. Les modèles ne tiennent pas nécessairement dans la mémoire d'un hébergement partagé Hostinger.
4. Écouter **le vrai MP3 final** du début à la fin : diction française, identité des deux intervenants, prononciation des noms de jeux, erreurs de transcription et passages sans son.
5. Contrôler les droits d'utilisation de tout extrait de voix, musique, effet ou bande-annonce. Ne jamais cloner une voix non autorisée.
6. Préparer le fichier de diffusion depuis le PC utilisé pour la production, en conservant les liens vers les sources vérifiées.

### Exemple de validation sans publier

\`\`\`bash
python scripts/swapp-on-air-publish.py \
  --audio .swapp-on-air-private/nova-kern-designed.mp3 \
  --slug swapp-on-air-episode-pilote-2026 \
  --title "SWAPP ON AIR : le lancement d'un jeu indépendant" \
  --description "Nova et Kern analysent une annonce vérifiée et discutent de ses conséquences pour les joueurs." \
  --source "Site officiel du studio=https://example.org/press-release" \
  --audio-reviewed --editorial-approved --license-confirmed
\`\`\`

**Important :** l'URL de source ci-dessus est un exemple fictif, pas une référence valide pour une vraie publication. Le script n'exécute pas de recherche éditoriale à la place du producteur. Remplacer chaque URL par une source primaire réellement vérifiée avant publication.

Par défaut le script n'écrit rien. Il vérifie avec \`ffprobe\` le codec MP3 et la durée (20 s à 2 h), le titre, la description, le slug et les sources.

### Publication locale explicitement approuvée

Ajouter \`--publish\` **après vérification humaine**. Le script crée :

- \`assets/on-air/swapp-on-air-episode-pilote-2026.mp3\`
- une entrée publiée, revue et datée dans \`data/swapp-on-air/episodes.json\`

Après quoi le MP3 et le manifeste sont **committés ensemble**, fusionnés dans le dépôt et déployés sur Hostinger. Les deux fichiers doivent être présents sur chaque instance du site. Un épisode n'est jamais révélé par l'interface avant que son fichier ne soit présent sur le serveur.

Aucune clé personnelle ni fichier de référence vocale n'est inclus dans le dépôt. Les épisodes MP3 finaux, eux, deviennent volontairement publics.

## Contrôles

\`\`\`bash
node --test test/swapp-on-air.test.js
node --test test/swapp-unified-navigation.test.js test/swapp-nav-dedup.test.js
node --check server.js
\`\`\`

Après déploiement Hostinger :
1. Ouvrir \`/on-air\` sur ordinateur et mobile.
2. Vérifier \`/api/on-air/episodes\` : liste vide tant qu'aucun MP3 réel n'a été approuvé.
3. Après publication d'un épisode, lancer **Lecture**, tester pause/retour/avance et téléchargement.
4. Confirmer la présence des sources et des liens vers les articles.
5. Comparer l'empreinte de version du serveur via \`/api/release\` au dépôt réellement déployé. Un commit GitHub ne prouve pas un déploiement Hostinger.

## Limites et coûts

Les fichiers livrés ici n'ajoutent **aucun frais d'API TTS** ni service payant. Ils n'automatisent pas la synthèse sur Hostinger. Le stockage et la bande passante du MP3, la puissance de calcul pour produire les voix et les limites de l'hébergement demeurent à contrôler.

La vraie voix Mairaiy d'origine était Gemini Aoede : les voix synthétiques Qwen3 proposées constituent de **nouveaux personnages acoustiques**, pas une reproduction prétendument exacte de Mairaiy. Tout choix de voix doit être approuvé à l'écoute.

## État

- Interface ON AIR et route de lecture : implémentées dans le code.
- Script de mise en catalogue d'un MP3 approuvé : implémenté.
- Véritable MP3 Nova/Kern produit et audité : **non**.
- Déploiement réel et accessibilité SWAPP.tv : à contrôler sur Hostinger.
