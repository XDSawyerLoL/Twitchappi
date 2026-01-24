(function(){
  const API_BASE = window.location.origin;
  const $ = (id)=>document.getElementById(id);

  async function getJson(url){
    const r = await fetch(url, { credentials:'include' });
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await r.json() : null;
    if(!r.ok) throw new Error((data && (data.error || data.message)) || 'Erreur serveur');
    return data;
  }

  async function refreshBillingBadge(){
    const link = $('billing-link');
    const c = $('billing-credits');
    const p = $('billing-plan');
    if(!link || !c || !p) return;

    try{
      const auth = await getJson(`${API_BASE}/twitch_user_status`);
      if(!auth?.is_connected){
        // keep hidden if not logged
        return;
      }
      const me = await getJson(`${API_BASE}/api/billing/me`);
      link.classList.remove('hidden');
      c.textContent = String(me.credits ?? 0);
      p.textContent = String(me.plan ?? 'free').toUpperCase();
    }catch(_){
      // don't break UI
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
          alert('Connexion Twitch requise.');
          return;
        }

        const me = await getJson(`${API_BASE}/api/billing/me`);
        const plan = String(me.plan || 'free').toLowerCase();
        const credits = Number(me.credits || 0);

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

  
  function ensurePaywallStyles(){
    if(document.getElementById('evey-paywall-style')) return;
    const st = document.createElement('style');
    st.id = 'evey-paywall-style';
    st.textContent = `
      .evey-paywalled{position:relative;}
      .evey-paywalled > :not(.evey-paywall-overlay){filter: blur(6px); pointer-events:none; user-select:none;}
      .evey-paywall-overlay{position:absolute; inset:0; display:flex; align-items:center; justify-content:center; padding:16px; background:rgba(0,0,0,.55); z-index:50;}
      .evey-paywall-card{max-width:360px; width:100%; border:1px solid rgba(255,255,255,.12); background:rgba(15,15,18,.85); border-radius:14px; padding:14px; text-align:center; backdrop-filter: blur(8px);}
      .evey-paywall-lock{font-size:28px; margin-bottom:8px;}
      .evey-paywall-title{font-weight:800; letter-spacing:.02em; margin-bottom:6px;}
      .evey-paywall-sub{font-size:12px; opacity:.85; margin-bottom:10px;}
      .evey-paywall-actions{display:flex; gap:10px; justify-content:center; flex-wrap:wrap;}
      .evey-paywall-btn{border-radius:10px; padding:10px 12px; font-weight:800; font-size:12px; border:1px solid rgba(255,255,255,.16); background:#111; color:#fff; cursor:pointer;}
      .evey-paywall-btn.primary{background:#00f2ea; color:#000; border-color:transparent;}
    `;
    document.head.appendChild(st);
  }

  function applyPaywall(targetEl, opts){
    if(!targetEl) return;
    ensurePaywallStyles();

    // Avoid duplicates
    if(targetEl.__eveyPaywalled) return;
    targetEl.__eveyPaywalled = true;

    targetEl.classList.add('evey-paywalled');

    const overlay = document.createElement('div');
    overlay.className = 'evey-paywall-overlay';
    overlay.innerHTML = `
      <div class="evey-paywall-card">
        <div class="evey-paywall-lock">🔒</div>
        <div class="evey-paywall-title">${opts.title || 'Contenu Premium'}</div>
        <div class="evey-paywall-sub">${opts.subtitle || 'Débloque cette fonctionnalité avec des crédits ou Premium.'}</div>
        <div class="evey-paywall-actions">
          <button class="evey-paywall-btn primary" data-action="unlock">Débloquer (${opts.cost || 200} crédits)</button>
          <button class="evey-paywall-btn" data-action="premium">Passer Premium</button>
        </div>
      </div>
    `;
    overlay.addEventListener('click', async (e)=>{
      const btn = e.target.closest('button[data-action]');
      if(!btn) return;
      e.preventDefault();
      const action = btn.getAttribute('data-action');

      if(action === 'premium'){
        window.location.href = '/pricing';
        return;
      }

      if(action === 'unlock'){
        try{
          const r = await fetch(`${API_BASE}/api/billing/unlock-feature`, {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            credentials:'include',
            body: JSON.stringify({ feature: opts.feature })
          });
          const ct = r.headers.get('content-type') || '';
          const d = ct.includes('application/json') ? await r.json() : null;
          if(!r.ok){
            if(r.status === 401){
              if(typeof window.startAuth === 'function') return window.startAuth();
              alert('Connexion Twitch requise.');
              return;
            }
            if(r.status === 402){
              window.location.href = '/pricing';
              return;
            }
            throw new Error((d && (d.error || d.message)) || 'Erreur unlock');
          }

          // success -> remove paywall
          targetEl.classList.remove('evey-paywalled');
          targetEl.__eveyPaywalled = false;
          overlay.remove();
          if(typeof window.refreshBillingBadge === 'function') window.refreshBillingBadge();
        }catch(err){
          alert(err.message || 'Erreur unlock');
        }
      }
    });

    targetEl.appendChild(overlay);
  }

  async function installFeaturePaywalls(){
    // Targets
    const tOverview = document.getElementById('under-overview');
    const tAnalytics = document.getElementById('under-analytics');
    const tNiche = document.getElementById('under-niche');
    const tBestTime = document.querySelector('.best-time-tool');

    const targets = [
      { el: tOverview,  feature:'overview',  title:'Overview',     cost:200 },
      { el: tAnalytics, feature:'analytics', title:'Analytics Pro', cost:200 },
      { el: tNiche,     feature:'niche',     title:'Niche',         cost:200 },
      { el: tBestTime,  feature:'besttime',  title:'Best Time To Stream', cost:200 },
    ].filter(x=>x.el);

    if(targets.length === 0) return;

    try{
      const st = await getJson(`${API_BASE}/twitch_user_status`);
      if(!st?.is_connected){
        // lock with "connect" path
        targets.forEach(t=>{
          applyPaywall(t.el, { ...t, subtitle:'Connexion Twitch requise pour débloquer.' });
        });
        return;
      }

      const me = await getJson(`${API_BASE}/api/billing/me`);
      const plan = String(me.plan || 'free').toLowerCase();
      const ent = me.entitlements || {};

      targets.forEach(t=>{
        const unlocked = (plan === 'premium') || (ent[t.feature] === true);
        if(!unlocked){
          applyPaywall(t.el, t);
        }
      });
    }catch(_){
      // fail closed: do nothing (avoid blocking the UI if billing not ready)
    }
  }


document.addEventListener('DOMContentLoaded', ()=>{
    refreshBillingBadge();
    installMarketGate();
    installFeaturePaywalls();
  });

  // Expose for other modules if needed
  window.refreshBillingBadge = refreshBillingBadge;
})();
