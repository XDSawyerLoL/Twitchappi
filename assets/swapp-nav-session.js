/* Account and appearance controls for server-rendered SWAPP pages.
 * The SPA owns its own account renderer; do not bind native handlers there.
 * A single localStorage key is shared with the SPA and editorial pages.
 */
(()=>{
 'use strict';
 const button=document.getElementById('userBtn');
 const menu=document.getElementById('userMenu');
 const label=document.getElementById('userLabel');
 const avatar=document.getElementById('userAvatar');
 if(!document.querySelector('body.swapp-editorial-route .top .userArea')||!button||!menu)return;
 const KEY='oryon_viewer_accent';
 const DEFAULT='#22d3ee';
 const colors=[['Cyan','#22d3ee'],['Turquoise','#2dd4bf'],['Violet','#a78bfa'],['Rose','#f472b6'],['Orange','#fb923c'],['Bleu','#60a5fa'],['Vert','#a3e635']];
 const root=document.documentElement;
 let signedIn=false,chosen=DEFAULT;
 const safeColor=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
 const getSaved=()=>{try{const value=localStorage.getItem(KEY);return safeColor(value)?value:DEFAULT}catch{return DEFAULT}};
 function applyAccent(value){
  if(!safeColor(value))return;
  chosen=value;
  for(const property of ['--swapp-page-accent','--swapp-side-light','--swapp-light-accent','--scl-accent'])
   root.style.setProperty(property,value);
  root.classList.add('swapp-editorial-theme');
  for(const choice of menu.querySelectorAll('[data-swapp-accent]')){
   const active=choice.dataset.swappAccent.toLowerCase()===value.toLowerCase();
   choice.setAttribute('aria-pressed',String(active));
   choice.classList.toggle('is-selected',active);
  }
  const picker=menu.querySelector('#swapp-native-custom-accent');
  if(picker&&picker.value.toLowerCase()!==value.toLowerCase())picker.value=value;
 }
 function saveAccent(value){
  if(!safeColor(value))return;
  try{localStorage.setItem(KEY,value)}catch{}
  applyAccent(value);
  window.dispatchEvent(new Event('swapp:accent-change'));
 }
 function close(){menu.classList.remove('open');button.setAttribute('aria-expanded','false')}
 function link(title,href){
  const a=document.createElement('a');a.href=href;a.textContent=title;return a;
 }
 function buildAppearance(){
  const details=document.createElement('details');
  details.className='swapp-account-appearance swapp-native-appearance';
  const summary=document.createElement('summary');summary.textContent='Apparence';
  const panel=document.createElement('div');panel.className='swapp-native-theme-panel';
  const help=document.createElement('p');help.textContent='Couleur du site';panel.append(help);
  const swatches=document.createElement('div');swatches.className='swapp-native-theme-colors';
  swatches.setAttribute('role','group');swatches.setAttribute('aria-label','Couleur de SWAPP');
  for(const [name,hex] of colors){
   const choice=document.createElement('button');
   choice.type='button';choice.className='swapp-native-color';
   choice.style.setProperty('--swapp-choice',hex);
   choice.setAttribute('aria-label',name);choice.title=name;
   choice.dataset.swappAccent=hex;
   choice.addEventListener('click',()=>saveAccent(hex));
   swatches.append(choice);
  }
  const custom=document.createElement('label');
  custom.className='swapp-native-custom-label';
  custom.textContent='Personnalisée';
  const input=document.createElement('input');
  input.id='swapp-native-custom-accent';input.type='color';
  input.setAttribute('aria-label','Choisir une couleur personnalisée');
  input.addEventListener('input',()=>saveAccent(input.value));
  custom.append(input);
  const reset=document.createElement('button');
  reset.type='button';reset.className='swapp-native-reset';
  reset.textContent='Couleur par défaut';
  reset.addEventListener('click',()=>{
   try{localStorage.removeItem(KEY)}catch{}
   applyAccent(DEFAULT);
   window.dispatchEvent(new Event('swapp:accent-change'));
  });
  panel.append(swatches,custom,reset);
  details.append(summary,panel);return details;
 }
 function renderMenu(){
  menu.replaceChildren();
  if(signedIn){
   menu.append(link('Mon espace SWAPP','/compte'),link('Diffuser','/compte'));
  }else{
   menu.append(link('Se connecter','/compte'),link('Créer un compte SWAPP','/compte'));
  }
  menu.append(buildAppearance());
  menu.setAttribute('aria-label','Menu SWAPP : compte et apparence');
  applyAccent(getSaved());
 }
 function setUser(user){
  signedIn=!!(user&&user.login);
  if(label)label.textContent=signedIn?String(user.display_name||user.login).slice(0,40):'Se connecter';
  if(avatar){
   avatar.removeAttribute('src');
   const src=user&&(user.avatar_url||user.profile_image_url);
   if(typeof src==='string'&&src){
    try{const u=new URL(src,location.origin);
     if(u.protocol==='https:'||(u.protocol==='http:'&&u.origin===location.origin))avatar.src=u.href;
    }catch{}
   }
  }
  const opened=menu.classList.contains('open');
  renderMenu();
  menu.classList.toggle('open',opened);
 }
 button.setAttribute('aria-haspopup','true');
 button.setAttribute('aria-expanded','false');
 setUser(null);
 button.addEventListener('click',()=>{
  const next=!menu.classList.contains('open');
  menu.classList.toggle('open',next);
  button.setAttribute('aria-expanded',String(next));
 });
 document.addEventListener('click',event=>{if(!event.target.closest('.userArea'))close()});
 document.addEventListener('keydown',event=>{if(event.key==='Escape')close()});
 window.addEventListener('pageshow',()=>applyAccent(getSaved()));
 window.addEventListener('storage',event=>{if(event.key===KEY||event.key===null)applyAccent(getSaved())});
 const signal=typeof AbortSignal!=='undefined'&&typeof AbortSignal.timeout==='function'
  ?AbortSignal.timeout(6000):undefined;
 fetch('/api/oryon/session',{method:'GET',credentials:'same-origin',cache:'no-store',
  headers:{Accept:'application/json'},signal})
 .then(response=>response.ok?response.json():null)
 .then(data=>setUser(data?.success?(data.local||data.twitch):null))
 .catch(()=>setUser(null));
})();
