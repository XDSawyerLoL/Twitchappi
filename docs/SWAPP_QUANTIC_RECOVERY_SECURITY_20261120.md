# SWAPP · récupération et rotation de Quantic ID

## Menace

Une copie d'ancienne clé USB reste utilisable aussi longtemps que la clé publique
correspondante est liée au compte SWAPP. Modifier le chiffrement du coffre local ne
révoque pas une copie déjà volée.

## Nouvelle procédure

1. Tant que le coffre d'origine est accessible, se connecter à SWAPP via Identity Vault.
2. Dans /compte, demander **Créer mes codes de récupération**. Une signature valide du
   coffre, liée à un défi serveur, est indispensable.
3. Conserver les **8 codes secrets indépendamment** de la clé USB et du PC.
   Ils ne sont affichés en clair **qu'une fois**. L'inscription d'un nouveau lot
   invalide le précédent. L'enregistrement côté serveur utilise des HMAC-SHA256 ;
   aucune copie en clair n'est stockée dans MySQL.
4. Facultatif, après sauvegarde des codes : sélectionner
   **Rendre Identity Vault obligatoire**. Une nouvelle preuve signée est exigée ;
   les anciennes connexions par mot de passe et les jetons persistants ne sont
   plus autorisés pour ce compte.
5. Après vol/perte de l'ancien coffre, créer un **nouveau Quantic ID** sur un support
   protégé (USB deux facteurs ou clé matérielle), puis depuis la connexion
   SWAPP choisir **Récupérer mon compte avec un code**. Un code à usage unique
   et une signature fraîche du NOUVEAU coffre sont exigés.
6. SWAPP remplace l'association clé-compte dans **une transaction MySQL**.
   Les autres codes sont annulés. L'ancienne clé ne peut plus renouveler de
   session ni ouvrir de nouvelle session. L'utilisateur conserve le même compte.
7. Une fois reconnecté, générer **un nouveau lot** de codes hors-ligne.

## Protections techniques

- Contrainte MySQL : une clé publique appartient à un seul compte et un compte
  possède une seule clé active.
- `SELECT ... FOR UPDATE` sur le code et sur le compte avant rotation ;
  `UPDATE` conditionnel et consommation dans la même transaction.
- Les codes sont des secrets aléatoires de 256 bits ; limite de requêtes et
  vérification d'origine HTTPS. Les codes ne passent jamais dans une URL.
- L'ancienne session Quantic est révoquée lors de la requête suivante si le
  hash de clé en session ne correspond plus à la base MySQL.
- Le mode Vault obligatoire est **opt-in** et exige des codes de secours déjà
  créés. Les utilisateurs non inscrits ne perdent pas leur connexion classique.
- Les comptes protégés refusent les anciens jetons, le reset de mot de passe
  et le vieux client-recover.

## Limites et opérations

- Tout utilisateur ayant copié l'ancien support **avant la révocation** pourrait
  encore exploiter sa clé jusqu'à la rotation.
- Un malware exécuté dans la session Windows ou du code malveillant servi
  par SWAPP peut agir sur des sessions déjà valides. Le présent chantier
  réduit la fenêtre et ajoute des preuves de revalidation, sans pouvoir
  garantir l'inviolabilité.
- Des connecteurs ou mécanismes SSO tiers supplémentaires peuvent nécessiter
  une validation spécifique. Réaliser un audit d'intrusion indépendant.
- MySQL et le secret serveur doivent être persistants et sauvegardés. Ne
  jamais modifier le secret de signature HMAC sans un plan de migration.
- Le code fusionné sur GitHub doit être déployé sur Hostinger pour entrer
  en service ; le merge GitHub seul ne met pas SWAPP en production.
