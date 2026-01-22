/**
 * Billing + Twitch guard (no visual changes when connected).
 * - Forces a Twitch login wall for the whole app
 * - Shows credits/plan in the existing #billing-link UI
 */
(function(){
  const API_BASE = window.location.origin;
  const $ = (id) => document.getElementById(id);

  async function getJson(url, opts){
    const r = await fetch(url, Object.assign({ credentials:'include' }, opts||{}));
    return r.json().catch(()=>({}));
  }

  function openTwitchLogin(){
    window.open(`${API_BASE}/twitch_auth_start`, 'login', 'width=520,height=720');
  }

  function ensureLoginWall(){
    if (document.getElementById('twitch-login-wall')) return;

    const wall = document.createElement('div');
    wall.id = 'twitch-login-wall';
    wall.style.cssText = [
      'position:fixed','inset:0','z-index:99999',
      'background:rgba(0,0,0,.82)','backdrop-filter:blur(6px)',
      'display:flex','align-items:center','justify-content:center',
      'padding:24px'
    ].join(';');

    wall.innerHTML = `
      <div style="max-width:720px;width:100%;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(8,8,10,.85);padding:22px;">
        <div style="font-weight:900;font-size:22px;letter-spacing:-.02em;">Connexion Twitch obligatoire</div>
        <div style="opacity:.8;margin-top:8px;line-height:1.35;">
          Pour utiliser StreamerHub (multi-utilisateur + portefeuille + crédits), tu dois connecter ton compte Twitch.
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;">
          <button id="wall-btn-login" style="padding:10px 14px;border-radius:12px;border:1px solid rgba(0,242,234,.55);background:rgba(0,242,234,.18);color:#fff;font-weight:900;cursor:pointer;">
            Se connecter avec Twitch
          </button>
          <a href="/pricing" style="padding:10px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;font-weight:800;text-decoration:none;">
            Voir les offres (Pricing)
          </a>
        </div>

        <div style="margin-top:10px;font-size:12px;opacity:.7;">
          Une fois connecté, cette fenêtre disparaît automatiquement.
        </div>
      </div>
    `;

    document.body.appendChild(wall);
    wall.querySelector('#wall-btn-login')?.addEventListener('click', () => {
      openTwitchLogin();
    });
  }

  async function waitForLoginThenReload(){
    const check = setInterval(async ()=>{
      const st = await getJson(`${API_BASE}/twitch_user_status`);
      if(st?.is_connected){
        clearInterval(check);
        location.reload();
      }
    }, 900);
  }

  async function refreshBillingBadge(){
    const link = $('billing-link');
    const creditsEl = $('billing-credits');
    const planEl = $('billing-plan');
    if(!link || !creditsEl || !planEl) return;

    const b = await getJson('/api/billing/status');
    if(!b?.success) return;

    link.classList.remove('hidden');
    creditsEl.textContent = String(Number(b.credits||0));
    const plan = String(b.plan||'free').toUpperCase();
    planEl.textContent = plan;
  }

  async function init(){
    const st = await getJson(`${API_BASE}/twitch_user_status`);
    if(!st?.is_connected){
      ensureLoginWall();
      waitForLoginThenReload();
      return;
    }

    // logged: remove wall if any
    document.getElementById('twitch-login-wall')?.remove();

    // show billing link + credits
    await refreshBillingBadge();

    // expose helper
    window.StreamerHubBilling = { refresh: refreshBillingBadge };
  }

  document.addEventListener('DOMContentLoaded', init);
})();
