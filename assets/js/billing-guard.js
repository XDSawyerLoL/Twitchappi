(function(){
  const API_BASE = window.location.origin;
  const $ = (id)=>document.getElementById(id);

  const COST_PER_TAB = 200;
  const FEATURES = {
    overview: { containerId: 'under-overview' },
    analytics: { containerId: 'under-analytics' },
    niche: { containerId: 'under-niche' },
    bestTime: { selector: '.best-time-tool' } // can be multiple
  };

const FEATURE_META = {
  overview: { title: "OVERVIEW", hint: "Résumé clair : KPIs, verdict IA, points forts/faibles, action suivante." },
  analytics: { title: "ANALYTICS PRO", hint: "Analyse avancée : courbes, comparaison, signaux, benchmark." },
  niche: { title: "NICHE", hint: "Opportunités : idées de niches/jeux, concurrence, timing, angle gagnant." },
  bestTime: { title: "BEST TIME TO STREAM", hint: "Créneaux optimisés : meilleur ratio visibilité / concurrence." },
  market: { title: "MARCHÉ DU STREAMER", hint: "Portefeuille & positions : suivi, perf, décisions (Premium requis)." }
};


  async function getJson(url, opts){
    const r = await fetch(url, Object.assign({ credentials:'include' }, opts||{}));
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
      if(!auth?.is_connected) return;
      const me = await getJson(`${API_BASE}/api/billing/me`);
      link.classList.remove('hidden');
      c.textContent = String(me.credits ?? 0);
      p.textContent = String(me.plan ?? 'free').toUpperCase();
    }catch(_){}
  }

  function ensurePaywallStyles(){
    if(document.getElementById('paywall-style')) return;
    const css = document.createElement('style');
    css.id = 'paywall-style';
    css.textContent = `
      .paywall-wrap{ position:relative; }
      .paywall-blur{ filter: blur(7px); opacity:.55; pointer-events:none; user-select:none; }
      .paywall-overlay{
        position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
        background: rgba(0,0,0,.35);
        border: 1px solid rgba(255,255,255,.08);
        border-radius: 14px;
        z-index: 40;
      }
      .paywall-card{
        width: min(420px, 92%);
        padding: 16px 14px;
        border-radius: 14px;
        background: rgba(8,8,10,.85);
        border: 1px solid rgba(255,255,255,.10);
        box-shadow: 0 18px 55px rgba(0,0,0,.55);
        text-align:center;
      }
      .paywall-lock{
        width: 44px; height:44px; border-radius: 14px;
        display:flex; align-items:center; justify-content:center;
        margin: 0 auto 10px auto;
        background: rgba(229,9,20,.14);
        border: 1px solid rgba(229,9,20,.28);
        color: #e50914;
        font-size: 18px;
      }
      .paywall-title{ font-weight:800; font-size: 13px; color:#fff; }
      .paywall-sub{ margin-top:6px; font-size:12px; color: rgba(255,255,255,.72); }
      .paywall-actions{ display:flex; gap:10px; justify-content:center; margin-top:12px; flex-wrap:wrap; }
      .paywall-btn{
        padding:10px 12px; border-radius:12px; font-size:12px; font-weight:800;
        border:1px solid rgba(255,255,255,.12);
        background: rgba(255,255,255,.06);
        color:#fff;
        cursor:pointer;
      }
      .paywall-btn.primary{
        background:#e50914;
        border-color:#e50914;
      }
      .paywall-btn:hover{ transform: translateY(-1px); }
    `;
    document.head.appendChild(css);
  }

  function wrapAndBlur(el, featureKey, mode){
  if(!el) return;
  ensurePaywallStyles();

  const meta = FEATURE_META[featureKey] || { title: "Fonction Premium", hint: "Débloque pour accéder." };
  const isAuth = (mode === 'auth');

  // Reuse existing wrapper if already present
  let wrap = el.closest('.paywall-wrap');
  if(!wrap){
    wrap = document.createElement('div');
    wrap.className = 'paywall-wrap';
    el.parentNode.insertBefore(wrap, el);
    wrap.appendChild(el);
  }

  el.classList.add('paywall-blur');
  el.dataset.paywalled = featureKey;
  el.dataset.paywallMode = mode || 'locked';

  // Ensure single overlay (update if exists)
  let overlay = wrap.querySelector('.paywall-overlay');
  if(!overlay){
    overlay = document.createElement('div');
    overlay.className = 'paywall-overlay';
    wrap.appendChild(overlay);
  }

  const primaryBtn = isAuth
    ? `<button class="paywall-btn primary" data-auth="1">Se connecter Twitch</button>`
    : `<button class="paywall-btn primary" data-unlock="${featureKey}">Débloquer (${COST_PER_TAB})</button>`;

  const sub = isAuth
    ? `Connexion Twitch requise pour afficher tes crédits/plan et gérer les déblocages.`
    : `Débloque <b>${meta.title}</b> pour <b>${COST_PER_TAB}</b> crédits (définitif) ou passe Premium.`;

  overlay.innerHTML = `
    <div class="paywall-card" data-feature="${featureKey}">
      <div class="paywall-lock">🔒</div>
      <div class="paywall-title">${meta.title}</div>
      <div class="paywall-sub">${meta.hint}</div>
      <div class="paywall-sub" style="margin-top:10px;">${sub}</div>
      <div class="paywall-actions">
        ${primaryBtn}
        <button class="paywall-btn" data-pricing="1">Voir les offres</button>
      </div>
    </div>
  `;
}

  function unblur(el){
    if(!el) return;
    el.classList.remove('paywall-blur');
    const wrap = el.parentElement;
    if(wrap && wrap.classList.contains('paywall-wrap')){
      const ov = wrap.querySelector('.paywall-overlay');
      if(ov) ov.remove();
      // unwrap to keep DOM clean
      wrap.parentNode.insertBefore(el, wrap);
      wrap.remove();
    }
  }

  
async function applyPaywalls(){
  try{
    const auth = await getJson(`${API_BASE}/twitch_user_status`);
    const isConnected = !!auth?.is_connected;

    // If not connected: still show locked overlays (same look) + CTA to connect/pricing
    if(!isConnected){
      for(const key of ['overview','analytics','niche']){
        const cfg = FEATURES[key];
        const el = $(cfg.containerId);
        wrapAndBlur(el, key, 'auth');
      }
      document.querySelectorAll(FEATURES.bestTime.selector).forEach(el=>{
        wrapAndBlur(el, 'bestTime', 'auth');
      });
      return;
    }

    const me = await getJson(`${API_BASE}/api/billing/me`);
    const plan = String(me.plan || 'free').toLowerCase();
    const ent = me.entitlements || {};

    // Premium = everything unlocked
    if(plan === 'premium'){
      Object.values(FEATURES).forEach(cfg=>{
        if(cfg.containerId) unblur($(cfg.containerId));
        if(cfg.selector) document.querySelectorAll(cfg.selector).forEach(unblur);
      });
      return;
    }

    // Overview / analytics / niche
    for(const key of ['overview','analytics','niche']){
      const cfg = FEATURES[key];
      const el = $(cfg.containerId);
      if(ent[key] === true) unblur(el);
      else wrapAndBlur(el, key, 'locked');
    }

    // Best time: can be multiple boxes, treat as one feature
    document.querySelectorAll(FEATURES.bestTime.selector).forEach(el=>{
      if(ent.bestTime === true || ent.analytics === true) unblur(el); // if analytics unlocked, allow best time
      else wrapAndBlur(el, 'bestTime', 'locked');
    });

  }catch(e){
    // silent: never break app
    console.warn('[PAYWALL]', e.message);
  }
}

async function unlockFeature(feature){
    try{
      const r = await getJson(`${API_BASE}/api/billing/unlock-feature`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ feature, cost: COST_PER_TAB })
      });
      if(r.success){
        await refreshBillingBadge();
        await applyPaywalls();
      }else{
        alert(r.error || 'Déblocage impossible');
      }
    }catch(e){
      alert(e.message || 'Déblocage impossible');
    }
  }

  // Gate Market overlay: must be Twitch-connected, then Premium required (redirect pricing)
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
        if(plan !== 'premium'){
          // Market is Pro/Premium feature: go pricing
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

  document.addEventListener('click', (e)=>{
    const ba = e.target.closest('[data-auth="1"]');
    if(ba){ e.preventDefault(); if(typeof window.startAuth==='function'){ window.startAuth(); } else { alert('Connexion Twitch requise.'); } return; }

    const b1 = e.target.closest('[data-pricing="1"]');
    if(b1){ e.preventDefault(); window.location.href='/pricing'; return; }

    const b2 = e.target.closest('[data-unlock]');
    if(b2){
      e.preventDefault();
      const f = b2.getAttribute('data-unlock');
      unlockFeature(f);
      return;
    }
  });

  document.addEventListener('DOMContentLoaded', ()=>{
    refreshBillingBadge();
    installMarketGate();
    // apply paywalls after initial render
    setTimeout(applyPaywalls, 200);
  });

  window.refreshBillingBadge = refreshBillingBadge;
  window.applyPaywalls = applyPaywalls;
})();