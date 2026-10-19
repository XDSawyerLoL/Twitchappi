'use strict';
// First-party SWAPP account store, using the EXISTING Hostinger MySQL database.
// No Firestore, no local JSON fallback. Individual rows preserve stable user IDs.
const MAX_USERS=10000,MAX_RECORD_BYTES=512000;
const DDL=`CREATE TABLE IF NOT EXISTS swapp_oryon_accounts (
  user_id VARCHAR(80) NOT NULL PRIMARY KEY,
  login VARCHAR(40) NOT NULL,
  email VARCHAR(191) NOT NULL,
  payload_json JSON NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE KEY swapp_oryon_login_unique (login),
  UNIQUE KEY swapp_oryon_email_unique (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

function validateUri(uri){
 let parsed;
 try{parsed=new URL(String(uri||''))}catch{throw Error('mysql_accounts_url_missing_or_invalid')}
 if(parsed.protocol!=='mysql:'||!parsed.username||!parsed.hostname||!parsed.pathname||parsed.pathname==='/')
  throw Error('mysql_accounts_url_missing_or_invalid');
 if(['host','hostname','your-host','localhost.example'].includes(parsed.hostname.toLowerCase()))
  throw Error('mysql_accounts_placeholder_host');
 return parsed.href;
}
function accountRow(user){
 if(!user||typeof user!=='object'||Array.isArray(user))throw Error('mysql_accounts_invalid_record');
 const id=String(user.id||''),login=String(user.login||''),email=String(user.email||'').toLowerCase();
 if(!/^[a-zA-Z0-9_-]{3,80}$/.test(id)||!/^[a-z0-9_-]{3,40}$/.test(login)||
    email.length>191||!/^\S+@\S+\.\S+$/.test(email))
  throw Error('mysql_accounts_invalid_record');
 const payload=JSON.stringify(user);
 if(Buffer.byteLength(payload,'utf8')>MAX_RECORD_BYTES)throw Error('mysql_accounts_record_too_large');
 return {id,login,email,payload};
}
function createMysqlAccountsRecovery({isReady,load,now=Date.now,retryDelayMs=5000}={}){
 if(typeof isReady!=='function'||typeof load!=='function')throw Error('mysql_accounts_recovery_invalid');
 let retryAfter=0,inFlight=null;
 async function ensure(){
  if(isReady())return true;
  if(inFlight){
   await inFlight;
   return !!isReady();
  }
  const current=Number(now());
  if(Number.isFinite(current)&&current<retryAfter)return false;
  retryAfter=(Number.isFinite(current)?current:Date.now())+Math.max(1000,Number(retryDelayMs)||5000);
  inFlight=Promise.resolve().then(load).catch(()=>{}).finally(()=>{inFlight=null});
  await inFlight;
  return !!isReady();
 }
 return {ensure};
}
function createMysqlAccountsStore({uri,pool,mysqlFactory}={}){
 let client=pool||null,initPromise=null,queue=Promise.resolve(),ready=false;
 async function ensure(){
  if(!initPromise){
   initPromise=(async()=>{
    if(!client){
     const valid=validateUri(uri);
     const factory=mysqlFactory||require('mysql2/promise');
     client=factory.createPool({uri:valid,connectionLimit:5,waitForConnections:true,
      queueLimit:50,connectTimeout:5000,enableKeepAlive:true});
    }
    await client.query(DDL);
    ready=true;
   })().catch(err=>{ready=false;initPromise=null;throw err});
  }
  await initPromise;
 }
 async function load(){
  await queue;await ensure();
  const [rows]=await client.execute('SELECT payload_json FROM swapp_oryon_accounts ORDER BY login ASC');
  if(!Array.isArray(rows)||rows.length>MAX_USERS)throw Error('mysql_accounts_invalid_result');
  const users=rows.map(row=>{
   let data=row.payload_json;
   if(typeof data==='string')data=JSON.parse(data);
   accountRow(data);
   return data;
  });
  return users;
 }
 async function save(users){
  if(!Array.isArray(users)||users.length>MAX_USERS)
   throw Error('mysql_accounts_invalid_snapshot');
  // Snapshot mutable application objects BEFORE entering the async write queue.
  const records=users.map(accountRow);
  if(new Set(records.map(r=>r.id)).size!==records.length||
     new Set(records.map(r=>r.login)).size!==records.length||
     new Set(records.map(r=>r.email)).size!==records.length)
   throw Error('mysql_accounts_duplicate_identity');
  const work=async()=>{
   await ensure();
   const conn=await client.getConnection();
   try{
    await conn.beginTransaction();
    // Explicitly forbid accidental empty writes over populated accounts.
    if(records.length===0){
     const [existing]=await conn.execute('SELECT user_id FROM swapp_oryon_accounts LIMIT 1');
     if(existing.length)throw Error('mysql_accounts_refuse_empty_overwrite');
    }
    const stamp=Date.now();
    for(const record of records){
     const [found]=await conn.execute('SELECT user_id FROM swapp_oryon_accounts WHERE user_id=? FOR UPDATE',[record.id]);
     if(found.length){
      await conn.execute('UPDATE swapp_oryon_accounts SET login=?,email=?,payload_json=?,updated_at=? WHERE user_id=?',
       [record.login,record.email,record.payload,stamp,record.id]);
     }else{
      await conn.execute('INSERT INTO swapp_oryon_accounts (user_id,login,email,payload_json,updated_at) VALUES (?,?,?,?,?)',
       [record.id,record.login,record.email,record.payload,stamp]);
     }
    }
    // NO DELETE: a partial cache cannot erase existing accounts.
    await conn.commit();
   }catch(error){
    try{await conn.rollback()}catch(_){}
    throw error;
   }finally{conn.release()}
  };
  const next=queue.then(work);
  queue=next.catch(()=>{});
  await next;
  return {mysql:true,persistence:'mysql:swapp_oryon_accounts',users:records.length};
 }
 return {ensure,load,save,get ready(){return ready}};
}
module.exports={createMysqlAccountsStore,createMysqlAccountsRecovery,accountRow,validateUri,DDL};
