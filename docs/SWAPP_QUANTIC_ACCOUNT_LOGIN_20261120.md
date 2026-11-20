# Quantic Identity Vault — connexion et inscription natives SWAPP

Date de conception : 20 novembre 2026. Implémentation PR #330.

## Un seul logo dans le formulaire principal

Sur `/compte`, le logo Identity Vault constitue une méthode d'authentification alternative au pseudo et au mot de passe SWAPP, sans panneau distinct ni double présence.

Au clic, le navigateur contacte Identity Vault local à `127.0.0.1:47621`, contrôle qu'il est déverrouillé et autorisé pour l'origine SWAPP, puis lui fait signer un défi unique et limité dans le temps.

- **Identité Quantic déjà associée :** SWAPP trouve l'identifiant cryptographique HMAC en MySQL, restaure exactement l'ancien compte et ouvre la session Express.
- **Identité Quantic inconnue :** le même clic et la même signature donnent lieu à la création d'un nouveau compte SWAPP + liaison Quantic ID en transaction MySQL unique ; le compte est immédiatement connecté. Nom et ID sont générés aléatoirement. L'identité inconnue ne peut jamais s'approprier un compte existant en prétendant porter le même alias ou e-mail.
- **Compte SWAPP existant non encore associé :** se connecter une fois par la méthode habituelle, puis cliquer sur l'option d'association Identity Vault depuis le compte déjà ouvert. Le lien exige la signature cryptographique du coffre ; pas de ressaisie du mot de passe SWAPP.

## Stockage et protections

La création fait simultanément les INSERT dans `swapp_oryon_accounts` et `swapp_quantic_account_bindings`, dans **une seule transaction**. En cas de défaillance d'écriture ou de doublon, rollback intégral. Les contraintes MySQL interdisent l'affectation d'une même identité Quantic à deux comptes. Un plafond de comptes et un limiteur de création sont conservés pour éviter les inscriptions massives.

Le compte Quantic-only possède un mot de passe aléatoire inconnu de son titulaire, et une adresse technique réservée en `.invalid` dans le stockage pour satisfaire le schéma existant. Cette adresse n'est ni une adresse vérifiée ni un moyen de récupération et n'est pas exposée dans la session. L'association ne divulgue ni la clé privée ni le secret de session à SWAPP.

Les comptes Quantic-only ne peuvent pas dissocier leur unique moyen d'authentification avant qu'un autre mode de récupération ou de connexion soit disponible. **Risque à traiter** : sans procédure de récupération de coffre ou identifiant de secours, perdre Identity Vault peut rendre le compte inaccessible. Une future itération devra permettre de rattacher puis de vérifier une adresse de récupération.

Les sessions Quantic ID expirent au bout de 30 secondes sans renouvellement de preuve par le coffre. La présence éphémère est dérivée de la session, et non actionnée par un second bouton.

## Validation et mise en production

- Exécuter la CI du dépôt sur `test/swapp-quantic-account-login.test.js` et `test/swapp-quantic-id-site.test.js` : signatures invalides, création, reconnexion sans doublon, conservation du compte existant, rollback MySQL, dissociation interdite.
- Déployer `master` sur Hostinger avec la méthode hPanel existante : la fusion GitHub **n'est pas** le déploiement de l'application Node.
- Tester en conditions réelles le clic sur le logo, la détection locale (Chrome/Edge et permission loopback), la session `/api/oryon/session`, l'absence de double panneau et le verrouillage de Vault.
