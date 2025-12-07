// ... (code existant avant la section des routes)

// =========================================================
// --- ROUTE CHATBOT IA GÉNÉRAL ---
// =========================================================

/**
 * Endpoint pour la conversation générale avec l'IA.
 */
app.post('/ai_chat_query', async (req, res) => {
    if (!ai) {
        return res.status(503).json({ error: "Le service IA n'est pas configuré (GEMINI_API_KEY manquante)." });
    }

    const { query } = req.body;
    if (!query) {
        return res.status(400).json({ error: "La requête (query) est manquante dans le corps de la requête." });
    }

    console.log(`[IA Chat] Nouvelle requête: ${query}`);

    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [
                {
                    role: "system",
                    parts: [
                        { text: "Vous êtes 'Streamer AI', un assistant expert en croissance sur Twitch, YouTube, et TikTok. Votre objectif est de fournir des conseils stratégiques, des analyses de marché, et des idées de contenu. Répondez de manière amicale, professionnelle et concise, en utilisant des listes ou des mises en forme pour faciliter la lecture. Ne parlez pas de politique, de contenu offensant, ou de sujets hors de la création de contenu et du streaming. Utilisez le Français." }
                    ]
                },
                {
                    role: "user",
                    parts: [
                        { text: query }
                    ]
                }
            ],
            config: {
                temperature: 0.7,
            }
        });

        // Utilisation de Markdown pour formater le texte
        const formattedResponse = response.text.trim(); 

        res.json({ 
            success: true, 
            response: formattedResponse 
        });

    } catch (e) {
        console.error("Erreur lors de la requête IA Chat:", e);
        res.status(500).json({ 
            error: "Erreur lors du traitement de la requête IA: " + e.message,
            response: "Je suis désolé, une erreur interne s'est produite lors de l'appel à l'API IA."
        });
    }
});

// ... (suite du code, y compris le démarrage du serveur)
