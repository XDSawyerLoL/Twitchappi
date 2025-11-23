// Début du fichier server.js (ou index.js)

const express = require('express');
const app = express();

// S'assurer que vous utilisez le module 'fetch' approprié si vous êtes en CommonJS
// Si vous utilisez 'import' (ESM), vous n'avez probablement pas besoin de cette ligne.
const fetch = require('node-fetch'); 

// 🛑 CLÉS TWITCH : LECTURE DIRECTE DE L'ENVIRONNEMENT RENDER
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
let TWITCH_ACCESS_TOKEN = null; // Sera stocké ici

// VÉRIFICATION DE SÉCURITÉ (Optionnel mais recommandé)
if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
    console.error("ERREUR DE CONFIGURATION: Les variables TWITCH_CLIENT_ID ou TWITCH_CLIENT_SECRET ne sont pas définies dans l'environnement Render.");
}


// --- Fonction pour obtenir le Token d'accès ---
async function getTwitchAccessToken() {
    if (TWITCH_ACCESS_TOKEN) return TWITCH_ACCESS_TOKEN;

    if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
        return null; // Évite d'appeler l'API avec des clés manquantes
    }
    
    console.log("Obtention d'un nouveau Token Twitch...");
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;

    try {
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();
        if (data.access_token) {
            TWITCH_ACCESS_TOKEN = data.access_token;
            // Définir le renouvellement avant l'expiration
            setTimeout(() => TWITCH_ACCESS_TOKEN = null, (data.expires_in - 300) * 1000); 
            console.log("Token Twitch obtenu avec succès.");
            return TWITCH_ACCESS_TOKEN;
        } else {
            console.error("Erreur lors de l'obtention du token:", data);
            return null;
        }
    } catch (error) {
        console.error("Erreur réseau lors de la requête du token:", error);
        return null;
    }
}

// ... Continuer avec le code de l'API (body-parser, CORS, etc.) ...

