(function(){
  // ===== Ambilight =====
  const ambi = document.createElement('div');
  ambi.id = 'ambilight';
  const wrap = document.getElementById('player-wrap') || document.getElementById('player-container') || document.querySelector('.player-wrap') || document.body;
  if(wrap && !document.getElementById('ambilight')){
    wrap.prepend(ambi);
  }
  function avgColorFromImage(url){
    return new Promise((resolve)=>{
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.referrerPolicy = 'no-referrer';
      img.onload = ()=>{
        const c = document.createElement('canvas');
        const w = c.width = 64, h = c.height = 36;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0,0,w,h);
        const d = ctx.getImageData(0,0,w,h).data;
        let r=0,g=0,b=0,n=0;
        for(let i=0;i<d.length;i+=16){ r+=d[i]; g+=d[i+1]; b+=d[i+2]; n++; }
        r=Math.round(r/n); g=Math.round(g/n); b=Math.round(b/n);
        resolve(`rgb(${r},${g},${b})`);
      };
      img.onerror = ()=>resolve('rgba(0,242,234,.18)');
      img.src = url + (url.includes('?')?'&':'?') + 'rand=' + Date.now();
    });
  }
  async function updateAmbilight(channel){
    if(!channel) return;
    const color = await avgColorFromImage(`https://static-cdn.jtvnw.net/previews-ttv/live_user_${encodeURIComponent(channel)}-440x248.jpg`);
    const el = document.getElementById('ambilight');
    if(el) el.style.background = `radial-gradient(circle at 30% 25%, ${color}, rgba(0,0,0,0) 55%), radial-gradient(circle at 70% 70%, rgba(0,242,234,.18), rgba(0,0,0,0) 60%)`;
  }
  // Hook into existing channel change if present
  const _set = window.setChannel || window.setTwitchChannel || null;
  if(_set){
    const fnName = _set.name;
    const original = _set;
    window[fnName] = function(ch){
      const r = original.apply(this, arguments);
      updateAmbilight(ch);
      return r;
    };
  } else {
    // fallback: observe current channel variable if exists
    setInterval(()=>{ 
      const ch = window.currentChannel || window.selectedChannel; 
      if(ch && window.__lastAmbiCh !== ch){ window.__lastAmbiCh = ch; updateAmbilight(ch); }
    }, 1500);
  }

  // ===== Vibe Check (deterministic) =====
  function vibeFor(name){
    const s = String(name||'');
    let h=0;
    for(let i=0;i<s.length;i++){ h = (h*31 + s.charCodeAt(i)) >>> 0; }
    const r = h % 3;
    return r===0 ? 'vibe-chill' : r===1 ? 'vibe-hype' : 'vibe-toxic';
  }
  // apply vibe to any TwitFlix card that has data-game or title
  function applyVibes(){
    document.querySelectorAll('[data-tf-card]').forEach(card=>{
      if(card.dataset.vibeApplied) return;
      const name = card.getAttribute('data-name') || card.querySelector('.tf-name')?.textContent || '';
      card.classList.add(vibeFor(name));
      card.dataset.vibeApplied = '1';
    });
  }
  setInterval(applyVibes, 1200);

  // ===== Mosaic Mode (Squad) =====
  function ensureMosaicBtn(){
    if(document.getElementById('mosaic-btn')) return;
    const host = document.querySelector('#player-controls') || document.querySelector('.player-controls') || document.querySelector('#player-wrap') || null;
    if(!host) return;
    const btn = document.createElement('button');
    btn.id = 'mosaic-btn';
    btn.type = 'button';
    btn.textContent = '📺 Mosaic';
    btn.style.cssText = 'margin-left:8px; padding:6px 10px; border-radius:10px; border:1px solid rgba(255,255,255,.12); background:rgba(0,0,0,.25); color:#fff; font-weight:900; font-size:12px; cursor:pointer;';
    host.appendChild(btn);

    btn.addEventListener('click', ()=>{
      const playerHost = document.getElementById('twitch-player') || document.getElementById('player') || document.querySelector('iframe[src*="player.twitch.tv"]')?.parentElement;
      if(!playerHost) return;
      const isOn = playerHost.dataset.mosaic === '1';
      if(isOn){
        // restore single
        const single = playerHost.dataset.singleHtml;
        if(single){ playerHost.innerHTML = single; }
        playerHost.dataset.mosaic = '0';
        return;
      }
      playerHost.dataset.singleHtml = playerHost.innerHTML;
      playerHost.dataset.mosaic = '1';
      const parent = new URLSearchParams(location.search).get('parent_host') || new URLSearchParams(location.search).get('parent') || location.hostname;
      const ch = window.currentChannel || window.selectedChannel || 'twitch';
      const tpl = (c)=>`https://player.twitch.tv/?channel=${encodeURIComponent(c)}&parent=${encodeURIComponent(parent)}&muted=true`;
      playerHost.innerHTML = `
        <div class="mosaic-grid">
          <iframe src="${tpl(ch)}" allowfullscreen></iframe>
          <iframe src="${tpl(ch)}" allowfullscreen></iframe>
          <iframe src="${tpl(ch)}" allowfullscreen></iframe>
          <iframe src="${tpl(ch)}" allowfullscreen></iframe>
        </div>
        <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
          <input id="mosaic-channels" placeholder="channels (ex: ninja,shroud,...)"
            style="flex:1; min-width:220px; padding:8px 10px; border-radius:10px; border:1px solid rgba(255,255,255,.12); background:rgba(0,0,0,.25); color:#fff;">
          <button id="mosaic-apply" style="padding:8px 10px; border-radius:10px; border:1px solid rgba(0,242,234,.35); background:#00f2ea; color:#000; font-weight:900; cursor:pointer;">Appliquer</button>
        </div>`;
      const applyBtn = playerHost.querySelector('#mosaic-apply');
      applyBtn?.addEventListener('click', ()=>{
        const raw = playerHost.querySelector('#mosaic-channels')?.value || '';
        const list = raw.split(',').map(x=>x.trim()).filter(Boolean).slice(0,4);
        while(list.length<4) list.push(ch);
        const ifr = playerHost.querySelectorAll('iframe');
        ifr.forEach((f,i)=> f.src = tpl(list[i]));
      });
    });
  }
  setInterval(ensureMosaicBtn, 1200);

  // ===== Fantasy League UI (simple modal) =====
  function ensureFantasy(){
    if(document.getElementById('fantasy-open')) return;
    const nav = document.querySelector('#left-menu') || document.querySelector('.left-menu') || document.querySelector('#sidebar') || null;
    if(!nav) return;
    const b = document.createElement('button');
    b.id = 'fantasy-open';
    b.textContent = '🏆 Fantasy';
    b.style.cssText = 'width:100%; margin-top:8px; padding:10px 12px; border-radius:14px; border:1px solid rgba(255,255,255,.12); background:rgba(0,0,0,.18); color:#fff; font-weight:900; cursor:pointer;';
    nav.appendChild(b);

    const modal = document.createElement('div');
    modal.id = 'fantasy-modal';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,.75); display:none; align-items:center; justify-content:center; z-index:9999;';
    modal.innerHTML = `
      <div style="width:min(920px,92vw); max-height:86vh; overflow:auto; background:#0b0b0d; border:1px solid rgba(255,255,255,.12); border-radius:18px; padding:16px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="font-weight:1000; letter-spacing:.12em; font-size:14px;">FANTASY LEAGUE</div>
          <div style="margin-left:auto;"></div>
          <button id="fantasy-close" style="padding:8px 10px; border-radius:12px; border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.06); color:#fff; cursor:pointer;">Fermer</button>
        </div>
        <div style="margin-top:10px; display:grid; grid-template-columns: 1.2fr .8fr; gap:14px;">
          <div style="border:1px solid rgba(255,255,255,.08); border-radius:16px; padding:12px;">
            <div style="font-weight:900; margin-bottom:8px;">Portefeuille</div>
            <div id="fantasy-summary" style="color:#cbd5e1; font-size:12px;">Chargement…</div>
            <div id="fantasy-holdings" style="margin-top:10px;"></div>
            <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
              <input id="fantasy-streamer" placeholder="streamer login (ex: ninja)" style="flex:1; min-width:220px; padding:8px 10px; border-radius:12px; border:1px solid rgba(255,255,255,.12); background:rgba(0,0,0,.25); color:#fff;">
              <input id="fantasy-amount" placeholder="montant (ex: 500)" type="number" style="width:160px; padding:8px 10px; border-radius:12px; border:1px solid rgba(255,255,255,.12); background:rgba(0,0,0,.25); color:#fff;">
              <button id="fantasy-buy" style="padding:8px 10px; border-radius:12px; border:1px solid rgba(0,242,234,.35); background:#00f2ea; color:#000; font-weight:900; cursor:pointer;">Investir</button>
            </div>
            <div id="fantasy-msg" style="margin-top:8px; font-size:12px; color:#94a3b8;"></div>
          </div>
          <div style="border:1px solid rgba(255,255,255,.08); border-radius:16px; padding:12px;">
            <div style="font-weight:900; margin-bottom:8px;">Top Hub</div>
            <div id="fantasy-leaderboard" style="font-size:12px; color:#cbd5e1;">Chargement…</div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);

    function getUser(){
      return (window.currentUser && window.currentUser.name) || localStorage.getItem('hubUser') || 'Anon';
    }
    async function loadProfile(){
      const user = getUser();
      const r = await fetch(`/api/fantasy/profile?user=${encodeURIComponent(user)}`);
      const j = await r.json();
      if(!j.success) throw new Error(j.error||'Erreur');
      const sum = document.getElementById('fantasy-summary');
      sum.textContent = `Utilisateur: ${j.user} • Cash: ${Math.round(j.cash)} • Net Worth: ${Math.round(j.netWorth)}`;
      const hold = document.getElementById('fantasy-holdings');
      if(!j.holdings.length){ hold.innerHTML = '<div style="color:#64748b;">Aucune position.</div>'; return; }
      hold.innerHTML = j.holdings.map(h=>`
        <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(255,255,255,.06);">
          <div><strong>${h.login}</strong> <span style="color:#64748b;">(${h.shares} parts)</span></div>
          <div style="color:#a7f3d0;">${Math.round(h.value)}</div>
        </div>`).join('');
    }
    async function loadLeaderboard(){
      const r = await fetch('/api/fantasy/leaderboard?limit=15');
      const j = await r.json();
      const box = document.getElementById('fantasy-leaderboard');
      if(!j.success){ box.textContent = j.error||'Erreur'; return; }
      box.innerHTML = j.leaderboard.map((x,i)=>`
        <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(255,255,255,.06);">
          <div>${i+1}. <strong>${x.user}</strong></div>
          <div style="color:#fde68a;">${Math.round(x.netWorth)}</div>
        </div>`).join('');
    }
    async function buy(){
      const user = getUser();
      const streamer = document.getElementById('fantasy-streamer').value.trim();
      const amount = Number(document.getElementById('fantasy-amount').value||0);
      const msg = document.getElementById('fantasy-msg');
      msg.textContent = '...';
      const r = await fetch('/api/fantasy/invest',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({user, streamer, amount})});
      const j = await r.json();
      msg.textContent = j.success ? `✅ Achat: ${j.shares} parts @ ${j.price} (coût ${j.cost})` : `❌ ${j.error||'Erreur'}`;
      await loadProfile(); await loadLeaderboard();
    }

    b.addEventListener('click', async ()=>{
      modal.style.display = 'flex';
      try{ await loadProfile(); await loadLeaderboard(); }catch(e){ document.getElementById('fantasy-msg').textContent = e.message; }
    });
    modal.querySelector('#fantasy-close').addEventListener('click', ()=> modal.style.display='none');
    modal.addEventListener('click', (e)=>{ if(e.target===modal) modal.style.display='none'; });
    modal.querySelector('#fantasy-buy').addEventListener('click', buy);
  }
  setInterval(ensureFantasy, 1400);
})();

    // ==== Messenger-like reactions handlers (hover/tap) ====
    (function(){
      const hubBox = document.getElementById('hub-messages');
      if(!hubBox) return;

      // Tap/click on a message toggles reaction bar (mobile-friendly)
      hubBox.addEventListener('click', (e)=>{
        const msgEl = e.target.closest('.hub-msg');
        if(msgEl && !e.target.closest('.hub-react-btn')) {
          msgEl.classList.toggle('show-reactions');
          return;
        }
        const btn = e.target.closest('.hub-react-btn');
        if(btn){
          const emoji = btn.getAttribute('data-react');
          const idEnc = btn.getAttribute('data-msg') || '';
          const msgId = decodeURIComponent(idEnc);
          if(window.emitHubReact) window.emitHubReact({ messageId: msgId, emoji });
        }
      });
    })();



// ===== Extra tools logic (Fantasy/Mosaic/Ambilight/Vibe) =====
let __ambOn = localStorage.getItem('jp_amb_on') === '1';
let __vibeOn = localStorage.getItem('jp_vibe_on') === '1';

function getParentParam(){
  const sp = new URLSearchParams(location.search);
  return sp.get('parent_host') || sp.get('parent') || location.hostname;
}

function toast(msg){
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:rgba(0,0,0,.8);color:#fff;padding:10px 14px;border:1px solid rgba(255,255,255,.18);border-radius:14px;z-index:999999;font-weight:900;';
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), 1400);
}

function hashColor(str){
  str = String(str||'');
  let h=0; for(let i=0;i<str.length;i++) h=(h*31 + str.charCodeAt(i))>>>0;
  const a = 120 + (h % 120);
  const b = 90 + ((h>>8)%140);
  return `radial-gradient(circle at 25% 25%, rgba(0,242,234,.90), transparent 55%), radial-gradient(circle at 75% 75%, rgba(200,176,122,.78), transparent 55%), radial-gradient(circle at 50% 10%, rgba(${a},${b},255,.55), transparent 60%)`;
}

function refreshAmbilight(){
  const amb = document.getElementById('ambilight');
  if(!amb) return;
  const ch = (window.currentChannel || document.getElementById('current-channel-display')?.innerText || '').trim();
  amb.style.background = hashColor(ch || 'twitch');
}



let __toolsSched = false;
function ensurePlayerTools(){
  const vc = document.getElementById('video-container');
  if(!vc) return;

  // Ensure ambilight layer exists (behind player)
  if(!document.getElementById('ambilight')){
    const amb = document.createElement('div');
    amb.id = 'ambilight';
    vc.prepend(amb);
  }

  // Ensure tools exist (above player)
  let tools = document.getElementById('player-tools');
  if(!tools){
    tools = document.createElement('div');
    tools.id = 'player-tools';
    tools.innerHTML = `
      <button id="tool-mosaic" class="toolbtn" onclick="openMosaic()">📺</button>
      <button id="tool-fantasy" class="toolbtn" onclick="openFantasy()">🏆</button>
      <button id="tool-ambilight" class="toolbtn" onclick="toggleAmbilight()">💡</button>
      <button id="tool-vibe" class="toolbtn" onclick="toggleVibe()">🧠</button>
    `;
    vc.appendChild(tools);
  } else if (tools.parentElement !== vc) {
    vc.appendChild(tools);
  }

  // Force player iframe below tools
  vc.querySelectorAll('iframe').forEach(f=>{
    try{
      if(f.style.zIndex !== '1') f.style.zIndex = '1';
      if(f.style.position !== 'relative') f.style.position = 'relative';
    }catch(e){}
  });
}

// Re-ensure tools if Twitch replaces the player DOM (debounced to avoid infinite loops)
(function(){
  const vc = document.getElementById('video-container');
  if(!vc) return;

  ensurePlayerTools();

  const obs = new MutationObserver(()=>{
    if(__toolsSched) return;
    __toolsSched = true;
    requestAnimationFrame(()=>{
      __toolsSched = false;
      ensurePlayerTools();
    });
  });

  obs.observe(vc, { childList: true, subtree: true });

  window.addEventListener('load', ()=>setTimeout(ensurePlayerTools, 600));
  setTimeout(ensurePlayerTools, 1200);
})();


function toggleAmbilight(){
  __ambOn = !__ambOn;
  localStorage.setItem('jp_amb_on', __ambOn ? '1' : '0');
  const btn = document.getElementById('tool-ambilight');
  const amb = document.getElementById('ambilight');
  if(btn) btn.classList.toggle('active', __ambOn);
  if(amb) amb.classList.toggle('on', __ambOn);
  refreshAmbilight();
  toast(`Ambilight ${__ambOn ? 'activé' : 'désactivé'}`);
}

function vibeClass(name){
  const s = String(name||'');
  let h=0; for(let i=0;i<s.length;i++) h=(h*31 + s.charCodeAt(i))>>>0;
  const v = h % 3;
  return v===0 ? 'vibe-chill' : (v===1 ? 'vibe-hype' : 'vibe-toxic');
}
function applyVibe(){
  document.querySelectorAll('.tf-card').forEach(card=>{
    card.classList.remove('vibe-chill','vibe-hype','vibe-toxic');
    if(!__vibeOn) return;
    const name = card.dataset.gameName || card.getAttribute('data-game-name') || card.querySelector('.tf-title')?.textContent || '';
    card.classList.add(vibeClass(name));
  });
}
function toggleVibe(){
  __vibeOn = !__vibeOn;
  localStorage.setItem('jp_vibe_on', __vibeOn ? '1' : '0');
  const btn = document.getElementById('tool-vibe');
  if(btn) btn.classList.toggle('active', __vibeOn);
  applyVibe();
  toast(`Vibe Check ${__vibeOn ? 'activé' : 'désactivé'}`);
}

// reapply vibe on mutations
new MutationObserver(()=>{ if(__vibeOn) applyVibe(); }).observe(document.body, {childList:true, subtree:true});

// Mosaic
function openMosaic(){
  const m = document.getElementById('mosaicModal');
  const grid = document.getElementById('mosaicGrid');
  if(!m||!grid) return;
  const parent = getParentParam();
  const current = (window.currentChannel || document.getElementById('current-channel-display')?.innerText || '').trim();
  const list = [];
  if(current) list.push(current);
  if(Array.isArray(window.recentChannels)) list.push(...window.recentChannels);
  while(list.length < 4) list.push(current || 'twitch');
  const channels = list.filter(Boolean).slice(0,4);

  grid.innerHTML = '';
  channels.forEach(ch=>{
    const tile = document.createElement('div');
    tile.className='mosaic-tile';
    const src = `https://player.twitch.tv/?channel=${encodeURIComponent(ch)}&parent=${encodeURIComponent(parent)}&muted=true&autoplay=true`;
    tile.innerHTML = `<iframe src="${src}" width="100%" height="100%" frameborder="0" allow="autoplay; fullscreen"></iframe>
      <button onclick="focusChannel('${encodeURIComponent(ch)}')">Focus</button>`;
    grid.appendChild(tile);
  });
  m.classList.add('active');
}
function closeMosaic(e){ if(e) e.preventDefault(); document.getElementById('mosaicModal')?.classList.remove('active'); }
function focusChannel(enc){
  const ch = decodeURIComponent(enc);
  if(typeof changeChannel === 'function') changeChannel(ch);
  refreshAmbilight();
  closeMosaic(new Event('click'));
}

