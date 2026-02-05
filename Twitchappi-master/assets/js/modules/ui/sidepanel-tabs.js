(function(){
  function ensureViewport(){
    const side = document.getElementById('side-panel');
    if(!side) return null;

    let viewport = document.getElementById('tabs-viewport');
    if(!viewport){
      viewport = document.createElement('div');
      viewport.id = 'tabs-viewport';

      // Place viewport right after the tab-nav
      const nav = side.querySelector('.tab-nav');
      if(nav && nav.nextSibling){
        side.insertBefore(viewport, nav.nextSibling);
      }else{
        side.appendChild(viewport);
      }
    }
    return viewport;
  }

  function movePanelsIntoViewport(){
    const viewport = ensureViewport();
    if(!viewport) return;

    const chat = document.getElementById('tab-chat');
    const stats = document.getElementById('tab-stats');
    const tools = document.getElementById('tab-tools');

    // Move (append) panels into viewport so they cannot stack under each other
    [chat, stats, tools].forEach(el => {
      if(el && el.parentElement !== viewport){
        viewport.appendChild(el);
      }
    });

    // Normalise classes (they might exist already)
    viewport.querySelectorAll('.tab-content').forEach(p => {
      p.classList.remove('active');
    });
    if(chat) chat.classList.add('active');
  }

  // Hard exclusive tab switch
  window.openTab = function(ev, tabName){
    const viewport = document.getElementById('tabs-viewport') || ensureViewport();
    if(!viewport) return;

    // buttons
    const buttons = document.querySelectorAll('#side-panel .tab-nav .tab-btn');
    buttons.forEach(b => b.classList.remove('active'));
    if(ev && ev.currentTarget) ev.currentTarget.classList.add('active');
    else {
      // fallback: find button by onclick arg
      const btn = Array.from(buttons).find(b => (b.getAttribute('onclick')||'').includes(`'${tabName}'`));
      if(btn) btn.classList.add('active');
    }

    // panels
    viewport.querySelectorAll('.tab-content').forEach(p => p.classList.remove('active'));

    const id = tabName === 'chat' ? 'tab-chat' : (tabName === 'stats' ? 'tab-stats' : 'tab-tools');
    const panel = document.getElementById(id);
    if(panel) panel.classList.add('active');
  };

  // Keep right panel height synced to player
  function syncRightPanelHeight(){
    const side = document.getElementById('side-panel');
    const player =
      document.getElementById('player-wrapper') ||
      document.getElementById('player-container') ||
      document.getElementById('twitch-embed')?.parentElement ||
      document.querySelector('iframe[src*="twitch.tv"]')?.parentElement;

    if(!side || !player) return;
    const h = player.getBoundingClientRect().height;
    if(h && h > 50) side.style.height = Math.round(h) + 'px';
  }

  document.addEventListener('DOMContentLoaded', () => {
    movePanelsIntoViewport();
    syncRightPanelHeight();
    window.addEventListener('resize', syncRightPanelHeight);
    setInterval(syncRightPanelHeight, 500);

    // Ensure click handlers still work even if inline onclick was changed
    document.querySelectorAll('#side-panel .tab-nav .tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const oc = btn.getAttribute('onclick') || '';
        const m = oc.match(/openTab\(event,\s*'([^']+)'\)/);
        const tab = m ? m[1] : 'chat';
        window.openTab(e, tab);
      }, { passive:true });
    });
  });
})();
