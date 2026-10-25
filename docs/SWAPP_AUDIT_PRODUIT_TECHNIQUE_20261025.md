# SWAPP — Audit produit et technique (25 octobre 2026)

**État : audit de code + référencement public, sans exécution de tests navigateur avec deux appareils ni accès à hPanel/production.** Dépôt audité : `XDSawyerLoL/Twitchappi` (`master`) et PR brouillon #150. Ne pas confondre code, activation de flags et livraison publique.

## Décisions produit à préserver (mémoire de projet)

- Positionnement : **magazine gaming + univers de jeu + plateforme de lives SWAPP + SOCIAL + communauté créateurs**. Ne pas devenir un clone générique de Twitch.
- Le direct SWAPP doit être publiquement regardable, de haute qualité, son compris, sur Edge, Firefox, iOS et Android ; l'état « en direct » ne prouve pas que les images arrivent.
- Le lecteur et le chat restent sur la **même ligne et à hauteur synchronisée**, en direct **et hors ligne** ; sur mobile ils passent en colonne.
- GIFs du chat : recherche textuelle en français par émotions (fâché, rire, etc.) ; vignettes non superposées et défilement autonome ; emotes lisibles.
- Véritable titre du direct **au-dessus** du lecteur ; catégorie/jeu réels et métadonnées du streamer.
- **Suivre** = gratuit ; **cloche d'alerte live** = opt-in indépendant et révocable, notifications système seulement si Push réellement fonctionnel ; **S'abonner** = soutien mensuel payant distinct (aucun péage pour regarder).
- Expérience premium, immersion à 93 % d'assombrissement autour de la vidéo, commandes claires, pas de composants superposés ni d'usine à panneaux.
- Contraintes : Hostinger Node + MySQL existant, pas de VPS, pas d'outil de navigation payant, pas de service récurrent supplémentaire par défaut. Ne pas annoncer « 0 latence » pour du HLS.

## Résultats fondés et portée

| Code | Sévérité | Observation / source | Recommandation |
|---|---|---|---|
| REL-01 | P0 | PR #150 encore brouillon/non fusionnée ; statut de preview Netlify du commit de branche en échec (cause inconnue, ne prouve pas que Hostinger est en panne). | Corriger/vérifier checks pertinents puis tests navigateur avant fusion et déploiement. Ajouter QA reproductible. |
| LIVE-01 | P0 | `modules/swapp-direct-hls-relay.js` : `MAX_ROOMS` borné à 2 ; 48 MiB par room par défaut, 80 s de DVR, limite montante 120 MiB/min, **une seule qualité** H.264/AAC sans ABR. | Tests multidiffuseurs et bande passante ; télémétrie lecture, buffering, bitrate, coupure ; maîtriser l'audience maximale sur hébergement actuel. Ne pas vendre de capacité non vérifiée. |
| LIVE-02 | P0 | Existence de plusieurs voies : WebRTC navigateur, secours HTTP/MSE, HLS OBS. Historique d'écrans noirs/instabilité ; pas de preuve E2E dans cet audit. | Matrice PC-Edge -> Firefox/4G/iOS, son, image, 3 redémarrages, pause/DVR, 30 min de lecture ; un seul chemin média actif à la fois. |
| LIVE-03 | P1 | Corrections GIF, chat hors ligne, titre du live codées dans PR #150. L'API `/api/oryon/channel/:login/status` renvoie déjà `live.title`. | Finaliser QA CSS sur toutes résolutions ; aucun overlay sur la vidéo ; vérifier source réelle et visibilité de titre. |
| DATA-01 | P0 | `modules/swapp-news/router.js` lit/écrit dans Firestore et protège `/api/actus` par `isReady()`. Une extraction publique récente de la page d'accueil affiche « Les actualités sont momentanément indisponibles » ; ne permet pas de conclure que tous les visiteurs ont la panne. | Vérifier réponse réelle de l'API et stockage ; fournir **fallback read-only** de la dernière publication/cache éditorial si Firestore indisponible ; prévoir migration éditoriale MySQL ou stratégie documentaire fiable. |
| DATA-02 | P0 | Documents de cutover datés du 21–22/10 indiquaient encore les comptes sur Firestore ; état du 25/10 non vérifiable ici. | Vérifier `/api/oryon/persistence-status` avant toute nouvelle mutation ; tests 2 vrais comptes + sessions + connexion Twitch mobile, sauvegarde et restauration. |
| SOCIAL-01 | P1 | `modules/swapp-social-native/pulse.mjs` : table `swapp_social_native_store`, état `LONGTEXT`, `SELECT ... FOR UPDATE`, sérialisation JSON de l'ensemble à chaque mutation. | Normaliser progressivement users/posts/follows/messages/notifications avec transactions ciblées et index ; ajouter migration sans perte de données. Risque d'écriture sérialisée à mesure que la communauté grandit. |
| TV-01 | P1 | `docs/SWAPP_TV_REGIE_QUEUE.md` marque file persistante, régie synchronisée, lecteur continu, notifications et modération **non livrés**. | Concevoir une régie serveur unique et une queue transactionnelle, accès Creator SWAPP, fenêtre validée, rotation équitable, pas de faux statut en production. |
| GROW-01 | P1 | Le site relie déjà article /jeu /live /SOCIAL, mais aucun funnel chiffré n'a été validé par cet audit. | Tracer de façon respectueuse de la vie privée les parcours jeu → article → live lancé → follow → visite récurrente ; un CTA contextuel principal, pas de module supplémentaire. |
| PUSH-01 | P1 | `assets/swapp-mairy.js` signale lui-même « aucune notification système », préférences localStorage et contrôle tant que l'onglet est visible. | Service worker + Push API/VAPID + opt-in par chaîne + persistance MySQL + déduplication de session live ; tests onglet fermé/multidevice. |
| PAY-01 | P1 | `package.json` possède `stripe`, mais aucun système de **souscriptions payantes de chaîne confirmé** dans l'audit. | Vérifier capacité du prestataire à répartir les versements, prix TTC, conditions légales, webhooks signés idempotents, remboursements, désabonnement et droits actifs seulement après paiement. Aucun débit fictif. |
| QA-01 | P0 | Scripts `npm test`, `npm run audit:p0`, `npm run verify:production` et `scripts/production-qa.mjs` existent, sans résultat production présent dans cet audit. | Imposer une release gate : tests + statut backend + cohérence JS/CSS servies + tests utilisateurs + rollback documenté. |
| SEO-01 | P1 | Rendu extrait publiquement de la home avec actualités et lives vides. Cela peut dépendre d'exécution JS par robot et ne remplace pas le contrôle réel. | Vérifier ce que voient moteurs et visiteurs sans JS, fallback d'article vedette, canonical/OG image, bande-annonce et preview Discord, liens article-jeu-chaîne. |

