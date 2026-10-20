# SWAPP Creator — lancement progressif (20 octobre 2026)

## État réel après les PR #70 et #71
- **P0** : couche MySQL, OAuth Twitch et API de jeux présentes ; vérification de l'application Hostinger, des sessions OAuth réelles et du stockage de production toujours nécessaire.
- **P1** : compte SWAPP unique et liaison Twitch Creator depuis le tableau de bord **fusionnés sur master** ; profil Creator enrichi restant à tester/compléter.
- **P2** : création, déplacement et annulation des réservations Spotlight de 30 minutes en MySQL **fusionnées sur master**, sous commutateur `SWAPP_SPOTLIGHT_ENABLED=1` (désactivé par défaut).
- **P3** : créneaux intégrés aux articles ACTUS et fiches de jeux ; mise en avant live uniquement avec contrôle Twitch user_id/game_id. **Code fusionné, fonctionnement Hostinger non vérifié**.
- **P4** : contraintes uniques et protection des créneaux présentes, mais liste d'attente, remplacement automatique des absences et rotation équitable avancée non livrés.
- **P5** : pilote réel non lancé ; badge ASCENSION et Creator Network non livrés.
- Détails techniques, instructions Hostinger et tests : [SWAPP_SPOTLIGHT_MVP_20261020.md](./SWAPP_SPOTLIGHT_MVP_20261020.md).



## Décision produit
Un seul compte d'identité : **SWAPP**. Twitch et, plus tard, d'autres plateformes sont des comptes externes associés depuis le **tableau de bord Creator**. La connexion Twitch seule ne crée jamais un compte SWAPP ni un droit de réserver un Spotlight.

Le parcours **Mon compte > Connexions > Gérer Twitch** renvoie au tableau de bord, qui concentre liaison, changement et déliaison. Aucune nouvelle infrastructure/VPS : backend Node existant sur Hostinger et comptes MySQL existants.

## Lot 1 — Liaison Twitch (branche de travail)
- Démarrer OAuth avec `/twitch_auth_start?mode=link`, depuis une session SWAPP authentifiée.
- Preuve de liaison courte, signée, liée à l'identifiant SWAPP + state OAuth ; retour vers `/dashboard`.
- Refuser une chaîne Twitch déjà associée à un autre compte SWAPP.
- Afficher un état confirmé par `GET /api/creator/twitch/status` sans exposer les jetons.
- Délier avec `POST /api/creator/twitch/unlink`, vérification de session, méthode et origine.
- Isoler la session Twitch au changement de compte SWAPP et à la déconnexion SWAPP.
- Les anciennes connexions Twitch autonomes peuvent encore servir les fonctionnalités historiques, mais ne sont plus une liaison automatique au compte SWAPP.
- Tester impérativement OAuth réel sur SWAPP.tv, iPhone Safari, Android Chrome et desktop avant fusion.

## Lots suivants — dans cet ordre
1. **Profil Creator** : jeux favoris, créneaux disponibles, chaîne externe vérifiée, paramètres publics, tableau de bord lisible. Aucun second compte.
2. **Spotlight** : table MySQL des jeux/événements + des réservations, bloc intégré aux articles et fiches de jeux, annulation, liste d'attente, limites de fréquence, verrouillage transactionnel contre les doubles réservations.
3. **Vérification réelle du direct** : Twitch user_id + game_id vérifiés, aucun statut « en direct » inventé, tolérance raisonnable aux retards, remplacement si absence.
4. **Découverte équitable** : créneaux gratuits priorisant les créateurs émergents, rotation, contrôle de monopole, quota réservé aux nouveaux participants. Les budgets sponsorisés sont exclus des quotas gratuits.
5. **Ascension** : moyenne d'audience sur plusieurs sessions vérifiées, bornes contre les micro-échantillons, récompenses symboliques et bonus temporaires de découverte ; jamais de paiement contre un meilleur classement organique.
6. **Creator Network** : événements Headliner et collaborations, puis prestations commerciales distinctes pour marques et studios, contrats, identifications publicitaires et mesure transparente.

## Modèle économique pilote
- Compte Creator et participation organique gratuits.
- Pas de paiement automatique dès 500 viewers.
- Priorité dans certains Spotlight gratuits aux audiences inférieures au seuil pilote, ajusté après mesure.
- Événements commerciaux clairement étiquetés, sans influencer la rédaction ni les emplacements équitables.
- Les gros streamers viennent pour une audience pertinente, des collaborations et des revenus additionnels, pas pour payer le simple droit d'exister.

## Premier pilote : hypothèses à valider
- 5 jeux, 30 créateurs, 50 créneaux, 1 événement avec créateur tête d'affiche.
- Cibles expérimentales : 75 % de créneaux honorés, 40 % de créateurs participant une seconde fois, 95 % de correspondance jeu/live correcte.
- Mesurer séparément les opportunités proposées, les impressions effectivement consenties, les clics et les visites qualifiées.
- Ne pas assimiler les propositions API aux cartes vues. Les données Fair Discovery existantes ne prouvent pas encore l'équité globale.
- Aucun lancement commercial tant que le suivi fiable et la conformité n'ont pas été vérifiés.

## Validation et exploitation
1. Mettre à jour une branche dédiée, pas master en direct.
2. Contrôler la syntaxe, `node --test test/swapp-creator-twitch-link.test.js`, `npm run check`, puis `npm test` localement/Hostinger sans déclencher de CI facturée.
3. Vérifier `/api/oryon/persistence-status` : stockage MySQL opérationnel ; aucune migration implicite d'anciens comptes.
4. Tester avec deux comptes SWAPP indépendants et deux chaînes Twitch ; tenter un doublon, un state expiré, un changement de compte entre début et fin OAuth, et une déliaison avec l'origine invalide.
5. Tester retour `/dashboard`, rafraîchissement F5, conservation du lien après redémarrage, affichage mobile et clavier.
6. Vérifier `/api/release` après déploiement Hostinger, conserver une possibilité de rollback. **GitHub commit ≠ production validée**.

Ce document spécifie le projet ; seules les fonctions explicitement présentes dans la branche peuvent être considérées comme développées.
