/* Optional Quantic ID presence on SWAPP /compte, never a substitute for a SWAPP session. */
(()=>{'use strict';
 const ROOT=document.getElementById('settings');
 if(!ROOT)return;
 const BRIDGE='http://127.0.0.1:47621',ENDPOINT='/api/quantic-id';
 // Chrome/Edge require explicit loopback targeting and site permission (LNA).
 const LOOPBACK_FETCH={mode:'cors',credentials:'omit',cache:'no-store',targetAddressSpace:'loopback'};
 async function loopbackPermission(){
  try{
   if(!navigator.permissions?.query)return 'unknown';
   const state=await navigator.permissions.query({name:'loopback-network'});
   return state?.state||'unknown';
  }catch{return 'unknown'} // Older browsers do not recognize the permission.
 }
 function networkAdvice(where){
  return where==='vault'
    ?'Impossible de joindre Quantic Identity Vault sur cet ordinateur (127.0.0.1:47621). Ouvre Identity Vault et installe sa dernière version, puis autorise SWAPP à accéder aux applications sur cet appareil dans les paramètres de ton navigateur.'
    :'Le serveur SWAPP ne répond pas. Vérifie la disponibilité du site et son déploiement Hostinger.';
 }
 async function localFetch(route,options={}){
  try{
   return await fetch(BRIDGE+route,{...LOOPBACK_FETCH,...options});
  }catch(error){
   const permission=await loopbackPermission();
   if(permission==='denied')throw Error('Accès local refusé par le navigateur. Autorise les « applications sur cet appareil » / l’accès loopback pour swapp.tv dans les paramètres du site.');
   if(error?.name==='TimeoutError')throw Error('Identity Vault ne répond pas dans le délai prévu. Vérifie qu’il fonctionne sur ton PC.');
   throw Error(networkAdvice('vault'));
  }
 }
 let active=false,busy=false,clock=0,lastProof=0,lastPresencePoll=0,section=null,label=null,button=null,stopButton=null,seen=null;
 const message=text=>{if(label)label.textContent=text};
 async function post(url,body){
  let r;
  try{r=await fetch(ENDPOINT+'/'+url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),cache:'no-store',credentials:'same-origin'});}
  catch{throw Error(networkAdvice('swapp'))}
  const type=r.headers.get('content-type')||'';
  if(!type.includes('application/json')){
   // Read only a small prefix; never display or log arbitrary server HTML.
   const excerpt=(await r.text()).slice(0,2048);
   if(/recaptcha|captcha|quota exceeded|quota.*exceeded|vérification.*robot|verify.*human|security check/i.test(excerpt)){
    throw Error('La protection anti-bot intercepte l’API Quantic ID. Vérifie le quota et les règles du pare-feu avant de retester.');
   }
   if(/<!doctype html|<html/i.test(excerpt)){
    throw Error('Le serveur SWAPP renvoie la page du site au lieu de l’API Quantic ID. Redéploie la branche master de SWAPP sur Hostinger et redémarre Node.js.');
   }
   throw Error('API Quantic ID inaccessible : le serveur ne renvoie pas de JSON (HTTP '+r.status+').');
  }
  let data;
  try{data=await r.json()}catch{throw Error('La réponse de l’API SWAPP est illisible.')}
  if(!r.ok){
   if(r.status===404)throw Error('API Quantic ID absente sur Hostinger : SWAPP n’a pas encore la version serveur nécessaire.');
   if(r.status===429)throw Error('Trop de demandes Quantic ID. Réessaie sans multiplier les connexions.');
   throw Error('API SWAPP : '+(data.error||'requête refusée')+' (HTTP '+r.status+').');
  }
  return data;
 }
 async function localStatus(){
  const result=await localFetch('/v1/status',{signal:AbortSignal.timeout(4500)});
  if(!result.ok)throw Error('Identity Vault répond HTTP '+result.status+' : vérifie que sa version autorise https://swapp.tv.');
  let data;
  try{data=await result.json()}catch{throw Error('Identity Vault renvoie un statut invalide.')}
  if(data.product!=='Quantic Identity Vault')throw Error('Service local non reconnu : Quantic Identity Vault attendu.');
  return data;
 }
 async function identityProof(purpose){
  const status=await localStatus();
  if(!status.identityAvailable)throw Error('Déverrouille Quantic Identity Vault sur cet ordinateur');
  const nonce=await post('challenge',{purpose});
  const signed=await localFetch('/v1/assert',{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({challenge:nonce.challenge,audience:nonce.audience}),signal:AbortSignal.timeout(20000)});
  if(!signed.ok){
   if(signed.status===423)throw Error('Quantic ID est verrouillé. Déverrouille le coffre puis réessaie.');
   if(signed.status===403)throw Error('Ce site n’est pas autorisé par Identity Vault : installe la version compatible SWAPP.');
   throw Error('Signature refusée par Identity Vault (HTTP '+signed.status+'). Vérifie son autorisation pour swapp.tv.');
  }
  const proof=await signed.json();
  const approved=await localStatus().catch(()=>status);
  return {challenge:nonce.challenge,proof,alias:approved.label||'Utilisateur Quantic'};
 }
 let accountCard=null,accountMessage=null,accountPassword=null,accountLink=null,accountLogin=null,accountUnlink=null,accountLogout=null;
 async function signedAccountRequest(action,body){
  const response=await fetch(ENDPOINT+'/account/'+action,{method:'POST',credentials:'same-origin',cache:'no-store',
   headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const type=response.headers.get('content-type')||'';
  if(!type.includes('application/json'))throw Error('API Quantic ID indisponible sur SWAPP');
  const data=await response.json();
  if(!response.ok){
   const errors={
    quantic_login_not_configured:'Connexion Quantic ID non configurée sur ce serveur.',
    quantic_identity_not_linked:'Cette identité Quantic ID n’est pas encore liée à un compte SWAPP. Connecte-toi une fois avec ton mot de passe pour l’associer.',
    swapp_password_invalid:'Mot de passe SWAPP incorrect.',
    quantic_account_already_linked:'Ce compte possède déjà une identité Quantic ID associée.',
    quantic_identity_already_linked:'Cette identité Quantic ID est déjà associée à un autre compte SWAPP.',
    quantic_session_expired:'La session Quantic ID a expiré : reconnecte-toi.',
    quantic_store_unavailable:'Le stockage MySQL SWAPP est temporairement indisponible.'
   };
   throw Error(errors[data.error]||data.error||'Échec de la connexion Quantic ID');
  }
  return data;
 }
 async function signedAccountProof(purpose,password){
  const state=await localStatus();
  if(!state.identityAvailable)throw Error('Déverrouille Identity Vault pour continuer');
  const nonce=await signedAccountRequest('challenge',{purpose});
  const response=await localFetch('/v1/assert',{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({challenge:nonce.challenge,audience:nonce.audience}),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('Signature refusée. Autorise SWAPP dans Identity Vault.');
  const proof=await response.json();
  return signedAccountRequest('prove',{purpose,challenge:nonce.challenge,proof,...(password?{password}:{})});
 }
 async function refreshAccountControls(){
  if(!accountCard)return;
  let data;
  try{
   const response=await fetch(ENDPOINT+'/account/status',{cache:'no-store',credentials:'same-origin'});
   data=await response.json();
   if(!response.ok)throw Error(data.error||'Connexion indisponible');
  }catch{
   accountMessage.textContent='Connexion Quantic ID indisponible sur cette version du serveur SWAPP.';
   accountLink.hidden=true;accountLogin.hidden=true;accountUnlink.hidden=true;accountLogout.hidden=true;accountPassword.hidden=true;
   return;
  }
  accountPassword.hidden=Boolean(data.quanticSession)||!data.loggedIn;
  accountLink.hidden=!data.loggedIn||data.linked||data.quanticSession;
  accountUnlink.hidden=!data.loggedIn||!data.linked||data.quanticSession;
  accountLogin.hidden=Boolean(data.loggedIn);
  accountLogout.hidden=!data.quanticSession;
  accountMessage.textContent=data.quanticSession
   ?'Session SWAPP ouverte avec Quantic ID : '+data.login+'. Verrouiller Identity Vault ferme cette session.'
   :data.loggedIn
    ?data.linked?'Compte '+data.login+' déjà associé à Quantic ID.':'Compte '+data.login+' connecté. Associe ton identité Quantic ID une seule fois.'
    :'Connecte-toi avec Quantic ID si tu l’as déjà associé. Sinon, connecte-toi une fois à ton compte SWAPP avec ton mot de passe et associe-le.';
 }
 async function performAccount(action){
  const buttons=[accountLink,accountLogin,accountUnlink,accountLogout];
  buttons.forEach(node=>{node.disabled=true});
  const password=accountPassword?.value||'';
  accountMessage.textContent='Vérification de la connexion Quantic ID…';
  try{
   if(action==='link'){
    if(!password)throw Error('Saisis ton mot de passe SWAPP pour autoriser la première association.');
    await signedAccountProof('link',password);
    accountPassword.value='';
    accountMessage.textContent='Quantic ID associé à ton compte SWAPP. Tu peux te déconnecter, puis revenir avec Quantic ID.';
   }else if(action==='login'){
    await signedAccountProof('login');
    window.dispatchEvent(new Event('swapp:quantic-session-started'));
    location.assign('/compte');
    return;
   }else if(action==='unlink'){
    if(!password)throw Error('Le mot de passe SWAPP est requis pour dissocier ton identité.');
    await signedAccountRequest('unlink',{password});
    accountPassword.value='';
    accountMessage.textContent='Quantic ID dissocié de ce compte SWAPP.';
   }else if(action==='logout'){
    await signedAccountRequest('logout',{});
    location.assign('/compte');
    return;
   }
   await refreshAccountControls();
  }catch(e){
   accountMessage.textContent=e?.message||'Action Quantic ID refusée.';
  }finally{buttons.forEach(node=>{node.disabled=false})}
 }
 function buildAccountCard(){
  if(!ROOT||ROOT.querySelector('#swapp-quantic-account-login'))return;
  accountCard=document.createElement('section');accountCard.id='swapp-quantic-account-login';accountCard.className='swapp-quantic-card';
  const h=document.createElement('h3');h.textContent='Quantic ID · Connexion à mon compte SWAPP';
  const description=document.createElement('p');description.textContent='Associe une seule fois ton compte SWAPP à ta clé Quantic ID. Ensuite, une signature de ton coffre déverrouillé suffit à ouvrir ta session SWAPP.';
  accountMessage=document.createElement('p');accountMessage.setAttribute('role','status');accountMessage.textContent='Recherche de la session SWAPP…';
  accountPassword=document.createElement('input');accountPassword.type='password';accountPassword.placeholder='Mot de passe actuel du compte SWAPP';accountPassword.autocomplete='current-password';accountPassword.setAttribute('aria-label','Mot de passe SWAPP pour associer ou dissocier Quantic ID');
  const makeButton=(label,action)=>{
   const b=document.createElement('button');b.type='button';b.textContent=label;
   b.addEventListener('click',()=>void performAccount(action));return b;
  };
  accountLink=makeButton('Associer Quantic ID à mon compte','link');
  accountLogin=makeButton('Me connecter à SWAPP avec Quantic ID','login');
  accountUnlink=makeButton('Dissocier Quantic ID','unlink');
  accountLogout=makeButton('Me déconnecter de Quantic ID','logout');
  accountCard.append(h,description,accountMessage,accountPassword,accountLink,accountLogin,accountUnlink,accountLogout);
  ROOT.append(accountCard);
  void refreshAccountControls();
 }
 function controls(){if(button)button.disabled=busy||active;if(stopButton)stopButton.disabled=busy||!active}
 function build(){
  if(!ROOT||ROOT.querySelector('#swapp-quantic-id-presence'))return;
  section=document.createElement('section');section.id='swapp-quantic-id-presence';section.className='swapp-quantic-card';
  const heading=document.createElement('h3');heading.textContent='Quantic ID · Présence éphémère';
  const help=document.createElement('p');help.textContent='Active ton identité sur SWAPP sans transmettre ta clé privée. Ta présence disparaît au verrouillage ou après 10 secondes sans preuve renouvelée. Cette connexion ne remplace pas encore ton compte SWAPP.';
  button=document.createElement('button');button.type='button';button.textContent='Activer ma présence Quantic ID';
  stopButton=document.createElement('button');stopButton.type='button';stopButton.textContent='Verrouiller ma présence';stopButton.className='swapp-quantic-secondary';
  label=document.createElement('p');label.setAttribute('role','status');label.textContent='Identité non visible sur SWAPP.';
  seen=document.createElement('p');seen.className='swapp-quantic-presence-list';
  const download=document.createElement('a');
  download.href='https://github.com/XDSawyerLoL/Human-Agency-Engine/releases/tag/quantic-identity-vault-v0.4.1';
  download.target='_blank';download.rel='noopener noreferrer';
  download.className='swapp-quantic-install-link';
  download.textContent='Télécharger Identity Vault v0.4.1 pour Windows';
  const instructions=document.createElement('p');
  instructions.textContent='Application à lancer sur ce PC. Si Edge le demande, autorise les applications sur cet appareil pour SWAPP.';
  section.append(heading,help,download,instructions,button,stopButton,label,seen);
  ROOT.append(section);
  buildAccountCard();
  // Account sign-in is the primary Quantic ID feature, presence stays an optional demonstration.
  if(accountCard)ROOT.insertBefore(accountCard,section);
  button.addEventListener('click',()=>void activate());
  stopButton.addEventListener('click',()=>void lock());
  controls();
 }
 async function activate(){
  if(busy||active)return;
  busy=true;controls();message('Signature Quantic ID en cours...');
  try{
   const assertion=await identityProof('activate');
   await post('activate',assertion);
   active=true;lastProof=Date.now();
   message('Identité Quantic ID visible sur SWAPP (présence temporaire).');
  }catch(e){message('Activation impossible : '+(e?.message||'connexion refusée'))}
  finally{busy=false;controls();}
 }
 async function lock(){
  if(busy)return;
  active=false;
  try{await post('lock',{})}catch(_){}
  message('Présence Quantic ID révoquée ou en expiration.');
  controls();
 }
 async function refresh(){
  if(!section||!section.isConnected)return;
  try{
   const data=await(await fetch(ENDPOINT+'/visible',{cache:'no-store'})).json();
   seen.textContent=data.users?.length?'Présences Quantic ID sur SWAPP : '+data.users.map(x=>x.alias).join(', '):'Aucune présence Quantic ID actuellement.';
  }catch{seen.textContent='Présences indisponibles.'}
 }
 async function heartbeat(){
  if(busy)return;
  if(active){
   busy=true;controls();
   try{
    const status=await localStatus();
    if(!status.identityAvailable)throw Error('coffre verrouillé');
    if(Date.now()-lastProof>4500){
     const assertion=await identityProof('renew');
     await post('renew',assertion);
     lastProof=Date.now();
    }
   }catch{
    active=false;
    await post('lock',{}).catch(()=>{});
    message('Coffre verrouillé ou inaccessible : présence supprimée.');
   }finally{busy=false;controls();}
  }
  if(active && Date.now()-lastPresencePoll>=8000 && document.visibilityState==='visible'){
    lastPresencePoll=Date.now();
    await refresh();
  }
 }
 window.addEventListener('pagehide',()=>{
  if(!active)return;
  active=false;
  navigator.sendBeacon(ENDPOINT+'/lock',new Blob(['{}'],{type:'application/json'}));
 });
 const observer=new MutationObserver(()=>{if(!ROOT.querySelector('#swapp-quantic-id-presence'))build();else if(!ROOT.querySelector('#swapp-quantic-account-login'))buildAccountCard()});
 observer.observe(ROOT,{childList:true});
 build();void refresh();
 clock=window.setInterval(()=>void heartbeat(),1600);
})();
