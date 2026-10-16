/* Unified visitor accent for Boutique and Communauté, local-only. */
(()=>{
'use strict';
const KEY='swapp-page-accent-v1';
const colors=[['Cyan','#22d3ee'],['Turquoise','#2dd4bf'],['Violet','#a78bfa'],['Rose','#f472b6'],['Orange','#fb923c'],['Bleu','#60a5fa'],['Vert','#a3e635']];
const valid=v=>colors.some(([,hex])=>hex===v);
const root=document.documentElement;
const apply=hex=>{if(!valid(hex))return;root.style.setProperty('--swapp-page-accent',hex);root.style.setProperty('--swapp-side-light',hex);root.dataset.swappPageColor=hex;};
try{const old=localStorage.getItem(KEY);if(valid(old))apply(old)}catch{}
const host=document.createElement('div');host.className='swapp-page-appearance';
const details=document.createElement('details');
const sum=document.createElement('summary');sum.textContent='Couleur de la page';details.append(sum);
const field=document.createElement('div');field.className='swapp-page-appearance-colors';
for(const [name,hex] of colors){
 const b=document.createElement('button');b.type='button';b.style.setProperty('--color-chip',hex);b.setAttribute('aria-label',name);b.title=name;
 const check=()=>b.setAttribute('aria-pressed',String(root.dataset.swappPageColor===hex));
 b.addEventListener('click',()=>{apply(hex);try{localStorage.setItem(KEY,hex)}catch{};field.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)))});
 field.append(b);check();
}
details.append(field);host.append(details);
const target=document.querySelector('.swapp-store-topline')||document.querySelector('.swapp-social-viewport');
if(target){if(target.matches('.swapp-store-topline'))target.insertAdjacentElement('afterend',host);else target.insertAdjacentElement('afterbegin',host)}
})();
