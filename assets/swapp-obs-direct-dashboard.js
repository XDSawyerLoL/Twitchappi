/* SWAPP OBS Direct: no SWAPP Local program, one-time OBS HLS service setup. */
(function(){
'use strict';
const $=(s,root=document)=>root.querySelector(s);
const make=(tag,cls,label)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(label!==undefined)e.textContent=label;return e};
let lastPanel=null,lastRefresh=0,refreshing=false;
const serviceName='SWAPP Live (HTTPS HLS)';
const presetUrl='/assets/swapp-obs-hls-preset.json';
const setupUrl='https://github.com/XDSawyerLoL/Twitchappi/blob/master/tools/configurer-obs-swapp-hls.ps1';
const validRoom=s=>/^[a-z0-9_][a-z0-9_-]{1,39}$/.test(String(s||''));
function manager(){
 const page=$('#manager');
 return page?.classList.contains('active')?page:null;
}
function account(){
 try{return typeof state!=='undefined'?state.session?.local:null}catch(_){return null}
}
async function json(url){
 const response=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
 const data=await response.json().catch(()=>({}));
 if(!response.ok||data.success===false)throw Error(data.error||'Configuration indisponible');
 return data;
}
function button(text,cls,callback){
 const b=make('button',cls,text);b.type='button';b.addEventListener('click',callback);return b;
}
function card(){
 const page=manager(),user=account();
 if(!page||!user||!validRoom(user.login))return null;
 const hero=$('.managerHero',page),workspace=$('.swapp-creator-main',page);
 if(!hero||!workspace)return null;
 let panel=$('#swapp-obs-direct',page);
 if(panel)return panel;
 panel=make('section','swapp-obs-direct');
 panel.id='swapp-obs-direct';
 const top=make('header','swapp-obs-direct-header');
 const title=make('div','');
 title.append(make('span','swapp-obs-direct-overline','DIFFUSION OBS NATIVE'),
  make('h2','', 'Diffuser depuis OBS, directement sur SWAPP'),
  make('p','', 'Plus besoin de SWAPP Local. OBS envoie les segments HLS vers swapp.tv en HTTPS.'));
 top.append(title,make('span','swapp-obs-direct-live','Vérification…'));
 panel.append(top);
 const fields=make('div','swapp-obs-direct-grid');
 const server=make('section','swapp-obs-direct-setup');
 server.append(make('h3','','1. Configuration OBS (une seule fois)'),
  make('p','','Ajoute le service SWAPP Live (HTTPS HLS) à OBS, puis sélectionne-le dans Paramètres > Stream. La méthode native utilise le protocole HLS, pas RTMP.'));
 const setup=make('div','swapp-obs-direct-actions');
 const download=make('a','btn secondary','Configurer OBS sur Windows');
 download.href=setupUrl;download.target='_blank';download.rel='noopener noreferrer';
 const preset=make('a','btn secondary','Voir le préréglage HLS');
 preset.href=presetUrl;preset.target='_blank';preset.rel='noopener noreferrer';
 setup.append(download,preset);
 server.append(setup);
 const key=make('section','swapp-obs-direct-secret');
 key.append(make('h3','','2. Clé personnelle OBS'),
  make('p','','Copie ta clé dans le champ « Clé de stream » d’OBS. Ne la partage jamais.'));
 const hidden=make('input','swapp-obs-key');hidden.type='password';hidden.readOnly=true;
 hidden.value='Chargement…';hidden.setAttribute('aria-label','Clé privée OBS');
 hidden.setAttribute('autocomplete','off');
 const line=make('div','swapp-obs-direct-keyline');
 const reveal=button('Afficher','',()=>{hidden.type=hidden.type==='password'?'text':'password';reveal.textContent=hidden.type==='password'?'Afficher':'Masquer'});
 const copy=button('Copier','',()=>{
  if(!/^[a-f0-9]{48}$/i.test(hidden.value))return;
  void navigator.clipboard?.writeText(hidden.value);
 });
 line.append(hidden,reveal,copy);key.append(line);
 const status=make('p','swapp-obs-direct-status','');
 status.setAttribute('role','status');
 key.append(status);
 fields.append(server,key);panel.append(fields);
 const ready=make('div','swapp-obs-direct-ready');
 ready.append(make('strong','','3. Dans OBS : Démarrer le streaming'),
  make('span','', 'SWAPP publiera automatiquement le direct dès réception de segments vidéo valides. Le titre et la catégorie se changent dans le dashboard.'));
 panel.append(ready);
 const diag=make('div','swapp-obs-direct-diagnostic');
 diag.setAttribute('role','status');diag.setAttribute('aria-live','polite');
 diag.append(make('strong','','Réception OBS : en attente des premiers fragments'),
  make('p','','Le diagnostic distinguera les requêtes reçues, les segments, la playlist et les erreurs serveur.'));
 const probe=make('div','swapp-obs-direct-probe');
 const testButton=button('Tester la connexion HTTPS OBS','btn secondary',async()=>{
  testButton.disabled=true;
  const output=$('.swapp-obs-direct-probe-result',probe);
  output.textContent='Vérification de HTTP PUT…';
  try{
   const reply=await fetch('/api/swapp/obs-hls/ping',{
    method:'PUT',credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}
   });
   const data=await reply.json().catch(()=>({}));
   if(!reply.ok||!data.http_put_forwarded||reply.headers.get('X-Swapp-Obs-Put')!=='reachable')
    throw Error('Le test HTTP PUT ne traverse pas correctement le serveur (HTTP '+reply.status+').');
   output.textContent='Connexion HTTP PUT opérationnelle. Vérifie maintenant la clé et les segments OBS.';
  }catch(error){output.textContent='Échec du test : '+String(error.message||error)+'. Vérifie la version déployée et les règles HTTP PUT Hostinger.'}
  finally{testButton.disabled=false}
 });
 probe.append(testButton,make('span','swapp-obs-direct-probe-result',''));
 panel.append(diag,probe);
 workspace.insertBefore(panel,hero);
 // This old OBS/local card is still used by legacy streamers but no longer
 // appears as a required installation in the direct OBS workflow.
 const old=page.querySelector('#oryonLivePanel');
 if(old){old.hidden=true;old.style.display='none';}
 const modes=page.querySelectorAll('.streamModeGrid .modeCard');
 if(modes.length>=2){
  const heading=modes[0]?.querySelector('h2');
  if(heading)heading.textContent='OBS → SWAPP (direct)';
  const details=modes[0]?.querySelector('p');
  if(details)details.textContent='OBS seul. Aucun agent intermédiaire.';
  const browser=modes[1]?.querySelector('h2');
  if(browser)browser.textContent='Capture navigateur (option)';
  const other=modes[1]?.querySelector('p');
  if(other)other.textContent='Partager ton écran ou ta caméra sans OBS.';
 }
 const managerHead=page.querySelector('.pageHead h1');
 if(managerHead)managerHead.textContent='Gestionnaire de diffusion SWAPP';
 const sub=page.querySelector('.pageHead p');
 if(sub)sub.textContent='Choisis OBS pour diffuser directement sur ta chaîne, ou la capture navigateur en alternative.';
 void getKey(panel);
 return panel;
}
async function getKey(panel){
 const target=$('.swapp-obs-key',panel),notice=$('.swapp-obs-direct-status',panel);
 try{
  const response=await json('/api/oryon/stream-key');
  if(!panel.isConnected)return;
  const key=String(response.stream_key||'');
  if(!/^[a-f0-9]{48}$/i.test(key))throw Error('Clé de stream non valide');
  target.value=key;
  notice.textContent='Clé SWAPP prête. Elle ne doit être saisie qu’une seule fois dans OBS.';
 }catch(e){if(panel.isConnected){target.value='Indisponible';notice.textContent=e.message}}
}
async function refresh(){
 const panel=card(),user=account();
 if(!panel||!user||refreshing||Date.now()-lastRefresh<7000)return;
 lastRefresh=Date.now();refreshing=true;
 const badge=$('.swapp-obs-direct-live',panel);
 try{
  const result=await json('/api/swapp/obs-hls/diagnostics');
  if(!panel.isConnected)return;
  badge.textContent=result.active?'En direct sur SWAPP':'En attente du flux OBS';
  badge.dataset.live=result.active?'true':'false';
  const detail=$('.swapp-obs-direct-diagnostic',panel);
  const heading=$('strong',detail),message=$('p',detail);
  const messages={
   live:['Signal vidéo reçu','La playlist et les segments vidéo sont valides. Le lecteur public peut récupérer le flux.'],
   no_upload:['Aucune requête OBS reçue','OBS signale peut-être une émission, mais SWAPP ne reçoit aucun envoi HLS. Vérifie que le service OBS est bien « SWAPP Live (HTTPS HLS) », que la clé correspond et que le proxy Hostinger autorise HTTP PUT.'],
   upload_detected:['Connexion OBS détectée','Le serveur reçoit les requêtes. Il attend le premier segment vidéo et une playlist HLS complète.'],
   segments_only:['Segments reçus, playlist manquante','Les fragments vidéo arrivent, mais aucune playlist valide ne permet encore de les lire. Vérifie le débit, l’encodeur H.264/AAC et l’intervalle d’images clés de deux secondes.'],
   upload_stale:['Transmission OBS interrompue','SWAPP a reçu un envoi auparavant, mais aucun nouveau fragment depuis plus d’une minute. Vérifie le journal OBS et la connexion.'],
   rejected:['Requête refusée par SWAPP','Le serveur a reçu des fragments, mais a refusé une requête. Le code HTTP ci-dessous permet de localiser la cause.']
  };
  const lines=messages[result.stage]||['État du relais inconnu','Actualise cette page et vérifie la réception.'];
  const errors={
   400:'Nom de fichier HLS ou contenu invalide.',
   401:'Jeton manquant.',
   403:'Clé OBS refusée.',
   409:'La playlist référence des fragments vidéo qui ne sont pas encore présents.',
   413:'Fragment trop volumineux ou mémoire du relais saturée.',
   422:'La validation HLS a rejeté un segment ou une playlist. Le détail ci-dessous précise lequel.',
   429:'Capacité ou débit autorisé dépassé.',
   503:'Service d’authentification ou de relais indisponible.'
  };
  heading.textContent=lines[0];
  const failedMedia=result.last_error_file_type==='playlist'?'playlist HLS':result.last_error_file_type==='segment'?'segment vidéo':'fichier';
  const errorReason={
   playlist_segment_uri:'L’URL d’un segment dans la playlist ne correspond pas au format OBS SWAPP.',
   playlist_unsupported_feature:'Playlist chiffrée ou fonctionnalités HLS non compatibles avec le relais actuel.',
   playlist_duration:'Durée de segment incorrecte.',playlist_header:'En-tête HLS invalide.',
   playlist_empty:'Playlist sans segment.',mpegts_sync_byte_missing:'Segment MPEG-TS non reconnu.'
  };
  message.textContent=lines[1]+(result.last_error_code?' Dernier refus HTTP '+result.last_error_code+
   ' ('+failedMedia+') : '+(errorReason[result.last_error_reason]||errors[result.last_error_code]||'voir les journaux serveur.'):'')+
   (result.last_put_at?' · Dernier contact OBS : '+new Date(result.last_put_at).toLocaleTimeString('fr-FR'):'');
  detail.dataset.stage=result.stage||'unknown';
  // "HLS reçu" only proves segments and a playlist exist. MPEG-TS may still
  // contain HEVC/AV1 instead of browser-decodable H.264.
  if(result.active){
   try{
    const playback=await json('/api/oryon/local-relay/'+encodeURIComponent(user.login)+'/probe');
    if(!panel.isConnected)return;
    const tracks=playback.media;
    if(tracks?.pmt && tracks.video_browser_compatible===false){
     const detected=(tracks.tracks||[]).map(x=>x.codec).filter(Boolean).join(', ');
     message.textContent+=' Attention : la piste vidéo détectée ('+(detected||'inconnue')+
      ') n’est pas H.264. Sélectionne H.264 dans OBS pour assurer la lecture.';
    }else if(tracks?.valid && tracks?.pat===false){
     message.textContent+=' Attention : les segments MPEG-TS reçus ne contiennent pas de table PAT reconnue. Vérifie le format HLS MPEG-TS dans OBS.';
    }
   }catch(_){}
  }
 }catch(error){if(panel.isConnected){
   badge.textContent='Diagnostic de réception indisponible';
   const detail=$('.swapp-obs-direct-diagnostic',panel);
   if(detail){
    const head=$('strong',detail),msg=$('p',detail);
    head.textContent='Impossible de lire le diagnostic OBS';
    msg.textContent='Le serveur n’expose pas encore la nouvelle route de diagnostic, ou la session a expiré. Vérifie le déploiement Hostinger. '+String(error.message||'');
   }
  }}
 finally{refreshing=false}
}
const timer=setInterval(()=>{if(manager())void refresh()},4500);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){lastRefresh=0;void refresh()}});
window.addEventListener('popstate',()=>{lastRefresh=0;void refresh()});
window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
void refresh();
})();
