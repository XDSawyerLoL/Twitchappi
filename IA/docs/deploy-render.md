# Déployer le module IA sur Render

- Root directory: `IA/server`
- Build command: `npm install`
- Start command: `npm start`
- Variables d'environnement: reprendre `IA/env.example`

## Variables minimales
- `NODE_ENV=production`
- `PORT=8787`
- `CORS_ORIGINS=https://votre-domaine.fr`
- `GEMINI_API_KEY=` ou autre fournisseur IA

Ne jamais committer les clés. Les définir dans Render.
