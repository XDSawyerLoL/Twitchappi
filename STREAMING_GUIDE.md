# Swapp Streaming Quick Start

Objectif : lancer un live sans perdre le statut et sans écran noir côté viewer.

## 1. Vérifier le backend Swapp

Sur le serveur :

```bash
npm install
npm run build
npm start
```

Endpoints à vérifier :

```txt
https://swapp.tv/api/oryon/persistence-status
https://swapp.tv/api/swapp/streaming/readiness
https://swapp.tv/api/swapp/features
```

La persistance doit indiquer `firestore: true` et `github_deploy_safe: true`.

## 2. Installer Swapp Local pour OBS

Dans le dossier du projet :

```bash
npm --prefix local-agent install
npm run stream:check
npm run stream:local
```

Puis ouvrir :

```txt
http://127.0.0.1:8081
```

## 3. Connecter le compte Swapp

Dans Swapp Local :

1. Mets l’URL du site : `https://swapp.tv`.
2. Clique sur la connexion navigateur.
3. Reviens dans Swapp Local quand le compte est confirmé.

## 4. Régler OBS

Dans OBS :

```txt
Service : personnalisé
Serveur : rtmp://127.0.0.1:1935/live
Clé : la clé affichée dans Swapp Local
```

Réglages recommandés :

```txt
1080p60
6000-8000 kbps
Keyframe interval : 2s
Audio : AAC 160 kbps
```

## 5. Démarrer le live

1. Lance le streaming OBS.
2. Attends que Swapp Local affiche “Flux prêt”.
3. Clique “Démarrer sur Swapp”.
4. Ouvre la page publique `/pseudo`.

Le player public doit utiliser l’URL publique du tunnel Swapp Local. Si le tunnel n’est pas prêt, la page affiche “Connexion au live…” au lieu d’un écran noir.

## 6. Refresh / coupure courte

Le backend garde maintenant le live ouvert pendant une fenêtre de reconnexion :

```env
ORYON_NATIVE_RECONNECT_GRACE_MS=120000
```

Un refresh navigateur ne doit plus couper immédiatement le live.
