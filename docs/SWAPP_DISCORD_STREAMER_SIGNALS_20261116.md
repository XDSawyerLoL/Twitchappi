# SWAPP SERVEUR + — Signaux Streaming Discord (16/11/2026)

## But
Faire ressortir les créateurs de la communauté qui sont actuellement signalés en diffusion par Discord, **sans publier automatiquement l'activité de membres qui n'ont pas consenti**.

## Ce que Discord fournit réellement
- Le **Mode Streamer** dans le client Discord est un réglage de confidentialité, non une valeur publique interrogeable via l'API.
- Un bot connecté au **Gateway** peut recevoir une activité de présence `Streaming` (type 1), pour Twitch ou YouTube, lorsque l'intent privilégié `GUILD_PRESENCES` est autorisé et que Discord transmet effectivement cette activité.
- Cette première intégration accepte uniquement les liens `https://twitch.tv/<login>` et `https://www.twitch.tv/<login>` et seulement les créateurs avec une association Twitch **approuvée** par le propriétaire.
- Un signal Discord seul affiche **« STREAMING SUR DISCORD »**, jamais « EN DIRECT » tant que les flux SWAPP ne le confirment pas.
- Les enregistrements expirent **2 minutes** après leur dernière mise à jour. Un direct de plus de deux minutes peut donc perdre ce badge si Discord n'émet pas de nouvelle présence ; le flux Twitch confirmé par SWAPP reste traité séparément. Ce mécanisme privilégie l'absence de faux direct à l'exhaustivité.

## Prérequis opérateur (pas d'API payante)
1. Installer le bot Discord officiel SWAPP dans la communauté concernée. L'OAuth Discord Connect existant et ses webhooks **ne suffisent pas** pour recevoir les présences.
2. Dans le portail développeur Discord, activer le privilège **Presence Intent** (`GUILD_PRESENCES`), sous réserve des conditions de Discord.
3. Configurer dans le processus Node Hostinger :
   - `SWAPP_DISCORD_PRESENCE_ENABLED=1`
   - `SWAPP_DISCORD_PRESENCE_BOT_TOKEN=<secret du bot>`
   - `SWAPP_ACCOUNT_MYSQL_URL` : base contenant les identités Discord liées à SWAPP (ou `SWAPP_MYSQL_URL` si les tables sont dans la même base)
   - `SWAPP_SERVERS_MYSQL_URL` / `SWAPP_MYSQL_URL` : base contenant les communautés et les associations de chaînes.
4. Le serveur Discord doit correspondre à un `discord_guild_id` vérifié sur la fiche SERVEUR +. Dans l'état actuel, c'est particulièrement adapté à la catégorie **Discord / Multigaming** ; l'association d'un Discord à un serveur de jeu classique exige une évolution du formulaire.
5. Chaque streamer doit connecter son compte Discord à son compte SWAPP, associer sa chaîne Twitch à cette communauté, obtenir l'approbation du propriétaire puis cliquer sur **« Autoriser l'affichage »** sur la fiche.

## Architecture
- `modules/swapp-discord-streamer-signals.js` reçoit les présences de type Streaming via Gateway, cherche une identité Discord reliée à SWAPP et ne conserve que les créateurs approuvés et ayant activé le consentement spécifique.
- `swapp_server_discord_stream_optin` : consentement par utilisateur et communauté, révocable.
- `swapp_server_discord_stream_presence` : signal limité à `server_id`, utilisateur SWAPP, `guild_id`, login Twitch et date d'expiration. Aucun message Discord, salon, liste de membres ou token n'est exposé.
- `GET /api/swapp/serveurs/:id/community` fournit `discordStreaming` (uniquement créateurs consentants et approuvés).
- `POST /api/swapp/serveurs/:id/discord-stream/opt-in` active/désactive le consentement d'un créateur connecté, déjà approuvé et attaché au bon Discord.
- La version de la liste « Lives associés » conserve la distinction entre diffusion **confirmée par SWAPP** et **signalée par Discord**.

## Limites
- Aucun mode « détecter tous les membres qui ont activé le Mode Streamer » n'est possible via l'API.
- Si le bot est absent, le privilège désactivé, la base MySQL inaccessible ou Hostinger arrête le processus Node, aucun nouveau signal n'est généré.
- La disponibilité réelle du bot et l'affichage sur `swapp.tv` doivent être testés après déploiement. **Le merge GitHub n'effectue pas ce déploiement.**
- Le bot fait partie du même processus Node déjà hébergé ; il ne nécessite pas de VPS supplémentaire mais demande une connexion Gateway stable.
- Pour YouTube, SWAPP Live natif et d'autres communautés, une extension de comptes/identités et de validation est nécessaire.

Références primaires : https://discord.com/developers/docs/events/gateway-events#presence-update et https://support-dev.discord.com/hc/fr/articles/6207308062871-Que-sont-les-Intents-de-Privil%C3%A8ge
