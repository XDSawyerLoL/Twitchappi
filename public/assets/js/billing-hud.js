(() => {
  const API = window.API_BASE || '';
  const safeFetchJson = async (url, opts) => {
    const r = await fetch(url, Object.assign({ credentials: 'include' }, opts || {}));
    const t = await r.text();
    try { return JSON.parse(t); } catch { return null; }
  };

  function ensureHudContainer() {
    const userArea = document.getElementById('user-area');
    const nameEl = document.getElementById('user-name') || document.getElementById('hub-user-display');
    if (!userArea && !nameEl) return null;

    let hud = document.getElementById('billing-hud');
    if (hud) return hud;

    hud = document.createElement('a');
    hud.id = 'billing-hud';
    hud.href = '/pricing';
    hud.title = 'Voir crédits & Premium';
    hud.style.marginLeft = '10px';
    hud.style.display = 'inline-flex';
    hud.style.alignItems = 'center';
    hud.style.gap = '6px';
    hud.style.padding = '4px 10px';
    hud.style.borderRadius = '999px';
    hud.style.border = '1px solid rgba(0,242,234,.45)';
    hud.style.background = 'rgba(0,242,234,.10)';
    hud.style.color = '#00f2ea';
    hud.style.fontFamily = 'Orbitron, Inter, sans-serif';
    hud.style.fontSize = '10px';
    hud.style.fontWeight = '900';
    hud.style.letterSpacing = '.08em';
    hud.style.textDecoration = 'none';
    hud.textContent = 'CREDITS: ...';

    if (nameEl && nameEl.parentElement) {
      nameEl.parentElement.appendChild(hud);
    } else if (userArea) {
      userArea.appendChild(hud);
    }

    return hud;
  }

  async function refresh() {
    const auth = await safeFetchJson(`${API}/twitch_user_status`).catch(() => ({ is_connected: false }));
    const hud = ensureHudContainer();
    if (!hud) return;

    if (!auth || !auth.is_connected) {
      // Not connected: never show hud
      hud.style.display = 'none';
      return;
    }

    hud.style.display = 'inline-flex';

    const me = await safeFetchJson(`${API}/api/billing/me`).catch(() => null);
    if (!me || !me.success) {
      hud.textContent = 'CREDITS: --';
      return;
    }

    const plan = String(me.plan || 'free').toUpperCase();
    if (plan === 'PREMIUM') {
      hud.textContent = 'PREMIUM';
      hud.style.borderColor = 'rgba(255,0,153,.45)';
      hud.style.background = 'rgba(255,0,153,.10)';
      hud.style.color = '#ff0099';
      return;
    }

    hud.style.borderColor = 'rgba(0,242,234,.45)';
    hud.style.background = 'rgba(0,242,234,.10)';
    hud.style.color = '#00f2ea';

    const credits = Number(me.credits || 0);
    const actions = Math.floor(credits / Number(me.cost_per_action || 20));
    hud.textContent = `FREE • ${actions} ACTIONS • ${credits} CR`;
  }

  document.addEventListener('DOMContentLoaded', () => {
    refresh();
    window.setInterval(refresh, 15000);
  });
})();
