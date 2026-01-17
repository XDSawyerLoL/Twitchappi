(() => {
  const API = window.location.origin;
  const COST = 20;

  async function j(url, opts){
    const r = await fetch(url, Object.assign({ credentials:'include' }, opts||{}));
    const d = await r.json().catch(()=>null);
    if(!r.ok) throw new Error((d && d.error) || 'Erreur');
    return d;
  }

  function upsertHud(me){
    const userArea = document.getElementById('user-area');
    const btnAuth = document.getElementById('btn-auth');
    if(!userArea) return;

    // show only if connected
    if(!me || !me.is_connected){
      const hud = document.getElementById('billing-hud');
      if(hud) hud.remove();
      return;
    }

    // Find insert point: after user-name
    const nameEl = document.getElementById('user-name');
    const existing = document.getElementById('billing-hud');
    const el = existing || document.createElement('a');
    el.id = 'billing-hud';
    el.href = API + '/pricing';
    el.target = '_self';
    el.style.cssText = 'display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border-radius:999px;border:1px solid rgba(0,242,234,.30);background:rgba(0,242,234,.08);font-size:11px;font-weight:900;font-family:Orbitron,Inter,system-ui;letter-spacing:.03em;color:#00f2ea;white-space:nowrap;';

    const plan = (me.plan || 'free').toUpperCase();
    const credits = Number(me.credits||0);
    const actions = (me.plan === 'premium' || me.plan === 'pro') ? '∞' : String(Math.floor(credits / COST));
    el.textContent = `${plan} • ${actions} actions • ${credits} cr`;

    if(!existing){
      if(nameEl && nameEl.parentElement === userArea){
        nameEl.insertAdjacentElement('afterend', el);
      } else {
        userArea.appendChild(el);
      }
    }

    // Hide login button when connected (your existing code already does; keep safe)
    if(btnAuth) {}
  }

  async function tick(){
    // 1) Twitch auth status (existing endpoint)
    const u = await j(API + '/twitch_user_status').catch(()=>({is_connected:false}));
    if(!u.is_connected){
      upsertHud({ is_connected:false });
      return;
    }
    // 2) Billing status (Firestore)
    const b = await j(API + '/api/billing/status').catch(()=>({ plan:'free', credits:0 }));
    upsertHud({ is_connected:true, plan:b.plan, credits:b.credits });
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Try once quickly, then every 5s
    tick();
    setInterval(tick, 5000);
  });
})();
