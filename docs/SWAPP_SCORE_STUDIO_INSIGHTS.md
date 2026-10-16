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
