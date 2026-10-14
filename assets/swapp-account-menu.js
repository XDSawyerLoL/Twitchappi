/* Progressive enhancement of the existing account dropdown: original actions stay functional. */
(()=>{'use strict';
 const menu=document.getElementById('userMenu'),button=document.getElementById('userBtn');
 if(!menu||!button)return;
 const colors=['#22c55e','#8b5cf6','#22d3ee','#ef4444','#f59e0b','#ffffff'];
 const isColor=el=>{if(el.tagName!=='BUTTON')return false;const style=el.getAttribute('style')||'';return /background(?:-color)?\s*:/i.test(style)||/#[a-f0-9]{3,8}/i.test(style)&&!el.textContent.trim()};
 let scheduled=false;
 function enhance(){
  scheduled=false;
  const heading=[...menu.querySelectorAll('h2,h3,h4,strong,b,div,span')].find(e=>e.children.length===0&&/couleur du site/i.test(e.textContent.trim()));
  if(!heading)return;
  const matches=[...menu.querySelectorAll('button')].filter(isColor);
  if(matches.length<3)return;
  let palette=menu.querySelector('.swapp-account-palette');
  if(!palette){palette=document.createElement('div');palette.className='swapp-account-palette';palette.setAttribute('role','group');palette.setAttribute('aria-label','Choisir la couleur du site');heading.insertAdjacentElement('afterend',palette)}
  for(const item of matches){if(item.parentElement===palette)continue;item.classList.add('swapp-account-swatch');item.title=item.getAttribute('aria-label')||'Changer la couleur du site';item.setAttribute('aria-label',item.title);palette.append(item)}
  menu.classList.add('swapp-account-enhanced');
 }
 const observer=new MutationObserver(()=>{if(scheduled)return;scheduled=true;queueMicrotask(enhance)});
 observer.observe(menu,{childList:true,subtree:true});
 enhance();
 button.addEventListener('click',()=>{if(menu.classList.contains('open'))queueMicrotask(enhance)});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu.classList.contains('open')){menu.classList.remove('open');button.setAttribute('aria-expanded','false');button.focus()}});
})();