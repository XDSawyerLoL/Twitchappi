# SWAPP — menu du compte unifié (16 novembre 2026)

## Objectif
Les captures de l'utilisateur montraient deux menus différents : sur `/actus` le compte affichait une connexion Twitch directement dans le menu, tandis que SWAPP TV présentait moins d'actions et aucun contrôle de recommandations locales. Tous les en-têtes partagent désormais les **mêmes choix et la même présentation**, sans modifier le système de sessions existant.

## Source de vérité
- `assets/swapp-account-unified.js` construit les actions, le panneau « Apparence » (palette, couleur personnalisée, réinitialisation) et « Recommandations locales » (paramètres conservés uniquement sur l'appareil). Aucune communication réseau n'est ajoutée pour ces préférences.
- `assets/swapp-account-menu.js` est seulement l'adaptateur SPA : il remplace, après chaque rendu de l'ancienne fonction `renderUserMenu()`, son contenu par le composant commun. La **liaison / déconnexion Twitch ne figure plus dans le menu global**. Elle reste gérée dans `/compte` par le rendu des paramètres du compte.
- `assets/swapp-nav-session.js` est l'adaptateur des pages natives. Il réutilise le composant commun et récupère la session SWAPP sur `/api/oryon/session`. Il ne crée pas de nouvelle session et bloque une seconde initialisation si le document inclut déjà le script.
- `assets/swapp-native-account.css` contient désormais le style du menu pour les deux familles de pages, y compris mobile et clavier.
- `index.html` charge le composant avant `index_script.js` afin qu'aucun bouton de liaison Twitch ne puisse apparaître pendant le rendu initial.
- `modules/swapp-page-shell.js` et `modules/swapp-news/article-core.js` chargent le composant sur les documents natifs et les articles. Les pages qui fournissaient déjà le contrôleur natif restent protégées du double montage.
- `tools/swapp-hostinger-package.js` impose la présence des nouveaux fichiers dans le ZIP ; `tools/swapp-release.js` les inclut dans l'empreinte de version.

## Menu connecté
1. Nom du compte connecté
2. **Mon espace SWAPP** (ouvre `/compte`)
3. **Diffuser** (garde la navigation SPA vers le gestionnaire quand il est présent ; accès au compte sur les pages natives)
4. **Se déconnecter** (session locale SWAPP ou session Twitch seule, sans bouton de liaison Twitch)
5. **Apparence** (mêmes couleurs, personnalisée, réinitialisation)
6. **Recommandations locales** (activation, effacement, réglages privés)

Le menu invité conserve **Se connecter**, **Créer un compte SWAPP**, **Apparence** et **Recommandations locales**. Les intégrations Twitch et Discord restent sur `/compte`, et non dans la navigation générale.

## Contrôles avant diffusion
- Vérifier compte local, Twitch seul et invité sur `/`, `/actus`, `/tv`, `/serveurs`, `/explorer`, `/compte` et un article `/actus/:slug`.
- Vérifier que le menu est strictement identique et que l'option « Connecter Twitch » ne figure **que dans `/compte`**, sans bannière ou menu résiduel sur la navigation.
- Vérifier les touches Échap, clic hors menu, activation clavier, palettes et persistance d'une couleur à travers un changement de document.
- Vérifier l'accès aux recommandations locales et leur effacement sur toutes ces pages. Leur stockage demeure local, facultatif et limité à trente jours.
- Exécuter `node --test test/swapp-unified-account-dropdown-20261116.test.js test/swapp-native-account-appearance-20261114.test.js test/swapp-ux-regressions.test.js test/swapp-private-discovery.test.js` et, si l'environnement le permet, `npm test`.
- Déployer le commit fusionné sur Hostinger et vérifier `/api/release`, la version des scripts et la navigation réelle. Une fusion GitHub n'est pas un déploiement.

Aucun nouveau service, abonnement, API payante ou VPS n'a été ajouté.
