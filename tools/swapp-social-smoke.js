'use strict';
// SWAPP SOCIAL read-only acceptance smoke. No posts, votes, messages or session changes.
// Usage: node tools/swapp-social-smoke.js
// Optional SWAPP_SMOKE_COOKIE must be set locally; never paste it into a ticket.
const https=require('node:https');
const origin=process.env.SWAPP_SMOKE_ORIGIN||'https://swapp.tv';
const cookie=process.env.SWAPP_SMOKE_COOKIE||'';
const base=new URL(origin);
if(base.protocol!=='https:'||!['swapp.tv','www.swapp.tv'].includes(base.hostname))
 throw Error('The production smoke only permits swapp.tv HTTPS URLs');
const publicChecks=[
 ['/communaute','social_page'],
 ['/api/oryon/session','swapp_account_session'],
 ['/api/oryon/persistence-status','account_storage'],
 ['/api/actus','swapp_editorial'],
 ['/api/swapp/social/release','release_marker'],
 ['/api/swapp/interactions/status','mysql_status'],
 ['/api/pulse/health','upstream_social'],
];
const authenticatedChecks=[
 ['/api/swapp/interactions/rooms','rooms'],
 ['/api/swapp/interactions/polls','polls'],
 ['/api/swapp/interactions/match2/compatible','matchmaking'],
 ['/api/swapp/interactions/passport/me','player_passport'],
 ['/api/swapp/interactions/library/games','followed_games_library'],
 ['/api/swapp/interactions/library/wishlist','personal_game_wishlist'],
 ['/api/swapp/interactions/rewards/me','discovery_reward_status'],
 ['/api/swapp/interactions/game/context?game=PUBG','game_universe'],
 ['/api/pulse/me','social_identity'],
 ['/api/pulse/feed?mode=discover&limit=5','posts'],
 ['/api/pulse/circles','communities'],
 ['/api/pulse/conversations','direct_messages'],
 ['/api/pulse/notifications','notifications'],
 ['/api/pulse/search?q=PUBG','search']
];
async function check(path,area,authenticated){
 const started=Date.now();
 return new Promise(resolve=>{
  const request=https.get(new URL(path,base),{
   timeout:13500,
   headers:{accept:'application/json, text/html;q=0.8','user-agent':'SWAPP-Social-Smoke/2.0',
    ...(cookie?{cookie}:{})}
  },res=>{
   let received=0,raw='';
   res.on('data',chunk=>{
    received+=chunk.length;
    if(received<6000)raw+=chunk.toString('utf8').slice(0,6000-raw.length);
   });
   res.on('end',()=>{
    let payload={};try{payload=JSON.parse(raw)}catch{}
    const status=res.statusCode,elapsed=Date.now()-started;
    const authenticatedAllowed=authenticated?status===200:status===200;
    const expectedGuest=authenticated&&!cookie&&status===401;
    let state=authenticatedAllowed?'ok':expectedGuest?'requires_login':'unavailable';
    if(area==='release_marker'&&payload.release!=='social-cross-device-library-20261018')state='unavailable';
    if(area==='account_storage'&&payload.github_deploy_safe!==true)state='unsafe_deploy';
    if(area==='mysql_status'&&!(payload.enabled===true&&payload.state==='database_read_ready'))state='unavailable';
    if(area==='upstream_social'&&status===200&&payload.success===false)state='unavailable';
    resolve({area,status,ms:elapsed,state,
      ...(area==='mysql_status'?{db_state:payload.state||'unknown',reason:payload.reason||null}:{}),
      ...((status!==200&&!expectedGuest)?{error:payload.error||'http_'+status}:{})});
   });
  });
  request.on('timeout',()=>request.destroy(Error('request_timeout')));
  request.on('error',e=>resolve({area,status:0,ms:Date.now()-started,state:'unavailable',error:e.message==='request_timeout'?'timeout':'network_error'}));
 });
}
(async()=>{
 const checks=[...publicChecks.map(([url,name])=>check(url,name,false)),
  ...authenticatedChecks.map(([url,name])=>check(url,name,true))];
 const results=await Promise.all(checks);
 console.table(results);
 const unsafe=results.filter(r=>r.state==='unsafe_deploy');
 const unavailable=results.filter(r=>r.state==='unavailable');
 const gated=results.filter(r=>r.state==='requires_login');
 if(!cookie)console.log('Authenticated routes require a local SWAPP browser session: '+gated.length+' expected 401 statuses; their actual functionality remains untested.');
 else console.log('Authenticated routes exercised using the local environment session.');
 if(unsafe.length){
  console.error('BLOCK DEPLOYMENT: SWAPP accounts are not confirmed persistent. Check /api/oryon/persistence-status and back up all user data before deploying.');
  process.exitCode=2;
 }
  if(unavailable.length){
  console.error('SOCIAL readiness FAILED: '+unavailable.map(r=>r.area+' ('+(r.error||r.db_state||r.status)+')').join(', '));
  if(unavailable.some(r=>r.area==='upstream_social'))console.error('The older posts, messages and communities still depend on the external SOCIAL upstream.');
  process.exitCode=1;
 }else if(!unsafe.length)console.log('Read-only checks passed. Real writes and browser/mobile UX must still be tested separately.');
})().catch(error=>{console.error('Smoke error:',error.message);process.exitCode=1});
