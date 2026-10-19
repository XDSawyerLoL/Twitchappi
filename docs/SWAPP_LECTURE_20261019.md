# Choix final de voix — 20 octobre 2026

**Interface publique SWAPP Lecture : Vivienne uniquement.** Le sélecteur multivoix a été retiré au profit d'une étiquette fixe « Voix Vivienne ». L'application choisit exclusivement une voix française dont le nom ou l'identifiant contient « Vivienne ». Elle préfère sa variante naturelle lorsque plusieurs variantes existent. Aucune autre voix française ou voix système n'est proposée comme substitut. Si Vivienne n'est pas disponible dans le navigateur, le bouton de lecture reste désactivé et la cause est affichée.

La case d'autorisation des voix en ligne reste supprimée. La mention concise sous le lecteur précise qu'une voix du navigateur peut fonctionner en ligne. La lecture reste initiée par l'utilisateur.

Le module audio Mairaiy/Aoede et les producteurs d'enregistrements restent conservés comme code de développement **mais ne sont plus chargés ni affichés sur les pages publiques**, faute d'enregistrements officiels prêts à être utilisés. Aucun coût Gemini n'est engagé.

---

# Réglage du lecteur vocal — 20 octobre 2026

Le panneau « Écouter » propose directement **Vivienne** en premier si le navigateur fournit cette voix française. La case à cocher imposant une autorisation supplémentaire pour les voix en ligne a été retirée. Le bouton « Écouter l’article » constitue désormais l'action volontaire qui lance la voix choisie ; l'interface précise brièvement si le moteur vocal du navigateur peut fonctionner en ligne. L'application n'envoie elle-même aucun texte à un prestataire vocal ; pour une voix distante du navigateur, le fournisseur du navigateur peut traiter l'audio/texte selon ses propres règles.

**Mairaiy** apparaît dans le même sélecteur comme voix Quantic Studio réelle (Gemini/Aoede). Elle est sélectionnable uniquement après validation et disponibilité d'un enregistrement **Aoede authentique** pour l'article courant. Le transport Mairaiy utilise les mêmes commandes « Écouter », « Pause », « Reprendre », « Arrêter », « Passage précédent/suivant », vitesse et mise en évidence du texte. Aucun remplacement par Kokoro ou Vivienne n'est présenté sous le nom Mairaiy. S'il n'existe pas encore d'enregistrement, l'option indique « Mairaiy · enregistrement non disponible » et Vivienne fonctionne normalement.

Les fichiers audio Mairaiy sont générés manuellement par `tools/swapp-mairaiy-narration-generate.py` avec l'accord explicite de l'opérateur en raison des coûts Gemini potentiels. **Cette livraison ne génère ni ne facture d'audio Mairaiy.** L'arrivée d'un vrai audio sur SWAPP requiert toujours la génération et la publication Hostinger de l'enregistrement.

---
# Mise à jour — Voix Mairaiy historique retrouvée dans Quantic Studio

**Source confirmée :** dépôt `XDSawyerLoL/Auralive`, fichiers `app/services/voice_identity_lock.py`, `app/services/avatar_audio.py`, `app/main.py`, tests `tests/test_voice_identity_lock.py`.

Le profil vocal réel conservé par Quantic Studio est **Mairaiy / Gemini TTS / Aoede / fr-fr**, modèle configuré `gemini-3.1-flash-tts-preview`, profil historique `aura-live-2.0.7-natural`. Son endpoint expose `GET /voice/.well-known/voicestudio-speech` et `POST /voice/v1/audio/speech`. Le verrou d'identité interdit un repli silencieux vers Kokoro, Windows ou la synthèse navigateur.

Le nouveau générateur **`tools/swapp-mairaiy-narration-generate.py`** utilise ce service existant plutôt que de fabriquer une voix. En production audio, il contrôle les informations de découverte, les en-têtes audio confirmant Aoede et l'identité historique. Les segments WAV sont assemblés en un enregistrement de chaque article, avec repères de paragraphes et manifeste. Le lecteur SWAPP n'affiche « Mairaiy · Narration officielle » **que** si le manifeste respecte strictement ce profil.

