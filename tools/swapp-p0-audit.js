'use strict';
/* Read-only P0 production readiness. No login, write endpoint, credential,
 * account reset, paid API, cron job, or automatic feature flag changes.
 * Run manually: npm run audit:p0
 */
const ALLOWED=new Set(['https://swapp.tv','https://www.swapp.tv','http://127.0.0.1','http://localhost']);
const ENDPOINTS=Object.freeze({
 release:'/api/release',
 accounts:'/api/oryon/persistence-status',
 social:'/api/swapp/social-native/backend-status',
 tv:'/api/swapp-tv/queue/status',
 spotlight:'/api/creator/spotlight/status',
 editorial:'/api/actus/release-status',
 news:'/api/actus',
 fairness:'/api/discovery/fair-summary'
});
const checks=[
 {key:'release',label:'Version serveur',severity:'P0',judge:d=>({
   ok:d.service==='swapp'&&d.complete===true&&/^[0-9a-f]{64}$/.test(d.fingerprint||''),
   detail:d.complete?'Empreinte présente, parité checkout/Hostinger à confirmer':'Empreinte serveur incomplète',
   action:'Déployer le checkout visé sur Hostinger et comparer npm run release:info à /api/release.'
 })},
 {key:'accounts',label:'Comptes SWAPP',severity:'P0',judge:d=>({
   ok:d.mysql===true&&String(d.persistence||'').startsWith('mysql:'),
   detail:d.mysql?'MySQL actif':'Firestore encore actif'+(Number.isInteger(d.users)?' · '+d.users+' comptes':''),
   action:'Après sauvegarde, activer les nouveaux comptes MySQL dans Hostinger ; tester deux comptes neufs, sessions, F5, mobile, SSO et liaison Twitch. Ne pas supprimer Firestore.'
 })},
 {key:'social',label:'SOCIAL MySQL',severity:'P0',judge:d=>{
   const active=d.active_backend==='mysql'&&d.mysql_reachable===true&&d.snapshot_present===true&&d.snapshot_type==='fresh'&&d.writes_frozen!==true;
   const bootstrap=d.fresh_auto_init_requested===true||d.fresh_bootstrap_authorized===true;
   return {
    ok:active&&!bootstrap,
    live:active,
    detail:active?(bootstrap?'MySQL actif ; drapeaux bootstrap encore autorisés':'MySQL prêt'):'Backend non confirmé ('+String(d.active_backend||'inconnu')+')',
    action:active&&bootstrap?'Désactiver SWAPP_SOCIAL_FRESH_START_APPROVED et SWAPP_SOCIAL_FRESH_AUTO_INIT dans Hostinger après validation du snapshot. Ne pas effacer les données.':'Vérifier disponibilité MySQL et snapshot SOCIAL sans réinitialisation.'
   };
 }},
 {key:'tv',label:'SWAPP TV',severity:'P0',judge:d=>({
   ok:d.enabled===true&&d.director_enabled===true,
   detail:!d.enabled?'File d’attente désactivée':!d.director_enabled?'File ouverte mais régie inactive':'File et régie activées',
   action:'Après validation des comptes/Twitch et des contrôles serveur, activer SWAPP_TV_QUEUE_ENABLED puis SWAPP_TV_DIRECTOR_ENABLED sur Hostinger ; vérifier un direct réel.'
 })},
 {key:'spotlight',label:'Creator Spotlight',severity:'P0',judge:d=>({
   ok:d.enabled===true&&d.accounts_mysql===true,
   detail:d.enabled?'Spotlight activé':'Spotlight désactivé'+(!d.accounts_mysql?' · comptes MySQL requis':''),
   action:'Après validation des comptes MySQL et des liaisons Twitch, activer SWAPP_SPOTLIGHT_ENABLED ; tester réservation, refus doublon, annulation et vrai jeu en direct.'
 })},
 {key:'editorial',label:'Rédaction',severity:'P1',judge:d=>({
   ok:Number.isInteger(d.releaseCount)&&d.releaseCount>0&&d.releaseCount===d.editableCount,
   detail:(d.editableCount||0)+'/'+(d.releaseCount||0)+' articles versionnés éditables',
   action:'Vérifier page publique, affiche, vidéo, sources et panneau Studio sur une publication récente.'
 })},
 {key:'news',label:'Articles publics',severity:'P0',judge:d=>{
   const articles=Array.isArray(d.articles)?d.articles:[];
   const visible=articles.filter(a=>a&&typeof a.slug==='string'&&
     /^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(a.slug)&&
     typeof a.title==='string'&&a.title.trim().length>=5&&
     (!a.status||a.status==='published'));
   const degraded=d.degraded===true;
   const newest=visible.reduce((max,a)=>{
     const time=Date.parse(a.publishedAt||'');
     return Number.isFinite(time)&&time>max?time:max;
   },0);
   return {
     ok:visible.length>0&&!degraded,
     detail:degraded?'Catalogue servi depuis un cache de secours':
       visible.length?visible.length+' article(s) publics'+
         (newest?' · dernier '+new Date(newest).toISOString().slice(0,10):''):
         'Aucun article public confirmé',
     action:degraded?
       'Rétablir le CMS et vérifier GET /api/actus sans cache de secours.':
       'Vérifier GET /api/actus, migration MySQL, publication et rendu sur /actus.'
   };
 }},
 {key:'fairness',label:'Découverte équitable',severity:'P1',judge:d=>({
   ok:d.enabled===true,
   detail:d.enabled?'Actif · mesure '+String(d.sample||'limitée'):'Désactivé',
   action:'Mesurer les clics et retours de créateurs réels ; ne pas confondre impressions agrégées et audience apportée.'
 })}
];
function evaluate(data){
 const statuses=checks.map(check=>{
  const result=data?.[check.key];
  if(!result||result.error)return {
   key:check.key,label:check.label,severity:check.severity,ok:null,
   detail:result?.error||'Réponse indisponible',action:'Rétablir puis contrôler la route '+ENDPOINTS[check.key]
  };
  return {key:check.key,label:check.label,severity:check.severity,...check.judge(result)};
 });
 const blockers=statuses.filter(s=>s.severity==='P0'&&s.ok!==true);
 const cautions=statuses.filter(s=>s.severity==='P1'&&s.ok!==true);
 return {ready_for_pilot:!blockers.length,blockers:blockers.map(x=>x.key),
  warnings:cautions.map(x=>x.key),
  note:'Préqualification technique seulement : un pilote exige encore tests réels avec deux comptes, desktop et mobile.',
  statuses};
}
function assertOrigin(raw){
 const url=new URL(raw);
 if(url.username||url.password||url.search||url.hash||url.pathname!=="/"&&url.pathname!=='')throw Error('Origin only');
 if(!ALLOWED.has(url.origin))throw Error('SWAPP origin not allowed');
 return url.origin;
}
async function collect({origin='https://swapp.tv',fetchImpl=global.fetch,timeoutMs=6000}={}){
 const base=assertOrigin(origin);
 const entries=await Promise.all(Object.entries(ENDPOINTS).map(async([key,path])=>{
  const ac=new AbortController();
  const timeout=setTimeout(()=>ac.abort(),timeoutMs);
  try{
   const response=await fetchImpl(base+path,{method:'GET',headers:{Accept:'application/json'},cache:'no-store',redirect:'error',signal:ac.signal});
   if(!response.ok)return[key,{error:response.status===403?
     'HTTP 403 · vérification externe bloquée (protection possible, panne visiteur non démontrée)':
     'HTTP '+response.status}];
   const type=response.headers?.get?.('content-type')||'';
   if(!type.includes('json'))return[key,{error:'Contenu non JSON'}];
   const payload=await response.json();
   if(key==='news'&&response.headers?.get?.('x-swapp-editorial-state')==='verified-stale'&&
      payload&&typeof payload==='object')payload.degraded=true;
   return[key,payload];
  }catch(error){return[key,{error:error?.name==='AbortError'?'Délai dépassé':'Contrôle indisponible'}]}
  finally{clearTimeout(timeout)}
 }));
 return evaluate(Object.fromEntries(entries));
}
async function main(){
 const origin=process.env.SWAPP_P0_URL||'https://swapp.tv';
 const report=await collect({origin});
 if(process.argv.includes('--json'))console.log(JSON.stringify(report,null,2));
 else{
  console.log('SWAPP P0 · audit non destructif · '+origin);
  for(const s of report.statuses)console.log((s.ok===true?'[OK]':s.ok===false?'[BLOQUÉ]':'[INCONNU]')+' '+s.label+' : '+s.detail+'\n  Suite : '+s.action);
  console.log('Pilote technique : '+(report.ready_for_pilot?'PRÉQUALIFIÉ (tests manuels obligatoires)':'NON PRÊT')+' · '+report.blockers.length+' blocage(s) P0');
 }
 if(!report.ready_for_pilot)process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error('P0 audit impossible : '+String(e.message||e));process.exitCode=2});
module.exports={ENDPOINTS,assertOrigin,evaluate,collect};
