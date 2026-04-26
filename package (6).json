# Oryon — exemple local uniquement.
# Sur Render, ne mets rien en dur dans le code : configure ces variables dans Environment.
NODE_ENV=production
PORT=10000
SESSION_SECRET=change_me_long_random_secret
PUBLIC_BASE_URL=https://ton-domaine.fr
CORS_ORIGINS=https://ton-domaine.fr

# Twitch API / OAuth — utilise les valeurs déjà présentes sur Render
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
TWITCH_REDIRECT_URI=https://ton-domaine.fr/twitch_auth_callback

# Emails de confirmation Oryon : désactivés pour le MVP.
# À réactiver plus tard avec un fournisseur SMTP transactionnel.

# WebRTC natif
# P2P simple par défaut. Ajoute TURN pour fiabiliser les connexions derrière box/NAT.
WEBRTC_MODE=p2p
STUN_URLS=stun:stun.l.google.com:19302
TURN_URLS=
TURN_USERNAME=
TURN_CREDENTIAL=
ICE_TRANSPORT_POLICY=all
MAX_NATIVE_VIEWERS=300

# Préparation évolution SFU / P2P hybride
SFU_ENABLED=false
SFU_URL=
P2P_HYBRID_ENABLED=false
P2P_SUPER_PEER_TARGET=8

# GIFs chat
GIPHY_API_KEY=

# Firebase optionnel pour analytics historiques
FIREBASE_SERVICE_KEY=

# Paiement optionnel
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_CREDITS_500=
STRIPE_PRICE_CREDITS_1250=
STRIPE_PRICE_PREMIUM_MONTHLY=

# Oryon Foundation
# Admin global : mets ton pseudo Oryon, ou plusieurs séparés par virgule.
ORYON_ADMIN_LOGINS=sansa

# Base persistante future : Supabase/PostgreSQL.
# Si absent, le MVP utilise les fichiers JSON locaux du serveur.
DATABASE_URL=

# Limites anti-abus complémentaires
RATE_LIMIT_API_PER_MIN=300
RATE_LIMIT_HEAVY_PER_MIN=60

# OBS / ingest vidéo natif futur
# Render peut stocker ces variables, mais il faut un vrai serveur RTMP/SRT/WebRTC ingest derrière.
OBS_RTMP_URL=
RTMP_INGEST_URL=
ORYON_RTMP_URL=

# === Moteur vidéo Oryon (PeerTube masqué derrière Oryon) ===
# Côté utilisateur, on affiche "Oryon Live". PeerTube reste l'infra vidéo interne.
ORYON_VIDEO_MODE=oryon-engine
ORYON_PUBLIC_RTMP_URL=rtmp://live.oryon.fr/live
ORYON_RTMP_URL=rtmp://live.oryon.fr/live
ORYON_PLAYER_EMBED_TEMPLATE=https://video.oryon.fr/videos/embed/{uuid}?autoplay=1&warningTitle=0&peertubeLink=0
ORYON_VIDEO_ENGINE_API_URL=https://video.oryon.fr
ORYON_VIDEO_ENGINE_TOKEN=
PEERTUBE_BASE_URL=https://video.oryon.fr
PEERTUBE_ADMIN_USER=
PEERTUBE_ADMIN_PASSWORD=
# Domaine/serveur externe où sera installé PeerTube. Render héberge Oryon, pas l'ingest RTMP.
# Le port RTMP 1935 doit être ouvert sur le serveur vidéo.

# Oryon Local Agent (optionnel, côté streamer)
ORYON_LOCAL_AGENT_PORT=8081
ORYON_LOCAL_RTMP_PORT=1935
