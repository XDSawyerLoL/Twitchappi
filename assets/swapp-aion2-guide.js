'use strict';
/* Local-only optional progression; no remote tracking or analytics. */
(function(){
 const buttons=[...document.querySelectorAll('[data-ag-filter]')];
 const cards=[...document.querySelectorAll('[data-ag-role]')];
 for(const b of buttons)b.addEventListener('click',()=>{
  const choice=b.getAttribute('data-ag-filter');
  buttons.forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
  cards.forEach(c=>{const role=c.getAttribute('data-ag-role')||'';c.hidden=choice!=='all'&&!((choice==='Soutien'&&/Soutien|Contrôle/.test(role))||role.includes(choice))});
 });
 const checks=[...document.querySelectorAll('[data-ag-task]')];
 if(!checks.length)return;
 const storageKey='swapp:aion2:academy-checklist:v1';
 let saved={};
 try{const s=JSON.parse(localStorage.getItem(storageKey)||'{}');if(s&&typeof s==='object'&&!Array.isArray(s))saved=s}catch(_){}
 const count=document.querySelector('[data-ag-progress-count]');
 const bar=document.querySelector('[data-ag-progress-bar]');
 const paint=()=>{
  let complete=0;
  checks.forEach(c=>{if(c.checked)complete++});
  if(count)count.textContent=complete+'/'+checks.length;
  if(bar)bar.style.width=(complete/checks.length*100)+'%';
 };
 checks.forEach(c=>{
  const id=c.getAttribute('data-ag-task');
  c.checked=saved[id]===true;
  c.addEventListener('change',()=>{
   saved[id]=Boolean(c.checked);
   try{localStorage.setItem(storageKey,JSON.stringify(saved))}catch(_){}
   paint();
  });
 });
 paint();
})();