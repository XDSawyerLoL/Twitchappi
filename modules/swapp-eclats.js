'use strict';
/* SWAPP Éclats: paid creator support, NEVER interchangeable with free pts de chaîne.
 * There is no checkout or mint endpoint before verified settlement/KYC/CGV.
 */
const CURRENCY='ECLAT';
const SCHEMA=Object.freeze(["CREATE TABLE IF NOT EXISTS swapp_eclats_wallets (account_id VARCHAR(80) NOT NULL PRIMARY KEY, available BIGINT UNSIGNED NOT NULL DEFAULT 0,updated_at BIGINT NOT NULL DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4","CREATE TABLE IF NOT EXISTS swapp_eclats_payment_events (provider VARCHAR(36) NOT NULL,provider_event_id VARCHAR(160) NOT NULL,buyer_id VARCHAR(80) NOT NULL,credit_amount INT UNSIGNED NOT NULL,created_at BIGINT NOT NULL,PRIMARY KEY(provider,provider_event_id),KEY eclats_paid_buyer(buyer_id,created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4","CREATE TABLE IF NOT EXISTS swapp_eclats_support_events (supporter_id VARCHAR(80) NOT NULL,creator_id VARCHAR(80) NOT NULL,support_id CHAR(36) NOT NULL,debit_amount INT UNSIGNED NOT NULL,created_at BIGINT NOT NULL,PRIMARY KEY(supporter_id,support_id),KEY eclats_creator_support(creator_id,created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"]);
function status(){return {success:true,unit:CURRENCY,label:'Éclats',symbol:'✦',
 purchasable:false,spendable:false,available_balance:null,
 note:'Les Éclats sont distincts des pts de chaîne. Paiements et soutiens payants non activés.'};}
function installEclatsStatus({app}){
 app.get('/api/swapp/eclats/status',(_req,res)=>{
  res.set('Cache-Control','no-store');
  return res.json(status());
 });
}
function createEclatsLedger({pool,verifyPayment,now=Date.now}={}){
 if(!pool||typeof verifyPayment!=='function')throw Error('eclats_verified_gateway_required');
 let schemaReady=null;
 async function ensure(){
  if(!schemaReady)schemaReady=Promise.all(SCHEMA.map(sql=>pool.query(sql)))
   .catch(e=>{schemaReady=null;throw e});
  await schemaReady;
 }
 // Only a verified FINAL euro settlement event may add purchasable units.
 // No client or admin route is allowed to invoke this without gateway proof.
 async function recordSettledPayment(payload,signature){
  const proof=await verifyPayment(payload,signature);
  if(!proof||proof.paid!==true||proof.currency!=='eur'||
   !/^[a-z_]{2,36}$/.test(String(proof.provider||''))||
   !/^[a-zA-Z0-9_:-]{8,160}$/.test(String(proof.event_id||''))||
   !/^[a-zA-Z0-9_-]{1,80}$/.test(String(proof.buyer_id||''))||
   !Number.isSafeInteger(proof.credit_amount)||proof.credit_amount<1||
   proof.credit_amount>1000000)throw Error('eclats_payment_not_verified');
  await ensure();
  const conn=await pool.getConnection();
  try{
   await conn.beginTransaction();
   const [existing]=await conn.execute(
    'SELECT provider_event_id FROM swapp_eclats_payment_events WHERE provider=? AND provider_event_id=? LIMIT 1 FOR UPDATE',
    [proof.provider,proof.event_id]);
   if(existing?.length){await conn.rollback();return {created:false,reason:'duplicate'};}
   await conn.execute('INSERT INTO swapp_eclats_payment_events (provider,provider_event_id,buyer_id,credit_amount,created_at) VALUES (?,?,?,?,?)',
    [proof.provider,proof.event_id,proof.buyer_id,proof.credit_amount,now()]);
   await conn.execute('INSERT INTO swapp_eclats_wallets (account_id,available,updated_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE available=available+VALUES(available),updated_at=VALUES(updated_at)',
    [proof.buyer_id,proof.credit_amount,now()]);
   await conn.commit();
   return {created:true,credited:proof.credit_amount,buyer_id:proof.buyer_id};
  }catch(error){try{await conn.rollback()}catch(_){}throw error}
  finally{conn.release();}
 }
 return {ensure,recordSettledPayment};
}
module.exports={CURRENCY,SCHEMA,status,installEclatsStatus,createEclatsLedger};
