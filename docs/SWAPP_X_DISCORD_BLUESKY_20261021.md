# SWAPP — X / Discord / Bluesky : stratégie, interface et architecture (21/10/2026)

## Interface livrée sur swapp.tv
Le module X ↔ Discord est désormais un composant réel de l'accueil, pas une image.
Il s'affiche immédiatement après les actualités du jeu vidéo et avant les directs :
- Carte X : accélérer la découverte de l'article le plus récent via la fonctionnalité officielle X de composition d'un post, sans SDK facturé ni autorisation d'un compte X du site.
- Carte Discord : prolonger la conversation ; bouton de copie réelle du lien de ce même article, avec confirmation et message d'erreur si le presse-papier est interdit.
- Message de synthèse : X pour découvrir, Discord pour échanger, SWAPP pour tout retrouver.
- Adaptation responsive, navigation au clavier, texte sélectionnable et aucun cookie tiers injecté.
- Fichiers : assets/swapp-social-bridge.js, assets/swapp-social-bridge.css, assets/swapp-home-news.js, index.html.
- Test unitaire : test/swapp-social-bridge.test.js. Les scripts et styles sont vérifiés servis par Hostinger. Le navigateur en lecture automatisée n'a pas confirmé le rendu interactif sur la page d'accueil, qui doit être validé avec l'expérience réelle.

## Discord : deux usages à ne pas confondre
1. Publication automatique d'article dans le salon via le webhook secret défini sur Hostinger : modules/swapp-news/discord-publisher.js ; le webhook ne doit JAMAIS être exposé au navigateur.
2. Faire rejoindre le serveur Discord à un lecteur de SWAPP nécessite un **lien d'invitation** discord.gg ou discord.com/invite/. Un webhook entrant ne permet pas de dériver cette URL. L'interface actuelle copie le lien d'article pour un partage individuel ; elle ne prétend pas ajouter automatiquement un utilisateur au serveur.
L'activation du serveur d'annonces est vérifiable uniquement par l'API protégée /api/editor/actus/discord/status et un message réellement reçu.

## Bluesky : correction de la décision technique
**Aucun VPS requis pour publier des posts sur un compte Bluesky existant.**
Bluesky héberge le PDS du compte via bsky.social. Le backend Node Hostinger peut publier en HTTPS :
- Login de l'application via com.atproto.server.createSession avec identifiant du compte et MOT DE PASSE D'APPLICATION, conservés en variables d'environnement privées.
- Publication d'un enregistrement app.bsky.feed.post via com.atproto.repo.createRecord, avec texte français, lien SWAPP et, après validation, une carte de lien/média approuvée.
- Idempotence par slug dans une file d'envoi, modération/validation des sources et vérification du retour URI/CID.
- Jamais de clé Bluesky dans GitHub, le navigateur, les logs ou les paramètres URL.
- Pas d'envoi effectif tant que le compte Bluesky SWAPP et ses identifiants d'application n'ont pas été configurés et testés.
- **Un VPS n'est pertinent que si l'entreprise veut auto-héberger son propre PDS AT Protocol**. Le propriétaire exclut cette option : rester sur les services Bluesky existants.

Documentation officielle :
https://docs.bsky.app/docs/tutorials/creating-a-post
https://docs.bsky.app/docs/advanced-guides/api-directory
https://github.com/bluesky-social/pds

## Encore à connecter
- La diffusion automatique X depuis le compte SWAPP nécessite une authentification X autorisée et peut être soumise aux conditions et tarifs de leur API : la fonctionnalité de partage manuel du site ne les requiert pas.
- Bluesky automatique ne nécessite pas de VPS mais exige le compte SWAPP et un mot de passe d'application privé.
- Faire entrer les lecteurs dans un Discord SWAPP nécessite une invitation publique valide, distincte du webhook privé.
- Ne jamais décrire ces automatisations non configurées comme déjà actives.


## Livraison complémentaire — parcours crédible SWAPP
L'accueil conserve son module réel X ↔ Discord, et propose maintenant aussi un lien de partage volontaire « Partager aussi sur Bluesky » via l'intention officielle bsky.app/intent/compose?text=... ; ni compte d'application SWAPP, ni VPS, ni API payante ne sont nécessaires pour que les visiteurs partagent.

Les dossiers /jeux/:slug intègrent une section « Fais vivre cet univers » regroupant :
- Partager ce jeu sur X (URL exacte du jeu) ;
- Discuter sur SWAPP SOCIAL (filtrage par jeu) ;
- Partager sur Bluesky (composition volontaire avec titre et URL) ;
- Rejoindre le Discord SWAPP UNIQUEMENT lorsque l'invitation officielle est disponible.

### Configuration des liens publics sur Hostinger
Les liens publics sont servis par GET /api/swapp/community-links après validation stricte des domaines :
- SWAPP_DISCORD_INVITE_URL=https://discord.gg/CODE_D_INVITATION : **URL PUBLIQUE d'invitation**, différente du webhook Discord déjà privé. Sans cette variable, aucun faux bouton « Rejoindre » n'est présenté ; le bouton « Copier le lien pour Discord » reste disponible.
- SWAPP_X_PROFILE_URL=https://x.com/VotreCompte (facultatif).
- SWAPP_BLUESKY_PROFILE_URL=https://bsky.app/profile/votrecompte.bsky.social (facultatif).

Configurer les variables directement dans la Web App Node Hostinger, puis redémarrer. Le site ne dévoile JAMAIS SWAPP_DISCORD_WEBHOOK_URL. Ne renseigner aucune URL de webhook dans la variable d'invitation.
Si l'API retourne discordInvite:null ou xProfile:null ou blueskyProfile:null, le profil correspondant n'est pas encore activé : c'est attendu, pas une panne du partage X ou Bluesky.

Le tableau de bord /compte > Administration > État des services expose désormais une ligne « Liens communautaires » distincte de la ligne « Discord » qui mesure la publication automatisée par webhook.

### Vérifications du 21 octobre 2026
- API publique /api/swapp/community-links répond avec les trois valeurs null ; aucun serveur Discord n'a été inventé.
- /jeux/cyberpunk-2077 et /jeux/crimson-desert répondent avec la section de partage GAME UNIVERSE.
- /assets/swapp-social-bridge.js?v=20261021-bluesky-share-v3 est servi en production et contient l'action de partage Bluesky.
- Tests dédiés : test/swapp-social-bridge.test.js et test/swapp-public-community-links.test.js.
- Le rendu complet de l'accueil en navigateur et la livraison réelle des messages webhook ne sont pas certifiés par ces contrôles de contenu ; les valider séparément avant de communiquer des taux de performance.

### Sources produit
Bluesky a officiellement publié l'URL d'intention de composition en 2024 : https://bsky.app/profile/bsky.app/post/3kmjboaopvn2f.
AT Protocol permet la publication depuis un compte hébergé sur bsky.social ; auto-héberger un PDS (qui nécessiterait une infrastructure distincte) n'est pas requis : https://docs.bsky.app/docs/tutorials/creating-a-post.
