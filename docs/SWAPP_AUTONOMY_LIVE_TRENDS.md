# SWAPP Autonomy — moteur de tendances Live (20 novembre 2026)

## Ce qui est construit

Un collecteur **autonome**, démarré par le processus Node de production, récupère un échantillon réel de la catégorie francophone Twitch Helix : `streams?first=100&language=fr`, puis historise uniquement des statistiques agrégées de jeux dans **MySQL Hostinger**.

Il fonctionne même sans visiteur. Une fréquence de sondage Node de 60 secondes **n'entraîne pas** une requête Twitch toutes les 60 secondes : chaque créneau de 5 minutes UTC est **réservé en base avant l'appel externe**, avec une seule requête au maximum pour l'ensemble des instances partageant la même table.

Le module crée au premier lancement autorisé **une seule nouvelle table InnoDB** `swapp_live_trend_samples` via `CREATE TABLE IF NOT EXISTS`. Il n'altère aucune table existante. Les enregistrements sont idempotents via `bucket` (clé primaire), avec états `collecting`, `ready` ou `failed`. Les échecs ne deviennent jamais des tendances artificielles.

### Activation et interrupteur

Activation automatique à la prochaine livraison du `master` vers Hostinger **si** les trois prérequis sont vrais :
- `NODE_ENV=production` ;
- URI MySQL du magazine disponible ;
- `TWITCH_CLIENT_ID` et `TWITCH_CLIENT_SECRET` configurés.

**Arrêt immédiat au prochain démarrage :** configurer `SWAPP_LIVE_TRENDS_ENABLED=0` dans l'environnement Hostinger puis redémarrer Node. Par défaut le moteur est activé si les trois prérequis sont présents. Il n'existe aucune tâche GitHub Actions, aucun VPS, aucun service IA payant, aucune publication éditoriale et aucune action financière dans ce lot.

### Charges et résilience

- **Twitch :** au plus 1 appel `streams?first=100&language=fr` par créneau de cinq minutes, soit au maximum 288 appels par jour, **pour tous les processus partageant la base**.
- **MySQL :** pool supplémentaire limité à 1 connexion par processus, 4 requêtes en attente maximum. Une réservation, une mise à jour JSON par cycle effectif ; les vérifications sans victoire de réservation ne touchent pas Twitch.
- **Conservation :** maximum sept jours glissants de données nominales, purge par petits lots `LIMIT 500`, environ une fois par jour.
- **Échecs :** pas de fausse valeur zéro, aucune donnée sensible dans les logs ; arrêt temporaire d'une heure après trois échecs consécutifs sur une instance. Si une collecte échoue, un autre processus ne la relance pas dans le même créneau. Cette restriction est volontaire.
- **Délai API :** tentative de collecte bornée à douze secondes du point de vue du worker. Le timeout logiciel n'annule pas nécessairement une requête Twitch déjà engagée ; la limite **un créneau, un appel** continue de s'appliquer.

## Endpoint public en lecture seule

`GET https://swapp.tv/api/swapp/autonomy/live-trends`

Réponses possibles :
- `state: "warming"` : aucune ou une seule observation saine ; **aucune tendance comparée**.
- `state: "ready"` : au moins deux observations successives exploitables (séparées de 5 à 15 minutes).
- `state: "stale"` : dernière observation ancienne (plus de 15 minutes).
- `state: "unavailable"` : erreur lecture ou schéma.
- `state: "disabled"`, HTTP 503 : prérequis absents ou interrupteur désactivé.

Les consultations de ce GET sont **strictement en lecture seule après initialisation** ; la réponse est mise en cache 60 secondes par instance. Pas de requête Twitch lors d'une visite de cet endpoint.

Le tableau `games` contient les 15 jeux les plus représentés **dans le premier lot francophone de 100 directs Twitch échantillonnés**, et non un classement global de l'ensemble des jeux. Pour les jeux présents dans les deux observations, `deltaStreams`, `deltaObservedViewers` et `deltaSmallStreams` comparent les valeurs de l'échantillon ; il ne faut **pas** les interpréter comme des variations de parts de marché. Ni les identifiants Twitch ni les profils des spectateurs ne sont enregistrés.

## Vérification

1. Après livraison de la nouvelle version sur Hostinger, ouvrir `/api/swapp/autonomy/live-trends` dans un navigateur autorisé.
2. Vérifier `enabled:true` puis obtenir `warming` avec une première observation agrégée ; après au moins deux créneaux de cinq minutes, vérifier `ready`, `comparable:true` et deux dates distinctes. Cela peut nécessiter plus de dix minutes.
3. En l'absence d'échantillon, contrôler les droits MySQL `CREATE TABLE, INSERT, UPDATE, SELECT, DELETE`, les quotas Twitch et le journal `[SWAPP LIVE TRENDS]`. Ne pas contourner le WAF (qui répond 403 aux sondes externes).
4. Exécuter `npm run test:autonomy`, `npm run check`, `npm test`, puis `npm run verify:production` depuis un environnement qui dispose d'un clone complet.
5. Contrôler sur plusieurs heures que les lignes sont espacées de cinq minutes et qu'aucune instance ne duplique les collectes.

Huit tests unitaires ciblés ont réussi dans Node.js 22.16.0 local, avec la même empreinte Git que les fichiers déposés dans la branche. **Un test d'intégration sur MySQL Hostinger réel, le déploiement et la validation de plusieurs échantillons demeurent nécessaires** avant d'annoncer l'exploitation pleinement confirmée.

**Pas de modification** d'OBS, HLS, prix, paiements ou remboursements. Les moteurs Magazine, Social, Boutique et commerce restent des étapes indépendantes.
