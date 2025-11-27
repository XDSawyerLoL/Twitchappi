# Fichier : app.py - Version finale avec toutes les routes API

import os
from flask import Flask, render_template, jsonify, request
import random # Pour simuler des données aléatoires

# 1. Configuration de l'application Flask
app = Flask(__name__, 
            static_folder='static', 
            template_folder='.') 

# 2. Lecture sécurisée de la clé depuis la variable d'environnement
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', 'CLE_ABSENTE_OU_NON_SECURISEE')

# ===============================================
# A. ROUTES DE BASE ET D'INJECTION (Jinja2)
# ===============================================

@app.route('/')
def index():
    """
    Route principale qui lit NicheOptimizer.html et injecte la clé API.
    """
    return render_template('NicheOptimizer.html', GEMINI_API_KEY=GEMINI_API_KEY)


# ===============================================
# B. ROUTES API SIMULÉES (Pour éviter le 404)
# Ces routes fournissent des données que le JS attend.
# ===============================================

@app.route('/random_small_streamer', methods=['GET'])
def get_initial_channel():
    """
    Simule la recherche d'un petit streamer pour initialiser le lecteur.
    """
    streamers = [
        "little_dev_fr", "growth_niche_bot", "tech_streamer_26", "mini_geek_tv"
    ]
    return jsonify({
        "username": random.choice(streamers),
        "viewer_count": random.randint(5, 100)
    })

@app.route('/gameid', methods=['GET'])
def get_game_id():
    """
    Simule la recherche de l'ID d'un jeu.
    Le client JS appelle ceci en premier.
    """
    name = request.args.get('name', '').lower()
    
    # Simulation de la recherche: si c'est un jeu connu
    if 'elden ring' in name or 'starfield' in name:
        return jsonify({"game_id": "12345", "name": name.title()})
    
    # Sinon, on simule une 404 pour que le client bascule en mode "Pseudo"
    return jsonify({"error": "Game not found"}), 404

@app.route('/random', methods=['GET'])
@app.route('/details', methods=['GET'])
def get_streamer_data():
    """
    Simule la récupération des données d'un streamer aléatoire ou ciblé.
    """
    game_id = request.args.get('game_id')
    login = request.args.get('login')
    
    # Données simulées communes
    data = {
        "title": "Je stream pour la croissance : défis et analyses IA !",
        "viewer_count": random.randint(50, 500),
        "follower_count": random.randint(1000, 10000),
        "is_live": True,
        "tags": ["français", "croissance", "gaming", "niche-finding"]
    }

    if login:
        # Mode ciblage pseudo
        data["username"] = login
        data["game_name"] = "Just Chatting"
    elif game_id:
        # Mode scan de catégorie
        streamers = ["simulated_streamer_1", "simulated_streamer_2", "simulated_streamer_3"]
        data["username"] = random.choice(streamers)
        data["game_name"] = "Catégorie Scannée"

    return jsonify({"streamer": data})

@app.route('/boost', methods=['POST'])
@app.route('/critique_ia', methods=['GET', 'POST'])
@app.route('/diagnostic_titre', methods=['GET', 'POST'])
@app.route('/niche_analysis', methods=['GET', 'POST'])
def placeholder_route():
    """
    Routes API IA : Elles ne font rien ici, mais retournent un statut 200 OK
    pour empêcher le JS de lever une 404, car le travail IA est fait par Gemini directement.
    """
    return jsonify({"status": "OK", "message": "API route found, Gemini call is next."}), 200


# ===============================================
# C. LANCEMENT DU SERVEUR
# ===============================================

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
