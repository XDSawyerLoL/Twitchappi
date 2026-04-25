# Oryon — refonte anti-concentration

## Changements visibles

- Discovery et Trade ne sont plus dans le parcours principal.
- La page d’accueil ne montre plus le texte stratégique interne sur les seuils 0–20 / 20–300 / 300+.
- L’utilisateur voit une proposition simple : découvrir des petits lives, chercher Twitch, lancer/rejoindre un live natif expérimental.
- La recherche Twitch ouvre le player embed directement dans Oryon.

## Live natif expérimental

Un bloc WebRTC a été ajouté dans `index.html`.

Fonctionnement :

1. Le streamer entre un nom de salon.
2. Il clique sur `Lancer mon live`.
3. Le navigateur demande le partage d’écran/caméra.
4. Un viewer entre le même nom de salon.
5. Il clique sur `Rejoindre un live`.
6. Socket.IO sert uniquement à échanger les offres/réponses WebRTC et les ICE candidates.
7. La vidéo passe en pair-à-pair quand la connexion WebRTC réussit.

## Backend ajouté

Dans `app.js` :

- rooms WebRTC en mémoire via `nativeLiveRooms`
- `native:create`
- `native:join`
- `native:offer`
- `native:answer`
- `native:ice`
- `native:leave`
- nettoyage à la déconnexion
- limite de 300 viewers par salon natif

## Limites actuelles

Ce n’est pas encore un réseau P2P maillé entre viewers. C’est un prototype WebRTC host → viewers.

Pour aller vers le vrai modèle décentralisé, il faudra ensuite ajouter :

- TURN serveur pour les connexions derrière NAT strict
- super-peers / relais volontaires
- P2P Media Loader ou PeerTube si diffusion HLS segmentée
- authentification streamer
- annuaire public des salons natifs actifs
