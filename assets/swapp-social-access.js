/* SWAPP local login for SOCIAL. The only identity authority is /api/oryon/*. */
(()=>{'use strict';
 const box=document.getElementById('swapp-social-access');
 if(!box)return;
 const content=box.querySelector('.swapp-social-access-content');
 const gate=box.querySelector('.swapp-social-access-gate');
 const note=gate?.querySelector('p');
 const loginForm=document.getElementById('swapp-social-login-form');
 const registerForm=document.getElementById('swapp-social-register-form');
 const loginError=document.getElementById('swapp-social-auth-error');
 const registerError=document.getElementById('swapp-social-register-error');
 const loginToggle=document.getElementById('swapp-social-show-login');
 const registerToggle=document.getElementById('swapp-social-show-register');
 if(!gate||!content||!loginForm||!registerForm)return;

 function setAccess(unlocked){
   box.classList.remove('is-pending','is-locked','is-unlocked');
   box.classList.add(unlocked?'is-unlocked':'is-locked');
   content.setAttribute('aria-hidden',unlocked?'false':'true');
   content.inert=!unlocked;
 }
 async function session(){
   const response=await fetch('/api/oryon/session',{
     method:'GET',credentials:'same-origin',cache:'no-store',
     headers:{Accept:'application/json'},signal:AbortSignal.timeout(9000)
   });
   if(!response.ok)throw Error('session_unavailable');
   const data=await response.json();
   // Twitch alone does not authorize SOCIAL. Require a SWAPP local account.
   return Boolean(data?.success&&data?.local?.id);
 }
 async function check(){
   try{return setAccess(await session())}
   catch{
     if(note)note.textContent='Connexion non vérifiée. Connecte-toi à ton compte SWAPP pour accéder à SOCIAL.';
     setAccess(false);
   }
 }
 function showRegister(show){
   registerForm.hidden=!show;
   loginForm.hidden=show;
   registerToggle.hidden=show;
   if(loginError)loginError.hidden=true;
   if(registerError)registerError.hidden=true;
   (show?document.getElementById('swapp-social-reg-login'):document.getElementById('swapp-social-login'))?.focus();
 }
 registerToggle?.addEventListener('click',()=>showRegister(true));
 loginToggle?.addEventListener('click',()=>showRegister(false));

 async function submit(form,url,body,error){
   const button=form.querySelector('button[type="submit"]');
   if(!button||button.disabled)return;
   button.disabled=true;
   const original=button.textContent;
   button.textContent='Connexion en cours…';
   error.hidden=true;
   try{
     const response=await fetch(url,{
       method:'POST',credentials:'same-origin',cache:'no-store',
       headers:{Accept:'application/json','Content-Type':'application/json'},
       body:JSON.stringify(body),signal:AbortSignal.timeout(16000)
     });
     const data=await response.json().catch(()=>({}));
     if(!response.ok||data?.success!==true){
       if(response.status===401)throw Error('Identifiants SWAPP invalides.');
       if(response.status===409)throw Error('Cet identifiant ou cet e-mail existe déjà.');
       if(response.status>=500)throw Error('Connexion SWAPP temporairement indisponible.');
       throw Error(typeof data?.error==='string'?data.error:'Impossible de se connecter.');
     }
     // Login endpoint saves the session cookie before responding. Verify local ID.
     if(!await session())throw Error('Session SWAPP non reconnue après connexion. Réessaie.');
     form.querySelector('input[type="password"]').value='';
     setAccess(true);
     // Refresh the SWAPP account header and SOCIAL using the new first-party session.
     window.location.replace('/communaute');
   }catch(e){
     error.textContent=e?.name==='TimeoutError'?'Le serveur SWAPP ne répond pas. Réessaie.':String(e?.message||'Connexion impossible.');
     error.hidden=false;
   }finally{
     button.disabled=false;
     button.textContent=original;
   }
 }
 loginForm.addEventListener('submit',event=>{
   event.preventDefault();
   if(!loginForm.reportValidity())return;
   submit(loginForm,'/api/oryon/login',{
     login:document.getElementById('swapp-social-login').value.trim(),
     password:document.getElementById('swapp-social-password').value
   },loginError);
 });
 registerForm.addEventListener('submit',event=>{
   event.preventDefault();
   if(!registerForm.reportValidity())return;
   const login=document.getElementById('swapp-social-reg-login').value.trim();
   submit(registerForm,'/api/oryon/register',{
     login,display_name:login,
     email:document.getElementById('swapp-social-reg-email').value.trim(),
     password:document.getElementById('swapp-social-reg-pass').value
   },registerError);
 });
 check();
 window.addEventListener('pageshow',check);
})();