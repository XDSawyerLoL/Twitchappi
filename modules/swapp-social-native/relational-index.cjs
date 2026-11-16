'use strict';
// Stage-1 relational projection of the existing native SOCIAL snapshot.
// No public route reads this index yet; migration + dual writes must be
// independently verified before a future read cutover.
const VERSION=1;
const SQL=Object.freeze([
  'CREATE TABLE IF NOT EXISTS swapp_social_native_posts_v2 ('+
   'id VARCHAR(80) NOT NULL PRIMARY KEY,author_id VARCHAR(80) NOT NULL,'+
   'circle_id VARCHAR(80) NULL,reply_to_id VARCHAR(80) NULL,'+
   'created_at DATETIME(3) NOT NULL,deleted_at DATETIME(3) NULL,'+
   'payload_json LONGTEXT NOT NULL,'+
   'KEY snp_author (author_id,created_at),KEY snp_feed (deleted_at,created_at),'+
   'KEY snp_reply (reply_to_id,created_at),KEY snp_circle (circle_id,created_at)) '+
   'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'CREATE TABLE IF NOT EXISTS swapp_social_native_messages_v2 ('+
   'id VARCHAR(80) NOT NULL PRIMARY KEY,conversation_key VARCHAR(180) NOT NULL,'+
   'sender_id VARCHAR(80) NOT NULL,recipient_id VARCHAR(80) NOT NULL,'+
   'created_at DATETIME(3) NOT NULL,read_at DATETIME(3) NULL,payload_json LONGTEXT NOT NULL,'+
   'KEY snm_thread (conversation_key,created_at),KEY snm_recipient (recipient_id,read_at)) '+
   'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'CREATE TABLE IF NOT EXISTS swapp_social_native_index_meta ('+
   'store_key VARCHAR(40) NOT NULL PRIMARY KEY,migration_version INT NOT NULL,'+
   'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) '+
   'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
]);
const ID=/^[a-zA-Z0-9_:-]{2,180}$/;
function mysqlDate(value,optional=false){
 if((value===undefined||value===null||value==='')&&optional)return null;
 const parsed=new Date(value);
 if(!Number.isFinite(parsed.getTime()))throw Error('social_relational_invalid_date');
 return parsed.toISOString().slice(0,23).replace('T',' ');
}
function key(value,max){
 const v=String(value||'');
 if(v.length>max||!ID.test(v))throw Error('social_relational_invalid_id');
 return v;
}
function validStore(store){
 if(!store||typeof store!=='object'||!store.posts||!store.messages||
  Array.isArray(store.posts)||Array.isArray(store.messages))throw Error('social_relational_invalid_snapshot');
 return store;
}
function serializeMap(obj){
 return new Map(Object.entries(obj).map(([id,record])=>[id,JSON.stringify(record)]));
}
function capture(store){
 validStore(store);
 return {posts:serializeMap(store.posts),messages:serializeMap(store.messages)};
}
function postRow(id,p){
 if(!p||p.id!==id)throw Error('social_relational_invalid_post');
 return [key(id,80),key(p.authorId,80),p.circleId?key(p.circleId,80):null,
  p.replyToId?key(p.replyToId,80):null,
  mysqlDate(p.createdAt),mysqlDate(p.deletedAt,true),JSON.stringify(p)];
}
function messageRow(id,m){
 if(!m||m.id!==id)throw Error('social_relational_invalid_message');
 return [key(id,80),key(m.conversationKey,180),key(m.senderId,80),
  key(m.recipientId,80),mysqlDate(m.createdAt),mysqlDate(m.readAt,true),JSON.stringify(m)];
}
const INSERT_POST='INSERT INTO swapp_social_native_posts_v2 (id,author_id,circle_id,reply_to_id,created_at,deleted_at,payload_json) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE author_id=VALUES(author_id),circle_id=VALUES(circle_id),reply_to_id=VALUES(reply_to_id),created_at=VALUES(created_at),deleted_at=VALUES(deleted_at),payload_json=VALUES(payload_json)';
const INSERT_MESSAGE='INSERT INTO swapp_social_native_messages_v2 (id,conversation_key,sender_id,recipient_id,created_at,read_at,payload_json) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE conversation_key=VALUES(conversation_key),sender_id=VALUES(sender_id),recipient_id=VALUES(recipient_id),created_at=VALUES(created_at),read_at=VALUES(read_at),payload_json=VALUES(payload_json)';
async function ensureSchema(pool){
 for(const statement of SQL)await pool.query(statement);
}
async function assertReady(conn){
 const [rows]=await conn.execute('SELECT migration_version FROM swapp_social_native_index_meta WHERE store_key=? LIMIT 1',['pulse']);
 if(rows?.[0]?.migration_version!==VERSION)throw Error('social_relational_backfill_required');
}
async function syncDelta(conn,before,after){
 validStore(after);
 await assertReady(conn);
 const cfg=[
  ['posts','swapp_social_native_posts_v2',INSERT_POST,postRow],
  ['messages','swapp_social_native_messages_v2',INSERT_MESSAGE,messageRow]
 ];
 const counts={posts:0,messages:0};
 for(const [kind,table,insert,row] of cfg){
  const old=before?.[kind];
  if(!(old instanceof Map))throw Error('social_relational_missing_baseline');
  const fresh=serializeMap(after[kind]);
  for(const [id,serialized] of fresh){
   if(old.get(id)===serialized)continue;
   await conn.execute(insert,row(id,after[kind][id]));counts[kind]++;
  }
  for(const id of old.keys())if(!fresh.has(id)){
   await conn.execute('DELETE FROM '+table+' WHERE id=?',[key(id,80)]);
   counts[kind]++;
  }
 }
 return counts;
}
async function rebuildIndex(conn,snapshot,{maxPosts=10000,maxMessages=20000}={}){
 validStore(snapshot);
 const posts=Object.entries(snapshot.posts),messages=Object.entries(snapshot.messages);
 if(posts.length>maxPosts||messages.length>maxMessages)
  throw Error('social_relational_batch_limit_exceeded');
 // Fully validate the source before changing the index. The caller must hold
 // SELECT ... FOR UPDATE on the single source snapshot and an SQL transaction.
 const postRows=posts.map(([id,row])=>postRow(id,row));
 const messageRows=messages.map(([id,row])=>messageRow(id,row));
 await conn.execute('DELETE FROM swapp_social_native_posts_v2');
 await conn.execute('DELETE FROM swapp_social_native_messages_v2');
 // One bounded prepared INSERT per batch: prevents tens of thousands of roundtrips
 // while keeping the same transactional lock and rollback semantics.
 const batchSize=64;
 for(const [table,columns,rows,updateKeys] of [
  ['swapp_social_native_posts_v2',
   ['id','author_id','circle_id','reply_to_id','created_at','deleted_at','payload_json'],
   postRows,['author_id','circle_id','reply_to_id','created_at','deleted_at','payload_json']],
  ['swapp_social_native_messages_v2',
   ['id','conversation_key','sender_id','recipient_id','created_at','read_at','payload_json'],
   messageRows,['conversation_key','sender_id','recipient_id','created_at','read_at','payload_json']]
 ]){
  for(let offset=0;offset<rows.length;offset+=batchSize){
   const part=rows.slice(offset,offset+batchSize);
   const placeholders=part.map(()=> '('+columns.map(()=>'?').join(',')+')').join(',');
   const update=updateKeys.map(col=>col+'=VALUES('+col+')').join(',');
   const sql='INSERT INTO '+table+' ('+columns.join(',')+') VALUES '+placeholders+
     ' ON DUPLICATE KEY UPDATE '+update;
   await conn.execute(sql,part.flat());
  }
 }
 await conn.execute('INSERT INTO swapp_social_native_index_meta (store_key,migration_version) VALUES (?,?) ON DUPLICATE KEY UPDATE migration_version=VALUES(migration_version),updated_at=CURRENT_TIMESTAMP',['pulse',VERSION]);
 return {posts:postRows.length,messages:messageRows.length};
}

/**
 * Verify the SQL index against the same authoritative source snapshot.
 * No user content or identifiers are returned or logged on drift.
 * A read-only REPEATABLE READ transaction keeps the two views consistent.
 */
async function verifyIndex(conn,snapshot){
 validStore(snapshot);
 await assertReady(conn);
 const result={ok:true,posts:{expected:0,actual:0,mismatched:0},messages:{expected:0,actual:0,mismatched:0}};
 const checks=[
  ['posts','swapp_social_native_posts_v2',record=>({
   author_id:record.authorId,circle_id:record.circleId||null,
   reply_to_id:record.replyToId||null
  })],
  ['messages','swapp_social_native_messages_v2',record=>({
   conversation_key:record.conversationKey,sender_id:record.senderId,
   recipient_id:record.recipientId
  })]
 ];
 for(const [kind,table,fields] of checks){
  const expected=serializeMap(snapshot[kind]);
  const [rows]=await conn.execute('SELECT id,payload_json,'+
   Object.keys(fields(Object.values(snapshot[kind])[0]||{})).join(',')+
   ' FROM '+table);
  const seen=new Set();
  const stat=result[kind];stat.expected=expected.size;stat.actual=rows.length;
  for(const row of rows){
   const source=snapshot[kind][row.id];
   // Detect duplicates, missing source rows, drifted JSON and stale indexed keys.
   const attributes=source?fields(source):null;
   const correct=Boolean(source)&&!seen.has(row.id)&&expected.get(row.id)===row.payload_json&&
    Object.entries(attributes).every(([field,value])=>row[field]===value);
   if(!correct)stat.mismatched++;
   seen.add(row.id);
  }
  for(const identifier of expected.keys())if(!seen.has(identifier))stat.mismatched++;
  if(stat.mismatched||stat.expected!==stat.actual)result.ok=false;
 }
 return result;
}

module.exports={VERSION,SQL,ensureSchema,capture,syncDelta,rebuildIndex,verifyIndex,mysqlDate,postRow,messageRow};
