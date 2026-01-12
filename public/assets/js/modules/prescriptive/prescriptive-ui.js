/**
 * Prescriptive layer (PRO) — Recommandations + Alertes + Benchmark
 * Injecté sans casser le visuel existant (ajout dans le modal Fantasy/Portefeuille).
 */
(function(){
  const $ = (sel, root=document)=>root.querySelector(sel);

  async function jget(url){
    const r = await fetch(url, { credentials:'include' });
    const j = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(j.error || ('HTTP '+r.status));
    return j;
  }
  async function jpost(url, body){
    const r = await fetch(url, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body||{}),
      credentials:'include'
    });
    const j = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(j.error || ('HTTP '+r.status));
    return j;
  }

  function ensureUI(){
    const modal = $('#fantasyModal');
    if(!modal) return;

    // Rename title if present
    const title = modal.querySelector('.modal-title');
    if(title && /Fantasy/i.test(title.textContent||'')){
      title.textContent = 'Portefeuille Marché du Streamer';
    }

    const body = modal.querySelector('.modal-body') || modal;
    if($('#prescriptiveBox', body)) return;

    const box = document.createElement('div');
    box.id = 'prescriptiveBox';
    box.style.marginTop = '12px';
    box.style.padding = '12px';
    box.style.border = '1px solid rgba(255,255,255,0.10)';
    box.style.borderRadius = '14px';
    box.style.background = 'rgba(0,0,0,0.20)';

    box.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div style="font-weight:700;opacity:.95">🧠 Mode PRO — Prescriptif</div>
        <div id="proPlanPill" style="padding:6px 10px;border-radius:999px;font-size:12px;border:1px solid rgba(255,255,255,0.12);opacity:.9">…</div>
      </div>

      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
        <button id="btnReco" style="padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);">Recommandations</button>
        <button id="btnBench" style="padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);">Benchmark</button>
        <button id="btnAlerts" style="padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);">Alertes</button>
      </div>

      <div id="prescriptiveOut" style="margin-top:10px;font-size:13px;line-height:1.35;opacity:.95"></div>
    `;
    body.appendChild(box);

    const out = $('#prescriptiveOut', box);
    const pill = $('#proPlanPill', box);

    async function refreshPlan(){
      try{
        const p = await jget('/api/billing/plan');
        pill.textContent = p.plan === 'PRO' ? 'PRO actif ✅' : 'FREE (upgrade pour débloquer)';
        pill.style.background = p.plan === 'PRO' ? 'rgba(0,255,140,0.08)' : 'rgba(255,255,255,0.05)';
      }catch(e){
        pill.textContent = 'Plan: inconnu';
      }
    }

    function showLocked(){
      out.innerHTML = `
        <div style="opacity:.9">
          🔒 Fonction PRO.<br>
          Active PRO (temp) via l’endpoint admin /api/billing/activate_pro (ADMIN_KEY).
        </div>`;
    }

    async function showReco(){
      out.textContent = 'Chargement des recommandations…';
      try{
        const gameEl = document.querySelector('#gameName, .gameName, [data-game-name]');
        const guess = (gameEl?.textContent || gameEl?.getAttribute?.('data-game-name') || '').trim();
        const game = guess || prompt('Nom du jeu/catégorie pour recommandations (ex: Valorant) :','Valorant') || '';
        if(!game) return out.textContent = 'Annulé.';
        const r = await jget(`/api/recommendations?game_name=${encodeURIComponent(game)}&days=7`);
        if(!r.recommendations?.length){
          out.innerHTML = `<div>Pas assez de données pour <b>${escapeHtml(game)}</b> (ou jeu introuvable).</div>`;
          return;
        }
        const rows = r.recommendations.map(x=>{
          const dt = new Date(x.startsAtUtc);
          return `<li><b>${dt.toLocaleString()}</b> — <span>${x.label}</span> • score ${x.score} • concurrence ~${x.competition}</li>`;
        }).join('');
        out.innerHTML = `<div style="margin-bottom:6px">🎯 <b>${escapeHtml(r.game?.name || game)}</b> — meilleures fenêtres</div><ol style="margin-left:18px">${rows}</ol>`;
      }catch(e){
        if(String(e.message||'').includes('Fonction PRO')) return showLocked();
        out.innerHTML = `<div style="color:#ffb3b3">Erreur reco: ${escapeHtml(e.message||'')}</div>`;
      }
    }

    async function showBench(){
      out.textContent = 'Chargement benchmark…';
      try{
        const b = await jget('/api/benchmark/me?days=14');
        const pct = b.percentile==null ? '—' : `${b.percentile}e`;
        out.innerHTML = `
          <div>📊 <b>Benchmark (14j)</b></div>
          <ul style="margin-left:18px">
            <li>Avg viewers: <b>${b.me?.avgViewers ?? '—'}</b></li>
            <li>Heures estimées: <b>${b.me?.hours ?? '—'}h</b></li>
            <li>Jeu principal: <b>${escapeHtml(b.me?.mainGame || '—')}</b></li>
            <li>Percentile (avg viewers): <b>${pct}</b> vs pairs</li>
          </ul>`;
      }catch(e){
        if(String(e.message||'').includes('Fonction PRO')) return showLocked();
        out.innerHTML = `<div style="color:#ffb3b3">Erreur benchmark: ${escapeHtml(e.message||'')}</div>`;
      }
    }

    async function showAlerts(){
      out.textContent = 'Chargement alertes…';
      try{
        const a = await jget('/api/alerts');
        const enabled = !!a.alerts?.enabled;
        const game = a.alerts?.game_name || '';
        const minScore = a.alerts?.minScore ?? 20;

        out.innerHTML = `
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
            <label style="display:flex;gap:8px;align-items:center;">
              <input id="alEnabled" type="checkbox" ${enabled?'checked':''}/>
              <span>Activer</span>
            </label>
            <input id="alGame" placeholder="Jeu (ex: Valorant)" value="${escapeAttr(game)}"
              style="padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.25);color:#fff;min-width:220px"/>
            <input id="alScore" type="number" min="0" max="200" value="${escapeAttr(String(minScore))}"
              style="padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.25);color:#fff;width:110px"/>
            <button id="alSave" style="padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);">Enregistrer</button>
            <button id="alTest" style="padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);">Tester</button>
          </div>
          <div id="alMsg" style="margin-top:8px;opacity:.9"></div>
        `;

        $('#alSave', out).onclick = async ()=>{
          const payload = {
            enabled: $('#alEnabled', out).checked,
            game_name: $('#alGame', out).value.trim(),
            minScore: Number($('#alScore', out).value||20)
          };
          try{
            await jpost('/api/alerts', payload);
            $('#alMsg', out).textContent = '✅ Enregistré.';
          }catch(e){
            if(String(e.message||'').includes('Fonction PRO')) return showLocked();
            $('#alMsg', out).textContent = '❌ ' + (e.message||'Erreur');
          }
        };

        $('#alTest', out).onclick = async ()=>{
          try{
            const t = await jget('/api/alerts/check');
            $('#alMsg', out).textContent = t.triggered ? `🔔 Opportunité détectée: score ${t.alert.score} (${t.alert.game_name})` : 'Aucune alerte dans les prochaines heures.';
          }catch(e){
            if(String(e.message||'').includes('Fonction PRO')) return showLocked();
            $('#alMsg', out).textContent = '❌ ' + (e.message||'Erreur');
          }
        };

      }catch(e){
        if(String(e.message||'').includes('Fonction PRO')) return showLocked();
        out.innerHTML = `<div style="color:#ffb3b3">Erreur alertes: ${escapeHtml(e.message||'')}</div>`;
      }
    }

    $('#btnReco', box).onclick = showReco;
    $('#btnBench', box).onclick = showBench;
    $('#btnAlerts', box).onclick = showAlerts;

    refreshPlan();

    setInterval(async ()=>{
      try{
        const p = await jget('/api/billing/plan');
        if(p.plan !== 'PRO') return;
        const t = await jget('/api/alerts/check');
        if(t.triggered){
          console.log(`ALERTE: ${t.alert.game_name} score ${t.alert.score}`);
        }
      }catch(_){}
    }, 90000);
  }

  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function escapeAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }

  document.addEventListener('DOMContentLoaded', ()=>{
    ensureUI();
    setInterval(ensureUI, 1200);
  });
})();