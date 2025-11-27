# Fichier : app.py (Partie API Gemini)

from google import genai
from flask import jsonify, request
# ... (Gardez le reste de vos imports)

# Initialisation de l'API Gemini avec la clé secrète lue de l'environnement
# LA CLÉ N'EST JAMAIS EXPOSÉE ICI
client = genai.Client(api_key=GEMINI_API_KEY)

# ... (Gardez les routes /random_small_streamer, /gameid, etc.)

@app.route('/critique_ia', methods=['POST'])
def critique_ia():
    """
    Route API qui sert de proxy pour l'appel sécurisé à Gemini.
    """
    if not client.api_key or client.api_key.startswith('CLE_ABSENTE'):
        return jsonify({"error": "Clé API Gemini non configurée sur le serveur (variable d'environnement manquante)."}), 500

    try:
        data = request.get_json()
        prompt = data.get('prompt')

        if not prompt:
            return jsonify({"error": "Prompt manquant."}), 400

        # Appel sécurisé à l'API Gemini depuis le serveur Python
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt
        )

        return jsonify({"result": response.text})

    except Exception as e:
        # Gérer les erreurs de l'API Gemini
        print(f"Erreur Gemini: {e}")
        return jsonify({"error": f"Erreur lors de l'appel à Gemini: {e}"}), 500

# MODIFIEZ AUSSI VOTRE FONCTION index() pour qu'elle n'injecte plus la clé :
@app.route('/')
def index():
    # Suppression de l'injection : la clé reste CONFIDENTIELLE sur le serveur
    return render_template('NicheOptimizer.html')
