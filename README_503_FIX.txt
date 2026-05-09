SWAPP — correctif 503 Service Unavailable

Cause probable du 503 :
- Le package-lock.json n'était pas synchronisé avec package.json.
- Sur Render, la commande npm ci --omit=dev échoue dans ce cas.
- Si le build échoue ou que le serveur ne démarre pas, Render affiche souvent 503 Service Unavailable.

Ce zip corrige :
- package-lock.json resynchronisé.
- package.json version 1.0.4-503-fix.
- npm ci --omit=dev vérifié localement.
- node server.js vérifié : le serveur démarre.

Déploiement Render conseillé :
Build command:
npm ci --omit=dev

Start command:
npm start

Variables minimales :
NODE_ENV=production
SESSION_SECRET=une_valeur_longue_aleatoire
ORYON_LIVE_SIGNAL_TIMEOUT_MS=120000

Si tu vois encore 503 après ce zip :
1. Va dans Render > ton service > Logs.
2. Cherche la première ligne rouge après Deploy.
3. Elle dira si c'est un build failed, une variable manquante ou un crash serveur.
