# SWAPP · compte administrateur Sansahd

La rédaction SWAPP utilise **les comptes SWAPP existants**. Il n'y a aucun mot de passe administrateur codé dans GitHub, aucune élévation automatique par pseudo et aucune migration destructive des articles.

## Activation sécurisée (Hostinger, environnement Node.js SWAPP)

1. Connecter le compte propriétaire **Sansahd** sur https://swapp.tv/compte. S'il n'existe pas, le créer par le formulaire officiel SWAPP avec un mot de passe fort. Ne jamais communiquer ce mot de passe dans ChatGPT ni l'insérer dans un dépôt.
2. Depuis **cette session connectée**, ouvrir `https://swapp.tv/api/editor/actus/identity`. La réponse indique `login` et `userId` uniquement pour l'utilisateur connecté. Vérifier exactement `login: "sansahd"`.
3. Dans les **variables d'environnement privées** de l'application Node.js SWAPP chez Hostinger, définir :
   - `ORYON_ADMIN_LOGINS=sansahd`
   - `ORYON_ADMIN_USER_IDS=<userId obtenu à l'étape 2>`
   - `SWAPP_NEWS_ENABLED=true`
   - conserver la configuration **Firestore/FIREBASE_SERVICE_KEY** qui assure la persistance du compte et du CMS.
4. Redémarrer/déployer l'application Node.js. La liaison par identifiant est obligatoire en production : en son absence, aucun compte ORYON ne peut recevoir des droits administrateur simplement parce que son pseudo est sur la liste.
5. Vérifier `https://swapp.tv/api/editor/actus/access` depuis la session connectée : `authenticated: true` et `canEdit: true`.
6. Ouvrir **https://swapp.tv/actus/studio** ou, dans le menu du compte, **Studio administrateur · Posts & vidéos**.

Sans les étapes 1 à 4, les droits administrateur ORYON sont volontairement désactivés en production. GitHub seul ne crée **pas** de compte actif et ne confère pas les permissions en production. Il n'existe aucune raison de publier des identifiants, une clé administrateur ou un mot de passe dans les fichiers du projet.

## Fonctionnalités du Studio

- Créer un brouillon, l'enregistrer, le modifier après publication, le publier et le dépublier.
- Types : **Article**, **Post**, **Trailer**, **Vidéo**.
- Pour une vidéo : URL YouTube autorisée par l'éditeur ou par le propriétaire, titre, description, image facultative, jeux associés et tags.
- **Détecter les jeux et suggérer des tags** : reconnaissance prudente côté serveur SWAPP, aucune API d'IA tierce, résultats éditables.
- Renseigner le titre SEO et la méta-description, générer Open Graph et JSON-LD (VideoObject sur les pages vidéo).
- Les vidéos et trailers **publiés** remontent automatiquement dans `/bandes-annonces`. Les articles et posts restent lisibles dans `/actus`.
- Une publication vidéo sans image personnelle utilise la miniature du lecteur YouTube sur la galerie.

**Limites actuelles :** ce Studio gère les vidéos intégrées par URL YouTube. Un formulaire d'upload de fichiers MP4, transcodage et hébergement propriétaire nécessite un espace de stockage vidéo, des autorisations et une chaîne de traitement séparés. Il n'est pas simulé ici.

## Garanties

- Les routes de création, modification et publication restent sous `requireEditor` et exigent le marqueur anti-CSRF sur chaque mutation.
- Un pseudo seul ne donne pas les droits : la liste administrateur configurée et l'identifiant interne épinglé doivent concorder.
- Une suggestion automatique de jeu n'écrase pas un choix manuel de l'éditeur.
- La création d'un média n'effectue pas de publication automatique sur SOCIAL ou sur un réseau externe.

## Première vidéo de vérification (aucune publication automatique)

Après déploiement effectif du commit et activation du compte :

1. Se connecter à SWAPP avec le compte Sansahd.
2. Ouvrir [SWAPP Studio](https://swapp.tv/actus/studio).
3. Cliquer **Tester les services SWAPP**. Vérifier « Accès rédaction · Administrateur autorisé », puis les réponses Actualité, Vidéos et SOCIAL. Une erreur de l'un de ces services est une mesure réelle et doit être corrigée avant la suite.
4. Dans **Médiathèque**, choisir **Préparer la vidéo de vérification**. Le formulaire est prérempli avec une bande-annonce officielle CODE VEIN II (Bandai Namco Entertainment, YouTube `Z9SaRLSibak`). Il n'est pas sauvegardé automatiquement.
5. Vérifier les informations et les droits du média. Utiliser **Vérifier avant publication** pour tester la validation sans écritures.
6. Cliquer **Créer le brouillon**. Vérifier sa présence dans la Médiathèque avec l'état « Brouillon ». Actualité et Vidéos publiques ne doivent pas encore l'afficher.
7. Cliquer **Publier sur SWAPP**, confirmer, puis ouvrir `/actus/<slug>` et `/bandes-annonces`. Lancer le lecteur explicitement et vérifier qu'il lit la vidéo YouTube et non une page Fourthwall.
8. Dans le Studio, cliquer **Retirer de la publication** pour revenir au brouillon. Vérifier la disparition des pages publiques.

La publication et le retrait doivent être déclenchés par le propriétaire depuis sa session authentifiée. Les tests GitHub ne remplacent pas cette validation en production.

## Si le Studio n'apparaît pas

- `403 /actus/studio` : compte SWAPP non connecté ou rôle absent. Contrôler `/api/editor/actus/identity` et `/api/editor/actus/access`, ainsi que `ORYON_ADMIN_LOGINS` et `ORYON_ADMIN_USER_IDS`.
- `404 /actus/studio` : déploiement incomplet ou `SWAPP_NEWS_ENABLED` non activé.
- `503 news_storage_unavailable` : Firestore/persistance de la rédaction indisponible ; ne pas essayer de publier.
- `422 /api/editor/actus/validate` : contenu insuffisant ou source manquante. Corriger le champ indiqué sans perdre le brouillon.
- Page vide ou JS ancien : contrôler le commit réellement déployé, redémarrer l'application Node.js et purger uniquement le cache du site si nécessaire.
