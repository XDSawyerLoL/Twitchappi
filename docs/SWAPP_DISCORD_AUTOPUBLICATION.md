# SWAPP — Annonces Discord automatiques après publication

## Objectif
Chaque nouvelle actualité native SWAPP (article Studio ou publication automatique de la veille) génère **une annonce Discord par slug**. Le message contient un texte d'accroche, une illustration réelle du jeu ou miniature de vidéo officielle, un résumé, un titre et le lien canonique SWAPP. Pas de publication de brouillons, d'article retiré, d'annonce lors d'une simple correction, ni de ping @everyone.

## Activation unique sur Hostinger
1. Dans Discord, ouvre le serveur cible → **Paramètres du serveur → Intégrations → Webhooks → Nouveau webhook**.
2. Nomme-le « SWAPP · Actualités », choisis un salon textuel dédié, par exemple **#actus-swapp**, puis **copie l'URL du webhook**.
3. Dans les **variables d'environnement privées** de l'application Node SWAPP sur Hostinger, ajoute :
   - SWAPP_DISCORD_WEBHOOK_URL : URL complète du webhook Discord, du format https://discord.com/api/webhooks/ID/TOKEN
   - SWAPP_DISCORD_ENABLED : true (facultatif, activé par défaut si URL valide).
   - NODE_ENV doit déjà être production ; ne pas modifier sans raison.
4. Enregistre les variables et redémarre l'application Node SWAPP. Ne copie jamais l'URL du webhook dans GitHub, un article, une capture ou un canal public.
5. Depuis un compte rédacteur autorisé, consulte GET /api/editor/actus/discord/status : configured:true, webhookValid:true, enabled:true. Le secret n'est jamais affiché.
6. Publie un **nouvel** article depuis le Studio ou le manifeste de veille. Vérifie le salon Discord et la collection swapp_news_discord_outbox : status:sent, messageId renseigné.
7. Si l'URL fuite, révoque le webhook Discord et remplace la variable privée dans Hostinger.

## Fonctionnement
- Chaque nouvelle publication crée un événement dans la file Firestore swapp_news_discord_outbox, status:pending. Cette file est distincte de swapp_news_outbox, qui conserve les autres canaux désactivés.
- L'événement est enregistré dans la **même transaction** que l'article du Studio ou que la première adoption d'un article issu de data/swapp-editorial-releases.json. Un article déjà présent, modifié ou retiré ne déclenche pas de nouvelle annonce.
- Le worker s'exécute sur l'application Node Hostinger sans service supplémentaire. Il reprend les événements en attente au démarrage, se déclenche après publication et recontrôle les échecs à intervalle de 5 minutes via un minuteur Node, sans nouveau cron.
- Un verrou transactionnel protège chaque envoi. Discord est appelé avec wait=true ; seul un messageId retourné est considéré comme délivré. En cas de panne ou de HTTP 429/5xx, une nouvelle tentative est différée. Une réponse d'authentification incorrecte bloque la tâche.
- Le worker vérifie juste avant l'envoi que l'article est toujours publié. Les messages sont envoyés avec allowed_mentions parse vide : aucune notification générale.
- Les trois articles historiques Cyberpunk 2077, Crimson Desert et Ordinary Oddness, déjà éditables dans le CMS, **ne sont pas republiés automatiquement** lors de cette installation.

## Sécurité et limites
- Ne pas utiliser l'intégration GitHub→Discord /github : elle notifierait tous les commits, pas uniquement les nouveaux articles.
- Anti-doublons transactionnel, mais Discord n'offre pas de clé d'idempotence standard : après une panne réseau ambiguë, un doublon ponctuel reste possible.
- Aucun nouveau prestataire payant. Les lectures Firestore sur l'infrastructure existante restent soumises aux quotas et tarifs de cette infrastructure.
- La veille ne détient jamais le secret Discord ; seul le processus Node Hostinger le lit.
- Pour désactiver : SWAPP_DISCORD_ENABLED=false puis redémarrer Hostinger. Les messages Discord déjà envoyés restent visibles.
- Tests : node --test test/news-discord.test.js test/news-router.test.js test/news-editorial-release.test.js ; npm run check.
