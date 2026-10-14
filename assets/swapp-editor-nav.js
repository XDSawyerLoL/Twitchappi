/* Public SWAPP navigation; no editor controls for unauthorized visitors. */
(()=>{'use strict';
const editor=document.querySelector('.editor-only-nav');
if(!editor)return;
fetch('/api/editor/actus/access',{credentials:'same-origin',headers:{Accept:'application/json'},signal:AbortSignal.timeout(6500)})
  .then(r=>r.ok?r.json():null)
  .then(data=>{if(data?.canEdit){editor.hidden=false;editor.style.display='inline-flex';}})
  .catch(()=>{editor.hidden=true;});
})();