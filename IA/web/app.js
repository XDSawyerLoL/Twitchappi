const $ = (q) => document.querySelector(q);

// Navigation
for (const btn of document.querySelectorAll('nav button')) {
  btn.addEventListener('click', () => {
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const view = btn.dataset.view;
    document.querySelectorAll('section.panel').forEach(s => s.style.display = 'none');
    $('#view-' + view).style.display = 'block';
  });
}

function addMsg(who, text) {
  const box = $('#chatbox');
  const el = document.createElement('div');
  el.className = 'msg';
  el.innerHTML = `<div class="who">${who}</div><div class="bubble">${escapeHtml(text).replace(/\n/g,'<br/>')}</div>`;
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// Health
async function refreshHealth() {
  try {
    const r = await fetch('/api/health');
    const j = await r.json();
    $('#health').textContent = j.ok ? 'online' : 'offline';
  } catch {
    $('#health').textContent = 'offline';
  }
}
refreshHealth();
setInterval(refreshHealth, 5000);

// Chat (HTTP)
$('#chatSend').addEventListener('click', async () => {
  const msg = $('#chatInput').value.trim();
  if (!msg) return;
  $('#chatInput').value = '';
  addMsg('you', msg);

  try {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, mode: $('#chatMode').value })
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'error');
    addMsg('operator', j.reply);
  } catch (e) {
    addMsg('error', e.message || String(e));
  }
});

// Chat (WS)
let ws = null;
$('#chatConnect').addEventListener('click', () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
    ws = null;
    $('#chatConnect').textContent = 'WebSocket';
    addMsg('system', 'WebSocket disconnected');
    return;
  }

  ws = new WebSocket(`${location.origin.replace('http', 'ws')}/ws`);
  ws.onopen = () => {
    $('#chatConnect').textContent = 'Disconnect';
    addMsg('system', 'WebSocket connected');
  };
  ws.onmessage = (ev) => {
    const p = JSON.parse(ev.data);
    if (p.type === 'chat.reply') addMsg('operator', p.reply);
    if (p.type === 'chat.error') addMsg('error', p.error);
  };
  ws.onclose = () => {
    $('#chatConnect').textContent = 'WebSocket';
  };
});

// Ops
$('#btnPlan').addEventListener('click', async () => {
  const repo = $('#repo').value.trim();
  const task = $('#task').value.trim();
  const repoContext = $('#repoContext').value;
  if (!task) return;

  $('#opsOut').textContent = 'Generating plan…';
  try {
    const r = await fetch('/api/ops/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, repoContext, mode: $('#planMode').value })
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'error');
    $('#planJson').value = JSON.stringify(j.plan, null, 2);
    $('#opsOut').textContent = 'OK: plan generated.';
  } catch (e) {
    $('#opsOut').textContent = 'ERROR: ' + (e.message || String(e));
  }
});

$('#btnApply').addEventListener('click', async () => {
  const repo = $('#repo').value.trim();
  const baseBranch = $('#baseBranch').value.trim() || 'main';
  const openPR = $('#openPR').checked;

  let plan;
  try {
    plan = JSON.parse($('#planJson').value);
  } catch {
    $('#opsOut').textContent = 'ERROR: invalid plan JSON.';
    return;
  }

  $('#opsOut').textContent = 'Applying to GitHub…';
  try {
    const r = await fetch('/api/ops/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo, baseBranch, plan, openPR })
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'error');
    $('#opsOut').textContent = `OK\nbranch: ${j.branchName}\npr: ${j.prUrl || '(none)'}`;
  } catch (e) {
    $('#opsOut').textContent = 'ERROR: ' + (e.message || String(e));
  }
});

// Supervision
async function loadRuns() {
  const tbody = $('#runs');
  tbody.innerHTML = '';
  try {
    const r = await fetch('/api/supervision');
    const j = await r.json();
    for (const run of (j.runs || []).slice(0, 40)) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${new Date(run.startedAt).toLocaleString()}</td>
        <td>${run.type}</td>
        <td>${run.status}</td>
        <td>${run.durationMs ?? ''}ms</td>
        <td>${escapeHtml(run.error || run.output?.prUrl || run.output?.summary || '')}</td>
      `;
      tbody.appendChild(tr);
    }

    // Load settings into form
    if (j.settings) {
      $('#defaultRepo').value = j.settings.defaultRepo || '';
      $('#autopush').checked = !!j.settings.autopush;
      if (!$('#repo').value && j.settings.defaultRepo) $('#repo').value = j.settings.defaultRepo;
    }

  } catch (e) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="5">ERROR: ${escapeHtml(e.message || String(e))}</td>`;
    tbody.appendChild(tr);
  }
}
$('#refresh').addEventListener('click', loadRuns);
loadRuns();

// Settings
$('#saveSettings').addEventListener('click', async () => {
  try {
    const r = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        defaultRepo: $('#defaultRepo').value.trim(),
        autopush: $('#autopush').checked
      })
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'error');
    addMsg('system', 'Settings saved');
    loadRuns();
  } catch (e) {
    addMsg('error', e.message || String(e));
  }
});
