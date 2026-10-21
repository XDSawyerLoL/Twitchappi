# SWAPP — GAME UNIVERSE, lancement vérifié du 21 octobre 2026

Décision propriétaire : nouveaux comptes MySQL, SANS import des comptes Firestore de test.

## Principe
Un jeu vérifié possède un univers accessible depuis /jeux et /jeux/:slug :
articles originaux → créateurs réellement en direct sur le jeu → communauté SOCIAL filtrée par jeu → jeux suivis / envies → boutique.
Ne jamais inventer un live, une vente, un salon actif ou une donnée d'audience.

## Livré et vérifié
- Dossier accessible avec un seul article publié, sans duplication de titres ni résurrection des brouillons.
- Pages /jeux, /jeux/cyberpunk-2077, /jeux/crimson-desert et /jeux/ordinary-oddness accessibles sur SWAPP ; 63 URLs au sitemap lors du contrôle.
- Entrée Jeux dans la navigation ; cartes illustrées depuis une image publiée ou la miniature de la vidéo officielle de chaque article.
- Lien article → univers de jeu réellement indexé, sans dépendre de préchargement du cache SEO.
- Lien univers → article, live exact game_id, SOCIAL?game=, suivi, envies, vitrine.
- Directs : favoriser la langue française si un créateur admissible (20 spectateurs ou plus) est disponible ; repli international déclaré si besoin.
- SOCIAL : erreur de salon isolée des sondages et des autres espaces ; le faux message général de panne a été remplacé.
- Compte admin : état de services MySQL, SOCIAL, Spotlight, Fair Discovery, Discord, rédaction et SEO en lecture seule avec vérification serveur des droits.

## Nouveaux comptes MySQL — AUCUNE MIGRATION
La production indiquait encore Firestore sur GET /api/oryon/persistence-status le 21 octobre.
Le fait que SOCIAL utilise MySQL ne signifie pas que le système de comptes l'utilise.

Activation sur l'application Node existante Hostinger, sans nouvel abonnement :
1. Sauvegarder les données et la configuration ; vérifier la connexion MySQL et la possibilité de créer la table de comptes.
2. Dans les VARIABLES PRIVÉES de Hostinger : SWAPP_ACCOUNT_STORE=mysql et un SWAPP_MYSQL_URL valide (ou SWAPP_ACCOUNT_MYSQL_URL réservé aux comptes).
3. Redémarrer l'application. Confirmer /api/oryon/persistence-status : mysql=true, persistence=mysql:swapp_oryon_accounts.
4. Créer deux comptes NEUFS, tester connexion, déconnexion, F5, nouveau navigateur, SOCIAL, Mes jeux, sauvegarde et smartphones. Refaire les liaisons Twitch. Ne pas associer les contenus de l'ancien user_id sur la simple similitude des pseudos.
5. Une fois les deux comptes et Twitch validés, activer SWAPP_SPOTLIGHT_ENABLED=1 sur Hostinger, redémarrer, contrôler /api/creator/spotlight/status enabled=true et accounts_mysql=true.
6. Tester Spotlight réel, réservation de créneau, jeu Twitch correct et audience minimale de 20 spectateurs, annulation et notifications.

Pas de modification automatique de configuration via GitHub, pas de secret dans les fichiers et pas de bascule des comptes en déduisant seulement le backend de SOCIAL.

## Chantiers encore NON LIVRÉS
- Tester à deux comptes toutes les interactions SOCIAL et les notifications ; vérifier un vrai message Discord après nouvelle publication.
- Spotlight réellement activé, file d'attente/rotation, remplacement des absents, notification vérifiée, statistiques transparentes.
- ASCENSION sur plusieurs lives mesurés, badges et progression sans chiffres inventés.
- RADAR enrichi : dates vérifiées, événements communautaires, guides, recommandations pour jeux suivis, salons réellement actifs.
- Distribution sociale X/Bluesky après autorisation, création de liens créateurs.
- Boutique B2B transactionnelle seulement après contrats, droits, factures, livraison des clés et support.
- Mentions légales authentiques, confidentialité, CMP, SEO, tests iPhone/Android et corrections UX.

## Mesures prioritaires
Visite→jeu, jeu→article, jeu→live, jeu→SOCIAL, jeu→suivi, clics réels de Spotlight, retour volontaire à 7 et 30 jours.
Séparer strictement les propositions API des impressions réellement visibles et les vues Twitch des clics générés par SWAPP.

Règle : un commit GitHub ne constitue pas une preuve de fonctionnement. Contrôler URL réelle, état d'API ou essai avec compte autorisé.
