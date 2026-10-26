# SWAPP — jeu automatique, agenda et récompenses dans le tchat (26 octobre 2026)

## 1. Jeu automatique

Le bouton « Détecter le jeu » a été retiré. Dans la page de gestion SWAPP et la fenêtre de modification du live, la catégorie **générique ou vide** est synchronisée automatiquement grâce à `GET /api/swapp/live/auto-game`, la source fiable déjà en place (Twitch lié, direct Twitch et, à défaut, catégorie configurée).

- Enregistré côté serveur par l'API propriétaire **SWAPP** `/api/swapp/live/metadata`, et non simplement prérempli en interface.
- Pas de clic nécessaire ; tentative à l'ouverture puis toutes les 90 secondes quand le gestionnaire est actif.
- **En parallèle**, un contrôle serveur dans `modules/swapp-native-auto-game.js` vérifie toutes les trois minutes (premier essai après 30 secondes) au maximum **4 chaînes actuellement en direct**. Il met à jour uniquement une catégorie vide/générique depuis le Twitch lié, sans exiger que le dashboard reste ouvert. Les catégories manuelles sont protégées.
- Un vrai OBS transmet du HLS et **n'expose pas le nom du processus Windows** ; sans compte Twitch lié et catégorie pertinente, aucune détection fiable du jeu n'est possible depuis le seul flux vidéo.
- Saisie manuelle prioritaire ; aucune catégorie non générique écrasée.
- Une simple vidéo OBS/HLS ne contient **pas** le nom du jeu ou celui du processus Windows. Sans source fiable (par exemple Twitch lié), le jeu **ne peut pas être déterminé automatiquement** ; affichage honnête du message de liaison et saisie manuelle disponible.
- Pas de reconnaissance d'image factice, pas d'API payante.

## 2. Agenda

Le lien « Voir l’agenda » du panneau hors ligne ouvre le véritable onglet Programme quand celui-ci est déjà dans le DOM. Si la vue n'est pas prête, navigation réelle sur l'URL de chaîne `?tab=programme` afin de déclencher son montage. Le lecteur et le tchat ne sont ni déplacés ni redimensionnés.

## 3. Récompenses avec points de chaîne

Une petite commande **« Mes points / Récompenses »** est présente **dans le tchat SWAPP natif**, près de la saisie. Trois récompenses disponibles pendant le direct :

| Récompense | Coût | Action |
|---|---:|---|
| Ovation | 75 points | Annonce collective |
| Message mis en avant | 150 points | Mise en valeur du texte saisi |
| Question à la communauté | 250 points | Question visible dans le fil |

- Confirmation de la dépense, somme et solde contrôlés côté serveur (jamais par JavaScript client).
- Compte SWAPP authentifié + présence dans le tchat de la chaîne + direct actif exigés.
- Bannissement, mise en sourdine ou timeout empêchent les dépenses.
- Anti double clic : limite 12 secondes, identifiant de requête unique.
- En mode MySQL existant : solde verrouillé, débit et journal `swapp_channel_redemptions` **dans une transaction**, clé d'idempotence permanente. La nouvelle table est créée lors du premier usage. L'intégration nécessite le droit SQL CREATE TABLE.
- En mode stockage JSON local : débit sauvegardé avant publication de l'événement. Historique limité des dernières demandes et donc idempotence bornée ; **mode de secours monoproc**, ne convient pas à plusieurs instances simultanées.
- L'événement `swapp:channel:redeemed` est émis vers les participants du salon **après débit confirmé** et affiché dans le fil sans se faire passer pour un message natif de tchat.
- Message maximum 140 caractères, rendu en `textContent` (pas de HTML injecté), 15 événements maximum affichés pour ne pas saturer le fil.
- Les points de chaîne ne sont ni convertibles en euros ni monnayables. Aucun fournisseur payant ni jeton externe.

## Limites

- Ne pas promettre que la catégorie du processus de jeu OBS est reconnue si elle n'est pas fournie par Twitch ou corrigée manuellement.
- Ne pas prétendre que les événements de récompense sont conservés dans l'historique des messages : les événements sont éphémères côté navigateur, la dépense est persistée.
- Le solde `points` actuel sert à la fois au classement et au portefeuille dépensable. Une dépense diminue donc le score affiché. Un futur champ « points cumulés depuis le début » permettra de distinguer fidélité et crédit disponible.
- Si le tchat ou le direct est indisponible, aucune dépense n'est autorisée.
- Les droits de modération et validations anti-fraude doivent rester côté serveur.

## Tests et pré-déploiement

`node --test test/swapp-chat-rewards-agenda-game.test.js test/swapp-channel-redeem-mysql.test.js test/swapp-channel-audience.test.js test/swapp-channel-points-mysql.test.js test/swapp-channel-agenda.test.js`

Puis `npm test`, sans exécuter de GitHub Actions payantes.

Vérifier sur Hostinger : catégorie Twitch liée, absence de modification après correction manuelle, ouverture du programme depuis une chaîne hors ligne, mobile, achat à 75 points, soldes insuffisants, réachat après redémarrage, deux spectateurs, ban/modération et réception de l'événement chat. Un merge peut redémarrer le serveur Node Hostinger ; éviter les heures de directs importants.
