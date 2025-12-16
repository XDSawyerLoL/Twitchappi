// =========================================================
// IMPORTS & SETUP
// =========================================================
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

const { GoogleGenAI } = require('@google/genai');

const app = express();

// =========================================================
// CONFIG
// =========================================================
const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash";

// =========================================================
// CHECK ENV
// =========================================================
if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI || !GEMINI_API_KEY) {
    console.error("❌ VARIABLES D'ENV MANQUANTES");
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

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
    twitchTokens: {},
    twitchUser: null,
    streamBoosts: {},
    boostedStream: null,
    lastScanData: null,
    globalStreamRotation: {
        streams: [],
        currentIndex: 0,
        lastFetchTime: 0,
        fetchCooldown: 15 * 60 * 1000
    }
};

// =========================================================
// TWITCH HELPERS
// =========================================================
async function getTwitchToken() {
    if (CACHE.twitchTokens.app && CACHE.twitchTokens.app.expiry > Date.now()) {
        return CACHE.twitchTokens.app.access_token;
    }

    const res = await fetch(
        `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
        { method: 'POST' }
    );
    const data = await res.json();

    CACHE.twitchTokens.app = {
        access_token: data.access_token,
        expiry: Date.now() + (data.expires_in * 1000) - 300000
    };

    return data.access_token;
}

async function twitchApiFetch(endpoint, token = null) {
    const accessToken = token || await getTwitchToken();

    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Twitch API Error ${res.status}: ${txt}`);
    }

    return res.json();
}

// =========================================================
// AUTH TWITCH (OAUTH)
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

    res.cookie('twitch_state', state, {
        httpOnly: true,
        secure: true,
        maxAge: 10 * 60 * 1000
    });

    res.redirect(url);
});

// =========================================================
// 🔥 CALLBACK MODIFIÉ (FERMETURE POPUP + REFRESH)
// =========================================================
app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error } = req.query;

    if (state !== req.cookies.twitch_state) {
        return res.status(400).send("Erreur OAuth (state invalide)");
    }

    if (error) {
        return res.status(400).send("Erreur Twitch OAuth");
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

        const userRes = await twitchApiFetch('users', tokenData.access_token);
        const user = userRes.data[0];

        CACHE.twitchUser = {
            id: user.id,
            username: user.login,
            display_name: user.display_name,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expiry: Date.now() + tokenData.expires_in * 1000
        };

        // ✅ POPUP → POSTMESSAGE → FERMETURE → REFRESH FRONT
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
        console.error(e);
        res.status(500).send("Erreur OAuth Twitch");
    }
});

app.post('/twitch_logout', (req, res) => {
    CACHE.twitchUser = null;
    res.json({ success: true });
});

app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) {
        const { display_name, username, id } = CACHE.twitchUser;
        return res.json({ is_connected: true, display_name, username, id });
    }
    CACHE.twitchUser = null;
    res.json({ is_connected: false });
});

// =========================================================
// (LE RESTE DE TON BACKEND EST STRICTEMENT IDENTIQUE)
// =========================================================

app.listen(PORT, () => {
    console.log(`✅ Serveur lancé sur le port ${PORT}`);
});
