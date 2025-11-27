# Fichier : app.py (mis à jour pour NicheOptimizer.html)

import os
from flask import Flask, render_template

# 1. Configuration de l'application Flask
app = Flask(__name__, 
            static_folder='static', 
            # Cherche NicheOptimizer.html dans le répertoire courant
            template_folder='.') 

# 2. Lecture sécurisée de la clé depuis la variable d'environnement
# Sur Render, vous devez définir une variable d'environnement nommée GEMINI_API_KEY
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', 'CLE_ABSENTE_OU_NON_SECURISEE')

@app.route('/')
def index():
    """
    Route principale qui lit NicheOptimizer.html et injecte la clé API.
    """
    # 3. RENDU DU TEMPLATE SPÉCIFIQUE
    # Flask cherche le fichier 'NicheOptimizer.html' dans le dossier 'template_folder'
    return render_template('NicheOptimizer.html', GEMINI_API_KEY=GEMINI_API_KEY)


# 4. Point d'entrée pour le serveur Render ou le développement local
if __name__ == '__main__':
    # Utilisation du port 8080 ou 5000 pour Render, ou le port par défaut
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)