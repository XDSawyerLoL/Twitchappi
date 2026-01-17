(() => {
  const $ = (id) => document.getElementById(id);

  function showToast(msg) {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  async function getJSON(url, opts = {}) {
    const res = await fetch(url, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts,
    });
    const ct = res.headers.get('content-type') || '';
    let data = null;
    if (ct.includes('application/json')) {
      data = await res.json().catch(() => null);
    } else {
      data = await res.text().catch(() => '');
    }
    if (!res.ok) {
      const err = (data && data.error) ? data.error : (typeof data === 'string' ? data : 'request_failed');
      const e = new Error(err);
      e.status = res.status;
      e.payload = data;
      throw e;
    }
    return data;
  }

  function setPill(id, label, value) {
    const el = $(id);
    if (!el) return;
    el.textContent = `${label} ${value}`;
  }

  async function refreshStatus() {
    try {
      const auth = await getJSON('/twitch_user_status');
      if (!auth.is_connected) {
        setPill('pillLogin', 'Twitch :', 'non connecté');
        setPill('pillPlan', 'Plan :', '—');
        setPill('pillActions', 'Actions :', '—');
        setPill('pillCredits', 'Crédits :', '—');
        return { logged: false };
      }
      setPill('pillLogin', 'Twitch :', auth.display_name || 'connecté');

      const st = await getJSON('/api/billing/status');
      const plan = st.plan || 'free';
      const credits = Number(st.credits || 0);
      const actions = (st.actions === null || st.actions === undefined) ? 0 : st.actions;

      setPill('pillPlan', 'Plan :', plan.toUpperCase());
      setPill('pillCredits', 'Crédits :', credits.toLocaleString('fr-FR'));
      setPill('pillActions', 'Actions :', actions === Infinity ? '∞' : String(actions));

      return { logged: true, plan, credits, actions };
    } catch (e) {
      // If billing/status 401, user not logged; if 500, backend issue.
      setPill('pillPlan', 'Plan :', 'Erreur');
      return { logged: false, error: e.message };
    }
  }

  function renderPacks(packs) {
    const host = $('packs');
    if (!host) return;
    host.innerHTML = '';
    (packs || []).forEach(p => {
      const div = document.createElement('div');
      div.className = 'pack' + (p.isBest ? ' best' : '');
      div.innerHTML = `
        <div class="packLeft">
          <div class="packName">${escapeHtml(p.name)}${p.isBest ? ' <span class="badge bestBadge">POPULAIRE</span>' : ''}</div>
          <div class="packMeta">${p.credits} crédits · ${p.actions} actions</div>
        </div>
        <div class="packRight">
          <div class="packPrice">${escapeHtml(p.price)}</div>
          <button class="btn primary" data-pack="${escapeAttr(p.id)}">Acheter</button>
        </div>
      `;
      host.appendChild(div);
    });

    host.querySelectorAll('button[data-pack]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const packId = btn.getAttribute('data-pack');
        try {
          await getJSON('/api/billing/buy-pack', {
            method: 'POST',
            body: JSON.stringify({ packId })
          });
          showToast('Pack ajouté. Crédits mis à jour.');
          await refreshStatus();
        } catch (e) {
          if (e.status === 403) {
            showToast('Paiement démo désactivé (BILLING_DEMO_MODE=1).');
          } else if (e.status === 401) {
            showToast('Connecte-toi avec Twitch d\'abord.');
          } else {
            showToast('Erreur achat: ' + (e.message || '')); 
          }
        }
      });
    });
  }

  function escapeHtml(s){
    return String(s || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function escapeAttr(s){
    return String(s || '').replace(/[^a-zA-Z0-9_-]/g, '');
  }

  async function init() {
    $('btnGoApp')?.addEventListener('click', () => location.href = '/');
    $('btnScrollPacks')?.addEventListener('click', () => $('packs')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));

    $('btnPremium')?.addEventListener('click', async () => {
      try {
        await getJSON('/api/billing/subscribe-premium', { method: 'POST' });
        showToast('Premium activé.');
        await refreshStatus();
      } catch (e) {
        if (e.status === 403) showToast('Paiement démo désactivé (BILLING_DEMO_MODE=1).');
        else if (e.status === 401) showToast('Connecte-toi avec Twitch d\'abord.');
        else showToast('Erreur Premium: ' + (e.message || ''));
      }
    });

    // Packs
    try {
      const packs = await getJSON('/api/billing/packs');
      renderPacks(packs);
    } catch (e) {
      showToast('Impossible de charger les packs.');
    }

    await refreshStatus();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
