# SWAPP PASSAGE — recette de fin de live

## Comportement produit

Sur `/:login`, `/live/twitch/:login` ou `/tv` :

1. Le visiteur commence à suivre un live réellement en cours.
2. Le service vérifie périodiquement le statut de **la chaîne d'origine**, sans interpréter une erreur API comme une fin de direct.
3. Deux confirmations successives `offline` déclenchent une proposition seulement si la catégorie de jeu a été connue pendant la diffusion.
4. Un autre streamer **actif et validé sur exactement le même jeu** est sélectionné sans tenir compte de ses spectateurs.
5. Un compte à rebours de neuf secondes permet d'accepter immédiatement ou de rester sur place.
6. Le serveur vérifie une dernière fois **source ET destination** avant le passage. En cas d'échec, ne pas rediriger.
7. Sur SWAPP TV, le changement utilise le lecteur existant; sur une page de chaîne, il reste sur le site SWAPP en ouvrant la chaîne suivante.

Aucun passage automatique n'est déclenché si la source était déjà offline à l'ouverture de la page, si aucun autre live du jeu n'existe, si Twitch ne répond pas ou si l'utilisateur annule.

## Recette avant production

- [ ] Twitch (jeu A) termine son direct, Twitch (jeu A) prend le relais.
- [ ] Twitch (jeu A) termine son direct, SWAPP (jeu A) prend le relais.
- [ ] SWAPP (jeu A) termine son direct, Twitch (jeu A) prend le relais.
- [ ] SWAPP (jeu A) termine son direct, SWAPP (jeu A) prend le relais, même sans identifiants Twitch.
- [ ] Aucun autre live de A : **aucun passage** à B.
- [ ] `Hades` n'est jamais associé à `Hades II`.
- [ ] Segment HLS temporairement inaccessible, mais le direct reste déclaré actif : **aucun passage**.
- [ ] Serveur Twitch inaccessible ou erreur HTTP 429/503 : **aucun passage**.
- [ ] Direct source repris pendant le compte à rebours : **annulation**.
- [ ] Candidat recommandé arrêté avant le passage : **pas d'ouverture de la chaîne hors ligne**.
- [ ] Bouton « Rester » : plus de relais sur cette page.
- [ ] Mobile : son éventuellement coupé lors de la reprise automatique (limitation des navigateurs), commande Play toujours disponible.
- [ ] Pages Twitch : notice après le player, aucun cache-overlay devant les contrôles Twitch.
- [ ] Station TV : un unique player / iframe après passage et chat actualisé.

## Exécution

`node --test test/swapp-live-handoff.test.js`
`npm run verify:production`

Le smoke vérifie le code réellement servi après déploiement Hostinger, mais pas la fin d'un vrai live : la recette en conditions OBS / Twitch reste nécessaire.

## Conditions et exploitation

- Source Twitch : la validation de statut et des candidats nécessite les identifiants Twitch déjà utilisés par le service; aucune nouvelle API ou dépense.
- Source SWAPP : HLS prouvé par SWAPP ou signal natif actif. Pour plusieurs processus Node, le stockage partagé reste un chantier séparé (#196).
- Désactivation immédiate en cas d'incident : `SWAPP_LIVE_HANDOFF_DISABLED=1` sur Hostinger puis redémarrage Node. Le lecteur normal reste disponible.
- Les caches Twitch sont éphémères (7s statut, 25s jeu). Le système n'enregistre aucune identité spectateur.
- Le passage peut prendre plusieurs dizaines de secondes car la protection contre les coupures passagères est volontaire.
