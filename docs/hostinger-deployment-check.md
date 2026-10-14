# SWAPP — stabilisation du déploiement Hostinger (14 octobre 2026)

## Situation vérifiée
- Production : `https://www.swapp.tv` (ancienne interface encore accessible).
- Code : `XDSawyerLoL/Twitchappi`, branche Hostinger `master`, auto-déploiement activé.
- Selon l'audit du 14/10, le dernier build est marqué **échec** après environ 3 secondes avec **0 ligne de compilation** ; l'avant-dernier déploiement reste actif.
- **Aucune cause exacte établie**. Ne pas attribuer cet échec au code sans journal brut.
- Le code de la PR #4 est isolé sur `feature/swapp-stabilisation-20261014` et ne doit pas être fusionné sans contrôle de la production et plan de retour arrière.

## Ce qui est ajouté à la branche
- `npm run preflight` : vérifie `package.json`, `package-lock.json`, les fichiers d'entrée, les registres npm inhabituels, la syntaxe JavaScript et la version Node.
- `npm test` : tests CORS et tests du préflight (aucune connexion Firestore/Stripe/Twitch).
- `npm run verify` et `npm run build` : enchaînent le contrôle et les tests, pour afficher une erreur explicite pendant la compilation lorsqu'elle atteint effectivement la phase applicative.
- La politique CORS accepte les origines canoniques `https://swapp.tv` et `https://www.swapp.tv`, et renvoie `403` sur origine refusée au lieu de `500`.

## Validation hors production
Depuis une copie fraîche de la branche :
```bash
node --version
npm ci --omit=dev
npm run verify
```
Node 20 est vieillissant : tester Node 22 sur une copie ou une préproduction avant de modifier la version dans hPanel. Ne pas modifier les variables de production pour faire réussir des tests.

`npm ci` nécessite un accès au registre npm. S'il échoue sur un hôte privé/injoignable, relever **seulement le nom du domaine et le code d'erreur**, jamais les identifiants ni jetons.

## Si le build Hostinger échoue avant les logs
1. Ouvrir **hPanel → swapp.tv → Déploiements**. Vérifier le commit tenté, l'heure, le statut et la présence/absence de logs.
2. Ouvrir les **journaux d'exécution** séparément : un ancien serveur qui fonctionne n'est pas un build réussi.
3. Vérifier que le domaine et la branche GitHub sont toujours correctement connectés, et que l'abonnement/les restrictions de la plateforme ne bloquent pas la mise à jour.
4. En cas de zéro ligne de build, demander au support Hostinger : « Pour swapp.tv, déploiement Node.js GitHub du 10 mai 2026, échec en environ 3 secondes sans aucune ligne de build. Pouvez-vous donner l'erreur brute du système de build et confirmer l'état de la connexion GitHub ? »
5. **Ne pas relancer à l'aveugle ni supprimer l'application**. Éviter également de basculer vers ZIP sans sauvegarde et procédure validée.

## Porte de mise en production
- Sauvegarde **testée** des comptes Firestore et sauvegarde Hostinger disponible.
- Identification de la **version effectivement active** (l'audit signale `1.0.13` en production contre `1.0.14` dans le dépôt).
- `npm run verify` réussi, installation des dépendances réussie, démarrage et pages de santé contrôlés en préproduction.
- Contrôle des parcours Twitch, connexion SWAPP, découverte, tchat et paiement s'il est activé.
- Plan de retour arrière enregistré, puis seulement fusion des PR dans l'ordre de dépendance.

## Limites
Ce préflight est un contrôle statique et de syntaxe. Il ne remplace pas l'installation des modules, le démarrage du serveur, les tests de charge, la restauration des données, ni les journaux internes Hostinger. Une réussite locale ne démontre pas un déploiement réel.
