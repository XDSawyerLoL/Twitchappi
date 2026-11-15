/* One accessible SWAPP account dropdown across the SPA and native documents.
 * Authentication remains owned by the existing session system.
 * No Twitch OAuth actions in the global menu; use /compte for integrations.
 */
(function(root,factory){
 const api=factory(root);
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.SwappUnifiedAccountMenu=api;
})(typeof window!=='undefined'?window:null,function(win){
 'use strict';
 const KEY='oryon_viewer_accent';
 const DEFAULT='#22d3ee';
 const COLORS=Object.freeze([
  ['Cyan','#22d3ee'],['Violet','#a855f7'],['Vert','#22c55e'],
  ['Orange','#f59e0b'],['Rose','#f43f5e'],['Blanc','#ffffff']
 ]);
 const validColor=value=>typeof value==='string'&&/^#[a-f0-9]{6}$/i.test(value);
 const saved=()=>{try{const value=win?.localStorage?.getItem(KEY);return validColor(value)?value:DEFAULT}catch{return DEFAULT}};
 function accent(color,{persist=false,reset=false}={}){
  if(!validColor(color))return;
  try{
   if(reset)win?.localStorage?.removeItem(KEY);
   else if(persist)win?.localStorage?.setItem(KEY,color);
  }catch(_){}
  const doc=win?.document,root=doc?.documentElement;
  if(root){
   for(const name of ['--swapp-page-accent','--swapp-side-light','--swapp-light-accent',
    '--scl-accent','--viewer-accent','--brand','--accent']){
    root.style.setProperty(name,color);
   }
   root.classList.add('swapp-editorial-theme');
  }
  if(win?.dispatchEvent&&typeof win.Event==='function')win.dispatchEvent(new win.Event('swapp:accent-change'));
  return color;
 }
 function el(doc,tag,cls,text){
  const item=doc.createElement(tag);
  if(cls)item.className=cls;
  if(text!==undefined)item.textContent=String(text);
  return item;
 }
 function buildAppearance(doc,{open=false,onToggle}={}){
  const details=el(doc,'details','swapp-account-appearance swapp-native-appearance');
  details.open=!!open;
  const summary=el(doc,'summary','','Apparence');
  const panel=el(doc,'div','swapp-native-theme-panel');
  const help=el(doc,'p','','Couleur du site');
  const options=el(doc,'div','swapp-native-theme-colors');
  options.setAttribute('role','group');
  options.setAttribute('aria-label','Choisir la couleur de SWAPP');
  const current=saved();
  for(const [label,color] of COLORS){
   const button=el(doc,'button','swapp-native-color');
   button.type='button';button.title=label;
   button.dataset.swappAccent=color;
   button.style.setProperty('--swapp-choice',color);
   button.setAttribute('aria-label',label);
   const active=current.toLowerCase()===color.toLowerCase();
   button.setAttribute('aria-pressed',String(active));
   button.classList.toggle('is-selected',active);
   button.addEventListener('click',event=>{
    event.stopPropagation();
    accent(color,{persist:true});
    for(const child of options.querySelectorAll('button[data-swapp-accent]')){
     const selected=child.dataset.swappAccent.toLowerCase()===color.toLowerCase();
     child.setAttribute('aria-pressed',String(selected));
     child.classList.toggle('is-selected',selected);
    }
    picker.value=color;
   });
   options.append(button);
  }
  const custom=el(doc,'label','swapp-native-custom-label','Personnalisée');
  const picker=el(doc,'input');
  picker.type='color';picker.value=current;
  picker.setAttribute('aria-label','Choisir une couleur personnalisée');
  picker.addEventListener('input',event=>{
   event.stopPropagation();const color=picker.value;
   accent(color,{persist:true});
   for(const child of options.querySelectorAll('button[data-swapp-accent]')){
    const selected=child.dataset.swappAccent.toLowerCase()===color.toLowerCase();
    child.setAttribute('aria-pressed',String(selected));
    child.classList.toggle('is-selected',selected);
   }
  });
  custom.append(picker);
  const reset=el(doc,'button','swapp-native-reset','Couleur par défaut');
  reset.type='button';reset.addEventListener('click',event=>{
   event.stopPropagation();accent(DEFAULT,{reset:true});picker.value=DEFAULT;
   for(const child of options.querySelectorAll('button[data-swapp-accent]')){
    const selected=child.dataset.swappAccent.toLowerCase()===DEFAULT.toLowerCase();
    child.setAttribute('aria-pressed',String(selected));child.classList.toggle('is-selected',selected);
   }
  });
  panel.append(help,options,custom,reset);
  details.append(summary,panel);
  if(onToggle)details.addEventListener('toggle',()=>onToggle(details.open));
  return details;
 }
 function buildTastes(doc,{open=false,onToggle}={}){
  const tastes=win?.SwappLocalTastes;
  if(!tastes||typeof tastes.isEnabled!=='function')return null;
  const details=el(doc,'details','swapp-account-tastes');
  details.open=!!open;
  const summary=el(doc,'summary','','Recommandations locales');
  const help=el(doc,'p','','Seuls les jeux que tu choisis sont conservés sur cet appareil, 30 jours maximum. Aucun historique envoyé au serveur.');
  const actions=el(doc,'div','swapp-account-tastes-actions');
  const toggle=el(doc,'button','','');
  const clear=el(doc,'button','','Effacer mes préférences');
  toggle.type='button';clear.type='button';
  const refresh=()=>{
   const enabled=!!tastes.isEnabled();
   toggle.textContent=enabled?'Désactiver':'Activer';
   toggle.setAttribute('aria-pressed',String(enabled));
   toggle.setAttribute('aria-label',enabled?'Désactiver la personnalisation locale':'Activer la personnalisation locale');
   clear.disabled=!enabled;
  };
  toggle.addEventListener('click',event=>{
   event.stopPropagation();
   tastes.setEnabled(!tastes.isEnabled());refresh();
   win?.dispatchEvent?.(new win.Event('swapp:local-tastes-changed'));
  });
  clear.addEventListener('click',event=>{
   event.stopPropagation();
   tastes.clear();clear.textContent='Préférences effacées';
   win?.dispatchEvent?.(new win.Event('swapp:local-tastes-changed'));
  });
  refresh();actions.append(toggle,clear);details.append(summary,help,actions);
  if(onToggle)details.addEventListener('toggle',()=>onToggle(details.open));
  return details;
 }
 function render(menu,opts={}){
  if(!menu?.ownerDocument)return null;
  const doc=menu.ownerDocument,closed=()=>opts.onClose?.();
  const status=!!opts.signedIn,local=!!opts.localAccount;
  const name=typeof opts.displayName==='string'?opts.displayName.trim().slice(0,64):'';
  const container=el(doc,'div','swapp-account-unified-root');
  if(status){
   const heading=el(doc,'div','swapp-account-status');
   heading.append(el(doc,'span','','Connecté'),el(doc,'strong','',name||'Compte SWAPP'));
   container.append(heading);
  }
  const nav=el(doc,'nav','swapp-account-main-actions');
  nav.setAttribute('aria-label','Actions du compte');
  const anchor=(title,href)=>{
   const a=el(doc,'a','swapp-account-action',title);
   a.href=href;a.addEventListener('click',closed);nav.append(a);return a;
  };
  const button=(title,callback)=>{
   const item=el(doc,'button','swapp-account-action',title);
   item.type='button';
   item.addEventListener('click',async()=>{
    item.disabled=true;
    try{await callback?.();closed()}catch(error){
     const errorNode=container.querySelector('.swapp-account-error');
     if(errorNode)errorNode.textContent='Action indisponible. Réessaie depuis /compte.';
     item.disabled=false;
    }
   });
   nav.append(item);
   return item;
  };
  if(status){
   anchor('Mon espace SWAPP','/compte');
   if(typeof opts.onBroadcast==='function')button('Diffuser',opts.onBroadcast);
   else anchor('Diffuser','/compte');
   if(typeof opts.onLogout==='function')button('Se déconnecter',opts.onLogout);
  }else{
   anchor('Se connecter','/compte');
   anchor('Créer un compte SWAPP','/compte');
  }
  container.append(nav);
  const error=el(doc,'p','swapp-account-error');error.setAttribute('role','status');
  error.setAttribute('aria-live','polite');container.append(error);
  container.append(buildAppearance(doc,{open:opts.appearanceOpen,onToggle:opts.onAppearanceToggle}));
  const tastes=buildTastes(doc,{open:opts.tastesOpen,onToggle:opts.onTastesToggle});
  if(tastes)container.append(tastes);
  menu.replaceChildren(container);
  menu.classList.add('swapp-account-unified-menu','swapp-account-enhanced','swapp-native-menu');
  menu.setAttribute('aria-label','Menu du compte SWAPP');
  accent(saved());
  return container;
 }
 return Object.freeze({render,accent,saved,buildAppearance,buildTastes,COLORS,KEY,DEFAULT});
});
