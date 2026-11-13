# SWAPP V7 — partage X, images sociales et flèches de rails
Date : 13 novembre 2026.

## Parcours corrigés
- Accueil catalogue / et laboratoire /catalogue-test : lien explicite « Partager sur X ».
- Liste ACTUS et lecteur SPA : lien https://x.com/intent/tweet avec titre et URL canonique de l'article.
- Article natif : barre X/Bluesky conservée ; un ancien handler n'intercepte plus les clics dans la barre.
- Ancien partage natif navigator.share supprimé des parcours articles et du module FLASH. Publication à confirmer manuellement sur X.
- Flèches discrètes gauche/droite superposées aux rails, masquées en fin de liste. Défilement au survol et tactile conservés.

## Prévisualisation des images X et Bluesky
- Articles publiés : og:image, og:image:secure_url, og:image:alt, twitter:card=summary_large_image, twitter:image, twitter:title et twitter:description directement dans le HTML SSR.
- Image propre à l'article : https://swapp.tv/actus/og-image/<slug>.
- Illustration officielle JPEG/PNG récupérée sur une liste de sources approuvées : miniatures YouTube, PlayStation Blog, Google Blog et NVIDIA Blog.
- Pas de redirection, pas d'URL privée ni de média dépassant 4,5 Mo. Délai réseau limité à 3 secondes par tentative.
- Si la source échoue, génération locale d'un PNG SWAPP 1200×630 titré, sans API payante ni stockage.
- Un article brouillon ou retiré ne reçoit pas d'image sociale.

## Vérification après déploiement Hostinger
Commande : node tools/swapp-share-preview-smoke.js
Ce contrôle interroge des articles publiés avec un User-Agent Twitterbot/1.0, vérifie le HTML SSR, les URLs OG et le contenu image.
Si la page ou l'image répond HTTP 403, vérifier Hostinger WAF / anti-bot. Autoriser les robots légitimes sur les GET publics /actus/<slug> et /actus/og-image/<slug>. Le code Node ne peut pas contourner un blocage appliqué par l'hébergeur.

## Limitations
- Une fusion GitHub ne vaut pas déploiement Hostinger.
- Les réseaux sociaux décident quand actualiser les cartes mises en cache : une image ancienne peut persister après correction.
- Les utilisateurs doivent confirmer eux-mêmes leur publication sur X.
