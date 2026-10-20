'use strict';
/**
 * Explicit, no-migration fresh start for SWAPP SOCIAL.
 * Only inserts an isolated empty SOCIAL document in the existing Hostinger MySQL
 * database. Never deletes, truncates or overwrites old SOCIAL or SWAPP users.
 */
const {verifyPulseSnapshot,commitPulseSnapshot}=require('./swapp-social-mysql-import');

const FRESH_MARKER='fresh-v1';
const CONFIRM='NEW_SOCIAL_WITHOUT_HISTORY';

function freshPulseStore(){
  return {
    version:1,swappSocialOrigin:FRESH_MARKER,
    users:{},handles:{},sessions:{},posts:{},follows:{},
    likes:{},reposts:{},bookmarks:{},circles:{},circleMembers:{},
    notifications:{},reports:{},blocks:{},conversations:{},
    messages:{},quanticChallenges:{},quanticKeys:{}
  };
}
function freshSummary(){
  const verified=verifyPulseSnapshot(freshPulseStore());
  return {verified,summary:{
    mode:'dry-run',fresh:true,origin:FRESH_MARKER,
    sha256:verified.sha256,bytes:verified.bytes,counts:verified.counts
  }};
}
function approvedEnvironment(env){
  // SWAPP accounts may remain in Firestore; this tool creates only the separate SOCIAL MySQL store.
  if(env.SWAPP_SOCIAL_FRESH_START_APPROVED!=='1')throw Error('explicit_fresh_start_approval_required');
  if(env.SWAPP_SOCIAL_BACKEND==='mysql')throw Error('refuse_bootstrap_while_native_backend_active');
  const uri=env.SWAPP_SOCIAL_MYSQL_URL||env.SWAPP_MYSQL_URL;
  if(!uri)throw Error('hostinger_mysql_url_required');
  let parsed;
  try{parsed=new URL(uri)}catch{throw Error('hostinger_mysql_url_invalid')}
  if(parsed.protocol!=='mysql:'||!parsed.hostname||!parsed.username||
     !parsed.pathname||parsed.pathname==='/')throw Error('hostinger_mysql_url_invalid');
  return uri;
}
async function run(argv=process.argv.slice(2),env=process.env,{mysql=null}={}){
  const {verified,summary}=freshSummary();
  if(!argv.includes('--commit'))return summary;
  if(!argv.includes('--confirm='+CONFIRM))throw Error('fresh_social_history_confirmation_required');
  const uri=approvedEnvironment(env);
  const driver=mysql||require('mysql2/promise');
  const committed=await commitPulseSnapshot({mysql:driver,uri,verified});
  return {...summary,mode:'committed',imported:committed.imported};
}
if(require.main===module){
  run().then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n'))
    .catch(error=>{
      process.stderr.write('Fresh SOCIAL not initialized: '+String(error.code||error.message||'error')+'\n');
      process.exitCode=1;
    });
}
module.exports={FRESH_MARKER,CONFIRM,freshPulseStore,freshSummary,approvedEnvironment,run};
