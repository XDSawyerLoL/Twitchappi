/* Pricing UI — relies on backend endpoints.
 * - GET /twitch_user_status
 * - GET /api/billing/status
 * - GET /api/billing/packs
 * - POST /api/billing/buy-pack  { packId }
 * - POST /api/billing/subscribe-premium
 */

const $ = (id) => document.getElementById(id);
const toast = (msg) => {
  const t = $('toast');
  if (!t) return alert(msg);
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._tm);
  toast._tm = setTimeout(() => t.classList.remove('show'), 3500);
};

async function jfetch(url, opts={}){
  const res = await fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers||{}) },
    credentials: 'include'
  });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) {
    const err = (data && (data.error||data.message)) || (res.status+ ' ' +res.statusText);
    throw new Error(err);
  }
  return data;
}

function renderStatus(s){
  $('pillLogin').textContent = 'Twitch : ' + (s.isConnected ? ('connecté ('+s.login+')') : 'non connecté');
  $('pillPlan').textContent = 'Plan : ' + (s.plan || 'free').toUpperCase();
  const actions = s.plan === 'premium' ? '∞' : String(Math.floor((s.credits||0)/20));
  $('pillActions').textContent = 'Actions : ' + actions;
  $('pillCredits').textContent = 'Crédits : ' + (s.plan === 'premium' ? '∞' : String(s.credits||0));
}

function renderPacks(packs){
  const host = $('packs');
  host.innerHTML = '';
  packs.forEach(p => {
    const row = document.createElement('div');
    row.className = 'pack';
    row.innerHTML = `
      <div class="left">
        <div class="title">${p.title}</div>
        <div class="meta">${p.credits} crédits</div>
      </div>
      <button class="btn" data-pack="${p.id}" style="max-width:160px">${p.priceLabel}</button>
    `;
    row.querySelector('button').addEventListener('click', async () => {
      try{
        const r = await jfetch('/api/billing/buy-pack', { method:'POST', body: JSON.stringify({ packId: p.id })});
        toast('✅ Pack ajouté : +' + r.added + ' crédits');
        await refresh();
      }catch(e){
        toast('❌ ' + e.message);
      }
    });
    host.appendChild(row);
  });
}

async function refresh(){
  const s = await jfetch('/api/billing/status');
  renderStatus(s);
}

async function init(){
  $('btnGoApp')?.addEventListener('click', () => location.href = '/');
  $('btnScrollPacks')?.addEventListener('click', () => window.scrollTo({ top: document.body.scrollHeight, behavior:'smooth' }));
  $('btnPremium')?.addEventListener('click', async () => {
    try{
      const r = await jfetch('/api/billing/subscribe-premium', { method:'POST' });
      toast(r.message || '✅ Premium activé');
      await refresh();
    }catch(e){
      toast('❌ ' + e.message);
    }
  });

  try{
    const packs = await jfetch('/api/billing/packs');
    renderPacks(packs.packs || packs);
  }catch(e){
    // ok
  }

  await refresh();
}

init();
