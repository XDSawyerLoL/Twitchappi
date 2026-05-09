SWAPP — correctif page streamer publique

But :
- /pseudo doit être visible sans connexion.
- Le gestionnaire / dashboard restent privés.
- Swapp Local remonte un lecteur public et le site l’affiche sans attendre une session compte.

Fichiers importants :
- server.js : backend réel du site.
- index_script.js : interface avec correctif de route publique.
- package.json : corrigé, avec npm start.
- public/downloads/oryon-local-app.zip : dernière app locale stable.

Déploiement Render :
1. Remplacer les fichiers du site par ceux du zip.
2. Build command : npm ci --omit=dev
3. Start command : npm start
4. Variable conseillée : ORYON_LIVE_SIGNAL_TIMEOUT_MS=120000

Test public :
- Ouvre https://ton-site/pseudo dans un navigateur privé.
- La page doit s’afficher même sans compte.
- Si le live est ON dans Swapp Local, le bloc Page publique doit indiquer que le lecteur est branché.
