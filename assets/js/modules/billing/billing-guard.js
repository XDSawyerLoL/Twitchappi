(function(){
  const API_BASE = window.location.origin;
  const $ = (id)=>document.getElementById(id);

  const FEATURE_COST = 200;

  const FEATURE_TARGETS = [
    { feature:'overview',  sel:'#under-overview',  title:'Overview',      teaser:'Résumé actionnable + verdict IA + points forts/faibles.' },
    { feature:'analytics', sel:'#under-analytics', title:'Analytic Pro',   teaser:'Benchmark, recommandations, best time et signaux concurrence.' },
    { feature:'niche',     sel:'#under-niche',     title:'Niche',         teaser:'Score niche, potentiel, risques, axes de contenus gagnants.' },
    { feature:'besttime',  sel:'.best-time-tool',  title:'Best Time',     teaser:'Créneaux gagnants (jours/heures) selon jeu + concurrence.' },
  ];

  async function getJson(url, opts){
    const r = await fetch(url, { credentials:'include', ...(opts||{}) });
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await r.json() : null;
    if(!r.ok) throw new Error((data && (data.error || data.message)) || 'Erreur serveur');
    return data;
  }

  function ensureOverlay(container, cfg){
    if(!container) return null;

    // anti-dup
    if(container.dataset.eveyLocked === '1') return container.querySelector('.evey-lock-overlay') || null;

    container.dataset.eveyLocked = '1';
    container.classList.add('evey-locked');

    // make sure container can host overlay
    const cs = window.getComputedStyle(container);
    if(cs.position === 'static') container.style.position = 'relative';
    container.style.minHeight = container.style.minHeight || '220px';

    // blur underlying children (but keep overlay sharp)
    Array.from(container.children).forEach(ch=>{
      if(ch.classList && ch.classList.contains('evey-lock-overlay')) return;
      ch.classList.add('evey-lock-blur');
    });

    const ov = document.createElement('div');
    ov.className = 'evey-lock-overlay';
    ov.innerHTML = `
      <div class="evey-lock-card">
        <div class="evey-lock-icon">🔒</div>
        <div class="evey-lock-title">Fonction Premium</div>
        <div class="evey-lock-sub">${cfg.title} — ${cfg.teaser}</div>
        <div class="evey-lock-actions">
          <button class="evey-btn evey-btn-primary" data-action="unlock">Débloquer (${FEATURE_COST})</button>
          <button class="evey-btn evey-btn-secondary" data-action="premium">Passer Premium</button>
          <button class="evey-btn evey-btn-ghost" data-action="login">Se connecter</button>
        </div>
      </div>
    `;
    container.appendChild(ov);
    return ov;
  }

  function unlockVisual(container){
    if(!container) return;
    container.dataset.eveyLocked = '0';
    container.classList.remove('evey-locked');
    Array.from(container.querySelectorAll('.evey-lock-overlay')).forEach(n=>n.remove());
    Array.from(container.children).forEach(ch=>ch.classList && ch.classList.remove('evey-lock-blur'));
  }

  function injectStylesOnce(){
    if(document.getElementById('evey-lock-styles')) return;
    const s = document.createElement('style');
    s.id = 'evey-lock-styles';
    s.textContent = `
      .evey-lock-blur{ filter: blur(8px); opacity:.55; pointer-events:none; }
      .evey-lock-overlay{
        position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
        background:rgba(0,0,0,.45); z-index:50;
      }
      .evey-lock-card{
        width:min(520px,92%); background:rgba(10,10,10,.85);
        border:1px solid rgba(255,255,255,.08); border-radius:16px;
        padding:18px; text-align:center; box-shadow:0 20px 60px rgba(0,0,0,.55);
        backdrop-filter: blur(10px);
      }
      .evey-lock-icon{ font-size:28px; margin-bottom:6px; }
      .evey-lock-title{ font-weight:800; letter-spacing:.4px; margin-bottom:6px; }
      .evey-lock-sub{ font-size:12px; opacity:.9; line-height:1.35; margin:0 auto 12px; max-width:420px; }
      .evey-lock-actions{ display:flex; gap:10px; flex-wrap:wrap; justify-content:center; }
      .evey-btn{ border-radius:12px; padding:10px 14px; font-weight:800; font-size:12px; border:1px solid transparent; cursor:pointer; }
      .evey-btn-primary{ background:#e50914; color:#fff; }
      .evey-btn-secondary{ background:#1f1f1f; color:#fff; border-color:#2b2b2b; }
      .evey-btn-ghost{ background:transparent; color:#fff; border-color:rgba(255,255,255,.18); }
    `;
    document.head.appendChild(s);
  }

  async function refreshBillingBadge(){
    const link = $('billing-link');
    const c = $('billing-credits');
    const p = $('billing-plan');
    if(!link || !c || !p) return;

    try{
      const auth = await getJson(`${API_BASE}/twitch_user_status`);
      if(!auth?.is_connected) return;

      const me = await getJson(`${API_BASE}/api/billing/me`);
      const payload = me.success === false ? null : (me.success === true ? me : me);
      if(!payload) return;

      link.classList.remove('hidden');
      c.textContent = String(payload.credits ?? 0);
      p.textContent = String(payload.plan ?? 'free').toUpperCase();
    }catch(_){
      // keep silent
    }
  }

  // Gate Market overlay (Twitch + credits/premium)
  function installMarketGate(){
    const _open = window.openMarketOverlay;
    if(!_open) return;

    window.openMarketOverlay = async function(){
      try{
        const st = await getJson(`${API_BASE}/twitch_user_status`);
        if(!st?.is_connected){
          if(typeof window.startAuth === 'function') return window.startAuth();
          window.location.href = '/pricing';
          return;
        }

        const me = await getJson(`${API_BASE}/api/billing/me`);
        const plan = String((me.plan ?? (me.success && me.plan)) || 'free').toLowerCase();
        const credits = Number((me.credits ?? (me.success && me.credits)) || 0);

        // market: premium OR has credits for at least one action
        if(plan !== 'premium' && credits < 20){
          window.location.href = '/pricing';
          return;
        }

        return _open();
      }catch(e){
        console.error(e);
        alert(e.message || 'Erreur accès Marché');
      }
    };
  }

  async function applyPaywalls(){
    injectStylesOnce();

    // default: lock everything immediately (also when not connected)
    const containers = [];
    for(const cfg of FEATURE_TARGETS){
      const node = document.querySelector(cfg.sel);
      if(!node) continue;
      containers.push({cfg, node});
      const ov = ensureOverlay(node, cfg);
      if(ov){
        ov.addEventListener('click', async (ev)=>{
          const btn = ev.target.closest('button[data-action]');
          if(!btn) return;
          const act = btn.getAttribute('data-action');

          if(act === 'premium'){
            window.location.href = '/pricing';
            return;
          }
          if(act === 'login'){
            if(typeof window.startAuth === 'function') return window.startAuth();
            window.location.href = '/pricing';
            return;
          }
          if(act === 'unlock'){
            try{
              const st = await getJson(`${API_BASE}/twitch_user_status`);
              if(!st?.is_connected){
                if(typeof window.startAuth === 'function') return window.startAuth();
                window.location.href = '/pricing';
                return;
              }
              const r = await getJson(`${API_BASE}/api/billing/unlock-feature`, {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ feature: cfg.feature })
              });
              if(r && (r.success === true || r.ok === true)){
                await refreshBillingBadge();
                // re-evaluate
                await hydrateUnlockStates();
              }
            }catch(e){
              alert(e.message || 'Déblocage impossible');
            }
          }
        }, { passive:true });
      }
    }

    async function hydrateUnlockStates(){
      let st = null;
      try{ st = await getJson(`${API_BASE}/twitch_user_status`); }catch(_){}
      const isConnected = !!st?.is_connected;

      // if not connected: keep locked, but buttons still shown (login/pricing)
      if(!isConnected) return;

      let me = null;
      try{ me = await getJson(`${API_BASE}/api/billing/me`); }catch(_){}
      if(!me) return;

      const plan = String(me.plan || 'free').toLowerCase();
      const ent = (me.entitlements && typeof me.entitlements === 'object') ? me.entitlements : {};

      for(const {cfg, node} of containers){
        const unlocked = (plan === 'premium') || (ent[cfg.feature] === true);
        if(unlocked) unlockVisual(node);
      }
    }

    // hydrate after initial paint
    setTimeout(hydrateUnlockStates, 120);
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    refreshBillingBadge();
    installMarketGate();
    applyPaywalls();
  });

  window.refreshBillingBadge = refreshBillingBadge;
})();