// Fantasy API + chart
function openFantasy(){ document.getElementById('fantasyModal')?.classList.add('active'); refreshFantasy(); }
function closeFantasy(e){ if(e) e.preventDefault(); document.getElementById('fantasyModal')?.classList.remove('active'); }

function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

async function refreshFantasy(){
  const user = (window.currentUser || 'Anon');
  const prof = await fetch(`/api/fantasy/profile?user=${encodeURIComponent(user)}`).then(r=>r.json()).catch(()=>null);
  if(prof && prof.success){
    document.getElementById('fantasyCash').textContent = `${Number(prof.cash||0).toLocaleString('fr-FR')} crédits`;
    const h = document.getElementById('fantasyHoldings');
    if(h){
      h.innerHTML = (prof.holdings||[]).map(x=>`
        <div style="display:flex;justify-content:space-between;gap:10px;border:1px solid rgba(255,255,255,.10);border-radius:12px;padding:10px;background:rgba(0,0,0,.15);cursor:pointer;"
             onclick="loadMarket('${escapeHtml(x.login)}')">
          <div style="font-weight:900;color:#fff;">${escapeHtml(x.login)} <span style="color:#a7a7b2;font-weight:700;">(${x.shares} sh)</span></div>
          <div style="font-weight:900;color:#00f2ea;">${Math.round(x.value).toLocaleString('fr-FR')}</div>
        </div>`).join('') || `<div style="color:#a7a7b2;">Aucun streamer en portefeuille.</div>`;
    }
  }

  const lb = await fetch(`/api/fantasy/leaderboard`).then(r=>r.json()).catch(()=>null);
  if(lb && lb.success){
    const el = document.getElementById('fantasyLeaderboard');
    if(el){
      el.innerHTML = (lb.items||[]).slice(0,10).map((u,i)=>`
        <div style="display:flex;justify-content:space-between;gap:10px;border:1px solid rgba(255,255,255,.10);border-radius:12px;padding:10px;background:rgba(0,0,0,.15);">
          <div style="font-weight:900;color:#fff;">#${i+1} ${escapeHtml(u.user||'')}</div>
          <div style="font-weight:900;color:#ffd600;">${Math.round(u.netWorth||0).toLocaleString('fr-FR')}</div>
        </div>`).join('') || `<div style="color:#a7a7b2;">Aucun classement.</div>`;
    }
  }
}

