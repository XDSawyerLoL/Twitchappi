# SWAPP Social Publisher — conception v0.1 (10 novembre 2026)

## Objectif
Relayer une seule fois sur X @swappstreaming les **nouveaux** articles SWAPP réellement publiés, sans Metricool, VPS, GitHub Actions facturables ni prestataire payant. **Ce document n'implémente pas un accès gratuit à X.** Aucun accès automatique à X n'est activé tant qu'un canal autorisé, conforme et économiquement acceptable n'est pas vérifié.

## Architecture native Hostinger
- Source de vérité : articles éditoriaux adoptés par le stockage MySQL Hostinger réellement sélectionné par SWAPP, jamais le simple commit GitHub.
- Déclenchement : événement après confirmation de publication ou balayage périodique via le processus Node déjà en place, sans nouveau cron payant. Ne pas utiliser la simple lecture publique comme événement de publication.
- File persistante MySQL : table dédiée avec `article_id`, `article_slug`, `article_revision`, `network`, `status`, `attempt_count`, `next_attempt_at`, `remote_post_id`, `last_error`, `created_at`, `published_at`. Index unique sur (`article_id`, `network`, `event_type`) pour `event_type = initial_publication`.
- Préconditions : article visible publiquement, non brouillon/non dépublié, URL canonique HTTPS renvoyant 200, titre et résumé présents ; média uniquement si droits et URL contrôlés.
- Préparation : texte français court, titre fidèle, lien canonique, tags pertinents facultatifs, pas d'affirmations inventées. Prévisualisation dans Studio.
- Exécution : adaptateur réseau indépendant ; mode `disabled` par défaut, mode `manual` export/copie du texte et lien, mode `official` seulement si l'API X est autorisée et le coût accepté. Aucun scraping de cookies, contournement de CAPTCHA, stockage de mot de passe X ou navigateur automatisé non autorisé.
- Envoi : clé d'idempotence stable ; verrou transactionnel de ligne ; marquer `sending` puis `sent` avec identifiant distant. Après timeout ambigu, suspendre et réconcilier manuellement plutôt que republier aveuglément.
- Échecs : retry borné et backoff pour erreurs transitoires, `blocked` pour authentification/droits/coût, journal sans secrets. Correction d'article ne relance jamais le post initial.
- Sécurité : accès administration via `requireEditor`, secret uniquement en variables Hostinger, pas d'API d'écriture publique, aucun changement HLS/OBS/paiements.
- Contrôle : tests de doublon, dépublication, réponse 403/429, erreur réseau, redémarrage Node, plusieurs instances, absence de médias ; contrôle du post distant avant statut `sent`.

## Dépendance externe incompressible
La publication automatique sur X nécessite une méthode d'écriture acceptée par X. Développer un module maison ne supprime ni les règles d'accès ni une éventuelle facturation. Tant qu'aucune voie autorisée et gratuite n'est confirmée, le produit doit offrir un mode manuel prêt à publier et **ne jamais annoncer l'autopublication comme active**.

## Livraison progressive
1. Inspecter les modules news, la configuration MySQL et les éventuelles fonctions d'annonce Discord avant de coder, afin de réutiliser les événements et le stockage.
2. Implémenter migration MySQL additive, queue, génération de messages et écran Studio (prévisualiser, copier, rejouer sous contrôle).
3. Tester hors production sans appeler X ; mesurer l'idempotence et les erreurs.
4. Activer l'adaptateur X seulement après validation des conditions d'accès et test de bout en bout sur @swappstreaming.
5. Vérifier l'article public et le post X réel avant d'annoncer le service en ligne.

Statut : **conception seulement**, aucune publication automatique activée.
