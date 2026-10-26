# SWAPP — Relevé initial de visibilité GEO

Date : **26 octobre 2026** (Europe/Paris)
Domaine ciblé : https://swapp.tv
Périmètre : résultats des recherches publiques consultées et accessibilité apparente via les outils de recherche disponibles. **Aucune donnée privée Search Console/Bing Webmaster**, aucune réponse Perplexity/Copilot indépendante et aucun trafic réel n'ont été observés ici.

## Score de visibilité web exploratoire

**1/6 intentions de découverte avec un résultat SWAPP retrouvé** (la recherche mêlant actualités, jeux et lives). Cette mesure est une photographie de résultats retournés par les recherches consultées ; ce n'est ni un classement Google fixe, ni un score de citation IA, ni une statistique Search Console.

| Intention testée | Résultat SWAPP observé | Exemples de résultats consultés |
| --- | --- | --- |
| Alternative française à Twitch | Non dans les principaux résultats examinés | StreamHouse (streamhouse.co) |
| Découvrir de petits streamers gaming | Non dans les principaux résultats examinés | Optistream, FireTeaM, L4PP |
| Site réunissant actualités jeux vidéo et lives de créateurs | **Oui**, https://swapp.tv/ retrouvé sur une formulation | SWAPP, ActuStream, GamersLive |
| Réseau social pour joueurs | Non dans les principaux résultats examinés | Lobbik, TalkPlay, Itryw |
| Regarder des lives hors Twitch | Non dans les principaux résultats examinés | Netguide, autres catalogues de plateformes |
| Plateforme gaming française 2026 | Non dans les principaux résultats examinés | Gaming Campus et offres comparables |

## Accessibilité et indexation

- La page d'accueil https://swapp.tv/ est accessible par l'outil de consultation web et expose un titre H1 et des liens HTML vers des rubriques principales.
- Les ouvertures directes de https://swapp.tv/a-propos et https://swapp.tv/alternative-twitch ont échoué dans l'outil utilisé, de même que les équivalents avec www. **Le statut HTTP effectif n'est pas connu** : le déploiement Hostinger reste à vérifier.
- Les recherches `site:swapp.tv/a-propos` et `site:swapp.tv/alternative-twitch` n'ont pas fait apparaître les nouvelles pages. Les requêtes `site:` ne permettent pas à elles seules de prouver la non-indexation.
- `/robots.txt`, `/sitemap.xml`, `/api/release` et `/api/seo/status` n'ont pas pu être lus directement depuis l'outil de consultation. Ce n'est pas une preuve de défaut serveur.
- Les résultats retrouvés incluent des anciennes URL comme `www.swapp.tv/communaute`, ce qui justifie une vérification de canonisation et de migration des URL dans Search Console.
- **Homonymie** : `swapp.fr` est un autre service de cartes digitales, sans rapport établi avec SWAPP.tv. Privilégier l'entité publique SWAPP.tv avec domaine exact et description gaming.

## État des mesures

- Mentions visibles dans six recherches web : **1/6**
- Citations indépendantes confirmées dans les réponses IA : **non mesurées** (ne pas écrire 0 citation réelle).
- Impressions Google, clics organiques et CTR : **non mesurés** (Search Console non connectée).
- Présence réelle des nouveaux fichiers sur Hostinger : **non vérifiée**.

## Actions avant d'interpréter l'évolution

1. Contrôler dans Hostinger le déploiement de la PR #167, commit de fusion `ee6b25e2c992ae1b62bbae2501454b32ceb2497e`. Comparer `/api/release` aux fichiers déployés.
2. Vérifier avec un client HTTP le statut 200, les canoniques et JSON-LD de `/a-propos` et `/alternative-twitch`, ainsi que `/sitemap.xml` et `/robots.txt`.
3. Dans Search Console, inspecter ces deux URL et soumettre le sitemap déjà existant après validation du déploiement. Vérifier également `/social` et les redirections `/communaute`.
4. Refaire les six recherches **avec les mêmes formulations, moteur et langue**, et noter la date, la position et la preuve de chaque résultat.
5. Relever les impressions, clics, pages d'entrée et requêtes dans Search Console. Pour les citations IA, contrôler séparément ChatGPT Search, Perplexity, Copilot et Bing Webmaster Tools (AI Performance), en enregistrant les liens de preuves quand ils existent.

Aucune modification n'a été apportée au serveur de production pour effectuer ce relevé. Aucun outil payant, cron ou GitHub Actions n'a été lancé.
