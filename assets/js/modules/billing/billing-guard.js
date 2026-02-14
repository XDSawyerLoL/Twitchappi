/* billing-guard.js — Paywall (credits/premium) with no-dup + works even not connected */
(function () {
  let COST = 200;

  // Feature -> UI selector(s) + teaser
  const FEATURES = [
    { key: "overview", selector: "#under-overview", title: "OVERVIEW", teaser: "Vue synthèse actionnable : KPIs, signaux, état du live et priorités." },
    { key: "analytics", selector: "#under-analytics", title: "ANALYTICS PRO", teaser: "Analyse avancée : courbes, segments, performance, signaux et comparaisons." },
    { key: "niche", selector: "#under-niche", title: "NICHE", teaser: "Opportunités de niche : angles gagnants, concurrence, timing et idées de contenu." },
    { key: "bestTime", selector: ".best-time-tool", title: "BEST TIME TO STREAM", teaser: "Créneaux optimisés : meilleur ratio visibilité / concurrence + recommandations." },
  ];

  function $(sel, root=document){ return root.querySelector(sel); }

  function isElement(el){ return !!(el && el.nodeType === 1); }

  function ensureStyles(){
    if (document.getElementById('evey-billing-guard-css')) return;
    const css = document.createElement('style');
    css.id = 'evey-billing-guard-css';
    css.textContent = `
      .evey-locked-wrap{ position:relative; }
      .evey-locked-wrap.evey-blurred > *{ filter:none !important; opacity:.18; pointer-events:none; user-select:none; }
      .evey-lock-overlay{
        position:absolute; inset:0; z-index:999;
        display:flex; align-items:center; justify-content:center;
        padding:16px;
        background: radial-gradient(ellipse at center, rgba(0,0,0,.35), rgba(0,0,0,.78));
        border:1px solid rgba(255,255,255,.10);
        border-radius: 14px;
      }
      .evey-lock-card{
        width:min(520px, 92%);
        background: rgba(10,10,10,.78);
        border:1px solid rgba(255,255,255,.12);
        border-radius: 16px;
        padding: 16px 16px 14px 16px;
        box-shadow: 0 18px 40px rgba(0,0,0,.55);
        text-align:left;
      }
      .evey-lock-top{ display:flex; gap:12px; align-items:flex-start; }
      .evey-lock-icon{
        width:40px; height:40px; border-radius:12px;
        display:flex; align-items:center; justify-content:center;
        background: rgba(0,242,234,.10);
        border: 1px solid rgba(0,242,234,.35);
        color:#00f2ea;
        flex: 0 0 auto;
      }
      .evey-lock-title{ font-family: Orbitron, system-ui, sans-serif; font-weight:900; letter-spacing:.10em; font-size:12px; text-transform:uppercase; color:#eaeaf0; }
      .evey-lock-teaser{ margin-top:6px; color: rgba(255,255,255,.78); font-size: 12px; line-height:1.35; }
      .evey-lock-actions{ display:flex; flex-wrap:wrap; gap:10px; margin-top: 12px; }
      .evey-btn{
        border:1px solid rgba(255,255,255,.14);
        background: rgba(255,255,255,.06);
        color:#fff;
        border-radius: 12px;
        padding:10px 12px;
        font-weight:900;
        font-size:12px;
        cursor:pointer;
      }
      .evey-btn:hover{ border-color:#00f2ea; box-shadow:0 0 16px rgba(0,242,234,.16); transform: translateY(-1px); }
      .evey-btn.primary{ background:#00f2ea; color:#000; border-color:#00f2ea; }
      .evey-btn.danger{ background: rgba(229,9,20,.14); border-color: rgba(229,9,20,.35); }
      .evey-lock-meta{ margin-top: 10px; font-size: 11px; color: rgba(255,255,255,.62); display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; }
      .evey-toast{
        position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%);
        background: rgba(0,0,0,.82); border:1px solid rgba(255,255,255,.12);
        color:#fff; padding: 10px 12px; border-radius: 12px; z-index: 100000;
        font-size: 12px; box-shadow: 0 16px 40px rgba(0,0,0,.55);
        max-width: min(620px, 92vw);
      }
    `;
    document.head.appendChild(css);
  }

  function toast(msg){
    const t = document.createElement('div');
    t.className = 'evey-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(()=>{ t.remove(); }, 2800);
  }

  async function fetchJSON(url, opts){
    const r = await fetch(url, opts);
    let j = null;
    try { j = await r.json(); } catch(e){}
    return { ok: r.ok, status: r.status, json: j };
  }

  function openPricing(){
    // keep current origin, same app
    window.location.href = '/pricing';
  }

  function startTwitchLogin(){
    // open popup (same behavior as existing UI)
    const w = 500, h = 700;
    const left = (screen.width - w) / 2;
    const top = (screen.height - h) / 2;
    window.open('/twitch_auth_start', 'twitch_auth', `width=${w},height=${h},left=${left},top=${top}`);
  }

  function wrapTarget(target, featureKey){
    // Reuse existing wrapper to avoid nesting / multiple layers
    const existing = target.closest('.evey-locked-wrap');
    if (existing){
      if (featureKey) existing.dataset.eveyFeature = featureKey;
      return existing;
    }

    const wrap = document.createElement('div');
    wrap.className = 'evey-locked-wrap';
    if (featureKey) wrap.dataset.eveyFeature = featureKey;

    target.parentNode.insertBefore(wrap, target);
    wrap.appendChild(target);
    return wrap;
  }

  function removeLock(wrap){
    if (!wrap) return;
    wrap.classList.remove('evey-blurred');
    const overlay = wrap.querySelector('.evey-lock-overlay');
    if (overlay) overlay.remove();
    wrap.dataset.eveyLocked = '';
  }

  function applyLock(target, cfg, state){
    if (!isElement(target)) return;
    ensureStyles();

    const wrap = wrapTarget(target, cfg.key);

    // Cleanup duplicate overlays if any (caused by UI re-render)
    const dups = wrap.querySelectorAll('.evey-lock-overlay');
    if (dups && dups.length > 1) {
      dups.forEach((ov,i)=>{ if(i>0) ov.remove(); });
    }

    // Anti-duplication
    if (wrap.dataset.eveyLocked === '1' || wrap.querySelector('.evey-lock-overlay')) {
      // update meta text if needed
      const meta = wrap.querySelector('.evey-lock-meta');
      if (meta) meta.innerHTML = `<span>Coût : <strong>${COST} crédits</strong></span><span>Plan : <strong>${state.plan || 'free'}</strong></span>`;
      return;
    }

    wrap.dataset.eveyLocked = '1';
    wrap.classList.add('evey-blurred');

    const overlay = document.createElement('div');
    overlay.className = 'evey-lock-overlay';

    const card = document.createElement('div');
    card.className = 'evey-lock-card';

    const top = document.createElement('div');
    top.className = 'evey-lock-top';

    const icon = document.createElement('div');
    icon.className = 'evey-lock-icon';
    icon.innerHTML = '&#128274;'; // lock

    const txt = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'evey-lock-title';
    title.textContent = cfg.title;

    const teaser = document.createElement('div');
    teaser.className = 'evey-lock-teaser';
    teaser.textContent = cfg.teaser;

    txt.appendChild(title);
    txt.appendChild(teaser);

    top.appendChild(icon);
    top.appendChild(txt);

    const actions = document.createElement('div');
    actions.className = 'evey-lock-actions';

    const btnPricing = document.createElement('button');
    btnPricing.className = 'evey-btn';
    btnPricing.textContent = 'Voir les offres';
    btnPricing.onclick = openPricing;

    actions.appendChild(btnPricing);

    if (!state.is_connected) {
      const btnLogin = document.createElement('button');
      btnLogin.className = 'evey-btn primary';
      btnLogin.textContent = 'Se connecter Twitch';
      btnLogin.onclick = startTwitchLogin;
      actions.appendChild(btnLogin);
    } else if (state.plan === 'premium' || state.plan === 'pro') {
      // should not happen (premium is open), but keep safe
      const b = document.createElement('button');
      b.className = 'evey-btn primary';
      b.textContent = 'Accès Premium actif';
      b.onclick = () => removeLock(wrap);
      actions.appendChild(b);
    } else {
      const btnUnlock = document.createElement('button');
      btnUnlock.className = 'evey-btn primary';
      btnUnlock.textContent = `Débloquer (${COST})`;
      btnUnlock.onclick = async () => {
        btnUnlock.disabled = true;
        btnUnlock.textContent = 'Déblocage...';
        const r = await fetchJSON('/api/billing/unlock-feature', {
          method:'POST',
          headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({ feature: cfg.key, cost: COST })
        });
        btnUnlock.disabled = false;
        btnUnlock.textContent = `Débloquer (${COST})`;

        if (!r.ok) {
          const err = r.json?.error || 'Erreur';
          if (err === 'NOT_ENOUGH_CREDITS') toast("Crédits insuffisants. Passe Premium ou achète des crédits.");
          else if (err === 'NOT_CONNECTED') toast("Connecte-toi Twitch pour débloquer.");
          else toast("Erreur déblocage.");
          return;
        }
        // update state in memory
        state.credits = Number(r.json?.credits || state.credits || 0);
        state.entitlements = r.json?.entitlements || state.entitlements || {};
        toast("Débloqué ✅");
        removeLock(wrap);

        // refresh badges if present
        const elC = document.getElementById('user-credits');
        if (elC) elC.textContent = String(state.credits || 0);
      };

      const btnPremium = document.createElement('button');
      btnPremium.className = 'evey-btn danger';
      btnPremium.textContent = 'Passer Premium';
      btnPremium.onclick = openPricing;

      actions.appendChild(btnUnlock);
      actions.appendChild(btnPremium);
    }

    const meta = document.createElement('div');
    meta.className = 'evey-lock-meta';
    meta.innerHTML = `<span>Coût : <strong>${COST} crédits</strong></span><span>Plan : <strong>${state.plan || 'free'}</strong></span>`;

    card.appendChild(top);
    card.appendChild(actions);
    card.appendChild(meta);

    overlay.appendChild(card);
    wrap.appendChild(overlay);
  }

  function applyOpen(target){
    if (!isElement(target)) return;
    const wrap = target.closest('.evey-locked-wrap');
    if (wrap) removeLock(wrap);
  }

  function computeStateMe(me){
    const costs = me?.data?.costs || me?.costs || {};
    const plan = (me?.data?.plan || me?.plan || 'free');
    COST = Number(costs.premium_unlock || 200);
    return {
      is_connected: !!(me?.data?.is_connected ?? me?.is_connected),
      plan: plan,
      credits: Number((me?.data?.wallet?.credits ?? me?.credits) || 0),
      entitlements: (me?.data?.entitlements || me?.entitlements || {})
    };
  };
  }

  async function run(){
    // Always show locks even if not connected: default state
    let state = { is_connected:false, plan:'free', credits:0, entitlements:{} };

    // Try fetch billing/me (will also tell if connected)
    const me = await fetchJSON('/api/billing/entitlements');
    if (me.ok && me.json) state = computeStateMe(me.json);

    FEATURES.forEach(cfg => {
      const target = $(cfg.selector);
      if (!target) return;

      const isUnlocked = (state.plan === 'premium' || state.plan === 'pro') || (state.entitlements && state.entitlements[cfg.key] === true);
      if (isUnlocked) applyOpen(target);
      else applyLock(target, cfg, state);
    });
  }

  // Re-run after OAuth popup closes (page reload happens), but keep safe:
  document.addEventListener('DOMContentLoaded', run);
})();
