# ORYON Operator — Web Chat + GitHub contrôle + Supervision

Objectif: un "opérateur" qui discute en chat et peut appliquer des changements sur un repo GitHub (branche + commit + PR), avec une page supervision.

## 1) Installation

### Prérequis
- Node.js 18+
- Un token GitHub (PAT) avec accès au repo (contenu + PR)
- Au moins 1 fournisseur IA (OpenAI / Mistral / Gemini)

### Setup
```bash
cd server
cp .env.example .env
npm install
npm run dev
```

Ensuite ouvre: `http://localhost:8787`

## 2) Configuration (.env)

- `GITHUB_TOKEN`: token GitHub
- `OPERATOR_PROVIDERS`: ex `openai,mistral,gemini` (ordre = priorité; en mode ensemble, on consulte tous ceux listés)

OpenAI
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (ex: `gpt-4.1-mini`)

Mistral
- `MISTRAL_API_KEY`
- `MISTRAL_MODEL` (ex: `mistral-large-latest`)

Gemini
- `GEMINI_API_KEY`
- `GEMINI_MODEL` (ex: `gemini-1.5-pro`)

## 3) Usage

### Chat
- Onglet **Chat**: conversation classique.
- Bouton **WebSocket**: échange via WS (optionnel).

### Ops GitHub
1) **Générer plan**: colle ta tâche (et du contexte repo si tu veux).
2) **Appliquer**: pousse sur GitHub en créant une branche et une PR.

### Supervision
- Historique local dans `logs/state.json`.

## 4) "Autonomie max" (réalité)

Ce projet peut *exécuter* des changements GitHub, mais il **ne peut pas**:
- s'auto-mettre à jour sans aucune confiance/identité (il lui faut des secrets / clés)
- avoir un compte “Moltbook” automatiquement (ça implique création de compte tiers)

Pour aller plus loin: brancher un runner CI (GitHub Actions) + policies (review auto, tests, limites de fichiers touchés, allowlist).
