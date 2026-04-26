<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ORYON Operator</title>
  <style>
    :root { color-scheme: dark; }
    body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; background:#0b0f14; color:#e6edf3; }
    header { padding:14px 18px; border-bottom:1px solid #1d2633; display:flex; gap:12px; align-items:center; }
    header .badge { font-size:12px; padding:2px 8px; border:1px solid #2b3a4f; border-radius:999px; color:#9fb3c8; }
    main { display:grid; grid-template-columns: 260px 1fr; min-height: calc(100vh - 54px); }
    nav { border-right:1px solid #1d2633; padding:12px; }
    nav button { width:100%; text-align:left; background:transparent; color:#cbd5e1; border:1px solid transparent; padding:10px 10px; border-radius:10px; cursor:pointer; }
    nav button.active { border-color:#2b3a4f; background:#101826; }
    .panel { padding:16px; }
    .row { display:flex; gap:10px; }
    .card { border:1px solid #1d2633; background:#0f1520; border-radius:14px; padding:12px; }
    .card h3 { margin:0 0 8px 0; font-size:14px; color:#cbd5e1; }
    textarea, input, select { width:100%; background:#0b1220; border:1px solid #1d2633; color:#e6edf3; border-radius:10px; padding:10px; outline:none; }
    textarea { min-height: 130px; resize: vertical; }
    .btn { background:#1f2937; border:1px solid #334155; color:#e6edf3; padding:10px 12px; border-radius:10px; cursor:pointer; }
    .btn.primary { background:#2563eb; border-color:#2563eb; }
    .btn.danger { background:#b91c1c; border-color:#b91c1c; }
    .muted { color:#9fb3c8; font-size:12px; }
    .log { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size:12px; white-space: pre-wrap; }
    .chatbox { height: 52vh; overflow:auto; border:1px solid #1d2633; background:#0b1220; border-radius:14px; padding:12px; }
    .msg { margin:0 0 10px 0; }
    .msg .who { font-size:11px; color:#9fb3c8; margin-bottom:2px; }
    .msg .bubble { border:1px solid #1d2633; background:#0f1520; padding:10px; border-radius:12px; }
    table { width:100%; border-collapse: collapse; }
    th, td { border-bottom:1px solid #1d2633; padding:8px; font-size:12px; text-align:left; }
  </style>
</head>
<body>
<header>
  <div style="font-weight:700; letter-spacing:0.4px;">ORYON Operator</div>
  <div class="badge" id="health">offline</div>
  <div style="flex:1"></div>
  <div class="muted">Web chat + GitHub contrôle + supervision</div>
</header>
<main>
  <nav>
    <button class="active" data-view="chat">Chat</button>
    <button data-view="ops">Ops GitHub</button>
    <button data-view="supervision">Supervision</button>
    <button data-view="settings">Réglages</button>
  </nav>

  <section class="panel" id="view-chat">
    <div class="card" style="margin-bottom:12px;">
      <h3>Chat</h3>
      <div class="muted">Mode « ensemble » = consulte plusieurs modèles (si clés configurées), puis synthèse.</div>
    </div>

    <div class="chatbox" id="chatbox"></div>

    <div class="row" style="margin-top:12px; align-items:flex-start;">
      <div style="flex:1">
        <textarea id="chatInput" placeholder="Dis quoi faire…"></textarea>
        <div class="row" style="margin-top:8px;">
          <select id="chatMode" style="max-width:190px;">
            <option value="single">single</option>
            <option value="ensemble">ensemble</option>
          </select>
          <button class="btn primary" id="chatSend">Envoyer</button>
          <button class="btn" id="chatConnect">WebSocket</button>
        </div>
      </div>
      <div style="width:320px" class="card">
        <h3>Raccourcis</h3>
        <div class="muted">Exemples :</div>
        <div class="log" style="margin-top:8px;">
- "Analyse ce bug et propose un patch"
- "Crée un rail YouTube à partir d'une playlist"
- "Refactorise cette fonction sans changer l'UI"
        </div>
      </div>
    </div>
  </section>

  <section class="panel" id="view-ops" style="display:none;">
    <div class="row" style="gap:12px;">
      <div style="flex:1" class="card">
        <h3>1) Générer un plan (JSON)</h3>
        <input id="repo" placeholder="owner/repo" />
        <div class="muted" style="margin:6px 0 10px;">Le contexte repo (liste fichiers + extraits) peut être collé ci-dessous.</div>
        <textarea id="task" placeholder="Ex: Répare l'API /api/youtube/playlist (500) et affiche les épisodes sur le rail."></textarea>
        <textarea id="repoContext" placeholder="(optionnel) Colle ici un tree + fichiers pertinents…"></textarea>
        <div class="row" style="margin-top:8px;">
          <select id="planMode" style="max-width:190px;">
            <option value="single">single</option>
            <option value="ensemble">ensemble</option>
          </select>
          <button class="btn primary" id="btnPlan">Générer plan</button>
        </div>
      </div>
      <div style="flex:1" class="card">
        <h3>2) Appliquer sur GitHub</h3>
        <input id="baseBranch" placeholder="base branch (main)" />
        <div class="row" style="margin:8px 0;">
          <label class="muted" style="display:flex; gap:8px; align-items:center;">
            <input type="checkbox" id="openPR" checked /> Ouvrir une PR
          </label>
        </div>
        <textarea id="planJson" placeholder="Colle ici le JSON plan…"></textarea>
        <button class="btn primary" id="btnApply">Créer branche + commit + PR</button>
        <div class="muted" style="margin-top:10px;">⚠ nécessite <span class="log">GITHUB_TOKEN</span> côté serveur.</div>
      </div>
    </div>

    <div class="card" style="margin-top:12px;">
      <h3>Résultat</h3>
      <div class="log" id="opsOut"></div>
    </div>
  </section>

  <section class="panel" id="view-supervision" style="display:none;">
    <div class="card">
      <h3>Derniers runs</h3>
      <div class="muted">Chat / Plan / Apply — historique local (logs/state.json).</div>
      <div style="margin-top:10px;">
        <table>
          <thead><tr><th>Quand</th><th>Type</th><th>Status</th><th>Durée</th><th>Info</th></tr></thead>
          <tbody id="runs"></tbody>
        </table>
      </div>
      <button class="btn" id="refresh">Rafraîchir</button>
    </div>
  </section>

  <section class="panel" id="view-settings" style="display:none;">
    <div class="card" style="max-width:720px;">
      <h3>Réglages</h3>
      <div class="muted">Ces réglages sont stockés côté serveur.</div>
      <div style="margin-top:12px;">
        <label class="muted">Repo par défaut</label>
        <input id="defaultRepo" placeholder="owner/repo" />
      </div>
      <div style="margin-top:10px;">
        <label class="muted" style="display:flex; gap:8px; align-items:center;">
          <input type="checkbox" id="autopush" /> Autopush (dangereux)
        </label>
      </div>
      <div class="row" style="margin-top:12px;">
        <button class="btn primary" id="saveSettings">Sauvegarder</button>
      </div>
      <div class="muted" style="margin-top:12px;">
        Fournis les clés via <span class="log">server/.env</span> (OpenAI / Mistral / Gemini) + <span class="log">GITHUB_TOKEN</span>.
      </div>
    </div>
  </section>
</main>

<script src="./app.js"></script>
</body>
</html>
