# Quantic ID : connexion au véritable compte SWAPP

**Statut : implémentation en revue et tests CI obligatoires avant production.**

## Pourquoi la présence seule ne suffisait pas
La présence Quantic ID affichait un nom sur /compte mais **ne créait pas de session SWAPP**. Une présence cryptographiquement authentifiée ne donne pas automatiquement le droit d'accéder à un compte existant.

## Parcours correct
1. Se connecter normalement avec son compte SWAPP habituel.
2. Dans /compte, rubrique « Quantic ID · Connexion à mon compte SWAPP », entrer **une fois le mot de passe SWAPP actuel**, puis « Associer Quantic ID à mon compte ».
3. Déverrouiller Quantic Identity Vault v0.4.1, confirmer l'autorisation du domaine SWAPP et laisser le coffre signer le défi.
4. La liaison est persistée dans **MySQL Hostinger** (`swapp_quantic_account_bindings`) : identifiant cryptographique HMAC-SHA256 (non réversible), ID stable du compte SWAPP, date de liaison. Aucun mot de passe, clé privée ou preuve brute stockée.
5. Se déconnecter du compte SWAPP. Depuis /compte, cliquer « Me connecter à SWAPP avec Quantic ID ». Le coffre signe un nouveau défi. Si le même identifiant est associé, la **vraie session Express** de ce compte est ouverte ; le compte, son profil et sa chaîne restent les mêmes.
6. Verrouiller Quantic ID : le JavaScript du navigateur signale la fermeture du coffre et déconnecte la session, y compris via Socket.IO. Si la requête ne parvient pas au serveur (navigateur fermé, coupure réseau), la session expire **au plus tard à son prochain contrôle au-delà de 30 secondes**.
7. Pour supprimer la liaison, se reconnecter avec son mot de passe SWAPP et choisir « Dissocier Quantic ID ». Une session ouverte seulement avec Quantic ID ne peut pas dissocier l'identité.

## Protections
- Aucune identité Quantic ID inconnue ne peut créer un nouveau compte ou prendre le compte SWAPP existant d'un tiers.
- Le **premier lien exige à la fois une session SWAPP existante, son mot de passe actuel et une signature Quantic valide**.
- Le défi de connexion est aléatoire, unique, limité dans le temps, associé à l'origine et à la session.
- La liaison persistante impose les contraintes MySQL UNIQUE, empêchant une même clé d'être attribuée à deux comptes ou un compte à deux clés sans dissociation.
- La session a une durée de 30 secondes renouvelée en signant un nouveau défi. Le verrouillage met fin à la possibilité de renouvellement ; aucun cookie SWAPP « Se souvenir de moi » longue durée n'est émis.
- Les comptes ayant besoin de privilèges administrateur doivent se réauthentifier avec leur moyen habituel : **Quantic ID seul ne donne aucun droit admin**.
- La session mémorisée par `memorystore` reste **locale à un processus Node**. Si Hostinger exécute plusieurs processus sans store partagé, la session sera interrompue ou le défi introuvable ; la synchronisation multiworker reste une condition préalable à la production publique.
- Les clés restent dans Identity Vault. Le site ne conserve que l'empreinte HMAC du QID, le compte associé et un état de session expirant.
- Les caches de présence Quantic ID restent une fonctionnalité facultative distincte de l'authentification SWAPP.

## Pré-requis d'hébergement
- `SWAPP_ACCOUNT_STORE=mysql` + une URL MySQL du compte SWAPP valide.
- `SESSION_SECRET` stable de **24 caractères minimum**, sans le mettre dans le dépôt. Une rotation rendrait les associations existantes introuvables, à prévoir dans un protocole de migration.
- Identity Vault >= 0.4.1 sur l'ordinateur de l'utilisateur, autorisation de l'origine SWAPP.
- Tests CI complets et validation navigateur, routage MySQL et contrôles anti-bot avant déploiement Hostinger.

## À valider avant annonce
- `npm ci` et test `test/swapp-quantic-account-login.test.js`.
- Test de l'association et de la connexion sur le véritable compte SWAPP, contrôle de l'affichage /compte et de /api/oryon/session.
- Verrouillage manuel, USB retirée, navigateur fermé, sessions Socket.IO, onglets multiples, coupures réseau et double instance.
- Audit de sécurité et sauvegarde MySQL avant exposition à tous les utilisateurs.

**Ne pas présenter cela comme une certification de sécurité ou un système SSO universel.**
