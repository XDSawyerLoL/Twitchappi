# SWAPP PODCAST — conversation Nova / Kern (7 novembre 2026)

## Identité publique
La rubrique s'appelle **PODCAST**, sans le nom ON AIR dans les menus, le titre, les pages d'épisode, la fiche du studio, le flux RSS et les métadonnées.
Les routes techniques `/on-air`, `/on-air/feed.xml`, `/api/on-air/*` et les fichiers MP3 historiques sont préservés pour éviter de rompre les liens, les abonnements et la lecture. Le renommage ne justifie pas une migration risquée de serveur.

## Conversation, pas journal lu à deux
- Nova et Kern **se parlent directement**. Les questions naissent de la réplique précédente ; chacun réagit à une idée concrète de l'autre.
- **Pas de** « bienvenue », « chers auditeurs », « aujourd'hui nous allons vous parler », « comme vous le savez », « restez avec nous » ni résumé final récité à un public.
- Personnalités : Nova spontanée, curieuse et parfois impulsive ; Kern analytique, légèrement ironique, contradicteur sans mépris. Ils peuvent changer d'avis.
- Alterner réponses très courtes, idées plus développées, objections et retours spontanés. Ne pas imposer un schéma exposé/question/exposé systématique.
- Débattre des **implications** des annonces : ce qui donne envie, ce qui reste à vérifier, ce qui n'est qu'une promesse marketing. Jamais prétendre avoir testé un jeu si ce n'est pas documenté.
- **Sources primaires** obligatoires pour les annonces. Le dialogue peut être drôle sans inventer de faits, de tests, d'expériences ou de citations de studios.

## Voix et rythme
Le fichier `data/swapp-on-air/episode-pikmin-20261105.json` est désormais un **nouveau brouillon**, avec 30 répliques Nova/Kern et un `pause_after_ms` propre à chaque intervention (60 à 900 ms). Le rendu local Qwen3-TTS prend ces durées en compte après validation. Les indications `delivery` ne garantissent pas que le modèle léger de clonage reproduise l'intention.
Les silences doivent sembler issus de la pensée et de la répartie, non d'un minuteur fixe. Ne pas enchaîner tous les tours avec la même pause. Éviter les hésitations artificielles à chaque phrase.

## Livraison et sécurité
- L'épisode MP3 déjà publié reste **inchangé** et doit rester audible. Il comporte encore l'ancienne formule dans sa conclusion ; le titre/branding du site a changé, **pas la bande sonore**.
- Le brouillon V2 n'est **ni une sortie audio ni une publication**. Il doit être rendu localement à partir d'un nouvel emplacement `.swapp-on-air-private/swapp-podcast-pikmin-dialogue-v2.wav` pour éviter de réutiliser l'ancien MP3 par erreur.
- Génération gratuite prévue : `scripts/swapp-on-air-start-fr.ps1`. Écouter intégralement le MP3 obtenu, vérifier les faits et les voix, puis publier seulement après validation éditoriale via le studio existant.
- L'assistant qui modifie GitHub sans accès à l'environnement vocal local ne peut pas affirmer avoir régénéré les voix ou remplacé le MP3 sur Hostinger.
- Avant un déploiement : tests existants du module PODCAST, vérification RSS `PODCAST`, route `/on-air`, lecture HTTP Range du MP3, et comparaison du fingerprint de release. Ne pas relancer de publication ni de coûts GitHub Actions inutilement.
