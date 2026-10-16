# SWAPP — Vérification SOCIAL mobile et AdSense ads.txt

## SOCIAL (mobile)

Les écrans de la communauté doivent conserver, dans cet ordre :
1. En-tête SWAPP collé en haut (68 px).
2. En-tête SOCIAL collé sous SWAPP (60 px).
3. Barre des cinq icônes SOCIAL fixée à 128 px du haut (55 px).
4. Onglets du fil « Récent / Pour vous / Actualité SWAPP » collés sous les icônes (183 px).

Un élément `swapp-social-mobile-spacer` occupe les 55 px de la barre d'icônes dans le flux HTML : lorsque le bandeau d'accueil est masqué, les onglets et les posts ne doivent pas se trouver sous la barre fixe.

Contrôle visuel sur téléphone : défiler de 3 écrans, changer de fil, ouvrir les messages et revenir. L'en-tête et les icônes doivent rester visibles et aucun texte ne doit être recouvert. Refaire le contrôle en mode paysage et dans une fenêtre de plus de 920 px pour exclure les régressions bureau.

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
