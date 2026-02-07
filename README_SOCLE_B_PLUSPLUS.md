# ORYON — Socle B++ (Front branché sur /api/content)

Ajouts front (TwitFlix / ORYON TV):
- Consommation de /api/content pour:
  - Row VOD FR 20–200
  - Row Clips FR
  - Résultats VOD pendant la recherche (type=vod&q=)
- Clic souris sur cards VOD/Clips => lecture inline dans le player principal
  - VOD: loadVodEmbed(videoId)
  - Clip: loadClipEmbed(clipId)

Sécurité:
- package.json: bump express-session + overrides + scripts audit
