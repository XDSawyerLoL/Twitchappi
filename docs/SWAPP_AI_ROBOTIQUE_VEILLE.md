# SWAPP AI & Robotique — veille native (phase 1)

Branche de développement : `feat/swapp-ai-robotics-watch-20261110`.

## Objectif
Ajouter les rubriques **IA**, **Robotique** puis **Future** à SWAPP, avec un flux transversal **Live News**. Conserver Gaming, lives, guides, Social et la base MySQL Hostinger. Aucun appel à ChatGPT ni API payante pour la collecte.

## Livré dans cette branche
`tools/swapp-tech-watch.js` récupère plusieurs flux publics en HTTPS, avec délai d'attente, limite de taille, dates des sources, déduplication SHA-256 par source + URL, et stockage JSON atomique. Les échecs d'un flux ne bloquent pas les autres. Les anciens candidats sont préservés. Exécution manuelle : `node tools/swapp-tech-watch.js`.

Le fichier `data/swapp-tech-watch-candidates.json` est un **registre de candidats non vérifiés**, pas un manifeste de publication. Aucun de ces éléments n'est publié automatiquement. Les flux peuvent changer ou être indisponibles : contrôler les URL et le fonctionnement avant activation.

## Phase 2 — à réaliser avant mise en production
1. Ajouter un déclenchement persistant **dans le processus Node Hostinger existant**, avec verrou mono-instance et rythme 6 h, sans nouvelle tâche facturable.
2. Stocker les candidats et états de vérification en MySQL pour éviter la perte au redéploiement et les conflits entre instances. Ne pas confondre flux tiers et communiqué primaire.
3. Vérifier source primaire, date, zone, doublons, vidéo officielle intégrable, miniature du bon sujet, puis créer une release conforme au protocole existant. Sans ces preuves, rester en brouillon.
4. Ajouter les filtres IA/Robotique/Tech, la page Live News et les liens de navigation dans l'interface existante ; ne pas déployer une page vide.
5. Tester le déploiement Hostinger et vérifier les pages publiques, API, vidéos et sources avant de déclarer la fonctionnalité active.

## Sécurité éditoriale
Aucune nouvelle publication automatique à partir d'un titre RSS seul. Pas de reprise d'anciens articles retirés, pas de modification de secrets, pas de Firebase. Ne jamais confondre une démonstration robotique avec un produit autonome commercialisé.


## Actualisation du 11 novembre 2026 — architecture du média

La page \`/tech\` est la **porte d'entrée du média SWAPP** et ne doit jamais correspondre à un profil de streamer. Le routage explicite précède la route générique de créateur dans \`server.js\`; les slugs racine sont réservés. Routes du média :

| Rubrique | URL | Contenu |
|---|---|---|
| GAMING | \`/gaming\` | Fiches de suivi sourcées, \`/actus\`, guides et lives |
| AI | \`/ai\` | Veille IA ; seules les informations vérifiées peuvent devenir des articles |
| ROBOTICS | \`/robotics\` | Veille robotique et automatisation |
| FUTURE | \`/future\` | Technologies émergentes, veille ESA |
| SWAPP LIVE NEWS | \`/live-news\` | Flux des **articles réellement publiés** via \`/api/actus\` |
| Média | \`/tech\` | Page transversale, accès à toutes les rubriques |

Les aliases \`/technologies\` et \`/tech/{gaming,ai,robotique,futur,live}\` servent la même interface. Les menus sur ordinateur et mobile proviennent de \`assets/swapp-navigation.js\`. Aucun contenu de source brute n'est promu au rang d'article. Les titres RSS/Atom sont visibles dans une zone **« Sources surveillées »** avec avertissement, lien externe HTTPS et échappement HTML. La rubrique \`/live-news\` lit la collection publiée du CMS via l'API publique : elle ne lit ni le manifeste brut ni une collection de brouillons. Les articles tech validés y apparaîtront avec leur catégorie à mesure de leur adoption MySQL ; les sources en attente ne s'y affichent pas.

### Gaming : radar vérifié et premier dossier

Le fichier \`data/swapp-game-radar-20261111.json\` est une sélection datée de **six jeux** demandés par le propriétaire : Dawn of War IV, Metro 2039, Dragon Quest Monsters: The Withered World, Persona 4 Revival, Stranger Than Heaven et Fable. Chaque fiche pointe vers sa source officielle ; les six miniatures sont chargées depuis YouTube sans réhébergement. Les fiches ne sont **pas de fausses nouvelles annonces du 11 novembre**, les prix d'une capture commerciale ne sont pas repris et la disponibilité doit être contrôlée à nouveau avant un éventuel article d'achat.

Un dossier complet sur Fable, sourcé Xbox Wire et accompagné de la bande-annonce officielle Xbox, est versionné dans \`data/swapp-veille-native-20261111-fable-2027-dossier.json\` et référencé dans le manifeste de la branche. **Ce lot n'est pas attesté en production tant que Hostinger n'a pas adopté le fichier et que la page publique /actus/:slug n'a pas été contrôlée.** Ne jamais annoncer un succès de publication sur la seule base d'un commit.

### Collecte, coûts et résilience

Le collecteur utilise des flux publics HTTPS de fournisseurs IA, robotique et ESA Technologie spatiale, sans services IA payants. \`startTechWatch()\` réutilise le processus Node Hostinger et MySQL **si la connexion MySQL est configurée** ; pas de VPS, pas de cron supplémentaire et pas de GitHub Actions. La variable \`SWAPP_TECH_WATCH_ENABLED=0\` désactive explicitement la collecte. Le scheduler utilise \`run({output:null})\` pour éviter toute écriture sur un filesystem Hostinger potentiellement éphémère. Le verrou MySQL évite le double déclenchement entre instances.

Si MySQL est absent ou indisponible, **les pages restent affichables**, indiquent le problème et n'inventent pas de résultats. Le flux des articles publiés indique qu'il est momentanément indisponible si l'API CMS refuse la requête. Les problèmes de reCAPTCHA/pare-feu **se produisent en amont du serveur Node** : ils ne se résolvent pas en changeant les routes applicatives et ne justifient pas le contournement d'un CAPTCHA.

### Validation avant production

1. Exécuter localement \`node --check server.js\`, \`node --check modules/swapp-tech-watch-page.js\`, \`node --check assets/swapp-navigation.js\`, \`node --check assets/swapp-editorial-feed.js\` et \`node --test test/swapp-tech-watch*.test.js test/swapp-editorial-hub.test.js\`.
2. Vérifier dans un environnement de préproduction Hostinger les réponses HTML 200 de \`/tech\`, \`/gaming\`, \`/ai\`, \`/robotics\`, \`/future\`, \`/live-news\` et l'absence de page de chaîne.
3. Confirmer MySQL actif, les candidats collectés, la déduplication, les menus sur mobile et desktop et les liens directs des miniatures YouTube.
4. Contrôler le Fable \`/actus/fable-2027-albion-choix-consequences-population-vivante\` : véritable article, source, vidéo, visibilité via \`/api/actus/release-status\`, absence de doublons.
5. Observer le déploiement effectif et l'état des protections réseau. L'état d'un pull request GitHub seul ne valide **aucun** résultat en production.

**Limite restante :** cette base constitue le portail, le flux transversal des articles existants, le radar Gaming et la collecte de candidats tech. La rédaction/publication automatiquement vérifiée d'articles IA/Robotique/Future doit encore être implémentée ; ne pas présenter les liens RSS comme des articles complets ni revendiquer un fonctionnement autonome de cette rédaction.
