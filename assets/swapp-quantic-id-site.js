/* Optional Quantic ID presence on SWAPP /compte, never a substitute for a SWAPP session. */
(()=>{'use strict';
 const ROOT=document.getElementById('settings');
 if(!ROOT)return;
 const BRIDGE='http://127.0.0.1:47621',ENDPOINT='/api/quantic-id';
 let active=false,busy=false,clock=0,lastProof=0,lastPresencePoll=0,section=null,label=null,button=null,stopButton=null,seen=null;
 const message=text=>{if(label)label.textContent=text};
 async function post(url,body){
  const r=await fetch(ENDPOINT+'/'+url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),cache:'no-store',credentials:'same-origin'});
  const data=await r.json();if(!r.ok)throw Error(data.error||'quantic_api_unavailable');return data;
 }
 async function localStatus(){
  const result=await fetch(BRIDGE+'/v1/status',{cache:'no-store',signal:AbortSignal.timeout(2500)});
  if(!result.ok)throw Error('Identity Vault indisponible');
  return result.json();
 }
 async function identityProof(purpose){
  const status=await localStatus();
  if(!status.identityAvailable)throw Error('Déverrouille Quantic Identity Vault sur cet ordinateur');
  const nonce=await post('challenge',{purpose});
  const signed=await fetch(BRIDGE+'/v1/assert',{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({challenge:nonce.challenge,audience:nonce.audience}),cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!signed.ok)throw Error('Autorise SWAPP dans Quantic Identity Vault (application mise à jour requise)');
  const proof=await signed.json();
  const approved=await localStatus().catch(()=>status);
  return {challenge:nonce.challenge,proof,alias:approved.label||'Utilisateur Quantic'};
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
  section.append(heading,help,button,stopButton,label,seen);
  ROOT.append(section);
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
  if(Date.now()-lastPresencePoll>=8000 && document.visibilityState==='visible'){
    lastPresencePoll=Date.now();
    await refresh();
  }
 }
 window.addEventListener('pagehide',()=>{
  if(!active)return;
  active=false;
  navigator.sendBeacon(ENDPOINT+'/lock',new Blob(['{}'],{type:'application/json'}));
 });
 const observer=new MutationObserver(()=>{if(!ROOT.querySelector('#swapp-quantic-id-presence'))build()});
 observer.observe(ROOT,{childList:true});
 build();void refresh();
 clock=window.setInterval(()=>void heartbeat(),1600);
})();
