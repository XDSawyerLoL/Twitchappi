# SWAPP — Suivis, alertes live et abonnements créateurs

Date : 25 octobre 2026 · Document de conception technique (non activé en production).

## Règle produit

Dans l'en-tête d'une chaîne, après le nom et sans panneau supplémentaire :
- **Suivre** : gratuit ; crée/supprime un suivi lié au compte SWAPP.
- **Cloche** : activable et désactivable à tout moment, indépendamment du suivi payant. État conservé en MySQL. L'utilisateur doit être connecté et consentir explicitement aux notifications navigateur si ce canal est proposé.
- **S'abonner** : soutien mensuel payant, sans bloquer le lecteur public. Afficher montant TTC, fréquence, avantages, conditions et annulation avant tout paiement. Aucune somme ne doit être facturée tant que l'offre, les CGV et le système de paiement ne sont pas finalisés.

Ne pas afficher de bouton qui indique une souscription active alors que le backend n'a pas confirmé un paiement. Ne pas appeler une préférence localStorage « notification live » lorsqu'elle ne peut pas envoyer d'alerte navigateur une fois le site fermé.

## Notifications gratuites : événements réels, sans fausse alerte

1. Auth SWAPP unique, pas de second compte Social/Live.
2. Table MySQL `creator_follows` (si non déjà disponible) : clef unique (follower_id, creator_id).
3. Table `creator_notification_preferences` : unique (viewer_id, creator_id), live_enabled, updated_at ; consentement explicite par défaut à false.
4. Table `web_push_subscriptions` : viewer_id, endpoint chiffré/strictement limité, clés p256dh/auth, expiration, created_at ; suppression et renouvellement accessibles.
5. Utiliser un service worker HTTPS avec Push API + VAPID, et un worker Node **Hostinger existant**, sans VPS et sans prestataire de notifications payant. Pour les navigateurs sans Push API, afficher l'indisponibilité plutôt que simuler une notification.
6. Déclencher sur transition vérifiée « hors ligne → live public », pas sur simple connexion du streamer. Pour un flux HLS, exiger une publication manifeste+segment visible au public. Dédupliquer par identifiant de session de diffusion et créateur.
7. Envoyer uniquement aux viewers ayant activé la cloche, gérer 401/404/410 et expirations, limiter la fréquence (pas de notification répétée pour le même direct). Les préférences doivent être prises en compte immédiatement.
8. Tests obligatoires : plusieurs appareils, navigateur fermé, iOS compatible, Android, Firefox/Edge/Chrome, reprise après coupure HLS, absence de double envoi, désactivation, hors connexion, permission refusée.

L'onglet SWAPP n'a pas besoin de rester ouvert lorsque le navigateur prend en charge les notifications Push ; une notification de page active seule ne satisfait **pas** cet objectif.

## Abonnement créateur payant : flux transactionnel vérifiable

**Choix à valider avant activation** : montant mensuel TTC, pourcentage SWAPP, conditions d'éligibilité des créateurs, avantages et modalités de remboursement / rétractation.

- Prévoir un palier mensuel simple au lancement plutôt que plusieurs offres confuses.
- Utiliser un prestataire de paiement compatible avec les places de marché et les versements aux créateurs (p. ex. Stripe Connect, sous réserve des comptes vérifiés). Pas de collecte de carte par SWAPP. Les frais de transaction du prestataire subsistent même sans VPS.
- Stocker un abonnement par (viewer, creator, prestataire_subscription_id), état confirmé par **webhook signé et idempotent**, jamais par le retour de la page de paiement.
- États : `incomplete`, `active`, `past_due`, `cancel_at_period_end`, `canceled`, `refunded`. Ne pas octroyer de badge sans état actif confirmé.
- Prévoir paiement récurrent, résiliation libre accessible depuis la chaîne/le compte, reçus, support, remboursement, fraude, litige, échecs de renouvellement, compte créateur non vérifié.
- Les avantages peuvent être : badge, emotes de chaîne, événements et salons réservés. Le live public et le tchat de base restent gratuits.
- Conserver l'historique de facturation et les droits de manière auditable en MySQL ; vérifier les règles de TVA/CGV/RGPD avant lancement, sans données de carte en base.

## Livraison recommandée

**Phase 1** : suivre + cloche persistante + service worker Push + événement live vérifié (tests navigateur fermé).

**Phase 2** : prestataire marketplace, compte créateur, prix et pourcentage, Checkout, webhooks, portail de résiliation (tests sandbox).

**Phase 3** : badges/emotes et privilèges activés **uniquement** si la souscription est payée.

Aucune activation monétaire ni fausse promesse de Push avant les validations ci-dessus.
