# SWAPP — plan d'exécution GEO / SEO (audit du 14 novembre 2026)

## Observations vérifiées

- Le `robots.txt` du dépôt autorise `User-agent: *`, avec exclusion `/api/` et de deux interfaces administratives. Il ne bloque pas explicitement OAI-SearchBot, GPTBot, ClaudeBot, Claude-SearchBot, PerplexityBot ni Google-Extended. Contrôler la réponse HTTP en production avant toute conclusion sur l'accès réel.
- `index.html` contient une balise de vérification Google, mais cela ne prouve ni la propriété Search Console ni la soumission du sitemap.
- La lecture HTML publique de `https://swapp.tv/actus` le 14/11/2026 renvoie surtout des titres, navigation et états de chargement ; aucun corps d'article n'apparaît dans cette réponse. Une vérification du HTML brut de chaque URL canonique est nécessaire.
- La lecture de `/guides`, `/robots.txt` et `/llms.txt` par l'outil de consultation n'a pas abouti : statut HTTP exact non confirmé. Ne pas présenter ces pages comme déployées.
- Le document `docs/SWAPP_VEILLE_PUBLICATION_AUTOMATIQUE.md` décrit encore une synchronisation Firestore. Vérifier la réalité du pipeline MySQL Hostinger avant toute intervention sur la publication.

## P0 — pages d'articles et guides indexables

1. Inventorier les routes canoniques réellement publiées et le ticket #204 ; éviter toute duplication des guides.
2. Pour chaque article et guide, récupérer le HTML avec JavaScript désactivé, confirmer : code 200, titre unique, description, canonical absolu, H1, texte principal complet, auteur, date de publication et de mise à jour, sources, liens internes.
3. Si le corps dépend du navigateur, mettre en place un rendu HTML côté serveur ou pré-rendu statique des seules pages publiques. Ne pas modifier le lecteur HLS, OBS, paiements, les sessions ni les API privées.
4. Ne jamais exposer en HTML pré-rendu un contenu dépublié, privé ou modifié dans le Studio : la source d'autorité éditoriale en production doit primer sur les fichiers GitHub.
5. Ajouter des données JSON-LD `Organization`, `WebSite`, `Article`/`NewsArticle`, `BreadcrumbList` adaptées aux faits vérifiés. `FAQPage` uniquement pour de vraies questions/réponses affichées ; ne pas promettre de rich result. Pas de `Product` fictif ni de notes SWAPP Score fabriquées.

## P1 — indexation et citations

- Vérifier robots.txt, sitemaps, canonical, hreflang si utile, codes HTTP, liens internes et absence de `noindex` accidentel.
- Confirmer Google Search Console et Bing Webmaster Tools avec le propriétaire ; soumettre les sitemaps uniquement après contrôle de leur validité.
- Standardiser les guides : question précise dans le H2, réponse courte et vérifiable, version et plateformes, exemples, sources primaires datées, incertitudes, auteur, crédits médias et journal de révisions.
- Ajouter une page « À propos » explicite et une politique éditoriale avec coordonnées publiques validées, sans inventer d'identité ni de contact.
- `llms.txt` est facultatif et ne remplace pas l'indexation ; ne pas mesurer sa présence comme une preuve de visibilité IA.

## P2 — suivi mesurable

Chaque semaine, relever : nombre d'URL indexables vérifiées par lecture HTML sans JS, pages indexées Search Console/Bing, impressions/clics, robots effectivement observés dans les logs Hostinger (avec user-agent et codes HTTP), et citations obtenues dans un jeu stable de questions ChatGPT/Perplexity/Gemini. Distinguer mention, lien et citation réelle ; consigner la date et les questions testées.

## Critères d'acceptation avant déploiement

- Tests HTML sans JS pour une page d'actualité, un guide et une page de catégorie ; contenu réel présent et canonicals corrects.
- JSON-LD parsable et cohérent avec les champs visibles, aucune donnée inventée.
- Pas de régression des routes privées, de l'authentification, de MySQL ou des contenus dépubliés.
- Vérification après déploiement des URL publiques et des statuts HTTP. Un commit GitHub seul n'est jamais une preuve de publication.

## Journal

- 2026-11-14 : audit initial du dépôt et de la page /actus ; plan d'implémentation rédigé. Aucune modification du backend ou des routes publiques dans cette branche.
