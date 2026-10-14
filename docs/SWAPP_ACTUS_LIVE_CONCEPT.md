# SWAPP — ACTUS × LIVE

## Idée produit

**« Lis l’actu. Vis le jeu. »** Ce n'est ni un fil d'actualité accolé à une plateforme de lives, ni une promesse d'exclusivité mondiale. C'est une expérience intégrée : le lecteur et le spectateur passent naturellement de l'un à l'autre.

Le parcours est bidirectionnel : **un jeu dans un article → les créateurs qui le streament**, et **un jeu en cours de diffusion → les articles SWAPP consacrés à ce jeu**.

## Ce qui est implémenté

- **Accueil SWAPP** : rubrique éditoriale native, qui présente automatiquement les derniers articles publiés (ou une introduction lorsque Firestore est vide), en complément de la découverte de lives existante.
- **`/actus`** : véritable magazine de jeux vidéo hébergé sur SWAPP, avec son propre contenu Firestore, recherche, catégories et rendez-vous lives en direct.
- **`/actus/:slug`** : lecture d'un article complet, sources, Markdown sécurisé, image et suggestions des lives du jeu `game` si le champ est renseigné.
- **`/live/twitch/:login?game=...`** : lecteur et chat Twitch intégrés à SWAPP, avec propositions d'articles associés à ce jeu.
- **Lives SWAPP natifs** : les cartes pointent directement vers la chaîne interne `/:login`.
- **`/actus/studio`** : console éditoriale, déjà présente dans la branche, pour créer, modifier, publier, dépublier, sélectionner des images par URL autorisée et importer des textes JustPlayer en brouillons.

Les suggestions de lives utilisent **`GET /api/discovery/home-lives`**, qui privilégie les lives natifs puis les lives publics Twitch. Le contexte est limité à une comparaison des noms de jeu : il ne s'agit pas encore d'un moteur de recommandation sémantique. Si aucune correspondance n'est trouvée parmi les suggestions actuelles, le site le signale sans inventer un lien entre jeux.

Les suggestions d'articles sont issues de **`GET /api/actus`** : seuls les articles **publiés** apparaissent, et seuls ceux associés au même jeu sont proposés.

## Ce qui n'est pas encore terminé

- Import complet des textes, images et auteurs historiques depuis Fourthwall.
- Médiathèque avec téléversement d'images (l'éditeur utilise actuellement des URLs et exige les droits/crédits).
- Moteur de rédaction IA quotidienne, contrôle des sources et diffusion sociale automatisée (tous non activés).
- Suggestions couvrant toutes les catégories Twitch : l'API de découverte actuelle renvoie au maximum 12 propositions ; le module n'affirme jamais qu'il n'existe **aucun** live sur le jeu dans tout Twitch.
- Validation d'accessibilité et du rendu sur plusieurs appareils, et test des embeds Twitch sur le domaine réel.

## Déploiement et validation

La branche est indépendante de `master`, qui peut déclencher un déploiement automatique Hostinger. Avant fusion :

1. Vérifier les tests `npm test` et `npm run check`.
2. Contrôler sur une préproduction Firestore ou une copie locale les parcours : connexion, homepage, ACTUS, lecture article, live Twitch, live natif, studio.
3. Vérifier l'accès administrateur à `/actus/studio`, les modifications de brouillons et le comportement des articles publiés.
4. Vérifier les limites Node/Hostinger et le dernier commit déployé.
5. Déployer et conserver une procédure de retour arrière ; ne pas supprimer les comptes, les publications ou les collections existantes.

**Aucune affirmation d'unicité mondiale n'est démontrée** : la différenciation visée est l'expérience ACTUS ↔ LIVE et son intégration native à SWAPP.
