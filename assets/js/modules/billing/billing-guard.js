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
          try{ if(window.top && window.top!==window) window.top.location.href='/pricing?from=market'; else window.location.href='/pricing?from=market'; }catch(_){ window.location.href='/pricing?from=market'; }
          return;
        }

        const me = await getJson(`${API_BASE}/api/billing/me`);
        const plan = String(me.plan || 'free').toLowerCase();
        const credits = Number(me.credits || 0);

        if(plan !== 'premium'){
          try{ if(window.top && window.top!==window) window.top.location.href='/pricing?from=market'; else window.location.href='/pricing?from=market'; }catch(_){ window.location.href='/pricing?from=market'; }
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
  const s = document.createElement('style');
  s.id='evey-paywall-style';
  s.textContent = `
    .evey-locked{ position:relative; }
    .evey-locked > .evey-lock-overlay{
      position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
      background:rgba(0,0,0,.55); backdrop-filter: blur(1px); z-index:50;
    }
    .evey-locked > .evey-lock-overlay .box{
      width:min(360px,92%); text-align:center; border:1px solid rgba(255,255,255,.12);
      background:rgba(10,10,12,.85); border-radius:14px; padding:14px;
    }
    .evey-locked .evey-blur-target{ filter: blur(10px); pointer-events:none; user-select:none; }
    .evey-lock-title{ font-weight:800; margin-top:8px; }
    .evey-lock-actions{ display:flex; gap:10px; margin-top:10px; justify-content:center; flex-wrap:wrap; }
    .evey-btn{ padding:10px 12px; border-radius:12px; font-weight:800; border:1px solid rgba(255,255,255,.12); cursor:pointer; }
    .evey-btn-primary{ background:rgba(0,242,234,.18); border-color: rgba(0,242,234,.35); color:#bff; }
    .evey-btn-secondary{ background:rgba(155,89,182,.18); border-color: rgba(155,89,182,.35); color:#f3d; }
    .evey-lock-icon{ font-size:26px; }
  `;
  document.head.appendChild(s);
}

function lockElement(el, featureKey, cost){
  if(!el || el.dataset.eveyLocked==='1') return;
  ensurePaywallStyles();

  const blur = document.createElement('div');
  blur.className = 'evey-blur-target';
  while(el.firstChild){ blur.appendChild(el.firstChild); }
  el.appendChild(blur);

  const overlay = document.createElement('div');
  overlay.className = 'evey-lock-overlay';
  overlay.innerHTML = `
    <div class="box">
      <div class="evey-lock-icon">🔒</div>
      <div class="evey-lock-title">Débloquer ce module</div>
      <div style="opacity:.8;font-size:12px;margin-top:4px;">${cost} crédits • ou Premium</div>
      <div class="evey-lock-actions">
        <button class="evey-btn evey-btn-primary" data-unlock="${featureKey}">Débloquer (${cost})</button>
        <button class="evey-btn evey-btn-secondary" data-pricing="1">Passer Premium</button>
      </div>
    </div>
  `;
  el.classList.add('evey-locked');
  el.appendChild(overlay);
  el.dataset.eveyLocked='1';
}

async function unlockFeature(featureKey, cost){
  try{
    const st = await getJson(`${API_BASE}/twitch_user_status`);
    if(!st?.is_connected){
      try{ if(window.top && window.top!==window) window.top.location.href='/pricing?from=unlock'; else window.location.href='/pricing?from=unlock'; }catch(_){ window.location.href='/pricing?from=unlock'; }
      return;
    }
    const r = await fetch(`${API_BASE}/api/billing/unlock-feature`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      credentials:'include',
      body: JSON.stringify({ feature: featureKey, cost })
    });
    const d = await r.json().catch(()=>null);
    if(!d || !d.success){
      if(d && d.error === 'INSUFFICIENT_CREDITS'){
        try{ if(window.top && window.top!==window) window.top.location.href='/pricing?need=credits'; else window.location.href='/pricing?need=credits'; }catch(_){ window.location.href='/pricing?need=credits'; }
        return;
      }
      alert((d && d.error) ? d.error : 'Erreur déverrouillage');
      return;
    }
    window.location.reload();
  }catch(e){
    console.error(e);
    alert('Erreur déverrouillage');
  }
}

async function installFeaturePaywalls(){
  try{
    const st = await getJson(`${API_BASE}/twitch_user_status`);
    if(!st?.is_connected) return;
    const me = await getJson(`${API_BASE}/api/billing/me`);
    const plan = String(me.plan||'free').toLowerCase();
    if(plan === 'premium') return;

    const ent = me.entitlements || {};
    const cost = 200;

    const map = [
      { id:'under-overview', key:'overview' },
      { id:'under-analytics', key:'analytics' },
      { id:'under-niche', key:'niche' }
    ];
    map.forEach(it=>{
      if(!ent[it.key]) lockElement(document.getElementById(it.id), it.key, cost);
    });

    const best = document.querySelector('.best-time-tool');
    if(best && !ent.bestTime) lockElement(best, 'bestTime', cost);

    document.addEventListener('click', (ev)=>{
      const u = ev.target.closest('[data-unlock]');
      if(u){
        ev.preventDefault();
        unlockFeature(u.getAttribute('data-unlock'), cost);
      }
      const p = ev.target.closest('[data-pricing]');
      if(p){
        ev.preventDefault();
        try{ if(window.top && window.top!==window) window.top.location.href='/pricing'; else window.location.href='/pricing'; }catch(_){ window.location.href='/pricing'; }
      }
    }, { passive:false });
  }catch(_){}
}


document.addEventListener('DOMContentLoaded', ()=>{
    refreshBillingBadge();
    installMarketGate();
    installFeaturePaywalls();
  });

  // Expose for other modules if needed
  window.refreshBillingBadge = refreshBillingBadge;
})();
