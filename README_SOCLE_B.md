# ORYON — Socle B (Interop providers)

## Firestore schema
- users/{uid}/connections/{providerId}
  - connected: boolean
  - linkedAt: serverTimestamp
  - meta: object (non-secret identifiers only)
  - updatedAt: serverTimestamp

## Providers API
- GET /api/providers/list
- GET /api/providers/status
- GET /api/providers/:providerId/status
- GET /api/providers/:providerId/connect_url
- POST /api/providers/:providerId/connect/manual  (requires Twitch session)
- POST /api/providers/:providerId/disconnect      (requires Twitch session)

## Notes
- Twitch + Steam connect flows already exist; Socle B adds persistence into users/{uid}/connections.
- For Riot/Epic/Ubisoft/Xbox: manual connect stores identifiers only. OAuth wiring can be added later without breaking API.
