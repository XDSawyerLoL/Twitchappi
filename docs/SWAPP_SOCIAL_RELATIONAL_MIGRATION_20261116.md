# SWAPP SOCIAL — migration MySQL relationnelle, étape 1 (16 novembre 2026)

## Portée
Le magasin natif \`swapp_social_native_store\` demeure **la source de vérité**.
Cette livraison ajoute deux tables indexées (publications, messages privés) et une table d'état.
Aucune suppression ni création de compte, aucun changement de lecture du fil SOCIAL,
aucune API payante et aucune bascule automatique des données utilisateur.
La migration prépare la seconde étape (lecture relationnelle) mais ne supprime pas
encore le goulot d'étranglement des écritures JSON globales.

## Déploiement sûr sur Hostinger
1. Faire une sauvegarde MySQL complète (dont \`swapp_social_native_store\`).
2. Déployer les nouveaux fichiers **sans** activer le flag de dual-write.
3. En période de maintenance, vérifier le volume : \`npm run social:relational:status\`.
4. Vérifier que le volume reste sous 10 000 publications et 20 000 messages,
   puis lancer explicitement : \`npm run social:relational:backfill\`.
   La commande réalise le backfill dans une transaction et verrouille la source
   pour garantir une copie cohérente. En cas d'échec, rollback de l'index.
5. Contrôler les comptages SQL et les comptes avec deux vrais utilisateurs.
6. **Seulement après** validation, configurer \`SWAPP_SOCIAL_RELATIONAL_DUALWRITE=1\`
   et redémarrer Node. Toute mutation de publication ou message met alors à jour
   le JSON historique et ses lignes relationnelles dans **la même transaction**.

## Repli
Retirer \`SWAPP_SOCIAL_RELATIONAL_DUALWRITE\` et redémarrer : SOCIAL reprend son
comportement historique sans perte de données. Les tables auxiliaires peuvent rester
en place ; ne pas les supprimer avant un éventuel passage à la lecture relationnelle.
L'index n'est PAS une source alternative de connexion, de sessions ou d'identité.

## Validation
\`node --test test/swapp-social-native-relational-index.test.js\`
+ scénario réel publication, modification, suppression, message lu, reconnexion
sur deux comptes et contrôle d'exactitude des tables. Ne pas déclarer la
migration complète sur la base des tests unitaires seuls.
