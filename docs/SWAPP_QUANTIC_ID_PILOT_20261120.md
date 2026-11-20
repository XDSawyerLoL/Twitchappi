# Quantic ID x SWAPP.TV — pilote sur le véritable code du site
Date : 20 novembre 2026

## Ce qui a été ajouté
Sur la page /compte, un panneau volontaire « Quantic ID · Présence éphémère » propose de s'annoncer sur SWAPP au moyen d'une preuve Ed25519 ou P-256 générée par le logiciel Identity Vault de l'utilisateur. La clé privée reste dans Identity Vault.

Routes SWAPP : /api/quantic-id/challenge, /activate, /renew, /lock, /visible, /status et /health. Les défis et présences vivent seulement dans la mémoire du processus Node, sans MySQL ni données persistantes ; la durée de présence est de 10 secondes si aucune nouvelle preuve signée n'arrive.

La présence publique ne révèle ni l'empreinte cryptographique QID ni le secret de session. La session temporaire est détenue par un cookie HttpOnly, SameSite=Strict, Secure en production. Les POST nécessitent une origine HTTPS SWAPP exacte.

**Ce n'est pas encore une connexion aux comptes SWAPP persistants.** Aucune route créateur, administration, publication ou compte MySQL n'est autorisée par ce module. Cela évite de permettre un détournement de compte sans association explicite validée et auditée.

## Conditions de fonctionnement
- L'app Identity Vault installée sur le PC de l'utilisateur doit reconnaître https://swapp.tv comme origine autorisée, et disposer d'un mécanisme de consentement de l'utilisateur.
- Le navigateur doit autoriser la liaison locale à http://127.0.0.1:47621. Plusieurs politiques de sécurité (Private Network Access) peuvent la bloquer : vérifier le comportement réel sur Chrome/Edge/Firefox.
- L'utilisateur doit déverrouiller son coffre puis autoriser explicitement la connexion via le panneau SWAPP.
- Pour la première version, la présence est par mémoire d'instance. Plusieurs instances Node non partagées ne synchronisent pas les présences ; ne PAS présenter le déploiement comme multiworker robuste.
- La déconnexion inter-sites, les identifiants pseudonymes propres à chaque site, les règles RGPD, la cryptographie QSC1 et les comptes SWAPP restent des chantiers distincts.

## Déploiement
GitHub n'est PAS Hostinger. La présence du code sur une branche ou même sur master ne prouve pas que le site swapp.tv l'exécute : redéployer explicitement l'application Node via hPanel, contrôler les endpoints, les connexions existantes, et prévoir un rollback.

Aucun secret ou clé privée ne doit être importé dans le backend SWAPP, et aucun token ne doit être conservé en JSON/MySQL. Ne pas transformer ce pilote en login complet sans la liaison de compte volontaire et une vérification de sécurité.

## Tests
node --check modules/swapp-quantic-id-presence.js
node --check assets/swapp-quantic-id-site.js
node --test test/swapp-quantic-id-site.test.js

## Réserve de sécurité
Ne pas déployer en production sans vérifier le fonctionnement réel avec la version compatible d'Identity Vault, la confirmation de l'origine, les protections anti-CSRF, les échanges locaux du navigateur, et les tests de charge. Les noms visibles sont volontaires ; ne pas afficher de données d'état de présence lorsque le client ne l'a pas explicitement activée.
