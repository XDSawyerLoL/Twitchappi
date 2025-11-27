import requests
import os
from dotenv import load_dotenv

# Charge les variables locales pour l'exécution du script
load_dotenv()

CLIENT_ID = os.getenv("3cxzcj23fcrczbe5n37ajzcb4y7u9q")
CLIENT_SECRET = os.getenv("o1kglqmctziaw20m92lxxl6umtdzyf")

if not CLIENT_ID or not CLIENT_SECRET:
    print("Erreur: TWITCH_CLIENT_ID et TWITCH_CLIENT_SECRET doivent être configurés dans le fichier .env.")
    exit()

TOKEN_URL = "https://id.twitch.tv/oauth2/token"

payload = {
    'client_id': CLIENT_ID,
    'client_secret': CLIENT_SECRET,
    'grant_type': 'client_credentials'
}

try:
    print("Tentative de génération du Jeton d'Accès d'Application Twitch...")
    response = requests.post(TOKEN_URL, data=payload)
    response.raise_for_status() 
    token_data = response.json()
    
    access_token = token_data.get('access_token')
    
    if access_token:
        print("\n✅ Succès : Jeton d'accès d'application Twitch généré.")
        print(f"COPIEZ CE JETON et collez-le dans votre fichier .env pour la variable TWITCH_APP_ACCESS_TOKEN:\n{access_token}")
        print("\nCe jeton est requis pour les routes publiques (gameid, random_small_streamer).")
    else:
        print("Erreur : Le jeton n'a pas été trouvé dans la réponse Twitch.")

except requests.exceptions.HTTPError as err:
    print(f"\n❌ Échec de la requête HTTP: {err}")
    print("Vérifiez votre Client ID et Client Secret.")
except Exception as e:
    print(f"\n❌ Une erreur inattendue est survenue: {e}")