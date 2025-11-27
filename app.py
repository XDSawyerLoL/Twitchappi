from flask import Flask, request, redirect, jsonify
import requests
import os
import random

app = Flask(__name__)

# ============================ CONFIGURATION TWITCH ============================
# Ces variables DOIVENT être définies dans les variables d'environnement (Env Vars) de votre service Render !
TWITCH_CLIENT_ID = os.environ.get("TWITCH_CLIENT_ID", "VOTRE_CLIENT_ID_ICI")
TWITCH_CLIENT_SECRET = os.environ.get("TWITCH_CLIENT_SECRET", "VOTRE_SECRET_ICI")
# L'URI de redirection doit correspondre à l'URL de votre serveur Render ET à celle enregistrée sur Twitch.
TWITCH_REDIRECT_URI = os.environ.get("TWITCH_REDIRECT_URI", "https://votre-domaine-render.com/twitch_callback") 

# Stockage simple (pour les tests)
user_access_token = None
user_username = None 

# ============================ 1. TWITCH OAUTH FLOW (pour /twitch_auth_start et /followed_streams) ============================

@app.route("/twitch_auth_start")
def twitch_auth_start():
    """Démarre le flux OAuth en redirigeant l'utilisateur vers Twitch."""
    scope = "user:read:follows user:read:email"
    url = (
        f"https://id.twitch.tv/oauth2/authorize?client_id={TWITCH_CLIENT_ID}"
        f"&redirect_uri={TWITCH_REDIRECT_URI}&response_type=code&scope={scope}"
    )
    return redirect(url)

@app.route("/twitch_callback")
def twitch_callback():
    """Route de rappel après l'authentification Twitch."""
    global user_access_token, user_username
    code = request.args.get('code')

    if not code:
        return "Erreur d'authentification: code manquant", 400

    # Étape 2: Échange du code contre un jeton d'accès
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
        
        # Récupérer le nom d'utilisateur pour le statut
        user_info = get_user_info(user_access_token)
        user_username = user_info.get('login', 'Utilisateur Inconnu')

        # Redirection vers la page principale du frontend
        return redirect("/") 

    except requests.exceptions.RequestException as e:
        return f"Erreur lors de l'échange du jeton: {e}", 500

def get_user_info(access_token):
    """Récupère les informations de l'utilisateur authentifié."""
    headers = {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': f'Bearer {access_token}'
    }
    response = requests.get("https://api.twitch.tv/helix/users", headers=headers)
    response.raise_for_status()
    return response.json()['data'][0]


@app.route("/followed_streams")
def followed_streams():
    """Retourne les streams LIVE suivis par l'utilisateur."""
    if not user_access_token:
        # Le frontend gère ce message d'erreur spécifique
        return jsonify({"error": "NOT_AUTHENTICATED"}), 401 

    headers = {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': f'Bearer {user_access_token}'
    }

    try:
        user_info = get_user_info(user_access_token)
        user_id = user_info['id']
        
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


# ============================ 2. TWITCH API ENDPOINTS PUBLIC SIMULÉS ============================

@app.route("/twitch_is_live")
def twitch_is_live():
    """Vérifie si une chaîne spécifique est en direct (Simulation simple)."""
    channel = request.args.get('channel')
    # Pour les tests frontend, nous simulons que 'aleknms' et 'gotaga' sont LIVE
    is_live_status = channel.lower() in ["aleknms", "gotaga"] 
    return jsonify({"channel": channel, "is_live": is_live_status})


@app.route("/random_small_streamer")
def random_small_streamer():
    """Retourne un streamer aléatoire avec moins de 100 viewers (Simulation Niche)."""
    small_streamers = ["pauvreetgamer", "le_niche_streamer", "streamer_omega"] 
    niche_channel = random.choice(small_streamers)
    # Le frontend utilise ce résultat si l'API ne retourne pas un 404
    return jsonify({"channel": niche_channel, "viewer_count": random.randint(10, 99)})

# ============================ 3. PLACEHOLDERS (Les autres routes de votre logique IA) ============================
# Vous devez insérer ici les implémentations pour /critique_ia, /gameid, /boost, etc., 
# qui communiquent avec l'API Gemini ou effectuent d'autres recherches.
# Si vous n'avez pas de backend IA, ces routes renverront un 404/500 par défaut (sauf si vous les définissez).


# ============================ 4. Lancement du serveur ============================
if __name__ == "__main__":
    # Utilisation du port d'environnement pour Render
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
