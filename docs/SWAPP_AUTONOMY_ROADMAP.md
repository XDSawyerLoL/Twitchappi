# SWAPP Autonomy — phase 1 : surveillance sans mutation

Ce chantier initialise le socle technique de supervision des neuf moteurs envisagés. **Il ne signifie pas que SWAPP est autonome** et ne modifie ni les routes, ni MySQL, ni HLS/OBS, ni les paiements.

## Exécution
- `node tools/swapp-autonomy-healthcheck.js` : requêtes GET séquentielles vers cinq routes publiques de production ; timeout individuel 4,5 s ; sortie JSON et code de sortie 0 si tout répond HTTP 200, 1 si au moins une route échoue, 2 si configuration invalide.
- `node --test test/swapp-autonomy-healthcheck.test.js` : tests déterministes sans réseau.
- Aucune tâche cron, aucun worker résident, aucun accès aux identifiants, aucune écriture de production. Lancer à la demande pour commencer.
- HTTP 403/429 = accès restreint (peut provenir du pare-feu) ; 404 = route absente ; 5xx = indisponible ; aucune de ces situations ne prouve une absence de contenus.
- Ce script ne restaure pas les services, n'efface pas les caches, ne redémarre rien. Ne jamais déclencher de relance sans contrôle anti-boucle et mesure de l'état réel.

## Feuille de route conditionnelle
1. Mesurer les endpoints existants et documenter les faux positifs (pare-feu, bots, CAPTCHA). Ne pas contourner les protections.
2. Définir le contrat MySQL pour chaque moteur (identifiant idempotent, origine, date, TTL, état, journal et propriétaire).
3. Agrégation Live via quotas et API autorisées ; cache vérifié et filtrage des chaînes AFK **estimatif**.
4. Pipeline éditorial existant : validation des sources, des droits médias, des doublons et adoption MySQL. Pas de publication automatique avant preuve d'adoption et rendu public.
5. Social, podcast et boutique : sorties vérifiées, droits et règles commerciales, limites de coût.
6. SAV : réponses automatiques sur FAQ vérifiées, escalade humaine pour litiges et remboursements.
7. Watchdog : déclenchement planifié seulement après mesures de charge, limites et validation des permissions Hostinger.

## Critères de recette
Chaque module doit prouver une exécution idempotente, une panne simulée récupérable, l'absence de secrets dans les logs, une mesure de consommation, des journaux consultables et un contrôle de production. **100 % d'autonomie ne peut être garanti** ; le bon objectif est une exploitation sans intervention ordinaire, avec escalade des exceptions.
