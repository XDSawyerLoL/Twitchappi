# Quantic ID — identité SWAPP unifiée (20 novembre 2026)

**PR #329 : intégration dans le module principal de connexion SWAPP.**
La seule interface de connexion se trouve sur `/compte`, dans le formulaire SWAPP habituel. L'ancien panneau `Quantic ID · Présence éphémère` et celui de connexion Quantic ne sont plus montés.

## Utilisation
1. Sur `/compte`, cliquer sur **le logo officiel Identity Vault** placé sous le formulaire de connexion SWAPP. Aucun identifiant ou mot de passe SWAPP supplémentaire n'est demandé.
2. Le navigateur cherche `http://127.0.0.1:47621`. Identity Vault doit être installé, déverrouillé et autorisé pour `https://swapp.tv`. Si le coffre est verrouillé, le système ne contourne pas sa protection.
3. Le coffre signe un défi aléatoire, à usage unique, lié à l'origine SWAPP. L'API vérifie la preuve, trouve l'identité cryptographique déjà associée au compte SWAPP et crée une vraie session Express SWAPP. Le profil et les droits normaux du compte sont conservés ; les privilèges admin ne sont pas accordés par Quantic seul.
4. Pour une identité jamais associée, se connecter au compte SWAPP habituel **une fois**, puis cliquer sur le logo dans le compte connecté pour autoriser l'association. Aucune ressaisie du mot de passe n'est requise dans cette étape. Une identité inconnue n'ouvre pas de compte SWAPP par hasard.
5. La présence éphémère n'a plus de bouton indépendant. Elle découle automatiquement de la connexion SWAPP authentifiée + Identity Vault actif et s'éteint si la preuve locale n'est plus renouvelée (TTL de présence 10 secondes). Les signatures et clés privées restent dans le coffre.
6. La session créée par Quantic possède une durée de vie de 30 secondes, renouvelable par de nouvelles signatures via le gardien de session. Le verrouillage du coffre empêche le renouvellement et la session est révoquée au prochain contrôle.

## Points de sécurité et validation
- Liaison : session SWAPP déjà authentifiée + clic explicite sur le logo + signature valide. Pas d'association par simple similitude de pseudo.
- Unicité MySQL via `swapp_quantic_account_bindings` et HMAC de l'identifiant cryptographique ; les clés privées ne quittent pas Identity Vault.
- Aucun nouveau mot de passe Quantic ID demandé par SWAPP ; verrouillage et autorisations locales de Vault toujours applicables.
- Déconnexion SWAPP et renouvellement de session restent indépendants des démonstrations de présence.
- L'absence de service local ou l'interdiction d'accès loopback par le navigateur doit afficher une erreur explicite.
- Tester la vraie session `/api/oryon/session`, le rendu du logo, le premier lien, une clé inconnue, une clé incorrecte, le verrouillage de Vault, la réouverture, plusieurs onglets, Socket.IO et le comportement en cas de coupure réseau.
- Vérifier CI puis déploiement Hostinger et rendu réel avant d'affirmer que la production est opérationnelle. Une fusion GitHub n'est pas une preuve de déploiement.
