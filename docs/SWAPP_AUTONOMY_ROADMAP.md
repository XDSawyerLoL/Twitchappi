# SWAPP AUTONOMY — Phase 1, contrôle sûr (19 novembre 2026)

## Constat important

Les routes GET /api/actus et /api/actus/release-status invoquent ensureReleaseEditable() dans modules/swapp-news/router.js, ce qui peut **écrire en MySQL** pour adopter des lots éditoriaux. Elles sont donc exclues explicitement du watchdog, même si elles utilisent HTTP GET. La route /api/actus/storage-status interroge la base ; elle reste hors de la surveillance légère.

Le watchdog a été limité à deux routes sans effet de bord vérifiées dans server.js :
- /api/release : exige service=swapp, complete=true, fingerprint SHA-256 au format valide ;
- /api/swapp/storage-runtime : exige MySQL prêt pour comptes/news et anciens runtime Firestore/cron désactivés.

Un succès n'atteste **pas** que toute la plateforme fonctionne, ni que chaque requête SQL réussit. Le contrôle de fingerprint ne compare pas le code à une copie locale ; utiliser npm run verify:production pour cela.

## Mode opératoire

- node --check tools/swapp-autonomy-healthcheck.js
- node --test test/swapp-autonomy-healthcheck.test.js
- node tools/swapp-autonomy-healthcheck.js

Deux GET séquentiels, timeout 4,5 s par route, corps JSON plafonné à 16 Kio, sans journalisation du contenu ni de secrets. Les HTTP 200 HTML (CAPTCHA), JSON invalides, statuts métier incohérents, redirections et 403/429 ne sont pas considérés comme sains. Les 403/429 indiquent un accès restreint, **pas** une panne prouvée. Seuls swapp.tv / www.swapp.tv en HTTPS et localhost en HTTP sont autorisés. Aucun cron, redémarrage, purge, écriture MySQL ni déploiement automatique n'est initié.

**Tests :** six scénarios ciblés exécutés avec succès dans une copie isolée sous Node.js 22.16.0 le 19/11/2026. Il reste à exécuter ces tests et la suite complète dans un checkout du dépôt, puis à contrôler les résultats en production.

## Les neuf moteurs et leur critère de recette

| Moteur | Livrable | Garde-fou |
|---|---|---|
| 1. Watchdog | État d'exploitation horodaté, alerte utile | Pas de mutateur caché ni redémarrage en boucle |
| 2. Live & Surprends-moi | Classements datés issus des APIs autorisées | Quotas, cache, absence d'invention de viewers |
| 3. Magazine & Guides | Articles originaux avec sources et médias vérifiés | Anti-doublons, validation qualité, adoption MySQL prouvée |
| 4. Social & Podcast | Résumés, mises en avant, audio réel | Consentement, licences, coût TTS mesuré |
| 5. Boutique | Ordre de vitrines par pertinence observée | Aucun changement autonome des prix |
| 6. Veille commerciale | Décisions d'opportunité datées | Mesurer conversion réelle et coût, pas prédire des ventes comme faits |
| 7. Production & Packaging | Produit exploitable avec contrôles de fichier | Vérification licences, hashes et livraison |
| 8. Publication & SEO | Offres consultables avec historiques de révision | Prix et mentions légales sous contrôle |
| 9. Pilotage & SAV | Détection de problèmes et FAQ simples | Litiges, remboursements et paiements escaladés |

## Architecture d'exploitation souhaitée

- MySQL Hostinger comme base de données persistante unique ; pas de SQLite parallèle, VPS, GitHub Actions facturables ni API IA payante.
- Futur registre MySQL d'exécution : moteur, run_id, dedup_key sous contrainte UNIQUE, provenance, date, état, durée, tentatives, consommation, date limite du cache, erreur expurgée.
- Orchestration conditionnelle avec limite de concurrence, backoff, respect de Retry-After, circuit breaker, expiration du cache clairement affichée.
- La publication ne doit jamais ressusciter un article retiré, contourner l'éditeur ou accepter un contenu sans droits médias. Contrôler pages publiques, état CMS et déploiement.
- Ne pas faire fonctionner neuf workers permanents sur l'hébergement mutualisé ; commencer par des opérations courtes, contrôlées et mesurées.
- Les processus à conséquences financières, contractuelles ou impliquant des données sensibles restent soumis à autorisation et contrôle humain.

## Avant fusion et activation