Exemple de préparation depuis un ordinateur équipé du projet :

```bash
python tools/swapp-mairaiy-narration-generate.py --slug un-article-publie \
  --service https://VOTRE-SERVICE-QUANTIC-STUDIO \
  --approve-provider-usage
```

La vraie URL doit être celle du service Quantic Studio effectivement configuré ; aucune URL fictive n'est installée. Un token de production peut être fourni localement via `SWAPP_MAIRAIY_PRODUCER_TOKEN`, jamais dans le navigateur. La génération est **manuelle**, avec confirmation explicite parce que Gemini peut consommer un quota payant. Aucun appel payant n'a été lancé pour cette livraison. Une fois les fichiers générés, transférer les `audio.mp3`/`audio.wav` et leur `manifest.json` via FTP Hostinger.

L'ancien générateur `tools/swapp-narration-generate.py` reste une **option distincte Kokoro ff_siwis**. Même si son audio est de bonne qualité, il ne sera jamais présenté comme la voix Mairaiy. La lecture système reste elle aussi un choix distinct.

**État réel :** architecture et scripts déposés sur GitHub ; aucun enregistrement Aoede généré ni mis en ligne, moteur Gemini non confirmé disponible, validation iPhone/Android et tests complets encore requis.

---
# SWAPP Lecture — liseuse et écoute d’articles (19 octobre 2026)

## Objectif
Deux modes complémentaires pour les articles existants, sans duplication du lecteur ni affichage parasite après F5.

## Liseuse
- Bouton Mode liseuse / Quitter la liseuse sous l’en-tête de l’article.
- Texte centré, sommaire latéral et recommandations masqués pendant la lecture, trailer et éléments hors article retirés du mode concentré ; retour immédiat au site habituel.
- Ambiances Nuit, Papier, Sépia ; police sans serif ou type livre ; taille via les contrôles existants. Réglages de confort dans sessionStorage, pas de profilage.
- Styles limités aux articles ; ne pas modifier la personnalisation de SWAPP ailleurs.

## Écoute
- Contrôle Écouter ouvre un panneau volontaire, jamais de lecture automatique.
- Voix française disponible via speechSynthesis du navigateur, préférence pour celles dont l’intitulé annonce Natural/Neural/Premium/Enhanced.
- Lecture découpée par phrase pour limiter les blocages de synthèse longue, avec pause/reprise, précédent/suivant, vitesse, arrêt et mise en évidence du bloc lu.
- La synthèse de navigateur n’est **pas** un moteur neuronal Mairy intégré. Certaines voix installées sonnent artificielles ; l’interface ne garantit pas une qualité humaine.
- Avant d’utiliser une voix déclarée en ligne par le navigateur, l’interface demande un accord explicite car le texte peut être traité par le fournisseur du navigateur.
- Aucun micro, aucune reconnaissance vocale, aucune API facturée et aucun suivi de session ajoutés.

## Étape ultérieure : vraie narration Mairy
Ne pas présenter un SpeechSynthesisUtterance comme Mairy. Pour atteindre la voix souhaitée, intégrer un **moteur de narration neuronale réel et autorisé** :
1. Vérifier l’existence et les droits d’usage d’une voix Mairy, plus sa disponibilité fiable sur Hostinger.
2. Concevoir un endpoint audio same-origin, réutilisable, versionné par article et protégé par limite de débit ; cache de fichiers audio, pas de synthèse à chaque ouverture.
3. Envoyer seulement le texte de l’article après action de l’utilisateur et affichage clair des traitements externes éventuels.
4. Permettre le streaming segmenté et les commandes média mobile avec reprise stable ; garder le texte et les sons distincts.
5. Tester la prosodie, les noms de jeux (The Witcher, Hades, etc.), les chiffres, les pauses, la vitesse et la navigation mobile réelle.

