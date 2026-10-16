/* Page accent picker: a compact SOCIAL control in its navigation, unchanged Boutique layout. */
(()=>{
'use strict';
const LEGACY_KEY='swapp-page-accent-v1';
const colors=[['Cyan','#22d3ee'],['Turquoise','#2dd4bf'],['Violet','#a78bfa'],['Rose','#f472b6'],['Orange','#fb923c'],['Bleu','#60a5fa'],['Vert','#a3e635']];
const valid=v=>colors.some(([,hex])=>hex===v);
const social=document.querySelector('.swapp-social-viewport');
const store=!social&&document.querySelector('.swapp-store-topline');
if(!social&&!store)return;
const KEY=social?'swapp-social-accent-v1':'swapp-store-accent-v1';
const root=document.documentElement;
const apply=hex=>{
 if(hex!=='auto'&&!valid(hex))return;
 if(hex==='auto'){
  root.style.removeProperty('--swapp-page-accent');
  document.body.style.removeProperty('--swapp-page-accent');
  root.style.removeProperty('--swapp-side-light');
 }else{
  root.style.setProperty('--swapp-page-accent',hex);
  document.body.style.setProperty('--swapp-page-accent',hex);
  root.style.setProperty('--swapp-side-light',hex);
 }
 root.dataset.swappPageColor=hex;
};
let chosen='auto';
try{
 const newChoice=localStorage.getItem(KEY);
 const legacy=localStorage.getItem(LEGACY_KEY);
 chosen=(newChoice==='auto'||valid(newChoice))?newChoice:(valid(legacy)?legacy:'auto');
}catch{}
apply(chosen);

const host=document.createElement('div');
host.className='swapp-page-appearance'+(social?' swapp-page-appearance--social':'');
const details=document.createElement('details');
const summary=document.createElement('summary');
const heading=document.createElement('span');
heading.className='swapp-appearance-heading';
if(social){
 const dot=document.createElement('span');dot.className='swapp-appearance-indicator';dot.setAttribute('aria-hidden','true');
 heading.append(dot);
}
const title=document.createElement('span');title.className='swapp-appearance-title';title.textContent=social?'Ambiance':'Couleur de la page';heading.append(title);
summary.append(heading);
summary.setAttribute('aria-label',social?'Personnaliser la couleur de SOCIAL':'Couleur de la page');
details.append(summary);
const field=document.createElement('div');
field.className='swapp-page-appearance-colors';
field.setAttribute('role','group');
field.setAttribute('aria-label',social?'Couleur d’ambiance SOCIAL':'Choix de la couleur');
const buttons=[];
const refresh=()=>buttons.forEach(({button,hex})=>{
 const selected=root.dataset.swappPageColor===hex;
 button.setAttribute('aria-pressed',String(selected));
 button.classList.toggle('is-active',selected);
});
const choose=hex=>{
 apply(hex);
 try{localStorage.setItem(KEY,hex)}catch{}
 refresh();
};
if(social){
 const auto=document.createElement('button');auto.type='button';auto.className='swapp-appearance-auto';
 auto.textContent='Auto';auto.setAttribute('aria-label','Ambiance automatique');
 auto.addEventListener('click',()=>choose('auto'));
 field.append(auto);buttons.push({button:auto,hex:'auto'});
}
for(const [name,hex] of colors){
 const button=document.createElement('button');button.type='button';
 button.className='swapp-appearance-swatch';
 button.style.setProperty('--color-chip',hex);
 button.setAttribute('aria-label',name);
 button.title=name;
 button.addEventListener('click',()=>choose(hex));
 field.append(button);buttons.push({button,hex});
}
refresh();
details.append(field);
host.append(details);

if(social){
 const sidebar=social.querySelector('.pulse-sidebar');
 const topbar=social.querySelector('.pulse-topbar');
 if(!sidebar||!topbar)return;
 const mobile=window.matchMedia('(max-width: 650px), (max-width: 920px) and (orientation: portrait)');
 const collapsed=window.matchMedia('(min-width: 651px) and (max-width: 1200px)');
 const mount=()=>{
  const target=mobile.matches?topbar:sidebar;
  if(host.parentElement!==target){
   target.append(host);
   details.open=!mobile.matches&&!collapsed.matches;
  }
  host.classList.toggle('is-compact',!mobile.matches&&collapsed.matches);
 };
 mount();
 if(mobile.addEventListener)mobile.addEventListener('change',mount);
 else if(mobile.addListener)mobile.addListener(mount);
 if(collapsed.addEventListener)collapsed.addEventListener('change',mount);
 else if(collapsed.addListener)collapsed.addListener(mount);
 document.addEventListener('pointerdown',event=>{
  if(!host.contains(event.target)&&mobile.matches)details.open=false;
 });
}else{
 store.insertAdjacentElement('afterend',host);
}
})();