1. Réexécuter les tests dans le vrai dépôt, exécuter les tests existants concernés, examiner les changements et confirmer la compatibilité Node/Hostinger.
2. Vérifier les deux routes réelles sans contourner les restrictions WAF.
3. Vérifier l'empreinte du checkout et des ressources de production après déploiement ; un commit n'est pas une preuve.
4. Mesurer la charge avant toute planification à la minute.
5. Pour chaque moteur, établir : tests, source réelle, idempotence SQL entre instances, limites de ressources, récupération après panne, qualité et preuve de résultat.

**Statut :** cette PR apporte seulement un watchdog sûr et sa documentation. SWAPP ne doit pas être déclaré autonome tant que les neuf moteurs n'ont pas chacun passé leur recette réelle. Une autonomie absolue sans intervention humaine exceptionnelle n'est pas une garantie réaliste.

## Planificateur déterministe (sans exécution)

Le nouveau module modules/swapp-autonomy/planner.js définit les neuf moteurs, leurs intervalles indicatifs, leurs prérequis et un ordre de priorité. Aucun moteur n'est activé par défaut. planRuns() est une fonction pure : elle propose au maximum une tâche par défaut (plafond technique trois), classe les tâches non éligibles comme disabled, unready, cooldown ou capacity, et émet une clé de déduplication liée à une tranche horaire. Le planificateur **ne lance aucune tâche et n'écrit aucune donnée** : les clés proposées ne garantissent pas l'unicité entre processus sans contrainte MySQL.

Les intervalles sont des objectifs théoriques, **pas des crons activés**. Le lancement effectif nécessitera un verrou idempotent MySQL, le contrôle des API externes et la preuve des permissions. Les moteurs publication commerciale et packaging exigent des validations explicites. Les tarifs, paiements et remboursements ne sont pas modifiables automatiquement par ce planificateur.

Contrôle ciblé : node --test test/swapp-autonomy-healthcheck.test.js test/swapp-autonomy-planner.test.js. Treize tests initiaux passent en copie isolée Node.js 22.16.0 au 19/11/2026 ; exécution de la suite complète et vérification de production toujours requises.

## 19 novembre 2026 — Registre de verrouillage MySQL non activé

Le fichier modules/swapp-autonomy/run-ledger.js prépare un verrou entre instances : réservation, renouvellement et clôture avec jeton de propriété. Les requêtes sont paramétrées via l'interface mysql2/promise déjà utilisée par SWAPP. Une contrainte UNIQUE (engine_id, dedup_key) empêche deux réservations du même créneau. Le jeton empêche un ancien exécutant de renouveler ou de clôturer le bail d'un successeur. En cas de base absente, aucune exécution de secours.

Le schéma InnoDB proposé est dans docs/sql/SWAPP_AUTONOMY_RUNS_V1.sql : **aucune migration n'a été appliquée à Hostinger**, et aucun moteur ni cron n'est activé. Le registre ne sera intégré qu'après examen de la migration, sauvegarde, test d'intégration avec MySQL réel, mesures de charge et confirmation de l'environnement d'exécution.

**Tests exécutés : 20/20 réussis**, avec Node.js 22.16.0 sur une copie locale isolée des modules, dont six scénarios utilisant un simulateur db.execute pour les états de bail et les erreurs. Ce résultat ne remplace ni le test d'intégration MySQL ni la suite complète du dépôt, qui n'est pas disponible localement (accès GitHub en ligne de commande bloqué par DNS).

**Important :** un bail valide protège le registre, mais n'empêche pas à lui seul un vieux worker d'effectuer une action externe après expiration. Chaque futur moteur devra vérifier la propriété avant les mutations et imposer une idempotence métier réelle. La PR doit rester en brouillon jusqu'à des contrôles CI et déploiement satisfaisants.

## Correctif d'équité du planificateur

Un premier scénario a révélé qu'un moteur Watchdog disponible chaque minute pouvait occuper systématiquement la seule place d'exécution et empêcher Live et Magazine de démarrer. Le planificateur trie maintenant les moteurs éligibles selon le retard relatif depuis leur dernière tentative, en donnant la priorité aux moteurs jamais exécutés. Le scénario de 12 passages avec `maxJobs=1` vérifie que les trois moteurs finissent par être sélectionnés. **Ce mécanisme exige qu'un futur exécuteur persiste `lastAttemptMs` après chaque tentative.** Aucun worker réel n'est actif.

La suite ciblée complète des modules préparés compte 20 tests, tous réussis en environnement isolé Node.js 22.16.0. L'absence de tests MySQL réel, du checkout complet et le CI du dépôt restent des conditions bloquantes avant fusion/déploiement.
