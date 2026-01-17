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
    if (!p) return 'free';
    if (p === 'premium' || p === 'pro') return 'premium';
    if (p === 'credits') return 'crédits';
    return p;
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
    return data;
  }

  function actionsFromCredits(credits){ return Math.floor((Number(credits)||0) / 20); }

  async function loadStatus(){
    try{
      const st = await api('/api/billing/status');
      $('pillPlan').textContent = `Plan : ${fmtPlan(st.plan)}`;
      $('pillCredits').textContent = `Crédits : ${st.credits ?? 0}`;
      const a = st.actions ?? actionsFromCredits(st.credits);
      $('pillActions').textContent = `Actions : ${a}`;
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
      left.innerHTML = `<div><strong>${p.name}</strong> ${p.isBest ? '<span class="tag">⭐ Best</span>' : ''}</div>
                        <div class="meta">${p.credits} crédits • ${p.actions} actions</div>`;

      const btn = document.createElement('button');
      btn.textContent = `${p.price}`;
      btn.addEventListener('click', async () => {
        try{
          await api('/api/billing/buy-pack', { method:'POST', body: JSON.stringify({ packId: p.id }) });
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
      const packs = await api('/api/billing/packs');
      renderPacks(packs);
      return packs;
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
      toast('Choisis un pack');
    });

    const btnPremium = $('btnPremium');
    if (btnPremium) btnPremium.addEventListener('click', async () => {
      try{
        await api('/api/billing/subscribe-premium', { method:'POST' });
        toast('Premium activé ✅');
        await loadStatus();
      }catch(e){
        toast(e.message || 'Activation Premium impossible');
      }
    });
  }

  async function init(){
    bindButtons();
    await Promise.all([loadStatus(), loadPacks()]);
  }

  document.addEventListener('DOMContentLoaded', init);
})();