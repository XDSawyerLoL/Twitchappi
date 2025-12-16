const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 10000;

// Configuration IA
const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY);

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

// Route IA Unifiée
app.post('/auto_action', async (req, res) => {
    const { action_type, target_name, data_context } = req.body;
    
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        let prompt = "";

        if (action_type === 'golden_hour') {
            prompt = `Tu es un analyste de données Twitch expert. 
            L'utilisateur est dans le fuseau horaire : ${data_context.timezone}.
            Analyse mathématiquement les meilleurs moments pour streamer :
            1. Repère les fenêtres où les "Gros Streamers" terminent leur live (fin de soirée).
            2. Identifie les pics d'audience matinale vs nocturne.
            3. Propose 3 créneaux d'Heure d'Or (faible concurrence / forte audience).
            Formatte la réponse en HTML propre (utilisant <h4>, <ul>, et des <strong> pour les heures).`;
        } else {
            prompt = `Analyse la niche Twitch : ${target_name}. Donne des conseils stratégiques en HTML.`;
        }

        const result = await model.generateContent(prompt);
        const response = await result.response;
        
        res.json({ 
            success: true, 
            html_response: response.text() 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

app.listen(PORT, () => {
    console.log(`Serveur actif sur le port ${PORT}`);
});
