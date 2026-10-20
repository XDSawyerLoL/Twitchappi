(()=>{'use strict';
 const wrappers=document.querySelectorAll('.ag-deep');
 for(const parent of wrappers){
  const nav=parent.querySelector('[data-ag-playbook-tabs]');
  if(!nav)continue;
  const buttons=[...nav.querySelectorAll('[data-ag-panel-select]')];
  const panels=[...parent.querySelectorAll('[data-ag-panel]')];
  function show(name){
   buttons.forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.agPanelSelect===name)));
   panels.forEach(panel=>{panel.hidden=panel.dataset.agPanel!==name});
  }
  buttons.forEach(button=>button.addEventListener('click',()=>show(button.dataset.agPanelSelect)));
  show('pve');
 }
})();

/* Image loading fallback: hide broken external icons without leaving broken image glyphs. */
document.querySelectorAll('img[data-ag-skill-icon]').forEach(img=>{
 const fallback=()=>img.parentElement?.classList.add('ag-icon-failed');
 img.addEventListener('error',fallback,{once:true});
 if(img.complete&&!img.naturalWidth)fallback();
});