## Vérification avant déploiement
- node --test test/swapp-reader-studio.test.js
- npm run check, puis npm test dans un checkout Node.
- npm run release:info et npm run verify:production après Hostinger.
- Tests manuels sur un article natif, navigation SPA, F5, PC Edge/Chrome, iPhone Safari, Android Chrome.
- Cas absence de voix FR, démarrage sans consentement, lecteur interrompu par navigation, pause/reprise, thème papier, longue lecture, préférence de réduction des mouvements.
- Les contrôles statiques de la PR ne démontrent pas l’existence d’une voix naturelle française ni la compatibilité de chaque navigateur.

## Coûts et infrastructure
Aucun VPS, moteur externe payé, GitHub Action payante, compte supplémentaire ou clé API ajoutés. L’accès à des voix en ligne peut dépendre du navigateur et de son fournisseur, indépendamment des coûts SWAPP.
## Narration neuronale réelle : pipeline Kokoro hors ligne (nouvelle livraison)

SWAPP accepte maintenant une **bande audio neuronale préenregistrée par article**, en plus de la voix système. La lecture est un fichier continu MP3 (ou WAV), compatible avec les commandes natives du navigateur, avec passage précédent/suivant et mise en évidence du paragraphe en cours. Aucun appel au moteur IA sur Hostinger.

Moteur de génération proposé : **Kokoro-82M**, voix française `ff_siwis`, phonémisation française `espeak-ng`. La voix est une vraie synthèse neuronale libre, **pas la véritable voix Mairy**. Ne pas renommer cette voix « Mairy » sans correspondance audio et droits établis.

### Installation sur un poste de production audio (pas Hostinger)

```bash
python -m pip install 'kokoro>=0.9.4' torch numpy soundfile
# Sur Debian / WSL : sudo apt-get install espeak-ng ffmpeg
python tools/swapp-narration-generate.py --slug un-article-publie
# Ou avec un export JSON éditorial vérifié :
python tools/swapp-narration-generate.py --slug un-article-publie --json article.json
```

La machine de génération doit avoir de la mémoire disponible et les fichiers du modèle ; le premier téléchargement des poids est externe au site. L'utilisation gratuite n'élimine pas les coûts locaux éventuels d'électricité, de trafic et de stockage.

Le script lit le JSON public `/api/actus/:slug` ou un export local et rejette les slugs invalides, les brouillons, les textes absents et les documents excessifs. Il génère dans `assets/swapp-narrations/<slug>/` : un seul `audio.mp3` (ou `audio.wav`) et `manifest.json`. Les repères temporels sont dérivés des échantillons produits ; ils ne sont pas des timings de phonèmes inventés.

### Publication sur Hostinger

Transférer **ensemble** `audio.mp3` (ou `audio.wav`) et `manifest.json` dans `assets/swapp-narrations/<slug>/` via le FTP Hostinger existant. Envoyer l'audio avant le manifeste pour éviter une référence temporairement cassée. Ces fichiers audio ne sont pas automatiquement produits par le déploiement de code GitHub.

SWAPP découvre le manifeste **seulement après le clic « Écouter »**. Le manifeste est vérifié localement avec le slug, la langue, le moteur, les noms de fichiers et le texte réellement présent dans l'article. Si l'article est édité depuis la génération, si l'audio manque ou si la version est incorrecte, la narration studio est masquée : la lecture système reste disponible. Aucun envoi du texte éditorial à un prestataire vocal pendant l'écoute studio.

### Critères de validation complémentaires

- [ ] Générer un article entier de test avec `ff_siwis` sur la machine de production. **Pas encore exécuté sur les machines de SWAPP.**
- [ ] Vérifier les chemins `/assets/swapp-narrations/<slug>/manifest.json` et `audio.mp3` après transfert FTP.
- [ ] Tester Safari iPhone, Chrome Android, Edge/Chrome PC, lecture verrouillée mobile, pause/reprise, repères de paragraphes et navigation entre passages.
- [ ] Modifier l'article et constater que le manifeste obsolète n'est plus accepté.
- [ ] Vérifier l'absence d'envoi du texte du navigateur par SWAPP à une API TTS.
- [ ] Mesurer la qualité des noms de jeux, annonces, nombres et anglicismes avant d'annoncer un niveau comparable à Mairy.

Sans fichier audio effectivement produit et transféré, le lecteur neuronale reste une **capacité préparée**, pas une narration disponible en production.
