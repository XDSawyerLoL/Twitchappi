# SWAPP Creator Stories — première version

Les créateurs SWAPP disposent de stories verticales (9:16) sur leur page de chaîne.

- Jusqu'à **quatre stories simultanées**, avec titre, texte, ambiance visuelle et lien vidéo YouTube/Odysee facultatif.
- Les vidéos ne sont jamais importées ni téléchargées sur Hostinger. Une vignette YouTube peut servir d'illustration réelle.
- Les stories sont visibles pendant **24 heures** à compter de la publication. Les lignes expirées ne sont pas renvoyées par l'API ; une purge bornée intervient lors de publications ultérieures.
- Un créateur authentifié peut publier et supprimer ses propres stories, pas celles d'un autre compte. Les profils privés masquent les stories aux visiteurs non autorisés.
- Les écritures sont limitées par le rate limiter existant, contrôlent leur origine HTTPS et verrouillent uniquement la ligne du créateur pendant la publication pour respecter la limite de quatre.
- La suppression est immédiate. Les liens vidéo externes nécessitent un clic ; aucune lecture automatique.
- Les métadonnées sont conservées dans MySQL Hostinger avec swapp_creator_stories et swapp_creator_story_lock, créées à la première utilisation. **Aucune clé ni API payante.**

## Validation

node --test test/swapp-creator-stories.test.js test/swapp-creator-story-store.test.js test/swapp-creator-stories-ui.test.js

Après déploiement : publier une story sur une vraie page créateur ; tester sur un autre compte, en navigation privée et sur mobile ; vérifier que l'illustration apparaît, qu'elle se supprime et que l'API exclut toute story expirée.

La première version ne contient pas encore d'import natif d'image ou de montage vidéo : elle reste légère pour Hostinger et évite le stockage vidéo.
