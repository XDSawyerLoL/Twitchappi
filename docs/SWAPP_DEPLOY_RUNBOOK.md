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
```

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
