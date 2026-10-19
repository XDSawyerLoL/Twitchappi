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
