(() => {
  const $ = (id) => document.getElementById(id);

  function showToast(message, kind) {
    const el = $('toast');
    if (!el) return;
    el.textContent = String(message || '');
    el.classList.remove('show', 'ok', 'bad');
    if (kind === 'ok') el.classList.add('ok');
    if (kind === 'bad') el.classList.add('bad');
    el.classList.add('show');
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => {
      el.classList.remove('show','ok','bad');
    }, 3800);
  }

  async function getJson(url, opts) {
    const res = await fetch(url, Object.assign({ credentials: 'include' }, opts || {}));
    const txt = await res.text();
    let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch (_) {}
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) || res.statusText || 'Erreur';
      throw new Error(msg);
    }
    return data;
  }

  function setPill(id, label, value) {
    const el = $(id);
    if (!el) return;
    el.textContent = `${label}: ${value}`;
  }

  async function refreshStatus() {
    // Twitch status
    const u = await getJson('/twitch_user_status').catch(() => ({ is_connected: false }));

    if (!u.is_connected) {
      setPill('pillLogin', 'Twitch', 'Non connecte');
      setPill('pillPlan', 'Plan', '—');
      setPill('pillActions', 'Actions', '—');
      setPill('pillCredits', 'Credits', '—');
      return { connected: false };
    }

    setPill('pillLogin', 'Twitch', u.display_name || 'Connecte');

    const me = await getJson('/api/billing/me').catch(() => null);
    if (!me || !me.success) {
      setPill('pillPlan', 'Plan', 'Erreur');
      setPill('pillActions', 'Actions', '—');
      setPill('pillCredits', 'Credits', '—');
      return { connected: true };
    }

    const plan = (me.plan || 'free').toUpperCase();
    setPill('pillPlan', 'Plan', plan);
    setPill('pillCredits', 'Credits', String(me.credits ?? 0));
    setPill('pillActions', 'Actions', plan === 'PREMIUM' ? '∞' : String(me.actions ?? 0));
    return { connected: true, me };
  }

  function renderPacks(packs) {
    const root = $('packs');
    if (!root) return;
    root.innerHTML = '';

    (packs || []).forEach((p) => {
      const btn = document.createElement('button');
      btn.className = 'pack';
      btn.type = 'button';
      btn.innerHTML = `
        <div class="packTop">
          <div class="packName">${p.label}</div>
          <div class="packPrice">${p.price}</div>
        </div>
        <div class="packMeta">${p.credits} credits</div>
      `;
      btn.addEventListener('click', () => startCheckout(p.sku));
      root.appendChild(btn);
    });
  }

  async function loadPacks() {
    const data = await getJson('/api/billing/packs');
    renderPacks(data.packs || []);
  }

  async function startCheckout(sku) {
    try {
      const data = await getJson('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku })
      });

      if (data && data.url) {
        window.location.href = data.url;
        return;
      }
      showToast('Paiement indisponible (Stripe non configure).', 'bad');
    } catch (e) {
      showToast(e.message || 'Erreur paiement', 'bad');
    }
  }

  function bindButtons() {
    const go = $('btnGoApp');
    if (go) go.onclick = () => (window.location.href = '/');

    const scrollPacks = $('btnScrollPacks');
    if (scrollPacks) {
      scrollPacks.onclick = () => {
        const el = $('packs');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
    }

    const prem = $('btnPremium');
    if (prem) {
      prem.onclick = () => startCheckout('premium_monthly');
    }
  }

  async function main() {
    bindButtons();
    await refreshStatus();
    await loadPacks();

    // Refresh pills periodically (credits/plan may update after checkout)
    window.setInterval(() => { refreshStatus(); }, 15000);
  }

  document.addEventListener('DOMContentLoaded', () => { main(); });
})();
