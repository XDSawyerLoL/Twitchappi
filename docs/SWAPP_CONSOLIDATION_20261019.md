# SWAPP — Consolidation produit et critères de sortie (19 octobre 2026)

Mission : un parcours joueur continu et honnête : jeu exact → article → vrais lives du jeu → salons SOCIAL autorisés. La découverte des petits créateurs est équitable sans vente de places dans le classement.

## Cette livraison
- Répare les métadonnées SEO héritées de la page d’accueil (canonique, description, Open Graph et Twitter) et le doublon RSS sur les routes SPA.
- Retire la canonique de l’accueil des pages privées noindex, et des profils créateurs publics, remplacée par une métadonnée propre.
- Isole dans noscript les introductions de secours pour éviter leur affichage derrière l’interface au chargement.
- Ajoute des tests de non-régression et un verrou de production pour les canonicals d’Accueil, Actualité et Découvrir.

## P0 — Fiabilité : critères obligatoires
- [ ] Exécuter sur un checkout Node : npm ci, npm run check, node --test test/swapp-seo.test.js, puis npm test ; isoler les échecs existants, ne pas les cacher.
- [ ] Déployer sur Hostinger la version validée, sans GitHub Actions payantes. Vérifier release:info et verify:production avec les empreintes identiques de /api/release.
- [ ] Vérifier F5 et navigation à froid sur PC, iPhone Safari et Android Chrome : Accueil, Découvrir, Actualité, article, Compte, Communauté, Boutique. Aucun flash, collision de menu, fond fantôme ou perte de couleurs.
- [ ] Vérifier séparément l’état des comptes MySQL, la santé de SOCIAL, la publication, les MP, les salons et le vocal ; database_read_ready ne garantit pas les actions. Le 19/10, l’API publique de persistance retournait encore Firestore.

## P1 — Persona : preuve d’utilité
- [ ] Tester article → vrai live → bon salon (ou état vide honnête) pour Witcher 3 et remaster, Hades 1/2, Planet Zoo 1/2, GTA VI, avec vérification de la catégorie Twitch.
- [ ] Tester création de compte, connexion, Mes jeux et favoris entre appareils sans perte ni doublon.
- [ ] Tester SOCIAL connecté : publication, message, salon public, invitation privée, autorisations et micro coupé par défaut.
- [ ] Lancer un pilote volontaire avec 15–20 joueurs et 5–10 petits créateurs. Relever réussite, durée et friction des parcours ; mesurer le retour J+7/J+28 avec consentement adapté.
- [ ] Fair Discovery : séparer propositions serveur et impressions réellement vues avec consentement. Ne pas annoncer de parité tant que l’échantillon reste insuffisant (50 impressions, 5 créateurs).

## P2 — Acquisition et commerce
- [ ] Confirmer chaque page auto-canonique dans Search Console, mesurer indexation et trafic ; un sitemap présent ne prouve pas l’indexation.
- [ ] Publier des actualités factuelles et sourcées avec jeux associés, puis évaluer les parcours article → live.
- [ ] Boutique : garder la vitrine Steam honnête ; ventes directes après accord B2B, prix vérifiés, conformité paiement, TVA et droit de revente.
- [ ] Mesurer les liens d’affiliation sans confusion avec le classement éditorial et sans suivi invasif.

## Définition de terminé
Code fusionné, tests ciblés et globaux valides, empreinte Hostinger vérifiée, parcours testé sur de vrais appareils, aucune donnée fictive ni liaison erronée entre jeux et lives.

Contraintes : Hostinger et MySQL existants, pas de VPS, pas de nouvelles Actions payantes, aucun suivi individuel caché.