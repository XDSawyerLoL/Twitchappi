/* SWAPP Creator Support — subscription and community gift storefront.
 * Public content remains free. Checkout never creates a paid entitlement:
 * the Stripe signed webhook and MySQL ledger alone can do that.
 */
(function(){
 'use strict';
 const root=document.getElementById('channel');
 if(!root)return;
 const LOGIN=/^[a-z0-9_-]{2,48}$/i;
 const PACKS=[1,5,10,20,50,100], DISCOUNTS={1:0,5:5,10:10,20:15,50:20,100:25};
 let activeDialog=null,opening=false;
 function creator(page){
  const profile=typeof state!=='undefined'?state.channelProfile:null;
  const candidate=String(profile?.login||page?.dataset?.channelLogin||'').trim().toLowerCase();
  if(LOGIN.test(candidate))return candidate;
  const match=location.pathname.match(/^\/(?:c\/)?([a-z0-9_-]{2,48})\/?$/i);
  return match?match[1].toLowerCase():'';
 }
 function el(tag,cls,text){
  const n=document.createElement(tag);
  if(cls)n.className=cls;
  if(text!==undefined)n.textContent=text;
  return n;
 }
 function money(cents){
  return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(Math.max(0,Number(cents)||0)/100);
 }
 async function request(url,method='GET',body){
  const response=await fetch(url,{method,credentials:'same-origin',cache:'no-store',
   headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  let data;try{data=await response.json()}catch{}
  if(!response.ok||data.success!==true){const err=new Error(data.error||'Service momentanément indisponible.');err.status=response.status;throw err}
  return data;
 }
 function nonce(){
  const bytes=new Uint8Array(20);crypto.getRandomValues(bytes);
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 }
 function discountFor(count){
  return PACKS.filter(x=>x<=count).reduce((a,b)=>Math.max(a,b),1);
 }
 function calculate(q,price,discounts=DISCOUNTS){
  const pct=discounts[discountFor(q)]||0;
  const unit=Math.max(1,Math.round(price*(100-pct)/100));
  return {totalCents:q*unit,savingsCents:q*(price-unit),pct};
 }
 function close(){
  if(!activeDialog)return;
  const {overlay,previous}=activeDialog;
  document.removeEventListener('keydown',onKey);
  overlay.remove();
  document.body.classList.remove('swapp-subs-modal-open');
  activeDialog=null;
  if(previous?.isConnected)previous.focus();
 }
 function onKey(event){
  if(event.key==='Escape')close();
  if(event.key!=='Tab'||!activeDialog)return;
  const focusable=Array.from(activeDialog.overlay.querySelectorAll('button:not([disabled]),input:not([disabled]),a[href]'))
   .filter(n=>n.getClientRects().length);
  if(!focusable.length)return;
  const first=focusable[0],last=focusable[focusable.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
 }
 async function open(page,mode){
  if(opening)return;
  opening=true;
  const login=creator(page),previous=document.activeElement;
  if(!login){opening=false;return}
  close();
  const overlay=el('div','swapp-subs-overlay');
  const dialog=el('section','swapp-subs-dialog');
  dialog.setAttribute('role','dialog');
  dialog.setAttribute('aria-modal','true');
  dialog.setAttribute('aria-labelledby','swappSubsHeading');
  overlay.append(dialog);
  const header=el('header','swapp-subs-header');
  const heading=el('div','swapp-subs-heading');
  const eyebrow=el('span','swapp-subs-eyebrow','SWAPP · SOUTIEN CRÉATEUR');
  const title=el('h2','','Soutenir '+login);title.id='swappSubsHeading';
  const intro=el('p','','Abonne-toi à la chaîne ou offre du soutien à sa communauté.');
  heading.append(eyebrow,title,intro);
  const closeButton=el('button','swapp-subs-close','×');
  closeButton.type='button';closeButton.setAttribute('aria-label','Fermer');
  closeButton.addEventListener('click',close);
  header.append(heading,closeButton);dialog.append(header);
  const tabs=el('div','swapp-subs-tabs');
  const self=el('button','','Mon abonnement');
  const gifts=el('button','','Offrir des abonnements');
  for(const button of [self,gifts])button.type='button';
  tabs.append(self,gifts);dialog.append(tabs);
  const content=el('div','swapp-subs-content');
  content.textContent='Chargement du catalogue…';dialog.append(content);
  const footer=el('footer','swapp-subs-footer',
   'Lecture et tchat public gratuits. Aucun paiement sans validation explicite.');
  dialog.append(footer);
  document.body.append(overlay);
  document.body.classList.add('swapp-subs-modal-open');
  activeDialog={overlay,previous,login};
  overlay.addEventListener('mousedown',e=>{if(e.target===overlay)close()});
  document.addEventListener('keydown',onKey);
  closeButton.focus();
  let config;
  try{config=await request('/api/swapp/subscriptions/config?creator='+encodeURIComponent(login))}
  catch(e){
   content.textContent=e.message;
   opening=false;return;
  }
  if(activeDialog?.overlay!==overlay){opening=false;return}
  let chosen=mode==='gift'?'gift':'self',count=1,busy=false;
  function setMessage(text,isError){
   const message=content.querySelector('.swapp-subs-message');
   if(message){message.textContent=text||'';message.dataset.error=String(!!isError)}
  }
  async function action(path,payload){
   if(busy)return;
   busy=true;
   const buttons=content.querySelectorAll('button');
   buttons.forEach(b=>b.disabled=true);
   setMessage('Traitement de la demande…');
   try{
    const data=await request(path,'POST',payload);
    if(data.url){
     const dest=new URL(data.url);
     if(dest.protocol!=='https:'||![
      'checkout.stripe.com','connect.stripe.com'
     ].includes(dest.hostname))throw Error('Redirection de paiement non valide.');
     location.assign(data.url);return;
    }
    setMessage(data.cancelAtPeriodEnd?'Résiliation confirmée. Ton accès reste valable jusqu’à la fin de la période.':
     data.claimed?'Cadeau réclamé ! Ton abonnement est maintenant actif.':
     'Demande prise en compte.');
   }catch(e){
    if(e.status===401){setMessage('Connecte-toi à ton compte SWAPP pour continuer.',true)}
    else setMessage(e.message||'Action indisponible.',true);
   }finally{busy=false;buttons.forEach(b=>b.disabled=false)}
  }
  function render(){
   self.classList.toggle('active',chosen==='self');
   gifts.classList.toggle('active',chosen==='gift');
   self.setAttribute('aria-pressed',String(chosen==='self'));
   gifts.setAttribute('aria-pressed',String(chosen==='gift'));
   content.replaceChildren();
   const notice=el('p','swapp-subs-note');
   if(config.preview){
    notice.textContent='Présentation des offres — tarifs indicatifs. Aucun paiement actif sur cette chaîne.';
    notice.classList.add('swapp-subs-preview');
   }else notice.textContent='Paiement sécurisé par Stripe. Prix toutes taxes comprises.';
   content.append(notice);
   if(chosen==='self'){
    const offer=el('div','swapp-subs-hero-offer');
    const copy=el('div','');
    copy.append(el('span','swapp-subs-eyebrow','ABONNEMENT MENSUEL'),
     el('strong','swapp-subs-price',money(config.priceCents)),
     el('span','swapp-subs-subtitle','par mois · renouvellement automatique'));
    const mark=el('div','swapp-subs-medal','★');
    offer.append(copy,mark);content.append(offer);
    const perks=el('ul','swapp-subs-perks');
    for(const line of ['Badge de soutien sur la chaîne','Emotes exclusives lorsque le créateur en propose',
      'Soutien financier au créateur','Résiliation à tout moment, sans bloquer le live public']){
     perks.append(el('li','',line));
    }
    content.append(perks);
    if(config.member?.active){
     const state=el('p','swapp-subs-member-state','Abonnement actif · jusqu’au '+
      new Date(config.member.expiresAt).toLocaleDateString('fr-FR'));
     content.append(state);
     if(config.member.kind==='self'&&!config.member.cancelPending){
      const cancel=el('button','swapp-subs-cancel','Annuler le renouvellement');
      cancel.type='button';
      cancel.addEventListener('click',()=>action('/api/swapp/subscriptions/cancel',{creator:login}));
      content.append(cancel);
     }
    }else{
     const cta=el('button','swapp-subs-primary',
      config.preview?'Abonnements bientôt disponibles':config.authenticated?'S’abonner · '+money(config.priceCents)+'/mois':'Se connecter pour s’abonner');
     cta.disabled=config.preview;
     cta.type='button';
     cta.addEventListener('click',()=>{
      if(!config.authenticated){location.href='/compte';return}
      action('/api/swapp/subscriptions/checkout',{creator:login,kind:'self',quantity:1,nonce:nonce()});
     });content.append(cta);
    }
   }else{
    content.append(el('h3','swapp-subs-grid-title','Offrir à la communauté'));
    const grid=el('div','swapp-subs-grid');
    for(const q of PACKS){
     const info=(config.giftPacks||[]).find(p=>p.quantity===q)||calculate(q,config.priceCents);
     const tile=el('button','swapp-subs-pack');
     tile.type='button';tile.setAttribute('aria-pressed',String(q===count));
     if(q===count)tile.classList.add('selected');
     tile.append(el('span','swapp-subs-pack-symbol','✦'),
      el('strong','',q+' abonnement'+(q>1?'s':'')),
      el('span','swapp-subs-pack-total',money(info.totalCents)));
     if(info.savingsCents>0)tile.append(el('span','swapp-subs-saving',
      'Économie '+money(info.savingsCents)));
     tile.addEventListener('click',()=>{count=q;render()});
     grid.append(tile);
    }
    content.append(grid);
    const custom=el('label','swapp-subs-custom');
    custom.append(el('span','','Quantité personnalisée (1 à 100)'));
    const input=el('input');
    input.type='number';input.min='1';input.max='100';input.step='1';input.value=String(count);
    input.setAttribute('aria-label','Nombre d’abonnements cadeaux');
    const customSummary=el('span','swapp-subs-custom-total');
    function updateTotal(){
     const q=Number(input.value);
     if(!Number.isInteger(q)||q<1||q>100){customSummary.textContent='Choisis un nombre entre 1 et 100.';return}
     count=q;
     const p=calculate(q,config.priceCents);
     customSummary.textContent=money(p.totalCents)+(p.savingsCents?' · économie '+money(p.savingsCents):'');
     for(const tile of grid.children){
      const isSelected=tile.querySelector('strong')?.textContent===
       q+' abonnement'+(q>1?'s':'');
      tile.classList.toggle('selected',isSelected);
      tile.setAttribute('aria-pressed',String(isSelected));
     }
    }
    input.addEventListener('input',updateTotal);
    custom.append(input,customSummary);content.append(custom);
    updateTotal();
    const copy=el('p','swapp-subs-explainer','Les cadeaux sont attribués à des abonnés de la communauté éligibles. Les exemplaires non distribués peuvent être réclamés pendant 90 jours après l’achat.');
    content.append(copy);
    if(config.giftsAvailable>0){
     const claim=el('button','swapp-subs-claim',
      'Réclamer un cadeau disponible ('+config.giftsAvailable+')');
     claim.type='button';
     claim.addEventListener('click',()=>action('/api/swapp/subscriptions/claim',{creator:login}));
     content.append(claim);
    }
    const buy=el('button','swapp-subs-primary',config.preview?
      'Cadeaux bientôt disponibles':config.authenticated?'Offrir '+count+' abonnement(s)':'Se connecter pour offrir');
    buy.type='button';buy.disabled=config.preview;
    buy.addEventListener('click',()=>{
     if(!config.authenticated){location.href='/compte';return}
     const quantity=Number(input.value);
     if(!Number.isInteger(quantity)||quantity<1||quantity>100){setMessage('Quantité invalide.',true);return}
     action('/api/swapp/subscriptions/checkout',{creator:login,kind:'gift',quantity,nonce:nonce()});
    });
    content.append(buy);
   }
   if(config.creatorSetup){
    const owner=el('div','swapp-subs-owner');
    owner.append(el('strong','','Espace créateur'));
    const activate=el('button','swapp-subs-owner-button',
      config.available?'Voir mes statistiques':'Configurer mes versements');
    activate.type='button';
    activate.addEventListener('click',async()=>{
     if(config.available){
      try{
       const d=await request('/api/swapp/subscriptions/creator/dashboard?creator='+encodeURIComponent(login));
       setMessage(d.activeMembers+' abonnés actifs · '+d.giftsPurchased+' cadeaux achetés · '+d.giftsAssigned+' attribués');
      }catch(e){setMessage(e.message,true)}
     }else action('/api/swapp/subscriptions/creator/onboard',{creator:login});
    });
    owner.append(activate);
    const refresh=el('button','swapp-subs-refresh','Vérifier mon compte Stripe');
    refresh.type='button';
    refresh.addEventListener('click',async()=>{
     try{
      const d=await request('/api/swapp/subscriptions/creator/refresh','POST',{creator:login});
      if(d.connected){setMessage('Compte vérifié. Recharge le panneau pour activer les offres.');}
      else setMessage('Vérification du compte de paiement encore incomplète.',true);
     }catch(e){setMessage(e.message,true)}
    });
    owner.append(refresh);content.append(owner);
   }
   const message=el('p','swapp-subs-message');message.setAttribute('role','status');
   content.append(message);
  }
  self.addEventListener('click',()=>{chosen='self';render()});
  gifts.addEventListener('click',()=>{chosen='gift';render()});
  render();
  opening=false;
 }
 function scan(){
  if(!root.classList.contains('active'))return;
  for(const page of root.querySelectorAll('.creatorRefine')){
   const dock=page.querySelector('.channelActionDock');
   if(!dock||dock.querySelector('.swapp-support-trigger'))continue;
   if(!creator(page))continue;
   const subscribe=el('button','btn swapp-support-trigger','★ S’abonner');
   subscribe.type='button';
   const gift=el('button','btn secondary swapp-gift-trigger','Offrir');
   gift.type='button';
   subscribe.setAttribute('aria-label','Soutenir cette chaîne avec un abonnement mensuel');
   gift.setAttribute('aria-label','Offrir des abonnements à cette communauté');
   subscribe.addEventListener('click',()=>open(page,'self'));
   gift.addEventListener('click',()=>open(page,'gift'));
   dock.append(subscribe,gift);
  }
 }
 let scheduled=false;
 new MutationObserver(()=>{
  if(scheduled)return;scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;scan()});
 }).observe(root,{subtree:true,childList:true});
 window.addEventListener('popstate',close);
 scan();
})();
