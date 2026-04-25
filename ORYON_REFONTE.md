# Refonte Oryon — streaming à taille humaine

Cette version remplace l'entrée principale par une nouvelle page `index.html` centrée sur la contre-culture produit :

- mise en avant des petits lives Twitch, avec filtre sous 300 viewers ;
- recherche de streamers Twitch intégrée au site ;
- lecture via Twitch Embed, donc sans coût vidéo pour l'infrastructure du projet ;
- positionnement natif futur : salons limités à 300 viewers ;
- Discovery et Trade/Market ne sont plus dans le parcours principal.

## Fichiers modifiés

- `index.html` : nouvelle homepage Oryon complète.
- `app.js` : ajout de `/api/twitch/channels/search` et priorité donnée à `index.html` sur la route `/`.

## À configurer

Les endpoints Twitch existants nécessitent les variables d'environnement Twitch déjà prévues dans le projet. Sans clés API, la recherche exacte peut quand même ouvrir un embed Twitch, mais les listes automatiques ne chargeront pas.

## Logique produit

- Les gros streamers restent consultables via recherche/embed.
- L'accueil donne l'avantage aux petits créateurs.
- Le natif doit rester plafonné à 300 viewers pour éviter de recréer les mêmes effets de domination que les grosses plateformes.
