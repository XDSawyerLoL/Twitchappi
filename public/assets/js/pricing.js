(() => {
  const $ = (id) => document.getElementById(id);
  const toast = (msg) => {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2200);
  };

  async function safeFetch(url, opts){
    try{
      const res = await fetch(url, { credentials:'include', ...opts });
      const ct = res.headers.get('content-type') || '';
      const data = ct.includes('application/json') ? await res.json() : await res.text();
      return { ok: res.ok, status: res.status, data };
    }catch(e){
      return { ok:false, status:0, data:{ error:String(e) } };
    }
  }

  async function getStatus(){
    // Support both endpoint names (old/new) without breaking.
    let r = await safeFetch('/api/billing/status');
    if (r.ok) return r.data;
    r = await safeFetch('/api/billing/me');
    if (r.ok) return r.data;
    return null;
  }

  async function getAuth(){
    const r = await safeFetch('/twitch_user_status');
    if (r.ok && r.data) return r.data;
    const r2 = await safeFetch('/api/auth/me');
    if (r2.ok && r2.data) return r2.data;
    return null;
  }

  function setPill(id, value){
    const el = $(id);
    if (!el) return;
    el.textContent = value;
  }

  function renderPacks(packs){
    const root = $('packs');
    if (!root) return;
    root.innerHTML = '';

    if (!Array.isArray(packs) || !packs.length){
      const d = document.createElement('div');
      d.className = 'pack';
      d.innerHTML = '<div><div class="packTitle">Packs indisponibles</div><div class="packSub">Configure tes packs dans /api/billing/packs</div></div>';
      root.appendChild(d);
      return;
    }

    packs.forEach((p) => {
      const d = document.createElement('div');
      d.className = 'pack';
      const credits = Number(p.credits || p.amountCredits || 0);
      const price = p.price || p.amount || p.eur || '';
      d.innerHTML = `
        <div>
          <div class="packTitle">${credits.toLocaleString('fr-FR')} credits</div>
          <div class="packSub">${p.label || 'Pack'} • ${price ? String(price) : ''}</div>
        </div>
        <button class="btn small" type="button">Acheter</button>
      `;
      d.querySelector('button').onclick = async () => {
        // Support both checkout flows.
        let rr = await safeFetch('/api/billing/create-checkout-session', {
          method:'POST',
          headers:{'content-type':'application/json'},
          body: JSON.stringify({ packId: p.id || p.packId || credits })
        });
        if (rr.ok && rr.data && rr.data.url){
          window.location.href = rr.data.url;
          return;
        }
        // Fallback: dev endpoint
        rr = await safeFetch('/api/billing/buy-pack', {
          method:'POST',
          headers:{'content-type':'application/json'},
          body: JSON.stringify({ credits })
        });
        if (rr.ok){
          toast('Pack ajoute');
          init();
          return;
        }
        toast('Paiement non configure');
      };
      root.appendChild(d);
    });
  }

  async function init(){
    const auth = await getAuth();
    if (auth && (auth.is_connected || auth.connected || auth.loggedIn)){
      setPill('pillLogin', 'Twitch : connecte');
    }else{
      setPill('pillLogin', 'Twitch : deconnecte');
    }

    const status = await getStatus();
    if (!status){
      setPill('pillPlan', 'Plan : ...');
      setPill('pillActions', 'Actions : ...');
      setPill('pillCredits', 'Credits : ...');
      renderPacks([]);
      return;
    }

    const plan = (status.plan || status.tier || 'free').toString().toUpperCase();
    const credits = Number(status.credits ?? status.balance ?? 0);
    const actions = plan === 'PREMIUM' ? 'illimitees' : Math.floor(credits / 20);

    setPill('pillPlan', `Plan : ${plan}`);
    setPill('pillActions', `Actions : ${actions}`);
    setPill('pillCredits', `Credits : ${credits}`);

    // packs
    const packsRes = await safeFetch('/api/billing/packs');
    const packs = (packsRes.ok && Array.isArray(packsRes.data)) ? packsRes.data : (packsRes.ok && packsRes.data && Array.isArray(packsRes.data.packs) ? packsRes.data.packs : []);
    renderPacks(packs);

    // buttons
    const go = $('btnGoApp');
    if (go) go.onclick = () => window.location.href = '/';

    const sc = $('btnScrollPacks');
    if (sc) sc.onclick = () => { const el = $('packs'); if (el) el.scrollIntoView({ behavior:'smooth', block:'center' }); };

    const pr = $('btnPremium');
    if (pr) pr.onclick = async () => {
      const r = await safeFetch('/api/billing/subscribe-premium', { method:'POST' });
      if (r.ok){ toast('Premium active'); init(); return; }
      toast('Premium non configure');
    };
  }

  document.addEventListener('DOMContentLoaded', init);
})();
