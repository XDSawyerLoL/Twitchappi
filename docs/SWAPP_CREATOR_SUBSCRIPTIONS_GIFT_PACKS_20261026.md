# SWAPP — abonnements créateurs et cadeaux communautaires

État : branche de travail, non déployée. Les paiements sont désactivés par défaut.

## Fonctionnalités
- Abonnement mensuel personnel, renouvellement, annulation à échéance depuis la chaîne.
- Packs de 1 / 5 / 10 / 20 / 50 / 100 abonnements cadeaux + nombre personnalisé entre 1 et 100.
- Prix en euros TTC configurables, remises par volume de 0, 5, 10, 15, 20, 25 %.
- Interface mobile en plein écran avec choix de packs, montant, économie, confirmation et gestion.
- Stripe Checkout sécurisé ; Stripe Connect Express pour le compte vérifié du créateur.
- Table MySQL des droits personnels/cadeaux, achats cadeaux, affectations et événements Stripe idempotents.
- Paiement signé par webhook ; aucun avantage octroyé depuis la page de retour.
- Cadeaux attribués automatiquement aux abonnés gratuits éligibles, sans doublon actif. Un cadeau non attribué reste réclamable pendant 90 jours. Accès reçu : 30 jours.
- Statistiques : abonnements actifs, cadeaux achetés et distribués.
- Lecture et chat gratuits inchangés.

## Activation sur Hostinger

Le lancement payant exige validation des CGV, TVA, droit de rétractation, politique de remboursement, responsabilité des rétrofacturations, KYC créateur et répartition contractuelle des recettes. Il n'y a pas de module fiscal complet ni de remboursement automatique des cadeaux non attribués ; NE PAS activer les paiements réels avant revue.

Dans les variables privées Hostinger (sans jamais publier les secrets) :

- SWAPP_SUBS_ENABLED=1
- SWAPP_SUBS_LEGAL_APPROVED=1 après validation juridique UNIQUEMENT
- SWAPP_SUBS_LIVE_APPROVED=1 après vérification des paiements réels UNIQUEMENT
- SWAPP_SUBS_PRICE_CENTS=499 (exemple à valider : 4,99 EUR TTC mensuels)
- SWAPP_SUBS_PLATFORM_PERCENT=20 (exemple à valider : 20 % pour SWAPP, hors frais Stripe)
- SWAPP_SUBS_ALLOWED_CREATORS=sansahd (créateurs expressément autorisés à adapter)
- SWAPP_SUBS_STRIPE_WEBHOOK_SECRET=whsec_... (secret webhook dédié)
- SWAPP_MYSQL_URL et STRIPE_SECRET_KEY existants requis

Configurer le webhook Stripe vers :
POST https://swapp.tv/api/swapp/subscriptions/stripe-webhook

Événements nécessaires :
checkout.session.completed, checkout.session.async_payment_succeeded,
invoice.paid, invoice.payment_failed, customer.subscription.updated,
customer.subscription.deleted.

S'assurer que le propriétaire clique sur « Configurer mes versements » et passe la vérification du compte Stripe Connect Express avant vente.

## Endpoints
- GET /api/swapp/subscriptions/config?creator=login : prix, packs, droits, disponibilité.
- POST /api/swapp/subscriptions/checkout : {creator, kind:'self'|'gift', quantity, nonce}.
- POST /api/swapp/subscriptions/claim : réclamer un cadeau disponible, connexion + suivi gratuits requis.
- POST /api/swapp/subscriptions/cancel : annulation renouvellement.
- POST /api/swapp/subscriptions/creator/onboard : Stripe Connect du créateur propriétaire.
- POST /api/swapp/subscriptions/creator/refresh : revérifier le compte Stripe.
- GET /api/swapp/subscriptions/creator/dashboard?creator=login : statistiques.
- POST /api/swapp/subscriptions/stripe-webhook : traitement signé et persistant.

## Vérifications et limites
- Tester mode Stripe test, onboarding, paiement normal, cadeau 1 à 100, achat répété, fin de période, échec de renouvellement, webhook doublé, cadeau non attribué, vérification sur mobile.
- Remboursement automatisé, litiges et justificatifs TVA restent à finaliser avant vente réelle.
- Badges/emotes et animations de cadeaux en chat ne sont pas encore câblés sur ce service : ne pas les afficher comme acquis.
- Aucun VPS, aucune API IA payante ni GitHub Actions requis. Les frais Stripe/Connect existent pour les transactions effectives.
