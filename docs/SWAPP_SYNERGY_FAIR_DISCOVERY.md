# SWAPP — Synergie Jeu × Actualité × Live × SOCIAL
Fair Discovery v1 — 19 octobre 2026 — proposition de code à valider avant fusion.

## Trois engagements produit
1. Identité fiable : un article, un live et un espace de discussion doivent correspondre au même jeu. Pas de correspondances floues entre jeux, suites et remasters.
2. Un jeu comme porte d'entrée : les articles et dossiers mènent à de vrais directs, à SOCIAL et au suivi personnalisé.
3. Découvrabilité équitable : la popularité existante ne doit pas empêcher un petit créateur d'être présenté. Aucun achat de visibilité.

## Ce que le lot modifie
- Le code réutilise les dossiers /jeux/:slug, le référentiel des alias éditoriaux et les points d'accès aux directs déjà existants.
- Les trois flux (Découvrir, lives d'un jeu, ligne d'accueil) réservent des occasions aux petites chaînes, sans nouvelle requête fournisseur.
- Les liens /communaute?game=... ouvrent une recherche contextualisée, et le bouton Discuter du jeu des actualités SOCIAL fonctionne.
- Les actualités d'un jeu sont filtrées sur un champ de jeu explicite, validé par la même identité que les articles et lives.
- Aucun module supplémentaire n'est ajouté à l'accueil. Aucun service payant, aucune base de données supplémentaire.

## Fair Discovery v1
En découverte générale, le moteur tente d'attribuer approximativement la moitié des premières places à la pertinence existante, environ 30 % aux lives de créateurs ayant 25 spectateurs ou moins (uniquement s'ils sont suffisamment pertinents), et le solde à la diversité des jeux. Les résultats tournent par périodes de quinze minutes. Il s'agit d'objectifs conditionnels : le bassin de vrais directs peut manquer de candidats.

Une recherche explicite prime sur les quotas : le tri par pertinence est conservé. Les rediffusions identifiables sont exclues. Dans un dossier de jeu, le serveur vérifie d'abord l'identité exacte de chaque live, puis applique le nouveau classement. Aucun jeu non confirmé n'est ajouté pour remplir le quota.

## Limites essentielles
Petite audience ne signifie pas faible exposition sur SWAPP. Faute de mesures agrégées d'impressions réellement visibles, v1 améliore les *opportunités* d'être découvert, et non la parité mesurée de l'exposition. Les limites et la pagination de l'API Twitch peuvent aussi empêcher de récupérer certaines petites chaînes.

SOCIAL recherche des articles, membres et publications autour d'un jeu : il ne crée pas encore automatiquement de salon associé au jeu. Les messages renvoyés sont des résultats textuels et ne doivent pas être présentés comme des communautés explicitement validées.

## Vers l'équité mesurable (hors v1)
- Définir une impression visible, sans suivi individuel excessif.
- Agréger par créateur et jeu les impressions et interactions dans MySQL Hostinger, avec expiration et mesures anti-fraude.
- Mesurer exposition réelle, parcours article → live → SOCIAL, abonnements et retour à 7 jours.
- Prévoir des garde-fous anti-spam et des audits d'équité, sans bonus d'algorithme lié à un paiement.
Cette instrumentation n'est pas encore implémentée.

## Vérification avant fusion
1. npm test ; npm run check ; node --test test/swapp-fair-synergy.test.js sur Node 20+.
2. Inspecter /, /decouvrir, /jeux, /actus/:slug et /communaute?game=... sur ordinateur, iPhone et Android.
3. Scénarios : GTA 6/GTA VI ; Hades/Hades II ; Planet Zoo/Planet Zoo II ; The Witcher 3 et son remaster.
4. Vérifier les messages de panne Twitch, les cas sans live et la véracité du lien éditorial.
5. Déployer la branche validée sur Hostinger via le processus existant ; vérifier l'empreinte déployée et les fichiers réellement servis.
6. Aucun nouveau workflow GitHub Actions payant. Un commit GitHub ne prouve pas le déploiement sur swapp.tv.
