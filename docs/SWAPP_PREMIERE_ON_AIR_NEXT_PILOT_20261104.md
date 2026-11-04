# SWAPP PREMIÈRE + SWAPP ON AIR — pilote contrôlé (4 novembre 2026)

## Objectif

Relier **article vérifié → FLASH interactif → jeu → intention des spectateurs → futurs tests en direct par des créateurs rémunérés**, avec un podcast IA à voix expressives qui pourra présenter les événements lorsque sa qualité est vérifiée.

Cette branche livre une **première capacité opérationnelle** : intention volontaire des membres SWAPP, agrégation dans MySQL et interface sur les hubs et FLASH. Elle ne vend encore aucune campagne aux studios, ne promet aucun cachet, et ne crée pas d'événement sans accord.

## SWAPP PREMIÈRE — participation

Une personne authentifiée peut demander à voir un jeu testé en direct à partir d'un FLASH ou de la page du jeu. Elle peut retirer sa demande à tout moment.

- Actif uniquement avec \`SWAPP_PREMIERE_INTEREST_ENABLED=1\` et comptes MySQL SWAPP fonctionnels.
- Vérification serveur : jeu déjà couvert par un article **publié dans le CMS** (même contrôle de jeu vérifié que Spotlight), pas de faux projets.
- MySQL \`swapp_premiere_interest\` : clef primaire \`(user_id,game_slug)\`, ce qui empêche un compte de voter plusieurs fois pour le même jeu.
- Données stockées : identifiant de compte SWAPP, nom et slug du jeu, date de demande. Pas d'IP, cookie, adresse personnelle, navigation ni donnée de visionnage.
- Pas plus de 30 jeux demandés par compte ; retrait immédiat par le même compte.
- Affichage du nombre public **uniquement à partir de 5 membres** pour éviter de révéler de petits groupes.
- Le texte rappelle que ce n'est **ni un événement programmé, ni une réservation, ni un financement de créateur**.
- Contrôles de POST : session SWAPP persistante restaurée sans création d'un nouvel utilisateur, compte existant en base, entête X-SWAPP-PREMIERE-ACTION et origine du site.
- Le bouton reste caché lorsque la fonctionnalité n'est pas activée. Aucun service externe ni facture.
- La suppression de compte et les politiques de rétention devront aussi être câblées à la purge des intentions avant lancement général.

### Activation sous contrôle

1. Sauvegarder la base de données Hostinger et vérifier \`SWAPP_MYSQL_URL\` et \`SWAPP_MYSQL_ACCOUNTS\`.
2. Vérifier que le CMS publie bien des actualités via MySQL et qu'une session SWAPP peut être restaurée sans création de compte.
3. Exécuter \`node --test test/swapp-premiere-interest.test.js\` et \`node --test test/swapp-flash.test.js\`.
4. En préproduction seulement, mettre \`SWAPP_PREMIERE_INTEREST_ENABLED=1\`, déployer le code et vérifier une vraie création/révocation, une déconnexion, une origine interdite, un jeu non publié.
5. Après validation, déployer avec surveillance de la base et procédure de rollback ; désactiver avec \`=0\` en cas d'erreur.

La PR ne doit **pas** être fusionnée ni activée sans ces contrôles.

## SWAPP ON AIR — voix plus naturelles sans Google

Fichier : \`scripts/swapp-on-air-qwen-local.py\`. Il utilise le projet open-source Qwen3-TTS (Apache 2.0) pour générer des répliques **en français** avec des indications de jeu d'acteur par intervenant, au lieu de faire réciter un article par eSpeak ou Microsoft.

Deux modes :

- \`--mode custom\` : timbres préexistants distincts, voix féminine Serena (Nova), voix masculine Ryan (Kern), instructions conversationnelles, moteur 1.7B par défaut. Les presets n'ont pas le français comme langue native ; accent et naturel à vérifier à l'oreille, **pas d'équivalence garantie avec Mairaiy/Aoede**.
- \`--mode clone\` : modèle Qwen3-TTS Base, références WAV **autorisées** et texte exact de chaque référence, une identité acoustique réutilisée pour toutes les répliques du même personnage. L'accord explicite pour les voix clonées est obligatoire. Ne pas utiliser la voix d'un tiers sans ses droits.

Chaque réplique reçoit son intention vocale dans \`instruct\` (mode custom) sans prononcer les instructions, puis le WAV final est assemblé avec de courtes pauses entre animateurs, normalisation prudente et micro-fondus. Conversion MP3 automatique si FFmpeg existe.

**Aucune génération n'est exécutée sur Hostinger, sur GitHub Actions, en tâche cron ou par les spectateurs.** La production se fait sur un PC et publie seulement l'audio **après écoute et validation**. Il n'y a ni clé ni facturation d'API ; le temps GPU/CPU et la bande passante restent des coûts réels.

### Premier contrôle, gratuit et sans téléchargement

À la racine du dépôt :

    python scripts/swapp-on-air-qwen-local.py
    python -m unittest discover -s test -p 'test_swapp_on_air_qwen_local.py'

Ces commandes ne demandent pas le modèle et ne génèrent pas d'audio.

### Première production locale (consomme des ressources matérielles, pas de crédits API)

Sur PC avec Python, PyTorch CUDA et suffisamment de VRAM, après installation de \`qwen-tts\`, \`numpy\`, \`soundfile\` et de ses dépendances :

    python scripts/swapp-on-air-qwen-local.py --render --allow-download

La première utilisation télécharge les modèles ouverts Qwen. Le rendu et les WAV restent dans \`.swapp-on-air-private/\`, ignoré par Git. Pour tester le modèle plus léger :

    python scripts/swapp-on-air-qwen-local.py --size light --render --allow-download

Sur une machine sans carte NVIDIA CUDA, le calcul CPU peut être très lent : \`--allow-cpu\` le permet explicitement, sans promesse de performance.

### Réutiliser un échantillon vocal autorisé

Si les **références Mairaiy et Kern** sont disponibles en local, leurs transcriptions exactes peuvent être fournies :

    python scripts/swapp-on-air-qwen-local.py --mode clone --render --allow-download --authorized-reference --reference-nova "chemin/mairaiy.wav" --transcript-nova "chemin/mairaiy.txt" --reference-kern "chemin/kern.wav" --transcript-kern "chemin/kern.txt"

Les fichiers de référence ne doivent jamais être committés. Si tu n'as qu'un échantillon de Mairaiy, tu ne peux pas cloner deux personnages à partir de ce seul échantillon sans produire une seconde identité : utilise le mode custom en attendant.

### Avant publication

Écouter au casque **toutes les prises**, puis valider : naturel de la diction française, identité cohérente par animateur, absence de mots inventés/omis, transitions, noms propres, durée, volume, sources de l'actualité et légalité des échantillons. Ne pas transformer le dialogue fictif de test en actualité publiée.

### Statut de vérification

- Modèle de production audio non installé dans la session de développement ; aucun vrai WAV Qwen généré ni écouté ici.
- Le script a été ajouté au dépôt et prévoit des tests standard-library sans chargement de modèle.
- Les modules JavaScript et la logique du magasin MySQL ont été vérifiés avec des simulations isolées ; tests Node complets, MySQL Hostinger et navigateurs réels non exécutés.
- Déploiement : **aucun**, PR en brouillon ; aucun paiement, sponsoring, publicité ou réservation activés.

## Prochaine version de PREMIÈRE

Créer une inscription volontaire des créateurs (avec identité de chaîne vérifiée), puis un back-office pour studios, contrats signés, budgets financés et cachets garantis, ordre de passage SWAPP TV et rapport post-campagne honnête. Le financement B2B par le studio doit précéder tout engagement de paiement de SWAPP.
