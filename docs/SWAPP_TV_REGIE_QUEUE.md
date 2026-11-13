# SWAPP TV — chaîne collective, régie et file d'attente

SWAPP TV (/tv) est une chaîne éditoriale autonome. Elle ne fait partie ni des comptes personnels, ni de « Mes chaînes », ni d'une chaîne Oryon traditionnelle. Programme TV (/tv/programme) est un service distinct.

## Paliers
1. Fondation actuelle : page /tv autonome, rotation des cartes de directs vérifiés, sans lecture automatique.
2. Régie : état d'antenne centralisé côté serveur, commun à tous les spectateurs. Pas de rotations locales désynchronisées.
3. Queue : rejoindre, quitter, attendre, passer à l'antenne, terminer ou être écarté. Une seule demande active par créateur. Compte SWAPP et liaison Twitch obligatoires.
4. Attribution équitable : temps de passage plafonné, délai de repos après diffusion, priorité aux profils sous-exposés, jamais basé uniquement sur l'audience.
5. Modération : validation du jeu diffusé, absence, mauvaise catégorie, anti-spam, historique des décisions et appels.
6. Lecteur TV : un seul flux officiel intégré, transitions contrôlées et respect des règles Twitch.

## Non livré actuellement
File d'attente persistante MySQL, inscription à la queue, régie synchronisée, lecteur TV continu, notifications, modération. Ne jamais présenter ces fonctions comme actives.

Contraintes : Hostinger Node + MySQL existants, pas de VPS, pas de dépenses récurrentes nouvelles, aucun direct ou rang fictif.


## Mise à jour du 13 novembre 2026 — lecture automatique à l'arrivée

- L'ouverture de `/tv` déclenche automatiquement la lecture du premier véritable direct retenu par SWAPP TV, sans clic supplémentaire sur « Regarder ».
- Priorité conservée : direct natif SWAPP uniquement si playlist et segments HLS sont vérifiés ; sinon passage réellement annoncé par la régie Twitch ; puis découverte de vrais directs si la file est inactive et si un jeu est couvert par les articles publiés.
- Démarrage **muet**, avec lecteur SWAPP ou iframe Twitch en autoplay. L'utilisateur peut activer le son dans le lecteur ; les navigateurs bloquent généralement les lectures automatiques non muettes.
- Si aucun direct n'est disponible, l'écran reste en attente. Aucune vidéo, identité ou diffusion simulée n'est affichée.
- Si l'onglet a été ouvert en arrière-plan, la lecture attend le premier affichage de la page.
- Un clic sur « Arrêter » coupe la lecture et annule tout redémarrage automatique de cette visite ; « Regarder » permet de relancer volontairement.
- La recherche ACTUS n'empêche plus le premier direct natif/de régie de démarrer. Les scripts et tests sont versionnés `20261113-arrival-autoplay-v2`.
- La fusion GitHub ne déploie pas Hostinger. Vérifier le rendu réel et le son sur Chromium, Firefox, Safari/iOS après installation.


## Correctif du 13 novembre 2026 — rotation de cinq minutes

- **Durée effective** : 300 secondes pour les passages officiels de la régie MySQL (`modules/swapp-tv-director.js`) et pour la découverte/rotation des créateurs natifs SWAPP ou Twitch (`assets/swapp-tv-broadcast.js`). Le contrôle serveur de la régie se répète toutes les 15 secondes au lieu de 60 (uniquement si les flags de régie sont activés).
- **Barre de rotation** : directement sous la vidéo, un indicateur de progression et un compte à rebours `05:00` → `00:00`, accessibles et mis à jour chaque seconde. Pour la régie, la source temporelle est `on_air.started_at` (horodatage MySQL) ; pour la découverte, le début de la lecture locale. Un arrêt manuel masque la barre et empêche toute relance automatique.
- **Bascule** : à la fin des cinq minutes, SWAPP TV sélectionne un autre direct SWAPP HLS réellement vérifié ou un direct Twitch présent dans la découverte. Les créateurs programmés changent lorsque la régie a confirmé leur nouveau passage (avec un délai potentiel du polling serveur). S'il n'existe pas d'autre direct réel, SWAPP ne simule pas un streamer : il attend le prochain contrôle.
- **Lecture au chargement** : les appels `/api/swapp-tv/native-lineup` et `/api/swapp-tv/queue/status` sont parallélisés. Un direct natif vérifié peut démarrer avant la réponse d'une file ralentie. Une simple file d'inscriptions ouverte **sans programme en cours** ne bloque plus le démarrage de la découverte. Les appels réseau sont limités à 8,5 secondes et les jeux sont interrogés en parallèle. En cas d'absence de lives éditoriaux, SWAPP essaye les vrais directs communautaires puis les directs de l'API Twitch publique.
- **Actus** : la bande d'espacement entre le menu global et la grande affiche de `/actus` a été supprimée avec une règle limitée au magazine. Les pages individuelles de lecture conservent leurs marges.
- **Mise en production** : déployer l'archive Hostinger complète (dont les CSS, le client TV, le directeur et `index.html`), redémarrer l'application Node et vérifier en navigateur la route `/tv`, la rotation après cinq minutes et la bannière `/actus`. La fusion GitHub ne signifie pas que la production a été mise à jour.
