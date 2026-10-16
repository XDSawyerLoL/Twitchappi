# SWAPP — Exploitation centralisée sur Hostinger, sans CI payante

## Règle budgétaire

- **Aucun GitHub Actions automatique.** Le workflow `.github/workflows/swapp-quality.yml` a été supprimé du dépôt.
- **Aucun appel Gemini depuis le code SWAPP** : l'IA payante est désactivée en dur par `SWAPP_PAID_AI_ENABLED = false`, indépendamment d'une ancienne clé `GEMINI_API_KEY` qui serait encore présente dans Hostinger.
- Ne pas réintroduire de workflow GitHub, de modèle externe payant, ni de cron qui génère des appels facturables sans consentement préalable et estimation chiffrée.
- GitHub reste un dépôt de versions ; **Hostinger est le point central de déploiement et de vérification**.
- Cela ne supprime pas les coûts d'hébergement, de base de données, de stockage, des tiers ou d'une facturation Google passée.

## Installation et vérifications Hostinger

L'application Node démarre avec `app.js` (`npm start`). Le code de version et les scripts de tests sont conçus pour fonctionner sur le même répertoire Hostinger, sans GitHub Actions.

### Avant ou après déploiement (commande ponctuelle, terminal Hostinger)

```sh
npm run check
npm test
npm run release:info
npm run cost:audit
```

`npm run cost:audit` signale les configurations de services potentiellement facturables, sans envoyer d'informations et sans afficher les clés. Ce n'est pas un relevé des dépenses réelles.

Éviter de lancer l'ensemble des tests pendant un pic de trafic sur le serveur de production : privilégier une copie temporaire du dépôt ou les heures creuses. Les tests n'ont pas besoin d'API Gemini. `release:info` lit les fichiers du serveur et calcule une empreinte locale, sans aucun appel sortant.

### Vérifier la version en ligne

Après un redémarrage Node si nécessaire :

1. Ouvrir `https://swapp.tv/api/release`. Il faut un JSON `service: swapp`, `complete: true` et `fingerprint` (64 caractères).
2. Dans le répertoire du code déployé, `npm run verify:production` doit comparer les empreintes et vérifier l'accueil, Actualité, SOCIAL, les CSS et `ads.txt`.
3. Si le résultat est `DEPLOYMENT DRIFT`, contrôler d'abord le déploiement et le cache : ne pas empiler de nouvelles règles CSS.
4. Contrôler SOCIAL sur un véritable téléphone, particulièrement la navigation pendant un long défilement.

Le fichier `e2e/swapp-mobile.spec.cjs` fournit une recette pour lancer un test Chromium manuellement **uniquement si Playwright est déjà installé localement**. Ce test n'est jamais déclenché automatiquement par GitHub. N'installez pas Chromium en production Hostinger sans avoir vérifié les ressources disponibles.

## Vérifications financières manuelles indispensables

- **GitHub → Settings → Billing & licensing → Actions** : vérifier les minutes / dépenses passées et, si nécessaire, désactiver Actions pour ce dépôt ou fixer une limite de dépenses appropriée.
- **Google AI Studio → Dashboard → Usage et Billing** : identifier les projets et clés payants. Désactiver la facturation des projets concernés ou révoquer les clés inutiles pour interrompre les appels externes ; le garde-fou dans SWAPP ne peut pas arrêter les appels réalisés par un autre service.
- **Google Cloud Billing → Reports**, avec ventilation par service (API Gemini, Firestore, Cloud Storage). Vérifier aussi les dépenses Render et Hostinger.
- Les plafonds de dépenses peuvent comporter un délai de prise en compte ; ne pas les considérer comme une garantie absolue de facturation nulle.

## Dépendances externes existantes

**SWAPP n'est pas entièrement hébergé sur Hostinger aujourd'hui.** SOCIAL appelle un service amont sur Render et certaines fonctionnalités utilisent Firestore / Google Cloud Storage. Les déplacer vers Hostinger réclame une migration planifiée avec export, sauvegarde, contrôle des données et maintien des comptes ; ne pas couper ces services brutalement.

Les routes `/api/release`, `/ads.txt` et les commandes ci-dessus ne créent pas de tâche récurrente, d'appel IA ou de service Google supplémentaire.

**État de validation** : tant que la parité Hostinger n'est pas vérifiée et le site testé sur mobile, les commits GitHub ne prouvent pas la présence du correctif en production.

## Mesure SEO gratuite (sans cookies, sans cron)

**L'empreinte des fichiers en ligne est déjà vérifiée par** `npm run verify:production`, à lancer une seule fois depuis un checkout identique à celui qui doit tourner sur Hostinger. La commande **ne déploie rien** et échoue en cas de différence ; elle ne remplace pas un test navigateur.

**Visites (approximation par journaux d'accès) :**

```sh
node tools/swapp-traffic-report.js /chemin/vers/access.log --days=30
```

- Ne nécessite **aucune API, aucun compte analytics, aucune installation npm supplémentaire**.
- Lit uniquement les journaux d'accès Apache/Nginx **déjà disponibles** (si Hostinger permet d'y accéder ou de les exporter).
- Donne les requêtes de pages par jour, rubrique et moteur de recherche référent, en écartant les ressources statiques et les robots reconnaissables.
- N'écrit pas les adresses IP, navigateurs, chemins de chaînes, paramètres d'URL ou recherches dans le rapport agrégé.
- Ce n'est **pas** un nombre de visiteurs uniques : une même personne peut provoquer plusieurs chargements. Un bloqueur, un cache, un proxy ou un journal incomplet peuvent fausser les chiffres.
- **Ne jamais transmettre ni enregistrer les journaux bruts dans GitHub ou dans un dossier public.** Les logs originaux peuvent contenir des données personnelles et restent soumis aux règles de confidentialité et de conservation.
- S'il n'existe pas de fichier de logs accessible, ce rapport **ne peut pas être produit**. Ne pas inventer des visites.

**Impressions Google/Bing :**

- Google Search Console : https://search.google.com/search-console/
- Bing Webmaster Tools : https://www.bing.com/webmasters
- Ces outils gratuits nécessitent la preuve de propriété du domaine (ou l'accès déjà accordé). Ils mesurent notamment les impressions, les clics et les requêtes de recherche. **Une lecture des logs serveur ne permet pas d'obtenir ces impressions.**
- Déclarer `https://swapp.tv/sitemap.xml`, puis contrôler séparément `/news-sitemap.xml` et `/creators-sitemap.xml`. Le sitemap ne garantit pas l'indexation.
- Ne pas activer de solution payante ou d'abonnement pour réaliser ces contrôles.

**Limite actuelle de l'automatisation :** l'accès FTP/Node hPanel de swapp.tv et les comptes Search Console/Bing ne sont pas connectés à cette conversation. Les modifications GitHub restent **non confirmées en production** tant que l'empreinte ne correspond pas.
