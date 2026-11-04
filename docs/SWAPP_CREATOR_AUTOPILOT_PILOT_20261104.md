# SWAPP Creator Autopilot — pilote opt-in, novembre 2026

## Objectif et avantage réel

Un streamer ne doit pas quitter Twitch/YouTube pour « essayer SWAPP » sans preuve de gain. L'entrée recommandée est **sans migration forcée** : lier son Twitch à son compte SWAPP et laisser SWAPP préparer ses créneaux de découverte depuis son agenda. C'est un complément au live existant, pas une copie de son flux. Les intégrations Twitch affichent les embeds officiels sans masquer l'interface Twitch ni fusionner les chats, conformément aux directives Twitch de simulcasting et d'embed. Un contrat Twitch exclusif éventuel reste prioritaire. Aucun message automatique n'est envoyé aux viewers Twitch.

**Valeur livrée par ce pilote** : lorsqu'un créateur choisit de l'activer, son programme SWAPP peut réserver automatiquement un Spotlight gratuit pour un jeu couvert par un article publié sur SWAPP, avec une correspondance **exacte** de la catégorie officielle Twitch. L'intégration exige que le même créateur ait lié son compte Twitch et indiqué lui-même son jeu et ses dates. La réservation reste soumise à des plafonds et à la vérification en direct au moment du passage. Un créneau réservé n'est pas une impression, un clic ni une audience garantie.

## Fonctionnement du code

- `modules/swapp-creator-autopilot.js` : consentement lié à l'identifiant du compte Twitch associé, vérification de la session SWAPP propriétaire, validation same-origin et JSON, opt-out permanent. Aucune programmation sans accord.
- `GET /api/creator/autopilot` : statut privé, agenda exploitable, réservations existantes, dernier contrôle technique, actions automatiques enregistrées et éventuelles **propositions dans les résultats API**. Aucun identifiant de visiteur.
- `POST /api/creator/autopilot` : `{"enabled":true|false}`, en-tête `X-SWAPP-CREATOR-ACTION: autopilot`. Une liaison Twitch vérifiée est nécessaire pour activer ; elle ne l'est jamais pour désactiver.
- `assets/swapp-creator-autopilot.js/.css` : contrôle dans le dashboard Creator, état réel, explications et historique.
- Déclencheur local Node : toutes les 15 minutes seulement si `SWAPP_CREATOR_AUTOPILOT_ENABLED=1`. Maximum **quatre créateurs opt-in par passage**, sélection circulaire et six propositions par créateur. Aucun service planificateur externe.
- Source : `swapp_channel_programme` de l'utilisateur. Séries hebdomadaires et fuseaux horaires via la fonction `expand` existante. Fenêtre des 14 prochains jours ; début Spotlight arrondi au prochain créneau de 30 minutes, obligatoirement entier dans le programme et au moins une heure à l'avance.
- Article publié obligatoire (fonction `spotlightPublishedGame`), correspondance Twitch stricte via Helix `GET /games?name=...` (aucun résultat fuzzy accepté), réservation via `spotlightStore.reserve`. Trois réservations futures maximum, indices MySQL uniques contre conflits/doublons.
- Traces MySQL additives dans `swapp_creator_autopilot_actions` **après réussite** ; la table est créée `CREATE TABLE IF NOT EXISTS`. Une défaillance du journal ne prétend pas qu'un spectateur a vu le live. Une nouvelle liaison Twitch exige un nouvel accord du créateur.
- Le retrait du consentement arrête les **nouvelles** réservations. Il ne supprime pas silencieusement les réservations déjà prises : le créateur peut les gérer dans Spotlight.

## Mesurer la valeur, pas inventer des statistiques

Deux types de preuves, strictement séparés :

1. **Réservations automatiques** : nombre de Spotlight réellement créés et vérifiables dans MySQL.
2. **Propositions de découverte** : somme facultative des apparitions de cartes dans les réponses API, tirée de `swapp_fair_opportunities_daily` si cette mesure est déjà activée. Ce n'est ni une vue à l'écran, ni un spectateur, ni un clic, ni un visiteur unique. Ces données ne doivent pas être utilisées pour annoncer une conversion.

**À construire ensuite pour une preuve d'acquisition** : clics réels vers la chaîne, nouveaux suivis SWAPP confirmés, retours des visiteurs à J+7 agrégés avec garanties anti-abus et règles de confidentialité ; séparer l'exposition API des impressions visibles. Les statistiques Twitch brutes et la présence dans l'annuaire ne prouvent pas l'effet causal de SWAPP.

## Déploiement prudent sur Hostinger

La branche `feat/creator-autopilot-20261104` n'est **pas** une mise en production. Les deux workflows GitHub Actions du dépôt ont seulement `workflow_dispatch`, et aucun job facturable n'a été lancé pour ce pilote.

1. Sauvegarder les données et vérifier `SWAPP_ACCOUNT_STORE=mysql`, `SWAPP_MYSQL_URL`, `SWAPP_NEWS_BACKEND=mysql` (ou le choix auto existant), `/api/actus/storage-status`, `TWITCH_CLIENT_ID` et `TWITCH_CLIENT_SECRET`. Ne jamais introduire Firestore.
2. Vérifier avec deux comptes distincts la liaison Twitch, les créneaux créés dans l'agenda et `/api/creator/spotlight/status`. **Correction incluse dans la branche** : son statut ne dépend plus de `firestoreOk` lorsque les news MySQL sont disponibles.
3. Mettre d'abord `SWAPP_SPOTLIGHT_ENABLED=1` uniquement après validation autonome du produit Spotlight et du compte MySQL. Conserver `SWAPP_CREATOR_AUTOPILOT_ENABLED=0`.
4. Tests : `node --test test/swapp-creator-autopilot.test.js`, `node --check server.js`, `npm run check`, `npm test`. Essais utilisateur sur PC et téléphone. Ne pas déclencher GitHub Actions.
5. Après fusion et déploiement vérifié sur Hostinger, lancer un pilote volontaire de 2 à 5 créateurs avec `SWAPP_CREATOR_AUTOPILOT_ENABLED=1`, contrôler la présence réelle des réservations sur les fiches de jeux, vérifier que la catégorie Twitch en direct correspond, puis couper l'option en cas d'anomalie sans toucher aux données passées.

## Prochaines phases différenciantes

- **Autopilot v2 — Growth Ledger** : rapport privé et vérifiable de clics et suivis **obtenus sur SWAPP**, sans chiffres inventés.
- **Autopilot v3 — SWAPP TV** : offrir des passages équitables aux créateurs volontaires, dans la file et sans achat d'audience. Pas d'activation avant que la régie et le lecteur soient stables.
- **Autopilot v4 — communauté durable** : le spectateur suit des jeux, des séries et des créateurs SWAPP avec des notifications qu'il choisit ; export de ses données ; outils créateur qui réduisent le travail répétitif.
- **Autopilot v5 — valeur économique** : abonnements créateurs après validation des paiements, droit, TVA, remboursements et conditions contractuelles. Ne pas prétendre pouvoir remplacer les revenus Twitch/YouTube avant des données solides.

## Go/no-go produit

**Ne pas promettre « quitte Twitch » au lancement.** Inviter les créateurs à conserver leurs chaînes existantes et à tester SWAPP sur deux semaines. Démontrer : plus de découvertes **vérifiées**, moins d'opérations manuelles, un parcours plus direct jeu → créateur et des retours reproductibles. Écarter les engagements de spectateurs garantis et toutes les pratiques contraires aux conditions Twitch/YouTube.
