# SWAPP — Déploiement contrôlé (Hostinger)

> Objectif : une modification GitHub ne doit plus être annoncée comme « en ligne » tant que la version réellement servie sur `https://swapp.tv` n'a pas été identifiée et testée.

## 1. Contrôle du code (GitHub)

Le workflow `.github/workflows/swapp-quality.yml` tourne sur les pushes et PR de `master` :
- `npm ci --ignore-scripts`
- `npm run check`
- `npm test`
- `npm run release:info`

**Un commit sans résultat Actions ne doit pas être déclaré validé.** Attention aux quotas ou droits GitHub Actions : si le workflow ne démarre pas, les tests ne sont pas exécutés.

Le script `tools/swapp-release.js` calcule une empreinte SHA-256 stable à partir des fichiers essentiels de SWAPP. L'empreinte change dès que le serveur, la navigation, l'interface SOCIAL, les styles mobiles, l'accueil ou `ads.txt` diffère. Elle ne dépend pas de la présence du dossier `.git` sur l'hébergement.

## 2. Déploiement Hostinger

Application Node : **`app.js`** (démarrage : `npm start`).

Après chaque push :
1. Vérifier que Hostinger a effectivement reçu les fichiers du commit voulu et que la branche source correspond à `master`.
2. Mettre à jour l'application Node ; si le déploiement n'assure pas un redémarrage automatique, **redémarrer le processus Node** depuis Hostinger.
3. Ouvrir `https://swapp.tv/api/release`. La route doit renvoyer HTTP **200**, `service: swapp`, `complete: true` et une empreinte `fingerprint` de 64 caractères hexadécimaux.
4. Dans **le même checkout que celui à déployer**, lancer `npm run verify:production`. Le script compare l'empreinte distante à celle du dépôt puis teste `/ads.txt`, `/communaute`, les fichiers CSS SOCIAL, `/` et `/actus`.
5. Lancer manuellement **GitHub → Actions → SWAPP quality and deployment parity → Run workflow**, option **verify_production** activée. Elle lance d'abord les tests, ensuite le contrôle de version, enfin deux scénarios Chromium en mobile avec captures à télécharger dans les artifacts du workflow.

Les jobs de navigateur sont volontairement manuels et réservés au **post-déploiement** : un push GitHub ne prouve pas que Hostinger a déployé au même instant.

Si le contrôle renvoie `DEPLOYMENT DRIFT`, conserver le correctif GitHub, vérifier le dossier de déploiement Hostinger, la version chargée, le proxy et les éventuelles copies en cache. Ne pas empiler une nouvelle correction CSS sans avoir rétabli la parité.

### Distinguer les erreurs

| Résultat | Interprétation |
| --- | --- |
| `/api/release` renvoie du HTML, 404 ou 503 | Le serveur chargé n'est pas complet, la route est absente, ou le frontal intercepte les requêtes |
| Réponse 200 mais empreintes différentes | Les fichiers Hostinger ne correspondent pas au checkout testé |
| Empreinte identique, test mobile en échec | Bug réel côté interface/CSS/JS : diagnostiquer le scénario navigateur |
| Empreinte identique, tous les tests réussissent | Code et tests vérifiés à cet instant (ne prouve pas l'absence de tout défaut) |
| Pas de résultat GitHub Actions | Aucun succès de CI ne peut être affirmé |

## 3. Critères d'acceptation SOCIAL sur téléphone

Sur largeur 390 CSS px :
- L'en-tête général SWAPP reste visible ; la pile compacte SOCIAL reste immédiatement dessous.
- Un long défilement ne déplace pas la pile ni les onglets du fil au-dessus des publications.
- Le bandeau utilise la hauteur réelle du header SWAPP, mesurée par `ResizeObserver` ; aucune écoute permanente du scroll.
- Explorer affiche une recherche utilisable (même après une erreur réseau).
- Le menu principal SWAPP en bas reste visible et distinct de la navigation SOCIAL.

Le scénario est dans `e2e/swapp-mobile.spec.cjs`. Exécution locale facultative :

```bash
npm install --no-save @playwright/test@1.56.0
npx playwright install chromium
npx playwright test e2e/swapp-mobile.spec.cjs --reporter=line
```

## 4. AdSense

La route `/ads.txt` doit retourner **exactement** :

```text
google.com, pub-6082969821681414, DIRECT, f08c47fec0942fa0
```

Le vérificateur contrôle la ligne et `Content-Type: text/plain`, mais **ne valide pas** l'approbation AdSense ni les délais d'exploration de Google.

## 5. Sécurité et confidentialité

- L'API de version ne divulgue pas de variables d'environnement ni de contenu source, seulement un hash, le nombre de fichiers et le SHA Git optionnel `SWAPP_GIT_SHA` s'il est défini.
- Les contrôles navigateur sont réalisés en visiteur non connecté.
- Aucun script tiers de suivi ajouté pour la validation.
- Les identifiants Hostinger, GitHub et AdSense ne doivent jamais être introduits dans les fichiers versionnés.
