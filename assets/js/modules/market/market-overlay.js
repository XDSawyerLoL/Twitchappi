/* ==========================
   MARKET APP (Binance-like)
   - watchlist bootstrapped from Firestore via backend:
     leaderboard -> profile holdings -> unique tickers
   - all metrics derived from /api/fantasy/market (real)
   ========================== */

(function(){
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  // --- Modal helpers ---
  const overlay = $('#market-overlay');
  const tabs = $$('.mkt-tab', overlay);
  const views = $$('.mkt-view', overlay);

  function setBodyModal(on){
    document.body.classList.toggle('modal-open', !!on);
  }

  // Ensure floating emoji buttons (📺🏆💡🧠) don't overlay modals
  function setAuxUiHidden(on){
    // best-effort: hide known floating toolbars
    $$('#floating-tools, #floatingTools, .floating-tools, .quick-tools, .dock-tools').forEach(el=>{
      el.style.display = on ? 'none' : '';
    });
  }

  // --- Data store ---
  let watchlist = [];
  let selected = null;
  let autoOn = true;
  let autoTimer = null;
  let marketOverviewChart = null;
  let marketProChart = null;
  let activeRange = '15m';
  let cache = new Map(); // login -> last market response


  // --- Billing (credits/plan) ---
  async function fetchBilling(){
    try{
      const r = await fetch('/api/billing/me', { cache:'no-store', credentials:'include' });
      const j = await r.json();
      if(!j?.success) return { plan:'free', credits:0 };
      return { plan: String(j.plan||'free').toLowerCase(), credits: Number(j.credits||0) };
    }catch(_){
      return { plan:'free', credits:0 };
    }
  }

  function goPricing(){
    try{ window.location.href = '/pricing'; }catch(_){}
  }

  const LS_KEY = 'mkt_watchlist_v1';
  const LS_SEL = 'mkt_selected_v1';

  function format(n){
    if(n === null || n === undefined || Number.isNaN(n)) return '—';
    const x = Number(n);
    if(Math.abs(x) >= 1_000_000) return (x/1_000_000).toFixed(2)+'M';
    if(Math.abs(x) >= 1_000) return (x/1_000).toFixed(2)+'K';
    return (Math.round(x*100)/100).toString();
  }
  function pct(n){
    if(n === null || n === undefined || Number.isNaN(n)) return '—';
    const x = Number(n);
    const sign = x > 0 ? '+' : '';
    return sign + x.toFixed(2) + '%';
  }
  function colorClass(p){
    if(p === null || p === undefined || Number.isNaN(p)) return 'text-white/70';
    if(p > 0) return 'text-[#00ff88]';
    if(p < 0) return 'text-[#ff4d6d]';
    return 'text-white/70';
  }

  function sparklineSvg(points){
    if(!points || points.length < 2) return '<svg viewBox="0 0 100 24" class="w-[100px] h-6"></svg>';
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = (max-min) || 1;
    const coords = points.map((v,i)=>{
      const x = (i/(points.length-1))*100;
      const y = 24 - ((v-min)/span)*24;
      return x.toFixed(2)+','+y.toFixed(2);
    }).join(' ');
    const up = points[points.length-1] >= points[0];
    const stroke = up ? '#00ff88' : '#ff4d6d';
    return `
      <svg viewBox="0 0 100 24" class="w-[100px] h-6">
        <polyline fill="none" stroke="${stroke}" stroke-width="2" points="${coords}" />
      </svg>`;
  }

  function findPointAtOrBefore(history, targetTs){
    // history: [{ts,price}], sorted asc
    if(!history || history.length === 0) return null;
    // binary search
    let lo=0, hi=history.length-1, ans=null;
    while(lo<=hi){
      const mid=(lo+hi)>>1;
      const ts=Number(history[mid].ts||0);
      if(ts<=targetTs){ ans=history[mid]; lo=mid+1; }
      else hi=mid-1;
    }
    return ans;
  }

  function computePerf(history, seconds){
    if(!history || history.length < 2) return null;
    const now = Number(history[history.length-1].ts || Date.now());
    const cur = Number(history[history.length-1].price || 0);
    const pastPoint = findPointAtOrBefore(history, now - seconds*1000) || history[0];
    const past = Number(pastPoint?.price || 0);
    if(!past) return null;
    return ((cur - past) / past) * 100;
  }

  function computeReturns(history){
    if(!history || history.length < 3) return [];
    const out=[];
    for(let i=1;i<history.length;i++){
      const a=Number(history[i-1].price||0);
      const b=Number(history[i].price||0);
      if(a>0 && b>0) out.push(Math.log(b/a));
    }
    return out;
  }
  function std(arr){
    if(!arr || arr.length<2) return null;
    const mean = arr.reduce((s,x)=>s+x,0)/arr.length;
    const v = arr.reduce((s,x)=>s+(x-mean)**2,0)/(arr.length-1);
    return Math.sqrt(v);
  }
  function sma(arr, n){
    if(!arr || arr.length < n) return null;
    const slice = arr.slice(-n);
    return slice.reduce((s,x)=>s+x,0)/n;
  }
  function ema(arr, n){
    if(!arr || arr.length < n) return null;
    const k = 2/(n+1);
    let e = arr[0];
    for(let i=1;i<arr.length;i++) e = arr[i]*k + e*(1-k);
    return e;
  }

  function trendScore(p1h, p6h, p7d, vol){
    // normalize and combine (no fake data; just derived score)
    const a = (p1h ?? 0) * 0.45 + (p6h ?? 0) * 0.35 + (p7d ?? 0) * 0.20;
    const penalty = (vol ?? 0) * 120; // log-return std ~ small; scale to 0..?
    const raw = a - penalty;
    // map to 0..100
    const s = Math.max(0, Math.min(100, 50 + raw));
    return Math.round(s);
  }

  async function fetchMarket(login){
    const key = String(login||'').trim().toLowerCase();
    if(!key) return null;
    const r = await fetch(`/api/fantasy/market?streamer=${encodeURIComponent(key)}`);
    const j = await r.json();
    if(!j?.success) return null;
    cache.set(key, j);
    return j;
  }

  async function fetchLeaderboard(){
    const r = await fetch('/api/fantasy/leaderboard');
    const j = await r.json();
    if(!j?.success) return [];
    return j.items || [];
  }

  async function fetchProfile(user){
    const r = await fetch(`/api/fantasy/profile?user=${encodeURIComponent(user)}`);
    const j = await r.json();
    if(!j?.success) return null;
    return j;
  }

  async function bootstrapWatchlistFromFirebase(){
    // If localStorage already has list, keep it.
    const ls = localStorage.getItem(LS_KEY);
    if(ls){
      try{
        const arr = JSON.parse(ls);
        if(Array.isArray(arr) && arr.length){
          watchlist = arr.map(x=>String(x).toLowerCase().trim()).filter(Boolean).slice(0, 40);
          return;
        }
      }catch(_){}
    }

    // Build from top leaderboard users holdings (real Firestore via backend)
    const lb = await fetchLeaderboard();
    const topUsers = lb.slice(0, 12).map(x=>x.user).filter(Boolean);

    const set = new Set();
    for(const u of topUsers){
      const prof = await fetchProfile(u);
      const holds = prof?.holdings || [];
      holds.forEach(h=>{ if(h?.login) set.add(String(h.login).toLowerCase().trim()); });
      if(set.size >= 25) break;
    }

    watchlist = Array.from(set).slice(0, 25);
    if(!watchlist.length){
      watchlist = ['twitch']; // fallback
    }

    localStorage.setItem(LS_KEY, JSON.stringify(watchlist));
  }

  function setSelected(login){
    selected = String(login||'').toLowerCase().trim();
    if(selected) localStorage.setItem(LS_SEL, selected);
    $('#mkt-selected').textContent = selected ? selected.toUpperCase() : '—';
  }

  function updateOverview(mkt){
    if(!mkt) return;
    const login = selected;
    const market = mkt.market || {};
    const hist = (mkt.history || []).map(x=>({ts:Number(x.ts||0), price:Number(x.price||0)})).filter(x=>x.ts && x.price);

    const price = Number(market.price ?? NaN);
    const base = Number(market.basePrice ?? NaN);
    const mult = Number(market.mult ?? NaN);
    const shares = Number(market.sharesOutstanding ?? NaN);
    const mcap = (Number.isFinite(price) && Number.isFinite(shares)) ? price * shares : null;

    // performance windows
    const p1h = computePerf(hist, 3600);
    const p6h = computePerf(hist, 21600);
    const p7d = computePerf(hist, 604800);

    // vol from log returns
    const rets = computeReturns(hist);
    const vol = std(rets);

    // hilo
    const prices = hist.map(x=>x.price);
    const hi = prices.length ? Math.max(...prices) : null;
    const lo = prices.length ? Math.min(...prices) : null;

    // SMA/EMA
    const sma20 = sma(prices, 20);
    const sma50 = sma(prices, 50);
    const ema20 = ema(prices, 20);
    const ema50 = ema(prices, 50);

    const tscore = trendScore(p1h, p6h, p7d, vol);

    // delta from last point vs prev
    let chgText = '—';
    if(prices.length >= 2){
      const prev = prices[prices.length-2];
      const cur = prices[prices.length-1];
      const d = ((cur-prev)/prev)*100;
      chgText = `Δ dernier point: ${pct(d)}`;
    }

    $('#mkt-price').textContent = Number.isFinite(price) ? format(price) : '—';
    $('#mkt-chg').textContent = chgText;
    $('#mkt-chg').className = 'text-xs ' + (prices.length>=2 ? colorClass(((prices[prices.length-1]-prices[prices.length-2])/prices[prices.length-2])*100) : 'text-white/60');

    $('#mkt-base').textContent = Number.isFinite(base) ? format(base) : '—';
    $('#mkt-mult').textContent = Number.isFinite(mult) ? (Math.round(mult*100)/100).toString() : '—';
    $('#mkt-shares').textContent = Number.isFinite(shares) ? format(shares) : '—';
    $('#mkt-mcap').textContent = mcap !== null ? format(mcap) : '—';

    $('#mkt-p1h').textContent = p1h===null? '—' : pct(p1h);
    $('#mkt-p1h').className = 'text-lg font-bold ' + colorClass(p1h);
    $('#mkt-p6h').textContent = p6h===null? '—' : pct(p6h);
    $('#mkt-p6h').className = 'text-lg font-bold ' + colorClass(p6h);
    $('#mkt-p7d').textContent = p7d===null? '—' : pct(p7d);
    $('#mkt-p7d').className = 'text-lg font-bold ' + colorClass(p7d);

    $('#mkt-trend').textContent = Number.isFinite(tscore) ? (tscore + '/100') : '—';

    $('#mkt-vol').textContent = vol===null ? '—' : (Math.round(vol*10000)/100).toString(); // scaled
    $('#mkt-hilo').textContent = (hi===null||lo===null) ? '—' : `${format(hi)} / ${format(lo)}`;

    $('#mkt-sma').textContent = `${sma20?format(sma20):'—'} / ${sma50?format(sma50):'—'}`;
    $('#mkt-ema').textContent = `${ema20?format(ema20):'—'} / ${ema50?format(ema50):'—'}`;

    const lastTs = hist.length ? hist[hist.length-1].ts : null;
    $('#mkt-updated').textContent = lastTs ? ('Dernière maj: ' + new Date(lastTs).toLocaleString()) : '—';

    // chart
    renderChart(hist, { sma20, sma50, ema20, ema50 });

    // actions enable
    $('#mkt-buy').disabled = !login;
    $('#mkt-sell').disabled = !login;
  }

  function rangeMs(range){
    const map = { '15m': 15*60*1000, '1h': 60*60*1000, '6h': 6*60*60*1000, '24h': 24*60*60*1000, '7d': 7*24*60*60*1000 };
    return map[range] || null;
  }

  function filterHistoryByRange(hist){
    if(!hist || !hist.length) return [];
    const ms = rangeMs(activeRange);
    if(!ms) return hist.slice();
    const end = Number(hist[hist.length-1].ts || Date.now());
    const start = end - ms;
    const filtered = hist.filter(p => Number(p.ts||0) >= start);
    return filtered.length >= 2 ? filtered : hist.slice(-Math.min(hist.length, 60));
  }

  function downsampleHistory(hist, maxPoints=180){
    if(!hist || hist.length <= maxPoints) return hist || [];
    const step = Math.ceil(hist.length / maxPoints);
    const out = [];
    for(let i=0;i<hist.length;i+=step) out.push(hist[i]);
    if(out[out.length-1] !== hist[hist.length-1]) out.push(hist[hist.length-1]);
    return out;
  }

  function makeLabels(hist){
    const ms = rangeMs(activeRange);
    return hist.map((p)=>{
      const d = new Date(Number(p.ts||0));
      if(ms && ms <= 60*60*1000) return d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' });
      if(ms && ms <= 24*60*60*1000) return d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
      return d.toLocaleString([], { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    });
  }

  function rollingSmaSeries(values, period){
    const out = new Array(values.length).fill(null);
    let sum = 0;
    for(let i=0;i<values.length;i++){
      sum += Number(values[i]||0);
      if(i >= period) sum -= Number(values[i-period]||0);
      if(i >= period-1) out[i] = +(sum / period).toFixed(6);
    }
    return out;
  }

  function rollingEmaSeries(values, period){
    if(!values || !values.length) return [];
    const out = new Array(values.length).fill(null);
    const k = 2/(period+1);
    let prev = Number(values[0]||0);
    out[0] = +prev.toFixed(6);
    for(let i=1;i<values.length;i++){
      const cur = Number(values[i]||0);
      prev = cur*k + prev*(1-k);
      out[i] = +prev.toFixed(6);
    }
    return out;
  }

  function destroyMarketCharts(){
    try{ marketOverviewChart && marketOverviewChart.destroy(); }catch(_){}
    try{ marketProChart && marketProChart.destroy(); }catch(_){}
    marketOverviewChart = null;
    marketProChart = null;
  }

  function updateRangeButtons(){
    $$('.mkt-range-btn').forEach(btn=>{
      const on = btn.dataset.range === activeRange;
      btn.classList.toggle('active', on);
    });
  }

  function createMarketChart(canvas, labels, prices, sma20Series, ema20Series){
    if(!canvas || typeof Chart === 'undefined') return null;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height || 320);
    const up = prices[prices.length-1] >= prices[0];
    gradient.addColorStop(0, up ? 'rgba(0,229,255,0.35)' : 'rgba(255,77,109,0.32)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    return new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Prix',
            data: prices,
            borderColor: up ? '#00e5ff' : '#ff4d6d',
            backgroundColor: gradient,
            fill: true,
            tension: 0.24,
            borderWidth: 2.4,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointHitRadius: 18
          },
          {
            label: 'SMA20',
            data: sma20Series,
            borderColor: '#7dd3fc',
            borderWidth: $('#mkt-toggle-sma')?.checked ? 1.8 : 0,
            pointRadius: 0,
            tension: 0.16,
            fill: false
          },
          {
            label: 'EMA20',
            data: ema20Series,
            borderColor: '#fbbf24',
            borderWidth: $('#mkt-toggle-ema')?.checked ? 1.8 : 0,
            pointRadius: 0,
            tension: 0.16,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode:'index', intersect:false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#090c10',
            borderColor: 'rgba(255,255,255,0.14)',
            borderWidth: 1,
            titleColor: '#ffffff',
            bodyColor: '#d1d5db',
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${format(ctx.parsed.y)}`
            }
          }
        },
        scales: {
          x: {
            ticks: { color:'rgba(255,255,255,0.56)', maxTicksLimit: 7, autoSkip: true },
            grid: { color:'rgba(255,255,255,0.05)' }
          },
          y: {
            ticks: {
              color:'rgba(255,255,255,0.62)',
              callback: (value)=> format(Number(value||0))
            },
            grid: { color:'rgba(255,255,255,0.06)' }
          }
        }
      }
    });
  }

  function renderChart(hist, ind){
    const meta = $('#mkt-chart-meta');
    const overviewMeta = $('#mkt-overview-meta');
    if(!hist || hist.length < 2){
      if(meta) meta.textContent = 'Pas assez de points historiques.';
      if(overviewMeta) overviewMeta.textContent = 'Pas assez de points pour afficher une tendance lisible.';
      destroyMarketCharts();
      return;
    }

    let filtered = filterHistoryByRange(hist);
    filtered = downsampleHistory(filtered, activeRange === '15m' ? 90 : 180);
    const prices = filtered.map(x=>Number(x.price||0));
    const labels = makeLabels(filtered);
    const low = Math.min(...prices);
    const high = Math.max(...prices);
    const deltaPct = prices[0] ? ((prices[prices.length-1] - prices[0]) / prices[0]) * 100 : null;
    const trendText = deltaPct === null ? '—' : (deltaPct > 1.2 ? 'Hausse nette' : deltaPct < -1.2 ? 'Baisse nette' : 'Zone stable');
    const period = Math.min(20, Math.max(3, Math.floor(prices.length / 4)));
    const sma20Series = rollingSmaSeries(prices, period);
    const ema20Series = rollingEmaSeries(prices, period);

    destroyMarketCharts();
    marketOverviewChart = createMarketChart($('#mkt-overview-chart'), labels, prices, sma20Series, ema20Series);
    marketProChart = createMarketChart($('#mkt-chart-canvas'), labels, prices, sma20Series, ema20Series);

    if($('#mkt-window-trend')) $('#mkt-window-trend').textContent = trendText;
    if($('#mkt-window-change')){
      $('#mkt-window-change').textContent = deltaPct === null ? '—' : pct(deltaPct);
      $('#mkt-window-change').className = deltaPct === null ? '' : colorClass(deltaPct);
    }
    if($('#mkt-window-range')) $('#mkt-window-range').textContent = `${format(low)} → ${format(high)}`;
    if($('#mkt-window-points')) $('#mkt-window-points').textContent = String(filtered.length);

    const rangeLabelMap = { '15m':'15 minutes', '1h':'1 heure', '6h':'6 heures', '24h':'24 heures', '7d':'7 jours', 'all':'historique complet' };
    const metaText = `Fenêtre: ${rangeLabelMap[activeRange] || activeRange} · Points: ${filtered.length} · Min: ${format(low)} · Max: ${format(high)} · Dernier: ${format(prices[prices.length-1])}`;
    if(meta) meta.textContent = metaText;
    if(overviewMeta) overviewMeta.textContent = `Lecture ${trendText.toLowerCase()} · variation ${deltaPct===null?'—':pct(deltaPct)} · actualisé automatiquement.`;
  }

  async function trade(side){
    const login = selected;
    if(!login) return;
    const amount = Number($('#mkt-amount').value || 0);
    if(!amount || amount<=0) return;

    const path = side === 'buy' ? '/api/fantasy/invest' : '/api/fantasy/sell';
        const bill = await fetchBilling();
    if(String(bill.plan||'free').toLowerCase()==='free' && Number(bill.credits||0)<=0){ goPricing(); return; }

    await fetch(path, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ user: ($('#mkt-user')?.value || 'Anon'), streamer: login, amount })
    }).catch(()=>{});

    // refresh selected and watchlist
        await refreshSelected();
    await refreshWatchlist();
    try{ window.loadBillingMe && window.loadBillingMe(); }catch(_){ }
  }

  function setTab(name){
    tabs.forEach(b=>{
      const on = b.dataset.tab === name;
      b.classList.toggle('bg-white/10', on);
      b.classList.toggle('bg-white/5', !on);
      b.classList.toggle('font-bold', on);
    });
    views.forEach(v=>{
      v.classList.add('hidden');
    });
    const el = $('#mkt-tab-' + name);
    if(el) el.classList.remove('hidden');
  }

  function renderHeatmap(items, horizonSec){
    const wrap = $('#mkt-heat');
    if(!wrap) return;
    wrap.innerHTML = '';
    items.slice(0, 12).forEach(it=>{
      const p = it['p'+horizonSec] ?? it.pct;
      const cls = p>0 ? 'bg-[#00ff881f] border-[#00ff8833]' : (p<0 ? 'bg-[#ff4d6d1f] border-[#ff4d6d33]' : 'bg-white/5 border-white/10');
      const tcls = p>0 ? 'text-[#00ff88]' : (p<0 ? 'text-[#ff4d6d]' : 'text-white/70');
      const div = document.createElement('button');
      div.className = `text-left rounded-xl border ${cls} p-3 hover:bg-white/10 transition`;
      div.innerHTML = `<div class="text-xs text-white/60">${it.login.toUpperCase()}</div>
                       <div class="text-lg font-extrabold ${tcls}">${pct(p)}</div>`;
      div.onclick = ()=>{ setSelected(it.login); refreshSelected(); };
      wrap.appendChild(div);
    });
  }

  function renderGainersLosers(rows){
    const gain = $('#mkt-gainers');
    const lose = $('#mkt-losers');
    if(!gain || !lose) return;
    const g = [...rows].sort((a,b)=>(b.pct??-1e9)-(a.pct??-1e9)).slice(0,5);
    const l = [...rows].sort((a,b)=>(a.pct??1e9)-(b.pct??1e9)).slice(0,5);

    gain.innerHTML = g.map(x=>`<div class="${colorClass(x.pct)} font-bold">${x.login.toUpperCase()} <span class="text-white/60 font-normal">${pct(x.pct)}</span></div>`).join('') || '<div class="text-white/60">—</div>';
    lose.innerHTML = l.map(x=>`<div class="${colorClass(x.pct)} font-bold">${x.login.toUpperCase()} <span class="text-white/60 font-normal">${pct(x.pct)}</span></div>`).join('') || '<div class="text-white/60">—</div>';
  }

  async function refreshSelected(){
    const login = selected || watchlist[0];
    if(!login) return;

    setSelected(login);
    const mkt = await fetchMarket(login);
    updateOverview(mkt);
  }

  async function refreshWatchlist(){
    // fetch all tickers (limited concurrency)
    const list = watchlist.slice(0, 30);
    const results = [];
    const horizon = Number($('#mkt-horizon')?.value || 3600);
    const workers = 4;
    let idx=0;

    async function worker(){
      while(idx < list.length){
        const i = idx++;
        const login = list[i];
        const mkt = await fetchMarket(login);
        if(!mkt) continue;

        const hist = (mkt.history || []).map(x=>({ts:Number(x.ts||0), price:Number(x.price||0)})).filter(x=>x.ts && x.price);
        const market = mkt.market || {};
        const price = Number(market.price ?? NaN);
        const shares = Number(market.sharesOutstanding ?? NaN);
        const mcap = (Number.isFinite(price) && Number.isFinite(shares)) ? price*shares : null;

        const p1h = computePerf(hist, 3600);
        const p6h = computePerf(hist, 21600);
        const p7d = computePerf(hist, 604800);

        const rets = computeReturns(hist);
        const vol = std(rets);
        const tscore = trendScore(p1h, p6h, p7d, vol);

        const prices = hist.map(x=>x.price);
        const spark = prices.slice(-24);

        const pctH = computePerf(hist, horizon);
        results.push({
          login,
          price: Number.isFinite(price)?price:null,
          p1h, p6h, p7d,
          vol,
          mcap,
          trend: tscore,
          pct: pctH,
          spark
        });
      }
    }

    await Promise.allSettled(Array.from({length:workers}, worker));

    // heatmap + gainers/losers (based on selected horizon)
    renderHeatmap(results.map(x=>({login:x.login, pct:x.pct, ['p'+horizon]:x.pct})), horizon);
    renderGainersLosers(results);

    // table
    renderMarketsTable(results);
  }

  function renderMarketsTable(rows){
    const sort = $('#mkt-sort')?.value || 'trend';
    const list = [...rows];

    const keyMap = {
      trend: x=>x.trend ?? -1e9,
      p1h: x=>x.p1h ?? -1e9,
      p6h: x=>x.p6h ?? -1e9,
      p7d: x=>x.p7d ?? -1e9,
      mcap: x=>x.mcap ?? -1e9,
      vol: x=>x.vol ?? -1e9
    };
    const keyFn = keyMap[sort] || keyMap.trend;
    list.sort((a,b)=> (keyFn(b)-keyFn(a)));

    const tbody = $('#mkt-table');
    if(!tbody) return;
    tbody.innerHTML = '';
    list.forEach((r, i)=>{
      const tr = document.createElement('tr');
      tr.className = 'border-t border-white/10 hover:bg-white/5 cursor-pointer';
      tr.innerHTML = `
        <td class="py-2 text-white/60">${i+1}</td>
        <td class="py-2 font-bold">${r.login.toUpperCase()}</td>
        <td class="py-2 text-right font-bold">${r.price===null?'—':format(r.price)}</td>
        <td class="py-2 text-right ${colorClass(r.p1h)} font-bold">${r.p1h===null?'—':pct(r.p1h)}</td>
        <td class="py-2 text-right ${colorClass(r.p6h)} font-bold">${r.p6h===null?'—':pct(r.p6h)}</td>
        <td class="py-2 text-right ${colorClass(r.p7d)} font-bold">${r.p7d===null?'—':pct(r.p7d)}</td>
        <td class="py-2 text-right text-white/80">${r.vol===null?'—':(Math.round(r.vol*10000)/100)}</td>
        <td class="py-2 text-right text-white/80">${r.mcap===null?'—':format(r.mcap)}</td>
        <td class="py-2 text-right font-bold">${r.trend??'—'}</td>
        <td class="py-2 text-right">${sparklineSvg(r.spark || [])}</td>
      `;
      tr.onclick = ()=>{ setSelected(r.login); setTab('overview'); refreshSelected(); };
      tbody.appendChild(tr);
    });
  }

  async function refreshPortfolio(){
    const user = ($('#mkt-user')?.value || 'Anon').trim() || 'Anon';
    const prof = await fetchProfile(user);
    if(!prof){
      $('#pf-cash').textContent = '—';
      return;
    }
        const bill = await fetchBilling();
    const cash = Number(bill.credits||0);
    const holds = prof.holdings || [];
    const holdValue = holds.reduce((s,h)=>s+Number(h.value||0),0);
    const net = cash + holdValue;

    $('#pf-cash').textContent = format(cash);
    $('#pf-hold').textContent = format(holdValue);
    $('#pf-net').textContent = format(net);
    $('#pf-n').textContent = String(holds.length);

    const tbody = $('#pf-table');
    tbody.innerHTML = holds.map(h=>`
      <tr class="border-t border-white/10 hover:bg-white/5 cursor-pointer" onclick="window.__mktSelect && window.__mktSelect('${String(h.login).toLowerCase()}')">
        <td class="py-2 font-bold">${String(h.login||'').toUpperCase()}</td>
        <td class="py-2 text-right">${format(h.shares||0)}</td>
        <td class="py-2 text-right">${format(h.price||0)}</td>
        <td class="py-2 text-right font-bold">${format(h.value||0)}</td>
      </tr>
    `).join('') || '<tr><td class="py-2 text-white/60" colspan="4">Aucune position</td></tr>';
  }

  async function refreshLeaderboard(){
    const lb = await fetchLeaderboard();
    const wrap = $('#lb-list');
    if(!wrap) return;
    wrap.innerHTML = (lb||[]).slice(0,20).map((x,i)=>`
      <div class="flex items-center justify-between border-b border-white/10 py-2">
        <div class="font-bold">${i+1}. ${String(x.user||'').toUpperCase()}</div>
        <div class="text-white/80">${format(x.netWorth||0)}</div>
      </div>
    `).join('') || '<div class="text-white/60">—</div>';
  }

  // --- Events ---
  function wire(){
    // Tabs
    tabs.forEach(b=>{
      b.addEventListener('click', ()=>{
        setTab(b.dataset.tab);
      });
    });

    $('#mkt-refresh').addEventListener('click', async ()=>{
      await refreshSelected();
      await refreshWatchlist();
      if($('#mkt-tab-portfolio') && !$('#mkt-tab-portfolio').classList.contains('hidden')) await refreshPortfolio();
    });

    $('#mkt-auto').addEventListener('click', ()=>{
      autoOn = !autoOn;
      $('#mkt-auto').textContent = 'Auto: ' + (autoOn?'ON':'OFF');
      if(autoOn) startAuto();
      else stopAuto();
    });

    $('#mkt-buy').addEventListener('click', ()=>trade('buy'));
    $('#mkt-sell').addEventListener('click', ()=>trade('sell'));

    $('#mkt-horizon').addEventListener('change', ()=>refreshWatchlist());
    $('#mkt-sort').addEventListener('change', ()=>refreshWatchlist());
    $('#mkt-reload-watch').addEventListener('click', ()=>refreshWatchlist());

    $('#mkt-load-portfolio').addEventListener('click', ()=>refreshPortfolio());
    $('#mkt-load-leader').addEventListener('click', ()=>refreshLeaderboard());

    $('#mkt-edit').addEventListener('click', ()=>{
      $('#mkt-edit-modal').classList.remove('hidden');
      $('#mkt-watchlist').value = watchlist.join(', ');
    });
    $('#mkt-save-watchlist').addEventListener('click', ()=>{
      const raw = $('#mkt-watchlist').value || '';
      const arr = raw.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
      watchlist = Array.from(new Set(arr)).slice(0, 40);
      localStorage.setItem(LS_KEY, JSON.stringify(watchlist));
      $('#mkt-edit-modal').classList.add('hidden');
      if(!watchlist.includes(selected)) setSelected(watchlist[0]);
      refreshSelected();
      refreshWatchlist();
    });

    $('#mkt-add').addEventListener('click', ()=>{
      const q = ($('#mkt-search').value || '').trim().toLowerCase();
      if(!q) return;
      if(!watchlist.includes(q)){
        watchlist.unshift(q);
        watchlist = Array.from(new Set(watchlist)).slice(0, 40);
        localStorage.setItem(LS_KEY, JSON.stringify(watchlist));
      }
      setSelected(q);
      refreshSelected();
      refreshWatchlist();
      $('#mkt-search').value = '';
    });

    $('#mkt-search').addEventListener('keydown', (e)=>{
      if(e.key === 'Enter') $('#mkt-add').click();
    });

    // chart toggles
    $('#mkt-toggle-sma').addEventListener('change', ()=>refreshSelected());
    $('#mkt-toggle-ema').addEventListener('change', ()=>refreshSelected());
    $$('.mkt-range-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        activeRange = btn.dataset.range || '15m';
        updateRangeButtons();
        refreshSelected();
      });
    });

    // expose select for portfolio table onclick
    window.__mktSelect = (login)=>{ setSelected(login); setTab('overview'); refreshSelected(); };
  }

  function startAuto(){
    stopAuto();
    autoTimer = setInterval(async ()=>{
      if(!overlay || overlay.classList.contains('hidden')) return;
      await refreshSelected();
      await refreshWatchlist();
    }, 12000);
  }
  function stopAuto(){
    if(autoTimer) clearInterval(autoTimer);
    autoTimer = null;
  }

  // Override the existing refreshMarketAll called by openMarketOverlay()
  window.refreshMarketAll = async function(){
        await refreshSelected();
    await refreshWatchlist();
    try{ window.loadBillingMe && window.loadBillingMe(); }catch(_){ }
  };

  // Improve open/close to lock scroll and hide auxiliary buttons
  const _open = window.openMarketOverlay;
  const _close = window.closeMarketOverlay;
  window.openMarketOverlay = async function(mode){
    // Twitch login is mandatory for Market
    if(!window.currentUser && !window.currentUserIsAdmin){
      alert('Connexion Twitch obligatoire pour utiliser le Marché.');
      try{ window.startAuth && window.startAuth(); }catch(e){}
      return;
    }


    // Access gate: only admin / paid plan / explicit market unlock / existing holdings.
    // Mere credits are not enough to open the Marché.
    let allowed = null;
    try{
      const r2 = await fetch('/api/market/access', { cache:'no-store', credentials:'include' });
      if(r2.ok){
        const j2 = await r2.json();
        allowed = !!j2?.allowed;
      }
    }catch(_){ allowed = null; }

    if(allowed === false){
      try{ alert('Le Marché est verrouillé pour ce compte. Débloque-le depuis la page Tarifs ou avec l’accès prévu.'); }catch(_){ }
      try{ window.location.href = '/pricing'; }catch(_){ }
      return;
    }
    if(_open){
      try{ _open(mode); }catch(_){ _open(); }
      setBodyModal(true);
      setAuxUiHidden(true);
      if(!selected) setSelected(watchlist[0]);
      refreshSelected();
      refreshWatchlist();
      return;
    }

    // Fallback: scroll to embedded portfolio widget if overlay isn't available
    const dash = document.getElementById('fantasyDashboard');
    if(dash){
      dash.scrollIntoView({ behavior:'smooth', block:'start' });
      return;
    }
console.warn('Market overlay fallback unavailable.');
  };
  window.closeMarketOverlay = function(){
    if(_close) _close();
    setBodyModal(false);
    setAuxUiHidden(false);
  };

  // --- Chat height lock to player ---
  function lockSidePanelToPlayer(){
    const player = document.getElementById('twitch-embed') || document.querySelector('#player, #playerCol, #playerCol iframe, .player-shell, .twitch-player');
    const side = document.getElementById('side-panel') || document.querySelector('#side-panel, #sidePanel, #right-panel, #sideCol');
    if(!player || !side) return;

    const getRect = (el)=>{
      const r = el.getBoundingClientRect();
      return { h: Math.max(240, Math.floor(r.height)) };
    };

    const apply = ()=>{
      const h = getRect(player).h;
      side.style.height = h + 'px';
      side.style.maxHeight = h + 'px';
      side.style.overflow = 'hidden';
      // ensure inner scroll panels scroll
      const inner = side.querySelector('.tab-content, .panel, .side-content, .right-tabs-content, [data-side-scroll]') || side;
      if(inner) inner.style.overflow = 'auto';
    };

    apply();
    try{
      const ro = new ResizeObserver(()=>apply());
      ro.observe(player);
      window.addEventListener('resize', apply);
    }catch(_){
      window.addEventListener('resize', apply);
      setInterval(apply, 1200);
    }
  }

  async function init(){
    wire();
    await bootstrapWatchlistFromFirebase();

    const savedSel = localStorage.getItem(LS_SEL);
    if(savedSel && watchlist.includes(savedSel)) selected = savedSel;
    if(!selected) selected = watchlist[0];

    setSelected(selected);
    updateRangeButtons();

    // allow market open without errors
    lockSidePanelToPlayer();

    // If overlay already open
    if(overlay && !overlay.classList.contains('hidden')){
      setBodyModal(true);
      setAuxUiHidden(true);
      await refreshSelected();
      await refreshWatchlist();
    }

    // start auto by default
    startAuto();
  }

  init();

})();


  window.openStreamerMarket = function(){
    try{
      if(typeof window.openMarketOverlay === 'function') return window.openMarketOverlay('markets');
    }catch(e){ console.error('openStreamerMarket', e); }
  };

  window.openStreamerPortfolio = function(){
    try{
      if(typeof window.openMarketOverlay === 'function'){
        window.openMarketOverlay('portfolio');
        setTimeout(()=>{
          const tab = document.querySelector('#market-overlay .mkt-tab[data-tab="portfolio"]');
          if(tab) tab.click();
        }, 100);
        return;
      }
    }catch(e){ console.error('openStreamerPortfolio', e); }
  };

  document.addEventListener('click', (e)=>{
    const marketBtn = e.target.closest('#header-market-btn, #open-market-from-menu, [data-open-market="1"]');
    if(marketBtn){
      e.preventDefault();
      window.openStreamerMarket && window.openStreamerMarket();
      return;
    }
    const pfBtn = e.target.closest('#goto-portfolio, [data-open-portfolio="1"]');
    if(pfBtn){
      e.preventDefault();
      window.openStreamerPortfolio && window.openStreamerPortfolio();
      return;
    }
  }, true);
