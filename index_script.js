/* Swapp stable front-end — rebuilt to remove the previous blocking observers and duplicated patches. */
(() => {
  'use strict';

  const APP = 'Swapp';
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const state = {
    view: 'home',
    session: { local: null, twitch: null },
    loading: false,
    homeLives: [],
    currentLive: null,
    currentChannel: null,
    localPreview: null,
    teams: [],
    categories: [],
    chat: { socket: null, room: null }
  };

  const navItems = [
    ['home', 'Accueil'],
    ['discover', 'Découvrir'],
    ['categories', 'Catégories'],
    ['teams', 'Équipes']
  ];
  const mobileItems = [
    ['home', 'Accueil'],
    ['discover', 'Découvrir'],
    ['categories', 'Catégories'],
    ['teams', 'Équipes'],
    ['settings', 'Compte']
  ];
  const moods = [
    ['chill', 'Chill'],
    ['rp', 'RP / jeu de rôle'],
    ['discussion', 'Discussion'],
    ['decouverte', 'Découverte jeu'],
    ['nuit', 'Nuit calme'],
    ['petite-commu', 'Petite commu']
  ];

  function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  }

  function cleanText(value) {
    return String(value ?? '')
      .replace(/\bOryon\b/g, APP)
      .replace(/\bORYON\b/g, APP.toUpperCase())
      .replace(/Compte Swapp requis\.?/g, 'Connexion requise.')
      .replace(/Compte Oryon requis\.?/g, 'Connexion requise.');
  }

  function toast(message) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = cleanText(message || 'Action effectuée.');
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  async function api(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || 8000);
    try {
      const res = await fetch(url, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options,
        signal: controller.signal
      });
      const text = await res.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = { success: false, error: text || 'Réponse invalide.' }; }
      if (!res.ok && data.success !== false) data.success = false;
      if (data.error) data.error = cleanText(data.error);
      return data;
    } catch (err) {
      return { success: false, error: 'Serveur indisponible ou réponse trop longue.', items: [], categories: [], local: null, twitch: null };
    } finally {
      clearTimeout(timeout);
    }
  }

  function storeSessionToken(payload) {
    if (!payload?.remember_token || !payload?.user?.login) return;
    try { localStorage.setItem('swappRemember', JSON.stringify({ login: payload.user.login, token: payload.remember_token })); } catch {}
  }

  async function restoreRememberedSession() {
    if (state.session.local) return;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('swappRemember') || 'null'); } catch {}
    if (!saved?.login || !saved?.token) return;
    const out = await api('/api/oryon/restore-session', { method: 'POST', body: JSON.stringify({ login: saved.login, remember_token: saved.token }), timeout: 5000 });
    if (out.success) state.session.local = out.user || null;
  }

  async function loadSession() {
    const data = await api('/api/oryon/session', { timeout: 5000 });
    if (data.success) {
      state.session.local = data.local || null;
      state.session.twitch = data.twitch || null;
    }
    await restoreRememberedSession();
    renderShell();
  }

  function isAdmin() {
    const login = String(state.session.local?.login || '').toLowerCase();
    return !!state.session.local?.is_admin || login === 'sansahd';
  }

  function renderShell() {
    const nav = $('#nav');
    if (nav) {
      nav.innerHTML = navItems.map(([id, label]) => `<button class="navBtn ${state.view === id ? 'active' : ''}" type="button" data-view="${id}">${label}</button>`).join('');
    }
    const mobile = $('#mobileNav');
    if (mobile) {
      mobile.innerHTML = mobileItems.map(([id, label]) => `<button class="${state.view === id ? 'active' : ''}" type="button" data-view="${id}">${label}</button>`).join('');
    }
    const avatar = $('#userAvatar');
    if (avatar) avatar.src = state.session.local?.avatar_url || state.session.twitch?.profile_image_url || '';
    const label = $('#userLabel');
    if (label) label.textContent = state.session.local?.display_name || state.session.local?.login || state.session.twitch?.display_name || 'Connexion';
    renderUserMenu();
  }

  function renderUserMenu() {
    const menu = $('#userMenu');
    if (!menu) return;
    const u = state.session.local;
    const t = state.session.twitch;
    const items = [];
    if (u) {
      items.push(`<div class="small" style="padding:9px 12px">Compte Swapp<br><b style="color:white">${esc(u.display_name || u.login)}</b></div>`);
      items.push(`<button type="button" data-view="channel">Ma chaîne</button>`);
      items.push(`<button type="button" data-view="manager">Gestionnaire de stream</button>`);
      items.push(`<button type="button" data-view="dashboard">Tableau de bord créateur</button>`);
      items.push(`<button type="button" data-view="studio">Outils créateur</button>`);
      items.push('<div class="sep"></div>');
    }
    items.push(`<button type="button" data-view="settings">Connexion et créer un compte</button>`);
    items.push(t ? `<button type="button" data-action="logout-twitch">Déconnecter Twitch</button>` : `<button type="button" data-action="connect-twitch">Connecter Twitch</button>`);
    if (u) items.push(`<button type="button" data-action="logout-local">Déconnecter Swapp</button>`);
    if (isAdmin()) items.push('<div class="sep"></div><button type="button" data-view="admin">Administration</button>');
    menu.innerHTML = items.join('');
  }

  function activateView(id) {
    $$('.view').forEach(el => el.classList.toggle('active', el.id === id));
    renderShell();
  }

  async function setView(id, options = {}) {
    const protectedViews = ['manager', 'dashboard', 'studio'];
    if (protectedViews.includes(id) && !state.session.local) id = 'settings';
    if (id === 'channel' && !state.session.local && !options.login) id = 'settings';
    if (id === 'admin' && !isAdmin()) id = 'home';
    state.view = id;
    activateView(id);
    if (!options.silentHash) {
      const hash = options.login && id === 'channel' ? `channel/${encodeURIComponent(options.login)}` : id;
      if (location.hash.slice(1) !== hash) history.replaceState(null, '', `${location.pathname}${location.search}#${hash}`);
    }
    const renderers = { home: renderHome, discover: renderDiscover, categories: renderCategories, teams: renderTeams, channel: renderChannel, manager: renderManager, dashboard: renderDashboard, studio: renderStudio, settings: renderSettings, watch: renderWatch, admin: renderAdmin };
    await renderers[id]?.(options);
  }

  function pageShell(title, subtitle, right = '') {
    return `<div class="page"><div class="pageHead"><div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>${right ? `<div class="row">${right}</div>` : ''}</div><div class="pageBody"></div></div>`;
  }

  function liveIdentity(item = {}) {
    const platform = item.platform || ((item.embed_url || item.watch_url) ? 'peertube' : (item.login || item.user_login ? 'twitch' : 'swapp'));
    const login = item.login || item.user_login || item.host_login || item.room || item.channel || '';
    const name = item.display_name || item.user_name || item.host_name || login || 'Live';
    const viewers = Number(item.viewer_count ?? item.viewers ?? 0) || 0;
    const game = item.game_name || item.category || platform;
    const title = item.title || `Live de ${name}`;
    let thumb = item.thumbnail_url || item.avatar_url || '';
    if (thumb) thumb = thumb.replace('{width}', '640').replace('{height}', '360');
    return { platform, login, name, viewers, game, title, thumb };
  }

  function liveCard(item = {}, opts = {}) {
    const info = liveIdentity(item);
    const payload = encodeURIComponent(JSON.stringify(item));
    const badge = info.platform === 'twitch' ? 'Twitch' : info.platform === 'peertube' ? 'PeerTube' : 'Swapp';
    return `<article class="liveCard ${opts.feature ? 'feature' : ''}">
      <div class="thumb">${info.thumb ? `<img src="${esc(info.thumb)}" alt="">` : `<div class="thumbFallback">${esc(badge)}</div>`}</div>
      <div class="liveBody">
        <div class="row"><span class="pill"><span class="dot"></span>${esc(badge)}</span><span class="pill">${info.viewers} viewers</span></div>
        <div class="liveTitle">${esc(info.title)}</div>
        <div class="desc">${esc(info.name)} · ${esc(info.game)}</div>
        <div class="row" style="margin-top:12px"><button class="btn" type="button" data-open-live="${payload}">Regarder</button>${info.login ? `<button class="btn secondary" type="button" data-open-channel="${esc(info.login)}">Chaîne</button>` : ''}</div>
      </div>
    </article>`;
  }

  function loadingLine(text = 'Chargement…') {
    return `<div class="statusLine"><span class="loader"></span><span>${esc(text)}</span></div>`;
  }

  async function getHomeLives() {
    const sources = await Promise.allSettled([
      api('/api/discovery/home-lives?limit=6', { timeout: 6000 }),
      api('/api/native/lives', { timeout: 4000 }),
      api('/api/twitch/streams/small?first=6', { timeout: 6000 })
    ]);
    const items = [];
    for (const res of sources) {
      if (res.status !== 'fulfilled') continue;
      const data = res.value || {};
      const chunk = data.items || data.streams || data.lives || [];
      if (Array.isArray(chunk)) items.push(...chunk);
    }
    const seen = new Set();
    return items.filter(item => {
      const info = liveIdentity(item);
      const key = `${info.platform}:${info.login}:${info.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 8);
  }

  async function renderHome() {
    const el = $('#home');
    if (!el) return;
    const ctaView = state.session.local ? 'manager' : 'settings';
    const ctaLabel = state.session.local ? 'Lancer mon live' : 'Créer ma chaîne Swapp';
    el.innerHTML = `<div class="hero">
      <div>
        <span class="eyebrow"><span class="dot"></span> Swapp</span>
        <h1>Des lives à taille humaine.</h1>
        <p class="lead">Découvre des créateurs publics, trouve une ambiance, ou lance ton propre live. Cette version est volontairement stable : pas d’animation bloquante, pas de carte étirée, pas de bloc coincé au milieu.</p>
        <div class="moodRail">${moods.map(([id, label]) => `<button type="button" data-mood="${id}">${label}</button>`).join('')}</div>
        <div class="row"><button class="btn" type="button" data-action="quick-live">Propose-moi un live</button><button class="btn secondary" type="button" data-view="${ctaView}">${ctaLabel}</button></div>
      </div>
      <div id="homeLiveWall" class="heroWall"><div class="panel">${loadingLine('Recherche de lives publics…')}</div></div>
    </div>
    <div class="homeBand"><div><h2>Connexion et créer un compte</h2><p>Compte, Twitch, profil public, planning, stream, dashboard et outils créateur sont regroupés proprement.</p></div><button class="btn" type="button" data-view="settings">Ouvrir le compte</button></div>
    <div class="section" style="padding-bottom:80px"><div class="three"><div class="card"><h3>Découverte</h3><p class="muted">Recherche par ambiance, catégorie et taille de communauté.</p></div><div class="card"><h3>Création</h3><p class="muted">Profil, planning, live local, image hors live, emotes et badges.</p></div><div class="card"><h3>Stabilité</h3><p class="muted">Les appels API ont un délai maximum : la page ne se bloque plus.</p></div></div></div>`;
    const wall = $('#homeLiveWall');
    const lives = await getHomeLives();
    state.homeLives = lives;
    if (!wall) return;
    wall.innerHTML = lives.length ? lives.slice(0, 5).map((item, i) => liveCard(item, { feature: i === 0 })).join('') : `<div class="panel"><h2>Accueil prêt</h2><p class="muted">Aucun live public récupéré pour le moment. La page reste utilisable : lance le serveur avec <b>npm start</b> pour activer les lives, les comptes et Twitch.</p><div class="row"><button class="btn" type="button" data-view="discover">Découvrir</button><button class="btn secondary" type="button" data-view="settings">Connexion et créer un compte</button></div></div>`;
  }

  async function renderDiscover(options = {}) {
    const el = $('#discover');
    if (!el) return;
    const mood = options.mood || state.discoverMood || '';
    el.innerHTML = pageShell('Découvrir', 'Filtre les lives par ambiance, catégorie ou taille de communauté.', '<button class="btn" type="button" data-action="quick-live">Live surprise</button>');
    $('.pageBody', el).innerHTML = `<div class="panel">
      <div class="searchLine">
        <input id="discoverQuery" placeholder="Catégorie, jeu ou mot-clé" value="${esc(options.q || '')}">
        <select id="discoverMood"><option value="">Toutes ambiances</option>${moods.map(([id, label]) => `<option value="${id}" ${mood === id ? 'selected' : ''}>${label}</option>`).join('')}</select>
        <select id="discoverMax"><option value="50">≤ 50 viewers</option><option value="100">≤ 100 viewers</option><option value="300">≤ 300 viewers</option></select>
        <button class="btn" type="button" data-action="search-discover">Rechercher</button>
      </div>
    </div><div id="discoverResults" class="grid section" style="padding-left:0;padding-right:0">${loadingLine('Chargement de la découverte…')}</div>`;
    await searchDiscover();
  }

  async function searchDiscover() {
    const box = $('#discoverResults');
    if (!box) return;
    box.innerHTML = loadingLine('Recherche en cours…');
    const q = $('#discoverQuery')?.value?.trim() || '';
    const mood = $('#discoverMood')?.value || '';
    state.discoverMood = mood;
    const max = $('#discoverMax')?.value || '100';
    const urls = [
      `/api/oryon/discover/find-live?${new URLSearchParams({ q, mood, maxViewers: max })}`,
      `/api/twitch/streams/small?${new URLSearchParams({ q, max_viewers: max, first: 12 })}`,
      `/api/peertube/public/search?${new URLSearchParams({ q: q || mood || 'fr', max: 12, lang: 'fr' })}`
    ];
    const results = await Promise.allSettled(urls.map(url => api(url, { timeout: 7000 })));
    const items = [];
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const d = r.value || {};
      if (Array.isArray(d.items)) items.push(...d.items);
      if (d.item) items.push(d.item);
      if (Array.isArray(d.streams)) items.push(...d.streams);
    }
    const unique = [];
    const seen = new Set();
    for (const item of items) {
      const info = liveIdentity(item);
      const key = `${info.platform}:${info.login}:${info.title}`;
      if (seen.has(key)) continue;
      seen.add(key); unique.push(item);
    }
    box.innerHTML = unique.length ? unique.slice(0, 18).map(liveCard).join('') : `<div class="empty">Aucun résultat disponible. Vérifie que le serveur est lancé et que les clés Twitch sont configurées, puis relance la recherche.</div>`;
  }

  async function quickLive() {
    let pool = state.homeLives.length ? state.homeLives : await getHomeLives();
    if (!pool.length) {
      const d = await api('/api/twitch/random-small-live', { timeout: 7000 });
      pool = d.item ? [d.item] : (d.items || []);
    }
    if (!pool.length) return toast('Aucun live disponible pour le moment.');
    openLive(pool[Math.floor(Math.random() * pool.length)]);
  }

  async function renderCategories() {
    const el = $('#categories');
    if (!el) return;
    el.innerHTML = pageShell('Catégories', 'Parcours les catégories et lance une découverte ciblée.');
    $('.pageBody', el).innerHTML = `<div class="panel"><div class="searchLine"><input id="catSearch" placeholder="Rechercher une catégorie"><button class="btn" type="button" data-action="search-categories">Rechercher</button></div></div><div id="catGrid" class="grid section" style="padding-left:0;padding-right:0">${loadingLine('Chargement des catégories…')}</div>`;
    await loadCategories();
  }

  async function loadCategories(q = '') {
    const box = $('#catGrid');
    if (!box) return;
    box.innerHTML = loadingLine('Chargement…');
    const url = q ? `/api/categories/search?q=${encodeURIComponent(q)}` : '/api/categories/top?first=24';
    const d = await api(url, { timeout: 7000 });
    const cats = d.categories || d.items || d.data || [];
    state.categories = cats;
    box.innerHTML = cats.length ? cats.slice(0, 36).map(c => {
      const name = c.name || c.game_name || c.title || 'Catégorie';
      const img = String(c.box_art_url || c.image_url || '').replace('{width}', '320').replace('{height}', '426');
      return `<button class="categoryCard" type="button" data-category="${esc(name)}">${img ? `<img src="${esc(img)}" alt="">` : ''}<b>${esc(name)}</b><span class="small">${Number(c.viewers || c.viewer_count || 0) ? `${Number(c.viewers || c.viewer_count)} viewers` : 'Découvrir'}</span></button>`;
    }).join('') : '<div class="empty">Aucune catégorie récupérée.</div>';
  }

  async function renderTeams() {
    const el = $('#teams');
    if (!el) return;
    el.innerHTML = pageShell('Équipes', 'Crée ou rejoins des groupes de créateurs.', state.session.local ? '<button class="btn" type="button" data-action="show-team-form">Créer une équipe</button>' : '<button class="btn" type="button" data-view="settings">Connexion</button>');
    $('.pageBody', el).innerHTML = `<div id="teamFormMount"></div><div id="teamsGrid" class="grid">${loadingLine('Chargement des équipes…')}</div>`;
    await loadTeams();
  }

  async function loadTeams() {
    const box = $('#teamsGrid');
    if (!box) return;
    const d = await api('/api/oryon/teams', { timeout: 6000 });
    const teams = d.items || [];
    state.teams = teams;
    box.innerHTML = teams.length ? teams.map(team => `<article class="card teamCard"><div class="row"><span class="pill">Équipe</span><span class="pill">${(team.members || []).length} membres</span></div><h2>${esc(team.name || team.slug)}</h2><p class="muted">${esc(team.description || 'Pas encore de description.')}</p><div class="members">${(team.members || []).slice(0, 6).map(m => `<span class="pill">${esc(m.display_name || m.login)}</span>`).join('')}</div><div class="row" style="margin-top:12px"><button class="btn secondary" type="button" data-action="join-team" data-slug="${esc(team.slug)}">Rejoindre</button></div></article>`).join('') : '<div class="empty">Aucune équipe pour le moment. Connecte-toi pour créer la première.</div>';
  }

  function showTeamForm() {
    const mount = $('#teamFormMount');
    if (!mount) return;
    mount.innerHTML = `<form class="panel" data-form="team" style="margin-bottom:16px"><h2>Créer une équipe</h2><div class="formGrid"><label>Nom<input name="name" required minlength="3"></label><label>Tags<input name="tags" placeholder="rp, chill, fr"></label><label class="wide">Description<textarea name="description"></textarea></label></div><div class="row" style="margin-top:12px"><button class="btn" type="submit">Créer</button></div></form>`;
  }

  async function renderSettings() {
    const el = $('#settings');
    if (!el) return;
    const u = state.session.local;
    el.innerHTML = pageShell('Connexion et créer un compte', 'Un seul endroit pour se connecter, créer un compte, lier Twitch et régler son profil.');
    $('.pageBody', el).innerHTML = `<div class="two">
      <div class="panel"><h2>${u ? 'Compte connecté' : 'Connexion'}</h2>${u ? accountSummary(u) : loginRegisterForms()}</div>
      <div class="panel"><h2>Connexions</h2><div class="tasks"><div class="task"><span>Twitch</span><b class="${state.session.twitch ? 'ok' : 'no'}">${state.session.twitch ? 'Connecté' : 'Non connecté'}</b></div><div class="task"><span>Compte Swapp</span><b class="${u ? 'ok' : 'no'}">${u ? 'Connecté' : 'À créer'}</b></div></div><div class="row" style="margin-top:14px"><button class="btn" type="button" data-action="connect-twitch">Connecter Twitch</button>${state.session.twitch ? '<button class="btn secondary" type="button" data-action="logout-twitch">Déconnecter Twitch</button>' : ''}</div></div>
    </div>${u ? `<div class="panel section" style="padding-left:18px;padding-right:18px"><h2>Profil public</h2>${profileForm(u)}</div>` : ''}`;
  }

  function accountSummary(u) {
    return `<div class="row"><span class="pill"><span class="dot"></span>${esc(u.display_name || u.login)}</span><span class="pill">@${esc(u.login)}</span></div><p class="muted">Tu peux gérer ta chaîne, ton planning, tes lives et tes outils créateur.</p><div class="row"><button class="btn" type="button" data-view="channel">Ma chaîne</button><button class="btn secondary" type="button" data-view="manager">Gestionnaire de stream</button><button class="btn ghost" type="button" data-action="logout-local">Déconnexion</button></div>`;
  }

  function loginRegisterForms() {
    return `<div class="splitTabs"><button class="active" type="button" data-tab-target="loginBox">Connexion</button><button type="button" data-tab-target="registerBox">Créer un compte</button></div>
      <form id="loginBox" data-form="login"><div class="formGrid"><label>Pseudo<input name="login" autocomplete="username" required></label><label>Mot de passe<input name="password" type="password" autocomplete="current-password" required></label></div><div class="row" style="margin-top:12px"><button class="btn" type="submit">Connexion</button></div></form>
      <form id="registerBox" data-form="register" class="hidden"><div class="formGrid"><label>Pseudo<input name="login" minlength="3" required></label><label>Nom affiché<input name="display_name"></label><label>Email<input name="email" type="email" required></label><label>Mot de passe<input name="password" type="password" minlength="6" required></label></div><div class="row" style="margin-top:12px"><button class="btn" type="submit">Créer mon compte</button></div></form>`;
  }

  function profileForm(u) {
    const tags = Array.isArray(u.tags) ? u.tags.join(', ') : '';
    return `<form data-form="profile"><div class="formGrid"><label>Nom affiché<input name="display_name" value="${esc(u.display_name || u.login)}"></label><label>Tags<input name="tags" value="${esc(tags)}" placeholder="chill, rp, discussion"></label><label class="wide">Bio<textarea name="bio">${esc(u.bio || '')}</textarea></label><label class="wide">URL avatar<input name="avatar_url" value="${esc(u.avatar_url || '')}"></label><label class="wide">URL bannière<input name="banner_url" value="${esc(u.banner_url || '')}"></label><label class="wide">Image hors live<input name="offline_image_url" value="${esc(u.offline_image_url || '')}"></label><label class="wide">Lecteur externe / local<input name="oryon_local_player_url" value="${esc(u.oryon_local_player_url || '')}" placeholder="https://..."></label></div><div class="row" style="margin-top:12px"><button class="btn" type="submit">Enregistrer le profil</button></div></form>`;
  }

  async function renderChannel(options = {}) {
    const el = $('#channel');
    if (!el) return;
    const login = options.login || state.currentChannel || state.session.local?.login;
    if (!login) { await setView('settings'); return; }
    state.currentChannel = login;
    el.innerHTML = `<div class="page"><div id="channelMount">${loadingLine('Chargement de la chaîne…')}</div></div>`;
    const [profile, planning, lives, support] = await Promise.all([
      api(`/api/oryon/profile/${encodeURIComponent(login)}`, { timeout: 6000 }),
      api(`/api/oryon/planning?login=${encodeURIComponent(login)}`, { timeout: 6000 }),
      api('/api/native/lives', { timeout: 4000 }),
      api(`/api/oryon/supporters/${encodeURIComponent(login)}`, { timeout: 4000 })
    ]);
    const user = profile.user || (state.session.local?.login === login ? state.session.local : { login, display_name: login });
    const isOwner = state.session.local?.login === login;
    const live = (lives.items || []).find(x => (x.host_login || x.room || x.login) === login);
    const liveActive = !!live || !!user.oryon_local_player_url;
    $('#channelMount').innerHTML = `<div class="pageHead"><div><h1>${esc(user.display_name || user.login)}</h1><p>${esc(user.bio || 'Chaîne Swapp')}</p></div><div class="row">${isOwner ? '<button class="btn" type="button" data-view="manager">Gérer le live</button><button class="btn secondary" type="button" data-view="settings">Modifier profil</button>' : `<button class="btn" type="button" data-action="follow" data-login="${esc(login)}">Suivre</button><button class="btn secondary" type="button" data-action="support" data-login="${esc(login)}">Premier soutien</button>`}</div></div>
      <div class="banner">${user.banner_url ? `<img src="${esc(user.banner_url)}" alt="">` : ''}</div>
      <div class="profileTop"><img class="avatar" src="${esc(user.avatar_url || '')}" alt=""><div><div class="row"><span class="pill">${liveActive ? '🔴 En direct' : 'Hors ligne'}</span><span class="pill">@${esc(user.login)}</span><span class="pill">${Number(user.followers_count || 0)} followers</span>${support.count ? `<span class="pill">${support.count} soutiens</span>` : ''}</div></div></div>
      <div class="two section" style="padding-left:0;padding-right:0"><div class="panel"><h2>${liveActive ? 'Live' : 'Lecteur'}</h2>${channelPlayer(user, live)}<div class="row" style="margin-top:12px">${live ? `<button class="btn" type="button" data-open-live="${encodeURIComponent(JSON.stringify(live))}">Regarder</button>` : ''}</div></div><div class="panel"><h2>Planning</h2>${planningList(planning.items || [])}</div></div>
      <div class="panel section" style="padding-left:18px;padding-right:18px"><h2>À propos</h2><p class="muted">${esc(user.bio || 'Cette chaîne n’a pas encore ajouté de bio.')}</p><div class="row">${(Array.isArray(user.tags) ? user.tags : []).map(t => `<span class="pill">${esc(t)}</span>`).join('')}</div></div>`;
  }

  function channelPlayer(user, live) {
    if (user.oryon_local_player_url) return `<div class="player"><iframe src="${esc(user.oryon_local_player_url)}" allowfullscreen></iframe></div>`;
    if (live) return `<div class="player"><div class="thumbFallback">Live Swapp actif</div></div>`;
    if (user.offline_image_url) return `<div class="player"><img src="${esc(user.offline_image_url)}" alt="" style="width:100%;height:100%;object-fit:cover"></div>`;
    return '<div class="empty">Chaîne hors ligne. Ajoute une image hors live dans les paramètres pour rendre cette zone plus propre.</div>';
  }

  function planningList(items) {
    if (!items.length) return '<div class="empty">Aucun créneau planifié.</div>';
    return `<div class="tasks">${items.slice(0, 8).map(item => `<div class="task"><span><b>${esc(item.title || 'Live prévu')}</b><br><span class="small">${new Date(Number(item.when)).toLocaleString('fr-FR')} · ${esc(item.category || '')}</span></span></div>`).join('')}</div>`;
  }

  async function renderManager() {
    const el = $('#manager');
    if (!el) return;
    if (!state.session.local) { await setView('settings'); return; }
    el.innerHTML = pageShell('Gestionnaire de stream', 'Prépare ton live Swapp, récupère ta clé OBS et teste ton aperçu local.', '<button class="btn secondary" type="button" data-view="channel">Voir ma chaîne</button>');
    $('.pageBody', el).innerHTML = `<div class="two"><div class="panel"><h2>Aperçu local</h2><div class="player"><video id="localPreview" autoplay muted playsinline></video><div id="previewEmpty" class="thumbFallback">Aucun aperçu lancé</div></div><div class="row" style="margin-top:12px"><button class="btn" type="button" data-action="start-screen">Partager écran</button><button class="btn secondary" type="button" data-action="start-camera">Caméra</button><button class="btn bad" type="button" data-action="stop-preview">Arrêter aperçu</button></div><p class="small">L’aperçu navigateur est local. Pour publier un live public stable, utilise OBS ou Swapp Local avec la clé ci-contre.</p></div><div class="panel"><h2>OBS / Swapp Local</h2><div id="streamKeyBox">${loadingLine('Chargement de la clé…')}</div></div></div><div class="panel section" style="padding-left:18px;padding-right:18px"><h2>Planning rapide</h2><form data-form="planning" class="formGrid"><label>Titre<input name="title" required placeholder="Live découverte"></label><label>Catégorie<input name="category" placeholder="Just Chatting"></label><label>Date et heure<input name="when" type="datetime-local" required></label><label>Tags<input name="tags" placeholder="chill, fr"></label><div class="wide row"><button class="btn" type="submit">Ajouter au planning</button></div></form></div>`;
    await loadStreamKey();
  }

  async function loadStreamKey() {
    const box = $('#streamKeyBox');
    if (!box) return;
    const d = await api('/api/oryon/stream-key', { timeout: 6000 });
    if (!d.success) { box.innerHTML = `<div class="empty">${esc(cleanText(d.error || 'Clé indisponible.'))}</div>`; return; }
    box.innerHTML = `<div class="tasks"><div class="task"><span>Serveur RTMP</span><b>${esc(d.rtmp_url || 'Non configuré')}</b></div><div class="task"><span>Clé de stream</span><b style="word-break:break-all">${esc(d.stream_key)}</b></div><div class="task"><span>Réglage conseillé</span><b>${esc(d.recommended?.resolution || '1080p')} · ${esc(d.recommended?.fps || '60')} FPS</b></div></div><div class="row" style="margin-top:12px"><button class="btn secondary" type="button" data-copy="${esc(d.stream_key)}">Copier la clé</button><button class="btn ghost" type="button" data-action="regen-key">Regénérer</button></div>`;
  }

  async function renderDashboard() {
    const el = $('#dashboard');
    if (!el) return;
    if (!state.session.local) { await setView('settings'); return; }
    el.innerHTML = pageShell('Tableau de bord créateur', 'Statistiques utiles, progression et actions concrètes.');
    $('.pageBody', el).innerHTML = `<div id="dashboardBody">${loadingLine('Chargement du tableau de bord…')}</div>`;
    const [full, prog] = await Promise.all([api('/api/oryon/dashboard/full', { timeout: 7000 }), api('/api/oryon/creator/progression', { timeout: 7000 })]);
    const stats = full.stats || {};
    $('#dashboardBody').innerHTML = `<div class="three"><div class="stat"><span class="small">Followers</span><b>${Number(stats.followers || 0)}</b></div><div class="stat"><span class="small">Score créateur</span><b>${Number(stats.creator_score || 0)}</b></div><div class="stat"><span class="small">Niveau</span><b>${Number(prog.level || 0)}</b></div></div><div class="two section" style="padding-left:0;padding-right:0"><div class="panel"><h2>Actions recommandées</h2><div class="tasks">${(full.tasks || []).map(t => `<div class="task"><span>${esc(t.label)}</span><b class="${t.done ? 'ok' : 'no'}">${t.done ? 'OK' : 'À faire'}</b></div>`).join('') || '<div class="empty">Aucune tâche.</div>'}</div></div><div class="panel"><h2>Objectifs</h2><div class="tasks">${(prog.objectives || []).slice(0, 8).map(o => `<div class="task"><span>${esc(o.label)}</span><b class="${o.done ? 'ok' : 'no'}">${o.done ? '+' + Number(o.points || 0) : 'À faire'}</b></div>`).join('') || '<div class="empty">Aucun objectif.</div>'}</div><div class="row" style="margin-top:12px"><button class="btn" type="button" data-action="claim-progress">Récupérer les points</button></div></div></div><div class="panel section" style="padding-left:18px;padding-right:18px"><h2>Conseils</h2><div class="tasks">${(full.insights || full.recommendations || []).map(x => `<div class="task"><span>${esc(x)}</span></div>`).join('') || '<div class="empty">Conseils indisponibles.</div>'}</div></div>`;
  }

  async function renderStudio() {
    const el = $('#studio');
    if (!el) return;
    if (!state.session.local) { await setView('settings'); return; }
    const u = state.session.local;
    el.innerHTML = pageShell('Outils créateur', 'Emotes, badges, modération et identité de chaîne.');
    $('.pageBody', el).innerHTML = `<div class="two"><div class="panel"><h2>Emotes</h2><form data-form="emote" class="formGrid"><label>Code<input name="code" placeholder="GG" required></label><label>Accès<select name="gate"><option value="free">Libre</option><option value="follow">Followers</option><option value="like">Likes</option></select></label><label class="wide">URL image ou data:image<input name="image_url" required></label><div class="wide row"><button class="btn" type="submit">Ajouter l’emote</button></div></form><div id="emoteList" class="grid" style="margin-top:14px"></div></div><div class="panel"><h2>Badges de chaîne</h2><form data-form="badges" class="formGrid"><label>Icône<input name="icon" maxlength="4" placeholder="⭐"></label><label>Nom<input name="label" placeholder="VIP"></label><label class="wide">Note<input name="note" placeholder="Premier soutien"></label><div class="wide row"><button class="btn" type="submit">Enregistrer le badge</button></div></form><p class="small">Les badges sont enregistrés sur ton profil public.</p></div></div><div class="panel section" style="padding-left:18px;padding-right:18px"><h2>Modération</h2><p class="muted">Le signalement est actif sur les chaînes. Les listes de mots et exclusions sont disponibles via l’API de modération lorsque tu es propriétaire du salon.</p><button class="btn secondary" type="button" data-view="channel">Ouvrir ma chaîne</button></div>`;
    await loadEmotes(u.login);
  }

  async function loadEmotes(login) {
    const box = $('#emoteList');
    if (!box) return;
    const d = await api(`/api/oryon/emotes/${encodeURIComponent(login)}`, { timeout: 6000 });
    const emotes = d.emotes || [];
    box.innerHTML = emotes.length ? emotes.map(e => `<div class="card"><img src="${esc(e.image_url)}" alt="" style="width:58px;height:58px;object-fit:contain"><b>${esc(e.code)}</b><p class="small">${esc(e.gate || 'free')}</p></div>`).join('') : '<div class="empty">Aucune emote ajoutée.</div>';
  }

  function renderWatch() {
    const el = $('#watch');
    if (!el) return;
    const item = state.currentLive;
    if (!item) { el.innerHTML = pageShell('Regarder', 'Choisis un live depuis l’accueil ou la découverte.'); $('.pageBody', el).innerHTML = '<div class="empty">Aucun live sélectionné.</div>'; return; }
    const info = liveIdentity(item);
    el.innerHTML = pageShell(info.title, `${info.name} · ${info.game}`);
    $('.pageBody', el).innerHTML = `<div class="watchLayout"><div><div class="player">${playerEmbed(item)}</div><div class="row" style="margin-top:12px">${info.login ? `<button class="btn secondary" type="button" data-open-channel="${esc(info.login)}">Voir la chaîne</button>` : ''}<button class="btn ghost" type="button" data-view="discover">Autre live</button></div></div><aside class="panel chatBox"><div class="row" style="justify-content:space-between;padding:12px;border-bottom:1px solid var(--line)"><b>Chat Swapp</b><span class="small">${esc(info.login || 'salon')}</span></div><div id="chatLog" class="chatLog"><div class="chatMsg"><b>Swapp</b><br><span class="muted">Le chat se connecte si le serveur temps réel est disponible.</span></div></div><form class="chatForm" data-form="chat"><input name="message" placeholder="Écrire un message"><button class="btn" type="submit">Envoyer</button></form></aside></div>`;
    connectChat(info.login || info.title);
  }

  function playerEmbed(item) {
    const info = liveIdentity(item);
    if (info.platform === 'twitch' && info.login) {
      const parent = location.hostname || 'localhost';
      return `<iframe allowfullscreen src="https://player.twitch.tv/?channel=${encodeURIComponent(info.login)}&parent=${encodeURIComponent(parent)}&muted=false"></iframe>`;
    }
    const embed = item.embed_url || item.peertube_embed_url;
    if (embed) return `<iframe allowfullscreen src="${esc(embed)}"></iframe>`;
    if (item.watch_url) return `<div class="thumbFallback"><div><p>Lecteur externe disponible.</p><a class="btn" href="${esc(item.watch_url)}" target="_blank" rel="noopener">Ouvrir</a></div></div>`;
    if (info.thumb) return `<img src="${esc(info.thumb)}" alt="" style="width:100%;height:100%;object-fit:cover">`;
    return '<div class="thumbFallback">Lecteur indisponible</div>';
  }

  function openLive(item) {
    state.currentLive = item;
    setView('watch');
  }

  async function connectChat(room) {
    if (!room || state.chat.room === room) return;
    state.chat.room = room;
    if (state.chat.socket) {
      try { state.chat.socket.disconnect(); } catch {}
      state.chat.socket = null;
    }
    if (!window.io) {
      await new Promise(resolve => {
        const s = document.createElement('script');
        s.src = '/socket.io/socket.io.js';
        s.onload = resolve; s.onerror = resolve;
        document.head.appendChild(s);
        setTimeout(resolve, 1500);
      });
    }
    if (!window.io) return;
    try {
      const socket = window.io({ transports: ['websocket', 'polling'] });
      state.chat.socket = socket;
      socket.emit('native:join', { room });
      socket.on('native:chat:message', msg => appendChat(msg));
      socket.on('native:chat:history', payload => (payload?.items || []).forEach(appendChat));
      socket.emit('native:chat:history', { room });
    } catch {}
  }

  function appendChat(msg = {}) {
    const log = $('#chatLog');
    if (!log) return;
    const node = document.createElement('div');
    node.className = 'chatMsg';
    node.innerHTML = `<b>${esc(msg.display_name || msg.login || 'Viewer')}</b><br>${esc(msg.message || msg.text || '')}`;
    log.appendChild(node);
    log.scrollTop = log.scrollHeight;
  }

  async function renderAdmin() {
    const el = $('#admin');
    if (!el) return;
    if (!isAdmin()) { await setView('home'); return; }
    el.innerHTML = pageShell('Administration', 'Résumé technique Swapp.');
    $('.pageBody', el).innerHTML = `<div id="adminBody">${loadingLine('Chargement administration…')}</div>`;
    const d = await api('/api/oryon/admin/summary', { timeout: 7000 });
    $('#adminBody').innerHTML = d.success ? `<div class="three"><div class="stat"><span class="small">Utilisateurs</span><b>${Number(d.stats?.users || 0)}</b></div><div class="stat"><span class="small">Lives actifs</span><b>${Number(d.stats?.activeLives || 0)}</b></div><div class="stat"><span class="small">Signalements</span><b>${Number(d.stats?.reports || 0)}</b></div></div>` : `<div class="empty">${esc(d.error || 'Administration indisponible.')}</div>`;
  }

  function formData(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  async function submitForm(form) {
    const type = form.dataset.form;
    const data = formData(form);
    if (type === 'login') {
      const out = await api('/api/oryon/login', { method: 'POST', body: JSON.stringify(data) });
      if (!out.success) return toast(out.error || 'Connexion impossible.');
      storeSessionToken(out); state.session.local = out.user || null; toast('Connecté.'); await loadSession(); return setView('home');
    }
    if (type === 'register') {
      const out = await api('/api/oryon/register', { method: 'POST', body: JSON.stringify(data) });
      if (!out.success) return toast(out.error || 'Création impossible.');
      storeSessionToken(out); state.session.local = out.user || null; toast('Compte créé.'); await loadSession(); return setView('settings');
    }
    if (type === 'profile') {
      data.tags = String(data.tags || '').split(',').map(x => x.trim()).filter(Boolean);
      const out = await api('/api/oryon/profile', { method: 'POST', body: JSON.stringify(data) });
      if (!out.success) return toast(out.error || 'Enregistrement impossible.');
      state.session.local = out.user || state.session.local; toast('Profil enregistré.'); await loadSession(); return renderSettings();
    }
    if (type === 'planning') {
      data.tags = String(data.tags || '').split(',').map(x => x.trim()).filter(Boolean);
      const out = await api('/api/oryon/planning', { method: 'POST', body: JSON.stringify(data) });
      toast(out.success ? 'Créneau ajouté.' : (out.error || 'Planning impossible.'));
      if (out.success) form.reset();
      return;
    }
    if (type === 'team') {
      data.tags = String(data.tags || '').split(',').map(x => x.trim()).filter(Boolean);
      const out = await api('/api/oryon/teams', { method: 'POST', body: JSON.stringify(data) });
      toast(out.success ? 'Équipe créée.' : (out.error || 'Création impossible.'));
      if (out.success) { $('#teamFormMount').innerHTML = ''; await loadTeams(); }
      return;
    }
    if (type === 'emote') {
      const out = await api('/api/oryon/emotes', { method: 'POST', body: JSON.stringify(data) });
      toast(out.success ? 'Emote enregistrée.' : (out.error || 'Emote impossible.'));
      if (out.success) { form.reset(); await loadEmotes(state.session.local.login); }
      return;
    }
    if (type === 'badges') {
      const badge = { icon: data.icon, label: data.label, note: data.note };
      const current = state.session.local || {};
      const out = await api('/api/oryon/profile', { method: 'POST', body: JSON.stringify({ ...current, tags: current.tags || [], channel_badges: [badge, ...(current.channel_badges || [])].slice(0, 8) }) });
      toast(out.success ? 'Badge enregistré.' : (out.error || 'Badge impossible.'));
      if (out.success) { state.session.local = out.user || current; form.reset(); }
      return;
    }
    if (type === 'chat') {
      const msg = String(data.message || '').trim();
      if (!msg) return;
      if (state.chat.socket && state.chat.room) state.chat.socket.emit('native:chat:message', { room: state.chat.room, message: msg });
      appendChat({ display_name: state.session.local?.display_name || 'Moi', message: msg });
      form.reset();
    }
  }

  async function action(name, target) {
    if (name === 'quick-live') return quickLive();
    if (name === 'search-discover') return searchDiscover();
    if (name === 'search-categories') return loadCategories($('#catSearch')?.value?.trim() || '');
    if (name === 'show-team-form') return showTeamForm();
    if (name === 'connect-twitch') { location.href = '/twitch_auth_start'; return; }
    if (name === 'logout-twitch') { await api('/twitch_logout', { method: 'POST' }); state.session.twitch = null; toast('Twitch déconnecté.'); await loadSession(); return setView(state.view); }
    if (name === 'logout-local') { await api('/api/oryon/logout', { method: 'POST' }); try { localStorage.removeItem('swappRemember'); } catch {} state.session.local = null; toast('Compte déconnecté.'); await loadSession(); return setView('home'); }
    if (name === 'join-team') { const slug = target.dataset.slug; const out = await api(`/api/oryon/teams/${encodeURIComponent(slug)}/join`, { method: 'POST' }); toast(out.success ? 'Équipe rejointe.' : (out.error || 'Action impossible.')); return loadTeams(); }
    if (name === 'follow') { const login = target.dataset.login; const out = await api(`/api/oryon/follow/${encodeURIComponent(login)}`, { method: 'POST' }); toast(out.success ? 'Chaîne suivie.' : (out.error || 'Action impossible.')); return; }
    if (name === 'support') { const login = target.dataset.login; const out = await api(`/api/oryon/support/first/${encodeURIComponent(login)}`, { method: 'POST' }); toast(out.success ? 'Soutien enregistré.' : (out.error || 'Action impossible.')); return; }
    if (name === 'regen-key') { const out = await api('/api/oryon/stream-key/regenerate', { method: 'POST' }); toast(out.success ? 'Clé régénérée.' : (out.error || 'Action impossible.')); return loadStreamKey(); }
    if (name === 'claim-progress') { const out = await api('/api/oryon/creator/progression/claim', { method: 'POST' }); toast(out.success ? `${Number(out.gained || 0)} points récupérés.` : (out.error || 'Action impossible.')); return renderDashboard(); }
    if (name === 'start-screen') return startPreview('screen');
    if (name === 'start-camera') return startPreview('camera');
    if (name === 'stop-preview') return stopPreview();
  }

  async function startPreview(kind) {
    stopPreview();
    try {
      const stream = kind === 'screen' ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }) : await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      state.localPreview = stream;
      const video = $('#localPreview');
      const empty = $('#previewEmpty');
      if (video) video.srcObject = stream;
      if (empty) empty.classList.add('hidden');
      toast('Aperçu local lancé.');
    } catch {
      toast('Aperçu refusé ou indisponible dans ce navigateur.');
    }
  }

  function stopPreview() {
    if (state.localPreview) state.localPreview.getTracks().forEach(t => t.stop());
    state.localPreview = null;
    const video = $('#localPreview');
    const empty = $('#previewEmpty');
    if (video) video.srcObject = null;
    if (empty) empty.classList.remove('hidden');
  }

  function parseInitialRoute() {
    const pathMatch = location.pathname.match(/^\/c\/([^/]+)/);
    if (pathMatch) return { view: 'channel', login: decodeURIComponent(pathMatch[1]) };
    const h = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (h.startsWith('channel/')) return { view: 'channel', login: h.split('/')[1] };
    const valid = ['home', 'discover', 'categories', 'teams', 'settings', 'channel', 'manager', 'dashboard', 'studio', 'watch', 'admin'];
    return { view: valid.includes(h) ? h : 'home' };
  }

  function bindEvents() {
    document.addEventListener('click', ev => {
      const userBtn = ev.target.closest('#userBtn');
      if (userBtn) { $('#userMenu')?.classList.toggle('open'); return; }
      if (!ev.target.closest('.userArea')) $('#userMenu')?.classList.remove('open');

      const viewBtn = ev.target.closest('[data-view]');
      if (viewBtn) { ev.preventDefault(); setView(viewBtn.dataset.view); return; }
      const actionBtn = ev.target.closest('[data-action]');
      if (actionBtn) { ev.preventDefault(); action(actionBtn.dataset.action, actionBtn); return; }
      const liveBtn = ev.target.closest('[data-open-live]');
      if (liveBtn) { ev.preventDefault(); try { openLive(JSON.parse(decodeURIComponent(liveBtn.dataset.openLive))); } catch { toast('Live invalide.'); } return; }
      const channelBtn = ev.target.closest('[data-open-channel]');
      if (channelBtn) { ev.preventDefault(); setView('channel', { login: channelBtn.dataset.openChannel }); return; }
      const moodBtn = ev.target.closest('[data-mood]');
      if (moodBtn) { ev.preventDefault(); setView('discover', { mood: moodBtn.dataset.mood }); return; }
      const catBtn = ev.target.closest('[data-category]');
      if (catBtn) { ev.preventDefault(); setView('discover', { q: catBtn.dataset.category }); return; }
      const copyBtn = ev.target.closest('[data-copy]');
      if (copyBtn) { ev.preventDefault(); navigator.clipboard?.writeText(copyBtn.dataset.copy); toast('Copié.'); return; }
      const tabBtn = ev.target.closest('[data-tab-target]');
      if (tabBtn) {
        ev.preventDefault();
        $$('.splitTabs button').forEach(b => b.classList.toggle('active', b === tabBtn));
        ['loginBox', 'registerBox'].forEach(id => $(`#${id}`)?.classList.toggle('hidden', id !== tabBtn.dataset.tabTarget));
      }
    });

    document.addEventListener('submit', ev => {
      const form = ev.target.closest('form[data-form]');
      if (!form) return;
      ev.preventDefault();
      submitForm(form);
    });

    window.addEventListener('hashchange', () => {
      const route = parseInitialRoute();
      setView(route.view, { login: route.login, silentHash: true });
    });
  }

  async function init() {
    document.title = `${APP} — découvre les lives qu’on ne te montre pas`;
    bindEvents();
    await loadSession();
    const route = parseInitialRoute();
    await setView(route.view, { login: route.login, silentHash: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
