# SWAPP — PASSAGE 2.0, MARATHON, ASCENSION (MVP ergonomique)

## Ce qui change

**PASSAGE 2.0** : après la fin d'un live réellement confirmé, priorité aux petits streamers actifs du même jeu (≤50 spectateurs lorsqu'un comptage Twitch est disponible, chaînes SWAPP natives toujours éligibles). Les trois dernières chaînes du même onglet sont temporairement exclues pour éviter les boucles. Ces données sont conservées uniquement par `sessionStorage` dans l'onglet, jamais par le serveur.

**MARATHON** (`/marathon`) : une interface légère, sans duplication du planning. Un jeu choisi et jusqu'à six chaînes vérifiées, puis les réservations Spotlight réellement existantes (si le module est activé). Le lien « Rejoindre la régie » renvoie vers le formulaire SWAPP TV existant. Ce MVP **n'est pas** un nouveau système d'inscription Marathon ni une réservation automatique de temps d'antenne.

**ASCENSION** (`/ascension`) : trois chiffres sur 30 jours pour un compte SWAPP connecté : pages de destination ouvertes après PASSAGE, relais envoyés depuis la chaîne SWAPP, chaînes distinctes d'origine. Ces chiffres ne représentent **pas** des spectateurs uniques, des personnes identifiées, des follows ou la durée de visionnage.

## Principes d'efficacité

- Pas de pop-up au-dessus du lecteur ou de nouveaux contrôles dans sa barre.
- Navigation secondaire discrète sous le lecteur TV.
- Mobile : une seule colonne, contrôles tactiles larges, haut contraste, focus clavier.
- Actualisation du Marathon uniquement quand l'onglet est visible, environ une fois par minute ; résultats asynchrones périmés ignorés.
- Cache serveur court pour les vérifications Twitch ; aucune nouvelle API externe payante.
- Si MySQL/Spotlight/Twitch est absent, afficher un état compréhensible, pas de faux directs ni de faux chiffres.

## Mesure : preuve signée

1. `GET /api/swapp/live-handoff` constate que la source est en direct et renvoie un justificatif temporaire `live_proof` seulement si les statistiques sont disponibles.
2. À la fin du direct, `phase=commit&source_proof=...` est vérifié côté serveur **avec confirmation offline et destination encore active**.
3. Une preuve `transfer_token` est émise, sans identifiant personnel du spectateur.
4. La page cible, ou l'iframe TV effectivement chargée, enregistre un événement **à usage unique** via `POST /api/swapp/passage/arrive`.
5. Un digest de preuve et seulement les chaînes publiques source/destination, le jeu et l'heure sont conservés en MySQL pour les totaux des 30 derniers jours. Aucun IP ou identifiant spectateur n'est inclus dans ces lignes.

Les chiffres ne doivent pas être décrits comme des audiences uniques ou des visionnages confirmés. Les erreurs de lecture vidéo restent distinctes d'une ouverture de page.

## Conditions de production

- Le code utilise la base MySQL SWAPP déjà présente si le pool partagé de SWAPP Social ou Spotlight/TV est opérationnel. L'application peut afficher le Marathon et continuer PASSAGE sans base de statistiques.
- `SESSION_SECRET` doit être constant et configuré à l'identique sur tous les processus Node, faute de quoi aucune preuve ne peut être émise.
- `SWAPP_DIRECT_RELAY_SHARED_DIR` doit être un répertoire absolu partagé entre les processus Hostinger si plusieurs Node servent HLS.
- Prévoir les droits `CREATE TABLE`, `INSERT`, `SELECT`, `DELETE` sur le schéma MySQL SWAPP pour le module de mesures.
- En cas de panne relais, `SWAPP_LIVE_HANDOFF_DISABLED=1` coupe les passages sans désactiver la lecture.

## Vérifications

```bash
node --test test/swapp-live-handoff.test.js test/swapp-collective.test.js
npm test
npm run verify:production
```

Après déploiement du commit GitHub sur Hostinger, vérifier au minimum :

1. `/marathon` sur mobile et desktop : sélection du jeu, liste vérifiée et état calendrier désactivé.
2. `/ascension` connecté / non connecté / sans MySQL : chiffres ou message correct.
3. Deux streamers du même jeu : le changement se fait en neuf secondes et l'utilisateur peut rester.
4. Twitch vers SWAPP, SWAPP vers Twitch, SWAPP vers SWAPP et Twitch vers Twitch.
5. Une panne HLS, Twitch HTTP 429, ou un candidat déjà arrêté ne provoque pas de boucle ni de faux passage.
6. Vérifier que la version de `/api/release` correspond au checkout déployé et que les assets ne sont pas anciens.

La fusion GitHub ne déploie pas automatiquement Hostinger et n'est pas une preuve d'un essai avec de vrais directs.
