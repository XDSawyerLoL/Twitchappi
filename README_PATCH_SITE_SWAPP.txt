PATCH SITE SWAPP - statut lecteur public

À déployer sur Hostinger/GitHub :
  app.js
  local-agent/server.js
  local-agent/main.js
  local-agent/package.json

Corrections :
- /api/oryon/channel/:login/status renvoie player_url/embed_url/status_url/provider
- Swapp refuse loca.lt/localtunnel, qui injecte une page de sécurité et casse le player
- local-agent source synchronisé avec le patch Swapp Local

Après déploiement, tester pendant un live :
  https://swapp.tv/api/oryon/channel/PSEUDO/status

Dans live, il faut voir :
  is_live: true
  player_url: https://.../player/...
