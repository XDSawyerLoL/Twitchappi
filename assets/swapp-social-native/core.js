export const API_BASE=''; // same-origin SWAPP proxy: no third-party requests from the browser
export const TOKEN_KEY='swapp_social_session_v1';
export const state={token:'',user:null,feed:'discover',view:'home',replyTo:null,quotePostId:null,authMode:'login',attachment:null};

export const dom={
  feed:document.getElementById('pulse-feed'),
  textarea:document.getElementById('pulse-text'),
  publish:document.getElementById('pulse-publish'),
  count:document.getElementById('pulse-count'),
  composer:document.getElementById('composer'),
  feedTabs:document.getElementById('feed-tabs'),
  viewTitle:document.getElementById('view-title'),
  authModal:document.getElementById('auth-modal'),
  authForm:document.getElementById('auth-form'),
  authError:document.getElementById('auth-error'),
  welcome:document.getElementById('pulse-welcome'),
  followingLabel:document.getElementById('feed-following-label'),
  followingHelp:document.getElementById('feed-following-help')
};

export function esc(v){
  return String(v||'').replace(/[&<>"']/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c];
  });
}

export function icon(name,extra=''){
  return '<svg class="pi '+extra+'" aria-hidden="true"><use href="#'+name+'"></use></svg>';
}

export function initials(user){
  const value=(user?.displayName||user?.handle||'?').trim().split(/\s+/).slice(0,2).map(function(x){return x[0]||''}).join('');
  return value.toUpperCase()||'?';
}

export function timeAgo(iso){
  const t=Date.parse(iso),d=Math.max(0,Date.now()-t),m=Math.floor(d/60000);
  if(m<1)return'maintenant';
  if(m<60)return m+' min';
  const h=Math.floor(m/60);
  if(h<24)return h+' h';
  const days=Math.floor(h/24);
  if(days<7)return days+' j';
  return new Date(t).toLocaleDateString('fr-FR',{day:'2-digit',month:'short'});
}

export function setStatus(title,text){
  dom.feed.innerHTML='<div class="pulse-status"><strong>'+esc(title)+'</strong>'+esc(text||'')+'</div>';
}

export function errorText(e){
  const map={
    unauthorized:'Compte SWAPP requis.',
    swapp_account_required:'Connecte-toi avec ton compte SWAPP.',
    social_sso_unconfigured:'Liaison SWAPP et SOCIAL non configurée côté serveur.',
    social_sso_unavailable:'Impossible de lier SOCIAL au compte SWAPP pour le moment.',
    social_identity_conflict:'Identité SOCIAL déjà utilisée. Contacte le support SWAPP.',
    swapp_session_unavailable:'La session SWAPP ne peut pas être vérifiée.',
    invalid_credentials:'Identifiant ou mot de passe incorrect.',
    handle_taken:'Cet identifiant est déjà pris.',
    invalid_handle:'Identifiant : 3 à 24 caractères, lettres minuscules, chiffres ou _.',
    weak_password:'Le mot de passe doit contenir au moins 10 caractères.',
    rate_limited:'Trop de requêtes. Réessaie plus tard.',
    not_found:'Élément introuvable.',
    forbidden:'Tu ne peux supprimer que tes propres publications.',
    social_recipient_not_ready:'Impossible de préparer la messagerie de ce membre pour le moment. Réessaie plus tard.',
    blocked:'Cette conversation est bloquée.',
    social_upstream_rate_limited:'Trop de tentatives de liaison SOCIAL. Patiente quelques minutes avant de réessayer.',
    social_upstream_timeout:'SOCIAL met trop longtemps à répondre. Le serveur peut être en cours de redémarrage. Réessaie dans quelques instants.',
    social_upstream_unavailable:'Le serveur SOCIAL est indisponible actuellement. Vérifie sa disponibilité puis réessaie.',
    social_upstream_unreachable:'SWAPP ne parvient pas à joindre le serveur SOCIAL. La connexion réseau côté serveur doit être vérifiée.',
    social_temporarily_unavailable:'Le serveur SOCIAL est temporairement indisponible. Un ancien serveur SWAPP peut encore renvoyer ce message.',
    network_error:'Connexion au service SOCIAL impossible. Recharge la page puis réessaie.',
    request_failed:'La requête SOCIAL a échoué. Réessaie dans un instant.',
    invalid_upstream_response:'SOCIAL a reçu une réponse serveur illisible. Réessaie.',
    social_migration_write_frozen:'SOCIAL est temporairement en lecture seule pendant une maintenance de données. Aucune action n’a été enregistrée.',
    social_migration_not_verified:'SOCIAL attend la validation de la migration des données. Aucun nouveau réseau vide n’a été ouvert.',
    social_mysql_import_required:'Les données historiques de SOCIAL ne sont pas encore importées.',
    social_native_backend_unavailable:'La base SOCIAL est momentanément indisponible. Tes données n’ont pas été effacées.',
    request_cancelled:'Requête annulée.'
  };
  return map[e?.message]||e?.message||'Une erreur est survenue.';
}

// Read-only requests may be retried once after a short Render cold-start or
// upstream timeout. Never retry writes automatically: doing so can duplicate
// a post, reaction or private message after an uncertain network failure.
export async function api(path,options={}){
  const method=String(options.method||'GET').toUpperCase();
  const retryableRead=method==='GET';
  const headers={'Accept':'application/json','Content-Type':'application/json',...(options.headers||{})};
  const {signal,...requestOptions}=options;
  for(let attempt=0;attempt<(retryableRead?2:1);attempt++){
    let response;
    try{
      const timeout=typeof AbortSignal!=='undefined'&&typeof AbortSignal.timeout==='function'
        ?AbortSignal.timeout(retryableRead?20000:24000):undefined;
      // An explicitly supplied signal remains authoritative for navigation cancellation.
      response=await fetch(API_BASE+path,{...requestOptions,method,headers,
        credentials:'same-origin',cache:'no-store',signal:signal||timeout});
    }catch(cause){
      if(signal?.aborted)throw Object.assign(new Error('request_cancelled'),{cause});
      if(retryableRead&&attempt===0){
        await new Promise(resolve=>setTimeout(resolve,650));
        continue;
      }
      const err=new Error(cause?.name==='TimeoutError'?'social_upstream_timeout':'network_error');
      err.cause=cause;throw err;
    }
    const data=await response.json().catch(()=>null);
    if(response.ok){
      if(data===null)throw Object.assign(new Error('invalid_upstream_response'),{status:502});
      return data;
    }
    if(retryableRead&&attempt===0&&[502,503,504].includes(response.status)){
      await new Promise(resolve=>setTimeout(resolve,650));
      continue;
    }
    const err=new Error(data?.error||(
      response.status===429?'rate_limited':
      [502,503,504].includes(response.status)?'social_upstream_unavailable':'request_failed'
    ));
    err.status=response.status;err.data=data;throw err;
  }
  throw new Error('network_error');
}
