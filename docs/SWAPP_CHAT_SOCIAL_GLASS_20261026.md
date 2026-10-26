# SWAPP — Tchat Social Glass, version du 26 octobre 2026

## Changements sur le VRAI site
- **Une surface de diffusion commune** pour le lecteur vidéo 16:9 et le tchat natif : bordure continue, séparation subtile, coins arrondis et thème SWAPP préservé. On ne déplace ni l'iframe de lecture, ni les nœuds du tchat.
- **Points par défaut « pts de chaîne »** : côté spectateur et gestion créateur, label clair et solde réel ; les points et récompenses sont toujours débités par les APIs existantes (75/150/250, aucun argent réel).
- **Plus de doublon Signaler + drapeau** : quand le tchat natif est monté, le menu discret « Options » ouvre le bouton de signalement d'origine ; le même menu expose la modération native uniquement quand les droits de modération existent. Les véritables callbacks sont conservés.
- **Style gaming social original** : messages plus vivants, avatars colorés existants, boutons ludiques à faible encombrement, GIF et emotes conservés, barre de composition plus expressive.
- **Réactions rapides** : des emojis intégrés à la saisie de SWAPP, et non un envoi automatique ou un faux message. La vraie touche Envoyer reste nécessaire.
- Menu : **Derniers messages** (défilement réel) et **Mode discret** (réduit les effets graphiques localement, sans persistance ni traitement du flux vidéo).
- Respect **plein écran / immersion / masquer tchat / mobile** et des utilisateurs préférant réduire les animations.

## Points techniques
- Nouvelles ressources : `assets/swapp-chat-social.js` et `assets/swapp-chat-social-glass.css`.
- Les classes sont limitées à `#channel .creatorRefine.swapp-channel-polish[data-channel-live="true"]`. Les autres pages et le tchat hors direct restent inchangés.
- Script non destructeur, il s'insère sur l'entête et la barre existants, n'intercepte pas les émissions Socket.IO et n'altère ni les commandes de sécurité, ni les API, ni l'accès aux comptes.
- Sans un vrai navigateur connecté, on ne peut pas garantir un rendu final parfait à chaque résolution : vérifier Windows et mobile (320, 390, 768, 1280 et 1920 px), notamment le panneau de récompenses, le menu et le mode Immersion.
- Le navigateur doit récupérer les nouveaux fichiers (versions de cache mises à jour). Le déploiement Hostinger **n'est pas confirmé**.
- Un déploiement automatique Hostinger peut redémarrer Node et interrompre temporairement un direct ; préférer une fenêtre sans diffusion.
- Aucun service, abonnement, API ou VPS payant ajouté.

## QA
Tests régression ajoutés dans `test/swapp-chat-social-glass.test.js`. Recommandé : `node --test test/swapp-chat-social-glass.test.js test/swapp-channel-focus-20261026.test.js test/swapp-chat-v2.test.js test/swapp-channel-audience.test.js` puis `npm test` local, sans GitHub Actions payantes.
