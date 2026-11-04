# SWAPP ON AIR — retour à la voix Mairaiy/Aoede

## Ce qui est réellement fait

Cette branche ajoute un outil de **préproduction locale**, indépendant du site public :
- `modules/swapp-on-air-voice.js` : dialogue français à deux voix via le même modèle que la Mairaiy historique d'Aura Live (`gemini-3.1-flash-tts-preview`), avec `Aoede` pour Nova et `Charon` pour Kern.
- Réemploi du prompt Mairaiy : proximité du microphone, voix spontanée, micro-pauses, jeu d'acteur, émotion et personnalité. Les deux intervenants sont réunis dans chaque bloc pour obtenir des réactions naturelles.
- Dialogue segmenté en blocs courts (6 répliques maximum / environ 1150 caractères) pour limiter la dérive vocale et la lecture monotone.
- `data/swapp-on-air/episode-00-voice-demo.json` : essai court sur Elder Scrolls, Pikmin et Genshin ; 14 tours de parole. Le contenu n'est **pas approuvé pour publication**.
- `scripts/swapp-on-air-aoede.cjs` : CLI sur ordinateur personnel, prévisualisation des demandes et coûts **sans aucun appel réseau** par défaut.
- `test/swapp-on-air-voice.test.js` : garde-fous et simulation PCM/WAV sans appel payant.

## Contrôle des coûts

**Aucune génération n'est déclenchée à la fusion, au déploiement, par un visiteur ou par la veille éditoriale.** La synthèse doit être lancée localement, consciemment, par l'éditeur, avec une clé API hors de GitHub.

La tarification de Gemini 3.1 Flash TTS sur le niveau payant standard était annoncée à 1 USD par million de jetons texte en entrée et 20 USD par million de jetons audio en sortie. 25 jetons audio correspondent à une seconde d'enregistrement. Le niveau gratuit est soumis à conditions et limites ; ne jamais considérer ce service comme gratuit et illimité.

Depuis la racine du dépôt, sur un PC disposant de Node.js 22 :

```powershell
node scripts/swapp-on-air-aoede.cjs
```

Cette commande est un **dry-run** qui n'appelle aucune API et affiche une estimation.

Pour un essai **volontaire et potentiellement facturé** seulement :

```powershell
$env:SWAPP_ON_AIR_TTS_ENABLED="1"
$env:GEMINI_API_KEY="CLE_API_GEMINI_DANS_VOTRE_TERMINAL_SEULEMENT"
node scripts/swapp-on-air-aoede.cjs --execute --budget-usd=0.20
```

La variable `GEMINI_API_KEY` ne doit jamais être committée, publiée ni envoyée au navigateur. `--budget-usd` est un **contrôle de prévalidation fondé sur une estimation**, pas un plafond de facturation imposé à Google ; configurer également un plafond au niveau du fournisseur si l'abonnement le permet.

Le fichier `.swapp-on-air-private/swapp-on-air-episode-00-aoede.wav` n'est généré qu'après réponse de l'API, puis gardé hors Git. Les WAV historiques eSpeak/Edge ne sont **pas** repris et aucun fallback vers eux n'est autorisé. Les sorties déjà existantes ne doivent pas être écrasées. Aucun MP3 Aoede n'a été généré à ce stade.

## Vérification avant publication

1. Vérifier les trois sources primaires et la justesse de chaque énoncé (en particulier les noms, dates, noms propres).
2. Écouter le WAV généré avec un casque : voix de Nova fidèle au profil Mairaiy, Kern distinct, accent français, naturel, pas de consignes lues par erreur, aucune répétition ni omission de mots.
3. Réécouter chaque raccord de bloc ; ajouter pauses correctes, régler les niveaux et exporter éventuellement en MP3 avec FFmpeg local.
4. Réviser les retranscriptions et identifier clairement les voix comme IA.
5. Ne publier sur SWAPP qu'après validation éditoriale humaine et vérification des coûts. Cette branche n'introduit **aucun endpoint public** ni automatisation de publication.

## Sources techniques

- Architecture historique: `XDSawyerLoL/Auralive/app/services/avatar_audio.py`, `voice_identity_lock.py`.
- Spécification Gemini 3.1 Multi-speaker : https://ai.google.dev/gemini-api/docs/generate-content/speech-generation
- Prix Gemini : https://ai.google.dev/gemini-api/docs/pricing
