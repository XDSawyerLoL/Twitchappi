import { TOKEN_KEY, state, dom, initials, api, errorText } from './core.js';

let lastSocialSessionError=null;
let sessionRetryPromise=null;

function showConnectionNotice(message,{recovered=false}={}){
 const target=dom.feed;
 if(!target?.parentNode)return;
 let banner=document.getElementById('swapp-social-connection-notice');
 if(!banner){
  banner=document.createElement('div');
  banner.id='swapp-social-connection-notice';
  banner.className='swapp-social-connection-notice';
  banner.setAttribute('role','status');
  banner.setAttribute('aria-live','polite');
  const copy=document.createElement('p');
  const button=document.createElement('button');
  button.type='button';
  button.textContent='Réessayer la liaison';
  button.addEventListener('click',()=>openAuth());
  banner.append(copy,button);
  target.parentNode.insertBefore(banner,target);
 }
 banner.querySelector('p').textContent=message;
 banner.querySelector('button').hidden=recovered;
 banner.hidden=false;
}
function clearConnectionNotice(){
 const banner=document.getElementById('swapp-social-connection-notice');
 if(banner)banner.hidden=true;
}

export function openAuth(){
 // The gate is the only real login authority. Do not show a duplicate login
 // dialog when SOCIAL upstream fails while the SWAPP account is valid.
 const gate=document.getElementById('swapp-social-access');
 if(gate&&!gate.classList.contains('is-unlocked')){
  document.dispatchEvent(new CustomEvent('swapp:login-required'));
  return;
 }
 if(sessionRetryPromise)return;
 showConnectionNotice('Vérification de la liaison avec SOCIAL en cours…');
 sessionRetryPromise=restoreSession().then(ok=>{
  if(ok)showConnectionNotice('Connexion SOCIAL rétablie. Tu peux reprendre ton action.',{recovered:true});
  else showConnectionNotice(
   lastSocialSessionError?errorText(lastSocialSessionError):'La liaison SOCIAL ne répond pas. Réessaie.'
  );
 }).finally(()=>{sessionRetryPromise=null});
}

export function closeAuth(){
  if(dom.authModal)dom.authModal.hidden=true;
  if(dom.authError)dom.authError.textContent='';
}

export function updateAuthModal(){
  const register=state.authMode==='register';
  document.getElementById('auth-title').textContent=register?'Créer un compte':'Se connecter';
  document.getElementById('auth-copy').textContent=register?'Choisis ton identité SOCIAL. Ton nom civil n’est pas obligatoire.':'Retrouve ton fil, tes abonnements, tes messages et tes cercles.';
  document.getElementById('display-name-field').hidden=!register;
  document.getElementById('auth-switch').textContent=register?'J’ai déjà un compte':'Créer un compte';
  document.getElementById('auth-password').autocomplete=register?'new-password':'current-password';
}

export function updateAccount(){
  const user=state.user;
  const name=document.getElementById('account-name');
  const handle=document.getElementById('account-handle');
  const avatar=document.getElementById('account-avatar');
  const composerAvatar=document.getElementById('composer-avatar');
  const button=document.getElementById('auth-button');

  if(user){
    if(name)name.textContent=user.displayName;
    if(handle)handle.textContent='@'+user.handle;
    if(avatar)avatar.textContent=initials(user);
    if(composerAvatar)composerAvatar.textContent=initials(user);
    if(button)button.textContent='@'+user.handle;
    dom.textarea.placeholder='Écrivez une publication…';
    dom.followingLabel.textContent='Abonnements';
    dom.followingHelp.textContent='Les comptes que vous suivez';
  }else{
    if(name)name.textContent='Compte SOCIAL';
    if(handle)handle.textContent='Identité locale SOCIAL';
    if(avatar)avatar.textContent='?';
    if(composerAvatar)composerAvatar.textContent='?';
    if(button)button.textContent='Compte SOCIAL';
    dom.textarea.placeholder='Connecte-toi à SWAPP pour participer…';
    dom.followingLabel.textContent='Récent';
    dom.followingHelp.textContent='Les publications les plus récentes';
  }

  if(state.view==='home'){
    dom.composer.hidden=state.feed==='news';
    dom.welcome.hidden=true;
  }
}

export function requireAuth(){
  if(state.user)return true;
  openAuth('login');
  return false;
}

export function applySession(data){
  // Upstream tokens never reach browser storage.
  state.token='';
  state.user=data.user||null;
  try{sessionStorage.removeItem(TOKEN_KEY)}catch{}
  lastSocialSessionError=null;
  clearConnectionNotice();
  updateAccount();
}

export function clearSession(){
  state.token='';
  state.user=null;
  try{sessionStorage.removeItem(TOKEN_KEY)}catch{}
  updateAccount();
}

export async function restoreSession(){
  state.token='';
  try{sessionStorage.removeItem(TOKEN_KEY)}catch{}
  try{
    const data=await api('/api/pulse/me');
    state.user=data.user||null;
    lastSocialSessionError=null;
    if(state.user)clearConnectionNotice();
  }catch(error){
    // Keep the explicit failure reason; an authenticated SWAPP account is not
    // equivalent to a successful SOCIAL upstream session.
    lastSocialSessionError=error;
    state.user=null;
  }
  updateAccount();
  return Boolean(state.user);
}
