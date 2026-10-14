/* Reorganize the actual SWAPP account menu without replacing its authenticated actions. */
(()=>{'use strict';
 const menu=document.getElementById('userMenu');
 const trigger=document.getElementById('userBtn');
 if(!menu||!trigger)return;
 let scheduled=false,appearanceOpened=false;
 function enhance(){
  scheduled=false;
  // renderUserMenu() replaces innerHTML repeatedly: enhance each fresh render.
  const panel=[...menu.children].find(node=>node.classList?.contains('topThemePanel')||node.classList?.contains('themeMenuBox'));
  if(!panel)return;
  const separator=panel.nextElementSibling;
  if(separator?.classList?.contains('sep'))separator.remove();
  const details=document.createElement('details');
  details.className='swapp-account-appearance';
  details.open=appearanceOpened;
  const summary=document.createElement('summary');
  summary.textContent='Apparence';
  details.append(summary,panel);
  details.addEventListener('toggle',()=>{appearanceOpened=details.open});
  menu.append(details);
  for(const color of panel.querySelectorAll('.topThemeColors button,.themeMenuRow button')){
   const value=color.style.backgroundColor||color.getAttribute('style')||'';
   color.type='button';
   color.setAttribute('aria-label','Choisir '+value);
   color.title='Choisir '+value;
  }
  const custom=panel.querySelector('input[type="color"]');
  if(custom)custom.setAttribute('aria-label','Couleur personnalisée');
  menu.classList.add('swapp-account-enhanced');
  menu.setAttribute('aria-label','Menu du compte SWAPP');
  trigger.setAttribute('aria-haspopup','true');
 }
 const observer=new MutationObserver(()=>{if(scheduled)return;scheduled=true;queueMicrotask(enhance)});
 observer.observe(menu,{childList:true});
 enhance();
 trigger.addEventListener('click',()=>{queueMicrotask(enhance)});
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&menu.classList.contains('open')){
   menu.classList.remove('open');
   trigger.setAttribute('aria-expanded','false');
   trigger.focus();
  }
 });
})();