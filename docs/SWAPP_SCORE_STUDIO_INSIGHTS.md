# SWAPP Studio — Retours lecteurs

## Où le trouver
Dans SWAPP Studio : `/actus/studio` → **Retours lecteurs**. Nécessite les droits rédaction existants. Le nouvel onglet n'apparaît pas sur l'accueil public.

## Indicateurs affichés
- Total des votes enregistrés sur des articles natifs actuellement publiés.
- Nombre d'articles évalués / nombre d'articles natifs publiés.
- Moyenne **pondérée par les votes**, sur 5.
- Totaux des trois critères facultatifs : Utile, Bien documenté, Intéressant.
- Tableau par article avec son nombre de votes, sa moyenne et son critère le plus cité (affiché à partir de cinq votes sur l'article).

Le tableau comprend aussi les articles sans vote afin de repérer les publications qui n'ont pas encore recueilli d'avis.

## Accès et confidentialité
- `GET /api/editor/actus/insights` est protégé par les mêmes contrôles que SWAPP Studio.
- Les données proviennent uniquement de `swapp_news_articles` (statut `published`) et des compteurs `swapp_article_scores`.
- L'API ne lit pas `swapp_article_votes` et ne renvoie ni comptes, ni identifiants des votants, ni adresses IP, ni préférences individuelles.
- Les brouillons, les articles retirés et les articles JustPlayer encore non migrés sont exclus.
- Aucun cookie de suivi ni appel à un prestataire tiers supplémentaire.
- Limite de lecture de 500 documents par collection ; lorsque la limite est atteinte, un avertissement indique que les résultats peuvent être partiels.

## Vérifications
Quatre tests ciblés ajoutés dans `test/swapp-editor-insights.test.js` : calcul pondéré, compteurs incohérents, contrôle d'accès et absence de données nominatives, présence de l'interface responsive. Ils ont été exécutés via une simulation JavaScript ; la suite Node et le déploiement Hostinger restent à vérifier.

L'interface et l'API ne sont **pas** une mesure de fréquentation ou de taux de conversion. Elles ne présentent que les retours volontairement enregistrés.

## Affichage du SWAPP Score dans les articles

L'en-tête d'un article natif ou de sa vue SPA montre désormais un indicateur compact :
- Sans vote : **Donner votre avis** (aucune note fictive).
- Avec vote : **★ 4,2/5 · 13 avis · Noter l'article** (exemple de format, jamais de valeur prédéfinie).
- Un clic ou une activation au clavier mène au formulaire de notation existant, sans second formulaire et sans créer de nouvelle rubrique.
- La note correspond à l'appréciation de la **qualité de l'article**, pas du jeu traité.

La mention **« Apprécié par les lecteurs »** apparaît uniquement si :
1. Au moins **10 personnes** ont noté cet article.
2. La moyenne **exacte, non arrondie** atteint **4,5 sur 5**.
3. Le serveur renvoie explicitement `readerRecognition: true`, à partir des sommes et comptes Firestore.

La moyenne affichée est arrondie à un chiffre après la virgule, mais cet arrondi ne suffit jamais à déclencher la mention. Celle-ci n'est ni une certification de la rédaction ni une recommandation commerciale, et n'est pas influencée par l'affiliation. En l'absence de données fiables, aucune reconnaissance n'est affichée.

Le module `assets/swapp-article-feedback.js` est monté aussi bien sur les articles natifs rendus côté serveur que sur la navigation Actualité interne. Il ne collecte pas d'informations complémentaires sur les lecteurs.
