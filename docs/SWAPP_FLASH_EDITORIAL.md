# SWAPP FLASH — information rapide, source vérifiable et contexte utile

## Une seule rédaction, une seule adresse

Toute l'information publique demeure dans **`/actus`**. Les boutons `GAMING`, `AI`, `ROBOTICS` et `FUTURE` sont des **filtres de tags**, pas de nouvelles pages ni de chaînes. Au-dessus de la grille d'articles, le composant `SWAPP FLASH` affiche trois brèves principales, avec la possibilité d'afficher les suivantes sans changer de route. Le même article peut appartenir à plusieurs tags.

### Ce qui rend le format distinct

1. **La vitesse sans publication fictive** : le collecteur Node lit les flux de sources chaque heure si MySQL est configuré, sans nouveau serveur ni facture API. Ces titres collectés apparaissent séparément comme `non vérifiés` et jamais comme article publié. La rédaction autorisée à publier fonctionne avec son contrôle habituel de six heures.
2. **Le fait, l'impact et la limite** : chaque note éditoriale courte comprend `fact`, `impact`, `caveat` — éviter les promesses floues, chiffrages non sourcés et déductions prises pour des faits.
3. **L'attribution et les dates** : la note inclut `sourceName`, `sourceUrl` (HTTPS primaire), `sourceDate` (date du fait source) et `reviewedAt` (date de sa vraie vérification). `source_primaire_consultee` signifie que la source primaire a été consultée ; **pas** que SWAPP a reproduit ses tests ou obtenu une confirmation indépendante.
4. **La double profondeur** : les brèves orientent rapidement et les véritables articles restent dans le même catalogue MySQL `/api/actus`, avec vidéo, sources et analyses. Une brève n'est pas une copie de l'article.
5. **La provenance visible** : aucun score de confiance inventé. Le lecteur peut ouvrir la source officielle et lire les limites explicitement. Les titres issus du collecteur sont marqués `pending_review` et ne deviennent jamais automatiquement `source_primaire_consultee`.

## Stockage et publication

- Fichier roulant de brèves éditoriales : `data/swapp-editorial-signals.json`.
- Validateur de sources, de dates, de thèmes et de contenu : `modules/swapp-news/editorial-signals.js`.
- Endpoint public en lecture seule : `GET /api/actus/signaux` (réponse `editorial` + `watch` séparés). La route est enregistrée avant la route générique `/api/actus/:slug`.
- Interface : `assets/swapp-actus-app.js` et `assets/swapp-actus-app.css`, à l'intérieur de la même vue native `/actus`.
- Candidats persistants MySQL : `swapp_tech_watch_candidates`, mises à jour non destructives par le collecteur. Les articles publiés, brouillons ou retirés ne sont **jamais** affectés par ces mises à jour.
- Les nouvelles notes brèves sont préparées par la veille éditoriale existante toutes les six heures, après vérification de sources officielles. Les nouvelles sources candidates apparaissent au plus tôt lors d'une collecte Node réussie.

## Règles de mise à jour

Ajouter une note lorsque le fait est important, nouveau et vérifiable auprès d'une **source primaire datée**. Dédupliquer par événement + lien source. Pour une ancienne annonce, conserver sa date d'origine ; ne jamais la redater comme une actualité du jour. Préciser systématiquement si le chiffre est un résultat d'essai du fournisseur, une simulation, un pilote ou une disponibilité grand public.

Pour actualiser `data/swapp-editorial-signals.json`, faire un changement versionné dans GitHub. Le champ `updatedAt` doit correspondre à une véritable révision des informations, pas à un simple déclenchement de la veille. Les notes antérieures sont filtrées au bout de 45 jours. Les liens source doivent appartenir aux domaines officiels autorisés dans le code (liste étroite, extensible après contrôle).

## Contrôles indispensables

- `node --test test/swapp-editorial-signals.test.js test/swapp-tech-watch.test.js test/swapp-tech-watch-scheduler.test.js`
- `node --check assets/swapp-actus-app.js && node --check modules/swapp-news/editorial-signals.js && node --check server.js`
- Vérifier `/actus` avec et sans `?tag=AI`, `?tag=ROBOTICS`, `?tag=FUTURE`, sur ordinateur et sur mobile.
- Vérifier que les brèves ne sont pas répétées dans plusieurs listes, que leur source et leurs dates sont visibles, que « Voir plus » ne masque pas les articles et que le radar non vérifié reste clairement distinct.
- Si MySQL est indisponible : continuer à afficher uniquement les brèves éditoriales sauvegardées, sans annoncer de collecte réussie.
- Si la page est bloquée par reCAPTCHA/WAF avant Node : diagnostiquer la protection amont ; ne jamais prétendre qu'un commit GitHub prouve la mise en ligne.

## Mesures utiles (sans faux chiffres)

Observer dans les journaux et analyses autorisées : délai **source officielle → note vérifiée**, nombre d'annonces dédupliquées, nombre de titres non vérifiés toujours en attente, taux de brèves avec source et limite, proportion de brèves menant à un dossier, incidents d'API. **Ne pas afficher de compteur d'audience inventé ni de score de confiance sans méthode reproductible.**
