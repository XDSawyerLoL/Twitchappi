/* SWAPP account navigation: one entry to the unified account workspace.
 * Editorial, shop and Fair Discovery live inside /compte, under the existing
 * server-side admin authorization. Never duplicate these links in the menu.
 */
(()=>{
 'use strict';
 const menu=document.getElementById('userMenu');
 if(!menu)return;
 const deprecated='[data-my-games-menu],[data-swapp-editor-link],[data-swapp-shop-admin-link],[data-swapp-fair-admin-link]';
 const clean=()=>{
  for(const item of menu.querySelectorAll(deprecated))item.remove();
 };
 const observer=new MutationObserver(clean);
 observer.observe(menu,{childList:true});
 clean();
})();