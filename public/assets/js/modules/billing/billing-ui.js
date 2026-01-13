/**
 * Billing UI — minimal additive widget (no layout changes)
 * - Shows credits + plan
 * - Links to /pricing
 * - Requires Twitch login for market actions
 */
(function(){
  const WIDGET_ID = 'sh-billing-pill';

  function el(tag, attrs={}, children=[]){
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v])=>{
      if(k === 'style') e.setAttribute('style', v);
      else if(k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    });
    (children||[]).forEach(c=> e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return e;
  }

  async function fetchJson(url, opts){
    const r = await fetch(url, Object.assign({ credentials:'include' }, opts||{}));
    const j = await r.json().catch(()=>null);
    if(!r.ok) throw Object.assign(new Error('http_'+r.status), { status:r.status, body:j });
    return j;
  }

  async function getTwitchStatus(){
    try{
      const j = await fetchJson('/twitch_user_status');
      return !!j.connected;
    }catch(_){ return false; }
  }

  async function getBillingStatus(){
    try{
      const j = await fetchJson('/api/billing/status');
      return j;
    }catch(e){
      return null;
    }
  }

  function mount(){
    if(document.getElementById(WIDGET_ID)) return;
    const pill = el('div', {
      id: WIDGET_ID,
      style: [
        'position:fixed',
        'top:10px',
        'right:10px',
        'z-index:9999',
        'display:flex',
        'gap:8px',
        'align-items:center',
        'padding:8px 10px',
        'border-radius:999px',
        'background:rgba(0,0,0,0.55)',
        'backdrop-filter:blur(8px)',
        'border:1px solid rgba(255,255,255,0.10)',
        'color:#fff',
        'font:12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial',
        'user-select:none',
        'cursor:pointer'
      ].join(';')
    });

    const dot = el('span', { style:'width:8px;height:8px;border-radius:50%;background:#888;display:inline-block' });
    const text = el('span', { id: WIDGET_ID+'-text', style:'opacity:0.95' }, ['Crédits: —']);
    const hint = el('span', { style:'opacity:0.65' }, ['•']);
    const cta = el('span', { style:'opacity:0.95;text-decoration:underline' }, ['Acheter']);

    pill.appendChild(dot);
    pill.appendChild(text);
    pill.appendChild(hint);
    pill.appendChild(cta);

    pill.addEventListener('click', ()=>{
      window.open('/pricing', '_blank', 'noopener');
    });

    document.body.appendChild(pill);

    return { pill, dot, text };
  }

  async function refresh(ui){
    const connected = await getTwitchStatus();
    ui.dot.style.background = connected ? '#7CFC00' : '#ff4d6d';

    if(!connected){
      ui.text.textContent = 'Connexion Twitch requise • Pricing';
      return;
    }

    const b = await getBillingStatus();
    if(!b || !b.success){
      ui.text.textContent = 'Crédits: — • Pricing';
      return;
    }
    const plan = (b.plan||'free').toUpperCase();
    if(plan === 'PREMIUM'){
      ui.text.textContent = 'Plan: PREMIUM • Actions: ∞';
      return;
    }
    ui.text.textContent = `Crédits: ${b.credits||0} • Actions: ${b.actions||0}`;
  }

  function init(){
    const ui = mount();
    if(!ui) return;
    refresh(ui);
    setInterval(()=>refresh(ui), 15000);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  }else{
    init();
  }
})();
