(() => {
  const API_BASE = '';

  function el(tag, attrs={}, children=[]) {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v]) => {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, String(v));
    });
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (c == null) return;
      if (typeof c === 'string') n.appendChild(document.createTextNode(c));
      else n.appendChild(c);
    });
    return n;
  }

  async function getJSON(url) {
    const res = await fetch(url, { credentials:'include' });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  function formatActions(actions) {
    if (actions === Infinity) return '∞';
    const n = Number(actions || 0);
    return String(n);
  }

  function mountBadge(plan, credits, actions) {
    const userArea = document.getElementById('user-area');
    const userName = document.getElementById('user-name');
    if (!userArea || !userName) return;

    // Already mounted
    if (document.getElementById('billing-badge')) return;

    const badge = el('button', {
      id: 'billing-badge',
      type: 'button',
      class: 'ml-2 px-3 py-1 rounded-lg border border-[#00f2ea33] bg-[#0b0d0f] text-[#00f2ea] text-[11px] font-extrabold hover:bg-[#111] transition',
      title: 'Voir crédits / Premium',
      onclick: () => window.location.href = '/pricing'
    }, [`${(plan || 'free').toUpperCase()} • Actions: ${formatActions(actions)} • ${Number(credits||0)}c`]);

    // Insert right after username
    userName.insertAdjacentElement('afterend', badge);
  }

  async function refresh() {
    const s = await getJSON(`${API_BASE}/twitch_user_status`);
    if (!s.ok || !s.data || !s.data.is_connected) {
      // Not connected: ensure badge absent
      document.getElementById('billing-badge')?.remove();
      return;
    }

    const b = await getJSON('/api/billing/status');
    if (!b.ok) {
      // If billing blocked due to Firestore down, just remove badge to avoid confusion
      document.getElementById('billing-badge')?.remove();
      return;
    }

    mountBadge(b.data.plan, b.data.credits, b.data.actions);
  }

  function hookLogin() {
    // When user logs in, startAuth() triggers a reload; just refresh periodically in case.
    refresh();
    setInterval(refresh, 25000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hookLogin);
  else hookLogin();
})();
