# SWAPP — chantier P0 consolidé (25 octobre 2026)

## Travail intégré dans la branche
- Réconciliation de la PR #154 avec master (#155) dans un vrai commit de
  fusion à deux parents : les dernières publications éditoriales restent sur la
  branche et le tchat hors direct occupe la première ligne de la grille.
- Correction ciblée de syncChat : en mode hors direct, la grille fixe le
  positionnement et aucun décalage CSS 'translate' n'est injecté.
- Incorporation du cache temporaire d'articles confirmés publiés, contrôle de
  fraîcheur des segments HLS, choix gratuit Suivre/Ne plus suivre, cloche
  Web Push opt-in et titre réel du live présents dans les travaux P0.
- Nouvelle base de design réutilisant le fichier CSS commun existant :
  espacements, rayons, focus clavier visible, confort tactile et contraste
  élevé. Le thème utilisateur ne reçoit pas de deuxième sélecteur de couleur.
- Tests de régression ajoutés ; pas de nouveau service récurrent ou de VPS.

## Limites vérifiables
- Aucun compte Hostinger, hPanel, base MySQL ni secret n'a été modifié.
- Aucun déploiement en production n'est attesté. PR ouverte en brouillon.
- Les alertes Web Push demeurent désactivées sans configuration privée VAPID,
  MySQL comptes opérationnel et SWAPP_PUSH_ENABLED=1.
- Aucune souscription créateur payante n'est ouverte et aucun flux multiqualité
  ABR n'a été créé. Le relais vidéo reste borné (2 salles simultanées par
  défaut, bande passante de l'hébergement et qualité unique).
- Le cache des actualités nécessite une liste éditoriale confirmée au moins
  une fois avant une panne. Ce n'est pas une base de secours permanente.
- Les règles visuelles posent les fondations ; elles ne constituent pas une
  refonte validée visuellement de toutes les pages.

## QA gratuite obligatoire avant merge et Hostinger
1. Sur le checkout exact de la branche :
   `npm run check`, `npm test`, `npm run audit:p0`,
   `npm run verify:production` (sur la bonne cible).
   Ne pas activer de workflow GitHub Actions facturable.
2. Vérifier `/api/oryon/persistence-status`, sauvegarder les comptes
   avant toute activation MySQL ; tester deux comptes, F5, Social et Twitch OAuth.
3. Tester un vrai live OBS depuis Edge et une lecture externe Firefox +
   Safari iPhone/Chrome Android en 4G : 30 minutes, images réellement mouvantes,
   son, trois redémarrages, buffer, pause/DVR, reconnexion.
4. Vérifier le tchat/live/hors direct sur 1366px, 1920px et mobile,
   les GIF par émotion, le titre live, les touches clavier, la couleur du site.
5. Vérifier un suivi gratuit, le retrait du suivi et la persistance après
   connexion/déconnexion avec les droits serveur.
6. Pour le Push : installer/autoriser sur appareils compatibles, déclencher un
   vrai direct, recevoir une alerte navigateur fermé, désactiver la cloche,
   vérifier aucune notification du direct suivant. Conserver OFF tant que non testé.
7. Comparer l'empreinte `npm run release:info` à `/api/release` et garder
   un rollback qui protège les comptes/publications.

## Lots suivants — non livrés dans cette PR
- P1 — réduire les 26 CSS et 46 références JS et mesurer les Web Vitals ;
  réécrire les pages Accueil, Social, Créateur, Actualités et Boutique à partir
  des mêmes composants plutôt qu'empiler des surcharges.
- P2 — Game Universe relié aux IDs de jeux réels, Spotlight en production,
  SWAPP TV transactionnelle et ASCENSION mesurée, tous validés par utilisateur.
- P3 — croissance vidéo après mesure d'audience et capacité Hostinger,
  qualités adaptatives, abonnements créateurs avec paiement, conformité et SAV.

**Le chantier global n'est pas à 100 % sans essais réels, capacité média,
validation commerciale et déploiement. Ne pas communiquer comme tel.**
