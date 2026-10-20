# SWAPP SOCIAL — URL canonique, interface de fil et fiabilité

## Livraison technique du 20 octobre 2026

### Routes et SEO
- Adresse officielle : **https://swapp.tv/social**.
- **GET /communaute** redirige en HTTP **308** vers `/social` ; les paramètres de recherche sont conservés, et le fragment d’URL reste géré par le navigateur.
- Navigation partagée ordinateur/mobile, liens d'articles, fiches de jeux, partages, footer, connexion SOCIAL, URL canonique, sitemap et plan du site : `/social`.
- Ancien segment `communaute` réservé, pour éviter la collision de slug utilisateur.
- Les anciennes références historiques présentes dans les anciens documents ne sont pas de nouvelles URL canoniques.

### Expérience inspirée du fonctionnement des microblogs
- Fil à lecture verticale, colonnes latérales, séparateurs discrets, contenu et textes lisibles, actions compactes. Identité graphique SWAPP conservée ; pas de logos ni d'assets X.
- Deux flux réels : **Pour vous** et **Abonnements**. Navigation existante vers les profils, recherche, communautés, notifications et messages.
- Actions des publications lisibles avec `aria-pressed` : **J’aime**, **Reposter**, **Enregistrer** ; mise à jour seulement après la réponse du serveur.
- Double-clics concurrents bloqués et plus de rechargement intégral du fil après chaque like/repost/enregistrement.
- Réseau indisponible : état d’erreur lisible et bouton **Réessayer** dans le fil et la messagerie, plutôt qu’un état bloqué.
- Les lectures GET peuvent être rejouées une fois pour une erreur réseau ou 502/503/504. **Aucun POST/PATCH/DELETE n'est rejoué automatiquement**, pour éviter posts et messages dupliqués si la première écriture a réussi malgré l'erreur réseau.
- Lien média sécurisé (http/https uniquement), enregistrements de posts malformés ignorés, citations sans auteur tolérées.
- Confort iPhone/Android et desktop visé par une couche CSS finale, `prefers-reduced-motion` respecté.

### Architecture réellement en place : point bloquant majeur
- Le fil, les posts, abonnements et DMs passent encore par le service Quantic SOCIAL sur **Render** via `/api/pulse/*` ; l'accès utilise le compte SWAPP via proxy SSO first-party.
- Les passeports/jeux, salons et autres interactions SWAPP utilisent partiellement MySQL Hostinger.
- **Les modifications de cette livraison ne suppriment PAS la dépendance à Render et ne constituent pas une migration native MySQL.**
- Une copie fonctionnelle à 100 % des fonctions X implique beaucoup plus que le CSS : stockage robuste des messages et posts, pagination, modération et signalements, notifications, tests de concurrence, reprise de panne, observabilité, profils, confidentialité et sécurité. La parité complète n’est **pas prouvée** ici.

## Gates de validation avant déclaration « 100 % fonctionnel »
1. `npm run check`, `node --test test/swapp-social-canonical-reliability.test.js`, `npm test` dans un environnement Node (aucun job GitHub Actions payant déclenché exprès).
2. Vérifier `GET /communaute?game=...` → **308** vers `/social?game=...`, puis `GET /social` → **200** et `<link rel="canonical" href="https://swapp.tv/social">`.
3. Vérifier `/api/swapp/social/release` : marqueur `social-canonical-timeline-20261020` ; un commit seul n'est pas une preuve de déploiement.
4. Vérifier le fil pour vous, abonnements, recherche, ouverture de profil, publication, réponse, repost, like, enregistrement, signalement, création de communauté, DMs, notifications, logout/relogin.
5. Deux comptes SWAPP indépendants et deux appareils ; éprouver F5, back navigateur, Safari iPhone, Android, écran 320px, navigation clavier et contraste.
6. Couper volontairement le backend Render dans un environnement isolé et vérifier affichage d'erreur + récupération automatique des lectures, **sans écriture fantôme ni message dupliqué**.
7. Avant toute migration MySQL : sauvegarde et export vérifiés du service SOCIAL existant ; conception des tables, migration des comptes/posts/threads/relations, contrôles d'intégrité, bascule limitée, rollback. Ne jamais supprimer les contenus de Render tant que l'import n'est pas validé.

## Priorités après cette livraison
- **P0 :** vérifier la production Hostinger, les routes, la session, la disponibilité de Render et les tests navigations.
- **P1 :** reprise de données et migration native MySQL transactionnelle avec coexistence contrôlée, sans perte des messages.
- **P2 :** mécanismes X essentiels approfondis : threads, pagination serveur, pièces jointes, mentions, recherche, notifications fiables, modération, gestion des comptes bloqués, reporting.
- **P3 :** mesures de performance (temps de rendu fil, temps d'action, latence DM), tests de charge, audit mobile et accessibilité, puis validation de la liste complète d'acceptation.

Ce n'est **pas** un clonage des marques, actifs ni codes de X : c'est une mise à niveau fonctionnelle de SOCIAL fondée sur les conventions ergonomiques de microblogging.
