(async function(){
  const $ = (s)=>document.querySelector(s);
  const packsEl = $('#packs');
  const statusLine = $('#statusLine');
  const connectBtn = $('#connectBtn');
  const premiumBtn = $('#premiumBtn');

  function fmt(n){ return (n||0).toString(); }

  async function fetchJson(url, opts){
    const r = await fetch(url, Object.assign({ credentials:'include' }, opts||{}));
    const j = await r.json().catch(()=>null);
    return { ok:r.ok, status:r.status, json:j };
  }

  async function twitchStatus(){
    const r = await fetchJson('/twitch_user_status');
    return !!(r.ok && r.json && r.json.connected);
  }

  async function billingStatus(){
    const r = await fetchJson('/api/billing/status');
    return r;
  }

  function packCard(p){
    const best = p.best ? 'ring-2 ring-white/30' : '';
    const div = document.createElement('div');
    div.className = `glass rounded-2xl p-4 flex items-center justify-between gap-3 ${best}`;
    div.innerHTML = `
      <div>
        <div class="font-semibold">${p.name} ${p.best ? '<span class="text-xs muted">(Populaire)</span>' : ''}</div>
        <div class="text-sm muted">${p.credits} crédits • ${p.actions} actions</div>
      </div>
      <div class="text-right">
        <div class="font-extrabold">${p.price_label}</div>
        <button data-pack="${p.id}" class="buyPack mt-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-sm font-semibold">
          Acheter
        </button>
      </div>
    `;
    return div;
  }

  async function render(){
    const connected = await twitchStatus();
    connectBtn.style.display = connected ? 'none' : 'inline-flex';
    if(!connected){
      statusLine.textContent = "Non connecté — connecte Twitch pour acheter / utiliser le Marché.";
      return;
    }

    const b = await billingStatus();
    if(b.ok && b.json && b.json.success){
      const plan = String(b.json.plan||'free').toUpperCase();
      if(plan === 'PREMIUM'){
        statusLine.textContent = `Plan: PREMIUM • Actions: ∞`;
      }else{
        statusLine.textContent = `Plan: ${plan} • Crédits: ${fmt(b.json.credits)} • Actions: ${fmt(b.json.actions)}`;
      }
    }else{
      statusLine.textContent = "Impossible de charger ton statut de crédits.";
    }
  }

  // Packs
  const packsRes = await fetchJson('/api/billing/packs');
  if(packsRes.ok && packsRes.json && packsRes.json.success){
    packsEl.innerHTML = '';
    packsRes.json.packs.forEach(p=>packsEl.appendChild(packCard(p)));

    packsEl.addEventListener('click', async (e)=>{
      const btn = e.target.closest('.buyPack');
      if(!btn) return;
      const packId = btn.getAttribute('data-pack');

      // Prefer Stripe if configured, fallback to demo endpoint.
      btn.disabled = true;
      btn.textContent = "…";
      try{
        const stripeTry = await fetchJson('/api/billing/stripe/create-checkout-session', {
          method:'POST',
          headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({ mode:'payment', packId })
        });
        if(stripeTry.ok && stripeTry.json?.url){
          window.location.href = stripeTry.json.url;
          return;
        }
        // fallback
        const demo = await fetchJson('/api/billing/buy-pack', {
          method:'POST',
          headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({ packId })
        });
        if(!demo.ok) throw new Error(demo.json?.error || 'buy_failed');
        await render();
        alert('Crédits ajoutés ✅');
      }catch(err){
        alert("Impossible d’acheter pour l’instant. Vérifie la connexion Twitch et la config Stripe côté serveur.");
      }finally{
        btn.disabled = false;
        btn.textContent = "Acheter";
      }
    });
  }else{
    packsEl.innerHTML = '<div class="muted text-sm">Packs indisponibles.</div>';
  }

  connectBtn.addEventListener('click', ()=>{
    window.open('/auth/twitch', '_blank', 'noopener');
  });

  premiumBtn.addEventListener('click', async ()=>{
    const connected = await twitchStatus();
    if(!connected){
      alert('Connecte Twitch avant de passer Premium.');
      return;
    }

    premiumBtn.disabled = true;
    premiumBtn.textContent = '…';
    try{
      const stripeTry = await fetchJson('/api/billing/stripe/create-checkout-session', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ mode:'subscription' })
      });
      if(stripeTry.ok && stripeTry.json?.url){
        window.location.href = stripeTry.json.url;
        return;
      }

      // fallback dev activation
      const demo = await fetchJson('/api/billing/subscribe-premium', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({})
      });
      if(!demo.ok) throw new Error(demo.json?.error || 'subscribe_failed');
      await render();
      alert('Premium activé ✅');
    }catch(_){
      alert("Impossible d’activer Premium pour l’instant. Vérifie Stripe côté serveur.");
    }finally{
      premiumBtn.disabled = false;
      premiumBtn.textContent = 'Passer Premium';
    }
  });

  await render();
})();
