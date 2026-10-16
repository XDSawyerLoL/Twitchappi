import { TOKEN_KEY, state, dom, initials, api } from './core.js';

export function openAuth(mode='login'){
  state.authMode=mode;
  dom.authModal.hidden=false;
  updateAuthModal();
  setTimeout(function(){document.getElementById('auth-handle').focus()},20);
}

export function closeAuth(){
  dom.authModal.hidden=true;
  dom.authError.textContent='';
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
    dom.textarea.placeholder='Écrivez une publication…';
    dom.followingLabel.textContent='Récent';
    dom.followingHelp.textContent='Les publications les plus récentes';
  }

  if(state.view==='home'){
    dom.composer.hidden=!user;
    dom.welcome.hidden=!!user;
  }
}

export function requireAuth(){
  if(state.user)return true;
  openAuth('login');
  return false;
}

export function applySession(data){
  state.token=data.token;
  state.user=data.user;
  sessionStorage.setItem(TOKEN_KEY,data.token);
  updateAccount();
}

export function clearSession(){
  state.token='';
  state.user=null;
  sessionStorage.removeItem(TOKEN_KEY);
  updateAccount();
}

export async function restoreSession(){
  if(!state.token){
    updateAccount();
    return;
  }
  try{
    const data=await api('/api/pulse/me');
    state.user=data.user;
  }catch{
    state.token='';
    sessionStorage.removeItem(TOKEN_KEY);
  }
  updateAccount();
}
