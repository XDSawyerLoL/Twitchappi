# SWAPP ACTUS — Magazine et rédaction intégrés

Cette version remplace la page d'archives par des **articles natifs** servis sur `https://swapp.tv/actus` et `/actus/:slug`. Les anciens liens Fourthwall sont des métadonnées de migration, pas des liens de lecture publics.

## Parcours d'utilisation

1. Connectez-vous avec un compte SWAPP autorisé comme administrateur. L'autorisation existante dépend de `ORYON_ADMIN_LOGINS` ou `ADMIN_LOGINS` configuré sur Hostinger (liste de pseudos SWAPP).
2. Ouvrez `https://swapp.tv/actus/studio`.
3. Cliquez **+ Nouvel article** : titre, chapô, texte complet, catégorie, jeu, couverture (URL), crédits, signature et sources. Enregistrez en brouillon.
4. Dans **Tous les articles**, ouvrez un brouillon puis cliquez sur **Publier sur SWAPP**. Vous pouvez ensuite **corriger un article publié** sans modifier sa date initiale, ou **retirer de la publication** pour conserver un brouillon.
5. Dans **Finaliser la reprise**, consultez les textes historiques vérifiés qui dépendent encore de Fourthwall. Cliquez **Rendre modifiable** pour créer leur brouillon dans SWAPP, puis relisez et publiez depuis **Toutes les publications**. Le scan manuel reste disponible dans les options avancées.

Les pages nécessitant une connexion, les vidéos et les contenus dont le texte n'est pas identifiable ne sont **pas** présentés comme importés. Aucune transcription ou source n'est inventée. Le scan public n'écrit jamais dans Firestore ; seul le clic d'import explicite crée des brouillons.

## Sécurité et disponibilité

- Les actions d'édition exigent une session admin ou la clé API via en-tête ; aucun secret n'est embarqué dans le navigateur.
- Les publications utilisent toujours les validations de sources, droits d'image et transactions Firestore.
- Le rendu Markdown autorise titres (`##`, `###`), gras, italique et listes, sans HTML arbitraire.
- La publication sociale reste désactivée (outbox `paused`).
- Les articles sont stockés dans `swapp_news_articles`, sans modifier les comptes ni le streaming.
- `SWAPP_NEWS_ENABLED=false` désactive le CMS en cas d'incident.

## Limites restantes

- Les images sont ajoutées par URL disposant de droits, pas encore par une médiathèque avec téléversement.
- Le catalogue public connu ne représente pas forcément toutes les publications du compte Fourthwall.
- Les anciens liens sur `justplayer.fr` exigent une opération côté domaine/Fourthwall pour rediriger vers les URL natives SWAPP. **SWAPP ne peut pas rediriger à lui seul des URL servies par un autre domaine.** Aucune redirection sortante vers JustPlayer n'est ajoutée à la lecture des articles SWAPP.
- La migration n'est complète que lorsque les vrais textes et médias ont été vérifiés et publiés.

## Vérifications après déploiement

- `/actus` affiche une page de magazine SWAPP, sans « Archives JustPlayer ».
- `/actus/studio` fonctionne pour un compte configuré administrateur.
- Création brouillon → modification → publication → relecture publique → dépublication.
- Recherche et filtres par catégorie.
- Test du scan JustPlayer réel, puis import d'un article test avant import massif.
- Vérifier les autres parcours SWAPP : accueil, découverte Twitch, sessions, chat.


## Retrait de l’ancienne marque

Les mentions publiques des articles appartiennent à **SWAPP**. Les anciennes URL et les crédits de source restent conservés pour les redirections et les droits. Voir [SWAPP_RETRAIT_JUSTPLAYER.md](SWAPP_RETRAIT_JUSTPLAYER.md) pour les conditions de fermeture, l'inventaire complet du compte historique, les vidéos et les sauvegardes. Le catalogue actuel n'est pas exhaustif.
