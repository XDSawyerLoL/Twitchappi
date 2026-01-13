/* billing-ui.js
 * Minimal UI extension (no redesign): shows credits/actions + handles paywall for Market overlay.
 * Requirements:
 * - Twitch login required for Market
 * - Free users start with 1200 credits
 * - Paid modules blurred in FREE with "Débloquer (1 action)" or "Passer Premium"
 */
(function(){
  const ACTION_UNLOCK_MS = 30 * 60 * 1000; // 30 minutes per action unlock

  const state = {
    twitch: { connected:false },
    billing: { needs_login:true, plan:'free', credits:0, actions:0, action_cost:20, free_start_credits:1200 }
  };

  function $(sel, root=document){ return root.querySelector(sel); }
  function toast(msg){
    try{
      // If app has toast() already, use it.
      if (typeof window.toast === 'function') return window.toast(msg);
    }catch(_){}
    let el = document.getElementById('sh-billing-toast');
    if(!el){
      el = document.createElement('div');
      el.id = 'sh-billing-toast';
      el.style.cssText = [
        'position:fixed','left:16px','bottom:16px','z-index:99999',
        'background:rgba(0,0,0,.78)','color:#fff','padding:10px 12px',
        'border:1px solid rgba(255,255,255,.14)','border-radius:12px',
        'font:12px/1.3 system-ui,Segoe UI,Roboto,Arial','max-width:320px',
        'backdrop-filter: blur(10px)'
      ].join(';');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(()=>{ el.style.opacity='0'; }, 2600);
  }

  async function fetchJson(url, opts){
    const res = await fetch(url, Object.assign({ credentials:'include' }, opts||{}));
    let j=null;
    try{ j = await res.json(); }catch(_){}
    return { ok: res.ok, status: res.status, json: j };
  }

  async function refreshAuth(){
    const r = await fetchJson('/twitch_user_status');
    const j = r.json || {};
    state.twitch.connected = !!j.is_connected;
    state.twitch.display_name = j.display_name || '';
    return state.twitch.connected;
  }

  async function refreshBilling(){
    const r = await fetchJson('/api/billing/status');
    if (r.ok && r.json?.success){
      state.billing = r.json;
    }
    return state.billing;
  }

  function formatActions(a){
    if (a === -1) return '∞';
    return String(a ?? 0);
  }

  function ensureUserWidget(){
    // Discrete widget; does not touch existing layout.
    let box = document.getElementById('sh-userbox');
    if (!box){
      box = document.createElement('div');
      box.id = 'sh-userbox';
      box.style.cssText = [
        'position:fixed','right:16px','bottom:16px','z-index:99998',
        'background:rgba(10,10,14,.72)','color:#eaeaf0',
        'border:1px solid rgba(255,255,255,.14)','border-radius:14px',
        'padding:10px 12px','min-width:220px',
        'font:12px/1.3 system-ui,Segoe UI,Roboto,Arial',
        'backdrop-filter: blur(10px)','box-shadow:0 12px 40px rgba(0,0,0,.45)'
      ].join(';');

      box.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <div>
            <div style="font-weight:800;letter-spacing:.2px">Compte</div>
            <div id="sh-userline" style="opacity:.8">—</div>
          </div>
          <button id="sh-buy" style="background:#00e5ff;color:#001; border:0; border-radius:10px; padding:8px 10px; font-weight:900; cursor:pointer;">
            💎 Crédits / PRO
          </button>
        </div>
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
          <div style="flex:1;min-width:90px;padding:6px 8px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);">
            <div style="opacity:.7;font-size:11px">Plan</div>
            <div id="sh-plan" style="font-weight:900">—</div>
          </div>
          <div style="flex:1;min-width:90px;padding:6px 8px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);">
            <div style="opacity:.7;font-size:11px">Actions</div>
            <div id="sh-actions" style="font-weight:900">—</div>
          </div>
          <div style="flex:1;min-width:90px;padding:6px 8px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);">
            <div style="opacity:.7;font-size:11px">Crédits</div>
            <div id="sh-credits" style="font-weight:900">—</div>
          </div>
        </div>
      `;
      document.body.appendChild(box);

      $('#sh-buy', box).addEventListener('click', ()=>{
        window.location.href = '/pricing';
      });
    }
    return box;
  }

  function renderUserWidget(){
    const box = ensureUserWidget();
    const connected = state.twitch.connected;

    $('#sh-userline', box).textContent = connected ? (state.twitch.display_name || 'Connecté') : 'Non connecté';
    $('#sh-plan', box).textContent = connected ? String(state.billing.plan || 'free').toUpperCase() : '—';
    $('#sh-actions', box).textContent = connected ? formatActions(state.billing.actions) : '—';
    $('#sh-credits', box).textContent = connected ? String(state.billing.credits ?? 0) : '—';
  }

  function openTwitchLogin(){
    // Open popup to preserve UX (existing pattern)
    const w = 520, h = 740;
    const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2);
    const top = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
    window.open('/twitch_auth_start', 'twitchLogin', `width=${w},height=${h},left=${left},top=${top}`);
  }

  function isUnlocked(){
    const until = Number(sessionStorage.getItem('sh_market_unlocked_until') || 0);
    return until > Date.now();
  }
  function setUnlocked(){
    sessionStorage.setItem('sh_market_unlocked_until', String(Date.now() + ACTION_UNLOCK_MS));
  }

  async function spendOneAction(){
    const r = await fetchJson('/api/billing/spend', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ reason:'market_unlock' })
    });
    if (!r.ok || !r.json?.success){
      toast(r.json?.error || 'Impossible de débloquer (crédits?)');
      return false;
    }
    state.billing = Object.assign(state.billing, r.json);
    setUnlocked();
    renderUserWidget();
    return true;
  }

  function ensureMarketPaywall(){
    const ov = document.getElementById('market-overlay');
    if(!ov) return null;
    let pw = ov.querySelector('#sh-market-paywall');
    if(!pw){
      pw = document.createElement('div');
      pw.id = 'sh-market-paywall';
      pw.style.cssText = [
        'position:absolute','inset:0','z-index:20','display:none',
        'align-items:center','justify-content:center','padding:24px'
      ].join(';');
      pw.innerHTML = `
        <div style="position:absolute;inset:0;background:rgba(0,0,0,.55)"></div>
        <div style="position:relative;max-width:540px;width:100%;border:1px solid rgba(255,255,255,.14);border-radius:18px;padding:16px;background:rgba(10,10,14,.85);backdrop-filter:blur(10px);box-shadow:0 18px 60px rgba(0,0,0,.6);">
          <div style="font-weight:1000;font-size:16px;letter-spacing:.2px">Marché — accès payant</div>
          <div style="opacity:.85;margin-top:6px;font-size:13px">
            En <strong>FREE</strong>, le Marché est flouté. Débloque avec <strong>1 action</strong> (<span id="sh-cost">20</span> crédits) ou passe en <strong>Premium</strong>.
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;">
            <button id="sh-unlock" style="background:#00e5ff;color:#001;border:0;border-radius:12px;padding:10px 12px;font-weight:1000;cursor:pointer;">Débloquer (1 action)</button>
            <button id="sh-premium" style="background:#ff0099;color:#001;border:0;border-radius:12px;padding:10px 12px;font-weight:1000;cursor:pointer;">Passer Premium</button>
            <button id="sh-close" style="background:rgba(255,255,255,.10);color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:10px 12px;font-weight:900;cursor:pointer;">Fermer</button>
          </div>
          <div style="margin-top:10px;font-size:12px;opacity:.75">
            Astuce: tu as <strong>${state.billing.free_start_credits || 1200}</strong> crédits offerts au départ.
          </div>
        </div>
      `;
      ov.appendChild(pw);

      pw.querySelector('#sh-premium').addEventListener('click', ()=>{ window.location.href='/pricing'; });
      pw.querySelector('#sh-close').addEventListener('click', ()=>{ try{ window.closeMarketOverlay?.(); }catch(_){ ov.classList.add('hidden'); }});
      pw.querySelector('#sh-unlock').addEventListener('click', async ()=>{
        const ok = await spendOneAction();
        if(ok){
          hideMarketPaywall();
          toast('Marché débloqué ✅');
        }
      });
    }
    return pw;
  }

  function showMarketPaywall(){
    const ov = document.getElementById('market-overlay');
    if(!ov) return;
    const pw = ensureMarketPaywall();
    if(!pw) return;

    // Blur the underlying card content (the centered modal container)
    const card = ov.querySelector('.absolute.left-1\\/2') || ov.querySelector('div[style*="translate"]') || ov.querySelector('div');
    // More robust: blur the main modal panel (the second absolute child)
    const panel = ov.querySelector('.absolute.left-1\\/2.top-1\\/2') || ov.querySelector('.shadow-\\[0_0_80px_rgba\\(0,229,255,0\\.08\\)\\]');
    const target = panel || card;
    if(target){
      target.style.filter = 'blur(10px)';
      target.style.pointerEvents = 'none';
      target.setAttribute('data-sh-blurred','1');
    }
    pw.querySelector('#sh-cost').textContent = String(state.billing.action_cost || 20);
    pw.style.display = 'flex';
  }

  function hideMarketPaywall(){
    const ov = document.getElementById('market-overlay');
    if(!ov) return;
    const pw = ov.querySelector('#sh-market-paywall');
    if(pw) pw.style.display = 'none';

    const target = ov.querySelector('[data-sh-blurred="1"]');
    if(target){
      target.style.filter = '';
      target.style.pointerEvents = '';
      target.removeAttribute('data-sh-blurred');
    }
  }

  async function guardedOpenMarket(){
    await refreshAuth();
    if(!state.twitch.connected){
      toast('Connexion Twitch requise pour accéder au Marché.');
      openTwitchLogin();
      return;
    }
    await refreshBilling();
    renderUserWidget();

    const plan = String(state.billing.plan || 'free');
    const isPremium = (plan === 'premium' || plan === 'pro');

    // Open overlay
    try{
      if(typeof window.__openMarketOverlayOriginal === 'function'){
        window.__openMarketOverlayOriginal();
      }else if(typeof window.openMarketOverlay === 'function'){
        window.openMarketOverlay();
      }
    }catch(e){ console.warn(e); }

    // Apply gating
    if(isPremium || isUnlocked()){
      hideMarketPaywall();
      return;
    }
    showMarketPaywall();
  }

  function hookMarket(){
    if(typeof window.openMarketOverlay === 'function' && !window.__openMarketOverlayOriginal){
      window.__openMarketOverlayOriginal = window.openMarketOverlay;
      window.openMarketOverlay = guardedOpenMarket;
    }
  }

  async function boot(){
    await refreshAuth();
    await refreshBilling();
    renderUserWidget();
    hookMarket();

    // Re-hook after hot reload or if functions appear later
    setInterval(hookMarket, 1500);

    // Refresh widget occasionally
    setInterval(async ()=>{
      await refreshAuth();
      await refreshBilling();
      renderUserWidget();
    }, 15000);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  }else{
    boot();
  }
})();