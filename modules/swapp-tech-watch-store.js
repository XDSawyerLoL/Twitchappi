'use strict';
// Persistent candidate store, separate from the published SWAPP news collections.
const crypto=require('node:crypto');
const DDL=`CREATE TABLE IF NOT EXISTS swapp_tech_watch_candidates (
 id CHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 section VARCHAR(32) NOT NULL,
 source_name VARCHAR(100) NOT NULL,
 title VARCHAR(500) NOT NULL,
 source_url VARCHAR(2048) NOT NULL,
 source_published_at DATETIME NOT NULL,
 first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 status VARCHAR(32) NOT NULL DEFAULT 'candidate_unverified',
 KEY swapp_tech_watch_section_date (section,source_published_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
function assertCandidate(c){
 if(!/^[a-f0-9]{20}$/.test(c?.id||''))throw Error('invalid_candidate_id');
 if(!['IA','Robotique','FUTURE','GAMING'].includes(c.section))throw Error('invalid_section');
 if(typeof c.title!=='string'||!c.title.trim()||c.title.length>500)throw Error('invalid_title');
 const url=new URL(c.url);if(url.protocol!=='https:'||url.username||url.password||c.url.length>2048)throw Error('invalid_source_url');
 const date=new Date(c.sourcePublishedAt);if(!Number.isFinite(date.getTime()))throw Error('invalid_source_date');
 return date;
}
async function saveCandidates(pool,candidates){
 await pool.query(DDL);
 let saved=0;
 for(const c of candidates){
  const date=assertCandidate(c);
  // Do not update status on conflict: editorial review must survive refresh.
  await pool.execute(`INSERT INTO swapp_tech_watch_candidates
   (id,section,source_name,title,source_url,source_published_at)
   VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE last_seen_at=CURRENT_TIMESTAMP`,
   [c.id,c.section,String(c.source).slice(0,100),c.title,c.url,date.toISOString().slice(0,19).replace('T',' ')]);
  saved++;
 }
 return saved;
}
// A MySQL advisory lock only prevents simultaneous runs. Hostinger may start
// multiple Node workers a few seconds apart, so persist the next eligibility
// decision as well. This avoids duplicate feed requests across processes.
const SCHEDULE_DDL=`CREATE TABLE IF NOT EXISTS swapp_tech_watch_schedule (
 name VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 last_started_ms BIGINT UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
async function withWatchLock(pool,work,{intervalMs=0,nowMs=()=>Date.now()}={}){
 const conn=await pool.getConnection();
 try{
  const [rows]=await conn.query('SELECT GET_LOCK(?,0) AS acquired',['swapp_tech_watch_collect_v1']);
  if(rows?.[0]?.acquired!==1)return {skipped:'another_instance_running'};
  try{
   if(intervalMs>0){
    await conn.query(SCHEDULE_DDL);
    const [previous]=await conn.execute('SELECT last_started_ms FROM swapp_tech_watch_schedule WHERE name=?',['collection']);
    const now=nowMs(),last=Number(previous?.[0]?.last_started_ms||0);
    if(last>0&&now>=last&&now-last<intervalMs)return {skipped:'recently_collected'};
    await conn.execute('INSERT INTO swapp_tech_watch_schedule (name,last_started_ms) VALUES (?,?) ON DUPLICATE KEY UPDATE last_started_ms=VALUES(last_started_ms)',['collection',now]);
   }
   return await work();
  }finally{await conn.query('SELECT RELEASE_LOCK(?)',['swapp_tech_watch_collect_v1']);}
 }finally{conn.release();}
}
module.exports={DDL,SCHEDULE_DDL,assertCandidate,saveCandidates,withWatchLock};
