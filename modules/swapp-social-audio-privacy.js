'use strict';
// SWAPP SOCIAL audio privacy. A block from the SWAPP UI takes effect in
// MySQL BEFORE the external SOCIAL service is notified. Both directions count.
const HANDLE=/^[a-z0-9_-]{3,40}$/i;

function createAudioPrivacy({getPool,lookupLocalUser,clock=()=>Date.now()}={}){
 if(typeof getPool!=='function'||typeof lookupLocalUser!=='function')
  throw Error('invalid_audio_privacy_configuration');
 const local=handle=>{
  const name=String(handle||'').trim().toLowerCase().replace(/^@/,'');
  if(!HANDLE.test(name))return null;
  const found=lookupLocalUser(name);
  if(!found?.id||String(found.login||'').toLowerCase()!==name)return null;
  return {id:String(found.id),handle:name};
 };
 async function blocked(a,b){
  if(!a||!b||String(a)===String(b))return true;
  const pool=getPool();
  if(!pool)throw Error('audio_privacy_unavailable');
  const [rows]=await pool.execute(
   'SELECT blocker_id FROM swapp_social_audio_blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?) LIMIT 1',
   [String(a),String(b),String(b),String(a)]
  );
  return rows.length>0;
 }
 async function allowed(a,b){return !(await blocked(a,b))}
 async function block(actor,target){
  const blocker=String(actor?.id||''),other=String(target?.id||'');
  if(!blocker||!other||blocker===other)return false;
  const pool=getPool();
  // Without MySQL, audio itself is disabled. Do not prevent the original
  // SOCIAL block from working when the optional audio subsystem is offline.
  if(!pool)return true;
  await pool.execute(
   'INSERT IGNORE INTO swapp_social_audio_blocks (blocker_id,blocked_id,created_at) VALUES (?,?,?)',
   [blocker,other,clock()]
  );
  return true;
 }
 return {local,blocked,allowed,block};
}
module.exports={createAudioPrivacy};
