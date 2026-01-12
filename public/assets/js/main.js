const scripts = [
  "/assets/js/core/app-bootstrap.js",
  "/assets/js/modules/player/ambilight-vibe.js",
  "/assets/js/modules/layout/sidepanel-dock-fix.js",
  "/assets/js/modules/market/market-overlay.js",
  "/assets/js/modules/ui/tabs-exclusive-patch.js",
  "/assets/js/modules/ui/help-tooltips.js"
];

function loadScript(src){
  return new Promise((resolve, reject)=>{
    const s=document.createElement("script");
    s.src=src;
    s.defer=true;
    s.onload=()=>resolve();
    s.onerror=(e)=>reject(new Error("Failed to load "+src));
    document.head.appendChild(s);
  });
}

(async ()=>{
  for (const src of scripts){
    try{ await loadScript(src); }
    catch(e){ console.error(e); }
  }
})();
