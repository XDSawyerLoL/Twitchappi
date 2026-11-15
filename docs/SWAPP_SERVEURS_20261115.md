# SWAPP Serveurs — annuaire communautaire natif (15 novembre 2026)

## Objectif
Ajouter à SWAPP un annuaire de serveurs par jeu, inspiré de la logique publique de top-serveurs.net mais sans reprise de son code, de ses données ou de sa marque. Page \`/serveurs\`, lien depuis \`/explorer\`. Accessible avec l'en-tête SWAPP natif et un fond noir.

## Fonctionnalités écrites dans le dépôt
- Recherche par nom, description, jeu et tags ; tri par votes du mois, récence ou nom.
- Fiches réelles ajoutées par des comptes SWAPP existants, sans faux serveurs préchargés.
- Soumission gratuite (cinq fiches maximum par compte), description d'au moins 30 caractères, HTTPS requis pour le site et la bannière. Les coordonnées valides permettent une publication immédiate ; pas de file d'approbation générale.
- Modération par compte administrateur ID fixé dans \`ORYON_ADMIN_USER_IDS\`, avant publication. Le panneau de modération n'est visible que par ce compte.
- Votes serveur par compte SWAPP, renouvelables au bout de deux heures. L'historique des votes éligibles est comptabilisé dans le classement mensuel ; transactions MySQL avec verrou sur la ligne du dernier vote.
- Aucun nombre de joueurs connectés, latence, état en ligne, avis ou récompense de plugin inventés. Aucun accès à l'API Top-Serveurs.

## Infrastructure
Le module \`modules/swapp-servers.js\` utilise \`mysql2/promise\` et la base MySQL Hostinger EXISTANTE, par \`SWAPP_MYSQL_URL\` ou \`SWAPP_SERVERS_MYSQL_URL\`. Aucun VPS ni API payante. Trois tables créées de manière idempotente : \`swapp_game_servers\`, \`swapp_game_server_votes\`, \`swapp_game_server_vote_events\`. Secrets uniquement dans les variables privées Hostinger. Une application sans base MySQL renvoie 503 explicite : elle ne simule aucun classement.

## Sécurité et intégration
- Vote et création exigent une session \`req.session.oryonUser.id\` et une origine de confiance.
- Modération exige l'ID admin épinglé dans \`ORYON_ADMIN_USER_IDS\` (pas le pseudonyme seul).
- Requêtes SQL paramétrées ; tailles limitées, HTML échappé côté serveur et textes injectés avec \`textContent\` côté client.
- URLs externes HTTPS autorisées seulement après validation, liens externes en \`noopener noreferrer nofollow\`.
- Pas de comptes SWAPP supplémentaires, pas de migration ou de modification de SWAPP SOCIAL, NEWS ou LIVE.
- Déploiement : intégrer les commits dans le paquet Hostinger actuel, démarrer Node avec MySQL et vérifier \`GET /api/swapp/serveurs\`, \`GET /serveurs\`, formulaire avec compte authentifié, modération et deux votes espacés de deux heures.
- Ne pas présenter \`/serveurs\` comme en production avant vérification publique réelle.

## Évolutions non réalisées
Monitoring réel des serveurs par protocole, avis avec modération, statistiques historiques avancées, votes de plugins (ex. Votifier), système antifraude multi-comptes renforcé. Ces fonctionnalités nécessitent des implémentations et tests supplémentaires : ne pas les annoncer comme disponibles.


## Extension graphique et SEO du 15 novembre
- Page /serveurs : trois univers en vedette (GTA V/FiveM, Minecraft, Rust), grille de 34 catégories réelles, filtre de jeux et portraits de jeu pertinents.
- Fonds illustrés depuis des pages de jeux Steam (CDN Steam) ; Minecraft utilise la couverture de la catégorie Minecraft Twitch/IGDB. Une bannière de serveur déclarée par son propriétaire a priorité sur la couverture du jeu ; en cas d'échec, le visuel du jeu correspondant sert de recours. Aucune image d'un autre jeu ne doit être réutilisée.
- Comptages par catégorie issus des fiches validées SQL : `SELECT game, COUNT(*) ... WHERE status="published"`. Un compteur inconnu n'est jamais présenté comme zéro.
- Pages de jeu partageables : `/serveurs/minecraft`, `/serveurs/gta-rp`, etc. Les URL sont construites à partir du catalogue autorisé, pas d'une saisie libre.
- Fiches publiques individuelles : `/serveurs/<jeu>/<fiche>`, accessibles uniquement pour les serveurs approuvés ; description, couverture, adresse, lien de connexion, région, nombre de votes du mois et bouton de vote.
- `/serveurs` et `/explorer` ajoutés au sitemap public.
- Les images distantes restent la propriété des ayants droit ; leur disponibilité et leurs conditions d'utilisation doivent être recontrôlées avant le déploiement.

## ACTUS — correction des bandes latérales
Quand `#actus.view.active` est affiché, la page entière (`html`, `body`, `main.app` et `#actus`) a un fond `#030405` sans image de fond. Cela ne modifie ni la bande-annonce animée de la bannière ni les illustrations des articles. Le correctif est dans `assets/swapp-actus-app.css`.

