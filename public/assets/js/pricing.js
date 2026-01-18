(() => {
  const API = window.location.origin;

  const $ = (id) => document.getElementById(id);

  function apiFetch(path, opts){
    return fetch(API + path, Object.assign({ credentials: 'include' }, opts||{}));
  }
  async function apiJson(path, opts){
    const r = await apiFetch(path, opts);
    return r.json();
  }

  function toast(msg){
    const t = $('toast');
    if(!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(()=>t.classList.remove('show'), 2400);
  }

  function renderPacks(){
    const packs = [
      { sku:'credits_500',  credits:500,  price:'9,99€',  hint:'25 actions' },
      { sku:'credits_1250', credits:1250, price:'19,99€', hint:'62 actions' }
    ];
    const host = $('packs');
    if(!host) return;
    host.innerHTML = packs.map(p => (
      `<button class="pack" data-sku="${p.sku}">
        <div class="packTop">
          <div class="packCredits">${p.credits} crédits</div>
          <div class="packPrice">${p.price}</div>
        </div>
        <div class="packHint">${p.hint}</div>
      </button>`
    )).join('');

    host.querySelectorAll('[data-sku]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await startCheckout(btn.getAttribute('data-sku'));
      });
    });
  }

  async function startCheckout(sku){
    try{
      const u = await apiJson('/twitch_user_status').catch(()=>({is_connected:false}));
      if(!u.is_connected){
        toast('Connexion Twitch requise');
        openLogin();
        return;
      }

      const r = await apiFetch('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku })
      });
      const d = await r.json().catch(()=>null);
      if(!d || !d.success){
        alert((d && d.error) ? d.error : 'Erreur paiement');
        return;
      }
      if(d.url) window.location.href = d.url;
    }catch(e){
      alert(e.message || 'Erreur paiement');
    }
  }

  function openLogin(){
    window.open(API + '/twitch_auth_start', 'login', 'width=520,height=720');
  }

  async function refresh(){
    const pillLogin = $('pillLogin');
    const pillPlan = $('pillPlan');
    const pillActions = $('pillActions');
    const pillCredits = $('pillCredits');

    const u = await apiJson('/twitch_user_status').catch(()=>({is_connected:false}));
    if(!u.is_connected){
      if(pillLogin) pillLogin.textContent = 'Twitch : non connecté';
      if(pillPlan) pillPlan.textContent = 'Plan : FREE';
      if(pillActions) pillActions.textContent = 'Actions : —';
      if(pillCredits) pillCredits.textContent = 'Crédits : —';
      return;
    }

    if(pillLogin) pillLogin.textContent = 'Twitch : ' + (u.display_name || u.login || 'connecté');

    const me = await apiJson('/api/billing/me').catch(()=>null);
    if(!me || !me.success){
      if(pillPlan) pillPlan.textContent = 'Plan : —';
      if(pillActions) pillActions.textContent = 'Actions : —';
      if(pillCredits) pillCredits.textContent = 'Crédits : —';
      return;
    }

    const plan = (me.plan || 'free').toUpperCase();
    const credits = Number(me.credits || 0);
    const actions = Math.floor(credits / 20);

    if(pillPlan) pillPlan.textContent = 'Plan : ' + plan;
    if(pillCredits) pillCredits.textContent = 'Crédits : ' + credits;
    if(pillActions) pillActions.textContent = 'Actions : ' + actions;
  }

  function wire(){
    const go = $('btnGoApp');
    if(go) go.addEventListener('click', ()=> window.location.href = '/');

    const scroll = $('btnScrollPacks');
    if(scroll) scroll.addEventListener('click', ()=> {
      document.getElementById('packs')?.scrollIntoView({ behavior:'smooth', block:'center' });
    });

    const prem = $('btnPremium');
    if(prem) prem.addEventListener('click', ()=> startCheckout('premium_monthly'));
  }

  renderPacks();
  wire();
  refresh();
  setInterval(refresh, 4000);
})();
