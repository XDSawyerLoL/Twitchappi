# ORYON — Socle B+ (Unified Content API)

## Endpoint
GET /api/content

### Params
- provider: twitch (default)
- type: live | vod | clip (default live)
- lang: fr|en|es|de|it|pt (default fr)
- min / max: viewers range (default 20-200)
- q: search query (title)
- game: game name
- limit: 1..60 (default 24)

### Response
{ success:true, provider, type, items:[{ id,type,provider,title,game,channel,language,viewers,duration,thumbnail,url,embed,tags,isLive,createdAt }] }

Notes:
- live uses the latest CRON snapshot (fast + stable)
- vod reuses existing /api/twitch/vods/search
- clip reuses existing /api/clips if present
