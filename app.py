# Fichier : app.py (Version sécurisée et fonctionnelle)

import os
from flask import Flask, render_template, jsonify, request
import random
from google import genai

# ===============================================
# 1. LECTURE SÉCURISÉE DE LA CLÉ (DOIT VENIR EN PREMIER)
# ===============================================

# Cette ligne lit la variable d'environnement (le secret) de Render.
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', 'CLE_ABSENTE_OU_NON_SECURISEE')

# 2. INITIALISATION DU CLIENT GEMINI
# client est désormais disponible pour toutes les fonctions de l'API.
client = genai.Client(api_key=GEMINI_API_KEY)


# 3. Configuration de l'application Flask
app = Flask(__name__, 
            static_folder='static', 
            template_folder='.') 


# ===============================================
# A. ROUTES DE BASE (Injection sécurisée)
# ===============================================

@app.route('/')
def index():
    """
    Route principale : NE DOIT PLUS INJECTER LA CLÉ.
    """
    # L'injection a été supprimée pour la sécurité (la clé reste côté serveur)
    return render_template('NicheOptimizer.html') 


# ===============================================
# B. ROUTE PROXY SÉCURISÉE POUR GEMINI
# Le JavaScript appellera TOUJOURS cette route pour l'IA
# ===============================================

@app.route('/critique_ia', methods=['POST'])
def critique_ia_proxy():
    """
    Route API qui sert de proxy pour l'appel sécurisé à Gemini.
    Le client JS envoie le prompt, le serveur fait l'appel.
    """
    # Vérification du secret
    if not client.api_key or client.api_key.startswith('CLE_ABSENTE'):
        return jsonify({"error": "Clé API Gemini non configurée sur le serveur (variable d'environnement manquante)."}), 500

    try:
        data = request.get_json()
        # Le JS envoie le prompt complet sous la clé 'prompt'
        prompt = data.get('prompt')

        if not prompt:
            return jsonify({"error": "Prompt manquant."}), 400

        # L'instruction système et les outils sont inclus dans le prompt complet envoyé par le JS
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt
            # Note : Le search tool est inclus ici, car le JS a concaténé les instructions.
        )

        # Renvoyer la réponse de l'IA (le texte)
        return jsonify({"result": response.text})

    except Exception as e:
        # Gérer les erreurs de l'API Gemini
        print(f"Erreur Gemini: {e}")
        return jsonify({"error": f"Erreur lors de l'appel à Gemini: {e}"}), 500


# ===============================================
# C. ROUTES API SIMULÉES (Pour fixer le 404)
# ===============================================

@app.route('/random_small_streamer', methods=['GET'])
def get_initial_channel():
    streamers = ["little_dev_fr", "growth_niche_bot", "tech_streamer_26", "mini_geek_tv"]
    return jsonify({"username": random.choice(streamers), "viewer_count": random.randint(5, 100)})

@app.route('/gameid', methods=['GET'])
def get_game_id():
    name = request.args.get('name', '').lower()
    if 'elden ring' in name or 'starfield' in name:
        return jsonify({"game_id": "12345", "name": name.title()})
    return jsonify({"error": "Game not found"}), 404

@app.route('/random', methods=['GET'])
@app.route('/details', methods=['GET'])
def get_streamer_data():
    login = request.args.get('login')
    data = {
        "title": "Je stream pour la croissance : défis et analyses IA !",
        "viewer_count": random.randint(50, 500),
        "follower_count": random.randint(1000, 10000),
        "is_live": True,
        "tags": ["français", "croissance", "gaming", "niche-finding"]
    }
    if login:
        data["username"] = login
        data["game_name"] = "Just Chatting"
    return jsonify({"streamer": data})

# Route factice pour éviter les 404 pour les appels non-Gemini
@app.route('/boost', methods=['POST'])
@app.route('/diagnostic_titre', methods=['GET', 'POST'])
@app.route('/niche_analysis', methods=['GET', 'POST'])
def placeholder_route():
    return jsonify({"status": "OK", "message": "API route found."}), 200

# ===============================================
# D. LANCEMENT DU SERVEUR
# ===============================================
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
