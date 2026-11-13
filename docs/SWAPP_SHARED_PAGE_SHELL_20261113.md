# SWAPP — Socle commun et transitions de pages (13 novembre 2026)

## Diagnostic constaté dans les sources

- L'accueil immersif `/` était généré à part par `modules/swapp-catalogue-lab.js` avec son propre `<html>`, `<head>`, navigation, CSS et scripts.
- Les rubriques natives (SWAPP TV, pages éditoriales, médias, social et boutique) utilisent le moteur `modules/swapp-news/site-shell.js` et le même composant de navigation, mais leur document était composé séparément.
- Plusieurs autres routes (`/categories`, `/actus`, `/compte`, certaines chaînes) sont servies depuis `index.html`, dont le `<nav>` était **vide** lors du premier rendu ; les scripts clients le construisaient après coup.
- `@view-transition{navigation:auto}` était présent dans les pages éditoriales et la SPA, mais absent du HTML de l'accueil. En naviguant depuis/vers `/`, la transition était donc discontinue.

## Correctif architectural

1. `modules/swapp-page-shell.js` est désormais le **compositeur HTML partagé** de l'accueil et des pages natives : `<!doctype>`, liens de CSS du menu, transition native, en-tête complet et navigation mobile. Les éléments métiers restent à leur place.
2. L'accueil immersif conserve **strictement** ses affiches, ses filtres, ses rails, sa barre latérale et sa logique client ; il ne revient pas à l'ancien accueil SPA.
3. Le moteur éditorial et SWAPP TV passent par le même compositeur natif, sans réécrire leurs métadonnées SEO, feuilles de style spécialisées ni scripts de contenu.
4. `sendSwappUi()` prépare **côté serveur** les menus desktop/mobile des routes SPA via `hydrateSpaNavigation()`. Cela élimine le menu vide lors du premier affichage, avant les scripts historiques. Même règle pour les chaînes publiques et le repli du générateur SEO.
5. Un seul `assets/swapp-route-motion.css` (version `20261113-shared-shell-v2`) déclare les mêmes durées de 190 ms pour les vues SPA et la transition entre documents. Sur les navigateurs compatibles, le header desktop et le menu mobile ne se dissolvent pas entre deux pages.
6. Les événements `popstate`, les liens normaux, l'authentification, les iframes vidéo et les scripts des rubriques **ne sont pas interceptés ni démontés**. La préférence système `prefers-reduced-motion` supprime les animations.

## Limites explicites

- **Socle HTML unifié, pas encore routeur SPA universel** : les pages natives restent des documents indépendants pour leur SEO et leur chargement correct. Le navigateur effectue toujours une navigation normale ; la transition `@view-transition` fonctionne uniquement quand il la supporte (notamment les navigateurs Chromium modernes). Sinon il conserve la navigation native sans animation artificiellement retardée.
- Un problème visuel de contenu propre à une rubrique ne disparaît pas par la seule unification de son en-tête. Cette livraison préserve volontairement le design immersif de `/`.
- La fusion GitHub ne met pas à jour Hostinger. Déployer le paquet complet de `master`, **redémarrer l'application Node**, puis purger les caches HTML/CSS concernés si nécessaire.

## Contrôle de déploiement

- `/` et `/tv` doivent contenir dans leur HTML `<body ... data-swapp-shell="shared-native-v2">`.
- `/`, `/tv`, `/categories` et `/actus` doivent charger `swapp-route-motion.css?v=20261113-shared-shell-v2`.
- Le HTML **reçu directement du serveur** pour `/categories` doit contenir `<nav id="nav" class="mainNav" aria-label="Navigation principale"><div class="navGroup">` (sans attendre JavaScript).
- Tester au clavier/souris et au tactile : Accueil → Découvrir → Actualité → SWAPP TV → Accueil, bouton Retour, accès direct `/compte`, menu Plus, page de chaîne `/vnhz`, écran mobile et préférence Réduire les animations.
- `tools/swapp-deploy-smoke.js` vérifie automatiquement la présence des éléments de structure sur les routes publiques ; `test/swapp-shared-shell-transitions-20261113.test.js` protège le rendu et les comportements de navigation.
