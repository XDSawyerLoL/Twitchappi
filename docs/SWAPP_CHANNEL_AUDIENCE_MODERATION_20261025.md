# SWAPP — Modération stable, spectateurs et points de chaîne (25/10/2026)

## Fonctionnement

- Bouton de modération : raccourci compact fixé à la colonne `.channelLiveSidebar`, jamais ajouté dans l'en-tête du tchat, recréé par l'application. Permissions revérifiées toutes les 15 secondes, présence du bouton contrôlée toutes les 2,5 secondes sans bouger le lecteur.
- Menu créateur : « Spectateurs & points » ouvre le module du gestionnaire et affiche les comptes SWAPP présents dans le salon, les lectures déclarées par le navigateur et les points cumulés.
- Fidèles : classement des comptes ayant gagné des points, accessible au créateur même hors direct.
- Spectateurs non connectés : jamais identifiés ni affichés comme des comptes SWAPP.
- Sur la chaîne, un compte SWAPP authentifié voit son solde personnel dans la barre des actions de la chaîne.

## Attribution

- 5 points par minute complète de lecture active signalée ; plafond 300 points par compte, chaîne et jour UTC.
- Un compte ne gagne pas de points en ouvrant une page ou le tchat : Socket.IO doit l'avoir fait rejoindre un salon actif, il doit être authentifié et son onglet doit rester visible.
- WebRTC : le signal de décodage vidéo du lecteur natif SWAPP doit être présent dans `nativeLiveRooms.mediaViewers`.
- HLS : la lecture peut être détectée sur un élément `video` HTML5, y compris dans une iframe de même origine.
- Lecteurs externes dont le contenu ne peut pas être observé : non éligibles. Les déclarations du navigateur restent des indications, pas une mesure anti-fraude inviolable.
- Un seul cumul par identité SWAPP et par chaîne : pas de multiplication des points par ouverture de plusieurs onglets ; progressions à confirmer en conditions réelles.
- Les points ne sont pas convertibles, transférables ou échangeables tant que des récompenses et un registre de dépenses ne sont pas conçus.

## Persistance

- Si `SWAPP_ACCOUNT_STORE=mysql` et une URL de base de comptes valide sont configurés, les points sont conservés dans `swapp_channel_points`, table créée au premier accès par `modules/swapp-channel-points-mysql.js`. Transactions, verrouillage de ligne et plafond journalier dans les mises à jour.
- Hors mode MySQL, une sauvegarde JSON atomique `.swapp-channel-loyalty.json` assure uniquement un fonctionnement monoprocès. Elle peut disparaître avec un déploiement/recréation d'hébergement. Utiliser le MySQL existant en production.
- La liste des spectateurs connectés est instantanée, en mémoire sur un processus Node, pas un compteur global multi-serveur.
- Ne pas afficher les données privées ni les adresses IP dans l'espace créateur.

## Tests automatisés

`node --test test/swapp-channel-moderation.test.js test/swapp-channel-audience.test.js test/swapp-channel-points-mysql.test.js`

## Vérifications manuelles après déploiement

1. Le bouton de modération reste ancré, même après réception de messages et changement d'onglet. Aucun décalage entre lecteur et tchat.
2. Visiteur non connecté, modérateur et propriétaire : permissions cohérentes ; suppression et sanctions transmises en temps réel.
3. Gestionnaire → Spectateurs & points : compte connecté affiché une seule fois, lecture signalée seulement après démarrage du lecteur.
4. Écouter un live 1 minute authentifié et onglet visible : constater l'attribution ; masquer l'onglet puis changer de chaîne et vérifier qu'aucun point supplémentaire n'est gagné.
5. Tester la lecture HLS de même origine et les iframes externes, puis la reconnexion après déploiement pour confirmer la persistance SQL.
6. Confirmer l'ouverture en production de la table MySQL, les autorisations SQL et l'absence d'erreur serveur ; vérifier le plafond et l'isolement des comptes.

Aucune validation E2E en navigateur ou sur Hostinger n'est implicite dans les seuls commits GitHub.
