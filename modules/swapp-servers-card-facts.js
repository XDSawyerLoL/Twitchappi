'use strict';
/* Read-only public proof for compact server cards.
 * Never fabricate a Discord presence, game occupancy, capacity, reviews or active team counts.
 * Fixed Discord API host; no URL from the owner is fetched directly.
 */
const {inviteCode}=require('./swapp-servers-discord');
const ID=/^[a-f0-9]{32}$/;
const cache=new Map();
const clamp=value=>Number.isSafeInteger(value)&&value>=0&&value<=100000000?value:null;
const size=value=>{const n=Number(value);return Number.isSafeInteger(n)&&n>=0&&n<=100000000?n:null};
function capacityValue(raw){
 if(raw===null||raw===undefined||String(raw).trim()==='')return null;
 const s=String(raw).trim();
 if(!/^[1-9]\d{0,5}$/.test(s))return NaN;
 const n=Number(s);return n>=1&&n<=100000?n:NaN;
}
const specsSql='CREATE TABLE IF NOT EXISTS swapp_game_server_specs (server_id CHAR(32) PRIMARY KEY,capacity INT UNSIGNED NOT NULL,CONSTRAINT swapp_specs_server_fk FOREIGN KEY (server_id) REFERENCES swapp_game_servers(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
async function ensureSpecsTable(sql){await sql.query(specsSql)}
async function saveCapacity(conn,id,raw){
 if(!ID.test(String(id)))throw Error('invalid_server_id');
 const capacity=capacityValue(raw);
 if(Number.isNaN(capacity))throw Error('invalid_capacity');
 try{
  if(capacity===null)await conn.execute('DELETE FROM swapp_game_server_specs WHERE server_id=?',[id]);
  else await conn.execute('INSERT INTO swapp_game_server_specs(server_id,capacity) VALUES (?,?) ON DUPLICATE KEY UPDATE capacity=VALUES(capacity)',[id,capacity]);
 }catch(e){if(capacity===null&&e?.code==='ER_NO_SUCH_TABLE')return;throw e}
}
async function readCapacity(sql,id){
 try{
  const [rows]=await sql.execute('SELECT capacity FROM swapp_game_server_specs WHERE server_id=? LIMIT 1',[id]);
  return capacityValue(rows[0]?.capacity);
 }catch(e){if(!['ER_NO_SUCH_TABLE','ER_TABLEACCESS_DENIED_ERROR'].includes(e?.code))console.warn('[SWAPP SPECS]',String(e?.code||e?.message||e).slice(0,70));return null}
}
async function discordSnapshot(invite,{fetcher=globalThis.fetch,now=Date.now(),timeoutMs=2200}={}){
 const code=inviteCode(invite);
 if(!code||typeof fetcher!=='function')return null;
 const existing=cache.get(code);
 if(existing&&existing.expires>now)return existing.promise;
 const promise=(async()=>{
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  timeout.unref?.();
  try{
   const res=await fetcher('https://discord.com/api/v10/invites/'+encodeURIComponent(code)+'?with_counts=true',{
    signal:controller.signal,redirect:'error',headers:{Accept:'application/json'}
   });
   if(!res.ok)return null;
   const data=await res.json();
   if(!data||data.code!==code||data.type!==0||!data.guild||!/^[0-9]{15,22}$/.test(String(data.guild.id||'')))return null;
   const members=size(data.approximate_member_count),online=size(data.approximate_presence_count);
   if(members===null&&online===null)return null;
   return {discordMembers:members,discordOnline:online,discordApproximate:true};
  }catch{return null}finally{clearTimeout(timeout)}
 })();
 cache.set(code,{expires:now+60000,promise});
 const result=await promise;
 cache.set(code,{expires:now+(result?300000:60000),promise:Promise.resolve(result)});
 if(cache.size>160)cache.delete(cache.keys().next().value);
 return result;
}
async function readCardFacts(sql,rows,{fetcher=globalThis.fetch,maxDiscord=8}={}){
 const entries=Array.isArray(rows)?rows.filter(r=>ID.test(String(r?.id||''))):[];
 const out=new Map(entries.map(r=>[r.id,{}]));
 if(!entries.length)return out;
 const ids=[...out.keys()];
 const marks=ids.map(()=>'?').join(',');
 const jobs=[
  ['specs','SELECT server_id,capacity FROM swapp_game_server_specs WHERE server_id IN ('+marks+')'],
  ['lfg','SELECT server_id,COUNT(*) AS active FROM swapp_server_lfg WHERE expires_at>UTC_TIMESTAMP() AND server_id IN ('+marks+') GROUP BY server_id'],
  ['monthly','SELECT server_id,COUNT(*) AS votes_month FROM swapp_game_server_vote_events WHERE server_id IN ('+marks+') AND voted_at>=? GROUP BY server_id']
 ];
 const settled=await Promise.allSettled(jobs.map(([key,query])=>sql.execute(query,key==='monthly'?[...ids,new Date().toISOString().slice(0,7)+'-01']:ids)));
 for(let i=0;i<jobs.length;i++){
  if(settled[i].status!=='fulfilled')continue;
  if(jobs[i][0]==='lfg')for(const id of ids)out.get(id).lfgCount=0;
  if(jobs[i][0]==='monthly')for(const id of ids)out.get(id).votes_month=0;
  for(const row of settled[i].value?.[0]||[]){
   if(!out.has(row.server_id))continue;
   if(jobs[i][0]==='specs'){
    const cap=capacityValue(row.capacity);
    if(Number.isInteger(cap)&&cap>0)out.get(row.server_id).capacity=cap;
   }else if(jobs[i][0]==='lfg'){
    const count=clamp(Number(row.active));
    if(count!==null)out.get(row.server_id).lfgCount=count;
   }else{
    const count=clamp(Number(row.votes_month));
    if(count!==null)out.get(row.server_id).votes_month=count;
   }
  }
 }
 const candidates=entries.filter(r=>inviteCode(r.website||'')).slice(0,Math.max(0,Math.min(maxDiscord,12)));
 // Bounded concurrency to avoid turning a listing into a Discord API fanout.
 for(let i=0;i<candidates.length;i+=4){
  await Promise.all(candidates.slice(i,i+4).map(async r=>{
   const stats=await discordSnapshot(r.website,{fetcher});
   if(stats)Object.assign(out.get(r.id),stats);
  }));
 }
 return out;
}
module.exports={capacityValue,ensureSpecsTable,saveCapacity,readCapacity,discordSnapshot,readCardFacts};