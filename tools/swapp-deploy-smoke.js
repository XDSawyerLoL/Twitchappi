'use strict';
// Run AFTER Hostinger has deployed the same checkout:
//   npm run verify:production
// It fails when the live service is an old release, a cached SPA or wrong host.
const {releaseInfo}=require('./swapp-release');
const BASE=process.env.SWAPP_VERIFY_URL||'https://swapp.tv';
function baseUrl(raw){
 const url=new URL(raw);
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/'&&url.pathname!=='')throw Error('SWAPP_VERIFY_URL must be an origin');
 const host=url.hostname.toLowerCase();
 if(url.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(host))throw Error('HTTPS required');
 if(!['swapp.tv','www.swapp.tv','127.0.0.1','localhost'].includes(host))throw Error('Unapproved verification host');
 return url.origin;
}
async function request(origin,pathname){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(origin+pathname,{
   redirect:'follow',cache:'no-store',signal:controller.signal,
   headers:{'Accept':pathname==='/api/release'?'application/json':'*/*','Cache-Control':'no-cache'}
  });
  const body=await response.text();
  if(!response.ok)throw Error(pathname+': HTTP '+response.status+'; '+body.slice(0,100));
  return {response,body};
 }finally{clearTimeout(timeout)}
}
function check(test,reason){
 if(!test)throw Error(reason);
}
async function verify(){
 const expected=releaseInfo();
 check(expected.complete,'The local checkout is missing release files: '+expected.missing.join(', '));
 const origin=baseUrl(BASE);
 const {response,body}=await request(origin,'/api/release');
 check((response.headers.get('content-type')||'').includes('application/json'),'/api/release returned HTML instead of JSON');
 let remote;
 try{remote=JSON.parse(body)}catch{throw Error('/api/release returned invalid JSON')}
 check(remote.service==='swapp','Wrong deployment: service identifier mismatch');
 check(remote.complete===true,'Live SWAPP release has missing tracked files');
 check(typeof remote.fingerprint==='string'&&/^[a-f0-9]{64}$/.test(remote.fingerprint),'Release fingerprint invalid');
 check(remote.fingerprint===expected.fingerprint,
  'DEPLOYMENT DRIFT: production='+remote.fingerprint+' checkout='+expected.fingerprint+
  '. Deploy current GitHub version to Hostinger and restart Node. Do not mark the site verified.');
 process.stdout.write('PASS release fingerprint '+remote.fingerprint.slice(0,16)+'\n');
 const ads=await request(origin,'/ads.txt');
 check(ads.body.trim()==='google.com, pub-6082969821681414, DIRECT, f08c47fec0942fa0','AdSense ads.txt seller declaration differs');
 check((ads.response.headers.get('content-type')||'').startsWith('text/plain'),'AdSense ads.txt is not served as text/plain');
 process.stdout.write('PASS /ads.txt\n');
 const social=await request(origin,'/communaute');
 check(social.body.includes('class="swapp-social-sticky-stack"'),'SOCIAL HTML does not contain the unified sticky stack');
 check(social.body.includes('id="feed-tabs"'),'SOCIAL feed controls missing');
 check(social.body.includes('social-sticky-ux-7'),'SOCIAL HTML uses an older CSS release');
 check(social.body.includes('social-search-ux-8'),'SOCIAL HTML uses an older JS release');
 process.stdout.write('PASS /communaute HTML\n');
 const stylesheet=await request(origin,'/assets/swapp-social-native/social-swapp.css');
 check(stylesheet.body.includes('SOCIAL sticky stack v2'),'SOCIAL CSS is stale at the public asset path');
 process.stdout.write('PASS SOCIAL public stylesheet\n');
 const home=await request(origin,'/');
 check(home.body.includes('SWAPP'),'Home returned an unexpected document');
 process.stdout.write('PASS / home\n');
 const news=await request(origin,'/actus');
 check(news.body.includes('SWAPP')||news.body.includes('Swapp'),'Actualité returned an unexpected document');
 process.stdout.write('PASS /actus\n');
 return remote;
}
if(require.main===module){
 verify().catch(error=>{
  process.stderr.write('FAIL SWAPP PRODUCTION CHECK: '+error.message+'\n');
  process.exitCode=1;
 });
}
module.exports={baseUrl,verify};
