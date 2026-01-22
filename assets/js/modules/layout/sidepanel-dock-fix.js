/* HARD FIX DOM + LAYOUT:
   - Keep side-panel as child of #main-layout (but do NOT reorder it unnecessarily)
   - Force 2-column grid on desktop so chat stays to the RIGHT of the player
*/
(function(){
  function applyLayout(){
    var layout = document.getElementById('main-layout');
    var side = document.getElementById('side-panel');
    if(!layout || !side) return;

    // Ensure side-panel is inside main layout
    if(side.parentElement !== layout){
      try{ layout.appendChild(side); }catch(_){}
    }

    // If we have enough width, enforce 2-column grid (prevents chat from dropping below)
    var w = layout.getBoundingClientRect().width || window.innerWidth;
    if(w >= 980){
      layout.style.display = 'grid';
      layout.style.gridTemplateColumns = 'minmax(0,1fr) 420px';
      layout.style.gap = '16px';
      layout.style.alignItems = 'stretch';
      side.style.gridColumn = '2 / 3';
    }else{
      // let responsive CSS handle mobile
      layout.style.removeProperty('grid-template-columns');
      side.style.removeProperty('grid-column');
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', applyLayout);
  } else {
    applyLayout();
  }
  window.addEventListener('resize', function(){ setTimeout(applyLayout, 50); });
  // small safety tick (iframes sometimes report size late)
  setTimeout(applyLayout, 200);
  setTimeout(applyLayout, 800);
})();
