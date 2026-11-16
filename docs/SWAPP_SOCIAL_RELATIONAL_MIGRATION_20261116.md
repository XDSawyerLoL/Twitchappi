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
5. **Vérifier la parité SQL** avant toute activation : `npm run social:relational:verify`.
   Le script compare les publications et messages à la source, dans une transaction
   de lecture cohérente. Il retourne seulement les compteurs, jamais les messages,
   et échoue si un contenu, une clé indexée ou une ligne ne correspond pas.
   Le backfill vérifie aussi cette parité **avant son COMMIT**.
6. Contrôler les comptages SQL et les comptes avec deux vrais utilisateurs.
7. **Seulement après** validation, configurer \`SWAPP_SOCIAL_RELATIONAL_DUALWRITE=1\`
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

## Performance et limites
Le backfill insère désormais les lignes par lots de 64 au lieu d'une requête
par publication/message. Le verrou est conservé jusqu'au contrôle de parité,
ce qui impose une maintenance et un volume de données conforme aux plafonds.
Les tables restent une projection : le fil public ne lit pas encore depuis SQL.

## Lecture relationnelle expérimentale (étape 2, opt-in)

Après le backfill et la vérification intégrale des comptes sur Hostinger, il est
possible de tester la lecture des **réponses à une publication** et des
**publications d'un profil** depuis les index MySQL, sans changer les autres routes :

1. Activer `SWAPP_SOCIAL_RELATIONAL_DUALWRITE=1`, redémarrer et vérifier qu'il n'y
   a ni erreur d'écriture ni incohérence.
2. Exécuter `npm run social:relational:verify` dans une fenêtre sans mutations concurrentes
   (ou via transaction de lecture cohérente). Ne poursuivre que si `ok:true`.
3. Activer séparément `SWAPP_SOCIAL_RELATIONAL_READS=1` puis redémarrer Node.
   Le second flag est ignoré si la double écriture n'est pas active.
4. Tester deux comptes, réponses publiques/privées, blocages, publications
   supprimées, activité concurrente et versions dans le navigateur.
5. Revenir immédiatement au lecteur historique en retirant seulement
   `SWAPP_SOCIAL_RELATIONAL_READS` en cas de dérive.

Les requêtes SQL et le magasin JSON sont lus dans une seule transaction
REPEATABLE READ : les comptes d'accès, les règles de visibilité et les
éléments affichés continuent de venir de la source historique. Les index SQL
sont refusés si les comptes ou le JSON des lignes diffèrent, renvoyant 503.
La recherche, la messagerie et le fil général **ne basculent pas** encore ;
le goulot de la grosse ligne JSON est donc toujours présent.
