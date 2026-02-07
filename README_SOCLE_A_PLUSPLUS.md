# ORYON — Socle A++ (stabilité renforcée)

Ajouts:
- /healthz
- Validation légère des query params (qStr/qInt/qEnum)
- Timeouts + retry sur appels externes (Twitch/YouTube)
- Arrêt propre (SIGTERM/SIGINT)
- Cache TTL + métriques (A+) conservé

Notes:
- Les routes lourdes renvoient X-Cache HIT/MISS si cache actif.
- /api/metrics/cache pour vérifier les hits.
