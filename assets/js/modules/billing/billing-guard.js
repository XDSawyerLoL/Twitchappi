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

  document.addEventListener('DOMContentLoaded', ()=>{
    refreshBillingBadge();
    installMarketGate();
  });

  // Expose for other modules if needed
  window.refreshBillingBadge = refreshBillingBadge;
})();
