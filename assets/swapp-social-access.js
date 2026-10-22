/* One SWAPP identity for the whole site. SOCIAL is readable without signing in. */
(()=>{'use strict';
 const root=document.getElementById('swapp-social-access');
 if(!root)return;
 const gate=root.querySelector('.swapp-social-access-gate');
 const login=document.getElementById('swapp-social-login-form');
 const register=document.getElementById('swapp-social-register-form');
 const errorLogin=document.getElementById('swapp-social-auth-error');
 const errorRegister=document.getElementById('swapp-social-register-error');
 const loginLink=document.getElementById('swapp-social-show-login');
 const registerLink=document.getElementById('swapp-social-show-register');
 const closeButton=document.getElementById('swapp-social-close-auth');
 const checkMessage=document.getElementById('swapp-social-session-error');
 if(!gate||!login||!register)return;
 let lastFocus=null,requestId=0;
 const setRoot=status=>{
  root.classList.remove('is-pending','is-guest','is-unlocked','is-locked');
  root.classList.add(status);
  // Never gate reading; the SWAPP backend still guards all writes.
 };
 const isMember=data=>Boolean(data?.success&&data?.local?.id);
 async function checkSession(){
  const r=await fetch('/api/oryon/session',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal:AbortSignal.timeout(9000)});
  if(!r.ok)throw Error('session_unavailable');
  return isMember(await r.json());
 }
 function toggleRegister(show){
  register.hidden=!show;login.hidden=show;
  registerLink.hidden=show;
  errorLogin.hidden=true;errorRegister.hidden=true;
  (show?document.getElementById('swapp-social-reg-login'):document.getElementById('swapp-social-login'))?.focus();
 }
 function open(){
  if(!gate.hidden)return;
  lastFocus=document.activeElement;
  gate.hidden=false;
  gate.classList.add('is-visible');
  document.body.classList.add('swapp-account-auth-open');
  toggleRegister(false);
 }
 function close(){
  gate.hidden=true;
  gate.classList.remove('is-visible');
  document.body.classList.remove('swapp-account-auth-open');
  lastFocus?.focus?.();
 }
 // A single, first-party SWAPP account dialog; no SOCIAL-specific identity.
 // Other SOCIAL actions dispatch this when requireAuth() fails.
 document.addEventListener('swapp:login-required',()=>{open()});
 closeButton?.addEventListener('click',close);
 registerLink?.addEventListener('click',()=>toggleRegister(true));
 loginLink?.addEventListener('click',()=>toggleRegister(false));
 gate.addEventListener('click',e=>{if(e.target===gate)close()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!gate.hidden)close()});
 async function submit(form,url,body,error){
  const button=form.querySelector('[type="submit"]');
  if(!button||button.disabled)return;
  button.disabled=true;
  const original=button.textContent;
  button.textContent='Connexion en cours…';
  error.hidden=true;
  try{
   const response=await fetch(url,{method:'POST',credentials:'same-origin',cache:'no-store',
     headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(16000)});
   const data=await response.json().catch(()=>({}));
   if(!response.ok||data?.success!==true){
    if(response.status===401)throw Error('Identifiants SWAPP invalides.');
    if(response.status===409)throw Error('Cet identifiant ou cet e-mail existe déjà.');
    if(response.status>=500)throw Error('Le compte SWAPP est momentanément indisponible.');
    throw Error(typeof data?.error==='string'?data.error:'Connexion impossible.');
   }
   if(!await checkSession())throw Error('La session SWAPP ne peut pas être confirmée.');
   form.querySelector('input[type="password"]').value='';
   close();
   setRoot('is-unlocked');
   // Reload the one SWAPP session to initialise SOCIAL and the site header.
   location.reload();
  }catch(e){
   error.textContent=e?.name==='TimeoutError'?'Le serveur SWAPP ne répond pas.':String(e.message||'Connexion impossible.');
   error.hidden=false;
  }finally{
   button.disabled=false;
   button.textContent=original;
  }
 }
 login.addEventListener('submit',e=>{
  e.preventDefault();if(!login.reportValidity())return;
  void submit(login,'/api/oryon/login',{
   login:document.getElementById('swapp-social-login').value.trim(),
   password:document.getElementById('swapp-social-password').value
  },errorLogin);
 });
 register.addEventListener('submit',e=>{
  e.preventDefault();if(!register.reportValidity())return;
  const handle=document.getElementById('swapp-social-reg-login').value.trim();
  void submit(register,'/api/oryon/register',{
   login:handle,display_name:handle,email:document.getElementById('swapp-social-reg-email').value.trim(),
   password:document.getElementById('swapp-social-reg-pass').value
  },errorRegister);
 });
 async function refresh(){
  const current=++requestId;
  try{
   const valid=await checkSession();
   if(current!==requestId)return;
   setRoot(valid?'is-unlocked':'is-guest');
   if(checkMessage)checkMessage.hidden=true;
  }catch{
   if(current!==requestId)return;
   // Connectivity failure is NOT proof of logout. Leave public content visible.
   setRoot('is-guest');
   if(checkMessage){
    checkMessage.textContent='La session ne peut pas être vérifiée actuellement.';
    checkMessage.hidden=false;
   }
  }
 }
 setRoot('is-guest');
 void refresh();
 window.addEventListener('pageshow',()=>void refresh());
})();
