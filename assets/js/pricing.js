(() => {
  const API = window.location.origin;

  async function getJson(url, opts){
    const r = await fetch(url, Object.assign({ credentials:'include' }, opts||{}));
    // If server returned non-JSON (e.g. HTML error page), fail loudly.
    const text = await r.text();
    try{ return JSON.parse(text); } catch(e){
      console.error('[pricing] Non-JSON response from', url, 'status=', r.status, 'body=', text.slice(0,200));
      throw new Error('Réponse serveur non JSON');
    }
  }

  async function refresh(){
    const status = document.getElementById('authStatus');
    const meLine = document.getElementById('meLine');
    const btnLogin = document.getElementById('btnLogin');
    const badge = document.getElementById('creditsBadge');

    if(!status || !meLine || !btnLogin || !badge) return; // DOM not ready / wrong page

    const u = await getJson(API + '/twitch_user_status').catch(()=>({is_connected:false}));
    if(!u.is_connected){
      status.textContent = 'Non connecté';
      meLine.textContent = 'Connecte-toi pour acheter des crédits / activer Premium.';
      btnLogin.classList.remove('hidden');
      btnLogin.onclick = () => window.open(API + '/twitch_auth_start', 'login', 'width=520,height=720');
      badge.textContent = '— crédits';
      return;
    }

    status.textContent = 'Connecté';
    meLine.textContent = u.display_name ? ('Compte: ' + u.display_name) : '';
    btnLogin.classList.add('hidden');

    const me = await getJson(API + '/api/billing/me').catch(()=>null);
    if(me && me.success){
      badge.textContent = String(me.credits||0) + ' crédits';
    }
  }

  async function startCheckout(sku){
    try{
      const r = await fetch(API + '/api/billing/create-checkout-session', {
        method:'POST',
        credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ sku })
      });
      const text = await r.text();
      let d = null;
      try{ d = JSON.parse(text); } catch(_){ d = null; }

      if(!d || !d.success){
        const msg = (d && d.error) ? d.error : `Erreur paiement (HTTP ${r.status})`;
        alert(msg);
        return;
      }
      if(d.url) window.location.href = d.url;
    }catch(e){
      console.error('[pricing] checkout error', e);
      alert('Erreur réseau / script bloqué. Ouvre la console (F12) pour voir le détail.');
    }
  }

  function bindButtons(){
    document.querySelectorAll('button[data-sku]').forEach(b=>{
      b.addEventListener('click', () => startCheckout(b.getAttribute('data-sku')));
    });
  }

  window.addEventListener('DOMContentLoaded', () => {
    bindButtons();
    refresh();
    setInterval(refresh, 2000);
  });
})();
