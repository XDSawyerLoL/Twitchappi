# SWAPP SOCIAL — GIFs intégrés

## Fonctionnement

- Le compositeur SOCIAL affiche **GIFs** à la place de **Image par URL**.
- La palette, à disposition dans le compositeur, contient 12 animations originales SWAPP (GG, GG WP, LOL, WOW, RIP, HYPE, CLUTCH, LFG, EZ, AFK, NOPE, NICE). Elles sont servies directement par Node Hostinger : aucun compte GIPHY ni service externe n'est nécessaire.
- Rechercher par intitulé ou mot-clé (ex. \`victoire\`, \`rire\`, \`hype\`) et sélectionner l'animation en un clic. L'aperçu existant permet de la retirer.
- Une publication peut contenir seulement un GIF, ou un texte et un GIF.
- Le format s'adapte automatiquement au fil mobile/ordinateur, sans recadrage destructif et sans second module de publication.
- Tous les posts et GIFs restent soumis à la connexion SWAPP unique.

## Option GIPHY

Le serveur reconnaît déjà \`GIPHY_API_KEY\` (voir \`.env.example\`). **Optionnel.** Lorsqu'une clé est configurée sur Hostinger, une recherche GIPHY limitée peut compléter les créations SWAPP. La clé ne passe jamais dans le navigateur.

La clé GIPHY de développement (beta) est gratuite dans les limites de 100 appels par heure, conformément à la documentation du fournisseur. Ne pas activer de clé « production » payante sans décision explicite du propriétaire du site. L'interface mentionne « Powered by GIPHY » dès qu'elle affiche des GIFs de cette provenance.

## Contrôles

- \`node --test test/swapp-social-responsive-gifs.test.js\`
- \`npm run verify:production\` vérifie la version des ressources et les endpoints GIF sur \`swapp.tv\`.
- Un ancien déploiement Hostinger peut servir des ressources obsolètes ; vérifier les routes publiques avant d'affirmer que c'est en ligne.

## API interne

- \`GET /api/swapp/social/gifs?q=lol\`
- \`GET /api/swapp/social/gifs/sticker/gg.gif\`

Aucun service de recherche externe n'est nécessaire pour les GIFs natifs. Les GIFs issus de GIPHY, eux, sont chargés depuis son CDN par le navigateur et sont identifiés comme tels.
