# SWAPP — Fair Discovery v2 : pilote de mesure volontaire

**Objectif :** mesurer les cartes de lives réellement visibles sur les dossiers de jeux et le clic vers leurs créateurs, sans identifier les visiteurs. Le mécanisme de recommandation Fair Discovery v1 continue de fonctionner indépendamment de cette mesure.

## Périmètre précis

- Pages éditoriales comportant `[data-swapp-live-shelf]` et une recherche de lives vérifiée par `/api/discovery/game-lives`.
- Un visiteur doit cliquer **« Contribuer à une découverte équitable (facultatif) »**. Aucun envoi de métrique avant cette action. Le consentement est limité à la page ouverte et réversible. Il n'est écrit dans aucun cookie, stockage local ou profil.
- **Impression visible** : au moins 50 % de la carte dans la fenêtre pendant 1,25 s, avec page active. Chaque carte ne compte qu'une fois par page et par type d'action.
- **Clic** : activation du lien d'un créateur proposé, après opt-in.
- Chaque carte reçoit une preuve HMAC serveur ne contenant que placement, chaîne publique, jeu, catégorie d'audience et fenêtre de 15 minutes. Le serveur accepte la fenêtre courante et les deux précédentes, puis invalide la preuve.
- Événements autorisés : uniquement `impression` et `click`.
- Pas de mesure d'audience globale ou de visiteur unique. Les résultats sont un **échantillon de volontaires** : ils ne peuvent pas prouver la parité de l'ensemble des recommandations.

## Données MySQL sur Hostinger

Migration additive `migrations/mysql/010_swapp_fair_exposure_daily.sql`.

**Table :** `swapp_fair_exposure_daily`, une ligne quotidienne par placement/plateforme/créateur public/jeu/catégorie d'audience. Compteurs d'impressions et clics seulement. **Aucune adresse IP, identité du spectateur, appareil, cookie, session, URL consultée ou historique nominatif dans cette table.**

Conservation bornée à 14 jours : purge opportuniste, exécutée après un signal accepté au maximum une fois par jour si le service est actif. Si aucun signal n'arrive, les anciennes lignes ne sont supprimées qu'à la reprise des envois. Pour une rétention juridiquement stricte de 14 jours, prévoir une purge régulière maîtrisée via l'hébergement, pas un workflow GitHub Actions.

La requête `GET /api/discovery/fair-summary` publie uniquement un agrégat **sur sept jours** et la part d'impressions des créateurs ayant au plus 25 spectateurs à l'instant de la recommandation. Aucun créateur n'est nommé. Si moins de 50 impressions ou moins de 5 créateurs distincts (même lorsqu'ils changent de catégorie d'audience) ont participé, l'API répond `sample: insufficient` sans exposer les compteurs des petits groupes.

## Activation et fonctionnement

**Par défaut désactivé.** Laisser `SWAPP_FAIR_METRICS_ENABLED=0` tant que la production et MySQL ne sont pas vérifiés.

Activer uniquement quand les éléments suivants sont déjà fonctionnels :
- `SWAPP_SOCIAL_FEATURES=1` et l'URL `SWAPP_MYSQL_URL` ou `DATABASE_URL` pointent sur la base MySQL Hostinger existante ;
- `SESSION_SECRET` stable et long (32 caractères minimum) — ne jamais afficher sa valeur ni le placer dans Git ;
- sauvegarde MySQL existante et droit CREATE TABLE pour une migration additive ;
- application Node correctement déployée, pages de jeux et SOCiAL testés.

Mettre `SWAPP_FAIR_METRICS_ENABLED=1` dans l'environnement sécurisé Hostinger, pas dans GitHub. La première requête de métriques après activation (consultation du résumé ou événement volontaire) exécute la migration idempotente `CREATE TABLE IF NOT EXISTS` puis écrit le compteur. Aucun nouveau pool de connexions n'est créé. En cas de défaillance, le site et les lives restent utilisables ; la mesure renvoie 503.

Vérifier :
1. `GET /api/discovery/fair-summary` renvoie `enabled:false` en mode désactivé.
2. Après activation, une fiche de jeu affiche le bouton explicite sous les vrais lives.
3. Vérifier qu'aucune requête `/api/discovery/fair-event` n'est envoyée avant de cliquer sur le bouton.
4. Cliquer le bouton, laisser une carte visible pendant 1,25 s, puis ouvrir un live. Le réseau peut produire une requête `impression` et une requête `click` avec un corps limité à `proof,event`, sans identifiant visiteur.
5. Désactiver le bouton puis vérifier qu'aucune nouvelle mesure n'est envoyée.
6. Tester les erreurs de DB, le secret manquant, les preuves invalides/expirées, la protection Origin et les limites de 12 requêtes/minute/IP en mémoire. Ne pas partager ni publier les logs bruts.
7. Contrôler `/api/release`, `npm run check`, `npm test` et `npm run verify:production` depuis la même version Node sur Hostinger.

## Limites anti-fraude et décisions à prendre

La preuve signée empêche d'inventer directement une chaîne ou un jeu. Elle est toutefois réutilisable pendant sa fenêtre de validité : le bridage en mémoire réduit les envois abusifs mais **ne protège pas contre un acteur disposant de multiples adresses IP ou de multiples instances serveur**. Ne pas utiliser ces chiffres comme base automatique de rétribution ou de modification agressive du classement.

La v2 mesure d'abord les fiches de jeux. L'accueil et Découvrir seront instrumentés ensuite, **sans activer de collecte passive**, lorsque leurs cartes pourront transporter des preuves signées équivalentes. Tant que le pilote repose sur le volontariat, publier des ratios comme « part du trafic mesuré avec opt-in », jamais « équité globale garantie ».

Sans accès Hostinger autorisé, un commit GitHub ne prouve ni que la migration est appliquée ni que la mesure collecte réellement.
