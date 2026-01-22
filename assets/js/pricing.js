/**
 * pricing.js — works with pricing.html (data-sku buttons).
 * Uses:
 *  - GET  /twitch_user_status
 *  - GET  /api/billing/status
 *  - POST /api/billing/create-checkout-session { sku }
 */
(function(){
  const API = window.location.origin;

  async function getJson(url, opts){
    const r = await fetch(url, Object.assign({ credentials:'include' }, opts||{}));
    return r.json().catch(()=>({}));
  }

  function setText(id, v){
    const el = document.getElementById(id);
    if(el) el.textContent = v;
  }

  async function startAuth(){
    window.open(`${API}/twitch_auth_start`, 'login', 'width=520,height=720');
    const check = setInterval(async () => {
      const data = await getJson(`${API}/twitch_user_status`);
      if (data?.is_connected) { clearInterval(check); location.reload(); }
    }, 900);
  }

  async function refresh(){
    const status = document.getElementById('authStatus');
    const meLine = document.getElementById('meLine');
    const btnLogin = document.getElementById('btnLogin');
    const badge = document.getElementById('creditsBadge');

    const st = await getJson(`${API}/twitch_user_status`);
    const connected = !!st?.is_connected;

    if(btnLogin){
      btnLogin.style.display = connected ? 'none' : 'inline-flex';
      btnLogin.onclick = startAuth;
    }

    if(status){
      status.textContent = connected ? 'Connecté ✅' : 'Non connecté ❌';
      status.className = connected
        ? 'inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/20 border border-green-500/30 text-green-200 text-sm font-bold'
        : 'inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/30 text-red-200 text-sm font-bold';
    }

    if(meLine){
      meLine.textContent = connected ? (st?.user?.display_name ? `Compte: ${st.user.display_name}` : 'Compte connecté') : 'Connecte-toi pour voir ton solde.';
    }

    if(connected){
      const b = await getJson('/api/billing/status');
      if(badge) badge.textContent = b?.success ? String(Number(b.credits||0)) : '—';
    }else{
      if(badge) badge.textContent = '—';
    }
  }

  async function buySku(sku){
    const st = await getJson(`${API}/twitch_user_status`);
    if(!st?.is_connected) return startAuth();

    const r = await getJson('/api/billing/create-checkout-session', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ sku })
    });

    if(r?.success && r?.url){
      window.location.href = r.url;
      return;
    }
    alert(r?.error || 'Erreur paiement.');
  }

  function bindButtons(){
    document.querySelectorAll('button[data-sku]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const sku = btn.getAttribute('data-sku');
        if(!sku) return;
        buySku(sku);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    bindButtons();
    refresh();
  });
})();
