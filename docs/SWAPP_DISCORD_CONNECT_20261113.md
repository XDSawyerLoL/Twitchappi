# SWAPP Discord Connect + Live Bot + communautés (13/11/2026)

## Livraison
- Page propriétaire : https://swapp.tv/discord (accès depuis menu du compte SWAPP et menu du catalogue immersif).
- Connexion OAuth2 du compte Discord : `identify` uniquement ; pas de connexion SWAPP obligatoire via Discord.
- Autorisation serveur : `identify guilds webhook.incoming`. Discord affiche une sélection explicite de serveur et salon ; SWAPP vérifie identité liée et permission de gestion du serveur.
- Jusqu'à cinq serveurs autorisés par créateur. Chaque serveur est activable/désactivable et sa visibilité publique est distincte et OFF par défaut. Le propriétaire peut enregistrer une invitation publique `discord.gg` validée (facultative). `/api/swapp/discord/creator/:login` ne renvoie que les noms et invitations des serveurs expressément affichés par le créateur. Les communautés consenties apparaissent en petits liens dans la barre sociale sous son lecteur.
- Envoi d'un embed de direct uniquement après playlist HLS et segments TS publiés. Identifiant de diffusion unique : contrainte MySQL `(swapp_user_id,guild_id,event_id)` pour empêcher les doublons entre processus Hostinger.
- Aucune permission de lire les messages Discord, aucun accès aux salons vocaux, aucun bot Gateway, aucune synchronisation abusive de membres ou de rôles. Connexion optionnelle.
- Les URLs de webhooks Discord sont chiffrées AES-256-GCM au repos dans l'actuel MySQL Hostinger et ne sont jamais renvoyées au navigateur ; les tokens OAuth ne sont pas enregistrés.
- Le gestionnaire ne déclenche aucun ping global (`allowed_mentions.parse=[]`). Un statut live seul sans vidéo vérifiée ne déclenche pas d'annonce.

## Configuration unique sur Hostinger (variables privées, jamais dans GitHub)
1. Créer une application Discord dans https://discord.com/developers/applications . Copier son Application ID et son Client Secret.
2. Dans la configuration OAuth2 de l'application Discord, enregistrer exactement : `https://swapp.tv/api/swapp/discord/callback`.
3. Placer dans l'environnement **Node** de SWAPP :
   - `SWAPP_ACCOUNT_STORE=mysql` : l'identité SWAPP doit déjà être persistée avec les comptes MySQL existants.
   - `SWAPP_ACCOUNT_MYSQL_URL` ou `SWAPP_MYSQL_URL` : connexion privée à la base Hostinger existante.
   - `SWAPP_DISCORD_CLIENT_ID` : Application ID officiel Discord.
   - `SWAPP_DISCORD_CLIENT_SECRET` : secret OAuth Discord.
   - `SWAPP_DISCORD_REDIRECT_URI=https://swapp.tv/api/swapp/discord/callback`.
   - `SWAPP_DISCORD_ENCRYPTION_KEY` : 32 octets aléatoires en hexadécimal, soit 64 caractères (exemple de génération : `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`). Ne jamais le publier ni le remplacer à la légère.
   - `SESSION_SECRET` : secret SWAPP déjà utilisé, stable entre les processus Node.
   - `SWAPP_DISCORD_ENABLED=true` (facultatif ; `false` désactive l'intégration).
4. Redémarrer l'application Hostinger. Le module crée trois tables MySQL : `swapp_discord_identities`, `swapp_discord_communities`, `swapp_discord_live_outbox` ; il ne modifie pas la structure des comptes SWAPP.
5. Se connecter d'abord à un compte SWAPP. Ouvrir `/discord`, autoriser **son propre compte** Discord, puis « Relier un serveur / salon ». Discord doit confirmer le serveur et le salon choisis.
6. Dans l'interface, activer « Annonces live », puis démarrer un véritable flux OBS SWAPP avec playlist et segments vidéo valides. Vérifier une carte dans le salon choisi.
7. Activer « Afficher sur SWAPP » uniquement si le serveur doit apparaître publiquement comme communauté du créateur.

## Sécurité et fonctionnement
- OAuth state HMAC, horodaté 10 minutes et lié à l'ID du compte SWAPP ; compatible avec plusieurs processus Node, sous réserve qu'ils partagent `SESSION_SECRET` et que la session SWAPP puisse être récupérée.
- Seuls les webhooks obtenus via OAuth avec consentement du gestionnaire sont conservés ; aucune URL de webhook ne peut être injectée par un navigateur.
- Les actions de suppression et paramétrage nécessitent une session SWAPP et une requête JSON de même origine. Un débranchement supprime les autorisations et messages en attente de SWAPP, sans modifier les messages Discord déjà publiés.
- Les erreurs d'envoi ambiguës ne sont pas automatiquement répétées, évitant les doublons après perte de la réponse ; HTTP 429 reçoit un délai de reprise borné.
- Si un streamer possède plusieurs salons, le relais ne publie que dans ceux qui ont encore leur autorisation `enabled=1`.

## Limites
- Cette mise à jour est du code source : elle nécessite une livraison Hostinger et la configuration OAuth Discord pour être réellement activée.
- Le module « Live Bot » fonctionne par webhook officiellement autorisé, sans bot connecté en permanence et sans lire les messages/présences Discord.
- Il n'invite pas les membres automatiquement dans le serveur, ne réplique pas les messages privés ni les rôles. La synchronisation porte sur l'association volontaire des communautés et leurs annonces.
- Pour révoquer également le webhook du côté Discord, le gestionnaire peut supprimer l'intégration dans les paramètres du serveur Discord.
- Aucun service payant supplémentaire ni VPS n'est requis.
