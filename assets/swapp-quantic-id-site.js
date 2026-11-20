/* Unified Quantic ID authentication and derived temporary SWAPP presence. */
(()=>{'use strict';
const ROOT=document.getElementById('settings');if(!ROOT)return;
const BASE='/api/quantic-id',LOCAL='http://127.0.0.1:47621';
const LOOPBACK={mode:'cors',credentials:'omit',cache:'no-store',targetAddressSpace:'loopback'};
let card,notice,primary,unlink,logout,presenceText;
let busy=false,loggedIn=false,linked=false,quanticSession=false,present=false,lastProof=0,autoAttempted=false;
const say=s=>{if(notice)notice.textContent=s;};
async function account(route,body){
 const r=await fetch(BASE+'/account/'+route,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',
 ...(body===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)})});
 if(!String(r.headers.get('content-type')||'').includes('application/json'))throw Error('API Quantic ID indisponible.');
 const d=await r.json();
 if(!r.ok){const errors={
  quantic_identity_not_linked:'Identité non associée : connecte-toi d’abord à SWAPP avec ta méthode habituelle, puis autorise la liaison.',
  quantic_account_already_linked:'Ce compte est déjà associé à une identité Quantic ID.',
  quantic_identity_already_linked:'Cette identité est associée à un autre compte SWAPP.',
  quantic_identity_mismatch:'La clé Quantic ID ne correspond pas à celle associée au compte.',
  quantic_login_not_configured:'Connexion Quantic ID non configurée côté SWAPP.',
  quantic_store_unavailable:'Stockage des comptes temporairement indisponible.',
  swapp_password_login_required:'Connecte-toi à ton compte SWAPP habituel pour autoriser la liaison.'};
  throw Error(errors[d.error]||d.error||'Connexion refusée.');}
 return d;
}
async function local(route,options={}){
 try{return await fetch(LOCAL+route,{...LOOPBACK,...options,signal:AbortSignal.timeout(15000)});}
 catch{throw Error('Identity Vault inaccessible. Lance le coffre local et autorise SWAPP à y accéder.');}
}
async function vaultStatus(){
 const r=await local('/v1/status');
 if(!r.ok)throw Error('Identity Vault indisponible (HTTP '+r.status+').');
 const s=await r.json();if(s.product!=='Quantic Identity Vault')throw Error('Service local non reconnu.');
 return s;
}
async function signed(purpose,accountMode=true){
 const v=await vaultStatus();if(!v.identityAvailable)throw Error('Identity Vault est verrouillé.');
 const nonce=accountMode?await account('challenge',{purpose}):await presenceRequest('challenge',{purpose});
 const result=await local('/v1/assert',{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({challenge:nonce.challenge,audience:nonce.audience})});
 if(!result.ok)throw Error('Signature refusée par Identity Vault (HTTP '+result.status+').');
 const proof=await result.json();
 if(accountMode)return account('prove',{purpose,challenge:nonce.challenge,proof});
 return {challenge:nonce.challenge,proof,alias:v.label||'Utilisateur Quantic'};
}
async function presenceRequest(route,body){
 const r=await fetch(BASE+'/'+route,{method:'POST',credentials:'same-origin',cache:'no-store',
  headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 if(!r.ok)throw Error('Présence indisponible (HTTP '+r.status+').');
 return r.json();
}
function controls(){
 primary.hidden=Boolean(loggedIn&&linked);
 primary.textContent=loggedIn?'Associer mon Quantic ID':'Me connecter avec Quantic ID';
 unlink.hidden=!(loggedIn&&linked&&!quanticSession);
 logout.hidden=!quanticSession;
}
async function status(){
 const data=await account('status');loggedIn=Boolean(data.loggedIn);
 linked=Boolean(data.linked);quanticSession=Boolean(data.quanticSession);controls();
 if(quanticSession)say('Connecté à ton compte SWAPP par Quantic ID. La présence suit automatiquement le coffre.');
 else if(loggedIn&&linked)say('Quantic ID associé à ton compte SWAPP. La connexion sans mot de passe est prête.');
 else if(loggedIn)say('Compte SWAPP connecté. Autorise une seule fois la liaison avec ton coffre Quantic ID.');
 else say('Identity Vault peut ouvrir ta session SWAPP automatiquement si ton identité est associée.');
 return data;
}
async function action(kind){
 if(busy)return;busy=true;[primary,unlink,logout].forEach(n=>n.disabled=true);
 try{
  if(kind==='logout'){sessionStorage.setItem('quantic-manual-logout','1');await account('logout',{});location.assign('/compte');return;}
  say(kind==='link'?'Vérification de la liaison Quantic ID…':'Signature Quantic ID en cours…');
  if(kind==='login')sessionStorage.removeItem('quantic-manual-logout');
  await signed(kind);
  if(kind==='login'){window.dispatchEvent(new Event('swapp:quantic-session-started'));location.assign('/compte');return;}
  await status();
  if(kind==='unlink')say('Identité dissociée. La connexion Quantic ID est désactivée.');
  if(kind==='link')say('Identité associée. Les prochaines connexions peuvent être automatiques.');
 }catch(error){say(error?.message||'Action Quantic ID refusée.');}
 finally{busy=false;[primary,unlink,logout].forEach(n=>n.disabled=false);}
}
function build(){
 if(ROOT.querySelector('#swapp-quantic-id-unified'))return;
 card=document.createElement('section');card.id='swapp-quantic-id-unified';card.className='swapp-quantic-card';
 const h=document.createElement('h3');h.textContent='Quantic ID · Mon compte SWAPP';
 const p=document.createElement('p');p.textContent='Une seule connexion pour ton compte et ta présence éphémère. Les clés privées restent dans Identity Vault.';
 notice=document.createElement('p');notice.setAttribute('role','status');notice.textContent='Recherche de Quantic ID…';
 primary=document.createElement('button');primary.type='button';
 primary.addEventListener('click',()=>void action(loggedIn?'link':'login'));
 unlink=document.createElement('button');unlink.type='button';unlink.textContent='Dissocier Quantic ID';unlink.className='swapp-quantic-secondary';
 unlink.addEventListener('click',()=>void action('unlink'));
 logout=document.createElement('button');logout.type='button';logout.textContent='Déconnecter Quantic ID';logout.className='swapp-quantic-secondary';
 logout.addEventListener('click',()=>void action('logout'));
 presenceText=document.createElement('p');presenceText.className='swapp-quantic-presence-list';
 const install=document.createElement('a');install.className='swapp-quantic-install-link';
 install.href='https://github.com/XDSawyerLoL/Human-Agency-Engine/releases/tag/quantic-identity-vault-v0.4.1';
 install.target='_blank';install.rel='noopener noreferrer';install.textContent='Installer Quantic Identity Vault pour Windows';
 card.append(h,p,notice,primary,unlink,logout,presenceText,install);ROOT.append(card);controls();
}
async function tick(){
 if(busy)return;
 try{
  const vault=await vaultStatus();
  if(!vault.identityAvailable){
   if(present){present=false;await presenceRequest('lock',{}).catch(()=>{});}
   return;
  }
  if(!loggedIn&&!autoAttempted&&!sessionStorage.getItem('quantic-manual-logout')){autoAttempted=true;await action('login');return;}
  // Presence is derived from an authenticated account that has an associated Quantic identity.
  if(!(loggedIn&&linked))return;
  if(Date.now()-lastProof>5000){
   const statement=await signed(present?'renew':'activate',false);
   await presenceRequest(present?'renew':'activate',statement);
   present=true;lastProof=Date.now();
  }
 }catch{
  if(present){present=false;await presenceRequest('lock',{}).catch(()=>{});}
 }
}
async function refreshVisible(){
 try{
  const r=await fetch(BASE+'/visible',{cache:'no-store'});
  if(!r.ok)return;
  const data=await r.json();
  presenceText.textContent=data.users?.length?'Présences Quantic ID : '+data.users.map(u=>u.alias).join(', '):'Aucune présence Quantic ID actuellement.';
 }catch{presenceText.textContent='Présences indisponibles.';}
}
window.addEventListener('pagehide',()=>{
 if(present)navigator.sendBeacon(BASE+'/lock',new Blob(['{}'],{type:'application/json'}));
});
build();
void status().then(()=>tick()).catch(e=>say(e?.message||'Connexion Quantic ID indisponible.'));
window.setInterval(()=>void tick(),3500);
window.setInterval(()=>{if(document.visibilityState==='visible')void refreshVisible();},10000);
void refreshVisible();
})();