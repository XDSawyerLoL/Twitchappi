(function(){
  const $ = (id) => document.getElementById(id);
  const toast = (msg) => {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el.__t);
    el.__t = setTimeout(()=> el.classList.remove('show'), 3400);
  };

  const fmtPlan = (p) => {
    if (!p) return 'FREE';
    const up = String(p).toUpperCase();
    if (up === 'PRO' || up === 'PREMIUM') return 'PRO';
    if (up === 'CREDITS' || up === 'CREDIT') return 'CRÉDITS';
    return up;
  };

  async function api(path, opts){
    const res = await fetch(path, Object.assign({
      headers: { 'Content-Type':'application/json' },
      credentials: 'include'
    }, opts||{}));
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json() : await res.text();
    if (!res.ok){
      const msg = (data && data.error) ? data.error : (typeof data === 'string' ? data : 'Erreur serveur');
      throw new Error(msg);
    }
    if (data && data.success === false) throw new Error(data.error || 'Erreur');
    return data;
  }

  async function loadStatus(){
    try{
      const st = await api('/api/credits/status');
      $('pillPlan').textContent = `Plan : ${fmtPlan(st.plan)}`;
      const credits = Number(st.credits ?? 0);
      const actions = (st.actions === null || st.actions === undefined) ? Math.floor(credits / 20) : st.actions;
      $('pillCredits').textContent = `Crédits : ${credits}`;
      $('pillActions').textContent = `Actions : ${actions === Infinity ? '∞' : actions}`;
      return st;
    }catch(e){
      toast(e.message || 'Impossible de charger le statut');
      return null;
    }
  }

  function renderPacks(packs){
    const wrap = $('packs');
    if (!wrap) return;
    wrap.innerHTML = '';
    packs.forEach((p) => {
      const div = document.createElement('div');
      div.className = 'pack';

      const left = document.createElement('div');
      left.innerHTML = `<div><strong>${p.name}</strong> ${p.best ? '<span class="tag">⭐ Best</span>' : ''}</div>
                        <div class="meta">${p.credits} crédits • ${p.actions} actions</div>`;

      const btn = document.createElement('button');
      btn.textContent = `${p.price}`;
      btn.addEventListener('click', async () => {
        try{
          await api('/api/credits/buy-pack', { method:'POST', body: JSON.stringify({ packId: p.id }) });
          toast(`Pack ${p.name} ajouté ✅`);
          await loadStatus();
        }catch(e){
          toast(e.message || 'Achat impossible');
        }
      });

      div.appendChild(left);
      div.appendChild(btn);
      wrap.appendChild(div);
    });
  }

  async function loadPacks(){
    try{
      const resp = await api('/api/credits/packs');
      renderPacks(resp.packs || []);
      return resp.packs || [];
    }catch(e){
      toast(e.message || 'Impossible de charger les packs');
      return [];
    }
  }

  function bindButtons(){
    const btnFree = $('btnFree');
    if (btnFree) btnFree.addEventListener('click', () => location.href = '/');

    const btnBuyCredits = $('btnBuyCredits');
    if (btnBuyCredits) btnBuyCredits.addEventListener('click', () => {
      const packs = $('packs');
      if (packs) packs.scrollIntoView({ behavior:'smooth', block:'start' });
      toast('Choisis un pack d’actions');
    });

    const btnPremium = $('btnPremium');
    if (btnPremium) btnPremium.addEventListener('click', async () => {
      try{
        await api('/api/billing/subscribe_pro', { method:'POST' });
        toast('PRO activé ✅');
        await loadStatus();
      }catch(e){
        toast(e.message || 'Activation PRO impossible');
      }
    });
  }

  async function init(){
    bindButtons();
    await Promise.all([loadStatus(), loadPacks()]);
  }

  document.addEventListener('DOMContentLoaded', init);
})();