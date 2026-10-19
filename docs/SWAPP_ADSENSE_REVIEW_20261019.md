# SWAPP — état de préparation à la révision AdSense (19 octobre 2026)

## Portée et limites
Audit fondé sur le dépôt GitHub `XDSawyerLoL/Twitchappi`, les pages accessibles via l'index public, et les règles Google. Il ne s'agit ni d'une décision de Google ni d'un contrôle authentifié du Centre d'informations sur les règles AdSense.

## Points techniques vérifiés
- Identifiant AdSense dans le `<head>` de l'accueil et du gabarit des pages éditoriales : `ca-pub-6082969821681414`.
- `ads.txt` du dépôt : `google.com, pub-6082969821681414, DIRECT, f08c47fec0942fa0`. Vérifier séparément sa réponse HTTP sur le site déployé.
- Les emplacements publicitaires `assets/swapp-adsense-inarticle.js` ne sont créés que sur les articles suffisamment longs et après signal IAB TCF positif. L'existence du script de vérification dans le `<head>` n'équivaut pas à un dispositif de consentement actif.
- La page d'accueil est une SPA dont le HTML initial affiche essentiellement « Chargement de SWAPP… ». Des pages éditoriales dédiées existent, mais il faut contrôler ce que reçoit réellement le robot AdSense.

## Risques documentés qui empêchent de déclarer le site prêt
1. Les pages `/mentions-legales`, `/confidentialite`, `/cookies` et `/contact` ne comportent pas encore tous les éléments définitifs. Aucun nom, numéro d'enregistrement, e-mail, durée de conservation ou base légale ne doit être inventé.
2. Un article World of Warcraft Forever public du 15 octobre 2026 contient un texte bref, un titre non sourcé sur un « test » et un lien commercial ; sa valeur ajoutée doit être revue et les faits vérifiés avant une nouvelle demande.
3. Les articles migrés de JustPlayer doivent être clairement attribués, apporter un contenu original/éditorial substantiel et éviter la duplication de contenu entre domaines.
4. Le fonctionnement et les réglages d'une CMP certifiée Google intégrée à IAB TCF ne sont pas établis par la présence d'un écouteur `__tcfapi`. À confirmer dans AdSense → Confidentialité et messages.
5. La disponibilité réelle du site, des pages d'articles, du robots.txt, de l'ads.txt et les redirections HTTP/HTTPS + www doivent être vérifiées depuis une connexion publique, ainsi que les versions déployées par Hostinger.
6. La rubrique Actualité ne doit pas devenir une liste vide, un simple chargement JavaScript ou une redirection vers une page protégée si la base d'articles est indisponible.
7. Le Centre d'informations sur les règles AdSense peut afficher un motif précis auquel cet audit ne donne pas accès.

## Conditions concrètes avant « Demander un examen »
- Renseigner et publier **les informations légales authentiques**, un contact privé pour l'éditeur et les demandes relatives aux données, puis faire valider l'inventaire des données et cookies.
- Configurer, publier et tester une **CMP certifiée Google** ; vérifier les comportements d'acceptation, refus et retrait du consentement sur desktop et mobile, avant diffusion d'annonces concernées.
- Vérifier le **contenu et l'exactitude** des articles indexables, supprimer ou enrichir les publications génériques trop courtes et fournir sources, signatures et crédibilité éditoriale lorsque possible.
- Tester l'ensemble de la navigation publique sans compte, le rendu initial pour les robots, la disponibilité HTTPS et l'absence de contenu vide sur les pages essentielles.
- Après déploiement et vérifications, regarder le motif précis dans **AdSense → Centre d'informations sur les règles** et **Sites**. Demander un nouvel examen seulement lorsque ces problèmes sont effectivement résolus.

## Références
- https://support.google.com/adsense/answer/9335564?hl=fr
- https://support.google.com/adsense/answer/12176698?hl=fr
- https://support.google.com/adsense/answer/13554116?hl=fr
- https://support.google.com/adsense/answer/7299563?hl=fr

Ce rapport ne doit pas être affiché comme une attestation de conformité ou être utilisé pour demander un réexamen automatique.


## Modifications techniques faites le 19 octobre 2026
- Le texte public de `/actus/world-of-warcraft-forever-le-trailer` est remplacé à l'affichage par un dossier original, sourcé à partir des communiqués officiels Blizzard : l'affirmation « On a testé » est supprimée, le trailer officiel et les informations de sortie sont ajoutés. Cette correction est conditionnelle à la présence du texte obsolète et ne modifie pas directement le document Firestore. Quand une édition réelle remplace l'ancien contenu, le correctif cesse de s'appliquer. Les anciennes images dont les droits n'étaient pas établis sont supprimées du rendu corrigé.
- Les pages juridiques exposent les renseignements de l'éditeur **uniquement si** les variables Hostinger ci-dessous sont correctement configurées. Elles conservent les avertissements pertinents lorsque ces informations manquent. Ne jamais publier de fausses identités.
- Un bouton « Gérer mes choix publicitaires » est rendu dans le pied de page seulement lorsque l'API Google CMP certifiée est effectivement chargée et que le signal IAB TCF indique que le RGPD s'applique. Il réouvre le dialogue officiel, et n'enregistre aucun consentement localement.

## Variables à configurer sur Hostinger (valeurs authentiques uniquement)
Ces champs sont des informations publiques. Les renseigner dans **Hostinger → Web App → Variables d'environnement**, sans les inventer et sans les inscrire en clair dans GitHub :
- `SWAPP_LEGAL_PUBLISHER_NAME` : nom légal complet de l'éditeur (personne physique ou société).
- `SWAPP_LEGAL_PUBLISHER_ADDRESS` : adresse officielle légalement publiable.
- `SWAPP_LEGAL_REGISTRATION` : numéro d'immatriculation applicable, s'il existe.
- `SWAPP_LEGAL_CONTACT_EMAIL` : adresse **existante et contrôlée**, destinée au contact.
- `SWAPP_LEGAL_PRIVACY_EMAIL` : boîte privée dédiée aux demandes RGPD ; si absente, l'adresse de contact est utilisée.
- `SWAPP_LEGAL_HOST_DETAILS` : dénomination et coordonnées contractuelles vérifiées de l'hébergeur.

Après renseignement, vérifier effectivement `/mentions-legales`, `/contact` et `/confidentialite`. Une boîte non créée ou un e-mail inaccessible ne compte pas comme un contact réel. Les finalités, bases légales, durées de conservation et destinataires des traitements doivent encore être complétés après audit des services.

## Action nécessaire dans le compte Google AdSense
SWAPP ne peut pas **activer** lui-même une CMP certifiée Google à partir de GitHub.
1. Ouvrir **AdSense → Confidentialité et messages → Réglementations européennes → Créer** (ou **Gérer**).
2. Sélectionner **swapp.tv**, personnaliser le message en français, prévoir **Accepter, Refuser, Gérer les options**, choisir les partenaires et publier la configuration. Les libellés exacts peuvent varier.
3. Tester en navigation privée depuis la France (ordinateur et mobile), tester refus, acceptation, puis révocation via le lien du pied de page.
4. Si la CMP n'est pas active, **ne pas revendiquer** un consentement vérifié. Le code dans `<head>` est un code de vérification, pas une CMP.
5. Contrôler la nouvelle version de `swapp.tv` après déploiement Hostinger. GitHub seul ne démontre pas le comportement réel.

Sources : https://support.google.com/adsense/answer/10960768?hl=fr et https://developers.google.com/funding-choices/fc-api-docs?hl=fr .
