// Billing link + tiny status badge (minimal UI impact)
// - Adds a small "Crédits / PRO" link near the auth/user area
// - Shows remaining Actions (from /api/credits/status)
// - Does not change existing CSS; uses inline styles only.
(async function(){
  const API = '/api/credits/status';

  function $(sel, root=document){ return root.querySelector(sel); }
  function safeText(t){ return (t==null? '' : String(t)); }

  function createLink(){
    // Try to attach near auth button / user area
    const authBtn = document.getElementById('btn-auth');
    const userArea = document.getElementById('user-area');
    const anchor = authBtn?.parentElement || userArea?.parentElement || document.body;

    const wrap = document.createElement('div');
    wrap.id = 'billing-link-wrap';
    wrap.style.display = 'inline-flex';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '10px';
    wrap.style.marginLeft = '10px';

    const a = document.createElement('a');
    a.href = '/pricing';
    a.textContent = '💎 Crédits / PRO';
    a.style.fontSize = '12.5px';
    a.style.fontWeight = '700';
    a.style.color = '#e8eef6';
    a.style.textDecoration = 'none';
    a.style.padding = '8px 10px';
    a.style.border = '1px solid rgba(255,255,255,0.12)';
    a.style.borderRadius = '999px';
    a.style.background = 'rgba(0,0,0,0.25)';
    a.addEventListener('mouseenter', ()=> a.style.borderColor = 'rgba(124,199,255,0.45)');
    a.addEventListener('mouseleave', ()=> a.style.borderColor = 'rgba(255,255,255,0.12)');

    const badge = document.createElement('span');
    badge.id = 'billing-actions-badge';
    badge.textContent = 'Actions: …';
    badge.style.fontSize = '12px';
    badge.style.color = 'rgba(232,238,246,0.85)';
    badge.style.padding = '6px 10px';
    badge.style.border = '1px solid rgba(255,255,255,0.10)';
    badge.style.borderRadius = '999px';
    badge.style.background = 'rgba(0,0,0,0.18)';

    wrap.appendChild(a);
    wrap.appendChild(badge);

    // Insert after auth button if possible, else append
    if (authBtn && authBtn.parentElement){
      authBtn.parentElement.insertAdjacentElement('afterend', wrap);
    } else if (userArea && userArea.parentElement){
      userArea.parentElement.appendChild(wrap);
    } else {
      // fallback: fixed bottom-right
      wrap.style.position = 'fixed';
      wrap.style.right = '14px';
      wrap.style.bottom = '14px';
      wrap.style.zIndex = '9999';
      document.body.appendChild(wrap);
    }
  }

  async function refreshStatus(){
    try{
      const res = await fetch(API, { credentials:'include' });
      if (!res.ok) throw new Error('status http ' + res.status);
      const data = await res.json();
      const badge = document.getElementById('billing-actions-badge');
      if (!badge) return;
      const plan = (data.plan||'FREE').toString().toUpperCase();
      const actions = (plan === 'PRO' || plan === 'PREMIUM') ? '∞' : safeText(data.actions ?? Math.floor((data.credits||0)/20));
      badge.textContent = `Actions: ${actions}`;
      badge.title = `Plan: ${data.plan} • Crédits: ${data.credits}`;
    }catch(_e){
      // keep silent
    }
  }

  function ensure(){
    if (document.getElementById('billing-link-wrap')) return;
    createLink();
    refreshStatus();
    setInterval(refreshStatus, 60_000);
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', ensure);
  } else {
    ensure();
  }
})();