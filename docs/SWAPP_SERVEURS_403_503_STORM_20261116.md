# SWAPP SERVEUR+ — HTTP 403/503 récurrents (16 novembre 2026)

## Lecture des logs

Les cinq HTTP 403 observés sur GET /api/swapp/serveurs/moderation/count ne prouvent pas une panne MySQL : cette route est réservée aux administrateurs. L'ancien script la sollicitait à chaque ouverture de page et lors des rafraîchissements, même pour un compte non modérateur.

Les HTTP 503 sur GET /api/swapp/serveurs sont un problème distinct. Une ligne d'accès ne suffit pas pour distinguer une erreur Node/MySQL d'une page de protection WAF. L'ancien diagnostic a déjà constaté des défis reCAPTCHA Enterprise et un quota dépassé sur les URL publiques de SWAPP.

## Corrections livrées dans GitHub

- Route légère GET /api/swapp/serveurs/moderation/access : {canModerate: true/false}, calculée uniquement depuis la session, sans requête MySQL. Réponse privée non mise en cache. Le navigateur appelle le compteur admin seulement lorsque la capacité est vraie. La route de modération continue à répondre 403 aux comptes non autorisés.
- Le client distingue un vrai refus JSON acces_refuse d'un CAPTCHA/403 HTML amont. Non-admin : arrêt des demandes de compteur ; WAF HTML : temporisation dix minutes et aucun appel au compteur.
- Une instance de la barre de notifications seulement par document ; suppression de la tentative automatique à 12 secondes ; intervalle des administrateurs étendu à trois minutes.
- Une seule initialisation de l'annuaire par page ; annulation des requêtes obsolètes ; temporisation de 20 secondes sur une URL qui vient d'échouer ; actualisation manuelle conservée.
- Les vérifications SQL de présence de swapp_game_servers sont regroupées entre requêtes simultanées et leur résultat **positif** mémorisé pendant 15 secondes, afin d'alléger le coût MySQL. Une erreur n'est jamais cachée ni convertie en 0 serveurs.
- Correction de la chaîne SQL avec guillemets doubles dans le test de bannière de classement (incompatible avec ANSI_QUOTES) et repli étendu aux erreurs de parsing de tables facultatives, sans inventer de résultats de votes.
- Un 503 Node renvoie un Retry-After de 20 secondes et un code reason sûr pour le diagnostic ; aucune URL SQL ou mot de passe n'est envoyé.

## Diagnostic réel après déploiement Hostinger

Inspecter l'onglet Réseau du navigateur sur GET /api/swapp/serveurs :

1. Si la réponse est du JSON SWAPP, noter le champ reason :
   - mysql_not_configured : vérifier uniquement les noms des variables SWAPP_SERVERS_MYSQL_URL / SWAPP_MYSQL_URL / SWAPP_ACCOUNT_MYSQL_URL et le redémarrage Node.
   - schema_missing : retrouver la base qui contient les fiches existantes. Ne pas recréer une table vide dans une autre base.
   - mysql_connection_failed : étudier les journaux du service MySQL et ses limites.
   - mysql_access_denied : vérifier les autorisations SQL.
   - sql_schema_mismatch : inspecter les tables et le mode SQL.
   - service_unavailable : lire la phase et le code d'erreur dans le journal Node.
2. Si la réponse est du HTML de défi reCAPTCHA Enterprise / protection de navigateur, corriger la règle du CDN/WAF dans le panneau d'hébergement. Un changement JavaScript sur SWAPP ne peut pas supprimer une vérification effectuée avant Node.
3. Si l'utilisateur est administrateur et reçoit toujours 403 sur moderation/count, vérifier la session courante et la variable ORYON_ADMIN_USER_IDS sans communiquer sa valeur publiquement.
4. Contrôler GET /api/swapp/serveurs/diagnostic avec une **vraie session admin** ; cette route reste interdite aux visiteurs ordinaires.

## Test et publication

Exécuter : node --test test/swapp-servers-request-storm-20261116.test.js test/swapp-servers-listing-recovery-20261115.test.js test/swapp-servers-diagnostic-and-waf-20261115.test.js test/swapp-servers-discord-autovalidation-20261115.test.js

Déployer les fichiers de master sur Hostinger, redémarrer Node, purger les versions CDN des scripts et vérifier l'absence de nouvelles requêtes de compteur envoyées depuis une session ordinaire. Vérifier qu'une session administrateur voit toujours ses validations. Le mode reCAPTCHA/WAF doit être configuré dans son service, sans désactiver la protection des connexions et des mutations.

Aucune modification du contenu MySQL existant n'est requise. Une fusion GitHub ne déploie pas Hostinger.
