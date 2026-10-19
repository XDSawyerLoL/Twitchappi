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