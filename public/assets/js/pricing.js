(function(){
  const $ = (id)=>document.getElementById(id);
  const toast=(msg)=>{
    const el=$('toast'); if(!el) return;
    el.textContent=msg; el.classList.add('show');
    clearTimeout(el.__t); el.__t=setTimeout(()=>el.classList.remove('show'),3400);
  };
  async function api(path, opts){
    const res = await fetch(path, Object.assign({credentials:'include', headers:{'Content-Type':'application/json'}}, opts||{}));
    const ct = res.headers.get('content-type')||'';
    const data = ct.includes('application/json') ? await res.json() : await res.text();
    if(!res.ok){ throw new Error((data && data.error) ? data.error : (typeof data==='string'?data:'Erreur serveur')); }
    return data;
  }
  function actionsFromCredits(c){ return Math.floor((Number(c)||0)/20); }

  async function load(){
    try{
      const me = await api('/api/auth/me');
      $('pillLogin').textContent = me.loggedIn ? `Twitch : connecté` : 'Twitch : non connecté';
      const st = await api('/api/billing/status');
      $('pillPlan').textContent = `Plan : ${st.plan}`;
      $('pillCredits').textContent = `Crédits : ${st.credits ?? 0}`;
      $('pillActions').textContent = `Actions : ${st.plan==='premium' ? '∞' : (st.actions ?? actionsFromCredits(st.credits))}`;
    }catch(e){ toast(e.message); }
  }

  function renderPacks(packs){
    const wrap=$('packs'); if(!wrap) return; wrap.innerHTML='';
    packs.forEach(p=>{
      const div=document.createElement('div'); div.className='pack';
      const left=document.createElement('div');
      left.innerHTML = `<div><strong>${p.name}</strong> ${p.isBest?'<span class="tag">⭐ Best</span>':''}</div>
                        <div class="meta">${p.credits} crédits • ${p.actions} actions</div>`;
      const btn=document.createElement('button'); btn.textContent=p.price;
      btn.onclick=async()=>{
        try{
          await api('/api/billing/buy-pack', {method:'POST', body: JSON.stringify({packId:p.id})});
          toast('Crédits ajoutés ✅'); await load();
        }catch(e){ toast(e.message); }
      };
      div.appendChild(left); div.appendChild(btn); wrap.appendChild(div);
    });
  }

  async function init(){
    $('btnGoApp')?.addEventListener('click', ()=>location.href='/');
    $('btnScrollPacks')?.addEventListener('click', ()=> $('packs')?.scrollIntoView({behavior:'smooth'}));
    $('btnPremium')?.addEventListener('click', async ()=>{
      try{ await api('/api/billing/subscribe-premium', {method:'POST'}); toast('Premium activé ✅'); await load(); }
      catch(e){ toast(e.message); }
    });
    try{
      const packs = await api('/api/billing/packs');
      renderPacks(packs);
    }catch(e){ toast(e.message); }
    await load();
  }
  document.addEventListener('DOMContentLoaded', init);
})();