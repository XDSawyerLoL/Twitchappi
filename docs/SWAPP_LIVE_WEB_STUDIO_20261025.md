# SWAPP Live — Studio navigateur intégré (25 octobre 2026)

## Fonctionnement livré dans le dépôt

Le Gestionnaire de stream présente SWAPP Live Web comme option principale. La diffusion s'effectue **depuis le navigateur**, sans installer l'agent SWAPP Live. Le matériel est capturé en local via getDisplayMedia / getUserMedia, puis transmis par la pile native WebRTC / relais HTTP déjà utilisée par SWAPP.

- Sources : écran/jeu, webcam seule, écran et webcam incrustée.
- Audio : récupération du son de la fenêtre/onglet partagé lorsque le navigateur le permet, microphone facultatif et mixage Web Audio en une piste quand les deux sources existent.
- Caméra : composition sur canvas; arrêt de la capture et libération des pistes et du contexte audio lorsque l'utilisateur arrête le direct.
- Le titre, le jeu et la catégorie de la diffusion se modifient dans le gestionnaire ou depuis « Modifier le direct » sur sa chaîne. Aucun redémarrage du live n'est nécessaire.
- Modifications côté serveur avec validation de la session du propriétaire, contrôle same-origin JSON, sauvegarde dans le profil SWAPP et diffusion Socket.IO aux visiteurs.
- Les redémarrages de l'émetteur WebRTC ne rétablissent pas un ancien titre. Les heartbeats de l'ancien agent OBS ne doivent pas écraser les paramètres modifiés depuis le dashboard pendant le direct.
- Le titre public s'affiche au-dessus de l'ensemble lecteur+tchat, sans décaler les deux colonnes séparément.

## Limites techniques documentées

Le studio web n'est **pas une copie binaire** du programme SWAPP Live. Il ne peut ni recevoir en local un flux RTMP OBS, ni utiliser un pilote de capture de jeu natif, ni continuer à capturer si l'onglet du navigateur est fermé. Pour les scènes OBS, le programme PC reste une option facultative. Ne pas annoncer une latence nulle : les conditions WebRTC, le réseau et les navigateurs imposent une latence incompressible. Le relais HTTP est une solution de secours, avec limites de bande passante et de capacité. L'audio système varie selon le navigateur, le système d'exploitation et la fenêtre choisie.

Il ne faut pas affirmer que SWAPP est « à 100 % prêt » sans les essais réels suivants.

## Commandes de test

```bash
node --test test/swapp-live-metadata.test.js test/swapp-browser-studio.test.js
```

## Tests de validation production

1. Ouvrir le Gestionnaire connecté en propriétaire et constater « SWAPP Live — Studio navigateur ». Vérifier les permissions d'écran, webcam, microphone, et les variantes écran seul, webcam seule, écran + caméra.
2. Partager un jeu avec et sans audio système, ainsi que le microphone. Tester casque/enceintes et un spectateur distant; vérifier l'absence d'écho, l'image et la synchronisation.
3. Diffuser depuis le navigateur avec un titre, une catégorie, puis changer les deux en direct dans le gestionnaire. Chez un autre spectateur, vérifier la réception du nouveau titre et de la nouvelle catégorie sans F5; contrôler /api/native/lives.
4. Modifier ces champs depuis la page publique de sa propre chaîne; vérifier qu'aucun spectateur ne possède le bouton propriétaire ni les droits API.
5. Redémarrer la connexion Socket.IO du diffuseur, puis vérifier que le dernier titre est conservé. Avec l'ancien agent OBS, contrôler que des heartbeats ne rétablissent pas un ancien titre.
6. Tester la page chaîne desktop et mobile avec titre long : lecture et tchat exactement alignés, boutons accessibles, pas de découpe.
7. Arrêter le partage depuis la bannière de capture du navigateur puis depuis « Arrêter le live » : toutes les pistes et le microphone doivent s'arrêter; pas de caméra restée active ni de tentative d'envoi après fermeture du direct.
8. Tester deux réseaux différents et un navigateur mobile pour les spectateurs. Le mode WebRTC ne couvre pas tous les NAT sans relais TURN; vérifier le fallback HTTP et les erreurs réseau.
9. Vérifier que Hostinger déploie le commit courant, que les assets versionnés sont à jour et que le service Node redémarré expose /api/swapp/live/metadata uniquement aux propriétaires.

## Contraintes de conception

- Aucune API tierce payante, aucun VPS ajouté.
- Aucun logiciel PC requis pour **le mode navigateur**.
- Ne pas forcer l'application OBS si l'utilisateur sélectionne partage d'écran, webcam ou caméra incrustée.
- Ne pas modifier l'architecture du tchat ni les propriétés de hauteur du lecteur pour intégrer les outils.
