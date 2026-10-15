/* Reorganize the actual SWAPP account menu without replacing its authenticated actions. */
(()=>{'use strict';
 const menu=document.getElementById('userMenu');
 const trigger=document.getElementById('userBtn');
 if(!menu||!trigger)return;
 let scheduled=false,appearanceOpened=false,tastesOpened=false;
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
  // A collapsed control inside the existing account menu, never a new page block.
  const tastes=window.SwappLocalTastes;
  if(tastes){
   const local=document.createElement('details');
   local.className='swapp-account-tastes';
   local.open=tastesOpened;
   const label=document.createElement('summary');
   label.textContent='Recommandations locales';
   const help=document.createElement('p');
   help.textContent='Seuls les jeux que tu choisis sont conservés sur cet appareil, 30 jours maximum. Aucun historique envoyé au serveur.';
   const controls=document.createElement('div');
   controls.className='swapp-account-tastes-actions';
   const toggle=document.createElement('button'),clear=document.createElement('button');
   for(const btn of [toggle,clear])btn.type='button';
   const refresh=()=>{
    const enabled=tastes.isEnabled();
    toggle.textContent=enabled?'Désactiver':'Activer';
    toggle.setAttribute('aria-pressed',String(enabled));
    toggle.setAttribute('aria-label',enabled?'Désactiver la personnalisation locale':'Activer la personnalisation locale');
    clear.disabled=!enabled;
   };
   toggle.addEventListener('click',event=>{
    event.stopPropagation();
    tastes.setEnabled(!tastes.isEnabled());
    refresh();
    window.dispatchEvent(new Event('swapp:local-tastes-changed'));
   });
   clear.textContent='Effacer mes préférences';
   clear.addEventListener('click',event=>{
    event.stopPropagation();
    tastes.clear();
    clear.textContent='Préférences effacées';
    window.dispatchEvent(new Event('swapp:local-tastes-changed'));
   });
   refresh();
   controls.append(toggle,clear);
   local.append(label,help,controls);
   local.addEventListener('toggle',()=>{tastesOpened=local.open});
   menu.append(local);
  }
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
 trigger.addEventListener('click',()=>{
  queueMicrotask(()=>{
   enhance();
   trigger.setAttribute('aria-expanded',String(menu.classList.contains('open')));
  });
 });
 // Existing inline handlers execute before bubbling: close after selecting an action.
 menu.addEventListener('click',event=>{
  const action=event.target.closest('button,a');
  if(!action||action.closest('.topThemeColors,.themeMenuRow'))return;
  menu.classList.remove('open');
  trigger.setAttribute('aria-expanded','false');
 });
 document.addEventListener('click',event=>{
  if(!event.target.closest('.userArea')&&!menu.classList.contains('open')){
   trigger.setAttribute('aria-expanded','false');
  }
 });
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&menu.classList.contains('open')){
   menu.classList.remove('open');
   trigger.setAttribute('aria-expanded','false');
   trigger.focus();
  }
 });
})();