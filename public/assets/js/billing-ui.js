(function(){
  const ACTION_COST = 20;

  function css(el, obj){ for (const k in obj) el.style[k]=obj[k]; }
  function toast(msg){
    let t=document.getElementById('sh_toast');
    if(!t){
      t=document.createElement('div'); t.id='sh_toast';
      css(t,{position:'fixed',left:'50%',bottom:'18px',transform:'translateX(-50%)',
        background:'rgba(16,24,34,.92)',border:'1px solid rgba(124,199,255,.25)',
        borderRadius:'999px',padding:'10px 14px',color:'#e8eef6',fontSize:'13.5px',
        boxShadow:'0 8px 30px rgba(0,0,0,.35)',zIndex:999999,display:'none',maxWidth:'calc(100vw - 24px)'});
      document.body.appendChild(t);
    }
    t.textContent=msg; t.style.display='block';
    clearTimeout(t.__t); t.__t=setTimeout(()=>t.style.display='none', 3200);
  }

  async function api(path, opts){
    const res = await fetch(path, Object.assign({credentials:'include', headers:{'Content-Type':'application/json'}}, opts||{}));
    const ct = res.headers.get('content-type')||'';
    const data = ct.includes('application/json') ? await res.json() : await res.text();
    if(!res.ok) throw new Error((data && data.error) ? data.error : (typeof data==='string'?data:'Erreur serveur'));
    return data;
  }

  function actionsFromCredits(c){ return Math.floor((Number(c)||0)/ACTION_COST); }

  function ensureWidget(){
    let w=document.getElementById('sh_user_widget');
    if(w) return w;
    w=document.createElement('div');
    w.id='sh_user_widget';
    css(w,{
      position:'fixed',
      right:'14px',
      top:'14px',
      zIndex:999998,
      display:'none', /* hidden until logged */
      padding:'10px 12px',
      borderRadius:'14px',
      background:'rgba(16,24,34,.85)',
      border:'1px solid rgba(30,42,58,1)',
      color:'#e8eef6',
      fontFamily:'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize:'13px',
      boxShadow:'0 8px 30px rgba(0,0,0,.35)',
      backdropFilter:'blur(6px)'
    });

    w.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;justify-content:space-between;">
        <div>
          <div id="sh_plan" style="font-weight:800;letter-spacing:-0.01em;">…</div>
          <div id="sh_credits" style="opacity:.85;margin-top:2px;">…</div>
        </div>
        <button id="sh_pricing_btn" style="
          border-radius:12px;border:1px solid rgba(124,199,255,.35);
          background:rgba(124,199,255,.10);color:#e8eef6;
          padding:8px 10px;cursor:pointer;font-weight:800;white-space:nowrap;
        ">Crédits / PRO</button>
      </div>
    `;
    document.body.appendChild(w);

    w.querySelector('#sh_pricing_btn').addEventListener('click', ()=> location.href='/pricing');
    return w;
  }

  async function refreshWidget(){
    const me = await api('/api/auth/me');
    if(!me.loggedIn){
      // Hide widget when not logged in (fix user complaint)
      const w=document.getElementById('sh_user_widget');
      if(w) w.style.display='none';
      return { loggedIn:false };
    }

    const st = await api('/api/billing/status');
    const w=ensureWidget();
    w.style.display='block';

    const planEl=w.querySelector('#sh_plan');
    const creditsEl=w.querySelector('#sh_credits');

    const plan = (st.plan || 'free').toLowerCase();
    const credits = Number(st.credits||0);
    const actions = plan==='premium' ? '∞' : (st.actions ?? actionsFromCredits(credits));

    planEl.textContent = plan==='premium' ? 'PREMIUM' : 'FREE';
    creditsEl.textContent = plan==='premium'
      ? `Actions: ∞`
      : `Crédits: ${credits} • Actions: ${actions}`;

    return { loggedIn:true, ...st };
  }

  // Paywall overlay (used for Market gating)
  function showPaywallOverlay(opts){
    const { onUnlock, onGoPricing, credits, plan } = opts || {};
    let ov=document.getElementById('sh_paywall');
    if(!ov){
      ov=document.createElement('div');
      ov.id='sh_paywall';
      css(ov,{
        position:'fixed', inset:'0', zIndex:999997,
        background:'rgba(0,0,0,.55)', display:'flex', alignItems:'center', justifyContent:'center',
        padding:'18px'
      });
      ov.innerHTML = `
        <div id="sh_pw_card" style="
          width:min(520px, 100%);
          background:rgba(16,24,34,.95);
          border:1px solid rgba(30,42,58,1);
          border-radius:18px;
          padding:18px;
          box-shadow:0 8px 30px rgba(0,0,0,.35);
          color:#e8eef6;
          font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;
        ">
          <div style="font-weight:900;font-size:18px;letter-spacing:-0.02em;">Marché du streamer</div>
          <div style="opacity:.85;margin-top:6px;line-height:1.45;">
            En mode <strong>Free</strong>, le marché est flouté. Tu peux le débloquer avec <strong>1 action</strong> (20 crédits)
            ou passer <strong>Premium</strong>.
          </div>
          <div id="sh_pw_meta" style="opacity:.8;margin-top:10px;font-size:13px;"></div>
          <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;">
            <button id="sh_pw_unlock" style="
              flex:1 1 160px;
              border-radius:14px;border:1px solid rgba(255,211,107,.35);
              background:rgba(255,211,107,.12);color:#e8eef6;
              padding:12px;cursor:pointer;font-weight:900;
            ">Débloquer (1 action)</button>
            <button id="sh_pw_pricing" style="
              flex:1 1 160px;
              border-radius:14px;border:1px solid rgba(124,199,255,.35);
              background:rgba(124,199,255,.10);color:#e8eef6;
              padding:12px;cursor:pointer;font-weight:900;
            ">Voir offres</button>
            <button id="sh_pw_close" style="
              flex:0 0 auto;
              border-radius:14px;border:1px solid rgba(30,42,58,1);
              background:rgba(0,0,0,.2);color:#e8eef6;
              padding:12px 14px;cursor:pointer;font-weight:900;
            ">Fermer</button>
          </div>
        </div>
      `;
      document.body.appendChild(ov);
      ov.addEventListener('click', (e)=>{ if(e.target===ov) ov.remove(); });
    }
    const meta=ov.querySelector('#sh_pw_meta');
    meta.textContent = plan==='premium' ? 'Tu es Premium.' : `Crédits disponibles: ${credits ?? 0}`;

    ov.querySelector('#sh_pw_close').onclick = ()=> ov.remove();
    ov.querySelector('#sh_pw_pricing').onclick = ()=> { ov.remove(); onGoPricing && onGoPricing(); };
    ov.querySelector('#sh_pw_unlock').onclick = async ()=> {
      try{ await onUnlock?.(); ov.remove(); }
      catch(e){ toast(e.message || 'Impossible de débloquer'); }
    };
  }

  async function requireMarketAccess(continueFn){
    const me = await api('/api/auth/me');
    if(!me.loggedIn){
      toast('Connexion Twitch requise');
      location.href = '/auth/twitch';
      return;
    }
    const st = await api('/api/billing/status');
    if((st.plan||'free') === 'premium'){
      continueFn && continueFn();
      return;
    }
    const credits = Number(st.credits||0);
    if(credits < ACTION_COST){
      showPaywallOverlay({
        credits, plan:'free',
        onUnlock: async ()=> { throw new Error("Crédits insuffisants"); },
        onGoPricing: ()=> location.href='/pricing'
      });
      return;
    }

    showPaywallOverlay({
      credits, plan:'free',
      onUnlock: async ()=>{
        await api('/api/billing/spend', {method:'POST', body: JSON.stringify({ feature:'market', cost: ACTION_COST, ttlHours: 24 })});
        toast('Marché débloqué ✅');
        continueFn && continueFn();
        refreshWidget().catch(()=>{});
      },
      onGoPricing: ()=> location.href='/pricing'
    });
  }

  function hookMarketButtons(){
    const candidates = [];
    // heuristic: elements containing text "Marché"
    document.querySelectorAll('button, a, [role="tab"]').forEach(el=>{
      const t=(el.textContent||'').trim().toLowerCase();
      if(t && t.includes('marché')) candidates.push(el);
    });
    // also known ids/classes
    ['#tab-market','#marketTab','#btnMarket','[data-tab="market"]'].forEach(sel=>{
      document.querySelectorAll(sel).forEach(el=> candidates.push(el));
    });

    const uniq=[...new Set(candidates)];
    uniq.forEach(el=>{
      if(el.__sh_hooked) return;
      el.__sh_hooked=true;
      el.addEventListener('click', (e)=>{
        // only intercept if currently locked (we always check)
        e.preventDefault();
        e.stopPropagation();
        requireMarketAccess(()=> {
          // try to re-dispatch click after unlock by calling native click without our handler
          // simplest: temporarily disable and click
          const saved = el.__sh_hooked;
          el.__sh_hooked=false;
          setTimeout(()=>{ el.click(); el.__sh_hooked=true; }, 0);
        });
      }, true);
    });
  }

  async function init(){
    try{ await refreshWidget(); }catch(_){}
    // hook market buttons after load
    hookMarketButtons();
    // re-hook on DOM changes
    const mo = new MutationObserver(()=> hookMarketButtons());
    mo.observe(document.documentElement, {subtree:true, childList:true});
    setInterval(()=> refreshWidget().catch(()=>{}), 15000);
    // expose API
    window.StreamerHubBilling = { refresh: refreshWidget, requireMarketAccess };
  }

  document.addEventListener('DOMContentLoaded', init);
})();