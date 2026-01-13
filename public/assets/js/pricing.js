(async function(){
  const $ = (id)=>document.getElementById(id);
  const toast = $('toast');
  function showToast(msg){
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(()=>toast.classList.remove('show'), 2200);
  }

  async function getJSON(url, opts){
    const r = await fetch(url, opts||{});
    const j = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(j.error || j.message || ('HTTP '+r.status));
    return j;
  }

  async function refreshStatus(){
    const st = await getJSON('/api/credits/status');
    $('pillPlan').textContent = 'Plan : ' + (st.plan || 'FREE');
    $('pillCredits').textContent = 'Crédits : ' + (Number(st.credits||0)).toString();
    $('pillActions').textContent = 'Actions : ' + (Number(st.actions||0)).toString();
  }

  async function renderPacks(){
    const data = await getJSON('/api/credits/packs');
    const wrap = $('packs');
    wrap.innerHTML = '';
    (data.packs||[]).forEach(p=>{
      const div = document.createElement('div');
      div.className = 'pack';
      div.innerHTML = `
        <div class="left">
          <div class="name">${p.name}</div>
          <div class="meta">${p.actions} actions · ${p.price}</div>
        </div>
        ${p.best ? '<div class="tag">Meilleur deal</div>' : ''}
      `;
      div.onclick = ()=>selectPack(p.id);
      wrap.appendChild(div);
    });
  }

  let selectedPack = 'pack_500';
  function selectPack(id){
    selectedPack = id;
    showToast('Pack sélectionné');
  }

  $('btnFree').onclick = ()=>{ window.location.href = '/'; };
  $('btnBuyCredits').onclick = async ()=>{
    try{
      await getJSON('/api/credits/buy-pack', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ packId: selectedPack })
      });
      showToast('Crédits ajoutés ✅');
      await refreshStatus();
    }catch(e){
      showToast(e.message);
    }
  };

  $('btnPremium').onclick = async ()=>{
    try{
      await getJSON('/api/billing/subscribe_pro', { method:'POST' });
      showToast('Plan PRO activé ✅');
      await refreshStatus();
    }catch(e){
      showToast(e.message);
    }
  };

  try{
    await Promise.all([renderPacks(), refreshStatus()]);
  }catch(e){
    showToast(e.message || 'Erreur');
  }
})();
