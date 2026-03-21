# Correctifs intégrés

## 1) Administrateur global
- Le compte Twitch `sansahd` est maintenant traité comme **administrateur** côté serveur.
- Il reçoit un rôle `admin` dans les réponses API.
- Il a un accès total à : marché, analytics, overview, niche, best time.
- Les garde-fous crédits/premium ne bloquent plus l’administrateur.

## 2) Marché / bourse
- Les endpoints de billing exposent maintenant l’état admin.
- Les vérifications d’accès marché restent cohérentes avec l’état billing.

## 3) Boost streamer
- Un utilisateur connecté peut demander le boost d’un streamer Twitch.
- Si aucun boost n’est actif : activation immédiate pour 15 minutes.
- Si un boost est déjà actif : la demande part en **file d’attente**.
- La file affiche l’avatar Twitch du demandeur, le streamer ciblé et la position.
- Un endpoint dédié `/api/boost/queue` alimente l’interface.

## 4) UX visible
- Badge administrateur dans l’espace utilisateur.
- Bloc Boost plus clair, plus explicite et en français.
- Messages de retour plus lisibles.

## Limite honnête
- Je n’ai pas traduit l’intégralité de toutes les vues profondes de l’application. La zone la plus critique a été rendue plus compréhensible en français, mais une passe de francisation globale peut encore être faite sur d’autres modules secondaires.


## Passe UX et francisation complémentaire
- Ajout d’un bandeau d’aide en haut de l’application avec parcours guidé.
- Renforcement du statut administrateur pour `sansahd` côté serveur et côté interface.
- Vérification que la Bourse ne redirige plus l’administrateur vers `/pricing`.
- Libellés principaux harmonisés en français : Bourse, Vue d’ensemble, Graphique Pro, Liste de suivi, etc.
- Clarification visuelle de la fonction Boost et de sa logique de file d’attente.
