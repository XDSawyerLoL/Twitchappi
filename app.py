# Fichier : app.py (Corrigé)

import os
from flask import Flask, render_template, jsonify, request
import random 
from google import genai # 👈 L'importation peut rester ici

# 1. Configuration de l'application Flask
app = Flask(__name__, 
            static_folder='static', 
            template_folder='.') 

# 2. LECTURE DE LA CLÉ (DOIT VENIR EN PREMIER !)
# Cette ligne lit la variable d'environnement (le secret)
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', 'CLE_ABSENTE_OU_NON_SECURISEE')

# 3. INITIALISATION DU CLIENT GEMINI (Utilise la variable définie juste au-dessus)
# client est désormais disponible pour toutes les fonctions de l'API
client = genai.Client(api_key=GEMINI_API_KEY)


# ===============================================
# A. ROUTES DE BASE ET D'INJECTION (Jinja2)
# La fonction index ne doit plus injecter la clé !
# ===============================================

@app.route('/')
def index():
    """
    Route principale qui lit NicheOptimizer.html (sans injection de clé).
    """
    # Ne PAS injecter de clé ici. Le JS appellera la route /critique_ia
    return render_template('NicheOptimizer.html') 

# ... (Gardez toutes les autres routes API simulées et la route /critique_ia)
