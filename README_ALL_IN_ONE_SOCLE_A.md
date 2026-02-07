# ORYON — Socle A All-in-one (stabilité / sécurité / perf)

Inclus:
- Logs structurés + X-Request-Id
- Rate limiting (global /api + routes lourdes)
- /api/auth/status + 401 Retry-After + front backoff
- Cache TTL + bounds + /api/metrics/cache
- Timeouts + retry externals
- Concurrency limits externals (env CONCURRENCY_TWITCH / CONCURRENCY_YOUTUBE)
- Circuit breaker externals + /api/metrics/externals
- /healthz
- Validation query params sur routes lourdes
- Arrêt propre SIGTERM/SIGINT
- CORS allowlist via env ALLOWED_ORIGINS (optionnel)

ENV recommandés:
- NODE_ENV=production
- SESSION_SECRET=<fort>
- ALLOWED_ORIGINS=https://justplayerstreamhubpro.onrender.com (ou liste séparée par virgule)
- CACHE_MAX_ITEMS=2000
- CONCURRENCY_TWITCH=4
- CONCURRENCY_YOUTUBE=3

Vérifs:
- /healthz
- /api/metrics/cache
- /api/metrics/externals
- Headers X-Cache sur routes lourdes