## Vérifications effectuées
Les fichiers JavaScript du backend, de la galerie, du lecteur de fiche, des pages Explorer et du serveur ont passé une vérification de syntaxe. Les éléments HTML générés ont été contrôlés en exécution isolée avec dépendances simulées : 34 jeux, 35 cartes de filtres (avec la catégorie générale), rubriques illustrées, URL canoniques par jeu, détail d'un serveur Rust, routes GET/POST et fond noir d'ACTUS.

**Non vérifié** : lecture effective d'images sur tous les navigateurs, enregistrement SQL, votes réels, session administrateur sur Hostinger et mise en production. Ne pas décrire ces opérations comme accomplies.


## Validation automatique et notifications administrateur (15 novembre, mise à jour)
- Discord : vérification de l'invitation publique via \`GET https://discord.com/api/v10/invites/{code}?with_counts=true\` (host fixé côté serveur, HTTPS uniquement, pas de requête vers une URL fournie librement par un utilisateur). Seule une invitation **de guild Discord** valide, non expirée et renvoyant un vrai \`guild.id\` entraîne \`status=published\` automatiquement pour la catégorie \`Discord / Multigaming\`.
- La vérification d'une invitation ne prouve pas la propriété du serveur, ni la sûreté du contenu. Si Discord est indisponible, rate-limité ou ne confirme pas l'invitation, la fiche reste \`pending\`. Les serveurs non Discord restent à modérer.
- Les demandes Discord préexistantes en attente sont revues côté Node au démarrage puis toutes les cinq minutes, en lots bornés de 12 avec pagination et une seule révision concurrente par instance. Aucun VPS ni API payante.
- Les comptes SWAPP suivent leurs soumissions via \`GET /api/swapp/serveurs/mes-fiches\`, statuts visibles dans « Mes serveurs ».
- Autorisation de modération : même règle que les éditeurs et la boutique de SWAPP : \`isOryonAdmin(req) || isAdminTwitchUser(req.session?.twitchUser)\`, associée à la session SWAPP restaurée de façon fiable. Aucun droit n'est donné par un simple pseudo affiché.
- La demande administrative est visible en haut du classement. La route privée \`GET /api/swapp/serveurs/moderation/count\` est interdite aux non-administrateurs.
- Le script global \`assets/swapp-servers-alerts.js\` ajoute une pastille de demande à valider à SERVEUR +, une entrée dans le menu de compte et un raccourci sur la page Compte, sans changer le système de notifications des autres modules. La vérification est renouvelée environ toutes les 90 secondes quand l'onglet est visible.
- La validation manuelle existe toujours en solution de repli; les administrateurs peuvent approuver ou refuser.
- Variables : \`SWAPP_MYSQL_URL\` ou \`SWAPP_SERVERS_MYSQL_URL\`. Le traitement périodique peut être désactivé par \`SWAPP_SERVERS_AUTO_REVIEW=0\`. Aucun secret Discord requis pour lire une invitation publique.
- Le paquet Hostinger exige désormais aussi \`modules/swapp-servers-discord.js\`, \`assets/swapp-servers-alerts.js\` et \`assets/swapp-servers-alerts.css\`.
- Après déploiement, faire un test en production avec une invitation Discord réelle et la session administrateur ; il est impossible de confirmer les données MySQL/les demandes actuelles depuis le dépôt GitHub. Ne pas présenter les anciennes fiches comme publiées avant contrôle réel.


## Fiche serveur immersive V6 — inspirée par la fiche Project R
Source étudiée : https://top-serveurs.net/cyberpunk-2077/project-r-cyberpunk-fr (15 novembre 2026).
Le modèle SWAPP reprend **les fonctionnalités observées**, pas la marque, le HTML, les photographies ou le contenu du site tiers.

- Nouvelle fiche server-rendered via \`modules/swapp-servers-profile.js\` et \`assets/swapp-servers.css\`, avec grande illustration du jeu/serveur, voile noir protecteur du texte, hiérarchie typographique, numéro de classement s'il est calculé, tags, votes/visites/avis et boutons d'action.
- Navigation interne : Présentation, Caractéristiques, Statistiques, Avis, Voter ; mise en page 2 colonnes avec panneau de caractéristiques et intégration mobile.
- Contenu : description du propriétaire échappée en HTML, paragraphes conservés, image propriétaire facultative, lien de sortie HTTPS validé ; aucun texte de Project R copié.
- Statistiques réelles de SWAPP : votes journaliers (7 j), hebdomadaires (8 semaines), mensuels (12 mois), totaux enregistrés, visites enregistrées par clic sur le lien externe. Aucune population en ligne/slots inventée. Seules les interactions réellement enregistrées après mise en service figurent dans les stats : pas de reprise historique de Top-Serveurs.
- Tables supplémentaires créées à l'initialisation : \`swapp_game_server_click_events\`, \`swapp_game_server_reviews\` avec clé unique par compte et par serveur. Aucun identifiant de visiteur n'est écrit dans l'historique des clics. Un limiteur de clics bref et éphémère en mémoire réduit la manipulation automatique des compteurs.
- Avis : notation staff/ambiance/disponibilité de 1 à 5, commentaire de 40–1200 caractères, compte SWAPP connecté obligatoire. Un avis par compte et serveur. Enregistrement au statut \`pending\` : jamais de publication directe.
- Modération : endpoints réservés aux administrateurs SWAPP pour approuver/refuser les avis. Les demandes d'avis s'affichent dans le panneau SERVEUR + avec les serveurs en attente ; le compteur d'administration inclut les deux types de demandes.
- Fichiers nouveaux : \`modules/swapp-servers-profile.js\`, \`modules/swapp-servers-stats.js\`, \`assets/swapp-servers-review-admin.js\`, tests \`test/swapp-server-profile-20261115.test.js\`.
- Déploiement Hostinger : reconstruire depuis le commit incluant les nouveaux modules, laisser le backend créer ses deux tables, vérifier les migrations, puis tester la fiche réelle publiée, le vote, le clic sortant, les deux files de modération et les graphes.
- **Non validé en production** : tests complets sous Node, MySQL Hostinger, permissions CREATE TABLE, CDN d'illustrations, modération du premier avis et déploiement public. Les résultats manquants doivent rester absents ou marqués « Non mesuré ».


## Correction : publication immédiate et disparition du panneau « Mes serveurs » (15/11)
- Le bloc de suivi « Mes serveurs » est supprimé du classement (HTML, JavaScript, CSS). La confirmation de création contient directement le lien vers la fiche publiée.
- Minecraft et les autres catégories de jeux non-Discord : publication immédiate si le jeu est reconnu, que la description est valide, et qu'au moins une coordonnée de contact est correcte (URL HTTPS ou adresse d'hôte avec port facultatif). Aucun ping réseau n'est effectué et l'état « en ligne » n'est jamais inventé.
- Discord / Multigaming : publication immédiate **uniquement si** l'API de Discord confirme une invitation de serveur valide. Une invitation invalide ou l'indisponibilité de Discord renvoie une erreur explicite ; aucune nouvelle demande bloquée en `pending` n'est créée.
- Les **anciennes** fiches en attente sont réexaminées automatiquement au démarrage Node (1,5 s) puis toutes les cinq minutes, y compris Minecraft. Les fiches dont les coordonnées demeurent incorrectes ne sont pas publiées automatiquement.
- Les contrôles existants restent actifs : session SWAPP requise, vérification d'origine, 5 fiches au maximum par compte, protection contre l'injection HTML et liens soumis en HTTPS.
- Aucun déploiement ni état MySQL réel n'est confirmé par la seule modification du dépôt : l'inscription Minecraft déjà déposée se débloquera sur l'instance Hostinger après mise en production et exécution de la réconciliation, si ses données sont valides.


## Refonte du parcours de création — page complète, pas de modale
Référence fonctionnelle examinée : https://top-serveurs.net/discord/server/create, le 15 novembre 2026. Les sections observées sont « Informations de base », « Configuration » (types), « Serveurs vocaux & réseaux sociaux » (identifiant Discord), « Informations supplémentaires » (Twitch) et « Compte ». SWAPP utilise son propre design noir/cyan et conserve le compte SWAPP existant plutôt que de dupliquer les identifiants et mots de passe.

- \`/serveurs/creer\` ouvre une page dédiée. \`/serveurs/discord/creer\` redirige vers cette page en sélectionnant Discord ; \`/serveurs/:jeu/creer\` préselectionne un jeu du catalogue autorisé. Les liens « Référencer mon serveur » de l'annuaire pointent désormais vers cette page ; l'ancienne boîte de dialogue est supprimée (y compris ses gestionnaires JavaScript).
- Formulaire : nom, jeu, langue, description, site optionnel, catégories multiples (6 maximum), code ou lien Discord (catégorie Discord), adresse de connexion (autres jeux), URL de bannière optionnelle, nom de chaîne Twitch, région et confirmation d'autorisation. Les catégories sont proposées sous forme de sélection claire et un aperçu de fiche se met à jour en direct.
- Le code Discord peut être un ID seul, un lien complet \`https://discord.gg/\`, un lien \`discord.com/invite/\` ou un lien sans protocole. Un résultat d'invitation Discord confirmé par l'API officielle est nécessaire pour publier cette catégorie ; les autres jeux sont publiés après contrôle du format des coordonnées (pas après un faux ping « en ligne »).
- Données persistées de façon atomique : fiche dans \`swapp_game_servers\` et informations complémentaires dans \`swapp_game_server_extras\` (langue, Twitch, site indépendant, ID Discord vérifié). MySQL Hostinger crée cette table avec la même base et les mêmes secrets ; aucune API payante ni VPS.
- Si le compte possède déjà une fiche du même nom et du même jeu, le formulaire met à jour la fiche existante et conserve son URL au lieu de créer un doublon. Une fiche anciennement refusée n'est pas réactivée automatiquement.
- Le site et la chaîne Twitch saisis sont visibles dans la fiche publique, avec liens HTTPS validés. L'API exige la session SWAPP actuelle (compte natif ou session Twitch reconnue), protège les requêtes par l'origine et limite le nombre de fiches par compte.
- Trois nouvelles ressources obligatoires dans le paquet Hostinger : \`modules/swapp-servers-create.js\`, \`assets/swapp-servers-create.js\`, \`assets/swapp-servers-create.css\`. Tests associés : \`test/swapp-server-create-page-20261115.test.js\`.
- **Publication réelle non garantie par le seul commit** : reconstruire/déployer sur Hostinger, vérifier création de la table \`swapp_game_server_extras\`, tester en production avec un compte connecté et un code Discord actif, puis contrôler la fiche et les liens Twitch/site. Sans ces validations, ne pas affirmer que le site public fonctionne.


## Refonte marketplace et personnalisation propriétaire (15 novembre 2026)
- **Annuaire** : marketing noir premium, accents cyan/violet/rose, couleurs adaptées aux univers des jeux, bannière de serveur, logo indépendant, slogan, cartes rehaussées, cœur rouge visible et boutons « Voir la fiche », « Voter », « Rejoindre ».
- **Fiches publiques** : affichent une bannière, le logo propre au serveur quand il existe, le slogan, la palette choisie (\`--ss-brand-accent\`, \`--ss-brand-secondary\`) et jusqu'à trois captures en galerie ; les statistiques restent celles réellement enregistrées.
- **Personnalisation** : sur l'annuaire, « Gérer mes fiches » ouvre la page propriétaire \`/serveurs/mes-serveurs\`, distincte du classement ; le propriétaire peut aussi accéder à \`/serveurs/gerer/:slug\` directement depuis sa fiche ou sa carte. L'ancien bloc « Mes serveurs » n'est pas réintroduit dans le classement.
- **Formulaire complet** : champs slogan, URL de logo, URL de bannière, fichiers d'images, deux couleurs HEX avec palettes prédéfinies, galerie de 3 URLs HTTPS, aperçu visuel immédiat. Les autres champs (nom, description, Twitch, site, langue, catégories et invitation/adresse) restent modifiables. Le jeu du serveur est verrouillé pendant l'édition pour préserver la cohérence des URLs historiques.
- **Persistant MySQL Hostinger** : table \`swapp_game_server_branding\` (logo, bannière, couleurs, slogan et galerie) et table \`swapp_game_server_media\` (logo/bannière BLOB). Des images PNG/JPEG/WebP de 100 octets à 2 Mo sont acceptées après inspection de signature. Aucune dépendance de stockage externe ni nouveau VPS. L'usage est toutefois soumis aux quotas MySQL de l'hébergement.
- **Contrôles des droits** : les routes d'édition et d'envoi de fichiers recherchent \`id=? AND owner_id=?\` dans les serveurs publiés. Un autre compte ne peut pas modifier l'image d'un serveur en connaissant son slug/ID. Les URL visuelles et couleurs sont validées côté serveur ; les valeurs dangereuses ne sont pas réinjectées dans le HTML.
- **Écriture transactionnelle** : modification de la fiche principale, des liens supplémentaires et du thème dans une transaction MySQL ; l'upload de chaque image suit ensuite via un endpoint distinct, avec son propre contrôle du propriétaire.
- **Cache image** : revalidation immédiate après changement pour éviter que l'ancienne bannière reste visible.
- **Tests ajoutés** : \`test/swapp-servers-branding-owner-20261115.test.js\` vérifie les routes, la propriété, les médias, le rendu, l'échappement et l'isolation du panneau propriétaire. Les tests précédents de création et de listing ont été adaptés aux nouvelles routes.
- **État** : modifications enregistrées au dépôt GitHub. Rendu navigateur réel, création effective des tables, quota MySQL, upload et édition sur l'instance Hostinger publique non vérifiés ; le changement doit encore être déployé/validé sur le serveur réel.


## Footer, acquisition et découverte interplateforme (15 novembre 2026)

- Pied de page sur les routes natives SWAPP : réemploi du composant institutionnel \`assets/swapp-footer.js\` et de la nouvelle feuille autonome \`assets/swapp-footer-native.css\` via \`modules/swapp-page-shell.js\`. Des liens vers les autres rubriques, contact et pages légales sont disponibles, sans deuxième menu et sans faire croire que toutes les informations juridiques sont complètes.
- En pied de classement SERVEUR + : section originale « Votre serveur mérite le devant de la scène » avec les avantages gratuits réellement proposés, le CTA « Ajouter mon serveur » et un lien « Gérer mes fiches ». Aucun faux chiffre d'utilisateurs, de votes, de visiteurs ni d'ancienneté.
- Comparaison de classements externes : \`modules/swapp-servers-external-discovery.js\` propose des liens publics directs et attribués vers les **classements** Top-Serveurs de Minecraft, GTA RP/FiveM, Cyberpunk 2077, Discord, Rust et DayZ. Pour une page jeu particulière, seule la catégorie correspondante est proposée.
- Les fiches, images, votes, numéros de classement et descriptions de Top-Serveurs ne sont **pas copiés, scrappés, proxyfiés ni enregistrés**. Les cartes externalisées ne sont pas présentées comme des serveurs inscrits sur SWAPP. Les CGU Top-Serveurs demandent une autorisation pour la réutilisation commerciale de contenus ; l'API documentée (https://api.top-serveurs.net/documentation) n'est pas confirmée comme une API publique de palmarès général, et les endpoints documentés des serveurs nécessitent généralement des jetons de serveur. Pour une intégration automatique de type Twitch, obtenir au préalable un accès et une autorisation explicites de Top-Serveurs, avec des règles d'attribution et de cache, puis prévoir un connecteur distinct.
- Les deux systèmes de votes et les vérifications des serveurs restent indépendants. Les liens externes portent les attributs \`rel="noopener noreferrer nofollow"\` et s'ouvrent sur le site d'origine.
- Tests : \`test/swapp-servers-promo-footer-20261115.test.js\` et \`test/swapp-servers-external-discovery-20261115.test.js\` plus actualisation des assertions historiques des rails, des numéros de fichiers en cache et du menu SERVEUR +.
- Ces modifications dans GitHub ne constituent pas un déploiement Hostinger : vérifier le bundle de l'instance, les vrais liens, la lisibilité mobile, les règles de la CMP et les tests réels du formulaire après publication.


## Correctif annuaire Discord et suppression des fiches propriétaire — 15 novembre (soir)

- Une catégorie telle que `/serveurs/discord-multigaming` affiche les fiches **publiées de cette catégorie dans le HTML initial** (requête SQL vérifiée par nom de jeu), directement après le formulaire de recherche. Les univers populaires et la grille des jeux sont ensuite affichés **plus bas** : ils ne doivent jamais repousser le résultat recherché.
- Les fiches de catégorie sont toujours améliorées après chargement de `assets/swapp-servers.js` pour obtenir les votes du mois et la pagination. En cas d'indisponibilité SQL, afficher une erreur explicite, pas un faux zéro.
- Sur `/serveurs/mes-serveurs`, chaque ligne (publiée, en attente ou refusée) possède désormais un bouton **Supprimer**, avec confirmation explicite et statut accessible.
- Endpoint `DELETE /api/swapp/serveurs/:id` : session SWAPP obligatoire, contrôle `Origin`, ID hexadécimal strict, requête SQL paramétrée limitée aux deux identités propriétaires autorisées ; renvoie 404 en cas d'absence ou de non-propriété. Les clés étrangères InnoDB `ON DELETE CASCADE` retirent aussi votes, avis, compteurs de clic, données complémentaires, médias et branding. Aucune purge ou dédoublonnage automatique.
- `assets/swapp-servers-owner.js` est déclaré parmi les fichiers obligatoires du paquet Hostinger. Les tests de non-régression vérifient le rendu de catégorie avant les suggestions, les droits de suppression et la présence du script de confirmation.
- **Reste à vérifier en production Hostinger après déploiement** : présence effective des deux fiches Discord publiées observées dans « Mes serveurs », chargement de leur catégorie, suppression volontaire d'une fiche de test, actualisation des compteurs et absence de réapparition après redémarrage. Aucun compte ni fiche réels n'ont été supprimés durant le développement.
