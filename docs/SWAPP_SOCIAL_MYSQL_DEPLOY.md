# SWAPP SOCIAL — MySQL deployment gate (16 Oct 2026)

Current state: the MySQL API code and InnoDB schema are committed. Production **is not verified**. The server feature flag remains disabled. The runtime dependency mysql2 is **not yet part of package-lock.json**, because the package registry was unavailable from the build environment. Do not turn the feature on until that is resolved.

## Required on the Hostinger deployment/release source

1. Connect to the existing Hostinger MySQL database. Create a dedicated user with privileges only for the SWAPP SOCIAL tables.
2. Execute `migrations/mysql/002_swapp_social_interactions.sql` using phpMyAdmin or the MySQL client.
3. In the actual release checkout, run `npm install mysql2@^3 --save` to update **both** package.json and package-lock.json; commit both files before building/deploying. Verify `npm ci --omit=dev` succeeds from a clean checkout. Never commit passwords.
4. Set `SWAPP_MYSQL_URL=mysql://USER:PASSWORD@HOST:3306/DB_NAME` in Hostinger application secrets (URL-encode special characters), and only then set `SWAPP_SOCIAL_FEATURES=1`.
5. Restart the Node app. Run `node tools/swapp-social-smoke.js`. An anonymous GET on `/api/swapp/interactions/rooms` should return 401, not 404/500; authenticated requests should return 200 with `rooms` array.
6. With a temporary SWAPP testing account, create a match, poll, vote and room, post a room message, then restart the Node process and verify records survive. Check second vote returns 409 and cross-origin POST returns 403. Repeat on iPhone Safari and Android Chrome.
7. Do not call realtime WebSocket messaging implemented: room chat currently polls every 5 seconds. Do not call matching intelligent: it scores exact game, platform and style.

Note: Production validation requires access to the actual Hostinger deployment and SWAPP credentials. The smoke script does not test private workflows and does not modify data. The temporary JSON prototype in `modules/swapp-social-interactions.js` is not mounted when the feature is enabled; the MySQL implementation is selected instead.
