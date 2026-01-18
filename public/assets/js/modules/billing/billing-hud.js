(function(){
  const HUD_ID = 'billing-hud';
  const ACTION_COST = 20;

  function $(id){ return document.getElementById(id); }

  async function getJSON(url, opt){
    const res = await fetch(url, { credentials:'include', ...(opt||{}) });
    if(!res.ok) throw new Error(await res.text());
    return res.json();
  }

  function ensureHud(){
    const userArea = $('user-area');
    const userName = $('user-name');
    if(!userArea || !userName) return null;
    if(userArea.classList.contains('hidden')) return null;

    let hud = document.getElementById(HUD_ID);
    if(hud) return hud;

    hud = document.createElement('a');
    hud.id = HUD_ID;
    hud.href = '/pricing';
    hud.title = 'Crédits / Premium';
    hud.style.display = 'inline-flex';
    hud.style.alignItems = 'center';
    hud.style.gap = '8px';
    hud.style.marginLeft = '10px';
    hud.style.padding = '6px 10px';
    hud.style.borderRadius = '999px';
    hud.style.border = '1px solid rgba(255,255,255,.12)';
    hud.style.background = 'rgba(10,10,10,.55)';
    hud.style.fontSize = '12px';
    hud.style.fontWeight = '800';
    hud.style.textDecoration = 'none';
    hud.style.color = '#e6e6e6';
    hud.innerHTML = `<span style="color:#00f2ea">FREE</span><span>•</span><span>Actions: --</span>`;

    // insert right after username
    userName.insertAdjacentElement('afterend', hud);
    return hud;
  }

  async function refresh(){
    const hud = ensureHud();
    if(!hud) return;
    try{
      const st = await getJSON('/api/billing/status');
      const plan = (st.plan || 'free').toUpperCase();
      const actions = st.plan === 'premium' ? '∞' : (st.actions ?? Math.floor((st.credits||0)/ACTION_COST));
      hud.innerHTML = `<span style="color:${st.plan==='premium' ? '#e50914':'#00f2ea'}">${plan}</span><span>•</span><span>Actions: ${actions}</span>`;
    } catch (e) {
      // if not logged, remove hud
      hud.remove();
    }
  }

  // poll a bit (minimal, no heavy)
  setInterval(refresh, 4000);
  window.addEventListener('focus', refresh);
  // first refresh after DOM ready
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh);
  else refresh();
})();
