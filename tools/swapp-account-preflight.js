'use strict';

// Read-only release gate. Checks the public SWAPP endpoints and NEVER logs
// credentials, cookies, raw server responses or individual user records.
// Run from a trusted computer/Hostinger shell before a manual redeploy.
const {accountPersistenceStatus}=require('../modules/swapp-account-durability');
const ORIGIN='https://swapp.tv';
const ROUTES=Object.freeze({
 accounts:'/api/oryon/persistence-status',
 release:'/api/release',
 mysql:'/api/swapp/interactions/status',
 social:'/api/swapp/social/release',
 upstream:'/api/pulse/health'
});

async function fetchPublicJson(path,fetchImpl=fetch){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),9000);
 try{
  const res=await fetchImpl(ORIGIN+path,{
   method:'GET',credentials:'omit',redirect:'error',
   headers:{Accept:'application/json','Cache-Control':'no-store'},
   signal:controller.signal
  });
  if(!res?.ok)return {ok:false,data:null,reason:'http_'+(Number(res?.status)||0)};
  if(!String(res.headers?.get?.('content-type')||'').includes('application/json'))
   return {ok:false,data:null,reason:'not_json'};
  const raw=await res.text();
  if(raw.length>30000)return {ok:false,data:null,reason:'oversized'};
  const parsed=JSON.parse(raw);
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))
   return {ok:false,data:null,reason:'invalid_response'};
  return {ok:true,data:parsed,reason:null};
 }catch(_){
  return {ok:false,data:null,reason:'unreachable_or_invalid'};
 }finally{clearTimeout(timer)}
}

async function inspect(fetchImpl=fetch,{minUsers=1}={}){
 const list=Object.entries(ROUTES);
 const results=await Promise.all(list.map(async([key,path])=>
   [key,await fetchPublicJson(path,fetchImpl)]));
 const checks=Object.fromEntries(results);
 const accounts=checks.accounts.data||{};
 const safeLocal=accountPersistenceStatus({
  firestoreOk:accounts.firestore===true,
  persistence:accounts.persistence,
  userCount:accounts.users
 });
 const expected=Number.isSafeInteger(minUsers)&&minUsers>0?minUsers:1;
 const accountsOk=checks.accounts.ok&&accounts.github_deploy_safe===true&&
   safeLocal.safe&&accounts.users>=expected;
 const status={
  accounts:{
   ready:accountsOk,
   users:Number.isInteger(accounts.users)?accounts.users:null,
   baseline:expected,
   reason:accountsOk?'verified':!checks.accounts.ok?checks.accounts.reason:
    !safeLocal.safe?'durability_unverified':
    accounts.users<expected?'account_count_below_baseline':'server_reports_unsafe'
  },
  release:{
   ready:checks.release.ok&&checks.release.data?.complete===true&&
    /^[a-f0-9]{64}$/.test(String(checks.release.data?.fingerprint||'')),
   reason:checks.release.reason
  },
  mysql:{
   ready:checks.mysql.ok&&checks.mysql.data?.enabled===true&&
    checks.mysql.data?.state==='database_read_ready',
   reason:checks.mysql.reason||String(checks.mysql.data?.state||'unverified')
  },
  social:{
   ready:checks.social.ok&&checks.social.data?.features?.personalInviteChannels===true,
   reason:checks.social.reason||'release_or_features_unverified'
  },
  upstream:{
   ready:checks.upstream.ok&&checks.upstream.data?.success===true,
   reason:checks.upstream.reason||'health_unverified'
  }
 };
 const blockers=Object.entries(status).filter(([,value])=>!value.ready).map(([key])=>key);
 return {readyForManualReview:blockers.length===0,blockers,status,
  note:'Read-only checks do not prove backups, successful writes, audio, account-to-account flows or a safe migration.'};
}
if(require.main===module){
 const min=Number(process.env.SWAPP_PREFLIGHT_MIN_USERS||1);
 inspect(fetch,{minUsers:min}).then(result=>{
  console.log('SWAPP — préflight lecture seule');
  for(const [name,item] of Object.entries(result.status)){
   console.log((item.ready?'PASS':'BLOCK')+' '+name+
    (name==='accounts'?' (comptes='+String(item.users??'inconnu')+', minimum='+item.baseline+')':''));
  }
  console.log(result.readyForManualReview?
   'Diagnostics publics OK ; sauvegardes et tests utilisateurs restent obligatoires.':
   'BASCULE BLOQUÉE : '+result.blockers.join(', '));
  process.exitCode=result.readyForManualReview?0:2;
 }).catch(()=>{console.error('Préflight indisponible ; aucun déploiement automatique.');process.exitCode=2;});
}
module.exports={ORIGIN,ROUTES,fetchPublicJson,inspect};
