/* SWAPP Storefront: accessible category filters and image gallery.
 * No analytics, session storage, checkout, remote APIs or tracking. */
(()=>{
 'use strict';
 const root=document.querySelector('.swapp-store');
 if(!root)return;
 const cardsRoot=document.getElementById('swapp-store-products');
 if(cardsRoot){
  const cards=[...cardsRoot.querySelectorAll('[data-shop-product]')];
  const buttons=[...root.querySelectorAll('[data-shop-filter]')];
  const targets=[...root.querySelectorAll('[data-shop-category-target]')];
  const search=document.getElementById('swapp-store-search');
  const sort=document.getElementById('swapp-store-sort');
  const count=document.getElementById('shop-result-count');
  const empty=document.getElementById('swapp-store-no-results');
  const reset=document.getElementById('swapp-store-reset');
  let kind='all';
  const normalize=text=>String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr').trim();
  function refresh(){
   const q=normalize(search?.value);
   let visible=0;
   const ordered=cards.slice();
   if(sort?.value==='az')ordered.sort((a,b)=>a.dataset.shopTitle.localeCompare(b.dataset.shopTitle,'fr'));
   if(sort?.value==='za')ordered.sort((a,b)=>b.dataset.shopTitle.localeCompare(a.dataset.shopTitle,'fr'));
   const fragment=document.createDocumentFragment();
   for(const card of ordered){
    const matches=(kind==='all'||card.dataset.shopKind===kind)&&normalize(card.dataset.shopTitle).includes(q);
    card.hidden=!matches;
    if(matches)visible++;
    fragment.appendChild(card);
   }
   cardsRoot.appendChild(fragment);
   for(const b of buttons){
    const active=b.dataset.shopFilter===kind;
    b.setAttribute('aria-pressed',String(active));
    b.classList.toggle('is-active',active);
   }
   if(count)count.textContent=visible+' résultat'+(visible!==1?'s':'');
   if(empty)empty.hidden=visible!==0;
  }
  buttons.forEach(button=>button.addEventListener('click',()=>{
   kind=button.dataset.shopFilter||'all';refresh();
  }));
  targets.forEach(a=>a.addEventListener('click',()=>{
   kind=a.dataset.shopCategoryTarget||'all';
   if(search)search.value='';
   refresh();
  }));
  search?.addEventListener('input',refresh);
  sort?.addEventListener('change',refresh);
  reset?.addEventListener('click',()=>{
   kind='all';if(search)search.value='';if(sort)sort.value='featured';
   refresh();search?.focus();
  });
  refresh();
 }
 const main=document.getElementById('swapp-store-main-image');
 const thumbnails=[...document.querySelectorAll('[data-shop-image]')];
 if(main&&thumbnails.length){
  thumbnails.forEach(button=>button.addEventListener('click',()=>{
   const image=button.dataset.shopImage||'';
   if(!/^https:\/\//i.test(image))return;
   main.src=image;
   thumbnails.forEach(x=>x.setAttribute('aria-pressed',String(x===button)));
  }));
 }
})();
