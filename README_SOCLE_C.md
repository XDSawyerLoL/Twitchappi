# ORYON — Socle C (C1→C5)

C1: Front unifié sur /api/content (rows Live/VOD/Clips)
C2: Search overlay VOD (/api/content?type=vod&q=) + click delegation capture
C3: Player inline VOD + Clip (unmute button safe)
C4: Observabilité UI (/api/metrics/ui GET/POST) + envoi télémétrie côté front
C5: Dépendances: stripe pinned to ^14.25.0 + express-session ^1.18.0 + overrides + scripts npm audit

Endpoints à tester:
- /healthz
- /api/metrics/cache
- /api/metrics/externals
- /api/metrics/ui
- /api/content?type=vod&q=mario&lang=fr&min=20&max=200
