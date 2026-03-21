# ORYON Operator — module IA séparé

## Démarrage
```bash
cd IA/server
cp ../env.example .env
npm install
npm start
```
Puis ouvrir `http://localhost:8787`.

## Variables principales
- `PORT`
- `CORS_ORIGINS`
- `GEMINI_API_KEY` ou `GOOGLE_API_KEY`
- `GEMINI_MODEL`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `MISTRAL_API_KEY`
- `MISTRAL_MODEL`
- `OPERATOR_PROVIDERS`
- `GITHUB_TOKEN`

## Notes
- en production, renseigner `CORS_ORIGINS`
- `IA/env.example` contient maintenant un vrai exemple d'environnement