## Les 6 travaux les plus rentables en premier

1. **Fiabiliser la lecture** : au moins un live OBS testé Edge/Firefox/téléphone externe et 30 min stables ; mesurer startup, rebuffer, audio et reconnexion ; afficher les erreurs utiles sans clignotement du lecteur.
2. **Éviter le vide éditorial** : API news fiable avec dernière publication locale read-only quand stockage distant échoue ; hero récupérable sans F5 ; ne jamais laisser « momentanément indisponible » remplacer toute la valeur du magazine.
3. **Stabiliser identités/session** : état MySQL réellement actif, une seule connexion SWAPP, scénario d'essai sur iPhone/Android, Social et Live.
4. **Livrer le suivi et les alertes réels** : follow gratuit, cloche par créateur, push opt-in confirmé, zéro message doublon ; expérience transparente si navigateur non compatible.
5. **Créer le parcours d'usage SWAPP** : depuis une fiche jeu/articles : streamer vivant et adapté → lancer vidéo → suivre → accéder à SOCIAL correspondant → retrouver le live plus tard. Ne pas dupliquer des cartes.
6. **Ouvrir les souscriptions créateur** : un seul palier initial, règles et paiements confirmés, emotes/badges distinctifs, résiliation claire, pilote restreint.

## Garde-fous

- **Pas de déploiement/activation** automatique pendant cet audit.
- **Aucun montant ni pourcentage** fixé ou supposé ; aucun système de paiement activé.
- Une confirmation par la seule présence de routes et de textes dans le dépôt **n'est pas** une preuve que le service est opérationnel.
- Le « vrai direct », les chiffres de spectateurs et les bénéfices du programme Spotlight doivent être vérifiés, jamais simulés.
- Pour la latence, choisir et **mesurer** selon cas : WebRTC peut viser l'interactif, HLS natif la qualité et le DVR ; pas de promesse universelle « zéro seconde ».
- Le coût serveur et l'usage de bande passante augmentent avec chaque spectateur ; la préservation du flux natif ne rend pas la distribution gratuite à grande échelle.

## Tests de validation recommandés

- Desktop à 1440p/1080p/1366px, téléphone vertical et horizontal : GIFs, chat, hors-ligne, vidéo, titre, immersion.
- Deux navigateurs, deux réseaux (Wi-Fi/4G), deux comptes : permissions, messages, notifications, badge de souscription une fois payé.
- Trois redémarrages de diffusion, pause/reprise, coupure 30s, reprise de synchronisation, changement de qualité si future ABR.
- Vérifier `/api/release`, `/api/oryon/persistence-status`, `/api/actus`, `/api/swapp/social-native/backend-status`, `/api/swapp-tv/queue/status`, `/api/creator/spotlight/status`, `/api/oryon/local-relay/capabilities`.
- Dernière étape : piloter la mesure de conversion (visite → démarrage vidéo réel → follow → retour 7j) sans suivre inutilement les utilisateurs.
