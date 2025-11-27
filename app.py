from flask import Flask, request, redirect, jsonify, render_template
import requests
import os
import random
from datetime import datetime
import sys

# ============================ 0. SETUP FLASK ============================
app = Flask(__name__)

# ============================ 1. CONFIGURATION TWITCH & DOMAINE ============================
TWITCH_CLIENT_ID = os.environ.get("TWITCH_CLIENT_ID")
TWITCH_CLIENT_SECRET = os.environ.get("TWITCH_CLIENT_SECRET")
TWITCH_REDIRECT_URI = os.environ.get("TWITCH_REDIRECT_URI", "https://justplayerstreamhubpro.onrender.com/twitch_callback") 
FRONTEND_URL = "https://justplayerstreamhubpro.onrender.com"

# Stockage simple (pour les tests)
user_access_token = None
user_username = None 
user_id = None


# ============================ 2. ROUTE PRINCIPALE ============================

@app.route("/")
def index():
    """Charge le fichier HTML principal NicheOptimizer.html depuis le dossier 'templates'."""
    return render_template('NicheOptimizer.html')


# ============================ 3. TWITCH OAUTH FLOW ET FOLLOWED_STREAMS ============================

def get_user_info(access_token):
    headers = {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': f'Bearer {access_token}'
    }
    response = requests.get("https://api.twitch.tv/helix/users", headers=headers)
    response.raise_for_status()
    return response.json()['data'][0]


@app.route("/twitch_auth_start")
def twitch_auth_start():
    if not TWITCH_CLIENT_ID or not TWITCH_REDIRECT_URI:
        return f"Erreur de configuration: TWITCH_CLIENT_ID ou REDIRECT_URI manquant sur le serveur.", 500

    scope = "user:read:follows user:read:email"
    url = (
        f"https://id.twitch.tv/oauth2/authorize?client_id={TWITCH_CLIENT_ID}"
        f"&redirect_uri={TWITCH_REDIRECT_URI}&response_type=code&scope={scope}"
    )
    return redirect(url)


@app.route("/twitch_callback")
def twitch_callback():
    global user_access_token, user_username, user_id
    code = request.args.get('code')

    if not code:
        return f"Erreur d'authentification: code manquant ou refusé. Détails: {request.args.get('error_description')}", 400

    token_url = "https://id.twitch.tv/oauth2/token"
    data = {
        'client_id': TWITCH_CLIENT_ID,
        'client_secret': TWITCH_CLIENT_SECRET,
        'code': code,
        'grant_type': 'authorization_code',
        'redirect_uri': TWITCH_REDIRECT_URI
    }
    
    try:
        response = requests.post(token_url, data=data)
        response.raise_for_status()
        token_info = response.json()
        user_access_token = token_info.get('access_token')
        
        user_info = get_user_info(user_access_token)
        user_username = user_info.get('login', 'Utilisateur Inconnu')
        user_id = user_info.get('id')

        return redirect(FRONTEND_URL) 

    except requests.exceptions.RequestException as e:
        return f"Erreur lors de l'échange du jeton: {e}", 500


@app.route("/followed_streams")
def followed_streams():
    if not user_access_token or not user_id:
        # Ceci est la cause du 401 vu dans vos logs
        return jsonify({"error": "NOT_AUTHENTICATED"}), 401 

    headers = {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': f'Bearer {user_access_token}'
    }

    try:
        streams_url = f"https://api.twitch.tv/helix/streams/followed?user_id={user_id}"
        streams_response = requests.get(streams_url, headers=headers)
        streams_response.raise_for_status()
        streams_data = streams_response.json()['data']
        
        formatted_streams = [
            {
                'user_name': stream['user_name'],
                'title': stream['title'],
                'game_name': stream['game_name'],
                'viewer_count': stream['viewer_count']
            }
            for stream in streams_data
        ]
        
        return jsonify({"streams": formatted_streams, "username": user_username})

    except requests.exceptions.RequestException as e:
        return jsonify({"error": "TWITCH_API_ERROR", "details": str(e)}), 500


# ============================ 4. ENDPOINTS PUBLIC & NICHE (SIMULATIONS) ============================

@app.route("/twitch_is_live")
def twitch_is_live():
    channel = request.args.get('channel')
    is_live_status = channel.lower() in ["aleknms", "yooserstv"] 
    return jsonify({"channel": channel, "is_live": is_live_status})


@app.route("/random_small_streamer")
def random_small_streamer():
    small_streamers = ["pauvreetgamer", "le_niche_streamer", "streamer_omega"] 
    niche_channel = random.choice(small_streamers)
    return jsonify({"channel": niche_channel, "viewer_count": random.randint(10, 99)})

# FIX 404: Ajout de la route /random qui appelle la simulation de niche
@app.route("/random")
def random_streamer_alias():
    """Alias pour /random_small_streamer (corrige le 404 du frontend)."""
    return random_small_streamer()


# ============================ 5. PLACEHOLDERS IA & SCAN ============================

@app.route("/critique_ia", methods=["POST"])
def critique_ia():
    data = request.json
    prompt = data.get('prompt', 'Analyse par défaut')
    
    if "critiquer le titre" in prompt.lower():
        simulated_result = """
        <p class="star-rating">⭐⭐⭐⭐</p>
        <h2><strong style="color:#ff0099;">Analyse de la Stratégie de Niche</strong></h2>
        <p>Le choix du jeu est <strong style="color:#22c7ef;">stratégique</strong>, mais la densité de la compétition demande un meilleur titre. Votre score de critique est de 4 étoiles.</p>
        <h2><strong style="color:#ff0099;">Recommandations Titre (Hook)</strong></h2>
        <ul>
            <li><strong style="color:#22c7ef;">Optimisation :</strong> Ajoutez une valeur (ex: "Je tente le Top 1 en 1 heure").</li>
            <li><strong style="color:#22c7ef;">Émotion :</strong> Utilisez des majuscules et un emoji (ex: "NOUVEAU DÉFI EXTRÊME ! 😱").</li>
        </ul>
        """
        return jsonify({"result": simulated_result})
    
    return jsonify({"result": "Analyse IA Simulée - Implémentez la connexion à Gemini ici."})


@app.route("/boost", methods=["POST"])
def boost():
    channel = request.args.get('channel')
    # Ceci renverra un 404 si le frontend n'envoie pas le paramètre 'channel' ou si le serveur n'est pas bien configuré
    return jsonify({"success": True, "message": f"Boost signal sent for {channel}"})


@app.route("/gameid")
def gameid():
    name = request.args.get('name')
    if name and name.lower() != "inconnu":
        return jsonify({"game_id": "12345", "name": name})
    return jsonify({"error": "Game not found"}), 404


@app.route("/details")
def details():
    login = request.args.get('login', 'streamer_scan')
    return jsonify({
        "username": login, 
        "is_live": True, 
        "title": f"Live chill sur {login} : La nouvelle aventure !",
        "game_name": "Just Chatting" if "chill" in login else "Simulation Game",
        "viewer_count": random.randint(150, 400),
        "follower_count": random.randint(1000, 5000),
        "tags": ["Français", "Chill", "Découverte"]
    })


# ============================ 6. LANCEMENT DU SERVEUR ============================
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
