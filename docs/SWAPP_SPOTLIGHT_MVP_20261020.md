# SWAPP Creator Spotlight — livraison MVP

Ce lot ajoute une réservation **réelle**, persistée dans la base MySQL Hostinger, entre un compte SWAPP lié à Twitch et un jeu couvert par un article SWAPP publié.

## Parcours fonctionnel

1. Le joueur possède un **compte SWAPP** (une seule identité).
2. Dans son tableau de bord, il lie sa chaîne Twitch. Une même chaîne ne peut être revendiquée par deux comptes.
3. Il accède à **SWAPP CREATOR / SPOTLIGHT** depuis `/dashboard` et renseigne un jeu dont SWAPP a déjà publié un article, puis un créneau.
4. Le backend exige une catégorie **Twitch exacte** pour ce jeu, vérifie que la rédaction couvre réellement ce titre, puis réserve un créneau unique en MySQL.
5. Les articles natifs et les fiches `/jeux/:slug` affichent l'agenda du jeu. Un streamer n'est marqué *EN DIRECT* que pendant son créneau si Twitch confirme simultanément son identifiant de chaîne **et** le bon `game_id`.
6. Après confirmation, un lecteur intégré Twitch peut être affiché avec le domaine SWAPP en `parent`. Hors ligne, mauvais jeu ou API indisponible : **aucune fausse diffusion**.
7. Le créateur peut déplacer ou annuler ses réservations depuis son tableau de bord. La libération du créneau est persistée en MySQL.

## Limites intentionnelles du MVP

- Créneaux de **30 minutes**, début à :00 ou :30 (en UTC côté API ; saisie en heure locale du visiteur).
- Réservation au moins **1 heure à l'avance**, au maximum **45 jours**.
- **3 créneaux actifs futurs** maximum par compte Creator (quota en SQL, plus contrainte unique par créneau et par créateur).
- **Un seul créateur par jeu/créneau**, choisi au premier arrivé dans cette version. Ce n'est **pas** encore l'algorithme final de découverte équitable.
- Au premier MVP : pas de paiement, pas de réservation garantie si l'article n'est pas publié, pas de monétisation sponsorisée, pas de commission, pas de gamification.
- Les lives sont **hébergés par Twitch**, pas par SWAPP. Ce module n'ajoute pas d'ingest, de serveur vidéo ni de VPS.
- Vérification Twitch à la consultation de l'agenda, avec cache serveur ~45 s. **Cela ne constitue pas une mesure fiable des moyennes d'audience ni un suivi exhaustif des absences**.
- Une absence ou un mauvais jeu empêche la mise en avant, mais ne déclenche pas encore de transfert vers une liste d'attente. **P4 complet, ASCENSION et P5 pilote non livrés**.

## Configuration Hostinger : aucun nouveau VPS

- SWAPP Node.js existant, `SWAPP_ACCOUNT_STORE=mysql`, `SWAPP_MYSQL_URL` valides, base MySQL Hostinger accessible.
- `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_REDIRECT_URI` présents et correctement configurés pour swapp.tv.
- Articles SWAPP publiés accessibles depuis le stockage rédactionnel actuel.
- Nouveau commutateur **désactivé par défaut** : `SWAPP_SPOTLIGHT_ENABLED=0`.
- Après sauvegarde de la base et vérification de la liaison Twitch sur deux comptes de test, définir **`SWAPP_SPOTLIGHT_ENABLED=1`** dans les variables de l'application Node Hostinger puis redémarrer.
- Le premier appel MySQL crée la table additive `swapp_creator_spotlight` si le compte MySQL dispose du droit CREATE. Aucun effacement ou migration destructrice. Sinon appliquer le DDL du module dans phpMyAdmin.
- Contrôle sans authentification : `GET /api/creator/spotlight/status`, qui renvoie la disponibilité des prérequis sans exposer de secrets.
- Tests API : `GET /api/creator/spotlight?game=Fortnite`, `GET /api/creator/spotlight/mine`, `POST /api/creator/spotlight/reservations`, `PATCH/DELETE /api/creator/spotlight/reservations/:id`.
- Pour toutes les écritures, utiliser la session SWAPP et l'en-tête `X-SWAPP-SPOTLIGHT-ACTION: creator`.

## Contrôles avant production

```bash
npm run check
node --test test/swapp-spotlight.test.js test/swapp-creator-twitch-link.test.js test/swapp-oryon-mysql-mode.test.js
npm test
```

Vérifier avec deux créateurs :
- Un streamer non connecté ou sans liaison Twitch reçoit un refus (401/403).
- Une réservation est refusée si le jeu n'a **pas d'article publié**.
- Une réservation est refusée si la catégorie Twitch n'est pas reconnue exactement.
- Deux comptes ne peuvent pas réserver le même créneau pour le même jeu (409).
- Trois réservations futures sont autorisées, la quatrième non.
- Une annulation libère réellement le créneau.
- Une requête d'un autre utilisateur ne peut ni déplacer ni annuler un créneau.
- Actualisation F5 et redémarrage Node ne doivent pas effacer les créneaux.
- Tester un live Twitch réel : avant la date, hors ligne, mauvais jeu et bon jeu (seul ce dernier est « EN DIRECT »).
- Vérifier au minimum les présentations iPhone, Android et desktop et le lecteur Twitch embarqué.
- Contrôler le suivi des ressources et les limites API Twitch ; ne pas multiplier les requêtes.

## Prochaines étapes non couvertes

1. **P4** : liste d'attente, rotation équitable, remplacement vérifié des absences, modération des créneaux et anti-abus renforcé.
2. **ASCENSION** : échantillonnage d'audience fiable pendant plusieurs lives (non conditionné au trafic SWAPP), badges, rangs et bonus de visibilité temporaires, sans mesures inventées.
3. **Creator Network** : Headliner, collaborations, sponsorings explicitement identifiés, contrats et mesure des résultats.
4. **P5** : pilote 5 jeux / 30 streamers / 50 créneaux / 1 événement tête d'affiche, puis bilan réel.

**Important : un commit GitHub ne prouve pas que Hostinger a déployé ni que MySQL fonctionne. Ne pas activer sans essais en production contrôlée.**
