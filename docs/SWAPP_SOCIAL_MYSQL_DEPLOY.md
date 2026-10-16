# SWAPP SOCIAL — MySQL deployment gate (16 Oct 2026)

Current state: the MySQL API code and InnoDB schema are committed. Production **is not verified**. The server feature flag remains disabled. The runtime dependency mysql2@3.23.1 is now declared in package.json and package-lock.json (GitHub commit 287e1e76). Production and a clean npm ci build remain **unverified**. Keep the feature disabled until the SQL schema, actual MySQL host and build are confirmed.

## Required on the Hostinger deployment/release source

1. Connect to the existing Hostinger MySQL database. Create a dedicated user with privileges only for the SWAPP SOCIAL tables.
2. Execute `migrations/mysql/002_swapp_social_interactions.sql` using phpMyAdmin or the MySQL client.
3. Redeploy the GitHub revision containing mysql2 and the matching package-lock.json. Confirm the Hostinger build with `npm ci --omit=dev` succeeds (this could not be tested from the assistant environment). Never commit passwords.
4. Set `SWAPP_MYSQL_URL=mysql://USER:PASSWORD@REAL_HOST:3306/DB_NAME` in Hostinger application secrets (URL-encode special characters). `REAL_HOST` MUST be replaced by the actual Hostinger MySQL hostname; do not keep literal `HOST`. Rotate any password that appeared in a shared screenshot. After installing the SQL schema and confirming build, set `SWAPP_SOCIAL_FEATURES=1`.
5. Restart the Node app. Check `/api/swapp/interactions/status`: `enabled:false/state:disabled` means the flag is off; `enabled:true/state:configured_not_verified` means routes were mounted (database connection still needs validation). An anonymous GET on `/api/swapp/interactions/rooms` should then return 401; authenticated requests should return 200 with a `rooms` array. Run `node tools/swapp-social-smoke.js` to check public routes without writing data.
6. With a temporary SWAPP testing account, create a match, poll, vote and room, post a room message, then restart the Node process and verify records survive. Check second vote returns 409 and cross-origin POST returns 403. Repeat on iPhone Safari and Android Chrome.
7. Do not call realtime WebSocket messaging implemented: room chat currently polls every 5 seconds. Do not call matching intelligent: it scores exact game, platform and style.

Note: Production validation requires access to the actual Hostinger deployment and SWAPP credentials. The smoke script does not test private workflows and does not modify data. The temporary JSON prototype in `modules/swapp-social-interactions.js` is not mounted when the feature is enabled; the MySQL implementation is selected instead.
