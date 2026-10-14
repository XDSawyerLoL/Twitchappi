/* Shared SWAPP session display: account button and dropdown on editorial pages. */
(() => {
  'use strict';
  const button=document.getElementById('userBtn');
  const menu=document.getElementById('userMenu');
  const label=document.getElementById('userLabel');
  const avatar=document.getElementById('userAvatar');
  if(!document.querySelector('.top .userArea')||!button||!menu)return;
  // The SPA already manages its own authenticated account dropdown.
  if(!document.querySelector('.swapp-editorial-route'))return;
  function close(){menu.classList.remove('open');button.setAttribute('aria-expanded','false')}
  button.addEventListener('click',()=>{
    const next=!menu.classList.contains('open');
    menu.classList.toggle('open',next);button.setAttribute('aria-expanded',String(next));
  });
  document.addEventListener('click',e=>{if(!e.target.closest('.userArea'))close()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
  fetch('/api/oryon/session',{method:'GET',credentials:'same-origin',cache:'no-store',
    headers:{Accept:'application/json'},signal:AbortSignal.timeout(6000)})
    .then(r=>r.ok?r.json():null)
    .then(data=>{
      if(!data?.success)return;
      const user=data.local||data.twitch;
      if(!user)return;
      if(label)label.textContent=String(user.display_name||user.login||'Compte').slice(0,40);
      const src=user.avatar_url||user.profile_image_url;
      if(avatar && typeof src==='string'){
        try{const u=new URL(src);if(u.protocol==='https:')avatar.src=u.href;}catch(_){}
      }
    }).catch(()=>{});
})();