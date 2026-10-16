# SWAPP — Validation de SOCIAL mobile et AdSense ads.txt

## SOCIAL : nouvelle architecture de navigation (16/10/2026)

Le précédent assemblage de plusieurs barres `sticky` / `fixed` n'est plus utilisé sur téléphone. Les trois éléments sont regroupés dans `.swapp-social-sticky-stack` : **un seul bloc fixe sous l'en-tête SWAPP**, avec un espace réservé qui suit automatiquement sa hauteur, y compris quand les onglets sont masqués.

La nouvelle disposition mobile est :
1. Barre générale SWAPP : 68 px.
2. Bandeau SOCIAL compact : 48 px (hauteur adaptée si nécessaire).
3. Navigation des cinq icônes : 54 px, toujours visible avec le bandeau.
4. Choix du fil : 48 px lorsqu'on est sur l'accueil SOCIAL. Masqué dans les autres rubriques.

La pile est située avant le bandeau de bienvenue. Le fil dispose d'une marge de défilement qui évite de masquer les premiers messages après une sélection de rubrique.

### Améliorations UX

- Bandeau de bienvenue plus court pour accéder plus vite aux messages.
- État actif de la navigation davantage visible.
- Actions des publications adaptées au doigt, typographie plus lisible.
- Recherche accessible sur mobile depuis **Explorer** avec saisie et bouton, même si le panneau latéral desktop est masqué.
- Si le service de recherche échoue, le formulaire reste présent et le lecteur peut réessayer.
- Lors d'un clic sur une rubrique/un fil, SWAPP replace volontairement le contenu sous la navigation ; aucun défilement automatique durant la lecture ordinaire.

### Vérifications à effectuer sur téléphone réel

Sur `https://swapp.tv/communaute` :
- Défiler lentement puis rapidement sur plusieurs écrans. Le bandeau SOCIAL et ses cinq icônes doivent rester visibles sous le header SWAPP.
- Passer de « Pour vous » à « Actualité SWAPP » puis « Explorer » et « Messages ». Aucun recouvrement des cartes, aucun retour de la barre mobile en bas de page.
- Effectuer une recherche en mode portrait, puis en paysage. Vérifier que l'entrée reste disponible après erreur réseau.
- Vérifier que le menu SWAPP inférieur conserve son propre défilement et que SOCIAL ne le remplace pas.
- Vérifier ordinateur/tablette : les zones latérales doivent rester intactes hors du mode mobile.

### Condition préalable : vérifier le déploiement réel

Le site repose sur `app.js` (serveur Node démarré avec `npm start` sur Hostinger). Un commit GitHub **ne prouve pas** que Hostinger a chargé la nouvelle version. Il faut confirmer la synchronisation de la branche, redémarrer le processus Node si la méthode d'hébergement l'exige, puis s'assurer que la page renvoie les nouvelles références :
- `social-swapp.css?v=20261016-social-fixed-10`
- `app.js?v=20261016-social-fixed-js-10`

Si ces références manquent, le problème immédiat est le déploiement ou le cache, **pas** la nouvelle règle CSS. Vérifier aussi l'URL sans proxy/service worker avant de conclure à une régression.

## AdSense ads.txt

Déclaration officielle conservée dans `/ads.txt`, également renvoyée sans dépendance au fichier physique par `GET /ads.txt` sur le serveur Node :

```text
google.com, pub-6082969821681414, DIRECT, f08c47fec0942fa0
```

### Vérifier après déploiement Hostinger

L'URL suivante doit renvoyer **200 OK**, un corps en texte brut contenant exactement la ligne ci-dessus et un `Content-Type: text/plain` :

- `https://swapp.tv/ads.txt`
- `https://www.swapp.tv/ads.txt` (réponse correcte ou redirection vers l'URL canonique)
- `http://swapp.tv/ads.txt` (une redirection vers HTTPS est attendue)

Si la page renvoie le HTML de SWAPP, une 404, une 403, une 5xx ou une page Hostinger, vérifier d'abord la cible DNS, les redirections www/apex, les règles du serveur frontal et le déploiement de `app.js` / `server.js`. Le code Node ne contrôle pas les réponses interceptées par le proxy ou le domaine.

Dans **Google AdSense → Sites → swapp.tv → Rechercher des mises à jour**, déclencher un nouveau contrôle après validation HTTP. **« En préparation »** (revue du site) est indépendant du statut **« Introuvable »** (dernier passage de vérification ads.txt). Une prise en compte peut nécessiter plusieurs jours, parfois davantage si le site reçoit peu de demandes publicitaires.

Ne pas supprimer/réajouter le domaine dans AdSense pour tenter de forcer la validation. Pas d'annonces invasives ni de modifications des politiques de consentement dans ce chantier.

## Tests

`node --test test/swapp-social-ads-txt-stability.test.js` couvre la route ads.txt, la ligne vendeur, le rendu de SOCIAL et la structure CSS. Ces tests sont des vérifications de dépôt, **pas une preuve de disponibilité DNS ou HTTP en production**.
