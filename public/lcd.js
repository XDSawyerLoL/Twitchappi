<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>STREAMER HUB V15 | Cockpit</title>
    
    <script src="https://embed.twitch.tv/embed/v1.js"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
    
    <style>
        :root { 
            --color-bg-dark: #0d0d0d; 
            --color-ai-niche: #59d682; 
            --glow-color: rgba(89, 214, 130, 0.4);
        }
        html, body {
            margin: 0; padding: 0; height: 100%; width: 100%; 
            overflow: hidden; background-color: var(--color-bg-dark); 
            color: white; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        }
        .player-header {
            background-color: #1a1a1a; padding: 0 20px; 
            display: flex; justify-content: space-between; align-items: center; 
            box-shadow: 0 4px 15px rgba(0,0,0,0.8); height: 50px; 
            border-bottom: 1px solid #333;
        }
        /* Design du Titre V15 Cockpit */
        .player-title { 
            font-size: 16px; 
            letter-spacing: 1.5px;
            text-transform: uppercase;
            font-weight: 800;
            background: linear-gradient(90deg, #fff, var(--color-ai-niche));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            text-shadow: 0 0 10px var(--glow-color);
        }
        .player-title span { color: var(--color-ai-niche); -webkit-text-fill-color: initial; }
        
        #player-status { 
            font-size: 11px; 
            color: #aaa; 
            text-transform: uppercase; 
            letter-spacing: 1px;
            background: rgba(255,255,255,0.05);
            padding: 5px 12px;
            border-radius: 20px;
            border: 1px solid #333;
        }
        #twitch-embed { width: 100%; height: calc(100% - 50px); }
    </style>
</head>
<body>

<div class="player-header">
    <div class="player-title">
        <i class="fas fa-terminal" style="margin-right:10px; font-size: 14px;"></i>
        STREAMER HUB <span>V15</span> (Cockpit)
    </div>
    <div id="player-status">
        <i class="fas fa-sync fa-spin"></i> Liaison API établie
    </div>
</div>

<div id="twitch-embed"></div>

<script src="LCD.js"></script> 

</body>
</html>
