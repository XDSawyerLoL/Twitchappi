# SWAPP FLASH — étape 1 de SWAPP PREMIÈRE (4 novembre 2026)

## Pourquoi ce chantier

SWAPP doit faire plus que publier une actualité puis laisser le lecteur repartir. Le parcours distinctif visé est :

**actualité vérifiée → briefing interactif → bande-annonce → créateurs réellement en direct → suivi du jeu → événement de découverte rémunéré par un studio**.

Cela peut devenir, à terme, **SWAPP PREMIÈRE** : un rendez-vous interactif organisé autour d'un jeu indépendant, avec des démos réalisées par des créateurs rémunérés et des rapports de campagne pour les studios. Le marché publicitaire du studio finance l'événement, pas un abonnement pour le streamer.

Cette PR livre uniquement **l'étape 1 — SWAPP FLASH**, qui ne facture rien et ne lance aucune campagne automatiquement.

## Ce que fait la PR

- Génération **à la demande et en lecture seule** de chaque briefing éligible à /flash/:slug à partir du catalogue réellement publié par le CMS MySQL / la couche éditoriale existante.
- Un article retiré, brouillon, non vérifié, ou une source éditoriale indisponible ne produit pas de FLASH public.
- Aucun nouveau contenu n'est fabriqué par une IA : la séquence reprend le titre, le résumé, et au maximum trois **paragraphes intégraux** d'un article publié. Les paragraphes trop longs ou inadéquats sont écartés plutôt que tronqués dans une phrase trompeuse.
- Interface sombre, immersive, adaptée au mobile, flèches clavier, balayage, progression lisible, boutons de partage, prise en compte de la réduction des animations.
- Vidéo YouTube de l'article, uniquement quand l'URL est valide et l'utilisateur lance volontairement la lecture. Aucune iframe tierce chargée avant ce clic.
- Handoff vers l'article complet, le hub du jeu, SWAPP SOCIAL, la bibliothèque de jeux volontaire et le module de vrais directs déjà utilisé ailleurs sur SWAPP.
- Lien d'entrée depuis l'article publié et depuis le hub du jeu.
- Aucun tracking ajouté, pas de stockage de profil, pas de webhook, pas d'API TTS, pas d'API d'images, pas de VPS.

## Fichiers

- modules/swapp-flash.js — validation, extrait éditorial et HTML
- modules/swapp-news/router.js — GET /flash/:slug, lecture du snapshot publiable
- modules/swapp-news/native-pages.js — entrée depuis l'article
- modules/swapp-game-pages.js — entrée depuis le hub du jeu
- assets/swapp-flash.css — apparence
- assets/swapp-flash.js — navigation et vidéo explicite
- test/swapp-flash.test.js — protections, sources et parcours

## Ce que cela n'est PAS encore

- Pas une vidéo MP4 générée et exportée vers TikTok, Instagram ou YouTube.
- Pas encore le podcast Nova/Kern : sa synthèse naturelle reste indépendante de ce développement.
- Pas de votes communautaires persistés, de RSVP, de matchmaking, de réservation studio, ni de paiement.
- Pas de démonstration qu'un studio est prêt à acheter un forfait.
- Pas de déploiement, ni d'essai E2E avec plusieurs sessions/lecteurs sur Hostinger.

## Phases suivantes

1. **SWAPP FLASH** (cette PR) : une découverte en quelques gestes, de l'article au jeu.
2. **Signal d'intérêt** : intention volontaire et respectueuse de la vie privée « Je voudrais voir ce jeu testé » avec mécanisme anti-abus et résultats agrégés ; ne pas présenter de fausses statistiques.
3. **SWAPP PREMIÈRE** : les créateurs inscrits et sélectionnés testent la démo avec cachet contractuel financé par le studio ; aucun classement organique vendu.
4. **Bilan studio** : rapport vérifiable de la campagne, sans suivre les individus ni inventer des conversions. Les clics externes et listes de souhaits ne sont attribuables qu'avec l'accord du studio et une mesure fiable.
5. **SWAPP ON AIR** : émission vocale seulement après validation de la qualité et du coût de rendu.

## Tests

Tests ajoutés au dépôt :

    node --test test/swapp-flash.test.js
    node --test test/swapp-game-pages.test.js
    node --test test/news-router.test.js

En environnement JS isolé, la syntaxe des fichiers modifiés et 13 assertions de logique du module passent (avec une classe URL simulée car cet environnement ne fournit pas l'objet URL du navigateur ou de Node). La batterie Node complète, le navigateur mobile, l'hébergement Hostinger, l'OAuth et les vrais flux restent à vérifier. Ne pas annoncer 100 % de stabilité.

## Déploiement

- Garder la PR en brouillon jusqu'aux tests Node et à une vérification en environnement de préproduction.
- Vérifier /flash/:slug sur au moins un article CMS publié, sur un brouillon et après retrait.
- Vérifier que les liens du jeu ouvrent le bon hub et que le bloc des directs affiche uniquement des flux effectivement actifs.
- Vérifier que le site ne charge pas une vidéo YouTube sans clic.
- Une fois les tests passés, intégrer et déployer selon le flux Hostinger habituel ; **ce PR n'a pas été fusionné ni déployé**.
