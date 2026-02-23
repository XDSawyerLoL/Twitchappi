# ORYON — Architecte Sovereign IA (Prod-Grade Autopilot)

Ce repo fournit une **pile d'agent "souverain"** : un noyau d’orchestration + politiques + sandbox + GitOps,
pensé pour **réparer/faire évoluer une application** via conversation, de façon **maximale mais contrôlée**.

> Objectif : tu parles à l’agent → il planifie → il modifie le code dans une branche → il teste en sandbox → il ouvre une PR.
> Optionnel : auto-merge + auto-deploy **uniquement** si les garde-fous passent.

---

## ⚠️ Important (autonomie vs sécurité)

Ce système est conçu pour être **puissant** mais **pas "sans frein"** :
- pas d'auto-modification illimitée en prod sans contrôles
- pas d’accès non borné au système / secrets
- pas d'actions externes (ex: création de comptes sur des plateformes) sans validation explicite

Tu peux augmenter l'autonomie en ajustant `policy/policy.yaml`, mais tu gardes une traçabilité et des points d’arrêt.

---

## Ce que tu as

- **API Chat** (FastAPI) : `/v1/chat`
- **Planificateur / Exécuteur** : tâches, files, états
- **Policy Engine** (YAML) : permissions, allowlist, seuils de confiance
- **GitOps** : branche automatique, commits, PR (GitHub)
- **Sandbox Runner** : exécute tests/build dans conteneur Docker isolé
- **Mémoire persistante** (SQLite) : threads, décisions, journaux
- **Connecteurs** : OpenAI/Mistral/Gemini (structure) + fallback
- **Observabilité** : logs structurés + traces d’exécution

---

## Démarrage rapide

### 1) Pré-requis
- Docker + docker compose
- Git
- (Optionnel) un token GitHub pour PR : `GITHUB_TOKEN`

### 2) Copier `.env.example` → `.env` et compléter
```bash
cp .env.example .env
```

### 3) Lancer
```bash
docker compose up --build
```

API : `http://localhost:8088`

---

## Utilisation

### Chat (exemple)
```bash
curl -s http://localhost:8088/v1/chat \
  -H "Content-Type: application/json" \
  -d '{
    "repo_path": "/workspace/target-repo",
    "message": "Répare l\u0027endpoint /api/youtube/playlist qui renvoie 500 et ajoute un fallback RSS.",
    "mode": "autopilot"
  }' | jq
```

### Modes
- `advisor` : propose plan + patch (pas d’écriture)
- `operator` : écrit dans une branche + tests
- `autopilot` : operator + PR auto
- `sovereign` : autopilot + auto-merge/auto-deploy **si** policy OK

---

## Monter ton repo cible

Dans `docker-compose.yml`, monte ton repo en lecture/écriture :
- `./target-repo:/workspace/target-repo`

---

## Ajuster l’autonomie (policy)

Fichier : `policy/policy.yaml`
- allowlist chemins modifiables
- commandes autorisées en sandbox
- seuil de confiance pour auto-merge
- interdiction de certains patterns (ex: exfiltration secrets)

---

## Architecture

- `services/api` : API + orchestrateur
- `services/worker` : exécuteur (git/tests)
- `policy/` : règles
- `shared/` : modèles, utilitaires, schema
- `storage/` : SQLite + journaux

---

## Roadmap (si tu veux "niveau supérieur")
- Multi-repos + dépendances
- Intégration Render/Vercel/Fly.io pour deploy
- Auto-triage d'incidents (Sentry, logs)
- Mémoire longue durée (vector store)
- "Tool marketplace" interne (plugins)