async function loadMarket(login){
  if(!login) return;
  const d = await fetch(`/api/fantasy/market?streamer=${encodeURIComponent(login)}`).then(r=>r.json()).catch(()=>null);
  if(!d || !d.success) return toast('Marché indisponible');
  const m = d.market;
  const info = document.getElementById('marketInfo');
  if(info){
    info.innerHTML = `
      <div>Base: <b style="color:#fff">${m.basePrice}</b></div>
      <div>Impact: <b style="color:#fff">x${Number(m.mult).toFixed(2)}</b></div>
      <div>Shares: <b style="color:#fff">${Math.round(m.sharesOutstanding)}</b></div>
      <div>Prix: <b style="color:#00f2ea">${m.price}</b></div>
    `;
  }
  drawChart(d.history || [], m.price);
  document.getElementById('fantasyStreamer').value = login;
}

function drawChart(history, last){
  const c = document.getElementById('marketChart');
  if(!c) return;
  const ctx = c.getContext('2d');
  const W=c.width, H=c.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle = '#0b0b0d';
  ctx.fillRect(0,0,W,H);
  const pts = (history||[]).map(x=>Number(x.price||0)).filter(x=>x>0);
  if(pts.length < 2){
    ctx.fillStyle = '#a7a7b2';
    ctx.font = '14px system-ui';
    ctx.fillText('Historique insuffisant (2+ points requis)', 16, 30);
    return;
  }
  const minP=Math.min(...pts), maxP=Math.max(...pts);
  const pad=18;
  const sx=(W-pad*2)/(pts.length-1);
  const sy=(H-pad*2)/(maxP-minP||1);
  ctx.strokeStyle='rgba(0,242,234,.85)';
  ctx.lineWidth=3;
  ctx.beginPath();
  pts.forEach((p,i)=>{
    const x=pad+i*sx;
    const y=H-pad-(p-minP)*sy;
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();
  ctx.fillStyle='#00f2ea';
  ctx.font='bold 16px system-ui';
  ctx.fillText(String(last||pts[pts.length-1]), W-70, 26);
}

async function fantasyBuy(){
  const user = (window.currentUser || 'Anon');
  const login = document.getElementById('fantasyStreamer')?.value?.trim();
  const amount = Number(document.getElementById('fantasyAmount')?.value || 0);
  if(!login || !amount) return alert('Streamer + montant requis.');
  const r = await fetch('/api/fantasy/invest', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ user, streamer: login, amount })}).then(r=>r.json()).catch(()=>null);
  if(!r || !r.success) return alert(r?.error || 'Erreur invest.');
  toast('Investissement effectué');
  await refreshFantasy();
  await loadMarket(login);
}
async function fantasySell(){
  const user = (window.currentUser || 'Anon');
  const login = document.getElementById('fantasyStreamer')?.value?.trim();
  const amount = Number(document.getElementById('fantasyAmount')?.value || 0);
  if(!login || !amount) return alert('Streamer + montant requis.');
  const r = await fetch('/api/fantasy/sell', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ user, streamer: login, amount })}).then(r=>r.json()).catch(()=>null);
  if(!r || !r.success) return alert(r?.error || 'Erreur sell.');
  toast('Vente effectuée');
  await refreshFantasy();
  await loadMarket(login);
}

// initialize buttons state
document.getElementById('tool-ambilight')?.classList.toggle('active', __ambOn);
document.getElementById('ambilight')?.classList.toggle('on', __ambOn);
document.getElementById('tool-vibe')?.classList.toggle('active', __vibeOn);
setTimeout(()=>{ if(__ambOn) refreshAmbilight(); if(__vibeOn) applyVibe(); }, 700);





// (BOURSE PANEL removed — replaced by Market overlay)

function openMarketOverlay(){
  document.body.classList.add('modal-open');
const ov = document.getElementById('market-overlay');
      if(!ov) return;
      ov.classList.remove('hidden');
      // ensure overlay starts at top
      try { ov.querySelector('.overflow-y-auto')?.scrollTo({ top:0, behavior:'smooth' }); } catch(_){}
      // refresh when opened (soft)
      try { refreshMarketAll(); } catch(_){}
    }
    function closeMarketOverlay(){
  document.body.classList.remove('modal-open');
const ov = document.getElementById('market-overlay');
      if(!ov) return;
      ov.classList.add('hidden');
    }
