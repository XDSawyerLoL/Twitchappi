/* HARD FIX DOM: ensure side-panel is a direct child of #main-layout (prevents it from dropping under the player) */
(function(){
  function ensureSidePanel(){
    var layout = document.getElementById('main-layout');
    var side = document.getElementById('side-panel');
    if(!layout || !side) return;
    if(side.parentElement !== layout){
      layout.appendChild(side);
    }
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', ensureSidePanel);
  } else {
    ensureSidePanel();
  }
  window.addEventListener('resize', function(){ setTimeout(ensureSidePanel, 50); });
})();
