'use strict';
// SWAPP Live trends: one bounded Twitch FR sample per five-minute UTC slot
// across Node instances, stored as aggregate-only MySQL rows.
const INTERVAL_MS = 300000;
const MAX_AGE_MS = 900000;
const KEEP_MS = 7 * 86400000;
const LIMIT_GAMES = 15;
const DDL = `CREATE TABLE IF NOT EXISTS swapp_live_trend_samples (
 bucket BIGINT UNSIGNED NOT NULL PRIMARY KEY,
 state ENUM('collecting','ready','failed') NOT NULL,
 sample_json LONGTEXT NULL,
 inserted_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 completed_at DATETIME(6) NULL,
 KEY ix_swapp_live_trend_state (state,bucket)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
const NON_GAME = new Set(['just chatting', "i'm only sleeping", 'music', 'art', 'talk shows & podcasts', 'special events']);
function sampleStreams(streams, {atMs = Date.now(), replayTitle} = {}) {
 if (!Array.isArray(streams) || streams.length > 100 || !Number.isSafeInteger(atMs) || atMs < 0 ||
     typeof replayTitle !== 'function') throw new TypeError('invalid_live_sample');
 const seen = new Set(), games = new Map();
 let totalStreams = 0, excludedReplays = 0;
 for (const row of streams) {
  if (!row || typeof row !== 'object' || (row.type && row.type !== 'live') ||
      (row.language && String(row.language).toLowerCase() !== 'fr')) continue;
  if (replayTitle(row)) {excludedReplays++; continue;}
  const login = String(row.user_login || row.login || '').trim().toLowerCase();
  const game = String(row.game_name || '').trim().slice(0, 90);
  const viewers = Number(row.viewer_count);
  if (!/^[a-z0-9_]{2,25}$/.test(login) || !game || NON_GAME.has(game.toLowerCase()) ||
      !Number.isSafeInteger(viewers) || viewers < 0 || seen.has(login)) continue;
  const gameId = String(row.game_id || '').trim().slice(0, 30);
  const key = gameId ? 'id:' + gameId : 'name:' + game.toLowerCase();
  seen.add(login); totalStreams++;
  const entry = games.get(key) || {gameId: gameId || null, game, streams: 0, observedViewers: 0, smallStreams: 0};
  entry.streams++;
  entry.observedViewers += viewers;
  if (viewers >= 20 && viewers < 150) entry.smallStreams++;
  games.set(key, entry);
 }
 return {
  source: 'twitch-helix-fr-first100',
  coverage: 'bounded-provider-sample-not-market-share',
  sampledAt: new Date(atMs).toISOString(),
  observedStreams: totalStreams,
  excludedReplays,
  games: [...games.values()].sort((a,b) => b.streams - a.streams || b.observedViewers - a.observedViewers || a.game.localeCompare(b.game)).slice(0, LIMIT_GAMES)
 };
}
function trendReport(rows, nowMs = Date.now()) {
 if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new TypeError('invalid_clock');
 const parsed = (Array.isArray(rows) ? rows : []).slice(0, 2).map(row => {
  const raw = typeof row.sample_json === 'string' ? JSON.parse(row.sample_json) : row.sample_json;
  if (!raw || raw.source !== 'twitch-helix-fr-first100' || !Array.isArray(raw.games) || raw.games.length > LIMIT_GAMES)
   throw new TypeError('invalid_trend_row');
  return {bucket: Number(row.bucket), sample: raw};
 });
 const latest = parsed[0];
 if (!latest) return {state:'warming', source:'twitch-helix-fr-first100', comparable:false, games:[]};
 const ageMs = Math.max(0, nowMs - latest.bucket * INTERVAL_MS);
 const prior = parsed[1];
 const comparable = !!prior && latest.bucket > prior.bucket &&
   (latest.bucket - prior.bucket) * INTERVAL_MS <= MAX_AGE_MS && ageMs <= MAX_AGE_MS;
 const older = new Map(comparable ? prior.sample.games.map(g => [g.gameId || g.game.toLowerCase(), g]) : []);
 const games = latest.sample.games.map(g => {
  const previous = older.get(g.gameId || g.game.toLowerCase());
  return {...g, ...(comparable && previous ? {
   deltaStreams: g.streams - previous.streams,
   deltaObservedViewers: g.observedViewers - previous.observedViewers,
   deltaSmallStreams: g.smallStreams - previous.smallStreams
  } : {})};
 });
 return {
  state: ageMs > MAX_AGE_MS ? 'stale' : comparable ? 'ready' : 'warming',
  source: latest.sample.source, coverage: latest.sample.coverage,
  sampledAt: latest.sample.sampledAt, ageSeconds: Math.floor(ageMs/1000),
  observedStreams: latest.sample.observedStreams,
  excludedReplays: latest.sample.excludedReplays,
  comparable, previousSampledAt: comparable ? prior.sample.sampledAt : null, games
 };
}
function createTrendCollector({db, fetchStreams, replayTitle, now=Date.now,
 setTimer=(fn,ms)=>setInterval(fn,ms), clearTimer=clearInterval,
 defer=fn=>setImmediate(fn), log=()=>{}, enabled=false}={}) {
 if (!db || typeof db.execute !== 'function' || typeof fetchStreams !== 'function' ||
     typeof replayTitle !== 'function' || typeof now !== 'function' || typeof log !== 'function')
  throw new TypeError('collector_dependencies_required');
 let initialization=null, timer=null, running=false, stopped=false;
 let lastError=null, lastCollection=null, failures=0, cooldownUntil=0;
 let cache={until:0, report:null};
 const ensure=async()=>{
  if (!initialization) initialization=db.execute(DDL).catch(e=>{initialization=null;throw e;});
  await initialization;
 };
 function status(){return {enabled, running, lastCollection, lastError, cooldownUntil:cooldownUntil?new Date(cooldownUntil).toISOString():null};}
 async function tick(){
  if (!enabled || stopped || running || now() < cooldownUntil) return {skipped:'disabled-or-busy'};
  running=true;
  const at=now(), bucket=Math.floor(at / INTERVAL_MS);
  let owned=false;
  try {
   await ensure();
   const [claimed]=await db.execute(`INSERT IGNORE INTO swapp_live_trend_samples (bucket,state) VALUES (?,'collecting')`,[bucket]);
   if (claimed.affectedRows === 0) return {skipped:'slot-claimed'};
   if (claimed.affectedRows !== 1) throw new Error('invalid_claim');
   owned=true;
   // Only the instance which won the MySQL claim makes a Twitch request.
   const items=await fetchStreams();
   if (!Array.isArray(items) || items.length === 0 || items.length > 100) throw new TypeError('invalid_twitch_response');
   const sample=sampleStreams(items,{atMs:at,replayTitle});
   if (sample.observedStreams === 0) throw new Error('empty_verified_sample');
   const json=JSON.stringify(sample);
   if (Buffer.byteLength(json,'utf8') > 12000) throw new RangeError('oversize_sample');
   const [saved]=await db.execute(`UPDATE swapp_live_trend_samples SET state='ready',sample_json=?,completed_at=UTC_TIMESTAMP(6) WHERE bucket=? AND state='collecting'`,[json,bucket]);
   if (saved.affectedRows !== 1) throw new Error('lost_sample_slot');
   owned=false; failures=0; lastError=null; lastCollection=sample.sampledAt;
   cache={until:0,report:null};
   if (bucket % 288 === 0) await db.execute(`DELETE FROM swapp_live_trend_samples WHERE bucket<? LIMIT 500`,[bucket - Math.ceil(KEEP_MS/INTERVAL_MS)]).catch(()=>{});
   return {saved:true, bucket, streams:sample.observedStreams, games:sample.games.length};
  } catch (error) {
   failures++;
   lastError=error?.code === 'ER_NO_SUCH_TABLE' ? 'schema-unavailable' : 'collection-failed';
   if (failures >= 3) cooldownUntil=now()+3600000;
   if (owned) await db.execute(`UPDATE swapp_live_trend_samples SET state='failed',completed_at=UTC_TIMESTAMP(6) WHERE bucket=? AND state='collecting'`,[bucket]).catch(()=>{});
   log(lastError);
   return {failed:true};
  } finally {running=false;}
 }
 async function report(){
  if (!enabled) return {state:'disabled',enabled:false,games:[]};
  if (cache.report && cache.until > now()) return cache.report;
  try {
   // Strict read path: table creation is owned exclusively by tick().
   // A GET must never initialize schema or race an autonomous collection.
   // Before the first successful tick, a missing table yields unavailable.
   const [rows]=await db.execute(`SELECT bucket,sample_json FROM swapp_live_trend_samples WHERE state='ready' ORDER BY bucket DESC LIMIT 2`);
   const result={enabled:true,...trendReport(rows,now()),collector:status()};
   cache={until:now()+60000,report:result};
   return result;
  }catch(_){return {enabled:true,state:'unavailable',games:[],collector:status()};}
 }
 function start(){
  if (!enabled || timer !== null) return false;
  stopped=false;
  timer=setTimer(()=>void tick(),60000);
  timer?.unref?.();
  defer(()=>tick());
  return true;
 }
 function stop(){stopped=true;if(timer!==null){clearTimer(timer);timer=null;}return true;}
 return Object.freeze({tick,report,status,start,stop});
}
module.exports={sampleStreams,trendReport,createTrendCollector,INTERVAL_MS,DDL};
