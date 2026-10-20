'use strict';
/** Offline-first migration of an authorized full Pulse snapshot to Hostinger MySQL.
 * Dry-run by default. Never requests Render API, never overwrites a destination,
 * never logs sensitive snapshot content and never mutates a production source.
 */
const fs=require('node:fs');
const crypto=require('node:crypto');
const path=require('node:path');
const DDL=`CREATE TABLE IF NOT EXISTS swapp_social_native_store (
 store_key VARCHAR(40) NOT NULL PRIMARY KEY,
 data LONGTEXT NOT NULL,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
const MAX_BYTES=12*1024*1024;
const REQUIRED=['users','handles','posts','follows','likes','reposts','bookmarks','circles',
 'circleMembers','notifications','reports','blocks','conversations','messages'];
function fail(code){const e=Error(code);e.code=code;throw e}
function unpackSnapshot(snapshot){
 if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))fail('invalid_snapshot');
 const store=snapshot.store||snapshot.data||snapshot;
 if(!store||typeof store!=='object'||Array.isArray(store))fail('invalid_store');
 return store;
}
function verifyPulseSnapshot(input){
 const source=unpackSnapshot(input);
 const store=JSON.parse(JSON.stringify(source));
 for(const key of REQUIRED){
  if(!store[key]||typeof store[key]!=='object'||Array.isArray(store[key]))fail('missing_pulse_collection_'+key);
 }
 if(!Number.isSafeInteger(Number(store.version||1)))fail('invalid_store_version');
 for(const [id,user] of Object.entries(store.users)){
  if(!/^u_[a-f0-9]{24}$/.test(id)&&!/^u_[a-f0-9]{32}$/.test(id))fail('unrecognized_pulse_user_id');
  if(!user||String(user.id)!==id||!/^[a-z0-9_]{3,24}$/.test(String(user.handle||''))||
     store.handles[user.handle]!==id)fail('pulse_user_or_handle_corrupt');
  if(!user.passwordSalt||!user.passwordHash)fail('pulse_password_hash_missing');
 }
 for(const [handle,id] of Object.entries(store.handles)){
  if(!store.users[id]||store.users[id].handle!==handle)fail('orphan_pulse_handle');
 }
 for(const [id,post] of Object.entries(store.posts)){
  if(!post||String(post.id)!==id||!store.users[post.authorId])fail('post_author_missing');
  if(post.replyToId&&!store.posts[post.replyToId])fail('reply_parent_missing');
 }
 for(const [id,message] of Object.entries(store.messages)){
  if(!message||String(message.id)!==id||!store.users[message.senderId]||
      !store.users[message.recipientId])fail('message_member_missing');
 }
 for(const members of Object.values(store.follows)){
  if(!Array.isArray(members)||members.some(id=>!store.users[id]))fail('follows_corrupt');
 }
 for(const [id,conversation] of Object.entries(store.conversations)){
  if(!conversation||!Array.isArray(conversation.messageIds)||conversation.messageIds.some(mid=>!store.messages[mid]))
   fail('conversation_messages_corrupt');
 }
 // Login sessions and pending challenges are never transferred: SWAPP re-establishes
 // a fresh server-side SOCIAL session without any account or content loss.
 store.sessions={};store.quanticChallenges={};
 const serialized=JSON.stringify(store);
 if(Buffer.byteLength(serialized,'utf8')>MAX_BYTES)fail('snapshot_exceeds_safe_packet');
 const counts=Object.fromEntries(REQUIRED.map(key=>[key,Object.keys(store[key]).length]));
 if(counts.users!==Object.keys(store.handles).length)fail('user_handle_count_mismatch');
 const sha256=crypto.createHash('sha256').update(serialized).digest('hex');
 return {sha256,counts,serialized,bytes:Buffer.byteLength(serialized,'utf8')};
}
function connectionUrl(){
 const raw=process.env.SWAPP_SOCIAL_MYSQL_URL||process.env.SWAPP_MYSQL_URL||'';
 let u;try{u=new URL(raw)}catch{return fail('mysql_url_missing')}
 if(u.protocol!=='mysql:'||!u.hostname||!u.username||!u.pathname||u.pathname==='/')fail('mysql_url_invalid');
 return raw;
}
async function commitPulseSnapshot({mysql,uri,verified}){
 if(!verified||!verified.serialized||!/^[a-f0-9]{64}$/.test(verified.sha256))fail('snapshot_not_verified');
 const pool=mysql.createPool({uri,connectionLimit:2,waitForConnections:true,queueLimit:4,connectTimeout:5000});
 let conn;
 try{
  conn=await pool.getConnection();
  await conn.query(DDL);
  await conn.beginTransaction();
  const [existing]=await conn.execute(
   'SELECT data FROM swapp_social_native_store WHERE store_key=? FOR UPDATE',['pulse']);
  if(existing.length)fail('destination_already_initialized');
  await conn.execute('INSERT INTO swapp_social_native_store (store_key,data) VALUES (?,?)',
   ['pulse',verified.serialized]);
  const [readback]=await conn.execute('SELECT data FROM swapp_social_native_store WHERE store_key=?',['pulse']);
  if(readback.length!==1)fail('mysql_import_readback_missing');
  const digest=crypto.createHash('sha256').update(String(readback[0].data)).digest('hex');
  if(digest!==verified.sha256)fail('mysql_import_integrity_mismatch');
  await conn.commit();
  return {imported:true,sha256:digest,counts:verified.counts};
 }catch(e){if(conn)await conn.rollback().catch(()=>{});throw e}
 finally{if(conn)conn.release();await pool.end()}
}
async function run(argv=process.argv.slice(2)){
 const file=argv.find(arg=>!arg.startsWith('--'));
 if(!file)fail('usage: node tools/swapp-social-mysql-import.js /secure/export.json [--commit] [--sha256=<digest>]');
 const bytes=fs.readFileSync(path.resolve(file));
 if(bytes.length>MAX_BYTES)fail('snapshot_exceeds_safe_packet');
 const result=verifyPulseSnapshot(JSON.parse(bytes.toString('utf8')));
 // Never print store content, passwords, internal handles or private DMs.
 const summary={mode:argv.includes('--commit')?'commit':'dry-run',bytes:result.bytes,sha256:result.sha256,counts:result.counts};
 if(argv.includes('--commit')){
  if(process.env.SWAPP_SOCIAL_IMPORT_APPROVED!=='1')fail('explicit_import_approval_required');
  if(process.env.SWAPP_SOCIAL_BACKEND==='mysql')fail('do_not_import_into_live_backend');
  const match=argv.find(a=>a.startsWith('--sha256='))?.slice('--sha256='.length);
  if(match!==result.sha256)fail('snapshot_checksum_confirmation_required');
  const mysql=require('mysql2/promise');
  const imported=await commitPulseSnapshot({mysql,uri:connectionUrl(),verified:result});
  Object.assign(summary,imported);
 }
 process.stdout.write(JSON.stringify(summary,null,2)+'\n');
 return summary;
}
if(require.main===module)run().catch(error=>{
 process.stderr.write('SOCIAL migration refused: '+String(error.code||error.message||'error')+'\n');
 process.exitCode=1;
});
module.exports={verifyPulseSnapshot,commitPulseSnapshot,run,DDL,MAX_BYTES};
