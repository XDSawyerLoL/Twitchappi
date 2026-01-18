(async function(){
  const $ = (id)=>document.getElementById(id);
  const pillLogin = $('pillLogin');
  const pillPlan = $('pillPlan');
  const pillActions = $('pillActions');
  const pillCredits = $('pillCredits');
  const packsBox = $('packs');

  const fmt = (n)=> (n===null||n===undefined)?'—': String(n);

  async function getJSON(url, opt){
    const res = await fetch(url, { credentials:'include', ...(opt||{}) });
    if(!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function load(){
    let status;
    try{
      status = await getJSON('/api/billing/status');
    }catch(e){
      pillLogin.textContent = 'Twitch : non connecté';
      pillPlan.textContent = 'Plan : —';
      pillActions.textContent = 'Actions : —';
      pillCredits.textContent = 'Crédits : —';
      return;
    }
    pillLogin.textContent = status.twitch_connected ? `Twitch : ${status.display_name||status.login||'connecté'}` : 'Twitch : non connecté';
    pillPlan.textContent = `Plan : ${status.plan?.toUpperCase?.() || status.plan || 'FREE'}`;
    pillCredits.textContent = `Crédits : ${fmt(status.credits)}`;
    pillActions.textContent = `Actions : ${status.plan==='premium' ? '∞' : fmt(status.actions)}`;

    try{
      const packs = await getJSON('/api/billing/packs');
      packsBox.innerHTML = '';
      packs.forEach(p=>{
        const el = document.createElement('div');
        el.className = 'pack';
        el.innerHTML = `
          <div>
            <strong>${p.name}</strong>
            <small>${p.credits} crédits • ${p.priceLabel}</small>
          </div>
          <button class="btn" data-pack="${p.id}">Acheter</button>
        `;
        el.querySelector('button').addEventListener('click', async ()=>{
          // demo mode: credit pack without real payment (server can be wired to Stripe later)
          try{
            const r = await getJSON('/api/billing/buy-pack', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ packId: p.id }) });
            pillCredits.textContent = `Crédits : ${fmt(r.credits)}`;
            pillActions.textContent = `Actions : ${r.plan==='premium' ? '∞' : fmt(r.actions)}`;
          }catch(err){
            alert('Connexion Twitch requise ou serveur non configuré.');
          }
        });
        packsBox.appendChild(el);
      })
    }catch(_){ /* ok */ }
  }

  $('btnGoApp')?.addEventListener('click', ()=>{ window.location.href = '/'; });
  $('btnScrollPacks')?.addEventListener('click', ()=>{ packsBox?.scrollIntoView({ behavior:'smooth', block:'start' }); });
  $('btnPremium')?.addEventListener('click', async ()=>{
    try{
      await getJSON('/api/billing/subscribe-premium', { method:'POST' });
      await load();
      alert('Premium activé (mode dev).');
    }catch(e){
      alert('Connexion Twitch requise.');
    }
  });

  // sticky CTA
  const sticky = document.createElement('div');
  sticky.className = 'sticky';
  sticky.innerHTML = `
    <div class="stickyInner">
      <a class="btn" href="/">Retour</a>
      <button class="btn premiumBtn" id="stickyPremium">Premium</button>
    </div>
  `;
  document.body.appendChild(sticky);
  sticky.querySelector('#stickyPremium')?.addEventListener('click', ()=> $('btnPremium')?.click());

  load();
})();
