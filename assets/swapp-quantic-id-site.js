/* Quantic Identity Vault: one logo inside SWAPP's existing login form.
 * Local Vault proofs open the genuine SWAPP account session; presence follows the
 * authenticated identity automatically. No second account or presence panel. */
(()=>{'use strict';
 const BASE='/api/quantic-id',VAULT='http://127.0.0.1:47621';
 const LOCAL={mode:'cors',credentials:'omit',cache:'no-store',targetAddressSpace:'loopback'};
 const ICON='/assets/brand-icons/quantic-identity-vault-mark.svg';
 const ROOT=document.getElementById('settings');
 let busy=false,present=false,lastPresenceProof=0,activeSession=false,linked=false,quanticSession=false;
 let loginControl=null,linkControl=null;
 const listen=new Set();
 const errorLabels={
  quantic_identity_not_linked:'Cette identité n’est pas encore associée. Connecte-toi normalement une fois, puis associe Identity Vault dans ton compte.',
  swapp_password_login_required:'Connecte-toi d’abord à ton compte SWAPP habituel pour autoriser la liaison.',
  quantic_account_already_linked:'Ce compte possède déjà une identité Quantic ID associée.',
  quantic_identity_already_linked:'Cette identité est déjà associée à un autre compte.',
  quantic_identity_mismatch:'La signature ne correspond pas à l’identité associée.',
  quantic_login_not_configured:'Quantic ID n’est pas encore configuré côté serveur SWAPP.',
  quantic_store_unavailable:'Le stockage du compte SWAPP est momentanément indisponible.',
  quantic_session_expired:'La session Quantic ID a expiré. Reconnecte-toi.'
 };
 async function remote(route,body){
  const res=await fetch(BASE+'/account/'+route,{method:body===undefined?'GET':'POST',cache:'no-store',credentials:'same-origin',
   ...(body===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)})});
  if(!String(res.headers.get('content-type')||'').includes('application/json'))throw Error('Le serveur SWAPP ne renvoie pas l’API Quantic ID.');
  const data=await res.json();if(!res.ok)throw Error(errorLabels[data.error]||data.error||'Connexion Quantic ID refusée.');
  return data;
 }
 async function vault(route,options={}){
  try{return await fetch(VAULT+route,{...LOCAL,...options,signal:AbortSignal.timeout(12000)});}
  catch{throw Error('Identity Vault est introuvable. Démarre l’application sur cet ordinateur et autorise l’accès local dans ton navigateur.');}
 }
 async function available(){
  const r=await vault('/v1/status');if(!r.ok)throw Error('Identity Vault ne répond pas (HTTP '+r.status+').');
  const data=await r.json();
  if(data.product!=='Quantic Identity Vault')throw Error('Le service local n’est pas Identity Vault.');
  if(!data.identityAvailable)throw Error('Identity Vault est verrouillé. Déverrouille ton coffre pour signer la connexion.');
  return data;
 }
 async function prove(purpose,account=true){
  const state=await available();
  const nonce=account?await remote('challenge',{purpose}):await presence('challenge',{purpose});
  const signed=await vault('/v1/assert',{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({challenge:nonce.challenge,audience:nonce.audience})});
  if(!signed.ok)throw Error('Signature refusée par Identity Vault (HTTP '+signed.status+').');
  const proof=await signed.json();
  if(account)return remote('prove',{purpose,challenge:nonce.challenge,proof});
  return {challenge:nonce.challenge,proof,alias:state.label||'Quantic ID'};
 }
 async function presence(route,body){
  const res=await fetch(BASE+'/'+route,{method:'POST',cache:'no-store',credentials:'same-origin',
   headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  if(!res.ok)throw Error('Présence Quantic indisponible.');
  return res.json();
 }
 function output(text){
  for(const node of listen)if(node.isConnected)node.textContent=text;
 }
 function iconButton(id,label){
  const button=document.createElement('button');button.id=id;button.type='button';button.className='swapp-vault-logo-button';
  button.setAttribute('aria-label',label);button.title=label;
  const image=document.createElement('img');image.src=ICON;image.alt='';image.width=46;image.height=46;image.loading='eager';
  button.append(image);return button;
 }
 function messageNode(){
  const n=document.createElement('p');n.className='swapp-vault-inline-status';n.setAttribute('role','status');n.setAttribute('aria-live','polite');
  listen.add(n);return n;
 }
 function mount(){
  const form=document.getElementById('loginForm');
  if(form&&!document.getElementById('swapp-vault-primary-login')){
   const slot=document.createElement('div');slot.className='swapp-vault-login-option';
   const title=document.createElement('span');title.className='swapp-vault-option-label';title.textContent='Ou avec Identity Vault';
   const button=iconButton('swapp-vault-primary-login','Se connecter à SWAPP avec Identity Vault');
   const msg=messageNode();slot.append(title,button,msg);
   // Remain inside the main login panel; the button never submits the password form.
   form.append(slot);loginControl=button;button.addEventListener('click',()=>void authorize('login'));
  }
  // First-time association belongs to the existing logged-in account view, not a separate card.
  if(ROOT&&activeSession&&!quanticSession&&!linked&&!document.getElementById('swapp-vault-link-action')){
   const row=document.createElement('div');row.id='swapp-vault-link-action';row.className='swapp-vault-link-inline';
   const label=document.createElement('span');label.textContent='Associer Identity Vault à ce compte';
   const button=iconButton('swapp-vault-link-button','Associer mon Quantic ID à mon compte SWAPP');
   row.append(label,button,messageNode());ROOT.prepend(row);linkControl=button;
   button.addEventListener('click',()=>void authorize('link'));
  }
  if(ROOT&&(!activeSession||linked||quanticSession)){
   const old=ROOT.querySelector('#swapp-vault-link-action');if(old){old.remove();linkControl=null;}
  }
 }
 async function status(){
  const data=await remote('status');
  activeSession=Boolean(data.loggedIn);linked=Boolean(data.linked);quanticSession=Boolean(data.quanticSession);
  mount();return data;
 }
 async function authorize(purpose){
  if(busy)return;
  busy=true;const buttons=[loginControl,linkControl].filter(Boolean);buttons.forEach(b=>b.disabled=true);
  output(purpose==='login'?'Détection et vérification de ton Identity Vault…':'Association sécurisée avec ton compte SWAPP…');
  try{
   await prove(purpose);
   if(purpose==='login'){
    window.dispatchEvent(new Event('swapp:quantic-session-started'));
    location.assign('/compte');return;
   }
   await status();output('Identity Vault associé. Le même logo permettra désormais de te connecter.');
  }catch(e){output(e?.message||'Connexion impossible.');}
  finally{busy=false;buttons.forEach(b=>b.disabled=false);}
 }
 async function renewPresence(){
  if(busy||!(activeSession&&linked))return;
  try{
   await available();
   if(Date.now()-lastPresenceProof<7000)return;
   const assertion=await prove(present?'renew':'activate',false);
   await presence(present?'renew':'activate',assertion);
   present=true;lastPresenceProof=Date.now();
  }catch{
   if(present){present=false;await presence('lock',{}).catch(()=>{});}
  }
 }
 window.addEventListener('pagehide',()=>{
  if(present)navigator.sendBeacon(BASE+'/lock',new Blob(['{}'],{type:'application/json'}));
 });
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void status().then(renewPresence).catch(()=>{});});
 // The SPA regenerates /compte forms after navigation: keep only the logo button.
 const observer=new MutationObserver(()=>mount());observer.observe(document.body,{childList:true,subtree:true});
 mount();void status().then(renewPresence).catch(()=>{});
 window.setInterval(()=>void renewPresence(),7000);
})();