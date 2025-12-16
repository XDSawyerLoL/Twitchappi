// =========================================================
// IMPORTS
// =========================================================
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

const app = express();

// =========================================================
// CONFIG
// =========================================================
const PORT = process.env.PORT || 10000;

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;

// =========================================================
// CHECK ENV
// =========================================================
if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI) {
    console.error("❌ Variables Twitch manquantes");
    process.exit(1);
}

// =========================================================
// MIDDLEWARES
// =========================================================
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

// =========================================================
// CACHE MÉMOIRE
// =========================================================
const CACHE = {
    appToken: null,
    twitchUser: null
};

// =========================================================
// TWITCH HELPERS
// =========================================================
async function getAppToken() {
    if (CACHE.appToken && CACHE.appToken.expiry > Date.now()) {
        return CACHE.appToken.token;
    }

    const res = await fetch(
        `https://id.twitch.tv/oauth2/token` +
        `?client_id=${TWITCH_CLIENT_ID}` +
        `&client_secret=${TWITCH_CLIENT_SECRET}` +
        `&grant_type=client_credentials`,
        { method: 'POST' }
    );

    const data = await res.json();

    CACHE.appToken = {
        token: data.access_token,
        expiry: Date.now() + data.expires_in * 1000
    };

    return CACHE.appToken.token;
}

async function twitchFetch(endpoint, userToken = null) {
    const token = userToken || await getAppToken();

    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${token}`
        }
    });

    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Twitch API ${res.status}: ${txt}`);
    }

    return res.json();
}

// =========================================================
// AUTH TWITCH (POPUP)
// =========================================================
app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');

    const url =
        `https://id.twitch.tv/oauth2/authorize` +
        `?client_id=${TWITCH_CLIENT_ID}` +
        `&redirect_uri=${REDIRECT_URI}` +
        `&response_type=code` +
        `&scope=user:read:follows` +
        `&state=${state}`;

    res.cookie('oauth_state', state, {
        httpOnly: true,
        secure: true,
        maxAge: 10 * 60 * 1000
    });

    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error } = req.query;

    if (state !== req.cookies.oauth_state) {
        return res.status(400).send("OAuth state invalide");
    }

    if (error) {
        return res.status(400).send("Erreur OAuth Twitch");
    }

    try {
        const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: TWITCH_CLIENT_ID,
                client_secret: TWITCH_CLIENT_SECRET,
                code,
                grant_type: 'authorization_code',
                redirect_uri: REDIRECT_URI
            })
        });

        const tokenData = await tokenRes.json();

        const userRes = await twitchFetch('users', tokenData.access_token);
        const user = userRes.data[0];

        CACHE.twitchUser = {
            id: user.id,
            login: user.login,
            display_name: user.display_name,
            access_token: tokenData.access_token,
            expiry: Date.now() + tokenData.expires_in * 1000
        };

        // 🔥 ferme le popup + refresh front
        res.send(`
            <script>
                if (window.opener) {
                    window.opener.postMessage('auth_success', '*');
                    window.close();
                } else {
                    window.location.href = '/';
                }
            </script>
        `);

    } catch (e) {
        console.error(e.message);
        res.status(500).send("Erreur OAuth Twitch");
    }
});

app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) {
        return res.json({
            is_connected: true,
            display_name: CACHE.twitchUser.display_name
        });
    }
    CACHE.twitchUser = null;
    res.json({ is_connected: false });
});

app.post('/twitch_logout', (req, res) => {
    CACHE.twitchUser = null;
    res.json({ success: true });
});

// =========================================================
// ✅ STREAMS SUIVIS — API TWITCH ACTUELLE
// =========================================================
app.get('/followed_streams', async (req, res) => {
    if (!CACHE.twitchUser) {
        return res.status(401).json({ success: false });
    }

    try {
        // 1️⃣ chaînes suivies
        const followed = await twitchFetch(
            `channels/followed?user_id=${CACHE.twitchUser.id}&first=100`,
            CACHE.twitchUser.access_token
        );

        if (!followed.data || followed.data.length === 0) {
            return res.json({ success: true, streams: [] });
        }

        // 2️⃣ streams LIVE uniquement
        const ids = followed.data.map(c => `user_id=${c.broadcaster_id}`).join('&');

        const live = await twitchFetch(
            `streams?${ids}`,
            CACHE.twitchUser.access_token
        );

        const streams = live.data.map(s => ({
            user_id: s.user_id,
            user_name: s.user_name,
            title: s.title,
            game_name: s.game_name,
            viewers: s.viewer_count,
            thumbnail: s.thumbnail_url
        }));

        res.json({ success: true, streams });

    } catch (e) {
        console.error("❌ followed_streams:", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// =========================================================
// START SERVER
// =========================================================
app.listen(PORT, () => {
    console.log(`✅ Backend lancé sur le port ${PORT}`);
});
