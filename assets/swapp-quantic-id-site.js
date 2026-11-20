/* Quantic Identity Vault: one logo inside SWAPP's existing login form.
 * Local Vault proofs open the genuine SWAPP account session; presence follows the
 * authenticated identity automatically. No second account or presence panel. */
(()=>{'use strict';
 const BASE='/api/quantic-id',VAULT='http://127.0.0.1:47621';
 const LOCAL={mode:'cors',credentials:'omit',cache:'no-store',targetAddressSpace:'loopback'};
 const ICON='/assets/brand-icons/quantic-identity-vault-mark.svg';
 const ROOT=document.getElementById('settings');
 let busy=false,presenceBusy=false,present=false,lastPresenceProof=0,activeSession=false,linked=false,quanticSession=false,recoveryReady=false,strict=false;
 let loginControl=null,linkControl=null,recoverControl=null,enrollControl=null,strictControl=null;
 const listen=new Set();
 const errorLabels={
  quantic_identity_not_linked:'Cette identité n’est pas associée à SWAPP.',
  swapp_password_login_required:'Connecte-toi d’abord à ton compte SWAPP habituel pour autoriser la liaison.',
  swapp_recent_password_required:'Pour protéger ton compte contre le vol de session, reconnecte-toi avec ton mot de passe SWAPP avant d’associer ou retirer Identity Vault.',
  quantic_only_account_recovery_required:'Compte protégé par Identity Vault : ajoute d’abord un autre moyen de récupération vérifié avant de retirer le coffre.',
  quantic_account_already_linked:'Ce compte possède déjà une identité Quantic ID associée.',
  quantic_identity_already_linked:'Cette identité est déjà associée à un autre compte.',
  quantic_identity_mismatch:'La signature ne correspond pas à l’identité associée.',
  quantic_login_not_configured:'Quantic ID n’est pas encore configuré côté serveur SWAPP.',
  quantic_store_unavailable:'Le stockage du compte SWAPP est momentanément indisponible.',
  quantic_session_expired:'La session Quantic ID a expiré. Reconnecte-toi.',
  quantic_registration_not_configured:'Création de compte Quantic ID indisponible sur SWAPP.',
  quantic_registration_rate_limited:'Trop de créations de comptes. Réessaie plus tard.',
  quantic_registration_collision:'La création a rencontré un conflit. Réessaie.',
  quantic_account_capacity_reached:'SWAPP ne peut plus créer de nouveaux comptes pour le moment.',
  quantic_recovery_invalid:'Code de récupération invalide ou déjà utilisé.',
  quantic_recovery_required:'Crée et conserve d’abord tes codes de récupération avant d’activer Identity Vault obligatoire.',
  quantic_recovery_unavailable:'Récupération Identity Vault non configurée.',
  quantic_strict_unavailable:'Mode de connexion obligatoire temporairement indisponible.'
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
 async function prove(purpose,account=true,extra={}){
  const state=await available();
  const nonce=account?await remote('challenge',{purpose}):await presence('challenge',{purpose});
  const signed=await vault('/v1/assert',{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({challenge:nonce.challenge,audience:nonce.audience})});
  if(!signed.ok)throw Error('Signature refusée par Identity Vault (HTTP '+signed.status+').');
  const proof=await signed.json();
  if(account)return remote('prove',{purpose,challenge:nonce.challenge,proof,...(purpose==='login'?{createIfMissing:true}:{}),...extra});
  return {challenge:nonce.challenge,proof,alias:state.label||'Quantic ID'};
 }
 async function presence(route,body){
  const res=await fetch(BASE+'/'+route,{method:'POST',cache:'no-store',credentials:'same-origin',
   headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  if(!res.ok)throw Error('Présence Quantic indisponible.');
  return res.json();
 }
 function output(text){
  for(const node of listen)if(node.isConnected&&node.textContent!==text)node.textContent=text;
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
  if(ROOT&&activeSession&&sessionStorage.getItem('swapp-quantic-new-account')==='1'&&!ROOT.querySelector('#swapp-vault-welcome')){
   const note=document.createElement('p');note.id='swapp-vault-welcome';note.className='swapp-vault-inline-status';
   note.textContent='Compte SWAPP créé avec Identity Vault. Conserve l’accès à ton coffre : aucun moyen de récupération par e-mail n’est encore associé.';
   ROOT.prepend(note);sessionStorage.removeItem('swapp-quantic-new-account');
  }
  const form=document.getElementById('loginForm');
  if(form&&!document.getElementById('swapp-vault-primary-login')){
   const slot=document.createElement('div');slot.className='swapp-vault-login-option';
   const title=document.createElement('span');title.className='swapp-vault-option-label';title.textContent='Connexion ou inscription avec Identity Vault';
   const button=iconButton('swapp-vault-primary-login','Se connecter ou créer mon compte SWAPP avec Identity Vault');
   const msg=messageNode();slot.append(title,button,msg);
   // Remain inside the main login panel; the button never submits the password form.
   const recover=document.createElement('button');recover.type='button';recover.id='swapp-vault-recovery-login';
   recover.textContent='Récupérer mon compte avec un code';recover.className='swapp-vault-inline-recovery';
   slot.append(recover);recoverControl=recover;
   recover.addEventListener('click',()=>{
    let field=slot.querySelector('#swapp-vault-recovery-code');
    if(!field){
     field=document.createElement('input');field.id='swapp-vault-recovery-code';field.type='password';
     field.autocomplete='off';field.maxLength=60;field.placeholder='Code de récupération Quantic ID';
     field.setAttribute('aria-label','Code secret de récupération à usage unique');
     recover.before(field);recover.textContent='Valider ce code';field.focus();return;
    }
    const code=field.value.trim();field.value='';field.remove();recover.textContent='Récupérer mon compte avec un code';
    if(code)void authorize('recover',{recoveryCode:code});
   });
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
  if(ROOT&&activeSession&&quanticSession&&linked&&!document.getElementById('swapp-vault-recovery-actions')){
   const row=document.createElement('div');row.id='swapp-vault-recovery-actions';row.className='swapp-vault-link-inline';
   const enroll=document.createElement('button');enroll.type='button';enroll.textContent=recoveryReady?'Renouveler mes codes de récupération':'Créer mes codes de récupération';
   enroll.className='swapp-vault-inline-recovery';enrollControl=enroll;row.append(enroll);
   enroll.addEventListener('click',()=>{if(window.confirm('Les anciens codes de récupération seront invalidés. Les nouveaux codes seront montrés UNE seule fois. Continuer ?'))void authorize('recovery-enroll')});
   if(recoveryReady&&!strict){
    const enforce=document.createElement('button');enforce.type='button';enforce.textContent='Rendre Identity Vault obligatoire';
    enforce.className='swapp-vault-inline-recovery';strictControl=enforce;row.append(enforce);
    enforce.addEventListener('click',()=>{if(window.confirm('Une fois activé, le mot de passe et les anciens jetons ne connecteront plus ce compte. Conserve tes codes hors du coffre. Confirmer ?'))void authorize('strict-enable')});
   }
   row.append(messageNode());ROOT.prepend(row);
  }
  if(ROOT){
   const action=ROOT.querySelector('#swapp-vault-recovery-actions');
   if(action&&(!activeSession||!quanticSession||!linked)){
    action.remove();enrollControl=null;strictControl=null;
   }else if(action){
    // Setting textContent always creates a childList mutation, even for an unchanged label.
    // Keep mount() idempotent: it also runs from a MutationObserver on the entire SPA.
    if(enrollControl){
     const label=recoveryReady?'Renouveler mes codes de récupération':'Créer mes codes de récupération';
     if(enrollControl.textContent!==label)enrollControl.textContent=label;
    }
    if(strictControl){
     const hidden=Boolean(strict||!recoveryReady);
     if(strictControl.hidden!==hidden)strictControl.hidden=hidden;
    }
   }
  }
  if(ROOT&&(!activeSession||linked||quanticSession)){
   const old=ROOT.querySelector('#swapp-vault-link-action');if(old){old.remove();linkControl=null;}
  }
 }
 async function status(){
  const data=await remote('status');
  activeSession=Boolean(data.loggedIn);linked=Boolean(data.linked);quanticSession=Boolean(data.quanticSession);recoveryReady=Boolean(data.recoveryReady);strict=Boolean(data.strict);
  mount();return data;
 }
 async function authorize(purpose,extra={}){
  if(busy)return;
  busy=true;const buttons=[loginControl,linkControl,recoverControl,enrollControl,strictControl].filter(Boolean);buttons.forEach(b=>b.disabled=true);
  output(purpose==='login'?'Recherche de ton compte ou création si l’identité est nouvelle…':
   purpose==='recover'?'Vérification du nouveau coffre et du code de récupération…':'Vérification cryptographique Identity Vault…');
  try{
   const result=await prove(purpose,true,extra);
   if(purpose==='login'&&result.created)sessionStorage.setItem('swapp-quantic-new-account','1');
   if(purpose==='login'||purpose==='recover'){
    window.dispatchEvent(new Event('swapp:quantic-session-started'));
    location.assign('/compte');return;
   }
   await status();
   if(purpose==='recovery-enroll'){
    const row=document.getElementById('swapp-vault-recovery-actions');
    if(row){
     const old=row.querySelector('#swapp-vault-recovery-codes');if(old)old.remove();
     const container=document.createElement('div');container.id='swapp-vault-recovery-codes';
     const note=document.createElement('p');note.textContent='Codes affichés une seule fois. Copie-les et conserve-les HORS de la clé USB et de cet ordinateur. Tout nouvel enregistrement invalide les anciens.';
     const codes=document.createElement('textarea');codes.readOnly=true;codes.rows=9;codes.value=result.recoveryCodes.join('\n');codes.setAttribute('aria-label','Codes de récupération à sauvegarder');
     container.append(note,codes);row.append(container);
    }
    output('Enregistre tes huit codes maintenant : aucun des codes n’est conservé en clair côté serveur.');
   }else if(purpose==='strict-enable')output('Identity Vault est maintenant obligatoire pour ce compte. Les anciennes connexions ont été invalidées.');
   else output('Identity Vault associé. Le même logo permettra désormais de te connecter.');
  }catch(e){output(e?.message||'Connexion impossible.');}
  finally{busy=false;buttons.forEach(b=>b.disabled=false);}
 }
 async function renewPresence(){
  if(busy||presenceBusy||!(activeSession&&linked))return;
  presenceBusy=true;
  try{
   await available();
   if(Date.now()-lastPresenceProof<7000)return;
   const assertion=await prove(present?'renew':'activate',false);
   await presence(present?'renew':'activate',assertion);
   present=true;lastPresenceProof=Date.now();
  }catch{
   if(present){present=false;await presence('lock',{}).catch(()=>{});}
  }finally{presenceBusy=false;}
 }
 window.addEventListener('pagehide',()=>{
  if(present)navigator.sendBeacon(BASE+'/lock',new Blob(['{}'],{type:'application/json'}));
 });
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void status().then(renewPresence).catch(()=>{});});
 // The SPA regenerates /compte forms after navigation: keep only the logo button.
 // Ignore our own label/status changes, which must never recursively remount the SPA.
 const observer=new MutationObserver(records=>{
  if(records.every(record=>{
   const target=record.target?.nodeType===1?record.target:record.target?.parentElement;
   return Boolean(target?.closest?.('.swapp-vault-login-option,.swapp-vault-link-inline,#swapp-vault-welcome'));
  }))return;
  mount();
 });
 observer.observe(document.body,{childList:true,subtree:true});
 mount();void status().then(renewPresence).catch(()=>{});
 window.setInterval(()=>void renewPresence(),7000);
})();